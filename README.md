# FairShare SaaS: Shared Expense Ledger

An ultra-modern, Glassmorphic PERN stack application designed to ingest dirty CSV files, intercept 12 specific mathematical/structural anomalies, and interactively guide the user through pro-rata sanitizations before committing to PostgreSQL.

## Core Stack
- **Database:** PostgreSQL
- **Backend:** Node.js, Express, Sequelize, fast-csv
- **Frontend:** React, Vite, Tailwind CSS, Lucide React

## Deployment Instructions

Follow these exact steps to run the application locally.

### 1. Database Setup
Ensure PostgreSQL is installed and running on your local machine.
```bash
# Log into psql and create the database
psql -U postgres
CREATE DATABASE expenses_db;
```

### 2. Backend Installation
Open a terminal and navigate to the `backend` directory.

```bash
cd backend
npm install
```

### 3. Environment Variable Configuration (`.env`)
Create a `.env` file in the root of the `backend` directory:
```env
PORT=5000
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/expenses_db
JWT_SECRET=your_super_secret_jwt_key
```

### 4. Database Migrations
The backend uses Sequelize to auto-sync the ER schema on startup. Simply start the server to run the migrations.

```bash
# Start the backend server (runs on port 5000)
node server.js
```

### 5. Frontend Installation & Startup
Open a completely separate terminal window and navigate to the `frontend` directory.

```bash
cd frontend
npm install

# Start the Vite React development server (runs on port 5173)
npm run dev
```

### 6. Usage
Navigate to `http://localhost:5173` in your browser.
1. Sign up for a new account.
2. Create a Group and add members.
3. Click **Import CSV** to access the `CSVProcessingWizard`.
4. Upload `expenses_export.csv` to trigger the 12-Anomaly detection engine.
5. Resolve the UI alerts, view the ledger summary, and commit the clean data to PostgreSQL.
