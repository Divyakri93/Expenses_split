# 🧾 CSV Import Execution Report

**Import Date:** July 6, 2026 21:40 UTC  
**CSV File Name:** `june_flat_expenses_final.csv`  
**Imported By:** User ID `uuid-8392` (Aisha)  
**Application Version:** v2.4.0 (Zero-Auto-Correct Engine)  
**Import ID:** `IMP-20260706-99A1X`  
**Processing Time:** 412ms  

---

## 📊 Executive Summary

The import process analyzed **50 rows** of transaction data. During validation, the system detected **14 anomalies** requiring explicit user authorization. Following the zero-auto-correction policy, the system halted and gathered user input for every ambiguity. 

After user resolution and subsequent re-validation, **48 rows** were successfully imported, **2 rows** were intentionally skipped, and **0 rows** failed. The entire batch was securely committed to the database within a single atomic transaction.

---

## 📈 Import Statistics

| Metric | Count | Status |
| :--- | :---: | :--- |
| **Total Rows Processed** | 50 | 🔵 |
| **Successfully Imported** | 48 | ✅ |
| **Skipped by User** | 2 | ⚠️ |
| **Failed (System Error)** | 0 | ❌ |
| **Total Anomalies Detected** | 14 | 🔶 |

### Anomaly Breakdown

| Anomaly Type | Occurrences | User Actions Taken |
| :--- | :---: | :--- |
| **Duplicate Entries** | 2 | 1 Skipped, 1 Imported Anyway |
| **Name Typos** | 3 | 2 Mapped to User, 1 Created Guest |
| **Guest Members** | 2 | 2 Guest Profiles Created |
| **Missing Currency** | 1 | 1 Mapped to USD |
| **Foreign Currency Conversion**| 1 | 1 Converted to INR Base |
| **Negative Amount (Refunds)** | 1 | 1 Treated as Refund |
| **Direct Transfers** | 1 | 1 Confirmed as P2P Settlement |
| **Mid-Month Joiner** | 1 | 1 Prorated Mathematically |
| **Post-Exit Member Billed** | 1 | 1 Removed from Split |
| **Conflicting Split Definition**| 1 | 1 Changed to Percentage Split |

---

## 📝 Row-by-Row Processing Report (Sample Highlights)

> *Note: For brevity, only rows that triggered an anomaly and required user resolution are displayed in this report.*

### Row 4: Grocery Run at Whole Foods
* **Status:** 🔶 Needs Resolution
* **Detected Anomaly:** Name Typo (`Aisa`)
* **Detection Reason:** Participant `Aisa` is not registered, but is extremely close to registered user `Aisha`.
* **Action Taken:** Engine halted. No automatic guessing performed. 
* **User Decision:** Map `Aisa` to `Aisha` (`uuid-4412`).
* **Final Result:** ✅ Successfully re-validated and imported.

### Row 12: Rent Advance
* **Status:** 🔶 Needs Resolution
* **Detected Anomaly:** Direct Transfer
* **Detection Reason:** The description contained the keyword "Advance" with exactly one counterparty, blurring the line between a shared expense and a direct repayment.
* **Action Taken:** Engine halted.
* **User Decision:** Classify as `direct_transfer`.
* **Final Result:** ✅ Imported as a pure P2P settlement. Zero ExpenseSplits generated.

### Row 19: Uber Airport Ride
* **Status:** 🔶 Needs Resolution
* **Detected Anomaly:** Conflicting Duplicate
* **Detection Reason:** An identical charge for $45.00 on the same date for the same participants already exists in the database.
* **Action Taken:** Engine halted to prevent double-billing.
* **User Decision:** Skip duplicate.
* **Final Result:** ⚠️ Row discarded safely.

### Row 27: Flat Electricity Bill (April)
* **Status:** 🔶 Needs Resolution
* **Detected Anomaly:** Mid-Month Joiner
* **Detection Reason:** Participant `Sam` was included in the equal split, but official group records show he joined on April 15th. 
* **Action Taken:** Engine halted. Engine refused to automatically prorate without user consent regarding the flat's billing policy.
* **User Decision:** Apply `prorated` fraction (15/30 days).
* **Final Result:** ✅ Engine mathematically reduced Sam's liability and perfectly redistributed the exact remainder among the full-time members.

### Row 35: Internet Bill
* **Status:** 🔶 Needs Resolution
* **Detected Anomaly:** Conflicting Split Definition
* **Detection Reason:** The declared split type was `Equal`, but the raw CSV data explicitly contained percentages (`30%`, `70%`).
* **Action Taken:** Engine halted.
* **User Decision:** Change split type to `Percentage`.
* **Final Result:** ✅ Re-validated natively as a percentage split and imported.

### Row 42: Cashback Reward
* **Status:** 🔶 Needs Resolution
* **Detected Anomaly:** Negative Amount
* **Detection Reason:** Amount provided was `-15.00`. Negative floats corrupt ledger debt algorithms.
* **Action Taken:** Engine halted.
* **User Decision:** Treat as Refund.
* **Final Result:** ✅ Converted to positive absolute value and flagged as `is_refund = true` for safe aggregation.

---

## 🔍 Anomaly Summary & Handling Philosophy

### 1. Identity Ambiguities (Guests & Typos)
**Occurrences:** 5
**Handling:** The importer *never* assumes the identity of a participant. A misspelled name could be a typo, or it could be a completely different human being. The system securely paused, allowing the user to map typos to real users, and spinning up isolated shadow `Guest` profiles for unregistered friends to safely absorb ledger debt.

### 2. Temporal & Policy Ambiguities (Joiners & Leavers)
**Occurrences:** 2
**Handling:** The importer detected that participants were billed for expenses occurring outside their official flat residency dates. Instead of enforcing a hardcoded "daily prorata" rule, the system asked the user to define the billing policy for that specific row, ensuring the math matched the human agreement.

### 3. Structural Ambiguities (Conflicting Splits)
**Occurrences:** 1
**Handling:** When the requested math (`Equal`) clashed with the provided data (`30%`), the engine rejected the row instead of guessing which one to trust. 

---

## 🔐 Data Integrity Report

✅ **Zero Auto-Correction:** No financial values, split structures, or participant identities were automatically changed by the system.
✅ **Precision Mathematics:** All fractional allocations, prorated scaling, and percentage conversions were strictly executed using `Big.js`, guaranteeing zero-sum equality down to the penny.
✅ **Transaction Safety:** All 48 valid rows were written to the database inside a single `Sequelize Managed Transaction`. 
✅ **Atomic Guarantee:** No partial imports occurred. If row 49 had failed database constraints, rows 1 through 48 would have been instantly rolled back.

---

## ⚙️ Validation Summary

The engine successfully validated the following parameters against the raw data:
* **Participant Names:** Ensured 100% mapping to UUIDs or isolated Guest IDs.
* **Dates:** Enforced ISO compliance.
* **Currency:** Enforced supported ISO codes and isolated foreign currency conversions.
* **Monetary Amounts:** Prevented zero/negative injections without strict classification (Refund/Ghost).
* **Mathematical Splits:** Validated Equal, Percentage, Share Ratio, and Unequal distributions to equal exactly `100.00%` of the base amount.
* **Ledger Types:** Safely separated group expenses from direct P2P settlements.

---

## ⏱️ Import Execution Timeline

1. **CSV Uploaded** (`june_flat_expenses_final.csv`)
2. ⬇️ **Initial Validation Started**
3. ⬇️ **Anomalies Detected** (14 ambiguities found)
4. ⬇️ **Rows Ejected** (Marked as `needs_resolution`)
5. ⬇️ **User Review Phase** (User explicitly classified all 14 rows)
6. ⬇️ **Corrections Injected** (Raw data dynamically mutated in memory)
7. ⬇️ **Validation Re-run** (Math natively re-calculated on fixed data)
8. ⬇️ **Database Transaction Started**
9. ⬇️ **Atomic Commit Successful**
10. **Import Completed Successfully** 🎉

---

**System Note:** *This report is auto-generated by the Importer Validation Engine. Financial integrity checks passed successfully. No database drift detected.*
