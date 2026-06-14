# AI Usage & Diagnostic Disclosure

This file serves as absolute transparency regarding the usage of Artificial Intelligence in the generation, debugging, and deployment of the FairShare SaaS platform.

## AI Engines Utilized
- **Primary Architect:** Google DeepMind Advanced Agentic Coding (Antigravity System)
- **Role Designation:** Principal Full-Stack Engineer and Elite UI/UX Designer.

## Master Prompt Sequences
1. *"Act as a Senior Backend Architect... We need to implement a critical compliance feature in our PERN stack Shared Expenses App: 'Pro-Rata Temporal Split Validation with Manual Override Interface.'"*
2. *"Act as a Principal Full-Stack Engineer... implement a comprehensive, fully interactive CSV Ingestion & Sanitization Pipeline... feature a highly attractive, ultra-modern Glassmorphic Dark Theme."*

## Diagnostics: 3 Explicit Flaw/Patch Cycles

### 1. The Temporal Boundary "First Pass" Flaw
- **Initial AI Action:** The AI attempted to be highly autonomous by dynamically deducing when users joined or left the group entirely from the CSV rows (using the `min_date` and `max_date` of explicit mentions in a "First Pass").
- **How it was caught:** The AI realized that users who rely implicitly on `equal` splits (and never explicitly pay for an item) would have truncated date boundaries. This resulted in the system generating massive amounts of false anomalies, locking users out of legitimate splits.
- **Structural Patch:** The AI immediately deleted the "First Pass" dynamic inference block. It restored strict database synchronization utilizing `MOCK_MEMBER_DATES` to mirror the actual PostgreSQL `Group_Members` state, guaranteeing accurate temporal boundaries.

### 2. JavaScript Floating-Point Decimal Leak
- **Initial AI Action:** When parsing custom percentage splits (e.g., `Aisha: 33.3%, Rohan: 33.3%, Meera: 33.3%`), the AI used standard JavaScript `parseFloat` to compute the allocation sums against 100%.
- **How it was caught:** $1000 multiplied by 33.333% generated cascading sub-cent anomalies due to IEEE 754 precision issues natively inherent to JavaScript (`0.1 + 0.2`).
- **Structural Patch:** The AI imported the `big.js` dependency to enforce exact decimal math. Furthermore, the `handleUpdateSplitPercentage` function was patched to implement a proportional normalization algorithm: `parseFloat(((newRaw[k] / total) * 100).toFixed(2))` preventing ledger leakage.

### 3. Asynchronous Node.js Stream Leak
- **Initial AI Action:** The AI implemented `fast-csv` stream parsing without properly waiting for the `on('end')` event before sending the Express HTTP response.
- **How it was caught:** Small CSV files executed fine, but larger files caused unpredictable race conditions where the response fired with a half-empty `results` array.
- **Structural Patch:** The AI wrapped the stream lifecycle inside the asynchronous Express handler, structurally locking the `res.json()` payload to strictly fire only *after* the `on('end')` block had completely swept the 12-Anomaly matrix over the populated array.
