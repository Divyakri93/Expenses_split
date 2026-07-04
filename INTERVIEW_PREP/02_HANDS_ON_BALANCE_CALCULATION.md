# 🧮 Hands-On Balance Calculation Walkthrough (Whiteboard Ready)

During your 45-minute live interview, the evaluators explicitly noted:
> *"We will walk through your balance calculation by hand for one member."*

This guide demonstrates the exact, step-by-step mathematical derivation for **Rohan** and **Aisha** using double-entry ledger rules and Banker's Rounding (`Big.RM = 2`).

---

## 📐 The Fundamental Ledger Equation

Every expense in FairShare follows double-entry bookkeeping:
$$\text{Net Balance} = \sum \text{Credits (Amount Paid by User)} - \sum \text{Debits (User's Calculated Share of Consumption)}$$

* **Positive Balance ($+$, Creditor):** The group owes this user money.
* **Negative Balance ($-$, Debtor):** This user owes money to the group.
* **Zero Balance ($0$):** Fully settled.

---

## 🧑‍💻 Manual Walkthrough 1: Rohan's Balance Derivation

Let's trace Rohan's exact ledger balance across a representative sample of 5 key transactions from the CSV:

### 1. Feb 1: February Rent (₹48,000 paid by Aisha, equal split among 4)
* **Action:** Aisha pays ₹48,000. Split equally among Aisha, Rohan, Priya, Meera.
* **Rohan's Share:** $₹48,000 \div 4 = ₹12,000.00$.
* **Rohan's Ledger Impact:**
  $$\text{Credit} = ₹0 \quad | \quad \text{Debit} = ₹12,000.00 \implies \text{Running Balance} = -₹12,000.00$$

### 2. Feb 5: Wifi Bill Feb (₹1,199 paid by Rohan, equal split among 4)
* **Action:** Rohan pays ₹1,199 out of pocket.
* **Rohan's Share (Consumption):** $₹1,199 \div 4 = ₹299.75$.
* **Rohan's Ledger Impact:**
  * Rohan gets credited the full amount he paid ($+₹1,199.00$).
  * Rohan gets debited his personal consumption share ($-₹299.75$).
  * Net change to Rohan's balance: $+₹1,199.00 - ₹299.75 = +₹899.25$.
* **Running Balance:**
  $$-₹12,000.00 + ₹899.25 = -₹11,100.75$$

### 3. Feb 20: Aisha Birthday Cake (₹1,500 paid by Rohan, unequal split)
* **Action:** Rohan pays ₹1,500. Split details specify: `Rohan 700; Priya 400; Meera 400` (Aisha pays ₹0).
* **Rohan's Share:** ₹700.00.
* **Rohan's Ledger Impact:**
  * Credit: $+₹1,500.00$
  * Debit: $-₹700.00$
  * Net change: $+₹800.00$.
* **Running Balance:**
  $$-₹11,100.75 + ₹800.00 = -₹10,300.75$$

### 4. Feb 25: Rohan Paid Aisha Back (₹5,000 Settlement Transfer)
* **Action:** Rohan directly transfers ₹5,000 to Aisha to pay down his debt.
* **How your code handles this ([settlementController.js:L24-45](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/settlementController.js#L24-L45)):**
  * This is flagged as `is_settlement: true`.
  * Payer (Rohan) is **credited** $+₹5,000.00$ because he injected cash into the ledger to settle debt.
  * Recipient (Aisha) is **debited** $-₹5,000.00$ because she received cash, reducing her outstanding credit.
* **Running Balance:**
  $$-₹10,300.75 + ₹5,000.00 = -₹5,300.75$$

### 5. Mar 10: Beach Shack Lunch ($84 USD paid by Rohan, equal split among 4)
* **Action:** Rohan pays $84 USD on the Goa trip.
* **Currency Interception ([csvSanitizer.js:L151-153](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L151-L153)):**
  * System converts USD to base INR using exchange rate $95.11$:
    $$\text{Base Amount} = \$84 \times 95.11 = ₹7,989.24$$
* **Rohan's Share:** $₹7,989.24 \div 4 = ₹1,997.31$.
* **Rohan's Ledger Impact:**
  * Credit: $+₹7,989.24$
  * Debit: $-₹1,997.31$
  * Net change: $+₹5,991.93$.
* **Final Sample Running Balance:**
  $$-₹5,300.75 + ₹5,991.93 = +₹691.18 \quad (\text{Rohan is now a net creditor!})$$

---

## 👩‍💼 Manual Walkthrough 2: Aisha's Settlement Matrix ("One Number Per Person")

When Aisha asks: *"Who pays whom, how much, done,"* your backend executes the **Greedy Two-Pointer Debt Simplification Algorithm** ([settlementController.js:L54-94](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/settlementController.js#L54-L94)). Here is how to demonstrate it by hand:

### Step 1: Assume Final Net Balances After All CSV Imports
Suppose at the end of the month, the 4 flatmates have these exact net balances:
* **Aisha:** $+₹14,500.00$ (Creditor - owed money)
* **Priya:** $+₹3,500.00$ (Creditor - owed money)
* **Rohan:** $-₹10,000.00$ (Debtor - owes money)
* **Sam:** $-₹8,000.00$ (Debtor - owes money)
*(Notice: $\sum \text{Credits} + \sum \text{Debits} = +18,000 - 18,000 = 0$. A valid ledger always sums to zero!)*

### Step 2: Separate and Sort Descending
* **Debtors Array:** `[{ name: 'Rohan', amount: 10000 }, { name: 'Sam', amount: 8000 }]`
* **Creditors Array:** `[{ name: 'Aisha', amount: 14500 }, { name: 'Priya', amount: 3500 }]`

### Step 3: Execute Two-Pointer Greedy Matching ($d=0, c=0$)

#### Iteration 1: Compare Rohan ($d=0$, ₹10,000) with Aisha ($c=0$, ₹14,500)
* Take the smaller of the two amounts: $\min(10000, 14500) = ₹10,000$.
* **Transaction 1 Generated:** 👉 **Rohan pays Aisha ₹10,000.00**
* Update balances:
  * Rohan: $10000 - 10000 = 0$ (Fully settled! Move debtor pointer $d++ \to 1$).
  * Aisha: $14500 - 10000 = ₹4,500$ remaining credit.

#### Iteration 2: Compare Sam ($d=1$, ₹8,000) with Aisha ($c=0$, ₹4,500)
* Take the smaller: $\min(8000, 4500) = ₹4,500$.
* **Transaction 2 Generated:** 👉 **Sam pays Aisha ₹4,500.00**
* Update balances:
  * Sam: $8000 - 4500 = ₹3,500$ remaining debt.
  * Aisha: $4500 - 4500 = 0$ (Fully settled! Move creditor pointer $c++ \to 1$).

#### Iteration 3: Compare Sam ($d=1$, ₹3,500) with Priya ($c=1$, ₹3,500)
* Take the smaller: $\min(3500, 3500) = ₹3,500$.
* **Transaction 3 Generated:** 👉 **Sam pays Priya ₹3,500.00**
* Both hit zero ($d++, c++$). Loop terminates!

### 🎉 The Whiteboard Result
Instead of a messy web of peer-to-peer transfers, Aisha gets her exact request:
1. **Rohan $\to$ Aisha:** ₹10,000
2. **Sam $\to$ Aisha:** ₹4,500
3. **Sam $\to$ Priya:** ₹3,500
*(3 clean payments instead of $4 \times 3 = 12$ possible directional debts!)*

---

## 🧠 Why Why Why: Defending Your Math in the Interview

* **Why did we use `Big.js`?**
  * *"In standard JavaScript, `0.1 + 0.2` equals `0.30000000000000004`. If we divide a ₹1,000 bill among 3 people using native floating points, each person gets ₹333.3333333333333, and multiplying back by 3 yields ₹999.9999999999999—a penny is lost! `Big.js` maintains arbitrary decimal precision."*
* **What happens to sub-cent rounding fractions?**
  * *"In `csvSanitizer.js` at lines 526-528, I implemented a zero-sum allocation rule: for the very last person in a split list, their share is explicitly set to `baseAmount - totalAllocatedSoFar`. This guarantees that $100.00\%$ of the invoice is accounted for to the exact cent without fraction leakage."*
