# RELEASE 2 (prepared 2026-11-08): Sales Campaign Management, Pipeline Mobile, desktop Pipeline 0.100

Release 1 (the sections further down: Pipeline 0.54 to 0.56, three stages) is already in PROD. This release is two stages, checked read-only against PROD on 2026-11-08 (PROD equals the 0.56 baseline). **Leave the Usage Card out** (UAT only: `pipelineUsageCard`, `PipelineUsageCardController`, `PipelineUsageCardControllerTest`, `Pipeline_Usage_Card`). Leave the `Pipeline_Home` tab and `pipelineUsageChoices` unticked (no change in behaviour). Do not tick `APAC_Event__c` or its permission set.

**Stage 1 (data model, no code, no tests): 37 items.** Custom objects `Sales_Campaign__c`, `Sales_Campaign_Member__c`, `Sales_Campaign_Deal__c`; their 31 custom fields (Sales_Campaign__c 11, Sales_Campaign_Member__c 10, Sales_Campaign_Deal__c 10); validation rules `Sales_Campaign__c.Campaign_Manager_Required`, `Sales_Campaign__c.End_Date_Not_Before_Start_Date`, `Sales_Campaign_Member__c.Surgeon_Physician_Or_Consultant`. By hand after: System Administrator object and field access to the three objects.

**Stage 2 (code, validate first with Run specific tests, then deploy the validated package): 52 items (checked against Robert's Gearset comparison of 2026-11-08).** Apex classes (12): new `PipelineCampaignController`, `PipelineCampaignImport`, `PipelineCampaignRules`, `PipelineDealCampaignController` and their four tests; changed `PipelineController`, `PipelineLookupController` and their two tests. Apex triggers (3): `PipelineSalesCampaignTrigger`, `PipelineSalesCampaignMemberTrigger`, `PipelineSalesCampaignDealTrigger`. Lightning web components (23): new `pipelineCampaignMembers`, `pipelineCampaignModel`, `pipelineCampaigns`, `pipelineDealCampaignAction`, `pipelineDealCampaigns`, `pipelineMobile`, `pipelineMobileBookings`, `pipelineMobileCampaigns`, `pipelineMobileChatter`, `pipelineMobileChoices`, `pipelineMobileModel`, `pipelineMobileNew`, `pipelineMobileSaving`, `pipelineMobileUsages`, `pipelineSegmented`, `pipelineStageSlider`; changed `pipelineApp`, `pipelineBar`, `pipelineDeal`, `pipelineFilterModel`, `pipelineFormat`, `pipelineSelection`, `pipelineTypeList`. Aura (2): `PipelineCampaignOut`, `pipelineDealCampaignActionPhone` (new). `PipelineOut` is NOT ticked: Gearset shows no difference. Visualforce pages (2): `PipelineCampaigns` (new), `PipelineApp` (changed). Apps (2): `Pipeline_Campaign_Management` (new), `Pipeline` (changed: adds the Campaigns tab). Tabs (2): `Pipeline_Campaigns`, `Pipeline_Mobile`. Lightning page (1): `Pipeline_Mobile`. Quick actions (2): `SalesRisks__c.Pipeline_Campaigns`, `SalesRisks__c.Pipeline_Campaigns_Phone`. Permission sets (3): `Pipeline_User` (changed), `Pipeline_Campaign_Manager`, `Pipeline_Mobile_User` (new). **Tests (11 classes):** PipelineBookingsControllerTest, PipelineCampaignControllerTest, PipelineCampaignImportTest, PipelineCampaignRulesTest, PipelineChatterControllerTest, PipelineControllerTest, PipelineDealCampaignControllerTest, PipelineFilterControllerTest, PipelineLookupControllerTest, PipelineSurgeonControllerTest, PipelineUsageControllerTest.

**By hand after stage 2:** assign `Pipeline_Campaign_Manager` to the campaign managers (Robert to choose); `Pipeline_Mobile_User` to the phone pilot only; add the two Campaigns quick actions to the deal record page (device filter); add Pipeline Mobile to the phone navigation menu (Setup); profile edits only for reps who use the record-page Campaigns button without `Pipeline_User` (copy the `Pipeline_User` object permissions for the three campaign objects); tell users to hard refresh. 11 people hold `Pipeline_User` in PROD today and move from 0.56 to 0.100 at once.

---

# Pipeline: what to take to PROD (prepared 2026-11-02)

Nothing here has been deployed to PROD. PROD is Robert's, by Gearset.

## 1. The new Pipeline components and the field and rule: `force-app/` (the whole project)

`package-pipeline.xml` lists everything in `force-app/` as a manifest: 54 items of 12 types (Apex classes, the Visualforce page, the Aura app, the Pipeline app and tab, the new field, 1 custom object (`Pipeline_Filter__c`, which holds both the saved filters and each person's settings as JSON text), 2 custom permissions, the Lightning web components, 3 permission sets, 2 static resources and the validation rule). All of it is new to PROD except the field `SalesRisks__c.Expected_Closing_Year__c` and the validation rule `Pipeline_Quarter_Not_In_The_Past`, which are additions to an existing object. Every Pipeline Apex test passes in UAT and DEV (see the build spec for the one DEV record type caveat that PROD does not have).

## 2. The year on the layouts: the branch `release-prod-layouts-year`

**Record types need nothing:** when the year field went into PROD (stage 1), Salesforce added its 11 values to all 60 `SalesRisks__c` record types itself (checked in PROD on 2026-11-03: every one carries the year with all 11 values). **Layouts do need it,** and UAT's layouts must NOT be used: they differ from PROD's (they lack fields PROD places, carry a field PROD does not, and have different buttons). So the 7 layouts are on a separate branch of this repo, **`release-prod-layouts-year`**: PROD's own 7 layouts, read from PROD on 2026-11-03, with only the year added (checked line by line: nothing removed, only year lines added). In Gearset compare that branch to PROD and tick the 7 layouts only; each should show as changed, with year lines the only difference.

(An earlier set of prepared record type files was removed on 2026-11-03: they held only the quarter and year picklists, not PROD's full record type, and are not needed.)

## How to deploy with Gearset: three stages (the validation rule goes in last)

**Why two stages:** in DEV, a single deploy validated with tests failed two tests, because the new fields have no field access for the person running the tests until they exist (a deployed field is invisible until a profile or permission set grants it), so the tests could not read or write them. The tests were fine once access existed. So first put the fields in, give yourself access, then deploy the code with its tests. Stage 1 has no Apex, so PROD needs no tests for it. **The validation rule goes in last, as its own small deploy (stage 3), because it is the only piece that changes what people can do on the standard pages.** Until it is in, nothing changes for anyone: if the deployment is delayed at any point, people keep using the object exactly as before (the year is just an optional, blank field).

Use **Compare and deploy**: source = UAT (the tested org; DEV is level with it), target = PROD. Filter by the names below. Gearset will show many other differences between UAT and PROD that have nothing to do with Pipeline: **leave them all unticked.** Check each ticked item shows as "new" (green) except the ones noted as changed.

### Stage 1: the data model (no Apex, no tests)

| Tick                            | What                                                                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom object                   | `Pipeline_Filter__c` (label "Pipeline Filter", plural "Pipeline Filters", private) with its 4 fields: `Filter_Json__c`, `Settings_Json__c`, `Is_Default__c`, `Is_User_Settings__c` |
| One field on an existing object | `SalesRisks__c.Expected_Closing_Year__c` (tick the **field**, not the whole `SalesRisks__c` object)                                                                                |
| Custom permissions              | `Pipeline_Bypass_Quarter_Rule`, `Pipeline_View_Any_Team`                                                                                                                           |
| Permission set                  | `Pipeline_Quarter_Rule_Bypass` (only this one now: it has no Apex)                                                                                                                 |
| Static resources                | `Pipeline_Pipe_Blank`, `Pipeline_Pipe_Blank_Wide`                                                                                                                                  |
| (not in this stage)             | The record types need nothing (Salesforce added the year values itself). The 7 layouts come after, from the branch `release-prod-layouts-year`: see section 2.                     |

**Then, by hand, before stage 2:** give your own profile (System Administrator) field access to the four new fields (Setup, the field, Set Field-Level Security), so the stage 2 tests can run as you. The other profiles come later (see the release plan).

**Then give the other profiles that edit deals access to `Expected_Closing_Year__c` (edit)** (about 11, listed in the release plan), **and load the years.** With no validation rule in PROD yet, the load needs no bypass permission set. Regenerate the load file on the day with `scripts/pipeline_year_backfill.py`.

### Stage 2: the code (with tests)

| Tick                          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apex classes (15)             | `PipelineController`, `PipelineChatterController`, `PipelineFilterController`, `PipelineLookupController`, `PipelineScope`, `PipelineSurgeonController`, `PipelineUsageController`, `PipelineBookingsController` and their tests: `PipelineControllerTest`, `PipelineChatterControllerTest`, `PipelineFilterControllerTest`, `PipelineLookupControllerTest`, `PipelineSurgeonControllerTest`, `PipelineUsageControllerTest`, `PipelineBookingsControllerTest` |
| Lightning web components (21) | everything named `pipeline...`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Aura app, page, app, tab      | `PipelineOut` (Aura), `PipelineApp` (Visualforce page), `Pipeline` (Lightning app), `Pipeline_Home` (tab)                                                                                                                                                                                                                                                                                                                                                     |
| Permission sets               | `Pipeline_User`, `Pipeline_Team_Viewer`                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Tests:** in the deployment settings choose **Run specific tests** and tick the 7 test classes above (not "all local tests", which would run the whole org's tests). **Validate first**, and when it passes deploy the validated package (Gearset's "deploy validated" re-uses the validation, which Salesforce allows for 10 days).

### Stage 3: the validation rule (go-live, after the pilot)

| Tick                | What                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| The validation rule | `SalesRisks__c.Pipeline_Quarter_Not_In_The_Past` (it needs the custom permission `Pipeline_Bypass_Quarter_Rule` from stage 1; no Apex, so no tests) |

Just before this: **refresh the years** for deals whose quarter changed since the load (regenerate the load file and load only the deals whose year is blank or whose quarter and year are now in the past), so no deal goes live with a stale pair. Do it when the pilot is done and the roll-out is ready, because from this moment an open deal that is not on hold cannot be saved with a quarter that has passed. To go back, deactivate the rule (one click in Setup).

### Why the profiles need the year before the rule goes in

A validation rule runs for everyone whether or not they can see or edit the fields it checks. A person whose profile cannot edit the year, who changes a deal's quarter to one that is earlier in the year than the stored year allows (quarter Q4 with year 2026 changed to Q1, meaning next year), would be refused and could not fix it, because the year is the one thing they cannot change. So every profile that edits deals gets edit access to `Expected_Closing_Year__c` before stage 3 (the order above does this).

### Roll-out

The pilot (assign `Pipeline_User` to Robert and a few), then everyone; warn the managers about the quarter rule and the ratings users about the ratings; see `docs/Pipeline_PROD_Release_Plan.md`.

### The easier way, if Gearset is connected to GitHub

Gearset can compare a branch of `Daboose/Pipeline` against PROD. I can make a branch that holds exactly the items above (PROD's own record types and layouts included), so you tick everything Gearset shows instead of choosing among UAT's differences. Tell Claude if you want it.
