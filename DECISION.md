# Architecture Decision Record (ADR) - CSV Import System

**Document Version:** 1.0.0
**Status:** Production
**Author:** Senior Backend Engineering Team
**Target Audience:** Software Architects, Senior Software Engineers, Technical Interviewers

---

## 1. Purpose

The purpose of this document is to maintain an immutable log of critical architectural, operational, and product decisions made during the development of the CSV Import System. 

In complex financial applications, the *intent* behind an architectural choice is just as important as the code itself. Documenting these decisions ensures that future engineers understand the exact trade-offs that were evaluated, preventing the accidental removal of critical safety rails (such as bypassing anomaly resolutions for the sake of "faster imports"). By maintaining this log, we preserve the structural integrity and financial compliance of the application as it scales.

---

## 2. Architecture Philosophy

The core philosophy driving this system is **Financial Data Sovereignty**. The importer adheres to the following principles:
- **Never Assume Financial Data:** Human language in a CSV is inherently ambiguous (e.g., "Aisha deposit $500"). Is it a rent payment or a debt repayment? The machine must never guess.
- **Data Integrity over Convenience:** While users love "one-click" magic, auto-correcting financial ledger data destroys trust. It is always better to halt and ask the user than to silently guess and permanently corrupt a balance sheet.
- **User-Driven Anomaly Resolution:** When a structural anomaly is detected, the pipeline halts, ejects a `needs_resolution` payload, and relies on human authorization before mutating state.
- **Atomic Imports:** Database persistence is treated as an all-or-nothing event.
- **Precision-First Monetary Calculations:** All mathematics are isolated from JavaScript's native floating-point engine to guarantee penny-perfect zero-sum allocations.

---

## 3. Engineering Decisions

### Decision 1: Why Big.js instead of JavaScript Number
**Status:** Accepted

**Problem Statement:**
JavaScript uses IEEE 754 double-precision floating-point numbers. Operations like `0.1 + 0.2` result in `0.30000000000000004`. Dividing $10.00 among three people (`10 / 3`) results in repeating decimals. Storing this directly into a database causes compounding ledger drift.

**Context:**
We needed a way to safely calculate equal splits, percentage fractions, and currency conversions without losing pennies over thousands of transactions.

**Options Considered:**
1. Use native `Number` and call `.toFixed(2)` everywhere.
2. Store everything in cents (multiply by 100), do integer math, then divide by 100 on display.
3. Use an arbitrary-precision decimal library like `Big.js` or `Decimal.js`.

**Advantages of each option:**
- *Native:* Fast, no dependencies.
- *Integer Math:* Extremely fast, natively supported by all databases.
- *Big.js:* Perfect mathematical accuracy, handles complex division safely.

**Disadvantages of each option:**
- *Native:* Financial corruption. Completely unacceptable.
- *Integer Math:* Fails catastrophically when multiplying fractions (e.g. 33.333% of 1000 cents). Requires complex rounding logic.
- *Big.js:* Slight performance overhead.

**Chosen Solution:**
Use `Big.js`.

**Why this solution was selected:**
Financial applications cannot tolerate even a single cent of drift. `Big.js` safely handles arbitrary precision division and multiplication (vital for calculating exchange rates and exact share ratios).

**Trade-offs:** Memory and CPU overhead is higher, but the trade-off for absolute accuracy is mandatory for a ledger.

---

### Decision 2: Why validation is repeated during `commitData()`
**Status:** Accepted

**Problem Statement:**
When a user resolves an anomaly on the frontend (e.g. mapping a missing currency to USD), we must process that fix and finalize the import.

**Context:**
Early iterations applied the fix *after* the initial validation ran.

**Options Considered:**
1. *Post-Validation Patching:* Run validation, get an error, let the user fix it, and just patch the resulting JSON object directly into the database.
2. *Pre-Validation Interceptor:* Take the user's fix, map it back onto the raw CSV string, and restart the entire validation pipeline from scratch.

**Advantages of each option:**
- *Post-Validation Patching:* Faster. Fewer CPU cycles.
- *Pre-Validation Interceptor:* Guarantees that the fix doesn't violate a downstream mathematical rule (e.g., if they fix a name typo, we must still ensure the resulting split perfectly equals the total amount).

**Disadvantages of each option:**
- *Post-Validation Patching:* Dangerous. Bypasses core mathematical validation.
- *Pre-Validation Interceptor:* Slower (O(N) re-evaluation).

**Chosen Solution:**
Pre-Validation Interceptor. 

**Why this solution was selected:**
If a user resolves a Mid-Month Joiner anomaly by selecting "prorate", the system must execute complex fractional math. By injecting the resolution flag into the `corrections` object and re-running the engine, the engine *natively* hits the math block, perfectly calculates the fractions, and seamlessly feeds the validated payload to the database.

---

### Decision 3: Why use `needs_resolution` instead of automatic correction
**Status:** Accepted

**Problem Statement:**
When an anomaly (like a typo or an ambiguous date) is found, the system must decide whether to fix it or pause.

**Context:**
Many consumer apps try to auto-guess to reduce friction.

**Options Considered:**
1. Auto-correction (e.g., auto-mapping "Aisa" to "Aisha" if Levenshtein distance < 2).
2. Hard rejection (Throw a 400 Error and force the user to edit the CSV file and re-upload).
3. Interactive `needs_resolution` workflow.

**Advantages of each option:**
- *Auto-correction:* Seamless user experience.
- *Hard rejection:* Easiest to code. Zero backend state management.
- *Interactive:* Best of both worlds—maintains data integrity without forcing users to use Excel.

**Chosen Solution:**
Interactive `needs_resolution` workflow.

**Why this solution was selected:**
"Aisa" and "Aisha" might be two different human beings sharing an apartment. Auto-correcting assigns real-world financial debt to the wrong person. However, forcing users to fix typos in Excel causes massive churn. The interactive pipeline halts, explains the ambiguity, and executes exactly what the user commands.

---

### Decision 4: Why Zero-Sum Adjustment is applied to the final participant
**Status:** Accepted

**Problem Statement:**
Dividing `$10.00` equally among 3 people mathematically yields `$3.33` per person. `$3.33 * 3 = $9.99`. The ledger is missing a penny.

**Options Considered:**
1. Ignore the penny (Causes systemic ledger drift).
2. Store floats in the DB (Breaks constraints).
3. Distribute the remainder arbitrarily (e.g., random assignment).
4. Last-Member Zero-Sum Adjustment.

**Chosen Solution:**
Last-Member Zero-Sum Adjustment.

**Why this solution was selected:**
The engine calculates standard mathematical rounding for participants `1` through `N-1`. For participant `N`, the engine bypasses standard division and instead calculates `Total Amount - (Sum of previous allocations)`. This guarantees that the allocations sum to exactly `10.00`, enforcing perfect DB constraints.

---

### Decision 5: Why Guest profiles are created dynamically
**Status:** Accepted

**Problem Statement:**
A user imports a dinner bill split with "Visiting Uncle", who is not registered in the app.

**Options Considered:**
1. Reject the expense until "Visiting Uncle" registers.
2. Drop "Visiting Uncle" from the expense.
3. Dynamically create a shadow `Guest` profile.

**Chosen Solution:**
Create shadow `Guest` profile.

**Why this solution was selected:**
Dropping the unregistered person catastrophically alters the math. If a $100 bill is split equally among 4 people, each owes $25. If we drop the guest, the app calculates a 3-way split, illegally charging the registered users $33.33. Creating a `Guest` absorbs the debt safely.

---

### Decision 6: Why duplicate records are preserved instead of deleted
**Status:** Accepted

**Problem Statement:**
The system detects an exact matching row in the database.

**Options Considered:**
1. Silently drop the duplicate row.
2. Halt and ask the user.

**Chosen Solution:**
Halt and ask the user.

**Why this solution was selected:**
A user might legitimately swipe their Metro card twice in five minutes for the exact same amount. Silently dropping the row destroys a valid expense. The system calculates a confidence score, but strictly defers the final decision to the user.

---

### Decision 7: Why Mid Month Joiners are not automatically prorated
**Status:** Accepted

**Problem Statement:**
A participant joined the flat on April 15th. An electricity bill arrives for April. 

**Context:**
Early architecture automatically detected the temporal boundary and mathematically reduced their liability to 15/30 days.

**Chosen Solution:**
Halt and prompt for `Mid-Month Joiner Resolution`.

**Why this solution was selected:**
Billing policy is a human agreement, not a mathematical absolute. Some apartments charge full rent regardless of move-in date. The system must detect the temporal anomaly (Join Date vs Expense Date) but must *never* execute the math without explicit user authorization via the `prorated` or `full_share` commands.

---

### Decision 8: Why Conflicting Split Definitions are never auto-corrected
**Status:** Accepted

**Problem Statement:**
A user declares `split_type: equal` but provides `split_details: Aisha:30%; Rohan:70%`.

**Options Considered:**
1. Trust the `split_type` and ignore the percentages.
2. Trust the percentages and quietly change the type to `percentage`.
3. Halt and ask.

**Chosen Solution:**
Halt and ask.

**Why this solution was selected:**
If the system trusts the type, Aisha is overcharged (50% instead of 30%). If the system trusts the details, we are silently mutating the user's declared data model. By halting, the user clicks "Change to Percentage", the backend intercepts the flag, mutates the payload, and native validation safely parses the `%` symbols on the re-run.

---

### Decision 9: Why Direct Transfers require user confirmation
**Status:** Accepted

**Problem Statement:**
A row reads "Aisha deposit $500". Is this a shared flat expense (Aisha bought $500 worth of groceries from a store called 'Deposit'), or a direct P2P repayment (Aisha paid back her roommate)?

**Chosen Solution:**
Halt, present the ambiguity, and require resolution.

**Why this solution was selected:**
If it is a direct transfer, creating `ExpenseSplits` will falsely charge the rest of the flat for a repayment. The system scans for keywords (`transfer`, `deposit`, `wallet`) and counts the counterparties. If confidence is high, it halts. If the user confirms `direct_transfer`, the engine dynamically injects `is_settlement: true`, completely bypassing split creation and routing the data into the P2P ledger.

---

### Decision 10: Why Sequelize Transactions were used
**Status:** Accepted

**Problem Statement:**
An import contains 500 expenses, translating to 1,500 `ExpenseSplit` records.

**Context:**
If row 499 fails a database constraint (e.g. null value), the previous 498 rows are already saved. 

**Chosen Solution:**
`Managed Transactions`.

**Why this solution was selected:**
Partial imports destroy ledger trust. By wrapping the entire `commitData()` insertion array in a single `await sequelize.transaction()`, any constraint failure immediately triggers a `.rollback()`. The database state remains completely pristine.

---

### Decision 11: Why exchange rates are stored instead of only converted values
**Status:** Accepted

**Problem Statement:**
A $100 USD expense is converted to 8,300 INR on the day of the import.

**Chosen Solution:**
Store `amount: 100`, `currency: USD`, `base_amount: 8300`, and `exchange_rate_to_base: 83`.

**Why this solution was selected:**
For auditability. If we only stored 8,300 INR, the user would never know the original transaction was in USD, nor could they verify if the conversion rate applied at the time was fair. Storing all variables allows perfect visual reconstruction of the event.

---

### Decision 12: Why Post Exit Members are not automatically removed
**Status:** Accepted

**Problem Statement:**
A member leaves on March 1st. An expense is logged on March 15th that explicitly lists their name in the split.

**Chosen Solution:**
Halt and ask for `Post-Exit Member Resolution`.

**Why this solution was selected:**
They might have agreed to pay for damages assessed after they moved out. The system flags the temporal impossibility, but if the user clicks `keep_member`, the backend injects `_allow_post_exit_member: true`, bypassing the time-block and legally enforcing the debt.

---

### Decision 13: Why Refunds require explicit confirmation
**Status:** Accepted

**Problem Statement:**
A CSV row has a negative amount (`-50.00`).

**Chosen Solution:**
Halt and ask for `Refund Resolution`.

**Why this solution was selected:**
Applying a negative expense essentially reverses existing debt. If it's a bank error, it corrupts the ledger. If confirmed as a refund, the engine converts the amount to positive and marks it `is_refund: true` to indicate inbound cash flow without utilizing dangerous negative SQL decimals.

---

### Decision 14: Why parser, validator, review screen and commit phase are separated
**Status:** Accepted

**Problem Statement:**
Building an importer in a single monolithic function is easier to write but impossible to maintain.

**Chosen Solution:**
A highly decoupled 4-stage pipeline.

**Why this solution was selected:**
1. **Parser:** Extracts raw strings.
2. **Validator:** A pure, stateless function that takes a row and outputs an array of errors/anomalies without side effects.
3. **Review Screen:** A stateless frontend that simply renders the anomalies.
4. **Commit Phase:** Intercepts frontend decisions, alters the raw strings, feeds them *back* to the Validator, and only persists if the Validator returns `ok`.
This guarantees that UI logic can never bypass mathematical constraints.

---

## 4. Architectural Trade-offs

| Principle vs Principle | Decision | Rationale |
|---|---|---|
| **Automation vs User Control** | User Control | We deliberately sacrifice the "seamless" 1-click import experience. The friction of the `needs_resolution` screen is a feature, not a bug, as it guarantees that human intent governs financial shifts. |
| **Performance vs Strict Validation** | Strict Validation | Running validation twice (once on upload, again during commit with resolutions injected) doubles CPU cycles. However, O(N) operations on a 500-row CSV take milliseconds. The computational cost is negligible compared to the cost of ledger corruption. |
| **Complexity vs Maintainability** | Complexity | Intercepting resolutions and mapping them back to strings (e.g. dynamically rewriting `Aisha:30%;Rohan:70%` based on a dropdown) is highly complex to engineer. However, it vastly improves maintainability because the core Big.js validation engine never has to care *how* a user resolved a problem; it only cares that the resulting string is mathematically sound. |

---

## 5. Lessons Learned

1. **What worked well:** The `needs_resolution` object schema. By standardizing the payload (`resolution_type`, `metadata`, `action`), the frontend could dynamically render highly complex conflict screens (like Mid-Month prorata tools) without tight coupling to the backend math logic.
2. **What became more complex than expected:** Temporal bounds checking. Calculating active days for a user across leap years, different month lengths, and partial move-ins required an immense amount of date-math scaffolding to ensure the `Big.js` fraction (`activeDays / totalDays`) was exact.
3. **Which decisions improved maintainability:** Ripping out all "auto-correct" logic. By enforcing a rule that the Validator only *detects* and never *mutates*, the code became vastly easier to test and debug.

---

## 6. Future Decisions (V2 Roadmap)

1. **Exchange Rate API Integration:** Currently, FX conversion uses mocked/static maps. V2 will require an ADR on integrating a real-time provider (like Fixer.io), caching historical rates locally, and deciding how to handle API rate limits during massive batch imports.
2. **Event Sourcing / Undo Import:** As users scale, the ability to completely rollback an import batch via the UI becomes critical. This will require designing an `import_history` table and batch-tagging every `Expense` with an `import_uuid`.
3. **Machine Learning Duplicate Detection:** Moving beyond Levenshtein distance, a future decision will involve utilizing lightweight embedding models to accurately cluster transactions that are syntactically different but semantically identical (e.g. "UBER RIDE 987" vs "Uber Trip").
