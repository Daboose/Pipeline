# Pipeline: what to take to PROD (prepared 2026-11-02)

Nothing here has been deployed to PROD. PROD is Robert's, by Gearset.

## 1. The new Pipeline components and the field and rule: `force-app/` (the whole project)

`package-pipeline.xml` lists everything in `force-app/` as a manifest: 54 items of 12 types (Apex classes, the Visualforce page, the Aura app, the Pipeline app and tab, the new field, 2 custom objects, 2 custom permissions, the Lightning web components, 3 permission sets, 2 static resources and the validation rule). All of it is new to PROD except the field `SalesRisks__c.Expected_Closing_Year__c` and the validation rule `Pipeline_Quarter_Not_In_The_Past`, which are additions to an existing object. Every Pipeline Apex test passes in UAT and DEV (see the build spec for the one DEV record type caveat that PROD does not have).

## 2. The year on PROD's own record types and layouts: `year-record-types-and-layouts/`

PROD's 60 `SalesRisks__c` record types and 7 layouts, **read from PROD on 2026-11-02**, with only the year added: the values 2033 down to 2023 for `Expected_Closing_Year__c` on each record type, and the year field placed after the quarter on each layout that carries the quarter. Checked line by line against PROD's own files: **no line is removed or changed, only year lines are added (67 files, 0 unexpected differences).** Because they are PROD's own files, they carry nothing from UAT or DEV.

If PROD's record types or layouts change before the release, make these again (the script is `scripts/pipeline_add_year_to_deals.py`; it needs record types and layouts retrieved from PROD first).

## How to deploy with Gearset: two stages

**Why two stages:** in DEV, a single deploy validated with tests failed two tests, because the new fields have no field access for the person running the tests until they exist (a deployed field is invisible until a profile or permission set grants it), so the tests could not read or write them. The tests were fine once access existed. So first put the fields in, give yourself access, then deploy the code with its tests. Stage 1 has no Apex, so PROD needs no tests for it.

Use **Compare and deploy**: source = UAT (the tested org; DEV is level with it), target = PROD. Filter by the names below. Gearset will show many other differences between UAT and PROD that have nothing to do with Pipeline: **leave them all unticked.** Check each ticked item shows as "new" (green) except the ones noted as changed.

### Stage 1: the data model (no Apex, no tests)

| Tick                                 | What                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom objects                       | `Pipeline_Saved_Filter__c`, `Pipeline_User_Setting__c` (with their 3 fields: `Filter_Json__c`, `Is_Default__c`, `Settings_Json__c`)                                                                                                                                                            |
| One field on an existing object      | `SalesRisks__c.Expected_Closing_Year__c` (tick the **field**, not the whole `SalesRisks__c` object)                                                                                                                                                                                            |
| The validation rule                  | `SalesRisks__c.Pipeline_Quarter_Not_In_The_Past`                                                                                                                                                                                                                                               |
| Custom permissions                   | `Pipeline_Bypass_Quarter_Rule`, `Pipeline_View_Any_Team`                                                                                                                                                                                                                                       |
| Permission set                       | `Pipeline_Quarter_Rule_Bypass` (only this one now: it has no Apex)                                                                                                                                                                                                                             |
| Static resources                     | `Pipeline_Pipe_Blank`, `Pipeline_Pipe_Blank_Wide`                                                                                                                                                                                                                                              |
| The year on record types and layouts | the 60 `SalesRisks__c` record types and 7 layouts: **use the files in `year-record-types-and-layouts/`** (PROD's own plus the year). If you compare from UAT instead, open each one and confirm the only difference is the year lines; if anything else differs, leave it out and tell Claude. |

**Then, by hand, before stage 2:** give your own profile (System Administrator) field access to the four new fields (Setup, the field, Set Field-Level Security), so the stage 2 tests can run as you. The other profiles come later (see the release plan).

### Stage 2: the code (with tests)

| Tick                          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apex classes (15)             | `PipelineController`, `PipelineChatterController`, `PipelineFilterController`, `PipelineLookupController`, `PipelineScope`, `PipelineSurgeonController`, `PipelineUsageController`, `PipelineBookingsController` and their tests: `PipelineControllerTest`, `PipelineChatterControllerTest`, `PipelineFilterControllerTest`, `PipelineLookupControllerTest`, `PipelineSurgeonControllerTest`, `PipelineUsageControllerTest`, `PipelineBookingsControllerTest` |
| Lightning web components (21) | everything named `pipeline...`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Aura app, page, app, tab      | `PipelineOut` (Aura), `PipelineApp` (Visualforce page), `Pipeline` (Lightning app), `Pipeline_Home` (tab)                                                                                                                                                                                                                                                                                                                                                     |
| Permission sets               | `Pipeline_User`, `Pipeline_Team_Viewer`                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Tests:** in the deployment settings choose **Run specific tests** and tick the 7 test classes above (not "all local tests", which would run the whole org's tests). **Validate first**, and when it passes deploy the validated package (Gearset's "deploy validated" re-uses the validation, which Salesforce allows for 10 days).

### After the two stages

Load the years (needs the `Pipeline_Quarter_Rule_Bypass` permission set on the person loading, removed afterwards), give the profiles access to the year, then the pilot and roll-out: see `docs/Pipeline_PROD_Release_Plan.md`.

### The easier way, if Gearset is connected to GitHub

Gearset can compare a branch of `Daboose/Pipeline` against PROD. I can make a branch that holds exactly the items above (PROD's own record types and layouts included), so you tick everything Gearset shows instead of choosing among UAT's differences. Tell Claude if you want it.
