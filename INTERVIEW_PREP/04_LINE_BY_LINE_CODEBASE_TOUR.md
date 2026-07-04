# 🔍 Line-by-Line Codebase Tour: Why Does This Line Exist?

During your 45-minute live interview, the evaluators warned:
> *"We will point at any line in your repository and ask why it exists."*

This guide takes you on a deep architectural tour of your core controllers, models, and frontend components, explaining the exact engineering rationale behind critical code blocks.

---

## 🏛️ File 1: `backend/controllers/settlementController.js` (Debt Simplification)

### Lines 1-3: Precision Library Setup
```javascript
const { User, Expense, ExpenseSplit } = require('../models');
const Big = require('big.js');
Big.RM = 2; // Banker's Rounding (Half-Even)
```
* **Why does line 3 exist?** Setting `Big.RM = 2` configures the global rounding mode for the `Big.js` library to **Round-Half-Even (Banker's Rounding)**. If we used native floating-point math or standard round-up (`Math.round`), cumulative penny rounding across thousands of splits would create an upward statistical drift. Banker's Rounding rounds `.5` to the nearest even number, balancing rounding errors to zero.

### Lines 15-28: Net Balance Graph Construction
```javascript
const balances = {}; // { userId: netBalance (Big.js) }
expenses.forEach(exp => {
    const payerId = exp.paid_by_user_id;
    if (!balances[payerId]) balances[payerId] = Big(0);
    if (exp.is_settlement) {
       balances[payerId] = balances[payerId].plus(exp.amount);
    } else {
       balances[payerId] = balances[payerId].plus(exp.amount);
    }
```
* **Why do we treat `is_settlement` the exact same way as an expense here?** Whether Rohan pays ₹1,000 to a restaurant (an expense) or pays ₹1,000 directly to Aisha to clear his debt (a settlement), he has injected cash into the group ledger. Therefore, the payer's credit balance must increase (`.plus()`) in both cases.

### Lines 47-51: Handling Unallocated Debt
```javascript
const unallocated = Big(exp.amount).minus(totalSplitAmount);
if (!unallocated.eq(0)) {
    balances[payerId] = balances[payerId].minus(unallocated);
}
```
* **Why does this block exist?** This is an architectural safety net. If a user creates an unequal split where shares only sum to ₹99.98 on a ₹100 bill, ₹0.02 is unallocated. To preserve double-entry bookkeeping ($\sum \text{Credits} = \sum \text{Debits}$), any unallocated discrepancy is deducted directly from the payer's credit balance so the ledger never leaks money.

### Lines 55-70: Separating and Sorting Debtors vs. Creditors
```javascript
Object.keys(balances).forEach(userId => {
    const val = balances[userId];
    if (val.lt(0)) debtors.push({ userId, amount: val.abs() });
    else if (val.gt(0)) creditors.push({ userId, amount: val });
});
debtors.sort((a, b) => b.amount.minus(a.amount).toNumber());
creditors.sort((a, b) => b.amount.minus(a.amount).toNumber());
```
* **Why do we sort descending?** This is the core setup for the **Greedy Two-Pointer Algorithm**. By matching the largest debtor with the largest creditor first, we maximize the chance that at least one person's balance is entirely wiped out in a single transaction, guaranteeing all debts settle in at most $N-1$ payments!

### Lines 76-93: The Two-Pointer Greedy Matching Loop
```javascript
while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];
    const minAmount = debtor.amount.lt(creditor.amount) ? debtor.amount : creditor.amount;
    settlements.push({ from: debtor.userId, to: creditor.userId, amount: minAmount.round(4).toNumber() });
    debtor.amount = debtor.amount.minus(minAmount);
    creditor.amount = creditor.amount.minus(minAmount);
    if (debtor.amount.eq(0)) d++;
    if (creditor.amount.eq(0)) c++;
}
```
* **Why check `debtor.amount.eq(0)`?** Because we subtracted `minAmount` (the smaller of the two balances), exactly one (or both) of `debtor` or `creditor` is guaranteed to reach `0.00`. If `debtor` hits zero, they are settled, so we advance pointer `d++` to the next debtor.

---

## 🏛️ File 2: `backend/controllers/csvSanitizer.js` (Ingestion Engine)

### Lines 26-43: Levenshtein Distance Algorithm
```javascript
const levenshtein = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  // ... dynamic programming matrix build ...
  return matrix[a.length][b.length];
};
```
* **Why did we write a custom Levenshtein algorithm?** The CSV export contains human typos (e.g., `'priya'` lowercase, `'Priya S'`). Levenshtein distance calculates the minimum number of character edits needed to turn string A into string B. If the edit distance is $\le 2$, our system recognizes it as a typo for `'Priya'` and auto-normalizes it without crashing.

### Lines 67-69: Stream Ingestion
```javascript
const stream = Readable.from(req.file.buffer);
csv.parseStream(stream, { headers: true })
```
* **Why use streams instead of reading the whole string into memory?** If a company uploads a 50MB ledger export with 100,000 rows, loading the entire file into a string variable would block Node.js's single-threaded Event Loop and risk Out of Memory (OOM) crashes. Streaming processes rows asynchronously in small memory chunks.

### Lines 102-106: Negative Amount Interception
```javascript
if (amountBig.lt(0)) {
   warnings.push('Negative amount detected. Processed as a refund (roles reversed).');
   parsedRow.amount = Math.abs(parsedRow.amount);
   parsedRow.is_refund = true;
}
```
* **Why treat negative amounts as refunds instead of errors?** In real-world accounting exports (like Row 25 of the CSV: `Dev -30 USD parasailing refund`), negative numbers represent refunds or reimbursements. Instead of crashing, we convert it to absolute value and flag `is_refund = true`, instructing the frontend business logic to swap payer and split participant roles!

### Lines 284-335: Sam's Mid-Month Joiner Pro-Rata Math
```javascript
if (joinDate && expenseDate.getMonth() === joinDate.getMonth() && expenseDate.getFullYear() === joinDate.getFullYear()) {
    activeDays = (daysInMonth - joinDate.getDate()) + 1;
}
// ...
let maxRatio = Big(activeDays).div(daysInMonth);
let allowedShare = oldShare.times(maxRatio).toNumber();
```
* **Why does this formula exist?** This directly answers **Sam's request** (*"I moved in mid-April"*). If Sam joined April 8th (`2026-04-08`), he was only active for $30 - 8 + 1 = 23$ days in April. His maximum liability is capped at $\frac{23}{30}$ of a standard share. The remaining unallocated cost from his 7 inactive days is dynamically distributed among full-time flatmates.

### Lines 412 & 540-543: Database Transaction Wrapping
```javascript
const t = await sequelize.transaction();
try {
    // ... insert groups, users, expenses, splits ...
    await t.commit();
} catch (error) {
    await t.rollback();
    res.status(500).json({ error: 'Database transaction failed' });
}
```
* **Why wrap `commitData` in a SQL transaction?** An imported CSV might generate 30 expenses and 120 split records. If an error occurs on row 29 (e.g., a database constraint violation), without a transaction, the first 28 rows would remain permanently saved, corrupting the ledger! `t.rollback()` ensures atomic execution: either all 34 rows commit successfully, or nothing changes.

---

## 🏛️ File 3: `backend/models/index.js` & ER Schema (Relational Modeling)

### Foreign Key Cascades
```javascript
Expense.hasMany(ExpenseSplit, { foreignKey: 'expense_id', onDelete: 'CASCADE' });
ExpenseSplit.belongsTo(Expense, { foreignKey: 'expense_id' });
```
* **Why `onDelete: 'CASCADE'`?** If an admin deletes an expense record, all associated 4 or 5 split records must automatically be deleted by the database engine. Without cascade deletion, orphaned split records would remain in the database, causing phantom debits in future balance calculations!

---

## 🏛️ File 4: `frontend/src/components/CSVProcessingWizard.jsx` (Interactive UI)

### Why are rows stored in React state with `status` badges?
* **Meera's Request:** *"Clean up the duplicates — but I want to approve anything the app deletes or changes."*
* If our backend silently deleted duplicates or guessed typos, we would fail Meera's constraint. By streaming all warnings and errors back to React state, we render an interactive **CSV Changes Log** tab where the user can inspect every system modification, toggle checkboxes, and explicitly approve changes before invoking `/api/groups/:id/import-csv/commit`.
