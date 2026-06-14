# DECISIONS.md: Engineering & Product Decision Log

This document serves as an analytical ledger detailing the core architectural crossroads encountered while building the FairShare platform, highlighting how imperfect data was handled deliberately rather than silently.

---

## 1. Anomaly Resolution: Auto-Drop vs. Interactive Interception
**Core Challenge:** Meera requested: *"Clean up the duplicates — but I want to approve anything the app deletes or changes."*

**Options Considered:**
1. *Auto-Drop/Silent Exclusions:* The system silently scrubs duplicates, fixes math, and imports the rest. (Frictionless but violates Meera's request and creates un-auditable ledger drift).
2. *Interactive Interception:* The system pauses the import, visually surfaces the anomalies, proposes a "Smart Fix", but blocks execution until the user explicitly clicks "Accept".

**Decision Chosen:** Interactive Interception (Glassmorphic Validation Stream)
**Why:** A crashed import and a silent guess are both failing conditions for a financial app. By shifting the liability of data mutation to the user through the UI, we respect Meera's rule of explicit consent while preventing silent financial discrepancies.

---

## 2. Resolving Advanced Temporal Anomalies (Sam & Meera)
**Core Challenge:** Sam asked: *"I moved in mid-April. Why would March electricity affect my balance?"* Meera moved out on March 31st but was billed for April rent. 

**Options Considered:**
1. *Hard Rejection:* Block the CSV import entirely, forcing the user to manually exit the app and recalculate the split math in Excel before trying again. (Terrible UX).
2. *Dynamic Pro-Rata Mathematical Interception:* Auto-calculate exact active days and propose a mathematically fair fractional split.

**Decision Chosen:** Dynamic Pro-Rata Mathematical Interception
**Why:** To maximize convenience without sacrificing accuracy. For Sam, the engine calculates his exact footprint (`30 days - 7 inactive = 23 active days`) and instantly proposes a hyper-accurate percentage split to save him from paying for the full month. For Meera, it assigns her `0 active days` in April and redistributes her equal share to the remaining active members.

---

## 3. Database Architecture: Relational PostgreSQL vs. NoSQL
**Core Challenge:** Rohan requested: *"No magic numbers. If the app says I owe ₹2,300, I want to see exactly which expenses make that up."*

**Options Considered:**
1. *NoSQL (MongoDB):* Flexible schema allows storing dynamic CSV rows easily in nested JSON arrays.
2. *Relational Database (PostgreSQL):* Strict ER tables requiring Foreign Keys linking `Expenses` to `Expense_Splits`.

**Decision Chosen:** Relational PostgreSQL (as strictly enforced by the Assignment constraints)
**Why:** Financial ledgers require absolute mathematical integrity. PostgreSQL's rigid Relational ER schema guarantees that orphaned debts cannot exist. It also perfectly powers Rohan's **Audit Trail**, allowing us to run a clean `JOIN` across `Users`, `Expenses`, and `Splits` to produce a completely transparent double-entry ledger.

---

## 4. Ingestion Strategy: DB Staging Tables vs. In-Memory State
**Core Challenge:** How to temporarily store the dirty CSV data while the user decides how to fix the anomalies.

**Options Considered:**
1. *Temporary Staging Tables:* Dump raw CSV rows into an SQL `staging_expenses` table.
2. *In-Memory State Pipeline:* Stream the CSV through `fast-csv` and hold the JSON objects directly in React's frontend memory state.

**Decision Chosen:** In-Memory State Pipeline
**Why:** High architectural overhead. Staging tables require cron jobs to sweep abandoned rows if users close the browser tab mid-import. Holding it in React state provides a zero-latency UX, ensuring the database is only touched once the entire payload is 100% structurally sound and user-approved.

---

## 5. Audit Log Persistence for CSV Corrections
**Core Challenge:** How to permanently store the "Smart Fixes" applied to the CSV so they can be audited later.

**Options Considered:**
1. *Isolated `import_logs` Database Table:* A complex secondary table to track exactly what percentage was changed.
2. *Serializing Logs into the Expense `notes` Column:* Appending a structured string tag.

**Decision Chosen:** Serializing Logs into the Expense `notes` Column
**Why:** Extremely lightweight and highly contextual. Appending a structured `[System Corrections]` payload into the existing `notes` column natively binds the historical audit trail directly to the ledger entry without database bloat.