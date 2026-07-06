# SCOPE.md: Data Ingestion Architecture, Anomaly Log & Relational Schema

This document details the engineering specifications of the Ingest & Pipeline Sanitizer engine (`csvSanitizer.js`), all automated anomaly logging policies, the duplicate detection system, the typo correction flow, and the database schema.

---

## 1. Automated Anomaly Detection & Resolution Policies

The `csvSanitizer.js` module treats incoming CSV files as a stream of unverified mutations. For every row, it runs a sequential set of structural checks, intercepts anomalies, and **never commits silently** — every decision is surfaced to the user via the interactive wizard.

| # | CSV Problem | Detection Logic | Resolution Policy |
|---|---|---|---|
| **1** | **Payer Omission** | Checks if `paid_by` is null/empty after trim | **Blocked.** Row flagged `CRITICAL_MISSING_DATA`. Database commit suspended until user maps a valid name via UI |
| **2** | **Comma-Formatted Numbers** | `replace(/[^0-9.-]/g, '')` strips commas, `₹`, `$` etc. | **Arbitrage Protection.** Clean string passed to `Big.js`. Native `parseFloat` banned |
| **3** | **Floating-Point Overflow** | Detects >2 decimal places (e.g., ₹899.995) | **Banker's Rounding.** `Big.roundHalfEven` clamps to 2dp. Sub-cent fraction absorbed by last member (Zero-Sum) |
| **4** | **Name Typos / Case Variants** | Levenshtein Distance ≤ 2 against all registered users | **"Did you mean?" Popup.** User picks: remap to existing / keep as Guest / create new User |
| **5** | **Duplicate Transactions (Batch)** | O(1) Hash Map: `date_amount_payer_currency` key | **Confidence Warning.** 100% exact, 90% description typo, 70% date ±1 day. Split members also compared |
| **6** | **Duplicate Transactions (DB)** | Pre-scan DB expenses via indexed `dbMap` | **DB Duplicate Warning.** If committed, `[System Note]` appended to expense notes with confidence % and matched ID |
| **7** | **Non-Standard Date Formats** | `new Date(dateStr)` → ISO 8601 normalization | **Temporal Standardization.** All dates stored as `YYYY-MM-DD` |
| **8** | **Settlement Entries** | Text mining: "paid back", "settlement", "repaid" | **Rerouted.** `is_settlement: true` bypasses split engine, routes to P2P debt reduction |
| **9** | **Percentage Sums ≠ 100%** | Sum of split weights checked (e.g., 30+30+30+20=110%) | **Dynamic Normalization.** Weights renormalized: Wᵢ = pᵢ / Σp. User visually verifies |
| **10** | **Missing Currency** | `currency` column empty or undefined | **Fallback.** Inherits group base currency (default: INR) |
| **11** | **Multi-Currency (USD/EUR etc.)** | Non-INR currency code detected | **FX Mapping.** Converts to INR base amount using fixed rates. Both original + base stored |
| **12** | **Negative Amounts** | Amount parsed as negative (e.g., -15000) | **Refund Inversion.** Absolute value used, `is_refund: true` set. Payer credited, split members debited |
| **13** | **Temporal Frontier Violations** | Cross-references expense date vs. `joined_at`/`left_at` | **Pro-Rata Engine.** MID_MONTH_JOINER and POST_EXIT anomalies detected. Fractional liability computed per active days |

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
