# 💻 Live Coding Modifications Guide (Copy-Paste Ready)

During your 45-minute live session, the evaluators will test your ownership of the codebase by saying:
> *"We want you to modify a feature live right now. Share your screen and let's implement X."*

This guide gives you pre-solved, exact step-by-step instructions for the **3 most likely live modification challenges**. Keep this file open on a second screen or tab during your interview!

---

## 🟢 Challenge A: Change the Rounding Rule

**Interviewer Prompt:** *"Right now you are using Banker's Rounding (Round-Half-Even). Can you change the app live to use Standard Round-Up (Round-Half-Up) or Round-Down, and explain the mathematical impact?"*

### 🛠️ Step-by-Step Live Implementation

1. **Open `backend/controllers/settlementController.js`**
2. Locate line 3 at the very top of the file:
   ```javascript
   // EXISTING CODE:
   const Big = require('big.js');
   Big.RM = 2; // Banker's Rounding (Half-Even)
   ```
3. **Change line 3** to your desired rounding mode:
   ```javascript
   // TO CHANGE TO STANDARD ROUND-UP (Round-Half-Up):
   Big.RM = 1; // Round-Half-Up (standard 0.5 rounds up)

   // OR TO CHANGE TO ROUND-DOWN (Round-Towards-Zero):
   Big.RM = 0; // Round-Down
   ```
4. **Open `backend/controllers/csvSanitizer.js`**
5. Locate line 4 at the top of the file:
   ```javascript
   // EXISTING CODE:
   const Big = require('big.js');
   Big.RM = 2; // Banker's Rounding (Half-Even)
   ```
6. **Change line 4** to match the exact same mode (`Big.RM = 1;` or `Big.RM = 0;`).
7. Also search `csvSanitizer.js` for any explicit `Big.roundHalfUp` calls (e.g., lines 94 and 152) and replace them:
   ```javascript
   // Change from:
   amountBig = Big(cleanAmountStr).round(2, Big.roundHalfUp);
   // To use the global RM setting:
   amountBig = Big(cleanAmountStr).round(2, Big.RM);
   ```

### 🗣️ How to Explain What You Just Did to the Interviewer
> *"I updated the global rounding mode property `Big.RM` across both our calculation controllers. In `Big.js`, setting `RM = 1` enables standard Round-Half-Up. While standard rounding is intuitive for everyday math, I originally chose Banker's Rounding (`RM = 2`) because Round-Half-Up introduces a systematic statistical upward bias over thousands of financial transactions. Changing it here alters how sub-cent half-pennies are truncated during division."*

---

## 🟢 Challenge B: Add a New Split Type (`exact` / Itemized Dollar Amounts)

**Interviewer Prompt:** *"Right now your app supports `equal`, `percentage`, `share`, and `unequal` splits. Can you add support for a new split type called `exact`, where the CSV or API passes exact itemized dollar amounts per person (e.g., `Aisha: 1200, Rohan: 300`), and validate that the sum equals the total amount?"*

### 🛠️ Step-by-Step Live Implementation

1. **Open `backend/controllers/csvSanitizer.js`**
2. Locate the split parsing logic around **line 171** (where `split_type === 'percentage'` is checked).
3. Right below the percentage parsing block, **add this new `else if` block** to handle `'exact'`:

   ```javascript
   // Add this new block around line 220:
   else if (row.split_type === 'exact' && row.split_details) {
       const parts = row.split_details.split(',').map(s => s.split(':'));
       let totalExact = Big(0);
       let details = {};
       let invalidFormat = false;

       parts.forEach(([name, amt]) => {
           const nName = normalizeName(name, ACTIVE_MEMBERS);
           if (!amt) {
               invalidFormat = true;
               details[nName] = Big(0);
               return;
           }
           try {
               const val = Big(amt.trim().replace(/[^0-9.-]/g, ''));
               totalExact = totalExact.plus(val);
               details[nName] = val;
           } catch (e) {
               invalidFormat = true;
               details[nName] = Big(0);
           }
       });

       if (invalidFormat) {
           errors.push('Invalid split_details format for exact split. Expected "Name:Amount, Name:Amount"');
       } else if (!totalExact.eq(amountBig)) {
           warnings.push(`Exact split amounts sum to ${totalExact.toString()} but total expense is ${amountBig.toString()}. Discrepancy detected.`);
       }

       let parsedDet = {};
       for (let k in details) parsedDet[k] = details[k].toNumber();
       parsedRow.parsed_split_details = parsedDet;
       parsedRow.raw_split_details = parsedDet;
       parsedRow.split_type = 'exact';
   }
   ```
4. Now locate the split calculation loop in `commitData` around **line 519**:
   ```javascript
   // EXISTING CODE:
   if (d.parsed_split_details && d.split_type === 'percentage') {
        actualShareBig = baseAmountBig.times(d.parsed_split_details[member] || 0).div(100).round(4);
   } else {
        actualShareBig = baseAmountBig.div(validSplitMembers.length).round(4);
   }
   ```
5. **Update it to handle `exact` splits**:
   ```javascript
   if (d.parsed_split_details && d.split_type === 'percentage') {
        actualShareBig = baseAmountBig.times(d.parsed_split_details[member] || 0).div(100).round(4);
   } else if (d.parsed_split_details && (d.split_type === 'exact' || d.split_type === 'unequal')) {
        // Direct itemized assignment:
        actualShareBig = Big(d.parsed_split_details[member] || 0).round(4);
   } else {
        actualShareBig = baseAmountBig.div(validSplitMembers.length).round(4);
   }
   ```

### 🗣️ How to Explain What You Just Did
> *"I added a new parsing handler for the `exact` split type in our CSV sanitizer stream. It splits the string by comma and colon, normalizes user names using our Levenshtein typo matcher, and verifies that the sum of itemized amounts exactly equals the total invoice amount. If there is a mismatch, it pushes an interactive warning to the UI rather than crashing. Finally, I updated `commitData` to map exact itemized values directly into `ExpenseSplit` records."*

---

## 🟢 Challenge C: Add a Dynamic Currency Conversion Fee (e.g., +2% Forex Markup)

**Interviewer Prompt:** *"When Priya logged USD expenses on the Goa trip, your app converted them at a flat exchange rate. Can you modify the engine live so that any foreign currency import adds an automatic 2% bank conversion fee to the base INR amount?"*

### 🛠️ Step-by-Step Live Implementation

1. **Open `backend/controllers/csvSanitizer.js`**
2. Locate the currency conversion block around **line 148**:
   ```javascript
   // EXISTING CODE:
   if (currency !== 'INR') {
       if (EXCHANGE_RATES[currency]) {
           exchangeRate = EXCHANGE_RATES[currency];
           parsedRow.base_amount = Big(parsedRow.amount).times(exchangeRate).round(2, Big.roundHalfUp).toNumber();
           warnings.push(`Foreign currency ${currency} converted to INR at rate ${exchangeRate}. Displaying as INR.`);
       }
       ...
   }
   ```
3. **Modify the calculation to multiply by `1.02` (adding 2% markup)**:
   ```javascript
   if (currency !== 'INR') {
       if (EXCHANGE_RATES[currency]) {
           exchangeRate = EXCHANGE_RATES[currency];
           
           // Apply 2% Bank Forex Markup Fee:
           const rawConverted = Big(parsedRow.amount).times(exchangeRate);
           const withForexFee = rawConverted.times(1.02).round(2, Big.RM);
           
           parsedRow.base_amount = withForexFee.toNumber();
           
           const feeAmount = withForexFee.minus(rawConverted).round(2, Big.RM).toString();
           warnings.push(`Foreign currency ${currency} converted to INR at rate ${exchangeRate} with a 2% Bank Forex fee (+₹${feeAmount}). Total INR: ₹${parsedRow.base_amount}.`);
       } else {
           parsedRow.base_amount = parsedRow.amount;
       }
   }
   ```

### 🗣️ How to Explain What You Just Did
> *"I updated the currency exchange interceptor in `csvSanitizer.js`. When a non-INR currency is detected, after multiplying by the base exchange rate, I chain `.times(1.02)` using `Big.js` to calculate a 2% foreign transaction fee. I also calculate the exact dollar-to-rupee fee discrepancy and append it to our warning metadata array so that Rohan can see exactly why the final INR number increased, maintaining our 'no magic numbers' audit trail promise."*
