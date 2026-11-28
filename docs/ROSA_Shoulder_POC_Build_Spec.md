# ROSA Shoulder Proof of Concept: Build Spec

Status: **approved design, not built.** Written 2026-11-26 for Claude Code to build in this repo.
Design board (source of truth for the picture): https://www.figma.com/board/oUCbDgaH7tPK5hfivKVNkG

Read `CLAUDE.md` first. Every rule there applies (UAT first, dry run then deploy, DEV after Robert approves UAT, PROD only by Robert through Gearset, never commit real data, commit only when asked, describe everything).

---

## Verified in UAT (read-only, 2026-11-27)

- `Robotics_Surgeons__c.Robotics_Surgeon__c` was **master-detail** to `Robotics__c`, with two roll-ups on `Robotics__c` (`Total_Surgeons__c`, `Total_Units__c`). **Robert, 2026-11-26: fine to change the old objects (their records may even be deleted).** So, as the spec designed: the two roll-ups were deleted, `Robotics_Surgeon__c` became an optional lookup (label "ROSA Checklist (old)"), ROSA Surgeons got their own sharing (Public Read/Write) and hang off the deal through `ROSA_Deal__c`. No records were deleted. No old surgeon was linked to a deal, so the backfill had nothing to do.
- The surgeon field already exists: `Robotics_Surgeons__c.Surgeon_Name__c`, Lookup(Account). Reused; no new surgeon field (4.2 closed).
- `Question__c` links to its category through `Event_Category__c` (master-detail). `Answer_Type__c` values: Yes/No, Date, Number, Text. UAT has 6 categories, all APAC Events or ROSA event questions; none is touched.
- `HCFCountry__c` is a formula, `TEXT(Account__r.BillingCountryCode)`: the Primary HCP's two-letter country code (AU, NZ), not a name. The price table's Country uses the same codes.
- Counts in UAT: `Robotics__c` 193, `Robotics_Surgeons__c` 95.
- Active record-triggered flows on `SalesRisks__c` (existing, read only, not changed): `ChinaRosaOpportunityStatusUpdate`, `Sales_Risks_Fast_Field_Update`, `Sales_Risks_PBI_Calculations`, `Sales_Risks_Stage_Change`, `UpdateOpportunityStatus`. None on `Robotics__c` or `Robotics_Surgeons__c`. When F3 moves a stage, these run as they do for a manual stage change.
- Existing ROSA Lightning pages in UAT: `SalesorRisk_ROSA2025`, `Rosa_China`, `ANZGeneralOpportunityROSA`, `RoboticsROSAOpportunity`, `ROSA_Sales_Checklist`, `ROSA_Add_On_Record_Page`. None of them, no existing `SalesRisks__c` layout and no existing permission set is edited. The POC has a new Lightning page `ROSA_Deal_Record_Page` (Dynamic Forms), which Robert activates for the ROSA record types in App Builder.
- `SalesRisks__c` already uses all 5 filtered lookups, so the two case cover user lookups have no lookup filter; a validation rule each keeps them to active internal users.
- Apex in these orgs runs in user mode by default (queries and DML honour field access), so the automation uses `WITH SYSTEM_MODE` / `AccessLevel.SYSTEM_MODE` throughout.

## How it was built (differs from section 8)

The automation F1 to F9 is one Apex class, `ROSAAutomation`, called by six triggers (`ROSA_DealTrigger`, `ROSA_ChecklistTrigger`, `ROSA_SurgeonTrigger`, `ROSA_PriceTrigger`, `ROSA_CredentialingTrigger`, `ROSA_CredentialingAnswerTrigger`), tested by `ROSAAutomationTest` (7 tests covering T1 to T18 where they can be automated). Reason: bulk safety (T18) and one tested place instead of nine flows. The ROSA Checklist is created only for people who hold `ROSA_Deal_Management` (its record type comes from that permission set); others still save the deal, without a checklist. The checklist steps are ticked on the deal page through two quick actions on `Robotics__c` (`ROSA_Deal_Steps`, `ROSA_Implementation_Steps`). `Robotics__c` opens on the new `ROSA_Checklist_Record_Page` (its org default); older Robotics records show their own layout on it. Deploy ids: `docs/ROSA_Shoulder_POC_Build_Log.md`.

## Robert's decisions (2026-11-26)

- (2026-11-27, replaces the "stays typed in" decision below) **ROSA Growth $ is calculated** once a deal has ROSA Deal Surgeons; with none it keeps its typed-in value. Per surgeon and joint, growth cases = ZB cases with ROSA minus current cases where the current supplier is ZB (a competitor now counts as 0; lost cases count negative). Growth $ = growth cases x the joint's average implant price + growth cases x the joint's ROSA disposables price, from `ROSA_Price__c` (items TKA, PKA, THA, TSA/RSA and a Disposable item for each) for the deal's country (facility billing country, else the record type) and currency. Each surgeon shows its Implant, Disposables and total Growth $; the deal adds them up. A price change recalculates the deals.

- (2026-11-27) Old Robotics records (pre-POC checklists and surgeons) are not retrofitted or supported; everything is built for new ROSA deals only.

- (2026-11-27) The credentialing questions are not a precursor to credentialing: a surgeon can be credentialed with questions unanswered. `ROSA_Ready__c` is labelled "All Questions Answered" and the rule that blocked the credentialed date is gone.

- (2026-11-27) A ROSA deal is shared automatically with its ROSA Deal Lead and Sales Rep, both edit for the time being (Robert, 2026-11-27; the rep may go to read later); changing or clearing either field moves or removes the share. Existing deals need `scripts/apex/rosa_share_existing_deals.apex` once per org.

- (2026-11-27) Access stays on permission sets (everything in Salesforce is moving to permission sets). Later, likely a separate sales-rep permission set with read-only or hidden ROSA fields, once the business says which (question in `docs/Pipeline_Team_Questions.md`).

- (2026-11-27) The surgeon-level Implant deal link (`ROSA_Implant_Deal__c`) is removed for now: implant deals link to the ROSA deal through Link to ROSA Deal. Robert's thought for later: an implant deal really belongs to a (potential) ROSA surgeon, so several implant deals on one ROSA deal could be tied to their surgeons.

- (2026-11-27) Labels: `Robotics_Surgeons__c` is **ROSA Deal Surgeon / ROSA Deal Surgeons**; `ROSA_Credentialing_Answer__c` is **ROSA Deal Surgeon Q&A / ROSA Deal Surgeons Q&A**. API names unchanged.

- (2026-11-27) A No answer does not disqualify a surgeon: it is a gap still to close and is expected to become a Yes later. It counts as answered, so it does not block credentialing.

- Prefix `ROSA_` for every new item: decided.
- `ROSAGrowthDollar__c` stays a number people type in. Nothing calculates it and the build does not change it. The disposables revenue total is dropped. `ROSA_Price__c` stays as reference data only.
- Checklist steps 1 to 6 are ticked in order: decided.
- A ROSA full-screen component (an LWC like the Pipeline app) is a likely later phase and out of scope. The objects and fields are built so it can sit on top of them later.

---

## 0. Before you build

### 0.1 Go-ahead

This spec is the design. It is **not** the word "build". Wait for Robert to say "build" before deploying anything, then work through section 12 in order.

### 0.2 Existing metadata this build changes (needs Robert's explicit sign-off, per CLAUDE.md hard rule 1)

Robert approved the design on 2026-11-26. Hard rule 1 still says no existing item changes without his explicit sign-off, so list these back to him and get a "yes" on the list before the first deploy:

| #   | Existing item                                                                                                                                            | Change                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| E1  | `SalesRisks__c.ROSA_Overlord__c`                                                                                                                         | Relabel "ROSA Deal Lead" (API name unchanged)                                                            |
| E2  | `SalesRisks__c`                                                                                                                                          | Add the new fields in section 3 (hard rule 2 says new fields on SalesRisks__c need sign-off)             |
| E4  | `Robotics_Surgeons__c`                                                                                                                                   | Relabel "ROSA Surgeon" / "ROSA Surgeons"; parent changes from `Robotics__c` to the ROSA deal; new fields |
| E5  | `Robotics__c`                                                                                                                                            | Relabel "ROSA Checklist"; new fields and record type                                                     |
| E6  | `Event_Category__c`                                                                                                                                      | Add two picklist fields (section 7)                                                                      |
| E7  | ROSA page layouts and Lightning record pages on `SalesRisks__c`                                                                                          | Rearranged (section 9)                                                                                   |
| E8  | `ROSA_Add_On__c`, `ROSA_Platform_Hip_Stage__c`, `ROSA_Platform_Partial_Knee__c`, `ROSA_Platform_Shoulder_Stage__c`, `Robotics_Key_Buying_Influencers__c` | Taken off ROSA layouts and permission sets. Not deleted in the POC                                       |

### 0.3 Naming

New items carry the **`ROSA_`** prefix (this is a ROSA build, not the Pipeline app). Existing items keep their API names; only labels change. _Assumption: Robert's repo rule names `Pipeline` as the prefix for the Pipeline tool. If he wants `Pipeline_ROSA_` instead, swap it everywhere before the first deploy._

### 0.4 Check against UAT before writing metadata

Retrieve these first and confirm the facts marked **[verify]**:

```
sf project retrieve start -o UAT -m "CustomObject:SalesRisks__c" "CustomObject:Robotics__c" "CustomObject:Robotics_Surgeons__c" "CustomObject:Event_Category__c" "CustomObject:Question__c" "CustomObject:ROSA_Add_On__c" "CustomObject:Robotics_Key_Buying_Influencers__c"
```

Retrieve the ROSA layouts and flexipages too (names from `sf org list metadata -o UAT -m Layout` filtered on `SalesRisks__c-` and ROSA).

### 0.5 Facts already checked (read-only, 2026-11-26)

- ROSA deal = `SalesRisks__c`, ROSA record types. UAT DeveloperNames: `AUROSA`, `NZROSA`, `INROSA`, `THROSA`, `KRROSA`, `SGROSA`, `MYROSA`, `HKROSA`, `TWROSA`, `China_ROSA_Opportunity`, `REGIONALROSA`. PROD counts: AU 222, IN 129, NZ 30.
- `Stage__c` ROSA values: Sales Pipeline, Surgeon Engagement, Executive Presentation, Negotiation, Closed Won, Deal Lost. **Frozen: no renames, no new values** (Power BI depends on them).
- `Healthcare_Facility__c` = hospital (Account). `Account__c` = Primary HCP (surgeon Account). `ROSA_Deal_Type__c` (Capital Sale, Rental, Placement, ROSA-E, ROSA-T). `ROSA_Sales_Type__c` multi-select (Hip, Knee, Shoulder, Brain). `Close_Date__c`, `Install_Date__c`, `HCFCountry__c`, `CurrencyIsoCode`, `Link_To_ROSA_Deal__c` (self lookup: implant deal to ROSA deal).
- `Robotics__c` is a child of `SalesRisks__c` through `Sales_Risks__c` (relationship `Checklist__r`). 193 PROD records, none since May 2021.
- `Robotics_Surgeons__c`: 95 PROD records, parent today is `Robotics__c` through `Robotics_Surgeon__c` **[verify: master-detail or lookup]**.
- `Event_Category__c` → `Question__c` → `Registration_Answer__c` exist in **UAT only** (APAC Events). `Question__c` fields: `Question_Text_2__c`, `Answer_Type__c` (Yes/No, Date, Number, Text), `Display_Order__c`, `Answer_Required__c`, `Active__c`, lookup to category **[verify field name]**. UAT already has a "ROSA TKA Certification Questions" category.
- UAT and PROD differ on `SalesRisks__c` (UAT has `Status__c`, `Total_Annual_Value__c`; PROD has `IsClosed__c`). Don't reference any of these three in ROSA metadata.

### 0.6 PROD release dependency

`Event_Category__c` and `Question__c` are not in PROD. The PROD release (Robert, Gearset) must include the APAC Events question objects first, or this build ships a copy. Flag in the release notes; nothing to do in UAT.

---

## 1. What we're building (plain words)

One ROSA deal record holds the whole sale. Under it: the surgeons involved (with their volumes now and with ROSA), one checklist that moves the stage when steps are ticked, and a credentialing record per surgeon that asks marketing's questions and records who answered. Totals on the deal add themselves up. Prices come from a small table marketing owns. Shoulder is the proof of concept; hip and knee come later by adding question sets, no new build.

```
SalesRisks__c (ROSA deal)
 ├── Robotics__c "ROSA Checklist"          (1 per deal, auto-created)
 ├── Robotics_Surgeons__c "ROSA Surgeons"  (many)
 │     └── ROSA_Credentialing__c           (1 per surgeon per pathway)
 │           └── ROSA_Credentialing_Answer__c (1 per question)
 └── (implant deals) SalesRisks__c.Link_To_ROSA_Deal__c → ROSA deal
ROSA_Price__c                               (marketing; per country per joint)
Event_Category__c → Question__c             (marketing; question bank)
```

---

## 2. Stage mapping (locked)

| Checklist step                         | Phase       | Highest step done sets Stage__c to |
| -------------------------------------- | ----------- | ---------------------------------- |
| 1 Engage surgeon                       | Opportunity | Surgeon Engagement                 |
| 2 Validate with deal lead              | Opportunity | Surgeon Engagement                 |
| 3 Deal summary complete                | Opportunity | Surgeon Engagement                 |
| 4 Commercial assessment and governance | Contract    | Executive Presentation             |
| 5 Proposal and negotiation             | Contract    | Negotiation                        |
| 6 Contract signed                      | Contract    | Closed Won                         |
| 7a Install date communicated           | Implement   | stays Closed Won                   |
| 7b Instruments delivered               | Implement   | stays Closed Won                   |
| 7c Surgeon credentialed                | Implement   | stays Closed Won                   |
| 7d First cases done                    | Implement   | stays Closed Won                   |

New deal with nothing ticked = Sales Pipeline. Rules: stage only moves forward; never changes a Deal Lost deal; a user can still set the stage by hand (the flow doesn't fight them on the next save unless a step is newly ticked).

---

## 3. `SalesRisks__c` (ROSA deal): changes

Add to ROSA record types' layouts only. Help text on every user-facing field. Description on every field.

### 3.1 Relabel

- `ROSA_Overlord__c` → label **ROSA Deal Lead**. Help: "Person running this ROSA deal (State Manager or ROSA team)."

### 3.2 Site background (from the deal summary sheet)

| API name                          | Label                             | Type            | Values / notes                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ROSA_Sales_Rep__c`               | Sales Rep                         | Lookup(User)    | Robert, 2026-11-27: the rep on the SAP partner functions of the cases, not the record owner (which can be the State Manager). Active internal users only (validation rule; the object has no filtered lookups left) |
| `ROSA_Rep_Trained__c`             | Sales Rep ROSA Trained            | Picklist        | Yes, No                                                                                                                                                                                                             |
| `ROSA_Rep_Case_Cover_Suitable__c` | Sales Rep Suitable for Case Cover | Picklist        | Yes, No, Unsure _(assumption: "Unsure" added)_                                                                                                                                                                      |
| `ROSA_Primary_Case_Cover__c`      | Primary case cover                | Lookup(User)    | Filter: active, non-portal users                                                                                                                                                                                    |
| `ROSA_Secondary_Case_Cover__c`    | Secondary case cover              | Lookup(User)    | Same filter                                                                                                                                                                                                         |
| `ROSA_Additional_Support__c`      | Additional case support needed    | Picklist        | Yes, No                                                                                                                                                                                                             |
| `ROSA_Additional_Support_Who__c`  | Who provides additional support   | Text(255)       |                                                                                                                                                                                                                     |
| `ROSA_Trainees__c`                | Trainee surgeons on site          | Number(4,0)     | Generic wording (replaces country-specific registrar terms)                                                                                                                                                         |
| `ROSA_Fellows__c`                 | Fellows on site                   | Number(4,0)     |                                                                                                                                                                                                                     |
| `ROSA_Exposure_Plan__c`           | Exposure plan                     | Long Text(5000) |                                                                                                                                                                                                                     |
| `ROSA_Critical_To_Approval__c`    | Critical to approval              | Long Text(5000) |                                                                                                                                                                                                                     |

### 3.3 Appropriateness (product guide checklist)

| API name                           | Label                        | Type            | Values                                                                                                                                                                          |
| ---------------------------------- | ---------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ROSA_Existing_Unit__c`            | Site already has a ROSA unit | Picklist        | Yes, No                                                                                                                                                                         |
| `ROSA_Unit_Utilisation__c`         | Current ROSA utilisation     | Picklist        | Low, Medium, High, N/A                                                                                                                                                          |
| `ROSA_Additional_Unit_Required__c` | Additional unit required     | Picklist        | Yes, No, N/A                                                                                                                                                                    |
| `ROSA_Competitor_Robotics__c`      | Competitor robotics on site  | Multi-select    | MAKO, Velys, NAVIO/CORI, Mazor, Da Vinci, Other, None _(assumption: list from `Robotics__c.Does_Hospital_Already_Have_Robotics__c` plus Velys/CORI; confirm with product team)_ |
| `ROSA_Additional_Opportunities__c` | Additional opportunities     | Long Text(5000) |                                                                                                                                                                                 |
| `ROSA_Identified_Risks__c`         | Identified risks             | Long Text(5000) |                                                                                                                                                                                 |

### 3.4 Link to checklist

| API name            | Label          | Type                | Notes                                                                           |
| ------------------- | -------------- | ------------------- | ------------------------------------------------------------------------------- |
| `ROSA_Checklist__c` | ROSA Checklist | Lookup(Robotics__c) | Set by flow F1. Lets the deal page show checklist fields without a related list |

### 3.5 Totals (calculated by flow F4, read-only on layouts)

`Robotics_Surgeons__c` will be a lookup child, so these are flow-maintained numbers, not roll-up summary fields.

| API name                        | Label                           | Type         | Calculation (over ROSA Surgeons on this deal)                          |
| ------------------------------- | ------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `ROSA_Surgeon_Count__c`         | Surgeons on deal                | Number(4,0)  | count                                                                  |
| `ROSA_Champions__c`             | Champions                       | Text(255)    | surgeon names where Champion = true, joined with ", "                  |
| `ROSA_ZB_TKA_Users__c`          | ZB TKA users                    | Number(4,0)  | count where TKA current supplier = ZB                                  |
| `ROSA_ZB_PKA_Users__c`          | ZB PKA users                    | Number(4,0)  | same for PKA                                                           |
| `ROSA_ZB_THA_Users__c`          | ZB THA users                    | Number(4,0)  | same for THA                                                           |
| `ROSA_ZB_Shoulder_Users__c`     | ZB shoulder users               | Number(4,0)  | same for TSA/RSA                                                       |
| `ROSA_Current_ZB_TKA__c`        | Current ZB TKA cases            | Number(6,0)  | sum current TKA cases where current supplier = ZB                      |
| `ROSA_Current_ZB_PKA__c`        | Current ZB PKA cases            | Number(6,0)  | same PKA                                                               |
| `ROSA_Current_ZB_THA__c`        | Current ZB THA cases            | Number(6,0)  | same THA                                                               |
| `ROSA_Current_ZB_Shoulder__c`   | Current ZB shoulder cases       | Number(6,0)  | same TSA/RSA                                                           |
| `ROSA_With_ROSA_ZB_TKA__c`      | With ROSA ZB TKA cases          | Number(6,0)  | sum with-ROSA TKA cases where with-ROSA supplier = ZB                  |
| `ROSA_With_ROSA_ZB_PKA__c`      | With ROSA ZB PKA cases          | Number(6,0)  | same PKA                                                               |
| `ROSA_With_ROSA_ZB_THA__c`      | With ROSA ZB THA cases          | Number(6,0)  | same THA                                                               |
| `ROSA_With_ROSA_ZB_Shoulder__c` | With ROSA ZB shoulder cases     | Number(6,0)  | same TSA/RSA                                                           |
| `ROSA_Growth_Cases__c`          | Growth cases                    | Number(6,0)  | Σ (with ROSA ZB − current ZB) across the four joints                   |
| `ROSA_Share_ZB__c`              | With ROSA share: ZB             | Percent(3,1) | with-ROSA cases where supplier = ZB ÷ all with-ROSA cases              |
| `ROSA_Share_JJ__c`              | With ROSA share: J&J            | Percent(3,1) | same                                                                   |
| `ROSA_Share_Stryker__c`         | With ROSA share: Stryker        | Percent(3,1) | same                                                                   |
| `ROSA_Share_SN__c`              | With ROSA share: Smith & Nephew | Percent(3,1) | same                                                                   |
| `ROSA_Share_Other__c`           | With ROSA share: Other          | Percent(3,1) | same                                                                   |
| `ROSA_Surgeons_Credentialed__c` | Surgeons credentialed           | Number(4,0)  | count of credentialing records on this deal with Credentialed Date set |

`ROSAGrowthDollar__c` is not touched (Robert, 2026-11-26): it stays a typed-in number. F4 reads no prices.

---

## 4. `Robotics_Surgeons__c` → "ROSA Surgeons"

Relabel object: singular **ROSA Surgeon**, plural **ROSA Surgeons**. Description: "Surgeons involved in a ROSA deal, with their case volumes now and with ROSA."

### 4.1 Re-parent

- New `ROSA_Deal__c` (Lookup(SalesRisks__c), label "ROSA Deal", relationship `ROSA_Surgeons`, lookup filter: record type DeveloperName ends with ROSA or = `China_ROSA_Opportunity`, required on the ROSA layout). Lookup, not master-detail, because existing records have no deal and the parent swap would fail. Delete behaviour: clear the field.
- Existing `Robotics_Surgeon__c` (link to `Robotics__c`): if master-detail **[verify]**, convert to optional lookup. Remove from layouts.
- Backfill (UAT only, anonymous Apex in `scripts/apex/rosa_backfill_surgeon_deal.apex`): `ROSA_Deal__c = Robotics_Surgeon__r.Sales_Risks__c` where blank. Dry-run count first with SOQL.

### 4.2 Surgeon (existing field check)

**[verify]** which field holds the surgeon. If there's an Account lookup, keep it as "Surgeon". If not, add `ROSA_Surgeon__c` Lookup(Account), filtered to person/HCP accounts the same way `SalesRisks__c.Account__c` is filtered.

### 4.3 New fields

| API name                   | Label            | Type                          | Values / notes                                                             |
| -------------------------- | ---------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `ROSA_Champion__c`         | Champion         | Checkbox                      |                                                                            |
| `ROSA_Career_Position__c`  | Career position  | Picklist                      | Consultant, Fellow, Trainee, Other                                         |
| `ROSA_Implant_Deal__c`     | Implant deal     | Lookup(SalesRisks__c)         | The surgeon's implant deal, if one exists. Filter: not a ROSA record type  |
| `ROSA_Deal_Surgeon_Key__c` | Deal surgeon key | Text(40), unique, external ID | Set by F5 = deal Id + surgeon Id. Stops the same surgeon being added twice |

Per joint, four fields each. Joints: `TKA`, `PKA`, `THA`, `TSA_RSA` (label "TSA/RSA").

| Pattern                            | Label                          | Type                                        |
| ---------------------------------- | ------------------------------ | ------------------------------------------- |
| `ROSA_<Joint>_Current_Supplier__c` | <Joint> current supplier       | Picklist (global value set `ROSA_Supplier`) |
| `ROSA_<Joint>_Current_Cases__c`    | <Joint> current cases a year   | Number(5,0)                                 |
| `ROSA_<Joint>_ROSA_Supplier__c`    | <Joint> supplier with ROSA     | Picklist (`ROSA_Supplier`)                  |
| `ROSA_<Joint>_ROSA_Cases__c`       | <Joint> cases a year with ROSA | Number(5,0)                                 |

16 fields total. Supplier stays in the with-ROSA columns (revision cases may use competitor implants).

Global value set `ROSA_Supplier`: ZB, J&J, Stryker, Smith & Nephew, Other.

Validation `ROSA_Cases_Need_Supplier`: if any cases number > 0, its supplier must be set.

---

## 5. `Robotics__c` → "ROSA Checklist"

Relabel object: **ROSA Checklist** / **ROSA Checklists**. Keep all existing fields and ticks (show them in a collapsed "Existing site readiness" section).

### 5.1 Record type

New record type `ROSA_Deal_Checklist` (label "ROSA Deal Checklist"), default for the ROSA permission set. Existing records keep their record type.

### 5.2 Step fields

For each step S in `1`, `2`, `3`, `4`, `5`, `6`, `7a`, `7b`, `7c`, `7d`:

| Pattern                    | Type         | Notes                                          |
| -------------------------- | ------------ | ---------------------------------------------- |
| `ROSA_Step_<S>_Done__c`    | Checkbox     | Label = step name from section 2               |
| `ROSA_Step_<S>_Date__c`    | Date         | Defaulted to today by F2 when ticked, editable |
| `ROSA_Step_<S>_Done_By__c` | Lookup(User) | Set by F2 when ticked, read-only               |

30 fields. Step labels are generic (no country titles): e.g. "2 Validate with deal lead", not "State Manager".

Plus:

| API name               | Label             | Type        | Notes                                                          |
| ---------------------- | ----------------- | ----------- | -------------------------------------------------------------- |
| `ROSA_Highest_Step__c` | Highest step done | Number(2,0) | Set by F2: 1–6 for the contract steps, 7 when any 7x is ticked |

Step owners (help text only, from the product guide): 1 rep and deal lead; 2 deal lead; 3 deal lead; 4 Commercial; 5 deal lead, Commercial, Legal; 6 Legal; 7a–7d ROSA team.

### 5.3 Validation rules on `Robotics__c`

| Name                             | Rule                                                       | Message                                                                                   |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ROSA_Step3_Needs_Surgeon`       | Step 3 ticked and the deal's `ROSA_Surgeon_Count__c` < 1   | "Add at least one ROSA surgeon before completing the deal summary."                       |
| `ROSA_Step6_Needs_Date`          | Step 6 ticked and Step 6 date blank                        | "Enter the date the contract was signed."                                                 |
| `ROSA_Step7a_Needs_Install_Date` | Step 7a ticked and deal `Install_Date__c` blank            | "Set the install date on the deal first."                                                 |
| `ROSA_Steps_In_Order`            | Any step ticked while an earlier contract step (1–6) isn't | "Complete the earlier steps first." _(assumption: strict order for 1–6; 7a–7d any order)_ |
| `ROSA_7_Needs_Closed_Won`        | Any 7x ticked and Step 6 not ticked                        | "Implementation steps open once the contract is signed."                                  |

---

## 6. Price table: `ROSA_Price__c` (new)

Label **ROSA Price** / **ROSA Prices**. Owned by marketing, set once, reused. Org-wide default: Public Read Only.

| API name          | Label      | Type                    | Values / notes                                                                                                                                                                            |
| ----------------- | ---------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | Price name | Auto number `RP-{0000}` |                                                                                                                                                                                           |
| `ROSA_Country__c` | Country    | Picklist                | Countries of the ROSA record types: Australia, New Zealand, India, Thailand, South Korea, Singapore, Malaysia, Hong Kong, Taiwan, China _(match the format of `HCFCountry__c`, [verify])_ |
| `ROSA_Joint__c`   | Item       | Picklist                | TKA, PKA, THA, TSA/RSA, ROSA Disposable                                                                                                                                                   |
| `ROSA_Price__c`   | Price      | Currency(16,2)          | ASP per case                                                                                                                                                                              |
| `CurrencyIsoCode` | Currency   | standard                |                                                                                                                                                                                           |
| `ROSA_Active__c`  | Active     | Checkbox                | default true                                                                                                                                                                              |
| `ROSA_Key__c`     | Key        | Text(80), unique        | Set by before-save flow F6: Country + Item + Currency, only while Active. Stops duplicate active prices                                                                                   |

---

## 7. Credentialing

### 7.1 `Event_Category__c` (existing; reused as the question set)

Add:

| API name          | Label        | Type     | Values                               |
| ----------------- | ------------ | -------- | ------------------------------------ |
| `ROSA_Usage__c`   | Used for     | Picklist | Events (default), ROSA Credentialing |
| `ROSA_Pathway__c` | ROSA pathway | Picklist | Shoulder, Hip, Knee                  |

Existing APAC Events records get "Events" by default value only; no data update needed if the picklist default applies to blanks in filters (filters below test `= 'ROSA Credentialing'`).

`Question__c` is reused unchanged.

### 7.0 Changed 2026-11-27: credentialing is flat on the ROSA Surgeon (Robert)

One surgeon on one deal is one credentialing (a hip deal has its own ROSA Surgeons), so the separate `ROSA_Credentialing__c` record is gone. The ROSA Surgeon holds `ROSA_Pathway__c` (Shoulder, Hip, Knee), `ROSA_Question_Set__c` (filled from the pathway), `ROSA_Credentialing_Status__c`, `ROSA_Wave__c`, `ROSA_Course_Date__c`, `ROSA_Credentialed_Date__c`, `ROSA_First_Case_Date__c`, `ROSA_Questions_To_Answer__c`, `ROSA_Gaps__c` and `ROSA_Ready__c`; validation `ROSA_Credential_Needs_Ready` moved there. Answers are master-detail to the ROSA Surgeon (`ROSA_Credentialing_Answer__c.ROSA_Surgeon__c`) and are added when a pathway is chosen. Step 7c ticks when every surgeon with a pathway on the deal has a credentialed date. Sections 7.2 and 7.3 below are kept as the original design; where they say Credentialing, read ROSA Surgeon. The `ROSA_Credentialing__c` object is deleted from UAT.

### 7.2 `ROSA_Credentialing__c` (new; replaced, see 7.0)

Label **ROSA Credentialing**. One per surgeon per pathway. Record types: `Shoulder`, `Hip`, `Knee` (only Shoulder assigned to profiles in the POC).

| API name                     | Label                | Type                                                       | Notes                                                                              |
| ---------------------------- | -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Name                         | Credentialing number | Auto number `RC-{0000}`                                    |                                                                                    |
| `ROSA_Surgeon__c`            | ROSA Surgeon         | Master-detail(Robotics_Surgeons__c)                        |                                                                                    |
| `ROSA_Deal__c`               | ROSA Deal            | Lookup(SalesRisks__c)                                      | Copied from the surgeon by F7; read-only                                           |
| `ROSA_Question_Set__c`       | Question set         | Lookup(Event_Category__c)                                  | Filter: Usage = ROSA Credentialing, Active, Pathway = record type. Defaulted by F7 |
| `ROSA_Required_Questions__c` | Required questions   | Roll-up count of answers where Required = true             |                                                                                    |
| `ROSA_Required_Answered__c`  | Required answered    | Roll-up count where Required = true and Is Answered = true |                                                                                    |
| `ROSA_Ready__c`              | Ready to credential  | Formula(Checkbox)                                          | Required Questions > 0 and Required Answered = Required Questions                  |
| `ROSA_Credentialed_Date__c`  | Credentialed date    | Date                                                       | Entered by the ROSA team after the Med Ed lab                                      |
| `ROSA_First_Case_Date__c`    | First case date      | Date                                                       |                                                                                    |
| `ROSA_Pathway_Key__c`        | Pathway key          | Text(40), unique                                           | Set by F7: surgeon Id + record type. One per surgeon per pathway                   |

Added 2026-11-27 (Robert: Phoebe needs to see where every surgeon is with credentialing): `ROSA_Status__c` Credentialing status (Not started, Booked, Attended, Credentialed; a course date sets Booked, a credentialed date sets Credentialed, picking Credentialed fills the date with today) and `ROSA_Course_Date__c` Course date. Both are copied to the ROSA Surgeon (`ROSA_Credentialing_Status__c`, `ROSA_Course_Date__c`, read-only there) and shown in the deal's surgeon list. The list's first column `ROSA_Surgeon_Link__c` opens the ROSA Surgeon record; its page (`ROSA_Surgeon_Record_Page`) shows credentialing at the top.

`ROSA_Wave__c` Credentialing Wave, picklist 1 to 10, groups surgeons into waves of credentialing (Robert, 2026-11-27).

Validation `ROSA_Credential_Needs_Ready`: Credentialed date set and Ready = false → "Answer all required questions first."

Field history: Credentialed date, First case date.

### 7.3 `ROSA_Credentialing_Answer__c` (new)

Label **ROSA Credentialing Answer**. Created by F7, never by hand (no New button on the related list).

| API name                | Label         | Type                                 | Notes                                                                                                           |
| ----------------------- | ------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Name                    | Answer number | Auto number `RA-{00000}`             |                                                                                                                 |
| `ROSA_Credentialing__c` | Credentialing | Master-detail(ROSA_Credentialing__c) |                                                                                                                 |
| `ROSA_Question__c`      | Question      | Lookup(Question__c)                  | Read-only                                                                                                       |
| `ROSA_Question_Text__c` | Question      | Formula(Text)                        | `ROSA_Question__r.Question_Text_2__c`                                                                           |
| `ROSA_Answer_Type__c`   | Answer type   | Text(20)                             | Copied from the question at creation (so later edits to the bank don't change live answers)                     |
| `ROSA_Required__c`      | Required      | Checkbox                             | Copied                                                                                                          |
| `ROSA_Display_Order__c` | Order         | Number(4,0)                          | Copied                                                                                                          |
| `ROSA_Answer_Yes_No__c` | Yes / No      | Picklist (Yes, No)                   | Used when type = Yes/No. Blank = not answered; Yes and No are both answers (Robert, 2026-11-27; was a tick box) |
| `ROSA_Answer_Number__c` | Number        | Number(10,2)                         |                                                                                                                 |
| `ROSA_Answer_Date__c`   | Date          | Date                                 |                                                                                                                 |
| `ROSA_Answer_Text__c`   | Text          | Text(255)                            |                                                                                                                 |
| `ROSA_Is_Answered__c`   | Answered      | Checkbox                             | Set by F8: the field for its type is filled (Yes/No: ticked)                                                    |
| `ROSA_Answered_By__c`   | Answered by   | Lookup(User)                         | Set by F8, read-only                                                                                            |
| `ROSA_Answered_Date__c` | Answered date | Date/Time                            | Set by F8, read-only                                                                                            |

Field history tracking on: all four answer fields, Answered By, Answered Date. (Object needs history enabled.)

Validation `ROSA_Answer_Matches_Type`: only the field for the answer type may be filled.

---

## 8. Automation (Flows)

All flows: `ROSA_` prefix, description on the flow and on each element, fault paths that show a plain message. Record-triggered flows run only for ROSA record types (entry condition on `RecordType.DeveloperName`).

| #   | Flow API name                | Type                                                         | Object / trigger                       | Does                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------- | ------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `ROSA_Deal_Created`          | After save, create                                           | `SalesRisks__c` (ROSA RTs)             | Stage blank → Sales Pipeline. Create one `Robotics__c` (RT `ROSA_Deal_Checklist`, `Sales_Risks__c` = deal). Write its Id into `ROSA_Checklist__c`. Skip if a checklist already exists                                                                                                             |
| F2  | `ROSA_Checklist_Before_Save` | Before save, create/update                                   | `Robotics__c` (RT ROSA_Deal_Checklist) | For each step newly ticked: set Date (if blank) = today, Done By = running user. Newly unticked: clear Done By (keep date). Compute `ROSA_Highest_Step__c`                                                                                                                                        |
| F3  | `ROSA_Checklist_Moves_Stage` | After save, update, when `ROSA_Highest_Step__c` changes      | `Robotics__c`                          | Map highest step to stage (section 2). Update the deal only if deal stage ≠ Deal Lost and the new stage is later than the current one. If step 6 newly ticked and deal `Close_Date__c` blank, set it = step 6 date                                                                                |
| F4  | `ROSA_Recalc_Deal_Totals`    | Autolaunched subflow, input `dealId`                         | —                                      | Query ROSA Surgeons for the deal; compute every field in 3.5; write the deal once                                                                                                                                                                                                                 |
| F4a | `ROSA_Surgeon_Changed`       | After save, create/update/delete                             | `Robotics_Surgeons__c`                 | Call F4 for the deal (old and new deal if it moved)                                                                                                                                                                                                                                               |
| F4b | `ROSA_Price_Changed`         | After save, create/update                                    | `ROSA_Price__c`                        | _Not in POC._ Note only: a scheduled or manual recalculation covers price changes                                                                                                                                                                                                                 |
| F5  | `ROSA_Surgeon_Before_Save`   | Before save                                                  | `Robotics_Surgeons__c`                 | Set `ROSA_Deal_Surgeon_Key__c`                                                                                                                                                                                                                                                                    |
| F6  | `ROSA_Price_Before_Save`     | Before save                                                  | `ROSA_Price__c`                        | Set `ROSA_Key__c` (blank when inactive)                                                                                                                                                                                                                                                           |
| F7  | `ROSA_Credentialing_Created` | Before save (keys) + after save, create                      | `ROSA_Credentialing__c`                | Before: copy `ROSA_Deal__c` from surgeon; default question set = active category with Usage ROSA Credentialing and Pathway = record type; set pathway key. After: for each active `Question__c` in the set, ordered by `Display_Order__c`, create one answer with type, required and order copied |
| F8  | `ROSA_Answer_Before_Save`    | Before save, create/update                                   | `ROSA_Credentialing_Answer__c`         | If any answer field changed (on update) or is filled (on create): Answered By = running user, Answered Date = now. Set Is Answered                                                                                                                                                                |
| F9  | `ROSA_Credentialed_Ticks_7c` | After save, update, when `ROSA_Credentialed_Date__c` changes | `ROSA_Credentialing__c`                | Recount `ROSA_Surgeons_Credentialed__c` on the deal. If every credentialing record on the deal has a Credentialed date, tick step 7c on the deal's checklist (date = latest credentialed date). Never unticks                                                                                     |

Bulk safety: F4 must handle data loads (use collections, one deal update per deal). _Assumption: flows are enough; if F4 hits limits during the backfill, move it to an Apex class `ROSA_DealTotals` with a test class and say so._

Recursion: F3 and F9 update other objects; F1 sets the lookup in a separate update. Guard F1 with "checklist lookup is blank".

---

## 9. Page layouts and Lightning record pages

### 9.1 ROSA deal (`SalesRisks__c`, every ROSA record type)

One Lightning record page `ROSA_Deal_Record_Page`, assigned to all ROSA record types (app default + record type assignment). Existing ROSA layouts updated to match (fields in sections, platform stage fields removed).

Above the tabs (Robert, 2026-11-27): a "ROSA deal" section with ROSA Deal Lead, Healthcare Facility, Primary HCP and Sales Rep (the existing compact layout is not changed). The Totals, market share and Checklist link sections are hidden on New.

Tabs and sections:

1. **Deal**: hospital, Primary HCP, ROSA Deal Lead, deal type, sales type, stage, expected close quarter/year, close date, install date, priority, state priority, currency.
2. **Site background**: fields from 3.2.
3. **Appropriateness**: fields from 3.3.
4. **Surgeons and growth**: ROSA Surgeons related list (columns: surgeon, champion, Cases now, Cases with ROSA: two formula fields that list every joint with cases, e.g. "TKA 40 J&J, THA 10 ZB"; changed 2026-11-27 from shoulder-only columns); totals from 3.5 below it, read-only; `ROSAGrowthDollar__c` stays editable.
5. **Checklist**: steps 1–6 shown from the checklist through `ROSA_Checklist__c` (use a Dynamic Related Single or a flow screen component; _assumption: a screen flow `ROSA_Checklist_Panel` embedded on the page is the simplest way to tick from the deal; acceptable alternative is the checklist record page opened from a quick link_).
6. **Implementation**: steps 7a–7d plus the credentialing related list. **Visible only when Stage__c = Closed Won.**
7. Chatter stays as it is.

Related lists: ROSA Surgeons, Implant deals (`Link_To_ROSA_Deal__c`), Credentialing (through `ROSA_Deal__c`). Removed from ROSA layouts: ROSA Platform (`ROSA_Add_On__c`), Key Buying Influencers.

### 9.2 ROSA Surgeon

Sections: Surgeon (surgeon, deal, champion, career position, implant deal), Volumes (a 4-row grid: per joint current supplier, current cases, supplier with ROSA, cases with ROSA), Credentialing related list (New button only for Shoulder record type in the POC).

### 9.3 ROSA Checklist (RT ROSA_Deal_Checklist)

Sections: Opportunity (1–3), Contract (4–6), Implementation (7a–7d), each step as Done / Date / Done by. Collapsed "Existing site readiness" with the old ticks.

### 9.4 ROSA Credentialing (Shoulder)

Top: surgeon, deal, question set, ready, credentialed date, first case date. Answers related list sorted by Order, columns: Question, Answer type, Yes, Number, Date, Text, Answered by, Answered date. Inline edit on.

### 9.5 ROSA Price

Simple layout, list view "Active prices" by country.

---

## 10. Permissions

| Permission set             | For                                      | Gives                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ROSA_Deal_Management`     | Deal leads, ROSA team, Commercial, Legal | Read/edit ROSA deal new fields; CRUD (no delete) on ROSA Surgeons, ROSA Checklist, ROSA Credentialing, answers (edit answer fields only); read ROSA Price, Event_Category__c, Question__c; record type access ROSA_Deal_Checklist, Credentialing Shoulder |
| `ROSA_Credentialing_Admin` | Marketing                                | Everything above plus create/edit `ROSA_Price__c`, `Event_Category__c`, `Question__c` (no delete; deactivate instead). No admin profile needed                                                                                                            |

Read-only fields everywhere: totals in 3.5, all Done By / Answered By / Answered Date / key fields.

Descriptions on both permission sets. Assign to Robert and two test users in UAT only.

---

## 11. Seed data (UAT only; scripts in `scripts/apex/`, no real data committed)

`rosa_seed_shoulder_questions.apex`:

- `Event_Category__c` "ROSA Shoulder Credentialing", Active, Usage = ROSA Credentialing, Pathway = Shoulder.
- Four `Question__c`, all Yes/No, required, active:
  1. (order 10) "Confirm the surgeon does 30+ Zimmer Biomet shoulder cases a year." _(30 is a placeholder: the guide says "X", marketing sets it)_
  2. (order 20) "Confirm the surgeon has used Signature 2.0 planning."
  3. (order 30) "Confirm the surgeon has had the ROSA Shoulder demo and slide deck walk-through."
  4. (order 40) "Confirm the surgeon has access to a ROSA Shoulder unit."
- Leave the existing "ROSA TKA Certification Questions" category alone.

`rosa_seed_sample_prices.apex` (marked SAMPLE in the name field description; not real prices):

- Australia AUD: ROSA Disposable 750; TKA, PKA, THA, TSA/RSA with round sample values.
- New Zealand NZD: same items, sample values.

Both scripts idempotent (check before insert).

---

## 12. Build order (UAT)

1. Retrieve and verify (0.4). Write findings at the top of this doc under "Verified".
2. Robert's sign-off on the list in 0.2.
3. Global value set, `ROSA_Price__c`, fields on `Event_Category__c`.
4. Fields on `Robotics__c`, record type, validation rules.
5. Re-parent and fields on `Robotics_Surgeons__c`; backfill script.
6. `ROSA_Credentialing__c`, `ROSA_Credentialing_Answer__c`.
7. Fields on `SalesRisks__c`; relabel.
8. Flows F1–F9.
9. Layouts, Lightning pages, permission sets.
10. Seed scripts.
11. Acceptance tests (13), report results to Robert.
12. DEV only after Robert approves UAT. PROD by Robert through Gearset.

Each step: `sf project deploy start --dry-run -o UAT -d <paths>` then the real deploy. Record deploy Ids in `docs/ROSA_Shoulder_POC_Build_Log.md`. Add a manifest `manifest/rosa-shoulder-poc.xml` listing every component.

---

## 13. Acceptance tests (run in UAT with a test user holding `ROSA_Deal_Management`)

| #   | Do                                                                      | Expect                                                                                                 |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| T1  | Create an AU ROSA deal                                                  | Stage = Sales Pipeline; one ROSA Checklist created and linked                                          |
| T2  | Tick step 3 with no surgeons                                            | Blocked with the surgeon message                                                                       |
| T3  | Add 3 surgeons with shoulder volumes, one champion                      | Surgeon count 3, champion named, ZB shoulder users and case totals correct, growth cases correct       |
| T4  | Add the same surgeon twice                                              | Second save blocked (duplicate key)                                                                    |
| T5  | Tick step 1                                                             | Stage = Surgeon Engagement; date = today, Done by = test user                                          |
| T6  | Tick step 5 before step 4                                               | Blocked ("earlier steps first")                                                                        |
| T7  | Tick 4, then 5, then 6 with a date                                      | Stage goes Executive Presentation, Negotiation, Closed Won; close date set from step 6 if it was blank |
| T8  | Set a second deal to Deal Lost, then tick step 1                        | Stage stays Deal Lost                                                                                  |
| T9  | Implementation tab                                                      | Hidden before Closed Won, visible after                                                                |
| T10 | Add a Shoulder credentialing record to a surgeon                        | 4 blank answers in order 10–40; question set filled; Ready = false                                     |
| T11 | Answer all 4 as a second user                                           | Answered by = that user, Answered date = now; Ready = true; history shows the changes                  |
| T12 | Set credentialed date on every surgeon's credentialing                  | Surgeons credentialed count matches; step 7c ticks itself                                              |
| T13 | Set credentialed date with an unanswered required question              | Blocked                                                                                                |
| T14 | Type a value into ROSA Growth $ and add or change a surgeon             | The typed value is unchanged                                                                           |
| T15 | Log in as a marketing user with `ROSA_Credentialing_Admin`              | Can add/edit a question and a price; cannot delete                                                     |
| T16 | Add a 5th active question to the set, create a new credentialing record | New record gets 5 answers; the earlier record still has 4                                              |
| T17 | Open an old (pre-POC) Robotics__c record and an old ROSA Surgeon        | Opens without errors; old ticks still visible                                                          |
| T18 | Load 200 ROSA Surgeons in one go (data loader into a test deal set)     | No flow limit errors; totals right                                                                     |

---

## 14. Out of scope for the POC

- Hip and knee question sets (added later as data, no build).
- Deleting `ROSA_Add_On__c`, the three platform stage fields, `Robotics_Key_Buying_Influencers__c`. Later: export their data outside the repo first, then a destructive deploy with Robert's word.
- Any change to `Stage__c` values or Power BI.
- Pipeline app (LWC) screens for ROSA. The POC uses standard Lightning pages so the product team can see it in Salesforce.
- Sub-stage field under Closed Won (the 7a–7d checklist covers it; add only if Robert asks).

## 15. Open with the product team (doesn't block the build)

- The shoulder case minimum "X" (placeholder 30).
- Hip and knee credentialing criteria.
