# FairShare — Intelligent Shared Expense Ledger

An ultra-modern, full-stack PERN-style application engineered to ingest messy real-world CSV expense files, intercept 12+ categories of structural anomalies, and mathematically resolve complex scenarios like mid-month joiners, multi-currency conversions, name typos, duplicate imports, and guest vs. registered user handling — all with **explicit user approval at every decision point**.

> 🔗 GitHub: [github.com/Divyakri93/Expenses_split](https://github.com/Divyakri93/Expenses_split)

---

## 🎯 Problem Solved — The 4-Person Flat Scenario

This application was engineered to resolve the exact real-world constraints of a 4-person flat (Aisha, Rohan, Priya, Sam, Meera):

| Person | Demand | How It's Solved |
|---|---|---|
| **Aisha** | "One number per person" | **Settlement Matrix** — reduces all group debts into direct P2P payments |
| **Rohan** | "No magic numbers" | **Audit Trail Ledger** — full double-entry breakdown per transaction |
| **Priya** | "Dollar is not a rupee" | **Multi-Currency Engine** — USD/EUR/GBP → INR with live exchange rates |
| **Sam** | "Moved in mid-April" | **Temporal Boundary Engine** — pro-rata split: 23/30 active days = 76.66% max share |
| **Meera** | "Approve anything changed" | **Interactive Wizard** — zero silent mutations, every anomaly requires user approval |

---

## ✨ Key Features

### 📥 CSV Import Wizard
- Drag-and-drop CSV upload with real-time anomaly detection
- Every problematic row is presented in an **interactive step-by-step wizard**
- User can **accept**, **reject**, or **manually edit** every single row
- Nothing is committed to the database without explicit user approval

### 🔍 Duplicate Detection System (O(n) performance)
- **Batch duplicates**: O(1) hash map lookup by `date + amount + payer + currency`
- **Database duplicates**: pre-scans existing DB expenses before import
- **Confidence scoring**: 100% (exact match), 90% (description typo), 70% (date ±1 day)
- **Split member comparison**: Pizza/Aisha/Rohan ≠ Pizza/Aisha/Priya — different expenses
- **Currency-aware**: $10 ≠ ₹10 even if digits match
- **Normalized descriptions**: "Pizza!!!" = "pizza" = "PIZZA" before comparison (Levenshtein)

### 🔤 Typo Correction — "Did you mean?" Flow
- Backend runs **Levenshtein distance ≤ 2** against all registered users
- If close match found, frontend shows an interactive popup:
  - ✅ **Yes, it's Aisha** — remap to existing user, no duplicate created
  - 👤 **Keep as Guest "Aishaa"** — create a Guest profile with original spelling
  - 🆕 **Create new User "Aishaa"** — register brand new account
- Typo names and unknown names handled separately (no false positives)

### 👥 Guest Entity System
- Guests are **separate from Users** — they are not auto-promoted to User accounts
- `Guest` model stores: `name`, `email`, `phone`, `notes`, `user_id` (nullable)
- `Guest.findOrCreate()` prevents duplicate guest profiles across imports
- Guest → User conversion: `convertGuestToUser()` links without deleting history
- Settlements and audit trails roll up guest balances into linked user balance if promoted

### 📊 Anomaly Detection Engine (12 Categories)
See `SCOPE.md` for full technical specifications. Summary:

| # | Anomaly | Resolution |
|---|---|---|
| 1 | Missing payer | Block row, require user selection |
| 2 | Comma-formatted numbers (1,500) | Strip non-numeric chars → Big.js |
| 3 | Floating-point overflow (₹899.995) | Banker's Rounding (Half-Even) |
| 4 | Name typos / case variants | Levenshtein fuzzy match + "Did you mean?" |
| 5 | Duplicate transactions | Hash map + DB check + confidence % |
| 6 | Non-standard dates (DD/MM/YYYY) | Normalize to ISO 8601 YYYY-MM-DD |
| 7 | Settlement entries in expense list | Flag `is_settlement=true`, route to P2P engine |
| 8 | Percentage splits not summing to 100% | Auto-normalize ratios |
| 9 | Missing currency | Inherit group base currency (INR) |
| 10 | Multi-currency entries (USD, EUR) | FX conversion to INR base amount |
| 11 | Negative amounts | Treat as refund, invert transaction topology |
| 12 | Temporal frontier violations | Pro-rata day-basis engine |

### ⏱️ Temporal Boundary Engine
- Dynamically detects `MID_MONTH_JOINER` and `POST_EXIT_MEMBER_BILLED` anomalies
- Calculates exact active days per billing month per member
- Sam (joined Apr 8): `23/30 ≈ 76.66%` max liability
- Meera (left Mar 31): `0/30 = 0%` for April expenses
- Remainder redistributed to full-time members automatically

### 💱 Multi-Currency Engine
- Supports: USD, EUR, GBP, SGD, AUD, AED, CAD, INR
- Frontend currency editor with real-time INR conversion preview
- Stores both original amount + converted base amount for full audit trail

### 📈 Settlement & Audit
- **Settlement Matrix**: Greedy debt minimization — optimal P2P payment graph
- **Audit Trail**: Double-entry breakdown, every balance traceable to source transactions
- **CSV Changes Log**: Inline system notes, corrections, and duplicate warnings persisted in expense notes

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (local dev) / PostgreSQL (production) |
| **ORM** | Sequelize (auto-sync with `alter: true`) |
| **CSV Parsing** | fast-csv (stream-based) |
| **Precision Math** | big.js (Banker's Rounding) |
| **Date Handling** | date-fns (strict UTC parsing) |
| **Frontend** | React 18, Vite |
| **Styling** | Tailwind CSS, Glassmorphism |
| **Auth** | JWT (Bearer token) |
| **Icons** | Lucide React |

---

## 🚀 Setup & Running Locally

### 1. Clone the Repository
```bash
git clone https://github.com/Divyakri93/Expenses_split.git
cd Expenses_split
```

### 2. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:
```env
PORT=5000
JWT_SECRET=your_super_secret_jwt_key
# For PostgreSQL (production):
# DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/expenses_db
# Leave DATABASE_URL blank for SQLite local dev
```

```bash
node server.js
# Output: Database synced | Server running on port 5000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
# Vite dev server: http://localhost:5173
```

### 4. Test the CSV Import
1. Sign up / Login at `http://localhost:5173`
2. Navigate to **CSV Import Wizard**
3. Upload a CSV with columns: `description, amount, paid_by, date, split_with, currency`
4. Interact with the anomaly wizard
5. Resolve any "Did you mean?" typo popups, duplicate warnings, and unknown members
6. Click **Commit Valid Rows**

### Sample CSV Format
```csv
description,amount,paid_by,date,split_with,currency,split_type
Pizza,500,Aisha,2026-07-01,Aisha;Rohan;Priya,INR,equal
Airbnb,3400,Rohan,2026-06-15,Aisha;Rohan;Priya;Sam,INR,equal
Coffee,$12,Priya,2026-07-02,Priya;Aisha,USD,equal
```

---

## 🗂️ Project Structure

```
Expenses_App/
├── backend/
│   ├── controllers/
│   │   ├── csvSanitizer.js      ← Core: all anomaly detection, duplicate logic, typo correction
│   │   ├── authController.js    ← Auth + Guest→User conversion
│   │   └── settlementController.js ← Settlement matrix + audit trail
│   ├── models/
│   │   ├── User.js
│   │   ├── Guest.js             ← Guest entity (email, phone, notes, user_id FK)
│   │   ├── Expense.js
│   │   ├── ExpenseSplit.js
│   │   ├── Group.js
│   │   ├── GroupMember.js
│   │   └── index.js             ← Sequelize associations
│   └── server.js
├── frontend/
│   └── src/components/
│       ├── CSVProcessingWizard.jsx  ← Main wizard UI + "Did you mean?" popup
│       ├── CorrectionSummary.jsx   ← Final review before commit
│       ├── AuditTrailView.jsx
│       └── GroupDashboard.jsx
├── README.md         ← This file
├── SCOPE.md          ← Full anomaly specs + DB schema
├── DECISIONS.md      ← Engineering decisions & trade-offs
├── IMPORT_REPORT.md  ← Sample import execution report
└── AI_USAGE.md       ← AI collaboration log & bug fixes
```

---

*See `DECISIONS.md` for architecture trade-offs, `SCOPE.md` for full anomaly specs, and `AI_USAGE.md` for AI collaboration transparency.*
