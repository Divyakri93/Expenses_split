# SCOPE.md: Data Ingestion Architecture, Anomaly Log & Relational Schema

This document details the engineering specifications of the Ingest & Pipeline Sanitizer engine (`csvSanitizer.js`), all automated anomaly logging policies, the duplicate detection system, the typo correction flow, and the database schema.

---

## 1. Automated Anomaly Detection & Resolution Policies — 16 Total

The `csvSanitizer.js` module treats incoming CSV files as a stream of unverified mutations. For every row, it runs a sequential set of structural checks, intercepts anomalies, and **never commits silently** — every decision is surfaced to the user via the interactive wizard.

| # | Code Line | CSV Problem | Detection Logic | Resolution Policy |
|---|---|---|---|---|
| **1** | 192 | **Missing Description** | `!row.description` check | **Blocked.** Row status = `error`. Commit suspended until user fills it |
| **2** | 194 | **Missing Payer (paid_by)** | `!row.paid_by` check | **Blocked.** Row status = `error`. Commit suspended until user maps a payer |
| **3** | 196 | **Missing Amount** | `!row.amount` check | **Blocked immediately.** No further processing on this row |
| **4** | 259 | **Name Typo / Fuzzy Match** | Levenshtein distance ≤ 2 vs all registered users | **"Did you mean?" Popup.** 3-way user choice: remap / Guest / new User |
| **5** | 254 | **Unknown Participant** | No exact match AND no fuzzy match (distance > 2) | **Warning.** `unknown_members[]` array populated. User resolves via UI |
| **6** | 267 | **Comma-Formatted Numbers (1,500)** | `replace(/[^0-9.-]/g, '')` strips commas, `₹`, `$` etc. | **Arbitrage Protection.** Clean string → `Big.js`. Native `parseFloat` banned |
| **7** | 278 | **Negative Amount (Refund)** | `amountBig.lt(0)` check | **Refund Inversion.** `is_refund: true`. Payer credited, split members debited |
| **8** | 285 | **Settlement Logged as Expense** | Keyword: `"paid back"`, `"settlement"`, `"repaid"` | **Rerouted.** `is_settlement: true` — bypasses split engine, routes to P2P debt engine |
| **9** | 294 | **Non-Standard Date Formats** | `new Date(str)` + DD/MM/YYYY fallback parser | **Temporal Standardization.** All dates stored as `YYYY-MM-DD` ISO 8601 |
| **10** | 321 | **Missing Currency** | `!currency` after `toUpperCase().trim()` | **Error Flagged.** Defaults to group base currency (INR) |
| **11** | 326 | **Multi-Currency / FX Conversion** | Non-INR currency code detected in `EXCHANGE_RATES` map | **FX Mapping.** `base_amount = amount × exchangeRate`. Both original + base stored |
| **12** | 340 | **Conflicting Split Definitions** | `split_type === 'equal'` AND `split_details` both present | **Blocked.** `hasConflictingSplit = true` — user must choose one definition |
| **13** | 347 | **Percentage Splits ≠ 100%** | `!totalPct.eq(100)` after summing all weights | **Dynamic Normalization.** Wᵢ = pᵢ / Σp. User visually confirms adjusted ratios |
| **14** | 404 | **Batch Duplicate (within CSV)** | O(1) `processedMap` lookup on `date_amount_payer_currency` key | **Confidence Warning.** 100/90/70% tiers. Split members also compared via Set equality |
| **15** | 429 | **Database Duplicate (already imported)** | `dbMap` pre-scan at parse start + pre-insert `Expense.findOne()` check | **DB Duplicate Warning.** System note logged in expense notes with confidence % + matched ID |
| **16** | 466 | **Temporal Frontier Violation** | Cross-references expense date vs `joined_at` / `left_at` membership dates | **Pro-Rata Engine.** `POST_EXIT_MEMBER_BILLED` + `MID_MONTH_JOINER` — fractional liability by active days |

---

## 2. Duplicate Detection System — Deep Specification

### 2.1 Helper Functions

#### `normalizeDescription(desc)` — `csvSanitizer.js` line 45
```javascript
return desc.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
// "Pizza!!!" → "pizza"  |  "PIZZA" → "pizza"  |  "pizza." → "pizza"
```

#### `calculateConfidence(row1, row2)` — `csvSanitizer.js` line 51
Returns confidence score (0 = not duplicate, 70/90/100 = duplicate tiers):

| Score | Condition |
|---|---|
| **0%** | Amount, currency, or payer doesn't match → not a duplicate |
| **0%** | Date differs by more than 1 day |
| **70%** | Date differs by exactly 1 day, everything else matches |
| **90%** | Same date, same fields, description similarity ≥ 80% (typo only) |
| **100%** | Exact match on all fields including normalized description |

### 2.2 O(n) Batch Duplicate Check

**Before (O(n²)):**
```javascript
for (let prev of processedRows) { // nested loop — slow for large CSVs
    if (prev.data.date === parsedRow.date && ...)
```

**After (O(1) per row = O(n) total):**
```javascript
const batchKey = `${date}_${amount}_${payer}_${currency}`;
if (processedMap.has(batchKey)) {
    // O(1) lookup — then compare splits + confidence
}
```

### 2.3 Database Duplicate Check

At `processCSV` startup, all active DB expenses are pre-fetched and indexed:
```javascript
const dbMap = new Map(); // "date_amount_payerId_currency" → [expense]
```

Before flagging, split members are also compared:
- `dbSplits` (from `ExpenseSplit` records) vs `curSplits` (from CSV row)
- Only flags if **both key fields AND split members match exactly**
- Pizza/Aisha/Rohan ≠ Pizza/Aisha/Priya → **not a duplicate** ✅

### 2.4 commitData Pre-Insert Check

Even at commit time, a final `Expense.findOne()` runs before `Expense.create()`:
```javascript
const existingMatch = await Expense.findOne({ where: dupWhere, transaction: t });
if (existingMatch) {
    finalNotes += `[System Note]: Imported despite ${conf}% confidence duplicate match with Expense #${existingMatch.id}`;
}
```

---

## 3. Typo Correction Flow — "Did you mean?" Architecture

### 3.1 Backend Detection — `findFuzzyMatch()` — line 170

```javascript
const findFuzzyMatch = (name) => {
    const allKnown = [...ACTIVE_MEMBERS, ...Array.from(dbUserNames)];
    // Find closest Levenshtein match with distance <= 2
    for (const known of allKnown) {
        const dist = levenshtein(lc, known.toLowerCase());
        if (dist <= 2 && dist < bestDist) { bestDist = dist; bestMatch = known; }
    }
    return bestMatch ? { suggested: bestMatch, distance: bestDist } : null;
};
```

### 3.2 Separation of Typos vs. Unknowns

```
Input: "Aishaa"
    ↓ checkKnownMember() → null (not exact match)
    ↓ findFuzzyMatch()   → { suggested: "aisha", distance: 1 }
    ↓ Result: added to typo_suggestions[] NOT unknown_members[]
```

### 3.3 Frontend — "Did you mean?" Popup (`CSVProcessingWizard.jsx` line ~479)

Three radio choices per suggestion:

| Choice | Backend Resolution | What Happens |
|---|---|---|
| ✅ Yes, it's Aisha | `{ action: 'match', matched_name: 'aisha' }` | Typo name remapped to real user ID |
| 👤 Keep as Guest "Aishaa" | `{ action: 'guest' }` | Guest profile created with original spelling |
| 🆕 Create new User "Aishaa" | `{ action: 'user' }` | New User account registered |

---

## 4. Guest Entity System

### 4.1 Guest Model Schema (`backend/models/Guest.js`)

```javascript
Guest {
    id          INTEGER PRIMARY KEY,
    name        STRING NOT NULL,
    email       STRING (nullable),
    phone       STRING (nullable),
    notes       TEXT (nullable),
    group_id    FK → Group,
    user_id     FK → User (nullable) ← for Guest→User promotion
}
```

### 4.2 Key Design Decisions

- `Guest.findOrCreate()` used in `commitData` → no duplicate guests across multiple CSV imports
- `convertGuestToUser()` links `guest.user_id` to existing User — history preserved
- `calculateSettlements()` rolls up guest balance into linked user's balance if promoted
- Guests appear in audit trail with their own label until promoted

---

## 5. Temporal Pro-Rata Engine

### 5.1 Anomaly Types

| Type | Description | Example |
|---|---|---|
| `POST_EXIT_MEMBER_BILLED` | Member included after their leave date | Meera in April (left Mar 31) → 0 days active → ₹0.00 |
| `MID_MONTH_JOINER` | Member billed for days before they joined | Sam in April (joined Apr 8) → 23/30 days → 76.66% max |

### 5.2 Mathematical Model

```
Active Days Ratio = Active Days in Month / Total Days in Month
Max Liability     = Original Share × Active Days Ratio
Redistributed     = (Original Share − Max Liability) spread across full-time members
```

Sam's April electricity bill (₹3000, 5 members):
```
Equal share = ₹600
Sam's active days = 23/30 = 76.66%
Sam's adjusted share = ₹600 × 0.7666 = ₹460
Remaining ₹140 redistributed to Aisha, Rohan, Priya, Meera (full-time)
```

---

## 6. Database Schema

```sql
-- Users
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Guests (separate entity, not a User)
CREATE TABLE guests (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    email     VARCHAR(255),
    phone     VARCHAR(50),
    notes     TEXT,
    group_id  INTEGER REFERENCES groups(id),
    user_id   INTEGER REFERENCES users(id),  -- nullable: set on promotion
    created_at TIMESTAMP DEFAULT NOW()
);

-- Groups
CREATE TABLE groups (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    base_currency VARCHAR(3) DEFAULT 'INR',
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Temporal Group Members (tracks join/leave dates)
CREATE TABLE group_members (
    id         SERIAL PRIMARY KEY,
    group_id   INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(20) DEFAULT 'member',
    joined_at  DATE NOT NULL,
    left_at    DATE,
    CONSTRAINT chk_timeline CHECK (left_at IS NULL OR left_at >= joined_at)
);

-- Expenses (supports both user and guest payers)
CREATE TABLE expenses (
    id                    SERIAL PRIMARY KEY,
    group_id              INTEGER REFERENCES groups(id) ON DELETE CASCADE,
    description           TEXT NOT NULL,
    paid_by_user_id       INTEGER REFERENCES users(id),
    paid_by_guest_id      INTEGER REFERENCES guests(id),
    amount                NUMERIC(12,4) NOT NULL,
    currency              VARCHAR(3) DEFAULT 'INR',
    exchange_rate_to_base NUMERIC(12,6) DEFAULT 1.0,
    split_type            VARCHAR(20),
    date                  DATE NOT NULL,
    notes                 TEXT,
    is_settlement         BOOLEAN DEFAULT FALSE,
    status                VARCHAR(20) DEFAULT 'active',
    created_at            TIMESTAMP DEFAULT NOW()
);

-- Expense Splits (supports both user and guest participants)
CREATE TABLE expense_splits (
    id                      SERIAL PRIMARY KEY,
    expense_id              INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
    user_id                 INTEGER REFERENCES users(id),
    guest_id                INTEGER REFERENCES guests(id),
    calculated_share_amount NUMERIC(12,4) NOT NULL,
    raw_split_value         NUMERIC(12,4)
);

-- Performance Indexes
CREATE INDEX idx_expenses_group_date   ON expenses(group_id, date);
CREATE INDEX idx_expenses_payer        ON expenses(paid_by_user_id, status);
CREATE INDEX idx_splits_expense        ON expense_splits(expense_id);
```
