# Quarter and year: design note (slice 4), version 2

Written 2026-11-01 for Robert's sign-off. **Built in UAT 2026-11-02 (field, record types, layouts, backfill, validation rule); nothing in PROD; the Pipeline screen changes are not done yet. Where this note and the "ANSWERED" lines disagree, the answers win (field is `Expected_Closing_Year__c`, a picklist, not text).** UAT first, a dry run first; PROD by Gearset only.

**Change of approach (Robert, 2026-11-01):** instead of changing the existing quarter field, **add a new field for the year and leave the quarter exactly as it is.** The new field changes nothing that exists, so if something misbehaves in PROD the quarter is untouched and the new field can simply be removed. This replaces the earlier "adjust the current field in place" decision (version 1 of this note, option 1 of five); it is the "two fields" option, taken for its safety.

## What stays the same (Robert, 2026-10-24)

- **Backfill:** every deal gets the current or next occurrence of its quarter. From today (Q4 2026): Q4 means 2026, and Q1 to Q3 mean 2027.
- **Validation rule** on open deals only (closed and on-hold deals exempt; taking a deal off hold and saving makes it fire): a quarter-and-year before the current quarter is refused, with a message like "You need to adjust the quarter to represent when this deal is likely to close." The current quarter is allowed.
- **When the rule stops a save (answered 2026-11-01):** only when the deal is new or its quarter, year, stage, on-hold flag or value is being changed, so automatic updates (Chatter date, stage-date flows) are never blocked.

## What is there today (read-only, PROD, 2026-11-01)

- `Expected_Closure_Quarter__c` ("Expected Conversion Quarter"): locked picklist Q1 to Q4, history tracked, on the 60 record types, 7 page layouts and one compact layout, and in the Power BI formula `pbiCloseQuarter__c`. **None of that is touched under this approach.**
- Nothing else uses it: none of the 324 flows, no Apex, no workflow rule, no Lightning component, neither existing validation rule. (Reports, dashboards and list views were not checked; Setup's "Where is this used?" shows them.)
- Data (PROD): 2,311 deals. Open 1,274 (1,191 with a quarter: Q1 279, Q2 289, Q3 192, Q4 431; 83 without). Closed 1,037 (643 with a quarter; 394 without).

## The design

1. **One new field on the deal:** label **Expected Closing Year** (to sit beside "Expected Conversion Quarter"; Robert called it "expected closing year"), API name `Expected_Closing_Year__c`, **text of 4 characters** ("2026"). Text, not a number, because Salesforce shows numbers with a comma ("2,026"); not a picklist, because a picklist's values would have to be added to all 60 record types again and topped up every year. A check on the field (inside the validation rule) allows only a sensible year (this year to four years on). Description and help text as for every field.
2. **Backfill (UAT first, by me; PROD by Robert as a data load):** fill the year of every open deal that has a quarter, by the current-or-next rule. Only the new field is written. The old quarter and its history are untouched. **Closed deals are filled too (Robert, 2026-11-02):** the year they closed, so that if one is ever reopened the rule applies. PROD read-only 2026-11-02: of 643 closed deals with a quarter, only 12 have a Close Date, but 579 have a Last Stage Change Date (2023: 13, 2024: 67, 2025: 309, 2026: 190); 64 have neither. **Rule (Robert, 2026-11-02): the year of the Last Stage Change Date; if there is none, the year the deal was created (or the following year; nobody will look at these).**
3. **Validation rule** `Pipeline_Quarter_Not_In_The_Past` as above, reading the quarter and the year together. A deal with a quarter but no year yet is **not** refused (so nobody is blocked while the year is being filled in); the rule starts applying the moment a year is there.
4. **Pipeline screen.** Everywhere Pipeline shows or filters the quarter it uses quarter and year together ("2027 Q1"): the deal flyout edits both in one control (pick a quarter and the year is suggested by the current-or-next rule), the lists and summaries sort by year then quarter, and the close-quarter range filter works on the combined value. A deal with a quarter and no year is shown with the quarter alone and treated as the current-or-next occurrence.
5. **Where the year is entered.** In Pipeline, always. On Salesforce's own pages only if the field is added to the layouts (question 1 below).

## Layouts: UAT and PROD are not the same (read-only check, 2026-11-02)

- **PROD has 7 page layouts on the deal object, and all 7 carry the quarter:** CMFT SALE APAC, EXTREMITIES SALE APAC, HIP SALE APAC, KNEE SALE APAC, RISK SALE APAC, ROSA SALE APAC, ZBEdge Opportunity.
- **UAT has 9:** the same 7 plus **ROSA SALE China** and **SHOULDER SALE APAC** (8 of the 9 carry the quarter). Those two do not exist in PROD.
- So the layouts are not identical between the orgs, and UAT may have drifted from PROD in other ways too. **Plan:** in UAT the year field is added beside the quarter on every layout that has the quarter. **For PROD, Robert adds the field to the 7 layouts by hand** (drag it in beside the quarter) rather than deploying UAT's layouts over PROD's, which could overwrite other differences; the list above is the checklist. (Gearset could do it instead if Robert compares the layouts first.)
- Page layouts are also assigned per profile; adding a field to a layout shows it to everyone on that layout. Field access (who may see or edit it) is given by the `Pipeline_User` permission set, and by Robert's own profiles or permission sets for people who do not use Pipeline.

## What to expect

- **Impact on PROD: one new field** (and, if chosen, an edit to up to 7 page layouts). No change to the quarter field, its history, its record types or Power BI.
- **The cost of two fields:** someone editing only the quarter in Salesforce's own page leaves a stale year behind. The validation rule is what catches that: changing the quarter makes the rule check the pair, and an old pair is refused until the year is fixed too.
- **Backfill side effects:** about 1,200 deals get a new last-modified date and user; the new field has no history tracking, so no history lines are added.
- Power BI keeps seeing "Q4" exactly as now; a year column can be added there when wanted.

## Questions for Robert (one at a time)

1. **ANSWERED (Robert, 2026-11-02): yes, the year goes on every layout.** Add the year field to the 7 page layouts** (beside the quarter) so people on Salesforce's own pages can see and set it, or **leave the layouts alone** and set the year only in Pipeline? Adding it edits 7 existing layouts (small, and in UAT first); leaving it off means someone on a Salesforce page cannot fix a year there.
2. **ANSWERED (Robert, 2026-11-02): fill closed deals too: year of the Last Stage Change Date, else the year created.** Reason: a reopened deal then meets the validation rule.
3. **ANSWERED (Robert, 2026-11-02): leave the 83 open deals with no quarter blank.**
4. **ANSWERED (Robert, 2026-11-02): no integration writes to deals; only end users and Robert (sys admin) update them. Integrations only read.** So the validation rule needs no integration exemption.
5. **ANSWERED (Robert, 2026-11-02): label "Expected Closing Year", API name `Expected_Closing_Year__c` (no Pipeline prefix; free in UAT and PROD); a picklist of full years 2023 to 2033, listed newest first (2033 down to 2023, so the earliest is last); the values are added to the 60 record types (Robert: "just put the years in"); Robert adds later years himself as the years go on.** Closed deals created before 2023 with no Last Stage Change Date get 2023. All five questions are now answered; waiting for Robert's word to build in UAT.

## Field access by profile (Robert will grant it by hand, 2026-11-02)

The old object gives field access through profiles, so Robert adds **Expected Closing Year** (read and edit) to each profile that people use to work on deals, in UAT now and in PROD at go-live. Pipeline_User already grants it to Pipeline users. Read-only check on 2026-11-02 of profiles that can edit Expected Conversion Quarter and have active standard users (people count):

- **Sales (the ones that matter most):** AP-FORCE100-AU-Standard (UAT 320, PROD 351), AP-FORCE100-IN-Standard (83, 83), AP-FORCE100-TH-Standard (36, 48), AP-FORCE100-NZ-Standard (36, 41), AP-FORCE100-TW-Standard (33, 37), AP-FORCE100-KR-Standard (28, 26), AP-FORCE100-SG-Standard (26, 44), AP-FORCE100-MY-Standard (16, 24), AP-FORCE100-HK-Standard (12, 12), AP-FORCE100-ANZ-OSSIS (8, 13), AP-STANDARD-AU (9, 12), System Administrator (9, 5).
- **China:** Force.com China Sales (97, 115), plus Strategy Marketing, Data Admin (UAT), Account Data Admin (PROD), Operation, QA, Instrument, Finance, CS, Channel (UAT), Sales Operation (PROD), Sales Operation Maintenance (PROD), Service Engineering (PROD), ZBI, AP-CHN-ZBI, AP-CHN-ZBI-Manager.
- **Small or system:** Standard Platform User, AP-FORCE-HK-CS, AP-AU-WALLBOARD (PROD), and the integration and analytics profiles (they only read, so they do not need it).

54 profiles in UAT and 57 in PROD can edit the quarter, but only about 35 have an active person on them.

## Built in UAT (2026-11-02)

- Field `Expected_Closing_Year__c` (picklist 2033 to 2023), values on 61 record types, 8 layouts, `Pipeline_User` access (deploy `0AfOg000007ChErKAK`).
- **Backfill (bulk update, 1,486 deals, 0 failed):** open with a quarter: Q4 gets 2026 (327), Q1 to Q3 get 2027 (694); closed with a quarter: year of Last Stage Change Date (2023: 13, 2024: 65, 2025: 320, 2026: 5), else year created, never earlier than 2023 (62, all 2023). Open 114 and closed 397 deals without a quarter stay blank. A one-deal test first showed existing automation changes nothing else on a deal. UAT has 1,997 deals (older copy than PROD's 2,311), so the PROD counts will differ.
- **Validation rule `Pipeline_Quarter_Not_In_The_Past`** (shortened: Salesforce allows 40 characters). Refuses an open, not-on-hold deal whose quarter and year are before the current quarter, only when the deal is new or its quarter, year, stage, on-hold flag or annual value changes; blank quarter or year is allowed; error shows at the top of the page. **Data-load switch:** custom permission `Pipeline_Bypass_Quarter_Rule`, granted by permission set `Pipeline Quarter Rule Bypass` (assign to the admin while loading, then remove). Tested in UAT with rollback, 8 cases, all as designed: past quarter refused (Q1 2025, Q3 2026); current quarter (Q4 2026) and future saved; on hold, closed, quarter-less and year-less saved.
