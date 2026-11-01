# Pipeline — Build Spec

The record of what is built (objects, fields, permission sets, component names). First checkpoint of slice 1 is built and in UAT (below). DEV and PROD have nothing.

## Build plan (proposed 2026-11-01, awaiting Robert's word "build"; nothing built yet)

Order: UAT first, dry run then real deploy, then DEV; Robert releases to PROD by Gearset. Everything carries the `Pipeline` prefix and a description. Pattern copied from ACCRURA (`../Accruals`, reference only): an Aura app hosts a Visualforce page that hosts the LWC; a tab and an app; Apex controller plus test class; permission set; static resources.

**What UAT has (read-only check, 2026-11-01):** every object and field the design uses (`Team__c`, `Team_Member__c`, `Case__c`, `myCase_Usage__c`, `myCase_Usage_Item__c`, `Usage__c`, and on `SalesRisks__c` both `IsClosed__c` and the UAT-only `Status__c`). Build against PROD's shape: use `IsClosed__c`, never `Status__c` or `Total_Annual_Value__c`.

**UAT is thinner than PROD:** `SalesRisks__c` 1,997 vs 2,311; `Team__c` 42 vs 47; `Team_Member__c` 180 vs 231; `Case__c` 1,244 vs 262,319; `myCase_Usage_Item__c` 1,252 vs 1,003,349. The surgeries rule cannot be speed-tested in UAT; check its query plan for a busy surgeon with a read-only PROD query before relying on it.

### Slice 1: the manager and rep screen, read only

- Apex: `PipelineController` (who is signed in, manager or member from Teams, the deals per type with value, stage, quarter, last posted, stage move), `PipelineScope` (which deals a person may see: manager = their team and everyone below; member = own), `PipelineControllerTest`. `with sharing` for deals; setup data (teams) read in `SYSTEM_MODE`. Option lists (stages, brands, countries, states, teams) read live, never typed in.
- LWC: `pipelineApp`, `pipelineChoose` (Choose Your Data), `pipelineSummary` (panels, chips, quarters), `pipelineTypeList` (lists, Columns picker, grouping by rep, tint), `pipelineSettings` (cog flyout), `pipelineColumnResize`, `pipelineFormat`, `pipelineStyles`, with Jest tests for the pure logic.
- Shell: `PipelineOut` Aura app, `PipelineApp` Visualforce page, `Pipeline_Home` tab, `Pipeline` app, `Pipeline_User` permission set (add each Apex class in the same change), brand static resources, version constant on screen.
- Saved user choices: a separate `Pipeline_User_Setting__c` (dark or light, tint, columns, last filter), one record per user. Nothing added to `SalesRisks__c`.

### Slice 2: the deal flyout

Fields in play for the deal type, editable; stage path bar; Previous and Next; Chatter post and reply as the signed-in user. **Risk to test first:** saving from Pipeline fires the same existing flows and validation rules as the standard page; check each in UAT with sample deals.

### Slice 3: usages, surgeries, saved filters

`Usage__c` and the Account ratings; surgeries by type for the last 365 days from `Case__c` using the usage-item rule (Requirements 5W); `Pipeline_Saved_Filter__c` (JSON per filter, shareable, holds columns and grouping).

### Slice 4: quarter and year

Year-qualified `Expected_Closure_Quarter__c` values, a backfill, and the validation rule that fires only when the quarter is set or changed (Requirements 5X). **This changes something that already exists, so it needs Robert's explicit sign-off on that item, a dry run, and PROD goes by Gearset.**

### Not in the first build

Rep mobile (Q4, Q5, Q7, Q12), events (Q31), export.

## Built so far

### Slice 1, checkpoints 1 and 2 (UAT only, 2026-11-01; not in DEV yet)

Deployed to UAT with `PipelineControllerTest` (5 Apex tests and 15 Jest tests passing; each dry run was clean first). The `Pipeline_User` permission set is assigned to Robert's UAT user. Everything is in `force-app/main/default/`.

| Piece            | Name                                                                                                                                                  | What it is                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apex             | `PipelineScope`                                                                                                                                       | Works out whose deals a person may see from `Team__c` and `Team_Member__c`: manager of at least one team = their team and every team below; otherwise own deals only.                                                                                 |
| Apex             | `PipelineController`                                                                                                                                  | `getContext` (who, manager or not, teams, stage order, saved settings), `getDeals` (deals by kind, open/closed/both, team, in the person's own access), `saveSettings`.                                                                               |
| Apex test        | `PipelineControllerTest`                                                                                                                              | Five tests: member, manager and teams, settings round trip, bad settings refused, deals by kind.                                                                                                                                                      |
| Object           | `Pipeline_User_Setting__c` (`Settings_Json__c`)                                                                                                       | One private record per person holding their own screen choices as JSON.                                                                                                                                                                               |
| LWC              | `pipelineApp`                                                                                                                                         | The shell: header, settings flyout (dark/light, tint), loading, version constant (`PIPELINE_VERSION`), full screen.                                                                                                                                   |
| LWC              | `pipelineChoose`                                                                                                                                      | Choose Your Data: deal types, open/closed/both and closed range, team (managers), rep (managers), country, state, portfolio, brand.                                                                                                                   |
| LWC              | `pipelineTypeSummary`                                                                                                                                 | The summary panel for one kind (up to three equal panels across; a lone one takes half the width): deals, value per currency, needs attention, a line of late deals; the chevron opens the stage chips and close-quarter bars on all panels together. |
| LWC              | `pipelineTypeList`                                                                                                                                    | The list for one kind, grouped by sales rep with heavier lines (not grouped when one rep), Columns picker, sorting, draggable column widths (kept in the person's settings), a row opens the record.                                                  |
| LWC              | `pipelineTeamTable`                                                                                                                                   | Managers only: one row per person (team, open deals, value per kind, late counts); click a person to look at just them. Starts closed.                                                                                                                |
| LWC              | `pipelinePipe`, `pipelineColumnResize`                                                                                                                | The chrome pipe with live two-colour words (logo, Choose Your Data, Your Settings); the column-drag helper.                                                                                                                                           |
| Static resources | `Pipeline_Pipe_Blank`, `Pipeline_Pipe_Blank_Wide`                                                                                                     | The pipe artwork from `brand/`.                                                                                                                                                                                                                       |
| LWC              | `pipelineFormat`, `pipelineStyles`                                                                                                                    | Shared rules (money per currency, 30/90 day bands) with Jest tests, and shared styling.                                                                                                                                                               |
| Shell            | `PipelineOut` (Aura app), `PipelineApp` (Visualforce page with the splash), `Pipeline_Home` (tab), `Pipeline` (app), `Pipeline_User` (permission set) | Same pattern as ACCRURA.                                                                                                                                                                                                                              |

**Choices made that Robert has not confirmed (check these):**

1. Closed deals are limited by "closed in the last N months", measured from `Last_Stage_Change_Date__c` (the stage change into the closed stage).
2. A deal nobody has posted on, or whose stage never changed, counts its days from the created date (shown in the tooltip).
3. The owner's state is shown as stored in Salesforce (for example "Victoria", "NZ"), not shortened to NSW/VIC.
4. Stage chips show only the stages that have deals in the current list (the stage order comes from the Stage picklist).
5. Segment for opportunities comes from the record type (Hip, Knee, Extremities, CMFT, ZBEdge, Sports Medicine, Trauma); for risks from `Portfolio__c`.

**Not built yet (still slice 1):** the Team table has no resizable columns; panels and lists do not remember whether they were open; light-mode polish. The Team table (click a rep) and the column drag are covered by Jest only, not yet tried by hand on the live page.

**Tested:** Apex tests in UAT; the live page in headless Chrome in dark mode (rep view with Robert's 3 deals, Risks and ROSA on, Both, the Columns picker, the settings flyout and Light mode). **Not tested:** the manager view (Robert is not a team manager in UAT), settings persisting after a reload, the Closed filter with real closed deals, a phone.

### Slice 2, checkpoint 1: the deal flyout (UAT only, version 0.6, 2026-11-01; not in DEV yet)

Click a deal in any list and it opens in a large right-hand flyout (88% of the screen, the screen behind it blurred and switched off). Deployed to UAT with `PipelineChatterControllerTest` and `PipelineControllerTest` (9 Apex tests passing, dry run clean first; 17 Jest tests passing).

| Piece     | Name                            | What it is                                                                                                                                                                                                                                                                                                             |
| --------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LWC       | `pipelineDeal`                  | The flyout: title, stage path (from the stage choices for the deal's record type; clicking a step sets the stage), strip of key numbers, the deal's fields per kind (opportunity, risk, ROSA), Previous / Next through the list it was opened from, unsaved-changes prompt, Cancel / Save changes, Open in Salesforce. |
| LWC       | `pipelineChatter`               | The deal's Chatter: newest posts with replies, write a post, reply, as the signed-in person, @Name mentions.                                                                                                                                                                                                           |
| Apex      | `PipelineChatterController`     | `getFeed`, `post`, `reply`. Posts through Chatter's own API so a full-name @mention is a real mention and Salesforce sends its own notification.                                                                                                                                                                       |
| Apex test | `PipelineChatterControllerTest` | Four tests (feed order, empty and huge posts refused, the mention splitter, the Chatter API path).                                                                                                                                                                                                                     |

**How saving works:** the flyout reads and saves with Salesforce's own record service (`lightning/uiRecordApi`), so field access, validation rules and the deal's existing automations behave exactly as on the standard page. The lists of choices (stage, quarter, brand, portfolio, currency and so on) are read live for the record type (`getPicklistValuesByRecordType`), never typed in.

**Tested live in UAT with one sample deal (created, then deleted):** opened a deal; changed stage and value and saved (the existing flows set Last Stage Change Date); posted with an @mention (the existing process set Latest Chatter Date); replied; changed a field then pressed Previous (the unsaved-changes prompt appeared; Discard moved to the previous deal).

**Not built yet in slice 2:** the Primary HCP and Healthcare facility are shown but cannot be changed here (they need a record picker); Link To ROSA Deal is not shown; no @mention picker (the full name is typed); not tested: a save that a validation rule rejects, a ROSA deal, a deal in another country, a phone, a person without edit access.

### Slice 3, checkpoint 1: Usages and Surgeries in the flyout (UAT only, version 0.7, 2026-11-01; not in DEV yet)

Two cards under "The deal" in the deal flyout, for opportunities and risks (not ROSA). Deployed to UAT with `PipelineSurgeonControllerTest` (15 Apex tests across the three test classes passing, dry run clean first; 25 Jest tests passing).

| Piece     | Name                            | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apex      | `PipelineSurgeonController`     | `getUsages` (the four ratings from the Account, the surgeon's `Usage__c` lines, when they were last changed) and `getSurgeries` (the last 365 days, past only, by surgery type). All in the person's own access; changes nothing.                                                                                                                                                                                                                                                    |
| Apex test | `PipelineSurgeonControllerTest` | Six tests (usage lines, shoulder, ratings, the surgery rule with in-memory cases, no surgeon, a full surgeon with a usage, a surgery with an item on a manual sheet, and a surgery without).                                                                                                                                                                                                                                                                                         |
| LWC       | `pipelineUsages`                | Ratings (the deal's own area outlined), last-updated line with an out-of-date warning, and, opened by the chevron (open by default), the usages grouped by hospital: Hip as a heading over Stems and Cups, Shoulder over Anatomical and Reverse, Knee and CMFT single lines; the deal's own area shaded; "ZB" in amber. A manager looking at someone else's deal gets "Ask X to check them", which puts a prepared request in the Chatter box (not posted); a rep gets a plain note. |
| LWC       | `pipelineSurgeries`             | Bars by type (Hip, Knee, Shoulder / Elbow always; another type when it has surgeries).                                                                                                                                                                                                                                                                                                                                                                                               |

**The surgeries rule (Requirements 5W):** a surgery counts only when at least one `myCase_Usage_Item__c` is linked to one of its `myCase_Usage__c` sheets, the manual sheet included. Checked in UAT for one surgeon against a direct query (6 past surgeries, 3 with items, the card shows 3). Speed checked read-only in PROD for the busiest real surgeon (702 surgeries, about 5,600 items): about one second a query.

**Choices made that Robert has not confirmed (check these):**

1. "Usages last updated" is the most recent change (`LastModifiedDate`) of any of the surgeon's `Usage__c` records, since there is no usage date field. Robert's note said "oldest usage, or the last usage entered and when modified".
2. The out-of-date warning shows at **2 years** or more. **Confirmed by Robert, 2026-11-01** ("just warn them the last update was 2 years ago"; he likes that it simply says when the usage was last updated and said something additional may be coming).
3. A product with no company and 0 or blank cases is not shown as a usage (the data holds 0 for unused products).
4. A surgeon's other surgery types (Spine, Trauma, Sports Med and so on) are listed only when they have surgeries.

**Bugs found and fixed on the live page during this checkpoint:** the Surgeries card said "no Primary HCP" (the surgeon was not passed back); unused products showed as "– 0". Both now have a test.

**Not built yet:** the Primary HCP and Healthcare facility pickers (Account has separate record types `Physician` and `Healthcare_Facility`, which settles which accounts each picker offers); saved filters (the rest of slice 3); no hospital column in the surgeries; not tested: a surgeon with several hospitals and a hip with both stems and cups on live data (covered by Jest only), a manager viewing someone else's deal, NZ and other countries.

### Slice 3, checkpoint 2: saved filters (UAT only, version 0.8, 2026-11-01; not in DEV yet)

Deployed to UAT with all four Apex test classes (19 tests passing, dry run clean first; 31 Jest tests passing).

| Piece     | Name                                                           | What it is                                                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Object    | `Pipeline_Saved_Filter__c` (`Filter_Json__c`, `Is_Default__c`) | One record per saved filter, private to its owner. The Name is the filter's name.                                                                                                                                                              |
| Apex      | `PipelineFilterController`                                     | `listFilters`, `saveFilter` (new, or update one of your own), `deleteFilter`, `setDefault`, `searchPeople`, `shareWithPeople`, `shareWithTeam` (team managers only). Only your own filters can be changed.                                     |
| Apex test | `PipelineFilterControllerTest`                                 | Four tests: save, list, update, default, delete; bad name or JSON refused; sharing gives the other person their own copy and nobody can touch another person's filter; only a team manager can share with a team.                              |
| LWC       | `pipelineFilters`                                              | "My filters" in the settings panel: save what is on the screen, update the open filter, star one as the default, open, delete (asks first), share (find a person by name; managers also "Share with my team").                                 |
| App       | `pipelineApp`                                                  | A "My filters" dropdown in the header; opens on the default filter (else, as before, the person's own team or own deals); a filter holds the choices and the list columns; a team that is not the person's is dropped when a filter is opened. |

**Tested live in UAT** (one test filter, deleted afterwards): saved a filter with Risks on; starred it; the header dropdown listed it; a fresh load opened on it with no clicking. **Sharing is covered by the Apex tests only** (a live test would create filters in other people's accounts).

**Not done:** a filter does not yet hold the column widths or the Team table state; the filters list is not sorted by recent use; a shared copy keeps the original name (there is no "from Robert" label).

### Rebuild to match the final mockup v37 (UAT only, version 0.10, 2026-11-01; not in DEV yet)

Robert spotted (2026-11-01) that the screen had drifted from mockup v37 (the Choose Your Data panel was always on screen, the lists were not full width) and chose to **follow the mockup**. Deployed to UAT with all four Apex test classes (19 passing, dry run clean first); 54 Jest tests passing.

| Mockup v37                                                                                                                                                                  | Built (0.10)                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header: cog, logo, "version · As at <time>", Full screen                                                                                                                    | `pipelineApp` header; the version and the time of the last read                                                                                                                                                                                                                                                                                                                                            |
| Filter bar: three round-tick type buttons, Open / Closed / Both / **Custom** (worked out from the stages), chips saying what is looked at, My filters, **Change selection** | `pipelineBar`                                                                                                                                                                                                                                                                                                                                                                                              |
| **Change selection** panel: opens over the screen, nothing changes until **Apply**; Cancel; Reset; Save as filter                                                           | `pipelineSelection`: team tree (My team first, search, expand, include teams below) and owner search (managers); country, state (when Australia is chosen); only rep priority / state priority / on hold; portfolio; brand; **stages for each chosen type read from Salesforce**; a range of expected close quarters; only deals that need attention; how far back closed deals go (3, 12, 24 months, all) |
| Colour legend above the lists                                                                                                                                               | in `pipelineApp`                                                                                                                                                                                                                                                                                                                                                                                           |
| Lists full width; a heading per rep with the deal count and total; collapse a rep; **Collapse all**; a Status column                                                        | `pipelineTypeList` (a collapsed rep shows one line: the total, the freshest post and stage move, the oldest age, how many need attention)                                                                                                                                                                                                                                                                  |
| Rules for what a choice means                                                                                                                                               | `pipelineFilterModel` (pure, tested)                                                                                                                                                                                                                                                                                                                                                                       |

**Server changes (`PipelineScope`, `PipelineController`):** a manager may look at **My team** (the teams they manage and everyone below), **any team** (and below), or **no team** (everything sharing lets them see, narrowed by the other choices); every team is offered. A rep always sees only their own deals. The deals call takes the **stages chosen** (open stages always; closed stages only within the closed range); a saved filter from version 0.8 that holds open / closed / both still opens. New: `searchOwners`.

**Differences from the mockup that remain (from reading v37 against 0.10):**

1. ~~Country, state, portfolio, brand and quarter choices came only from the deals read~~ **Fixed in the next change (below):** they now come from Salesforce's own lists. Still different from the mockup: the brand list is not narrowed by the portfolio and country chosen (the mockup showed only the brands that apply).
2. The quarter choices have no year yet (slice 4).
3. The owner search does not say "has deals / no deals".
4. The mockup's risk stages included "Settled", which is **not** a stage in Salesforce; the real risk stages are the four open ones and Closed Retained and Lost Business.
5. Panels and lists do not remember whether they were open; the Team table cannot be resized.
6. **Not tested live** (Robert is a team member, not a manager, in UAT): the team tree, My team, any team, no team, the owner search, Include teams below, and a manager's Team table; covered by Jest and Apex tests only. Robert will test the manager view as another user.
7. `pipelineChoose` (the old always-visible panel) is no longer used but is still in UAT: Salesforce refused to delete it, saying `pipelineApp` refers to it, although the deployed app does not. To retry later.

### Team Viewer and live option lists (UAT only, version 0.10, 2026-11-01; not in DEV yet)

**Pipeline Team Viewer** (Robert, 2026-11-01, option 2): a person who is **not** named as a team's manager can still get the manager view (any team, no team, the owner search) with the new permission set `Pipeline_Team_Viewer`, which grants the custom permission `Pipeline_View_Any_Team`. It needs `Pipeline_User` as well and gives no extra access to deals (sharing still decides). Why: Robert manages no team (checked in PROD and UAT) yet needs to drill down by team, and the same goes for a director's office. **Who gets it is for Robert to decide.** `PipelineScope` treats a person as a manager when they manage a team **or** hold the permission; "My team" is offered only to someone who manages a team (a viewer opens on no team, which is everything sharing lets them see). Assigned to Robert's UAT user. Two Apex tests cover it (a viewer; a person with neither).

**Option lists are read from Salesforce** (Robert's rule, and his complaint that he could pick only one country and one state): countries from the Teams country list (AU, NZ, SG, MY, TH, CN, TW, HK, KR, IN), Australian states from the Teams state list, portfolios from the deal's Portfolio list (ROSA is a type, not a portfolio), brands from the deal's Brand list, quarters from the deal's quarter list; anything extra found in the deals read is added. States are stored on the owner as full names, so choosing VIC matches "Victoria". Tested live in UAT as a Team Viewer: all ten countries offered; the team tree and owner search shown; the screen opens on everything Robert can see (773 opportunities, 125 people, value per currency).

**To-do (from Robert):** people outside a team must be able to drill down by teams (done by the Team Viewer permission; a tidier way for a viewer to pick their starting team, and a first look at the PROD team structure, remain to do). Still to do from the mockup: brand choices narrowed by portfolio and country.

### Brands narrowed, record pickers, remembered panels (UAT only, version 0.10, 2026-11-01; not in DEV yet)

Deployed to UAT with all five Apex test classes (24 passing, dry run clean first); 61 Jest tests passing.

- **Brand choices follow the portfolio and countries chosen** (mockup rule): until a portfolio is picked the panel says "Pick a portfolio above to choose its brands"; then only the brands Salesforce holds for the matching record types (for example NZ Knee) are offered, read once each and remembered. Tested live: Knee across all countries gives 12 brands, Knee in Australia 10.
- **Pickers in the deal flyout for Primary HCP, Healthcare facility and Link To ROSA Deal** (`pipelineLookup`, `PipelineLookupController`, `PipelineLookupControllerTest`). Salesforce's own lookup search is not available to a custom screen, so the search follows each field's own lookup filter, read from PROD on 2026-11-01: Primary HCP only person accounts; Healthcare facility only accounts that are not person accounts; Link To ROSA Deal only ROSA deals (`pbiRecordType__c` = ROSA). **If those lookup filters change in Salesforce, change `PipelineLookupController` too.** Saving still goes through Salesforce, which applies the real filter, so a wrong offer is refused, not saved. After a save the Usages and Surgeries cards read again (a new surgeon has other usages). Tested live: the facility search for "private" offers only hospitals; the HCP search for "verheul" offers only the doctor. Not tested: saving a changed HCP or facility (nothing of Robert's was changed).
- **Panels remember whether they were open** in the person's own settings: the summary panels, each list, and the Team table. Tested live across a reload (Robert's UAT settings were restored afterwards).
- A test run as the deploying user failed because Robert now holds the Team Viewer permission; that test now runs as a plain user.

**To-do list (kept here; Robert's words in bold):**

1. **People outside a team must be able to drill down by teams:** done as the Team Viewer permission; still to do: a tidier way for a viewer to pick a starting team, and a look at the PROD team structure.
2. Team table: resizable columns.
3. Slice 4: quarter and year (needs Robert's sign-off, a dry run, and Gearset for PROD).
4. Deploy to DEV once Robert says UAT is fine; release to PROD is Robert's, by Gearset.
5. Retry removing the unused `pipelineChoose` bundle from UAT (Salesforce says `pipelineApp` refers to it).
6. A filter should hold the column widths; a "from Robert" label on a shared filter.
7. Test, as another user, the manager view (team tree, owner search, My team, no team).
8. Rep mobile (Q4, Q5, Q7, Q12); events (Q31); the "something additional" Robert mentioned for the usages warning.

### Version 0.11 (UAT only, 2026-11-01): record pickers are one box

Robert's feedback on the deal flyout: the separate "Search by name" box under Primary HCP / Healthcare facility / Link to ROSA deal was confusing. Now each is one box: the chosen name with a cross; click the cross and the same place becomes the search box (cursor ready). `pipelineLookup` changed; Jest test added. Nothing else changed.

### UAT clean-up (2026-11-01)

- `pipelineChoose` is gone from UAT. Salesforce was refusing because `pipelineApp.css` still had a style rule naming `c-pipeline-choose`; the rule was removed, `pipelineApp` redeployed, then the old bundle deleted (destructive deploy, UAT only).
- Robert deleted the **Pipeline Lightning app** in UAT while trying to delete it himself. It is still in the repo (`applications/Pipeline.app-meta.xml`) and `Pipeline_User` lists it; redeploy it before the next permission set deploy, or that deploy will fail. He said to put it back later.
- To do: remember the last applied selection (Robert: he picks Australia, Apply, and after a reload it is gone). Today only a starred saved filter reopens; waiting on his answer on how it should remember.

### Version 0.12 (UAT only, 2026-11-01): icons, filled buttons, remembers the last selection

Robert's feedback: "Save as filter" was invisible (now an outlined button), "Change selection" is now a filled indigo button, and the text "Full screen" and the ⚙ glyph are replaced by the icons COVRA/NPI/ACCRURA use (cog top left, expand/collapse top right), drawn as solid indigo squares. **Unconfirmed: whether "filled in" meant the solid square (built) or a solid-shaped glyph; one CSS rule (`.icb` in `pipelineApp.css`) to change.**
Selection memory: every applied selection is saved in the person's own settings (`settings.last`) and Pipeline opens on it. **Unconfirmed choice: a starred default filter still wins over the last selection.**

### Version 0.13 (UAT only, 2026-11-01): every pipe is the same height

Robert: the PIPELINE, YOUR SETTINGS and CHOOSE YOUR DATA pipes looked different; Choose Your Data was bigger. Cause: each was sized by its width, so the wider one came out taller (about 53 px against 42 px). `pipelinePipe` now takes one `height` (default 42 px) and works out the width from it, so a longer heading gets a longer pipe, never a taller one. The wide pipe's band holds roughly 16 characters at the heading size; a longer heading needs a longer pipe built with `scripts/build_pipeline_pipe.py --extra N` (new static resource).

### Versions 0.14 and 0.15 (UAT only, 2026-11-01): panel animation, stage bar

- **0.14, animation (Robert: the three panels were supposed to fly in and out).** The settings flyout (from the left), Change selection (down from the top) and the deal flyout (from the right) were switched on and off instantly. Each now slides in over 0.4 s and slides back when closed; the app keeps each panel on the page for a moment after closing so it can slide away (`panelOn`/`flyOn`, `SLIDE_OUT_MS`). The settings panel now has the blurred, darkened background and the 3 px indigo edge the mockup has (500 px wide, was 430). Checked on live UAT by sampling each panel's position mid-slide, in and out. Reduced-motion settings turn the slide off.
- **0.15, stage bar in the deal flyout.** Steps are equal width with centred labels (as in mockup v37; they were padded unevenly). Every stage already passed is outlined in the colour of the stage the deal is at now (purple at Commit, teal at 5th Case, green at Closed Won, red at Lost), so progress shows. Not yet seen rendered on live UAT (browser cache); Robert to confirm.

### Version 0.16 (UAT only, 2026-11-01): list header bands

Robert: tint the top bar of each of the three lists so they separate when scrolling, and make the count (for example "195 opportunities") as prominent as the summary panel titles. The header is now a full-width band across the top of the card, tinted with a light version of the brand amber (`--pipe`, so it also suits light mode), with the title at 18 px, bold capitals, amber, the same as the summary panel titles. `pipelineTypeList.css` only.

### Version 0.17 (UAT only, 2026-11-01): fix for the deal flyout showing empty

Versions 0.14 to 0.16 broke the deal flyout: it opened but showed no deal (name, fields, stages all empty). Cause: when the slide classes were added to `pipelineDeal.js`, they were put between the `@api` marker and `get deal()`, so `deal` stopped being a public property and the screen could not hand the deal over. Fixed in 0.17 and checked on live UAT (name, fields, Plan/Action outlined purple at Commit). A Jest test (`pipelineDeal.test.js`) now fails if `deal` stops being public, or if the flyout does not slide in when told to open; it was shown to fail on the bug.

### Version 0.18 (UAT only, 2026-11-01): even outlines on the stage bar

Robert noticed the coloured outline on passed stages was thinner on the slanted edges. Cause: the inner arrow was the full arrow shrunk 2 px, which leaves less than 2 px on a slope. The inner arrow (`--inner` in `pipelineDeal.css`) now has its slanted corners moved by the calculated amounts for a 14 px point on a 44 px bar, so the ring is an even 2 px all round. Checked on live UAT in a magnified screenshot.

### Version 0.19 (UAT only, 2026-11-01): Team table columns resize

The Team (People) table now has the same draggable column edges as the lists: drag an edge to resize, double-click one to reset all. Widths are kept in the person's own settings under `widths.team`. `pipelineTeamTable` only, plus two lines in `pipelineApp`. Checked on live UAT (dragged the Rep column from 189 to 289 px, others unchanged); Jest tests added. Robert's UAT settings were backed up and restored exactly after the live test.
Committed and pushed up to 889afac (v0.18); 0.19 is not yet committed.

### Version 0.20 (UAT only, 2026-11-01): People table header band

The People/Team table header now has the same tinted amber band and 18 px amber title as the three lists (`pipelineTeamTable.css` only). Checked on live UAT.
Note: after the 0.19 live test Robert's UAT settings were restored exactly; later changes to them (People table open, resized columns in the People table and the opportunities list) were made by Robert himself and were left alone.

### Version 0.21 (UAT only, 2026-11-01): closed cards shrink to their band

Robert: when a list or the People table is closed it should show just its coloured band, with no white strip under it. A closed card (`pipelineTypeList`, `pipelineTeamTable`) now has no bottom padding and a fully rounded band. Checked on live UAT. The check collapsed the cards and may have saved that state in Robert's UAT settings (opportunities list shown as collapsed afterwards); reopening them with the chevron is all that is needed.
Not yet committed: 0.19, 0.20, 0.21.

### Version 0.22 (UAT only, 2026-11-01): lists and People table fold open and shut

Robert: closing and opening the three lists and the People table should be animated like the settings and Change selection panels, folding out and back in. The body of each now unfolds from nothing to its full height (0.4 s, same easing as the other panels) with a fade, and folds back; the card's spacing eases with it. Mechanism: the body is a CSS grid row that goes 0fr to 1fr (`.fold` / `.bodyin`), kept on the page for 0.45 s after closing so it can fold away. Checked on live UAT by sampling the Risks list height mid-fold (1143, 451, 48 px closing; 382, 1115, 1143 px opening) and ending open, as it started. Not yet animated: the summary panels at the top (Opportunities, Risks, ROSA). Not yet committed: 0.19 to 0.22.

### Versions 0.23 and 0.24 (UAT only, 2026-11-01): amber stars, summary panels fold

- **0.23:** the rep priority star in the lists is amber (`.star`, brand amber), the same as the legend's; it was plain text colour. The star is now its own element in the cell (`c.star`), not part of the name text.
- **0.24:** the summary panels at the top (Opportunities, Risks, ROSA) fold open and shut with the same 0.4 s motion as the lists. The first value saved in settings is shown as it is, with no animation on page load; only a click animates. Checked on live UAT (stage part 247, 401, 408 px unfolding; 123, 5, gone folding), ending closed as it started. Jest tests added. Not yet committed: 0.19 to 0.24.
