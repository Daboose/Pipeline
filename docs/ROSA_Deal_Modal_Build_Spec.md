# ROSA Deal Modal: Build Spec

Status: **built in UAT only, 2026-11-28 (ROSA deal 0.1, Pipeline 0.179)** after Robert said "build now". Deploy ids: `docs/ROSA_Shoulder_POC_Build_Log.md`. Not in DEV or PROD, not committed.
Approved mockup: `docs/mockups/archive/rosa_deal_modal_v4.html` (open it in a browser; it's the source of truth for layout, light and dark).
Data model: already built in UAT. See `docs/ROSA_Shoulder_POC_Build_Log.md`. This build adds screens only; any new field needs Robert's sign-off first (CLAUDE.md hard rule 1).

Read `CLAUDE.md` and the AAA Design guides (`/Users/robertreeves/VSCODE/AAADESIGN`) before starting. Every rule there applies: UAT first, dry run then deploy, DEV after Robert approves, PROD only by Robert through Gearset.

---

## 1. Decisions (all made, 2026-11-27)

| #   | Decision                                          | Answer                                                                                                                                         |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Can someone click a stage ahead of the checklist? | **Yes.** The stage bar sets any stage. The checklist still only ever moves the stage forward (existing `ROSAAutomation` behaviour, unchanged). |
| 2   | Who can edit in the modal?                        | Anyone with `ROSA_Deal_Management` edits everything. Everyone else sees the modal read-only (no Edit buttons, no Add surgeon, no Link).        |
| 3   | Marketing view across many deals?                 | **Dropped.** Marketing uses Pipeline filters and campaigns for many deals.                                                                     |
| 4   | Phone?                                            | **Desktop only for now.** Phone may come later once Robert is happy with desktop.                                                              |

Technical calls (made, not for Robert):

- One Lightning Web Component, `rosaDeal` (ROSA prefix, camelCase for LWC), plus an Apex controller `ROSADealController` with its test class `ROSADealControllerTest`.
- Shown in a near full-screen modal (about 97% of the window). Same component everywhere.
- Opened from: (a) a button "Open ROSA deal" on `ROSA_Deal_Record_Page`; (b) Pipeline / campaign app: wherever `pipelineApp` opens `pipelineDeal` for a deal, open `rosaDeal` instead when the deal is a ROSA record type. Check `pipelineApp`, `pipelineDealCampaignAction` and `pipelineMobileCampaigns` (mobile keeps its current screen: desktop only).
- Reuse Pipeline patterns by copying under the ROSA prefix, never importing: `pipelineStyles` look and tokens (light/dark), `pipelineStageSlider` for the stage bar, `pipelineColumnResize` and sort handling for tables.

## 2. Layout (match the mockup)

**Header, always visible**

1. Hospital name, ROSA sales type and deal type tags; country, deal lead, expected close. Right: "Open in Salesforce" (new tab), close.
2. Stage bar: Sales Pipeline, Surgeon Engagement, Executive Presentation, Negotiation, Closed Won, Deal Lost. Clickable (decision 1). Use the Pipeline stage slider look.
3. Five total chips: Surgeons, ZB cases now, ZB cases with ROSA, Growth cases, Credentialed (x / y). Read from the deal's roll-up fields.
4. Checklist pill: full width, soft pink, centred. Ten small bars (1–6, gap, 7a–7d), "Done: <last ticked step>", "Next: <next step>". Clicking opens Checklist.

**Left menu**: Deal (Overview, Surgeons and growth with each surgeon listed under it and a status dot), Process (Checklist, Implementation: greyed until Closed Won), Site (Readiness), Activity (Chatter).

**Overview**: deal fields card with Edit; Checklist card (Current step, Checklist next step); Opportunities linked to this ROSA deal (implant deals whose `Link_To_ROSA_Deal__c` is this deal).

**Surgeons and growth**: + Add surgeon in the card header. Table: Surgeon (left-aligned), then right-aligned: one column per joint (TKA, PKA, THA, TSA/RSA) shown **only if a surgeon has cases for it**, Growth, Q&A (answered / total, "· n No" in red), Credentialing (`ROSA_Credentialing_Summary__c` wording: Not started / Booked for <date> / Attended / Credentialed on <date>), Wave **last, shown only if a surgeon has one**. Below: ZB users by joint (used joints only), Share of cases with ROSA.

**Surgeon** (opened inside the modal): breadcrumb; one row with name + Champion tag, tabs, and previous / next arrows with "n of N".

- _Details and volumes_: Details card (surgeon, career position, champion). No implant-deal field. Volumes card: grouped headings "Now" (Supplier, Cases) and "With ROSA" (Supplier, Cases), then ZB growth; no vertical lines; everything centred except Joint.
- _Q&A_: one line per question: number, question, Yes / No pill, "Name · date" on the same line. Header shows answered and gaps. Answers save on click. Date, number and text questions show a box of that type.
- _Credentialing_: status track (Not started, Booked, Attended, Credentialed), then pathway, status, wave, course date, credentialed date, first case date. No extra notes.
- _Opportunities_: this surgeon's implant opportunities (Primary HCP = surgeon's Account, not ROSA record types). Link sets that opportunity's `Link_To_ROSA_Deal__c` to this deal; Unlink clears it.

**Add surgeon**: side panel covering the whole content area (never sideways scroll). Surgeon search (pick, then Change), career position, champion; credentialing pathway, status, course date, wave (optional); volumes grid. Cancel (red), Save and add another, Save (disabled until a surgeon is picked). Uses the same fields as the existing `ROSA_Add_Surgeon` action.

**Checklist**: three columns (Opportunity, Contract, Implement); each step a tick box with date and who. 7a–7d locked until Closed Won.

**Implementation**: steps 7a–7d and credentialing by surgeon. Only when Closed Won.

**Readiness**: "Site Background" card then "Appropriateness" card, each with Edit. Long text fields (Exposure plan, Critical to approval, Additional opportunities, Identified risks) are full width and grow to fit, never a small box you scroll inside.

**Chatter**: the deal's feed with a post box.

## 3. Behaviour

- Every card is read-only until Edit. Edit turns it into inputs with Cancel (red) and Save at the bottom right. Unsaved changes follow `unsaved-work.md` (bottom bar turns amber).
- Totals, the checklist pill and the surgeon list refresh after any save.
- Picklist values are read live from Salesforce, never hard-coded.
- User lookups offer active, non-portal users only.
- A "please wait" cover while loading or saving.
- Version number shown on screen, raised with each change.

## 4. AAA Design rules to check before saying it's ready

- No `font-weight: 800` anywhere (use 700).
- Every button filled. Cancel red, primary indigo, quiet secondary slate.
- Round buttons (close, arrows) draw their symbol, never a typed character; measured centred.
- Dark mode: deeper green `#15803d` and red `#b91c1c` under white text; every input, select, date and textarea has dark colours; placeholder text full strength.
- Tables sort by clicking a heading and have drag-to-resize columns.
- Nothing ever scrolls sideways at 1280 px wide (Windows laptop at 150%).
- Rows with several items are level.

## 5. Acceptance tests (UAT, desktop)

1. Open from the ROSA deal page button and from a ROSA deal in a campaign: same modal both times.
2. Click Negotiation on the stage bar: stage saves. Tick a later checklist step: stage moves forward only.
3. A user without `ROSA_Deal_Management` sees no Edit, Add surgeon or Link.
4. Shoulder-only deal: only the TSA/RSA column shows; no Wave column until a surgeon gets a wave.
5. Add a surgeon with volumes and credentialing: appears in the list and menu; totals update.
6. Answer a Q&A question: "Name · date" shows on the same line straight away.
7. Link an implant opportunity from a surgeon: it appears on Overview, and its `Link_To_ROSA_Deal__c` is this deal.
8. Edit Readiness with a long Exposure plan: shows in full, no inner scroll.
9. Light and dark both look right. Robert checks on his Windows laptop.

## 6. Out of scope

- Phone (later).
- Marketing many-deals view (dropped).
- New fields or data-model changes (ask Robert first).

## myCase tab (built, 2026-11-28)

Robert asked for a fifth surgeon tab, **myCase**: the surgeon's myCase bookings as the same table as the Surgeon / Brand view of a hospital's MyCase Bookings in Pipeline (0.175: `pipelineHospitalBookings`, data from `PipelineBookingsController.getHospitalBookings` lines), for one surgeon. Mockup `docs/mockups/rosa_deal_modal_v5.html` (opens on Dr Emma Hart's myCase tab): the surgeon's name once with the case count, a row per brand (square in its type's colour), the last 12 whole months, Total, a Total row; the Hip / Knee / Shoulder / CMFT and Primary / Revision / Demo chips with counts. Counting as in 0.175: a case counts when the surgery happened and it has usage items; demos included. The column filters are left out (one surgeon). Every hospital the surgeon booked at is counted.

## COMPLETED | BOOKED (built 2026-11-28; ROSA Deal Manager 0.31, Pipeline 0.186; in UAT, DEV and PROD)

Robert approved mockup v8.2 (`docs/mockups/archive/rosa_deal_bookings_future_v8.html`) and said build. A purple COMPLETED | BOOKED slider sits on the chip row just left of All / ROSA only / Non-ROSA, on the hospital MyCase Bookings (Pipeline's deal flyout and Site › myCase) and on the surgeon's myCase tab. COMPLETED (default) is as before. BOOKED reads bookings from today for 12 columns (the first is the current month from today), no usage needed, ROSA = `Case__c.Technology__c` 3 ROSA or 4 ROSA+PSI, and leaves out cancelled bookings (`Status__c` R or C, or `Booking_Status__c` C), as the mockup said. The choice is remembered with the others (`hospBook.when`, `rosaDeal.when`). New Apex `PipelineBookingsController.getHospitalBooked` and `ROSADealController.surgeonBooked`; Technology, Status and Booking Status are read only when the person can read them (India's profile in UAT cannot see Technology or Booking Status), so BOOKED never fails on field access. UAT deploys `0AfOg000007fveEKAQ` and `0AfOg000007fvj4KAA` (16/16 tests). Checked in real UAT: Lake Macquarie (deal 000281) shows 7 booked from today, 2 of them ROSA. UAT only; DEV on Robert's word.

### Earlier design notes (2026-11-28)

Robert: a slider beside MyCase Bookings switches between completed surgeries (default; usage uploaded; ROSA = the ROSA drape on the usage) and future bookings (no usage; ROSA = `Case__c.Technology__c` 3 ROSA or 4 ROSA+PSI). No "all". Future bookings count from TODAY onwards (on 28 Nov, the November column holds the 28th to 30th), 12 columns. Mockups: `docs/mockups/archive/rosa_deal_bookings_future_v8.html`, names `docs/mockups/rosa_bookings_slider_names_v1.html` (Claude suggested COMPLETED / UPCOMING). Names decided (Robert): COMPLETED | BOOKED, placed to the right of the VIEW slider. Open: whether cancelled bookings (SAP Surgery Status R or C) are left out (mockup leaves them out); whether the completed view runs to yesterday or keeps whole months. PROD (read-only, 2026-11-28): about 3,500 bookings in the next 12 months, about 1,270 ROSA or ROSA+PSI.

## Where it stands (2026-11-28, end of day): UAT, DEV and PROD level at ROSA Deal Manager 0.43 and Pipeline 0.187

Robert released each step to PROD with Gearset; Claude checked PROD read-only by content after each release and brought DEV level. Every deploy id is in `docs/ROSA_Shoulder_POC_Build_Log.md`.

- **COMPLETED runs to today (0.34, Pipeline 0.187):** the 12 columns end with the current month (on 28 Nov 2026: Dec 25 to Nov 26) and count completed cases up to and including today, on the hospital view and the surgeon's myCase tab. BOOKED starts today, so a surgery dated today can appear in both.
- **Add surgeons from the hospital's myCase (0.35, mockup `docs/mockups/archive/rosa_deal_add_surgeons_v9.html`):** on Site › myCase (Surgeon Total and Surgeon / Brand) a green tick marks a surgeon already in Surgeons and Growth; a round plus adds them (existing `ROSADealController.addSurgeon`). Add only, never remove, from there (Robert). `pipelineHospitalBookings` takes `dealSurgeons`, `canAdd`, `heading` and fires `addsurgeon`; Pipeline passes none of them, so Pipeline shows no marks.
- **myCase under Case Volumes Per Year while editing (0.35):** the surgeon's myCase Bookings panel appears under the volumes card in Edit, only when the surgeon has myCase cases (completed or booked); the myCase tab stays as it is. A surgeon or hospital with no myCase (New Zealand) just says there are no bookings.
- **Delete surgeon (0.36, 0.37, 0.41):** a filled red DELETE SURGEON button at the bottom left of the surgeon's Details in Edit, its left edge level with the card's text, then an Are-you-sure box: "You're about to delete <name>, plus their Q&A (n questions) and their credentialing. This cannot be undone. Do you wish to continue?" (Q&A and credentialing named only when they exist). New Apex `ROSADealController.deleteSurgeon` (user mode; answers go with it, master-detail; ROSA_SurgeonTrigger recounts the deal on delete). `ROSA_Deal_Management` now has Delete on ROSA Surgeons (Robotics_Surgeons__c).
- **Tidy-ups:** header pills (deal type, Placement) and the surgeon tabs in bold capitals with the text trimmed to cap height so it is centred on Windows (0.32, 0.38); myCase keeps its brand spelling, never capitals (0.39, Robert's rule); month columns, numbers and totals centred on the surgeon's myCase tab (0.33); space between Career position and Champion, tick boxes level with the 36px boxes (0.40, `rosaDealFields`); Site › myCase titled MYCASE HOSPITAL BOOKINGS (0.42); "Volumes a year" renamed "Case Volumes Per Year" (0.43).

## Later on 2026-11-28 (ROSA Deal Manager 0.44 to 0.49, Pipeline 0.188; UAT, DEV and PROD)

- **Growth $ (0.44, mockup `docs/mockups/rosa_surgeons_growth_columns_v10.html`):** implants = implant growth (ZB with ROSA minus ZB now) x implant price; consumables = every case with ROSA where the supplier with ROSA is ZB x disposables price (Robert: the robot takes ZB implants only, and every ROSA case uses the consumables). The Surgeons table shows Implant growth and Consumable growth; the footnote shows the working, e.g. "TSA/RSA: Implant Growth of 105 cases x AUD 6,000 = AUD 630,000" and "Consumables: Consumable Growth of 145 cases x AUD 750 = AUD 108,750" (0.45).
- **No access:** a person without the ROSA permission sets gets "Opening ROSA deals needs the ROSA Deal Management permission set. Please ask your Salesforce admin." (`ROSADealController.canOpen`). Robert hides the Open ROSA deal button with a visibility filter on the custom permission ROSA: Edit Deals. Everyone with ROSA Credentialing Admin also holds ROSA Deal Management. No read-only viewer set (Robert).
- **Tooltips (0.46):** placed for the screen's zoom in `pipelineHospitalBookings`.
- **Chatter (0.47 to 0.49):** the ROSA deal uses Pipeline's `pipelineChatter` (no heading), so @mentions and replies work; mentioned people are small filled indigo chips in both ROSA and Pipeline.
