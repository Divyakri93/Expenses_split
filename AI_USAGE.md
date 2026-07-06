# AI_USAGE.md: AI Collaboration & Engineering Transparency Log

This document provides complete disclosure of how Generative AI tools were used during the engineering of FairShare. It documents the AI's role, specific prompts used, and — critically — **three concrete cases where the AI produced incorrect or incomplete code** that required manual engineering intervention.

---

## 1. AI Tools Used

| Tool | Role |
|---|---|
| **Google DeepMind Antigravity (Advanced Agentic Coding)** | Principal AI collaborator — architecture, backend logic, UI components |
| **Claude / GPT-4o** | Used for initial scaffolding and documentation drafts |

**Core Mandate Given to AI:**
Generate a production-grade full-stack expense splitting application with:
- Interactive CSV anomaly detection (13 categories)
- O(n) duplicate detection with confidence scoring
- Levenshtein-based "Did you mean?" typo correction
- Guest entity system with promotion path
- Temporal pro-rata split engine
- Big.js financial arithmetic
- Glassmorphic React UI

---

## 2. What the AI Did Well

- Generated the Sequelize model schema with correct associations
- Built the initial Levenshtein implementation
- Scaffolded the Glassmorphic React wizard UI
- Implemented the `calculateConfidence()` scoring logic
- Generated `normalizeDescription()` helper
- Built the temporal anomaly detection classification system

---

## 3. Concrete Cases of AI Failures & Engineering Fixes

### Case 1: Binary Floating-Point Arithmetic Drift (Ledger Imbalance)

**AI-Generated Code (Bug):**
```javascript
// Unsafe for financial applications
let splitAmount = totalAmount / activeMembersCount;
userBalances[member] += splitAmount;
```

**How It Was Caught:**
During a trial import of the "Cylinder Refill" entry (₹899.995), running a ledger equilibrium check:
```sql
SELECT SUM(calculated_share_amount) FROM expense_splits WHERE expense_id = X;
```
Returned `899.9949999999999` instead of `900.00` — an inflationary leak of `0.000000000000004` due to IEEE 754 binary fraction errors.

**The Fix:**
```javascript
const Big = require('big.js');
Big.RM = 2; // Banker's Rounding (Half-Even)
const exactShare = Big(totalAmount).div(activeMembersCount).round(4);
// Zero-sum: last member absorbs remaining fraction
if (i === members.length - 1) {
    actualShare = Big(baseAmount).minus(totalAllocated).round(4);
}
```
Banned all native JS arithmetic in financial paths.

---

### Case 2: Duplicate Detection Was Only Batch-Level (DB Not Checked)

**AI-Generated Code (Bug):**
```javascript
// Only checked against rows in THIS upload
for (let prev of processedRows) {
    if (prev.data.date === parsedRow.date && prev.data.paid_by === parsedRow.paid_by
        && prev.data.amount === parsedRow.amount) {
        if (levenshtein(prev.data.description, row.description) <= 3) {
            isDuplicate = true;
        }
    }
}
```

**How It Was Caught:**
The original import of "Pizza ₹500 Aisha 2026-07-01" was already in the database. Re-uploading the same CSV imported it again — creating a duplicate expense with no warning.

**What Was Missing:**
1. No DB lookup — only compared within the current CSV batch
2. O(n²) complexity — would hang on 5000-row files
3. No currency comparison — $10 and ₹10 treated as duplicates
4. No split member comparison — Aisha/Rohan and Aisha/Priya treated as duplicates

**The Fix:**
Complete rewrite to O(n) architecture:
```javascript
// 1. Build O(1) DB lookup map at parse start
const dbMap = new Map(); // "date_amount_payerId_currency" → [expense]

// 2. Build O(1) batch map
const processedMap = new Map();

// 3. Per-row check: O(1) not O(n)
const batchKey = `${date}_${amount}_${payer}_${currency}`;
if (processedMap.has(batchKey)) {
    const conf = calculateConfidence(current, prev);
    // Also compare split members exactly
    const sameSplits = /* Set equality check */;
    if (conf > 0 && sameSplits) warnings.push(`⚠️ Duplicate (Confidence: ${conf}%)`);
}
```

---

### Case 3: Typo Names Were Silently Merged (Data Corruption Risk)

**AI-Generated Code (Bug):**
```javascript
// AI used fuzzy matching to auto-correct names silently
const normalizeName = (name, members) => {
    const match = members.find(m => levenshtein(m, name.toLowerCase()) <= 2);
    return match || name; // Auto-corrects without user knowledge
};
```

**How It Was Caught:**
Testing with a CSV where "Dev" (an unregistered visitor) was silently remapped to "Deva" (a registered user). Dev's expenses were incorrectly attributed to Deva's balance — corrupting the ledger without any warning.

**Why It's Dangerous:**
`levenshtein("dev", "deva") = 1` → auto-remapped.
But "Dev" could be a different person entirely.

**The Fix:**
Separated detection from resolution. The backend **never auto-corrects** — it only suggests:
```javascript
const findFuzzyMatch = (name) => {
    // Find closest match with distance <= 2
    return bestMatch ? { suggested: bestMatch, distance: bestDist } : null;
};

// Typo candidates → typo_suggestions[] (NOT auto-corrected)
// Unknown names → unknown_members[] (no fuzzy match found)
```
The frontend shows an **interactive "Did you mean?" popup** with 3 explicit choices. The user decides — the AI never does.

---

## 4. Prompting Strategy & Iteration

### Iterative Refinement Approach

Rather than one-shot prompts, features were developed through multiple refinement rounds:

**Round 1:** "Implement duplicate detection for CSV import"
→ AI produced batch-only O(n²) loop

**Round 2:** "Check duplicates against the database, include split members and currency in comparison"
→ AI added DB query but missed split member comparison

**Round 3:** "Use O(n) hash map, compare split members as a Set, add confidence scoring 100/90/70"
→ Final correct implementation achieved

### Key Lesson
AI excels at scaffolding and structure, but **domain-specific correctness** (financial arithmetic, data integrity constraints, UX safety) required explicit, iterative human direction and verification against real test cases.

---

## 5. What Was Manually Engineered

The following decisions were made by the developer, not the AI:

| Feature | Human Decision |
|---|---|
| **"Did you mean?" 3-way popup** | AI auto-corrected silently — human chose interactive flow |
| **Split member comparison in duplicate check** | AI's first version didn't compare splits |
| **Guest entity vs. User flag** | AI suggested `is_guest` flag — human designed separate entity |
| **Zero-sum rounding protocol** | AI left rounding errors — human added last-member absorption |
| **Confidence tiers (100/90/70)** | Human defined business logic; AI implemented it |
| **Typo ≠ Unknown** | Human decision to separate these into different arrays |
| **DB pre-scan at processCSV startup** | Human identified gap in AI's batch-only approach |
