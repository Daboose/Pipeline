# Pipeline — field audit of `SalesRisks__c`

Robert (2026-10-24): wants an audit of the fields that are not in use, and a list to decide on. **Nothing is changed or removed.** Read-only, PROD, 2026-10-24: all 2,299 records (1,570 implant, 320 risk, 396 ROSA, 13 ZBEdge), 85 fields checked (system fields left out). The record data was read into a scratch area and is not in the repo. A count of "filled" means not blank; a tick box counts only when ticked.

PROD has 99 fields on this object; UAT has more (for example `Status__c`, `Total_Annual_Value__c`), so always check a field in both orgs before using it.

## 1. Never filled on any record

| Field                   | Label              | Note                                                              |
| ----------------------- | ------------------ | ----------------------------------------------------------------- |
| `CapitalDollars__c`     | Capital $          | A ROSA field, yet empty even on ROSA records.                     |
| `Growth_Committment__c` | Growth Committment | Help text: "Number by which account will grow by ($ and case #)". |

`OwnerIsMe__c` and `ManagerIsMeCustom__c` also show as never ticked, but they are formulas about the person looking at the record, so this says nothing about use.

## 2. Filled only on ROSA records (not for implants or risks)

`Close_Date__c` (52), `Install_Date__c` (61), `ROSA_Overlord__c` (51), `ROSA_Priority__c` (158), `ROSA_Buffalo__c` (8), `Existing_Robot_Status__c` (2), `ROSA_Deal_Replaces_Existing_Unit__c` (2), `ROSA_Platform_Hip_Stage__c` (9), `ROSA_Platform_Partial_Knee__c` (1), `ROSA_Platform_Shoulder_Stage__c` (3), `ZBEdge_Stage__c` (7), `ZBEdge__c` (7). The ROSA sales type, growth dollars and deal type are also almost only ROSA (one implant record each).

## 3. Almost never filled on implants and risks

| Field                  | Filled (implant / risk / ROSA) | Note                                                                                                         |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `Technology__c`        | 3 / 8 / 29                     | Replaced in practice by `Pipeline_Technology__c` ("Supporting Technologies"), filled on 67% of open records. |
| `National_Priority__c` | 5 / 0 / 0                      |                                                                                                              |
| `mymobili__c`          | 1 / 0 / 0                      | Its own description says "Can be deleted".                                                                   |
| `Link_To_ROSA_Deal__c` | 16 / 0 / 0                     |                                                                                                              |
| `HCFCountry__c`        | 4 / 2 / 0                      |                                                                                                              |
| `ReportingQuarter__c`  | 23 / 13 / 29                   | Only 2020 and 2021 values.                                                                                   |
| `State_Campaign__c`    | 73 / 7 / 0                     | ANZ state leaders only.                                                                                      |
| `OnHold__c`            | 23 / 0 / 1                     | Used, and Pipeline will use it (stale rules).                                                                |

## 4. Fields that hold the wrong thing

| Field            | Finding                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| `Close_QTR__c`   | Holds only the letter "Q" on 930 records and nothing else. Not the close quarter. |
| `Install_QTR__c` | Holds only "Q" on 1,071 records (3 have a year, such as Q12024).                  |
| `Brand2__c`      | Looks like a single-value copy of `Brand__c` ("Persona", "ROSA").                 |

## 5. Fill rates that matter for Pipeline (1,006 open implant and risk records)

| Field                                                   | Filled                       |
| ------------------------------------------------------- | ---------------------------- |
| Stage (`Stage__c`)                                      | 99%                          |
| Surgeon (`Account__c`)                                  | 99%                          |
| Competitor segmentation (`Segmentation_Competitors__c`) | 99%                          |
| Expected close quarter (`Expected_Closure_Quarter__c`)  | 96%                          |
| Brand (`Brand__c`)                                      | 96%                          |
| Expected annual value (`AmountPerYear__c`)              | 88%                          |
| Background (`Objective__c`)                             | 86%                          |
| Cases per year (`UnitsCasesPerYear__c`)                 | 76%                          |
| Supporting technologies (`Pipeline_Technology__c`)      | 67%                          |
| HCP rating (`pbiSegmentationRating__c`)                 | 61%                          |
| Healthcare facility (`Healthcare_Facility__c`)          | 56%                          |
| Rep priority (`Priority__c`, ticked)                    | 51%                          |
| myMo (`myMo__c`, ticked)                                | 15%                          |
| Portfolio (`Portfolio__c`)                              | 14%                          |
| State priority (`State_Priority__c`, ticked)            | 14%                          |
| Risk product (`Risk_Product__c`; risks only)            | 5% overall; 175 of 320 risks |
| On hold (`OnHold__c`, ticked)                           | 1%                           |

## 6. Earlier finding

`Close_Date__c` is blank on every implant and risk record; the 52 that are filled are all ROSA (Australia 11, India 36, regional 2, NZ 3).

## 7. What this does not yet cover

Which fields each record type shows on its page layout, what the fields mean, and why a user fills them in. Robert will create sample opportunities and walk through them (Q11).
