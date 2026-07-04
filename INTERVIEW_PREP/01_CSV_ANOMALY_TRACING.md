# 🕵️ CSV Anomaly Tracing Guide: The 12+ Problems in `expenses_export.csv`

During your 45-minute live interview, the evaluators will pick specific rows from `expenses_export.csv` and ask:
> *"Trace, in your code, exactly what happens to this row when uploaded."*

This document maps all **34 rows** of the dataset directly to your backend ingestion engine ([csvSanitizer.js](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js)) and frontend validation UI ([CSVProcessingWizard.jsx](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/frontend/src/components/CSVProcessingWizard.jsx)).

---

## 🏗️ The 3-Step Execution Flow for Every Row

When a user uploads `expenses_export.csv`:
1. **Stream Ingestion ([csvSanitizer.js:L67-71](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L67-L71)):** Multer buffers the file in memory (`req.file.buffer`). We convert it to a Node readable stream (`Readable.from(...)`) and pipe it into `fast-csv` to prevent memory blocking.
2. **Policy Evaluation ([csvSanitizer.js:L73-401](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L73-L401)):** Each row is evaluated against 12 anomaly detection rules. Errors (`status: 'error'`) halt insertion; warnings (`status: 'warning'`) flag the row for user review.
3. **Interactive Validation ([CSVProcessingWizard.jsx](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/frontend/src/components/CSVProcessingWizard.jsx)):** In compliance with **Meera's request** (*"approve anything the app deletes or changes"*), the app NEVER silently drops or guesses data. The user must review the **CSV Changes Log** tab and toggle approvals before `commitData` writes to PostgreSQL/SQLite.

---

## 📋 Row-by-Row Anomaly Trace Table

| # | CSV Date | Description | Paid By | Amount | Cur. | Split Type | Split Details | Anomaly Detected | Exact Code Intercept & Policy Action |
| :-: | :-: | :--- | :--- | :-: | :-: | :--- | :--- | :--- | :--- |
| 1 | `01-02-2026` | February rent | Aisha | 48000 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Standard equal split. `amountBig` parsed via Banker's Rounding ([L94](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L94)). |
| 2 | `03-02-2026` | Groceries BigBasket | Priya | 2340 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Clean transaction. Allocated equally among 4 active members. |
| 3 | `05-02-2026` | Wifi bill Feb | Rohan | 1199 | INR | equal | Aisha;Rohan;Priya;Meera | **Precision Sub-Cent Fraction** | $1199 \div 4 = 299.75$. Zero-sum rounding loop ([L526-528](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L526-L528)) assigns exact shares without penny leakage. |
| 4 | `08-02-2026` | Dinner at Marina Bites | Dev | 3200 | INR | equal | Aisha;Rohan;Priya;Dev | **Guest Member / Non-Flatmate** | Dev is visiting. The system allows non-permanent members in `split_details` during `commitData` ([L498](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L498)). |
| 5 | `08-02-2026` | dinner - marina bites | Dev | 3200 | INR | equal | Aisha;Rohan;Priya;Dev | **Duplicate Entry (Problem #1)** | Loop checks previous rows ([L222-234](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L222-L234)). Same date, payer, amount + Levenshtein distance of description $\le 3$. Flagged as warning: *"Possible duplicate of row 4"*. |
| 6 | `10-02-2026` | Electricity Feb | Aisha | 1,200 | INR | equal | Aisha;Rohan;Priya;Meera | **Comma Formatting in Number (Problem #2)** | String `'1,200'` contains comma. Regex `.replace(/[^0-9.-]/g, '')` ([L91](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L91)) strips commas cleanly to `1200.00`. |
| 7 | `12-02-2026` | Maid salary Feb | Meera | 3000 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Standard equal split. |
| 8 | `14-02-2026` | Movie night snacks | priya | 640 | INR | equal | Aisha;Rohan;Priya | **Typo in Name / Lowercase (Problem #4)** | `'priya'` normalized via custom Levenshtein algorithm ([L45-59](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L45-L59)). Matches `'Priya'` (distance 0 case-insensitive). Meera skipped correctly. |
| 9 | `15-02-2026` | Cylinder refill | Rohan | 899.995 | INR | equal | Aisha;Rohan;Priya;Meera | **Precision Imbalance / 3 Decimals (Problem #3)** | `Big('899.995').round(2, Big.roundHalfUp)` ([L94](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L94)) rounds to `900.00`. |
| 10 | `18-02-2026` | Groceries DMart | Priya S | 1875 | INR | equal | Aisha;Rohan;Priya;Meera | **Name Typo / Variant (Problem #4)** | `'Priya S'` matched against `ACTIVE_MEMBERS` via Levenshtein distance $\le 2$ ([L53](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L53)). Auto-corrected to `'Priya'`. |
| 11 | `20-02-2026` | Aisha birthday cake | Rohan | 1500 | INR | unequal | Rohan;Priya;Meera | **Unequal / Itemized Split (Problem #12)** | `split_details` has itemized shares (`700; 400; 400`). Handled during split parsing; Aisha is omitted as birthday celebrant. |
| 12 | `22-02-2026` | House cleaning supplies | *(blank)* | 780 | INR | equal | Aisha;Rohan;Priya;Meera | **Missing Obligatory Value: `paid_by` (Problem #5)** | `if (!row.paid_by) errors.push('Missing paid_by')` ([L80](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L80)). Status set to `'error'`. UI prompts user to assign payer before committing. |
| 13 | `25-02-2026` | Rohan paid Aisha back | Rohan | 5000 | INR | *(blank)* | Aisha | **Settlement Logged as Expense (Problem #6)** | Keyword check ([L109-115](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L109-L115)) detects `'paid back'`. Sets `is_settlement = true`. In business logic, this credits Aisha and debits Rohan without treating it as shared consumption! |
| 14 | `28-02-2026` | Pizza Friday | Aisha | 1440 | INR | percentage | Aisha 30%;...Meera 20% | **Percentage Breakdown Check (Problem #7)** | Sums percentages ([L171-200](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L171-L200)). Here $30+30+30+20 = 110\%$. System flags warning: *"Percentages sum to 110%. Normalized to 100%."* |
| 15 | `01-03-2026` | March rent | Aisha | 48000 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Standard equal split. |
| 16 | `03-03-2026` | Groceries BigBasket | Meera | 2810 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Clean row logged by Meera. |
| 17 | `05-03-2026` | Wifi bill Mar | Rohan | 1199 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Standard equal split. |
| 18 | `08-03-2026` | Goa flights | Aisha | 32400 | INR | equal | Aisha;Rohan;Priya;Dev | **Trip Start / Custom Split** | Trip members (`Dev` included). Handled cleanly. |
| 19 | `09-03-2026` | Goa villa booking | Dev | 540 | **USD** | equal | Aisha;Rohan;Priya;Dev | **Foreign Currency Interception (Problem #9)** | Fulfills **Priya's request**! Detects `USD` ([L149-161](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L149-L161)). Multiplies $540 \times 95.11$ (`EXCHANGE_RATES['USD']`) to store `base_amount = 51359.40 INR`. |
| 20 | `10-03-2026` | Beach shack lunch | Rohan | 84 | **USD** | equal | Aisha;Rohan;Priya;Dev | **Foreign Currency Interception (Problem #9)** | Multiplies $84 \times 95.11 = 7989.24$ INR. Adds warning badge explaining rate conversion. |
| 21 | `10-03-2026` | Scooter rentals | Priya | 3600 | INR | **share** | Aisha 1; Rohan 2;... | **Share Ratio Split (Problem #12)** | Parses ratios ($1+2+1+2 = 6$ shares). Computes Rohan/Dev pay $\frac{2}{6}$ ($₹1,200$), Aisha/Priya pay $\frac{1}{6}$ ($₹600$). |
| 22 | `11-03-2026` | Parasailing | Dev | 150 | **USD** | equal | ...Dev's friend Kabir | **External Guest in Split** | Kabir is dynamically added to `uniqueNames` during commit ([L421](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L421)) and provisioned as a temporary guest member. |
| 23 | `11-03-2026` | Dinner at Thalassa | Aisha | 2400 | INR | equal | Aisha;Rohan;Priya;Dev | **Conflicting Duplicate (Problem #1)** | Row 23 (Aisha logs ₹2,400) and Row 24 (Rohan logs ₹2,450). Both are preserved with warnings so flatmates can approve the correct one in UI! |
| 24 | `11-03-2026` | Thalassa dinner | Rohan | 2450 | INR | equal | Aisha;Rohan;Priya;Dev | **Conflicting Duplicate (Problem #1)** | Flagged against Row 23. Why not auto-delete? Because amounts differ! Automatic deletion would violate Meera's rule. |
| 25 | `12-03-2026` | Parasailing refund | Dev | **-30** | USD | equal | Aisha;Rohan;Priya;Dev | **Negative Amount / Refund (Problem #10)** | `amountBig.lt(0)` ([L102-106](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L102-L106)). Converts to positive $+30$ USD ($\times 95.11 = ₹2,853.30$). Sets `is_refund = true`, reversing roles (Dev receives credit from split members). |
| 26 | `Mar-14` | Airport cab | rohan | 1100 | INR | equal | Aisha;Rohan;Priya;Dev | **Non-Standard Date Format (Problem #8)** | String `'Mar-14'` fails ISO parse. Custom date fallback ([L118-142](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L118-L142)) infers year 2026 and standardizes to `2026-03-14`. |
| 27 | `15-03-2026` | Groceries DMart | Priya | 2105 | *(blank)* | equal | Aisha;Rohan;Priya;Meera | **Missing Currency (Problem #5)** | `if (!currency) errors.push('Missing currency')` ([L145-147](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L145-L147)). Defaults to `INR` with user warning. |
| 28 | `18-03-2026` | Electricity Mar | Aisha | 1450 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Standard equal split. |
| 29 | `20-03-2026` | Maid salary Mar | Meera | 3000 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Standard equal split. |
| 30 | `22-03-2026` | Dinner order Swiggy | Priya | **0** | INR | equal | Aisha;Rohan;Priya;Meera | **Zero Amount / Ghost Entry (Problem #10)** | Amount evaluated to `0.00`. Flagged with warning: *"Zero amount expense detected. Has no ledger impact."* |
| 31 | `25-03-2026` | Weekend brunch | Meera | 2200 | INR | percentage | Aisha 30%;...Meera 20% | None (Clean Percentage) | Percentages sum to exactly 100%. |
| 32 | `28-03-2026` | Meera farewell dinner| Aisha | 4800 | INR | equal | Aisha;Rohan;Priya;Meera | None (Clean Row) | Meera's final dinner before moving out on Sunday (Mar 31). |
| 33 | `04-05-2026` | Deep cleaning service | Rohan | 2500 | INR | equal | Aisha;Rohan;Priya | **Ambiguous Date / DD-MM vs MM-DD (Problem #8)** | Is it April 5 (`04-05`) or May 4 (`04-05`)? Parser evaluates DD/MM/YYYY vs MM/DD/YYYY based on context ([L127-141](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L127-L141)). |
| 34 | `01-04-2026` | April rent | Aisha | 48000 | INR | share | Aisha 2; Rohan 1; Priya 1 | **Custom Share / Room Reallocation** | Aisha took Meera's room, so she pays 2 shares ($\frac{2}{4} = ₹24,000$), Rohan and Priya pay 1 share each ($₹12,000$). Handled cleanly! |
| 35 | `02-04-2026` | Groceries BigBasket | Priya | 2640 | INR | equal | Aisha;Rohan;Priya;**Meera** | **Post-Exit Member Billed (Problem #11)** | **Meera left March 31!** Intercepted at [L284-337](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L284-L337). Anomaly engine flags: *"POST_EXIT_MEMBER_BILLED: Meera officially left on March 31"*. Meera's share is stripped and redistributed among the 3 active flatmates! |
| 36 | `05-04-2026` | Wifi bill Apr | Rohan | 1199 | INR | equal | Aisha;Rohan;Priya | None (Clean Row) | Clean 3-way split among active members. |
| 37 | `08-04-2026` | Sam deposit share | Sam | 15000 | INR | equal | Aisha | **Deposit / Direct Transfer** | Sam pays deposit to Aisha. Treated as direct P2P transfer / settlement. |
| 38 | `10-04-2026` | Housewarming drinks | Sam | 3100 | INR | equal | Aisha;Rohan;Priya;Sam | None (Clean Row) | Sam's first shared expense after moving in! |
| 39 | `12-04-2026` | Electricity Apr | Aisha | 1380 | INR | equal | Aisha;Rohan;Priya;**Sam** | **Mid-Month Joiner Pro-Rata (Problem #11)** | Fulfills **Sam's request**! Sam moved in April 8th (active $23/30$ days). Intercepted at [L298-335](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L298-L335). Sam's share is dynamically adjusted to $\frac{23}{30}$ pro-rata, and the unallocated remainder from his 7 inactive days is absorbed by Aisha, Rohan, and Priya! |
| 40 | `15-04-2026` | Groceries DMart | Sam | 1990 | INR | equal | Aisha;Rohan;Priya;Sam | None (Clean Row) | Clean 4-way equal split. |
| 41 | `18-04-2026` | Furniture common room| Aisha | 12000 | INR | **equal** | Aisha 1; Rohan 1...Sam 1 | **Conflicting Split Definition (Problem #12)** | `split_type` says `equal`, but `split_details` provides share ratios! Intercepted at [L164-168](file:///c:/Users/divya/OneDrive/Desktop/Expenses_App/backend/controllers/csvSanitizer.js#L164-L168). System resolves conflict by verifying ratios equal $1:1:1:1$ and defaulting to equal split. |
| 42 | `20-04-2026` | Maid salary Apr | Priya | 3000 | INR | equal | Aisha;Rohan;Priya;Sam | None (Clean Row) | Clean 4-way equal split. |

---

## 🎯 How to Ace the "Pick an Anomaly" Interview Question

If the interviewer asks: *"Show me in your code where you handle Row 39 (Sam's mid-month electricity bill),"* say:

> *"In `backend/controllers/csvSanitizer.js` at lines 284 to 337, my temporal boundary interceptor checks every participating member against `MOCK_MEMBER_DATES`. For Sam, it detects `joined_at: '2026-04-08'`. When evaluating the April 12th electricity bill, it calculates that Sam was only active for 23 out of 30 days in April. At line 309, it applies a pro-rata ratio (`maxRatio = Big(23).div(30)`), capping Sam's liability and distributing the remainder across the full-time flatmates. This directly satisfies Sam's request."*
