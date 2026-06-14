# AI Usage & Diagnostic Disclosure

This file serves as absolute transparency regarding the usage of Artificial Intelligence in the generation, debugging, and deployment of the FairShare SaaS platform.

## AI Engines Utilized
- **Primary Architect:** Google DeepMind Advanced Agentic Coding (Antigravity System)
- **Role Designation:** Principal Full-Stack Engineer and Elite UI/UX Designer.

## Master Prompt Sequences
1. *"Act as a Senior Backend Architect... We need to implement a critical compliance feature in our PERN stack Shared Expenses App: 'Pro-Rata Temporal Split Validation with Manual Override Interface.'"*
2. *"Act as a Principal Full-Stack Engineer... implement a comprehensive, fully interactive CSV Ingestion & Sanitization Pipeline... feature a highly attractive, ultra-modern Glassmorphic Dark Theme."*
3. *"Act as a Lead Backend Engineer. We need to implement a specific data-fixing logic in our PERN stack CSV parser engine to resolve the temporal anomaly found on Row #31 ('Meera leaving on March 31 but billed in April')."*

---

## Diagnostics: Concrete Flaw/Patch Cycles

As per the assignment requirements, below are concrete instances where the AI generated incorrect logic, how it was identified, and the architectural fix applied.

### 1. The Mid-Month Pro-Rata Math Flaw (Sam's 16-Day Error)
- **Initial AI Action:** While building the dynamic fractional engine for `MID_MONTH_JOINER` anomalies, the AI attempted to calculate Sam's active days in April. Since Sam moved in on April 8th, the AI confidently calculated his active days as `16 days`.
- **How it was caught:** The human engineer manually cross-referenced the math: April has 30 days. `30 total days - 7 inactive days = 23 active days`. The AI's math was entirely flawed.
- **Structural Patch:** The AI corrected its temporal algorithm to properly reference absolute calendar month lengths via the `date-fns` library rather than making arbitrary logic leaps, ensuring the engine correctly calculated `23 days` for Sam and pushed a mathematically perfect fraction (`23 / (30*3 + 23) = 20.35%`) to the UI.

### 2. The CSV Changes Database Evaporation (Data Persistence Flaw)
- **Initial AI Action:** The AI built a beautiful UI component (`CorrectionSummary.jsx`) to display the "Data Changes Applied" to the user after they successfully bypassed all anomalies in the CSV wizard. 
- **How it was caught:** When the human engineer requested a new "CSV Changes Log" tab to view these historical corrections *after* the import, the AI realized it had committed a major architectural oversight: the `changes_applied` array was stored only in the React `useState` memory and was completely dropped during the `POST /api/expenses/commit` transaction.
- **Structural Patch:** The AI immediately updated `backend/controllers/csvSanitizer.js` to stringify the array and prepend it with a `[System Corrections]:` tag, permanently serializing the audit logs directly into the PostgreSQL `Expenses.notes` column.

### 3. SQLite Foreign Key Constraint Crash (`alter: true` bug)
- **Initial AI Action:** When deploying the updated Expense models to support the new Notes persistence, the AI configured the backend server initialization script to use `sequelize.sync({ alter: true })`.
- **How it was caught:** Upon backend restart, the server instantly crashed with a fatal `SequelizeForeignKeyConstraintError: SQLITE_CONSTRAINT: FOREIGN KEY constraint failed`. The AI noticed this by actively monitoring the background terminal task logs.
- **Structural Patch:** The AI recognized that SQLite does not support complex `ALTER TABLE` commands when strict Foreign Key enforcement is active. The AI immediately patched `server.js` by flipping `alter: false`, prioritizing stable schema evolution over destructive auto-syncs.

### 4. JavaScript Floating-Point Decimal Leak
- **Initial AI Action:** When parsing custom percentage splits (e.g., `Aisha: 33.3%, Rohan: 33.3%, Meera: 33.3%`), the AI originally used standard JavaScript `parseFloat` to compute the allocation sums against 100%.
- **How it was caught:** $1000 multiplied by 33.333% generated cascading sub-cent anomalies due to IEEE 754 precision issues natively inherent to JavaScript (`0.1 + 0.2`).
- **Structural Patch:** The AI enforced a proportional normalization algorithm: `parseFloat(((newRaw[k] / total) * 100).toFixed(2))` preventing ledger precision leakage before inserting values into the DB.
