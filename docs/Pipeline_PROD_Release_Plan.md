# Pipeline: the plan for PROD

## Where we are (end of 2026-11-02; Robert deploys in the morning)

**Done:** all checks of PROD (read-only); the usage clean-up in PROD (Robert ran it: 5,814 usages left, proven clean); the year package for PROD (`release/prod/`); the Gearset steps (`release/prod/README.md`, two stages). **Not done:** the deploy itself (Robert, by Gearset); field access for the year on the profiles; the year load; the pilot and roll-out; DEV's last sync. **Not blocking:** the PROD roll-ups were scheduled to recalculate and were still running (6 jobs completed, 10 processing, 9 waiting at the last look); stored ratings had not moved; Robert decided the ratings do not hold anything up and not to check them. They will shift when the jobs finish, so whoever uses the ratings should be told. **Open question:** is Gearset connected to GitHub (a `release-prod` branch could then hold exactly what to ship)?

Prepared 2026-11-02, after version 0.52 reached UAT and DEV. **PROD has not been touched.** PROD is Robert's, by Gearset; nothing here is run from the command line against PROD. Everything below the line "Checked already" was read-only.

## What goes to PROD

New (nothing like it exists in PROD today; checked): 15 Apex classes (7 of them tests), 21 Lightning web components, the Aura app `PipelineOut`, the Visualforce page `PipelineApp`, the Pipeline Lightning app and its tab, 2 static resources (the pipe artwork), 3 permission sets (`Pipeline_User`, `Pipeline_Team_Viewer`, `Pipeline_Quarter_Rule_Bypass`), 2 custom permissions, and 2 custom objects (`Pipeline_Saved_Filter__c`, `Pipeline_User_Setting__c`).

**Changes to things that already exist (the only ones):** on `SalesRisks__c` a new picklist field `Expected_Closing_Year__c` (years 2023 to 2033, newest first), the validation rule `Pipeline_Quarter_Not_In_The_Past`, the year values added to its 60 record types, and the year field added to its 7 layouts. Nothing else existing is edited.

## Checked already (read-only, in PROD)

- All 80 field and object names the code uses exist in PROD (none are UAT-only).
- No Pipeline Apex, components, objects or permission sets exist in PROD yet (the two `PipelineInspection...` permission sets are Salesforce's own feature and do not clash).
- ZB is allowed on all four ANZ usage record types in PROD (UAT and DEV's knee type had lost it).
- PROD has 2,311 deals; 1,834 have a quarter (1,191 open, 643 closed); 477 have none.
- Profiles that matter for the year field (the people in the teams and the deal owners): `AP-FORCE100-AU-Standard`, `AP-FORCE100-NZ-Standard`, `AP-STANDARD-AU`, and for deal owners `AP-FORCE100-IN-Standard`, `-TH-`, `-SG-`, `-HK-`, `-TW-`, `-MY-`, `-KR-Standard`, plus System Administrator: about 11, close to Robert's "about 10". (Many more profiles can edit the quarter on paper, such as integration and community profiles; they do not need the year.) The permission set `Pipeline_User` already gives its holders edit access to the year, so profile access matters mainly for people who edit the quarter outside Pipeline.
- 873 active, non-portal users; 261 active team members.
- Tests: all 42 Pipeline Apex tests were run in DEV (41 pass; the 42nd needs ZB on DEV's knee record type, which PROD already has); coverage per class 82% to 100%, above the 75% PROD needs.

## The order of work

**Before deploying (decisions and preparation):**

1. How the year gets onto the 60 record types and 7 layouts (see the decisions below).
2. The usage clean-up (decisions below). Pipeline works without it, but users would see the duplicate lines.
3. Who is in the first group (a pilot), and who gets `Pipeline_Team_Viewer`.

**Deploy day (changed 2026-11-03 at Robert's suggestion: the validation rule goes in last, so a delay at any point leaves people using the object as before):**

4. **Stage 1 in Gearset (no Apex, no tests):** the objects and fields, the year field, the custom permissions, the `Pipeline_Quarter_Rule_Bypass` permission set, the static resources, and the year on the 60 record types and 7 layouts (the prepared files). **No validation rule yet.**
5. **By hand:** give System Administrator field access to the four new fields; then give every profile that edits deals (about 11) edit access to `Expected_Closing_Year__c`.
6. **Load the years** (no validation rule in PROD yet, so no bypass is needed). Regenerate the file on the day with `scripts/pipeline_year_backfill.py`.
7. **Stage 2 in Gearset (the code):** validate with the 7 Apex test classes (Run specific tests; the deploying user has field access by now), then deploy.
8. **Pilot:** assign `Pipeline_User` to Robert and a few others; look at their own deals, the usages and case bookings.
9. **Stage 3 (go-live): the validation rule**, as its own small deploy (no Apex, no tests). Just before it, refresh the years for deals whose quarter changed since the load, so none goes live with a stale pair.
10. **Roll out:** assign `Pipeline_User` to everyone who uses it (and `Pipeline_Team_Viewer` to the few who see every team); warn the managers about the quarter rule and the ratings users about the ratings.

Until step 9 nothing changes for anyone on the standard pages (the year is an optional field), so a delay at any point is harmless.

**Taking it back, if needed:** unassign `Pipeline_User` (Pipeline disappears for people; it is additive and changes no deal). To undo the changes to existing things: deactivate the validation rule, take the year off the layouts. The year field and its values can stay; nothing reads them except Pipeline and the rule.

## The usage clean-up first: what it would do (worked out 2026-11-02, read-only; Robert wants it done before the deploy)

**Backup taken:** every PROD usage with all 67 fields, `PROD_Usage_all_backup_2026-11-02.csv` in `Opportunities and Risks/exports/` (8,556 rows; outside the repo). Nothing has been deleted in PROD.

**What would go:** the 919 usages with no record type (no company and no cases, only old free text on 882) plus the extra records in 1,165 duplicate combinations (same surgeon, hospital and record type): **2,722 records in all** under the UAT rule (keep the one with most data filled in, then the newest). 1,220 surgeons are touched.

**The effect on the ratings, which Robert must know:** the Platinum, Gold, Silver and Bronze ratings are formulas on the surgeon's account built from totals that Declarative Lookup Rollup Summaries keep adding up from the usage lines (hip ZB cases are the sum of the stems lines marked ZB; knee, shoulder and CMFT likewise; checked against PROD: the rule matches for 99.8% of surgeons). **Duplicates are counted twice or more, so today's totals are inflated.** After the clean-up the ZB totals fall: hip 15,752 to 11,191 cases a year (-29%), knee 69,509 to 44,443 (-36%), shoulder -9%, CMFT -20%. **About 440 surgeon-areas (of the 1,220 surgeons touched) would change rating, mostly downward** (for example Gold to Bronze 123, Silver to Bronze 89, Platinum to Silver 60, and 75 Bronze to Silver going up). Anything that reads the ratings or the usage totals (reports, Power BI, the wallboards) will move the day it is done. The ratings recalculate instantly when usages are created or edited, **but not when they are deleted** (the roll-ups run in Process Builder mode): after a delete the roll-ups have to be recalculated by running Calculate on each (see the runbook, step 6b).

**The rules Robert chose (2026-11-02):** (1) **every usage must be tied to a record type, a surgeon and a hospital**: any without goes (no exceptions, so the 15 listed for review earlier go too); (2) a usage holding another portfolio's numbers, or completely empty, goes; (3) of duplicates (same surgeon, hospital and record type) **keep the newest.** One snag found in the data: 7,115 usages were last modified on 31 December 2024 by a mass update, so "last modified" alone says nothing for most duplicates (in 1,125 of the 1,165 groups every record was last touched that day). So "newest" is **the latest real activity**: a real modification counts, the 31 Dec 2024 mass update does not (then it is the day the record was created); a tie goes to the record with more data, then the higher Id.

**Result: 2,742 records to delete and 5,814 left:** 919 with no record type, 18 with no hospital, 1 holding another portfolio's numbers, 4 typed but completely empty, and 1,800 extra duplicates (1,108 groups decided by the newer creation date, 52 by a newer real modification, 3 by the tie rule). Only valid records are grouped, so a record that must go can never be the one kept; none of the kept records is empty while a deleted one had numbers. **The script proves the result before anything is run:** after the delete, usages with no record type, no surgeon, no hospital, another portfolio's numbers or no data are all 0, and every surgeon, hospital and record type combination appears once (it refuses to finish otherwise).

**Effect: 480 surgeon-areas change rating (hip 196, knee 261, shoulder 17, CMFT 6): Gold to Bronze 132, Silver to Bronze 94, Bronze to Silver 87, Platinum to Silver 57, Gold to Silver 52, Platinum to Bronze 33, Platinum to Gold 14, Gold to Platinum 4.** ZB cases a year: hip 15,752 to 10,898 (-31%), knee about -37%, shoulder about -8%, CMFT about -21% (the script prints the exact figures).

**Prepared, not run** (in `Opportunities and Risks/exports/PROD_usage_cleanup_PREPARED_NOT_RUN/`, outside the repo): `Usage_DELETE_ids.csv` (the 2,742 ids), `Usage_DELETE_review.csv` (each deleted record with the one kept, the reason, surgeon, hospital and dates, to look through before running), `Usage_rating_changes.csv` (each surgeon and area whose rating changes, for a heads-up to whoever uses the ratings). Made by `scripts/pipeline_usage_cleanup_list.py` from the backup; **regenerate all three, and the backup, on the day**, because PROD data changes.

**To run it (Robert; I never change PROD):** (1) take a fresh backup and regenerate the list with the script; (2) look through the review file (a sample of each reason); (3) tell whoever uses the ratings or the usage totals (reports, Power BI, wallboards), with the rating-changes file; (4) in a quiet period, delete the ids with Data Loader (or Workbench), batches of 200, (the roll-ups do not recalculate on delete, so see step 6b); (5) check: usages should equal the backup count minus the ids deleted (5,814 today), and a query for usages with no record type should return none, and a few surgeons' ratings should match the changes file; (6) to undo: the Recycle Bin restores for about 15 days, otherwise re-insert from the backup file (new ids).

## Prepared for the deploy (2026-11-02)

`release/prod/` in the repo: **(1)** `package-pipeline.xml`, the manifest of everything in `force-app/` (54 items of 12 types); **(2)** PROD's own 60 record types and 7 layouts with only the year added, made from a fresh read-only retrieve from PROD and checked line by line (67 files, nothing removed or changed, only year lines added); and a README with the order on the day. Whichever way Gearset is used (compare org to org and pick these items, or compare against this repo), the year files are PROD plus the year and nothing else.

Also changed since the plan was written: deleting a usage with the red cross in the Usages panel now clears its lines first, so the surgeon's ratings recalculate (the roll-ups do not recalculate on a delete); proven in UAT with a rolled-back test.

## Decisions needed from Robert

1. **How Gearset will carry the year onto the record types and layouts.** UAT's and DEV's record type files can differ from PROD's in other ways, so deploying them as they are could carry more than the year. Options: (a) compare UAT to PROD in Gearset and pick only the record type and layout items, checking each difference; (b) I make copies of PROD's own record types and layouts with only the year added (read-only retrieve from PROD, the same script as for UAT and DEV) and put them on a branch of the repo for Gearset to compare against PROD; (c) add the years by hand (60 record types: slow).
2. **The usage clean-up in PROD:** decided (keep the newest, see above); the 16 that were listed for review are now in the delete list (Robert, 2026-11-02); still to decide: when to run it and who to warn.
3. **The first group** and who gets `Pipeline_Team_Viewer`.
4. **Telling people about the quarter rule.** From go-live an open deal that is not on hold cannot be saved with a quarter that has already passed. Do the managers need a note first?
5. **What the first release can leave out** (all known): a warning when closing a usage edit with unsaved changes; the phone layout and the rep view and other-manager view have not been tried by Robert; rep mobile, events and the business questions Q44, Q19, Q20 stay for later.

## Prepared (outside the repo, because they hold real data)

In `Opportunities and Risks/exports/`: `PROD_Expected_Closing_Year_load_PREPARED_NOT_LOADED.csv` (made 2026-11-02 from a read-only export: 1,191 open and 643 closed deals get a year; 2023: 77, 2024: 67, 2025: 309, 2026: 621, 2027: 760; 477 left blank). `Pipeline_CaseBookings_RealSurgeons_PRIVATE.html` (not for PROD).

## The PROD usage clean-up was run on 2026-11-02 (by Robert)

Robert ran Usage_DELETE_ids.csv in PROD (Data Loader, 2,742 ids): the success file has 2,742 rows, all "Item Deleted", the same ids as the list; the error file is empty. Checked read-only afterwards: PROD has **5,814 usages**; none without a record type, a surgeon or a hospital; no duplicate combinations; and the clean-up script, run on a fresh export of PROD, finds **nothing left to delete** with every check at 0. **Still to do: recalculate the roll-ups** (runbook step 6b); the totals and ratings on the accounts have not moved yet (246 surgeons' hip totals and 402 knee totals are still too high; UAT, cleaned earlier, has the same: 245 and 375). Robert's UAT clean-up of 2026-11-02 left UAT's totals stale in the same way.
