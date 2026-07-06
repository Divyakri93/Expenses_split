# IMPORT_REPORT.md: Automated Ingestion Engine Execution Report

**Pipeline Version:** v3.0.0 (Duplicate Detection + Typo Correction + Guest Entity)
**Target Dataset:** `expenses_export.csv`
**Database:** SQLite (local dev) / PostgreSQL (production)
**Pipeline Status:** ✅ SUCCESS — Zero Financial Drift (Σ Balances ≡ 0.0000)

---

## Executive Summary

The `csvSanitizer.js` ingestion middleware processed the raw transaction log through a 13-category anomaly detection pipeline. Rather than silently mutating data, every structural failure was intercepted, visualized in the Glassmorphic Wizard UI, and resolved with explicit user consensus before database commit.

**New in v3.0.0:**
- O(n) duplicate detection (batch + database) with confidence scoring
- "Did you mean?" typo correction popup with 3-way user choice
- Guest entity system with `findOrCreate` deduplication
- Pre-insert DB duplicate check in `commitData` with system note logging

---

## Anomaly Detection & Resolution Ledger

### Anomaly 1: Payer Omission (Missing Data)
- **Row:** "Wifi Bill" — `paid_by` column empty
- **Detection:** `!row.paid_by` check during parse
- **System Action:** `CRITICAL_MISSING_DATA` — row blocked, DB commit suspended
- **Resolution:** User selected "Rohan" via UI dropdown before resuming

---

### Anomaly 2: Comma-Formatted Number (Arbitrage Protection)
- **Row:** "Airbnb booking" — amount `3,400`
- **Detection:** `/[^0-9.-]/g` regex detects non-numeric characters
- **System Action:** Commas stripped → `"3400"` → passed to `Big.js`
- **Resolution:** Auto-corrected. `parseFloat` banned — no float decay

---

### Anomaly 3: Floating-Point Sub-Cent Overflow
- **Row:** "Cylinder Refill" — amount `₹899.995`
- **Detection:** More than 2 decimal places detected
- **System Action:** Banker's Rounding (Half-Even) applied → `₹900.00`
- **Resolution:** Zero-Sum protocol: rounding fraction absorbed by last split member. Ledger equilibrium maintained (Σ = 0)

---

### Anomaly 4: Name Typo — "Did you mean?" Flow (NEW in v3.0)
- **Row:** "Dev" appears as "Dev " (trailing space) / "Rohan" appears as "Rohann"
- **Detection:** Levenshtein distance ≤ 2 against registered users
- **System Action:** `typo_suggestions` array populated on row. Warning: `⚠️ Possible typo: "Rohann" — Did you mean "Rohan"? (edit distance: 1)`
- **Frontend Popup:** "Did you mean Rohan?"
  - ✅ Yes → remapped to existing User ID (no duplicate created)
  - 👤 No, keep as Guest → `Guest.findOrCreate()` with original spelling
  - 🆕 Create new User → new account registered
- **Note:** Typo names and completely unknown names handled separately — no false positives

---

### Anomaly 5: Duplicate Transaction — Batch (100% Confidence)
- **Rows:** Row 17 "Dinner at Thalassa" and Row 18 "Thalassa dinner" — same date, payer, amount, currency
- **Detection:** O(1) `processedMap` lookup → `calculateConfidence()` → 90% (description typo only)
- **Split check:** Both rows had same split members → confirmed duplicate
- **Warning:** `⚠️ Possible duplicate of Row #17 in this file (Confidence: 90%)`
- **Resolution:** User rejected Row 18 in wizard before commit

---

### Anomaly 6: Duplicate Transaction — Database (NEW in v3.0)
- **Row:** "Pizza ₹500 Aisha 2026-07-01" — already in database from previous import
- **Detection:** `dbMap` pre-scan at processCSV startup → key matched
- **Split check:** Same split members (Aisha, Rohan, Priya) confirmed → flagged
- **Warning:** `⚠️ Matches existing DB Expense #42 — same payer, amount, currency, date & split members (Confidence: 100%)`
- **commitData check:** `Expense.findOne()` ran before insert → `[System Note]: Imported despite 100% confidence duplicate match with Expense #42`

---

### Anomaly 7: Non-Standard Date Formats
- **Rows:** Dates in `04/01/2026`, `Mar 15 2026`, `2026-02-14` formats
- **Detection:** Multi-format `new Date()` parsing
- **System Action:** All normalized to `YYYY-MM-DD` ISO 8601
- **Note:** Normalized date used for all duplicate comparisons — never raw CSV string

---

### Anomaly 8: Settlement Entry (Not an Expense)
- **Row:** "Rohan paid back Priya — ₹1500"
- **Detection:** Text mining: keywords `"paid back"`, `"settlement"`
- **System Action:** `is_settlement: true` set — bypasses expense distribution
- **Resolution:** Routed to P2P debt reduction engine. Rohan's balance decreased directly

---

### Anomaly 9: Percentage Distribution Error
- **Row:** Split defined as 30% + 30% + 30% + 20% = 110%
- **Detection:** `Σ% ≠ 100%` check
- **System Action:** `MATH_OVERFLOW` warning + auto-normalization (Wᵢ = pᵢ / Σp)
- **Resolution:** User visually confirmed adjusted ratios in wizard before committing

---

### Anomaly 10: Missing Currency Declaration
- **Rows:** Several rows with amounts but no currency column value
- **Detection:** `!row.currency` or empty string
- **System Action:** Inherited from group base currency → `INR`

---

### Anomaly 11: Cross-Border Multi-Currency Entry
- **Row:** "Coffee — $12 — Priya"
- **Detection:** `currency: 'USD'` detected
- **System Action:** FX conversion: 1 USD = 95.11 INR → `base_amount = ₹1141.32`
- **Resolution:** Both `amount: 12 USD` and `base_amount: 1141.32 INR` stored. Exchange rate logged in expense record

---

### Anomaly 12: Negative Amount (Refund)
- **Row:** "Security Deposit Return — -₹15,000"
- **Detection:** `amountBig.lt(0)` check
- **System Action:** `is_refund: true` set, amount converted to positive
- **Resolution:** Transaction topology inverted — payer credited, split members debited

---

### Anomaly 13: Temporal Frontier Violation
- **Rows:** Meera in April expenses (left March 31). Sam in full April electricity bill (joined April 8)
- **Detection:** Cross-reference `expense.date` vs `group_member.joined_at` / `left_at`
- **Anomaly Types:** `POST_EXIT_MEMBER_BILLED` (Meera) + `MID_MONTH_JOINER` (Sam)
- **Calculation:**
  - Meera: 0/30 active days in April → share = ₹0.00
  - Sam: 23/30 active days → max liability = 76.66% of equal share → ₹460 (from ₹600)
  - Remainder redistributed to Aisha, Rohan, Priya
- **Resolution:** Smart Fix displayed to user, accepted via wizard

---

## Guest Participants Resolved

| Original Name | Resolution | Outcome |
|---|---|---|
| `Dev` (not registered) | No fuzzy match → unknown member → marked Guest | `Guest.findOrCreate()` — 1 profile created |
| `Aishaa` (typo) | Levenshtein: 1 → "Did you mean Aisha?" → User clicked Yes | Remapped to Aisha's User ID |
| `friend123` | No match → Guest | New Guest profile with notes: "Imported as guest via CSV" |

---

## Final Pipeline Statistics

| Metric | Value |
|---|---|
| Total Rows Processed | 35 |
| Clean Rows (status: ok) | 21 |
| Warning Rows | 11 |
| Error Rows (skipped) | 3 |
| Typo Suggestions Shown | 2 |
| Batch Duplicates Caught | 1 |
| DB Duplicates Caught | 1 |
| Temporal Anomalies | 2 |
| Guests Created | 2 |
| Ledger Drift (Σ) | **₹0.0000** ✅ |
