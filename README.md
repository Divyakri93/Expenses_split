# FairShare CSV Import System

> A production-grade, zero-auto-correct CSV ingestion engine for expense-sharing ledgers.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/status-production-success.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

---

## 📖 Project Overview

Importing human-generated financial CSV files into a structured relational database is an incredibly fragile process. A single ambiguous date format, a misspelled name, or a floating-point rounding error can silently corrupt a ledger and permanently destroy user trust.

This project solves that problem by implementing a strict **"Zero-Auto-Correct"** architecture. 

Unlike ordinary CRUD applications that try to silently guess or auto-fix dirty data (which leads to financial imbalances), this engine halts on any anomaly. It flags the ambiguity, securely holds the batch in memory, and utilizes an interactive `needs_resolution` workflow to guarantee that human intent always governs the math.

**Core Focus:**
* **Accuracy:** No financial values or participant identities are ever guessed.
* **Financial Integrity:** Zero-sum allocations are strictly enforced.
* **Precision:** `Big.js` is used exclusively to eliminate floating-point drift.
* **Transaction Safety:** 100% atomic database commits via Sequelize Managed Transactions.

---

## ⚡ Key Features

| Feature | Description |
| :--- | :--- |
| **Interactive Anomaly Engine** | Detects structural conflicts and halts for user review instead of failing silently. |
| **Big.js Mathematical Precision** | Calculates exact fractional splits without `0.1 + 0.2` rounding drift. |
| **Atomic Commits** | Entire CSV batches are committed in a single transaction. Partial imports are impossible. |
| **Duplicate Detection** | O(n) hash-map detection matching dates, amounts, and participants. |
| **Guest Profile Generation** | Securely maps unregistered individuals to shadow profiles to absorb debt safely. |
| **Temporal Pro-Rata Math** | Dynamically scales debt fractions for Mid-Month Joiners. |
| **Multi-Split Validations** | Natively calculates Equal, Percentage, Share Ratio, and Unequal distributions. |
| **P2P Settlement Detection** | Isolates direct repayments from shared group expenses. |

---

## 🏛️ Project Architecture

```mermaid
graph TD
    A[Raw CSV Uploaded] --> B[CSV Parser]
    B --> C[Validation Engine]
    C --> D{Anomaly Detected?}
    D -- Yes --> E[Mark needs_resolution]
    E --> F[Frontend Review Wizard]
    F --> G[User Submits Decision]
    G --> H[Mutate Raw Payload]
    H --> C
    D -- No --> I[Stage in Memory]
    I --> J[Sequelize Transaction Started]
    J --> K[Insert Expenses]
    K --> L[Insert ExpenseSplits]
    L --> M[Commit Transaction]
```

---

## 🔍 Supported Anomalies

The validation engine actively detects and halts on the following real-world ambiguities:

| Anomaly | Detection Logic | Resolution Action |
| :--- | :--- | :--- |
| **Name Typo** | Levenshtein distance ≤ 2 against known users. | User maps to UUID or creates Guest. |
| **Guest Member** | Unregistered string detected in split. | Creates shadow profile via `findOrCreate`. |
| **Conflicting Duplicate** | Intra-CSV match found. | User explicitly chooses to Skip or Keep. |
| **Missing Currency** | Blank ISO string. | User inputs valid ISO code. |
| **Ambiguous Date** | `DD-MM` vs `MM-DD` clash (e.g., `04-05`). | User confirms the exact month. |
| **Negative Amount / Refund** | `< 0` float detected. | Flips to positive absolute, flags `is_refund`. |
| **Direct Transfer** | Counterparty = 1 + Settlement Keyword. | Bypasses splits; flags `is_settlement`. |
| **Mid-Month Joiner** | `joined_at` overlaps expense `date`. | Natively calculates fractional days. |
| **Post-Exit Member Billed**| `left_at` occurs prior to expense `date`. | User opts to Keep or Remove member. |
| **Conflicting Split** | `Equal` declared, but `%` characters detected. | User changes split type definition. |

---

## 💻 Technology Stack

| Category | Technology Used |
| :--- | :--- |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL / MySQL |
| **ORM & Transactions** | Sequelize |
| **Math & Precision** | `Big.js` |
| **Date Parsing** | `date-fns` |
| **CSV Parsing** | `csv-parser` / `papaparse` |
| **Version Control** | Git, GitHub |

---

## 📁 Folder Structure

```text
/backend
├── /controllers
│   └── csvSanitizer.js     # Core engine (Parser, Validator, Interceptor, Committer)
├── /models
│   ├── Expense.js          # Core transaction ledger (DECIMAL 12,4)
│   ├── ExpenseSplit.js     # Granular debt allocations
│   ├── User.js             # Registered entities
│   ├── Guest.js            # Shadow entities
│   └── GroupMember.js      # Temporal boundaries (joined_at, left_at)
├── /config
│   └── database.js         # Sequelize initialization
└── /routes
    └── csvRoutes.js        # API endpoints
```

---

## 🚀 Installation Guide

**1. Clone Repository**
```bash
git clone https://github.com/[your-username]/Expenses_split.git
cd Expenses_split/backend
```

**2. Install Dependencies**
```bash
npm install
```

**3. Environment Variables**
Create a `.env` file in the backend root:
```env
PORT=5000
DATABASE_URL=postgres://user:password@localhost:5432/fairshare
```

**4. Database Setup**
Ensure your local relational database is running, then sync the models:
```bash
# Handled via Sequelize sync() on startup in dev environments
```

**5. Run Backend**
```bash
npm run dev
# or
node server.js
```

---

## ⚙️ Environment Variables

| Variable | Description |
| :--- | :--- |
| `PORT` | The port the Express server binds to (default: `5000`). |
| `DATABASE_URL` | The connection string for the relational database (PostgreSQL/MySQL). |

---

## 🤖 AI Usage

Artificial Intelligence (LLMs) was utilized strictly as an **interactive engineering assistant**, not as an autonomous code generator. 

The AI was used to:
* Review the Big.js integration to ensure pennies weren't leaking.
* Discuss the structural trade-offs of isolated Guest tables versus generic polymorphic associations.
* Generate markdown formatting for reporting tables.

The AI was **never** allowed to make final architectural decisions, and its tendency to suggest "auto-correct" solutions was explicitly overridden in favor of strict data-integrity checks. 

👉 **Read the full retrospective here:** [AI_USAGE.md](./AI_USAGE.md)

---

## 🧠 Engineering Decisions

Building a financial ledger requires strict boundaries. Key decisions include:
* **Why Big.js?** Native JavaScript floating-point arithmetic breaks zero-sum constraints (`0.1 + 0.2`).
* **Why Transactions?** If row 499 of a 500-row CSV fails a database constraint, rows 1-498 are rolled back instantaneously to prevent partial batch corruption.
* **Why `needs_resolution`?** We deliberately sacrificed "1-click" UX convenience in order to guarantee absolute financial accuracy.

👉 **Read the full ADR log here:** [DECISIONS.md](./DECISIONS.md)

---

## 📚 Documentation Directory

This repository is maintained to enterprise standards. Please review the following internal engineering documents:

| Document | Purpose |
| :--- | :--- |
| [README.md](./README.md) | Project entry point, setup, and overview. |
| [SCOPE.md](./SCOPE.md) | Product definitions, constraints, and anomaly rules. |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Exhaustive ERD, indexes, and precision definitions. |
| [DECISIONS.md](./DECISIONS.md) | Architecture Decision Record (ADR) detailing major trade-offs. |
| [AI_USAGE.md](./AI_USAGE.md) | Report on the responsible pair-programming use of AI. |
| [IMPORT_REPORT.md](./IMPORT_REPORT.md) | Auto-generated batch processing report format. |

---

## 🚧 Challenges Faced

1. **Fractional Pennies (Precision Imbalance):** Dividing a $10 bill among 3 people mathematically yields an orphaned penny. Solved by bypassing standard arithmetic for the *last participant* in a split array, forcing them to absorb `Total Amount - Sum(Previous Allocations)`, guaranteeing absolute zero-sum equilibrium.
2. **Temporal Boundaries:** Allocating expenses for Mid-Month joiners required highly complex date-math isolation to determine strict fractional liability without polluting full-time members' debt.

---

## 🔮 Future Improvements

* **Exchange Rate API Integration:** Automatically fetch historical FX rates (via Fixer.io) at import time rather than requiring manual user entry.
* **Import History & Undo:** Creating an `import_batches` table to allow users to instantly rollback an entire CSV import via the UI.
* **Machine Learning Deduplication:** Upgrading from strict hash-mapping to lightweight text embedding to catch semantically identical but structurally different entries (e.g., `Uber Ride` vs `Uber Trip`).

---

## 🤝 Contributing

This is a portfolio demonstration project. While PRs are welcome, the architecture is currently locked to demonstrate specific backend constraints. Please open an issue to discuss structural changes before submitting code.

---

## 📫 Contact

**[Your Name]**  
*Senior Backend Engineer*  
Email: `[Your Email]`  
LinkedIn: `[Your LinkedIn Profile]`  
GitHub: `[Your GitHub Profile]`
