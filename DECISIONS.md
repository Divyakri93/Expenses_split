# DECISIONS.md: Engineering & Product Architectural Decision Log

This document is an exhaustive log of every major architectural crossroads, trade-off, and design decision made during the engineering of the FairShare platform. Each decision documents the problem context, options evaluated, and the chosen approach with technical justification.

---

## 1. Interactive Ingestion vs. Silent Mutation

### Problem
Raw CSV files are structurally dirty (12+ anomaly types). The system needs to resolve these without violating Meera's core requirement: *"I want to approve anything the app deletes or changes."*

### Options Evaluated
- **Option A: Silent Scrubbing** — Backend auto-corrects everything and bulk-commits
  - ✅ Fast, zero friction
  - ❌ Violates data integrity. Silent guesses are catastrophic in financial ledgers
- **Option B: Interactive Ingestion Wizard** — Every anomaly is paused, shown to user, and requires explicit approval before database commit

### Decision: Option B
In financial ledger engineering, a silent guess is an architectural flaw. The interactive wizard transforms a data-cleaning hurdle into a premium user experience — every row's status is visible, every warning is acted on, and nothing reaches the database without user consensus.

---

## 2. Duplicate Detection: O(n²) Loop vs. O(n) Hash Map

### Problem
The original implementation detected batch duplicates by looping through all previously processed rows for every new row, creating O(n²) complexity. With 5,000-row CSVs, this becomes prohibitively slow.

### Options Evaluated
- **Option A: O(n²) nested loop** — simple but slow
- **Option B: O(n) Hash Map** — compound key `date_amount_payer_currency` → O(1) lookup

### Decision: Option B
Replaced the loop entirely with a `processedMap` and `dbMap` (for DB records). O(n) overall complexity regardless of CSV size. Additionally, improved correctness by:
- Adding split member comparison (different splits = not a duplicate)
- Adding currency comparison ($10 ≠ ₹10)
- Adding confidence scoring (100%, 90%, 70%) instead of binary yes/no

---

## 3. Duplicate Detection: When to Check the Database

### Problem
The original system only compared rows within the uploaded CSV file — it couldn't detect if the same expense already existed in the database from a previous import.

### Options Evaluated
- **Option A: Post-commit check** — Check for duplicates only after inserting
  - ❌ Requires rollbacks, complex error handling
- **Option B: Pre-scan at parse time** — Fetch all DB expenses at start of `processCSV`, build indexed `dbMap`, check each row before it's processed
- **Option C: Pre-insert check in commitData** — Final `Expense.findOne()` immediately before `Expense.create()`

### Decision: Both B and C (defense in depth)
- `processCSV` pre-scans DB → shows warning in the wizard so user can reject before committing
- `commitData` does a final check → appends `[System Note]` to expense notes if user imports it anyway
- Both checks compare split members exactly to avoid false positives

---

## 4. Typo Correction: Silent Auto-Fix vs. Interactive "Did you mean?"

### Problem
Names like "Aishaa" vs "Aisha" (Levenshtein distance 1) shouldn't silently remap — that could corrupt data if "Aishaa" is actually a different person.

### Options Evaluated
- **Option A: Silent normalization** — auto-correct to closest match
  - ❌ Dangerous. "Dev" could be remapped to "Deva", corrupting ledger ownership
- **Option B: Flag as unknown member** — force user to manually type the correct name
  - ❌ Poor UX, especially for large CSVs
- **Option C: "Did you mean?" interactive popup** — show the suggestion with 3 explicit choices
  - ✅ Safe + user-friendly

### Decision: Option C
The `findFuzzyMatch()` function (Levenshtein ≤ 2) runs only when exact matching fails. The result populates `typo_suggestions[]` on the row, which triggers a dedicated UI card with:
- **Yes, it's Aisha** → `action: 'match'` → remap to existing user ID
- **Keep as Guest** → `action: 'guest'` → Guest profile with original spelling
- **Create new User** → `action: 'user'` → brand new account

Crucially, typo candidates and completely unknown names are **separated** — different resolution flows, no false positives.

---

## 5. Guest Entity: Separate Table vs. User Flag

### Problem
Some participants in a shared expense are not registered users (e.g., a friend who visited once). How should they be represented?

### Options Evaluated
- **Option A: Auto-create User accounts for everyone in the CSV**
  - ❌ Pollutes the user table with junk accounts. Security risk (no auth)
- **Option B: Use a `is_guest` flag on the User table**
  - ❌ Mixes concerns, complicates auth queries, schema pollution
- **Option C: Separate `guests` table** with FK to User (nullable) for promotion path

### Decision: Option C
- `Guest` is a distinct entity: `{ id, name, email, phone, notes, group_id, user_id }`
- `Guest.findOrCreate()` prevents duplicates across multiple CSV imports
- If a guest later registers, `convertGuestToUser()` links `guest.user_id` without deleting history
- `calculateSettlements()` rolls up guest balance into linked user balance post-promotion
- `ExpenseSplit` supports both `user_id` and `guest_id` — both payer types

---

## 6. Financial Arithmetic: Native JS vs. Big.js

### Problem
JavaScript's native IEEE 754 floating-point arithmetic introduces binary fraction errors:
```javascript
0.1 + 0.2 === 0.30000000000000004 // true in JavaScript
```
In a financial ledger, this causes ledger imbalance (`Σ balances ≠ 0`).

### Options Evaluated
- **Option A: Native JS arithmetic** — simple but introduces drift
- **Option B: Big.js arbitrary precision** — exact decimal arithmetic, configurable rounding

### Decision: Option B
All monetary calculations use `Big.js` with `Big.RM = 2` (Banker's Rounding / Half-Even). Zero-sum ledger protocol: the last member in each split absorbs any remaining rounding fraction (`baseAmount - totalAllocated`). This guarantees `Σ calculated_share_amount = expense.amount` to 4 decimal places.

---

## 7. Database: In-Memory Staging vs. Direct Production Writes

### Problem
During CSV review, unvalidated data must be held somewhere while the user interacts with the wizard — potentially for several minutes.

### Options Evaluated
- **Option A: Staging table in DB** — write dirty rows to `staging_expenses`, migrate on commit
  - ❌ Database write I/O for unvalidated data. Requires cleanup cron for abandoned sessions
- **Option B: In-memory React state** — backend sends JSON, frontend holds state, DB only touched on commit

### Decision: Option B
The backend streams the CSV, runs all anomaly checks, and returns a JSON array. The frontend holds this in React state during the wizard. The database is only written to during a single atomic transaction in `commitData`. This isolates the relational DB from malformed data entirely and gives instant user interactions.

---

## 8. Audit Log: Separate Table vs. Inline Notes

### Problem
Every sanitization change (e.g., "Row 6: comma stripped", "Row 31: Meera removed") must be permanently recorded.

### Options Evaluated
- **Option A: `normalization_logs` table** — clean schema, flexible queries
  - ❌ Table sprawl, additional JOIN on every expense query
- **Option B: Append to `expense.notes` field** — inline serialized text tags like `[System Corrections]`, `[Duplicate Warnings]`, `[System Note]`

### Decision: Option B
Audit data is embedded directly in the expense's `notes` column as tagged text. Since audit history is only needed when viewing a specific transaction, this avoids cross-table joins. Tags used:
- `[System Corrections]: ...` — automated fixes applied
- `[Duplicate Warnings]: ...` — duplicate warnings from processCSV phase
- `[System Note]: Imported despite X% confidence duplicate match with Expense #Y`

---

## 9. Temporal Pro-Rata: Hard Reject vs. Dynamic Calculation

### Problem
Sam joined April 8th but the CSV has him in an April 1–30 electricity bill. Meera left March 31st but appears in April expenses.

### Options Evaluated
- **Option A: Hard reject** — refuse to import any row with temporal violations
  - ❌ Catastrophic UX. Requires user to manually edit CSV in Excel before re-upload
- **Option B: Dynamic pro-rata engine** — calculate exact active days, scale liability, redistribute remainder

### Decision: Option B
The engine detects `MID_MONTH_JOINER` and `POST_EXIT_MEMBER_BILLED` anomaly types, calculates:
```
Sam April: 23/30 days = 76.66% → share scaled to ₹460 (from ₹600)
Remaining ₹140 redistributed to full-time members
```
The suggested split is shown to the user for approval. They can accept the smart fix, revert to original, or override manually.