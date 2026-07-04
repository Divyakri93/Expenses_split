# 🧠 Product & Engineering Decisions Log (PM & Dev Defense)

The project brief sets a high bar:
> *"You are expected to act as both Product Manager and Developer... A crashed import and a silent guess are both failing answers. We are evaluating whether you can understand a real, messy problem, make and explain product and engineering decisions, and handle imperfect data deliberately rather than silently."*

During your interview, when asked *"Why did you design feature X this way?"*, use the frameworks in this document to articulate your trade-offs as both a Product Manager and a Software Engineer.

---

## 🏛️ Decision 1: Relational SQL Database (PostgreSQL/SQLite) vs. NoSQL (MongoDB)

### 🧑‍💼 The Product Manager View
In a shared financial ledger, **data consistency is our highest product metric**. If a user pays $₹1,000$ for dinner, every participant must immediately see their balance adjust. If a database glitch updates the payer's credit but fails to update a participant's debit, our users lose trust and abandon the app.

### 🧑‍💻 The Software Engineer View
* **Why SQL won:** Financial transactions are intrinsically relational: an `Expense` has one `User` (payer), belongs to one `Group`, and maps to multiple `Users` via `ExpenseSplit` records. Relational databases enforce **ACID compliance** (Atomicity, Consistency, Isolation, Durability) and **Foreign Key Constraints** with cascade deletions (`onDelete: 'CASCADE'`).
* **Why NoSQL failed:** In MongoDB, denormalizing splits into an embedded document array risks race conditions during concurrent updates. If two users settle debts simultaneously, document-level locking in NoSQL can overwrite balance sub-documents. SQL transactions (`sequelize.transaction()`) guarantee atomic commits and rollbacks.

---

## 🏛️ Decision 2: Interactive Glassmorphic Ingestion vs. Automated Cleaning

### 🧑‍💼 The Product Manager View
We faced two competing user requests:
* **Meera:** *"Clean up the duplicates — but I want to approve anything the app deletes or changes."*
* **Aisha/Rohan:** Want fast, frictionless imports without crashing.

A standard script that silently deletes duplicates or auto-guesses missing currencies violates Meera's trust. Conversely, crashing the import on a minor typo (`priya` vs `Priya`) ruins the user experience.

### 🧑‍💻 The Software Engineer View
* **Our Policy:** We implemented a **Streaming Validation Pipeline** that classifies anomalies into three distinct buckets:
  1. **Clean (`status: 'ok'`):** Auto-approved for ingestion.
  2. **Warnings (`status: 'warning'`):** Non-fatal anomalies (typos, duplicates, forex conversions, mid-month joiners). The row is preserved, but tagged with detailed warning metadata and displayed in an interactive **CSV Changes Log** tab where the user can inspect and toggle approvals.
  3. **Errors (`status: 'error'`):** Fatal anomalies (missing amount, missing payer). The row is blocked from insertion until the user manually inputs the missing data in the UI.
* **Why this wins:** We achieve zero silent guesses while preventing hard crashes!

---

## 🏛️ Decision 3: How to Handle Negative Amounts & Settlements in CSV

### ❓ The Problem
In `expenses_export.csv`, Row 13 is `Rohan paid Aisha back (5000 INR)` with no split details, and Row 25 is `Parasailing refund (-30 USD)`. How should a ledger handle negative numbers and P2P transfers?

### 🧑‍💼 The Product Manager View
If we treat `-30 USD` as a standard expense, the app would debit Dev $-₹2,853$ for getting a refund! If we treat Rohan paying Aisha ₹5,000 as a group expense, Rohan would be credited while Aisha, Priya, and Meera would be debited for Rohan's personal debt payment! Both are catastrophic product failures.

### 🧑‍💻 The Software Engineer View
* **Policy for Negative Amounts (Refunds):** When `amountBig.lt(0)` is detected ([csvSanitizer.js:L102](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L102)), we convert the amount to its absolute positive value and set `is_refund = true`. In our split calculation engine, `is_refund` reverses the credit/debit roles: the payer (Dev) gets debited, and the split participants receive credit!
* **Policy for Settlements:** When description keywords match `'paid back'` or `'settlement'`, we set `is_settlement = true` ([csvSanitizer.js:L111](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L111)). In `settlementController.js`, settlements bypass consumption logic entirely—they simply credit the payer and debit the recipient, reducing outstanding debt without inflating group spending totals.

---

## 🏛️ Decision 4: Foreign Currency Conversion at Ingestion vs. Dynamic Render Time

### ❓ The Problem
Priya noted: *"Half the trip was in dollars. The sheet pretends a dollar is a rupee."* Should we convert USD to INR permanently during CSV import, or store raw USD and convert it dynamically on the frontend?

### 🧑‍💼 The Product Manager View
Exchange rates fluctuate daily. If Rohan owed Aisha $10 USD for lunch in March, his INR debt shouldn't change every time he opens the app in August due to forex market swings! Historical group debts must be locked at the exchange rate on the date of transaction.

### 🧑‍💻 The Software Engineer View
We perform **Ingestion-Time Currency Normalization** ([csvSanitizer.js:L148-161](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L148-L161)). When `USD` is detected, we multiply by the historical rate (`EXCHANGE_RATES['USD'] = 95.11`) and store the result in `base_amount` (INR), while preserving `currency: 'USD'` and `exchange_rate_to_base: 95.11` for audit transparency in Rohan's ledger view!

---

## 🏛️ Decision 5: Banker's Rounding vs. Standard Rounding

### ❓ The Problem
When splitting a ₹1,199 bill among 4 people, $1199 \div 4 = 299.75$. How do we handle sub-cent rounding across thousands of transactions without leaking pennies?

### 🧑‍💻 The Software Engineer View
1. **Banker's Rounding (`Big.RM = 2`):** Standard Round-Half-Up (`Math.round`) rounds `.5` upwards, creating a positive statistical bias. Banker's Rounding rounds to the nearest even number when equidistant, eliminating cumulative drift in financial ledgers.
2. **Zero-Sum Sub-Cent Loop ([csvSanitizer.js:L526-528](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L526-L528)):** When calculating shares in a loop, for the $N$-th (last) member, instead of dividing, we set their share to:
   $$\text{Last Share} = \text{Total Base Amount} - \sum_{i=1}^{N-1} \text{Share}_i$$
   This ensures that $100.00\%$ of the invoice is accounted for to the exact penny!
