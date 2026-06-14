# Engineering Decisions Journal

This document serves as an analytical ledger for the core architectural crossroads encountered during the development of the FairShare SaaS application and the CSV Sanitization pipeline.

## 1. Database Architecture: Relational PostgreSQL vs. NoSQL MongoDB

**Alternative Considered:** NoSQL (MongoDB)
- *Pros:* Flexible schema allows storing dynamic CSV rows (even malformed ones) directly without rigid constraints. Nested documents would make it easy to store an expense and its dynamic splits in a single JSON object.
- *Cons:* No innate ACID compliance across multi-document transactions. High risk of floating-point math divergence without strict decimal constraints.

**Decision Chosen:** Relational PostgreSQL
- *Technical Justification:* A financial ledger requires absolute mathematical integrity. PostgreSQL's `DECIMAL` types ensure floating-point precision is maintained (avoiding JavaScript's `0.1 + 0.2 = 0.30000000000000004` bug). Furthermore, the structural rigidity of Relational ER schemas (Expenses -> Splits) guarantees that orphaned debts cannot exist.

## 2. Ingestion Strategy: DB Staging Tables vs. In-Memory State

**Alternative Considered:** Temporary Staging Tables (`staging_expenses`)
- *Pros:* Extremely robust. Handles massive CSVs (100MB+) that would otherwise blow up Node.js V8 memory heaps.
- *Cons:* High architectural overhead. Requires cron jobs or lifecycle hooks to sweep and clean up abandoned staging rows if users upload a file but close the tab before committing.

**Decision Chosen:** In-Memory State Pipeline (`fast-csv` -> React `useState`)
- *Technical Justification:* Evaluated the constraint of typical user uploads (usually under 5,000 rows for personal group trips). Streaming the CSV through `importController.js` and holding the transformed JSON directly in the React frontend memory provides a much snappier, zero-latency user experience. The database is only touched once the entire payload is 100% structurally sound.

## 3. Anomaly Resolution: Auto-Drop vs. Interactive Interception

**Alternative Considered:** Auto-Drop (Silent Exclusion)
- *Pros:* Frictionless user experience. The system simply drops bad rows and imports the good ones instantly.
- *Cons:* Destructive data loss. Financial platforms cannot "silently" drop user ledger entries, as this leads to unresolvable balance disputes between group members.

**Decision Chosen:** Interactive Interception (The Glassmorphic Validation Stream)
- *Technical Justification:* Trust is the most critical metric for a financial application. By sequentially presenting all 12 anomalies to the user (highlighting them in Amber/Purple UI states), the system shifts the liability of data mutation to the user. The backend engine provides "Smart Suggested Fixes" (such as dynamic Pro-Rata Math), but enforces explicit user consent (clicking "Accept") before proceeding.

## 4. Resolving Advanced Temporal Anomalies (Mid-Month Joiners & Post-Exit Billing)

**Alternative Considered:** Hard Rejection / Blocked Imports
- *Pros:* Strict enforcement of rules guarantees the ledger only contains 100% valid rows without needing complex extrapolation algorithms.
- *Cons:* Terrible user experience. If a user pastes 200 rows of an apartment ledger, blocking the import because one member moved out 2 days early forces the user to manually recalculate fractional math outside the app.

**Decision Chosen:** Dynamic Pro-Rata Mathematical Interception
- *Technical Justification:* To maximize convenience without sacrificing accuracy, the backend engine calculates the exact intersection of a member's active temporal window (`joined_at` -> `left_at`) and the expense date. If a member (like Sam) joins mid-month, the engine derives their fractional footprint (e.g., 23/30 days) and instantly proposes a hyper-accurate percentage split to the user. If a member (like Meera) is billed after leaving, it auto-assigns them 0 days and re-distributes their burden proportionally.

## 5. Audit Log Persistence for CSV Corrections

**Alternative Considered:** Isolated `import_logs` Database Table
- *Pros:* Highly normalized and clean structure for storing the exact keystrokes and structural adjustments made during the CSV Wizard.
- *Cons:* Adds unnecessary join overhead when fetching expenses, and creates an isolated table that will bloat exponentially over time.

**Decision Chosen:** Serializing Logs into the Expense `notes` Column
- *Technical Justification:* Extremely lightweight and contextual. Since changes are directly relevant to the specific expense row, appending a structured `[System Corrections]` payload into the existing `notes` column natively binds the historical audit trail directly to the ledger entry. This enables the frontend to effortlessly render the new "CSV Changes Log" tab without requiring complex multi-table subqueries or backend database migrations.