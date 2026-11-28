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

## myCase tab (mockup, 2026-11-28; awaiting Robert's "build")

Robert asked for a fifth surgeon tab, **myCase**: the surgeon's myCase bookings as the same table as the Surgeon / Brand view of a hospital's MyCase Bookings in Pipeline (0.175: `pipelineHospitalBookings`, data from `PipelineBookingsController.getHospitalBookings` lines), for one surgeon. Mockup `docs/mockups/rosa_deal_modal_v5.html` (opens on Dr Emma Hart's myCase tab): the surgeon's name once with the case count, a row per brand (square in its type's colour), the last 12 whole months, Total, a Total row; the Hip / Knee / Shoulder / CMFT and Primary / Revision / Demo chips with counts. Counting as in 0.175: a case counts when the surgery happened and it has usage items; demos included. The column filters are left out (one surgeon). Every hospital the surgeon booked at is counted.
