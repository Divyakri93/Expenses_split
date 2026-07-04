# 🎯 FairShare: 45-Minute Live Interview Mastery Guide

Welcome to your comprehensive study hub for the **FairShare Shared Expense Ledger** engineering interview. This directory contains 5 dedicated masterclass guides designed specifically to address the **Important Evaluation Note** in your project brief:

> *Shortlisted candidates will attend a 45-minute live session with the project open. We will:*
> 1. *Pick anomalies from the CSV and ask you to trace, in your code, exactly what happens to them.*
> 2. *Ask you to modify a feature live (for example, change the rounding rule, or add a new split type).*
> 3. *Point at any line in your repository and ask why it exists.*
> 4. *Walk through your balance calculation by hand for one member.*
>
> *Submitting code you have not read will fail the live session regardless of how good the app looks.*

---

## 📚 Study Directory & Roadmap

Read and master each guide in the following recommended order before your live session:

### 1. [01_CSV_ANOMALY_TRACING.md](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/INTERVIEW_PREP/01_CSV_ANOMALY_TRACING.md)
* **What it covers:** An exhaustive row-by-row trace of all **34 rows** in `expenses_export.csv`.
* **Key takeaway:** Know exactly which line in `backend/controllers/csvSanitizer.js` intercepts typos (`priya`), duplicates (`Thalassa dinner`), foreign currency (`USD`), settlements (`Rohan paid Aisha back`), non-standard dates (`Mar-14`), and mid-month joiners (`Sam`).

### 2. [02_HANDS_ON_BALANCE_CALCULATION.md](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/INTERVIEW_PREP/02_HANDS_ON_BALANCE_CALCULATION.md)
* **What it covers:** A complete, step-by-step whiteboard arithmetic derivation of **Rohan's** and **Aisha's** ledger balances.
* **Key takeaway:** Be able to write out double-entry credit/debit impacts by hand without a calculator, explaining how `Big.js` Banker's Rounding (`Big.RM = 2`) eliminates penny leakage over large transaction sets.

### 3. [03_LIVE_CODING_MODIFICATIONS.md](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/INTERVIEW_PREP/03_LIVE_CODING_MODIFICATIONS.md)
* **What it covers:** Copy-pasteable, pre-solved code snippets for the exact 3 live modification tests interviewers are most likely to request:
  * **Test A:** Changing Banker's Rounding (`Big.RM = 2`) to Standard Round-Up or Round-Down.
  * **Test B:** Adding a new `exact` (itemized dollar/rupee) split type.
  * **Test C:** Adding a dynamic Forex transaction fee (e.g., +2% markup on USD imports).

### 4. [04_LINE_BY_LINE_CODEBASE_TOUR.md](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/INTERVIEW_PREP/04_LINE_BY_LINE_CODEBASE_TOUR.md)
* **What it covers:** A rigorous line-by-line breakdown answering *"Why does this line exist?"* across your critical files:
  * `backend/controllers/settlementController.js` (The Greedy Two-Pointer Debt Simplification algorithm).
  * `backend/controllers/csvSanitizer.js` (Streaming with `fast-csv`, Levenshtein distance, zero-sum sub-cent distribution).
  * `backend/models/index.js` (Relational SQL ER schema, ACID compliance, foreign key constraints).
  * `frontend/src/components/CSVProcessingWizard.jsx` (Interactive validation state, approval toggles).

### 5. [05_PRODUCT_ENGINEERING_DECISIONS.md](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/INTERVIEW_PREP/05_PRODUCT_ENGINEERING_DECISIONS.md)
* **What it covers:** How to defend your choices acting as both **Product Manager and Developer**.
* **Key takeaway:** Explain why a crashed import and a silent guess are both failing answers, why negative amounts are treated as refunds rather than rejected, and why you chose PostgreSQL/SQLite relational DBs over MongoDB.

---

## ⚡ The 4 Golden Rules for Your Live 45-Minute Session

1. **Never Say "The AI Wrote It":** You are encouraged to use AI as a collaborator, but you are the **engineer of record**. If asked why a line exists, explain the *engineering reason* (e.g., *"I used `Big.RM = 2` here because IEEE 754 floating points cause precision errors in financial apps, and Banker's Rounding prevents statistical drift"*).
2. **Defend Your Policies:** When asked about malformed rows (like `22-03-2026 Swiggy amount 0` or `25-02-2026 settlement`), confidently state: *"As product manager, my policy is never to silently drop or guess data. I flag it with a status warning so the user can explicitly approve or override it in the UI."*
3. **Trace From Route -> Controller -> DB:** If asked to trace an anomaly, always start from the API route (`/api/groups/:id/import-csv`), move to the stream handler (`csvSanitizer.js`), and finish at the transactional database insert (`sequelize.transaction()`).
4. **Keep Calm During Live Coding:** If asked to modify code live, open `03_LIVE_CODING_MODIFICATIONS.md` or recall the patterns: backend changes happen in `settlementController.js` or `csvSanitizer.js`, and database sync happens automatically via `sequelize.sync()`.

Good luck! You have built a senior-level application; study these guides and you will ace the interview!
