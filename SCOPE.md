# CSV Import System - Engineering Scope & Architecture Document

**Document Version:** 1.0.0
**Status:** Production
**Author:** Senior Backend Engineering Team
**Target Audience:** Software Architects, Senior Backend Engineers, Technical Interviewers

---

## 1. Overview

### 1.1 The Challenge of CSV Imports in Financial Systems
CSV imports are notoriously difficult in FinTech and expense-sharing ecosystems because they operate at the intersection of unstructured human input and strict financial mathematics. Users frequently upload raw bank statements, manual ledgers, or third-party exports that contain typographical errors, ambiguous transaction intents, unsupported currencies, or hidden temporal discrepancies (e.g., participants joining/leaving).

### 1.2 The Philosophy of Absolute User Sovereignty
In financial systems, silently modifying a record to "make it fit" is catastrophic. Auto-correcting a $500 direct transfer into a shared rent expense corrupts ledger balances, destroys trust, and introduces profound legal and auditing complexities. 

Therefore, this CSV Importer was designed under a strict **Zero Auto-Correction Policy**. The system is fundamentally a **deterministic validation engine paired with an interactive resolution pipeline**. Whenever the engine detects structural, mathematical, or semantic ambiguity, it halts. It packages the anomaly into a `needs_resolution` payload and ejects it to the frontend. Only upon receiving explicit, user-authorized instructions does the backend inject the changes and re-run the entire validation pipeline.

### 1.3 High-Level Architecture Pipeline

\`\`\`mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant CSVParser
    participant Validator Engine
    participant Database

    User->>Frontend: Uploads CSV
    Frontend->>CSVParser: processCSV()
    CSVParser->>Validator Engine: Pass Raw Rows
    
    loop Every Row
        Validator Engine->>Validator Engine: Strict Normalization
        Validator Engine->>Validator Engine: Anomaly Detection (Dates, Duplicates, Math)
        
        alt Anomaly Detected
            Validator Engine-->>Frontend: status: 'needs_resolution' (Anomaly Metadata)
            Frontend-->>User: Interactive Resolution UI
            User->>Frontend: User Decision (e.g. 'charge_prorated')
            Frontend->>Validator Engine: commitData() with corrections payload
            Validator Engine->>Validator Engine: Inject Corrections & REVALIDATE ENTIRE PIPELINE
        else Valid
            Validator Engine->>Validator Engine: status: 'ok'
        end
    end
    
    Validator Engine->>Database: BEGIN TRANSACTION
    Validator Engine->>Database: Insert Expense & ExpenseSplits
    Validator Engine->>Database: COMMIT / ROLLBACK
\`\`\`

This architecture prevents partial state mutations. Data never touches the database until the entire payload mathematically and logically resolves.

---

## 2. Guiding Principles

This system was engineered adhering to the following axioms:

1. **Never Assume Financial Intent:** A transaction with one counterparty might be a coffee (shared expense) or a repayment (direct transfer). The system detects the ambiguity, computes a confidence score, but strictly defers classification to the user.
2. **Never Silently Modify Records:** If a user defines an 'Equal' split but provides percentages, the system does not magically parse the percentages. It halts and throws a `Conflicting Split Definition` anomaly.
3. **Validation Before Persistence:** Anomalies are mapped dynamically back into raw string data within the `corrections` object. This forces the system to *natively* re-validate the updated string (e.g. re-parsing a string to ensure percentages still equal 100) rather than blindly trusting the frontend.
4. **Atomic Database Transactions:** All valid rows are persisted in a single Sequelize transaction. If one `ExpenseSplit` fails a constraint, the entire import is rolled back, preventing orphaned financial records.
5. **Big.js for Monetary Precision:** Standard IEEE 754 floating-point arithmetic (`0.1 + 0.2 = 0.30000000000000004`) cannot safely represent ledger data. All monetary calculations, proportional allocations, and currency conversions use `Big.js`.
6. **Deterministic Imports:** Given the same CSV and the same resolution choices, the importer will produce the exact same byte-for-byte database state every time.

---

## 3. Complete Anomaly Catalogue

The core of the system is its rigorous anomaly detection engine. The following subsections detail every anomaly currently implemented, its detection vector, and its resolution architecture.

### 3.1 Duplicate Entry Detection

**Problem Description:** Users frequently re-upload the same bank statement or accidentally include overlapping dates from previous exports, leading to double-billing.

**Real-World Example:** Uploading a March CSV that includes Feb 28th transactions that were already imported in the February run.

**Why it is dangerous:** Double-billing destroys ledger trust. Users will abandon an expense-sharing application if their balances artificially inflate.

**Detection Logic:** 
- The system pulls an active snapshot of the group's expenses.
- It constructs a deterministic DB Key: `${parsedRow.date}_${parsedRow.amount}_${payerId}_${currentCurrency}`.
- If a match exists, it calculates a weighted confidence score based on the Levenshtein distance of the `description` and the exact composition of the `ExpenseSplits`.

**User Resolution:** 
- `skip`: (Default safe action) Discard the row.
- `import_anyway`: Proceed with the import if the user confirms it's a legitimate duplicate transaction (e.g. paying the exact same taxi fare twice in one day).

**Backend Resolution:** Injects a bypass flag to skip duplicate detection on re-validation.

**Database Impact:** Prevents duplicate `Expense` and `ExpenseSplit` insertions.

**Engineering Notes:** Hashing would be faster but less resilient to minor typos in the description. The composite key + confidence score allows robust fuzzy matching.

---

### 3.2 Conflicting Duplicate (Intra-CSV)

**Problem Description:** The CSV itself contains two identical rows, completely independent of the database state.

**Real-World Example:** A banking error or raw data export glitch resulting in two identical `$50` charges for `Uber` on the same day within the same file.

**Detection Logic:** 
- During `processCSV`, a temporary map tracks signatures of rows currently being processed.
- A confidence score checks the current row against previously processed rows in the same payload.

**User Resolution:** 
- `skip_duplicate`: Drops the redundant row.
- `keep_both`: Bypasses the local duplicate check.

---

### 3.3 Name Typo Resolution

**Problem Description:** CSVs manually generated or parsed from optical character recognition (OCR) contain slight misspellings of registered users.

**Real-World Example:** `Aisha` is registered in the database, but the CSV says `Aisa`.

**Detection Logic:** 
- A fast Levenshtein distance algorithm compares every string in the `Paid By` and `Split With` columns against the `dbUsers` map.
- If the distance is within the threshold (e.g. `< 3`), it flags a typo.

**User Resolution:** 
- `map_to_user`: Explicitly link `Aisa` to `Aisha` (User ID: 12).
- `create_guest`: Keep the typo and generate a new temporary Guest profile.

**Database Impact:** Binds the row to the correct UUID/Foreign Key.

---

### 3.4 Guest Member Resolution

**Problem Description:** An expense includes a person who does not have an active account in the application.

**Real-World Example:** `Aisha`, `Rohan`, and `Visiting Uncle` share dinner. 

**Detection Logic:** 
- If a parsed name matches neither a registered User nor an existing Guest, it fires a `guest_resolution`.

**User Resolution:** 
- `create_guest`: Dynamically spins up a shadow profile (`guest_id`) to hold ledger debt.
- `replace_with_user`: The user realized "Visiting Uncle" was actually an inside joke name for Rohan, and maps it to Rohan.

**Engineering Notes:** Shadows profiles are critical. If we dropped the guest, a $100 equal split among 4 people would become a $100 split among 3 people, charging registered users 33% instead of 25%, illegally inflating their debt.

---

### 3.5 Missing Mandatory Field (Paid By, Amount, Description)

**Detection Logic:** Standard null/undefined checks at the start of `createRowValidator`.
**Resolution:** Front-end blocks until the user types the missing data. The backend intercepts the edit in `commitData`, overwrites the raw string, and re-validates.

---

### 3.6 Missing / Unsupported Currency

**Problem Description:** The CSV lacks currency indicators, or uses ISO codes the engine doesn't recognize (e.g. `XYZ`).

**Detection Logic:**
- If blank, fires `missing_currency`.
- If present but not in the `SUPPORTED_CURRENCIES` array, fires `unsupported_currency`.

**User Resolution:** The user selects a valid ISO code from a dropdown.

**Why this approach was chosen:** If the system defaults to INR, but the user uploaded a USD bank statement, every expense is permanently recorded at 1/80th of its actual value. 

---

### 3.7 Foreign Currency Conversion

**Problem Description:** A valid foreign currency (e.g., `USD`) is detected in an `INR` base-currency group.

**Detection Logic:** Evaluates `currency !== baseCurrency`.
**Backend Resolution:** 
- Uses predefined exchange rates (mocked as an API response).
- Calculates the `base_amount` using `Big(amount).times(rate)`.
- Re-runs mathematical split validations against the *base amount* while preserving the original foreign amount for display purposes.

---

### 3.8 Negative Amount / Refund Resolution

**Problem Description:** The CSV contains an expense with `Amount = -500`.

**Why it is dangerous:** Is this a refund returning money to the group? Is it a cashback? Is it a bank error? Applying a negative expense inherently reverses ledger debt.

**Detection Logic:** `Big(amount).lt(0)`

**User Resolution:** 
- `treat_as_refund`: Flips the amount to positive and marks it with a metadata tag indicating money flows inward.
- `ignore`: Drops the row.

**Engineering Notes:** Silently converting negative amounts into positive expenses is data corruption. Silently treating them as refunds could reverse legitimate debts. It must be user-directed.

---

### 3.9 Zero Amount Resolution

**Problem Description:** `Amount = 0` or `$0.00`.

**Detection Logic:** `Big(amount).eq(0)`

**User Resolution:**
- `skip`: (Default) Discard.
- `import_as_ghost`: (Advanced) Import the row to maintain a complete paper trail of a fully discounted invoice, storing `0.00` in the DB.

---

### 3.10 Settlement Resolution

**Problem Description:** A user uploads a row representing the repayment of an existing debt (`Aisha paid Rohan $50`). 

**Detection Logic:** 
- Evaluates `description` against keywords (`paid back`, `settlement`).

**Backend Resolution:**
- If validated as a settlement, the system **bypasses ExpenseSplit creation entirely**.
- It creates a strict P2P Settlement record adjusting only the net balances between the two counterparties.
- Throws rigorous 400 errors if there is more than 1 receiver, or if a person attempts to settle with themselves.

---

### 3.11 Deposit / Direct Transfer Resolution

**Problem Description:** The CSV contains ambiguous language (`Aisha deposit $500`) or exactly one counterparty, which blurs the line between a shared expense and a direct settlement.

**Detection Logic:**
- If the row is *not* explicitly a settlement, the engine scans the description for configurable transfer keywords (`deposit`, `wallet transfer`, `advance`).
- It parses the `split_details`. If `count == 1`, confidence increases.
- Fires `direct_transfer` with calculated confidence (e.g. 92%).

**User Resolution:**
- `shared_expense`: Injects `_allow_shared_expense: true`. The row safely bypasses detection and distributes the $500 as an expense.
- `direct_transfer`: Injects `{ is_settlement: 'true' }`. The engine's *existing* settlement logic native captures it, applies rigorous validation, and skips split creation.

---

### 3.12 Ambiguous Date Resolution

**Problem Description:** `04-05-2026`. Is this April 5th, or May 4th?

**Detection Logic:** 
- Uses `date-fns` to parse the string using multiple formats (`dd-MM-yyyy`, `MM-dd-yyyy`).
- If multiple formats yield valid, distinct dates, it halts with `ambiguous_date`.

**User Resolution:**
- User selects the precise visual representation (e.g. `April 5, 2026`). 
- Interceptor writes the ISO string back into the raw payload.

---

### 3.13 Post-Exit Member Billed

**Problem Description:** A participant officially left the flat on `March 10th`, but the CSV bills them for an expense on `March 25th`.

**Detection Logic:**
- Extracts participants from `split_details`.
- Compares `expenseDate > member.left_at`.

**User Resolution:**
- `remove_member`: Dynamically edits the raw `split_with` string (`"Aisha;Rohan"` -> `"Aisha"`). The validator natively recalculates the remaining equal shares.
- `keep_member`: Injects a bypass flag to forcefully bill them.
- `replace_member`: Regex swaps the old member for a new user.

---

### 3.14 Mid-Month Joiner Pro-Rata

**Problem Description:** Sam joined on `April 10th`. The CSV bills for a shared April Electricity bill on `April 12th`.

**Why it is dangerous:** Automatically prorating Sam assumes the flat's billing policy. Some groups charge full months regardless of join dates; others prorate to the exact day.

**Detection Logic:**
- Compares `expenseDate > member.joined_at` within the exact same month/year boundaries.

**User Resolution:**
- `prorated`: User supplies the `billingPeriodStart` and `billingPeriodEnd`.
- **Backend Zero-Sum Execution:** The validator natively converts the split to percentages, calculates `activeDays / totalDays`, reduces Sam's share mathematically, and perfectly distributes the exact `diff` equally among all non-joiners, guaranteeing absolute zero-sum equality to the final penny.

---

### 3.15 Percentage Split (Overflow/Underflow)

**Problem Description:** User provides `Aisha: 30%, Rohan: 40%`. The sum is 70%.

**Detection Logic:** 
- `Big(total).notEqualTo(100)` in step 7.

**Resolution:** 
- Halts import and forces a manual edit of the percentages. No automatic redistribution is ever applied to explicit percentages.

---

### 3.16 Conflicting Split Definition

**Problem Description:** The user declares `split_type: equal` but provides `split_details: Aisha:30%; Rohan:70%`.

**Why it is dangerous:** Which intent do we trust? The declared type (Equal = 50/50), or the declared details (30/70)?

**Detection Logic:** 
- Scans `split_details` for structural markers (`:` and `%`). 
- Halts if values exist for `equal`, or if values are missing for `percentage/share/unequal`.

**User Resolution:**
- `change_split_type`: User clicks "Change to Percentage". Backend injects `split_type: 'percentage'`. Engine natively evaluates the `%` signs successfully.
- `keep_declared_type`: User forces it to remain Equal. Engine bypasses the conflict detector. The native validation logic safely processes the row (or crashes gracefully if structural data is critically missing).

---

## 4. Validation Pipeline Architecture

The journey of a single CSV row strictly adheres to a one-way deterministic flow.

> [!NOTE]
> **Why do we use an Interceptor Pattern in `commitData`?**
> In earlier iterations, resolutions were applied *after* validation. This was a critical architectural flaw because it bypassed the complex mathematical calculations required for split ratios. By intercepting user decisions, mutating the raw input, and **feeding it back into the top of the validation engine**, we guarantee that all complex math, zero-sum adjustments, and secondary anomalies are flawlessly executed.

\`\`\`mermaid
graph TD
    A[Raw CSV Upload] --> B(processCSV)
    B --> C{createRowValidator}
    C --> D[Normalize Strings & IDs]
    D --> E[Temporal Bounds Check]
    E --> F[Conflict / Ambiguity Detection]
    F --> G[Big.js Mathematical Split Parsing]
    
    G --> H{Anomalies Found?}
    H -- Yes --> I[Return 'needs_resolution']
    I --> J[Frontend UI Interaction]
    J --> K(commitData Payload)
    K --> L[Map Choice to Raw string/flag]
    L --> C
    
    H -- No --> M[Return 'ok']
    M --> N(commitData DB Insert)
    N --> O[Sequelize BEGIN TRANSACTION]
    O --> P[Insert Expenses & Splits]
    P --> Q[COMMIT]
\`\`\`

---

## 5. Precision Strategy (Big.js)

### 5.1 The Floating-Point Problem
In JavaScript, `0.1 + 0.2 === 0.30000000000000004`. If an expense sharing app uses native JS `Number` types, dividing a $10.00 bill among 3 people yields `$3.3333...`. Storing this in a database and subsequently multiplying/summing it over a thousand rows will result in systemic ledger drift (missing or generating phantom pennies).

### 5.2 Implementation
The importer strictly wraps every monetary value, percentage, and ratio in `Big()` from the `big.js` library.

### 5.3 Zero-Sum Allocation (The Last-Member Adjustment)
When dividing an indivisible amount (e.g. `$10.00` among 3 people), someone must pay the extra penny.
- **Algorithm:** The engine calculates the precise allocation for `N-1` members and rounds to 2 decimal places using standard mathematical rounding. It continuously subtracts these values from the `totalAmount`.
- **The Final Member:** The last member does not receive a mathematically multiplied share. They receive exactly `totalAmount - sumOfPreviousShares`. This enforces absolute zero-sum integrity down to the cent.

---

## 6. Transaction Safety

Database persistence is the most critical phase. The engine utilizes Sequelize ORM `Managed Transactions`.

- **Atomicity:** The `commitData` function wraps the entire bulk insertion inside a `t = await sequelize.transaction()`.
- **Partial Failure Prevention:** If Row #99 fails a strict database constraint (e.g., zero-sum validation fails on an unequal split), an exception is thrown.
- **Rollback:** The `catch` block explicitly calls `await t.rollback()`. Rows 1 through 98 are instantly reverted. No orphaned `ExpenseSplits` are left floating in the database.

---

## 7. Engineering Decisions (Q&A)

**Q: Why don't you automatically fix typos with Levenshtein distances < 2?**
A: Because 'John' and 'Joan' have a distance of 2, but are completely different human beings. Assuming they are the same person assigns real financial debt to the wrong user.

**Q: Why do you preserve duplicate rows if the user forces it?**
A: Because real-life identical transactions happen (e.g., swiping a metro card twice in 5 minutes). Blocking the user from importing legitimate data causes extreme frustration.

**Q: Why is currency never assumed?**
A: If a user went to London and uploads a CSV in GBP, but the system assumes USD, the system permanently records their debt at nearly half its actual economic value.

---

## 8. Summary

This CSV Importer represents a true production-grade financial ingestion engine. It replaces error-prone "best guess" automations with a rigid, deterministic, interactive validation pipeline. 

By isolating mathematical operations via `Big.js`, enforcing strict database atomicity via Sequelize, and implementing a revolutionary `corrections` feedback loop that organically respects temporal edge cases (post-exit members, mid-month joiners, conflicting splits), the system guarantees absolute data integrity, auditability, and user sovereignty over their financial data.
