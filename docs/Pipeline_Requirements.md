# Pipeline — Requirements

DRAFT 2 (end of session, 2026-10-24). Decisions are recorded here as they are made in chat. Source: Robert's opening brief, dictated 2026-10-24. Counts below are from read-only queries in PROD on that date.

## 1. Purpose

Opportunity management for the sales field, kept in the custom object `SalesRisks__c` ("Opportunities & Risks") instead of the standard Opportunity object. Pipeline is a one-stop-shop screen, in the same vein as COVRA and ACCRURA (Apex plus Lightning Web Components), that makes it easy to enter, find, update, roll up and review opportunities and risks, and that gives more information than Salesforce gives today.

**Why it is wanted (Robert):**

- Everybody finds it difficult to enter opportunities.
- Managers have no easy way to see how their team is performing without dashboards.
- Sales reps often find it hard to find their own opportunities or to know what to manage.
- Users either navigate through the object or hunt for the right dashboard.
- Opportunities are shared across the team; at any stage other people may open one and add feedback in the Chatter feed.

## 2. Record kinds

| Kind                                                 | Meaning                                                                              | Record types (PROD)                                                                          | In scope                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Implant opportunity** (the "positive" opportunity) | Selling implants to a surgeon, or growing the surgeon's existing implant business    | `<country> HIP / KNEE / EXTREMITIES / CMFT Opportunity` (also `TH SPORTMED`, `AU/NZ ZBEDGE`) | **Yes, first**                                                                 |
| **Risk**                                             | A surgeon already uses our products but may move to a competitor unless looked after | `<country> RISK` (AU, NZ, IN, HK)                                                            | **Yes, first**                                                                 |
| **Capital equipment opportunity**                    | Mainly ROSA robots                                                                   | `<country> ROSA Opportunity`                                                                 | **Out of scope for now; comes into scope shortly.** Design so it can be added. |

Record types are per country (AU, NZ, IN, TH, SG, HK, TW, KR, MY, plus REGIONAL for ROSA).

## 3. Life cycle

The rep enters the details once, then mostly comes back to move the **Stage** forward and to **debrief in the Chatter feed** (both kinds). Reps hold a handful of open records (two to six), not hundreds.

**Information held (basic only):** stage, the quarter they expect it to close, background information, whether it is a priority to the rep, how much it is worth, how many cases per year.

**Stages, as they stand in PROD (open and closed from `IsClosed__c`):**

- Implant opportunity, open: Plan, Action, Commit, 1st Case, 5th Case. Closed: **Conversion** (the surgeon is now a regular user: success) and **Unsuccessful Conversion**. (Other stages exist on the picklist and on a few old records, for example 20th Case and the ZBEdge stages.)
- Risk, open: Unhappy, Meeting With Competitors, 1st Case Competitor, Multiple Cases Competitor, Settled. Closed: **Closed Retained** and **Lost Business**. Robert's words: "retained business and lost to competitor are the two closed stages".
- Everything else is in progress.

**Open/closed today (PROD, 2026-10-24):** AU Hip 211 open / 182 closed, AU Knee 244 / 273, AU Extremities 71 / 98, AU CMFT 36 / 103, AU Risk 93 / 151, NZ Hip 35 / 12, NZ Knee 47 / 18, NZ Extremities 20 / 3, NZ Risk 21 / 7; India, Thailand, Singapore, Hong Kong and Taiwan are small. ROSA (not in scope yet) has 96 open in AU, 120 in IN and 16 in NZ.

## 4. Users and devices (Robert, 2026-10-24)

Two experiences, one product. Nobody is locked out of either: a rep may use the web, a manager may use mobile.

**A. Mobile: the rep's view (owners of the opportunities).** Predominantly the way owners reach it. Opening the Pipeline section shows **all the opportunities and risks I own**, with easy updates and nice feedback when I make one. It tells the rep **what they need to do**: anything **getting stale** (no Chatter post or no stage change for a long time) or needing feedback, and old versus new at a glance. Robert: "I'm just looking to invent things that make it easier."

**B. Web: the manager's view (the first priority: "really slick for the managers").** An aggregate **full-screen app** like COVRA and ACCRURA: each team member's opportunities, what they are worth, how old they are, and a reporting look across the team. How the reporting looks is not decided; to be designed with mockups. The aim is to add value over navigating the object, which is "a whole lot of confusion".

**C. Slice and dice for anyone (the all-in-one reporting tool).** Any user can slice the records they have access to, not just their own team: for example all shoulder opportunities in Australia or in New South Wales, all hip opportunities for a hip product manager. Upper management will look across teams and business units (Hip, Knee, Shoulder, CMFT) to see what exists in each segment.

**Design rule: web and mobile from the start** (unlike COVRA and ACCRURA, which are desktop only).

## 5. Decisions

- Built as Apex plus Lightning Web Components, "lifted navy" family look (see CLAUDE.md).
- Implant opportunities and Risks first; ROSA later.
- **Build order (Robert, 2026-10-24, "definitely, definitely"): the manager web app first.** The rep mobile experience follows.
- **Hard rules (Q1), confirmed by Robert 2026-10-24:** everything created is prefixed `Pipeline` (`pipeline` for components), everything has a plain-English description (fields included), and nothing that exists is changed without his explicit permission. Claude may freely read and compare UAT and PROD data.
- **Mobile matters:** Robert: "it's really important we get the mobile app correct". He is open to two screens or two apps (Q4 is not closed). **Reference for mobile: the APAC Events repo** (`../APAC Events`, whose nomination screen worked well on phones) and its `APAC-Events-Phone-Screen-Styling-Guide.md` and `MOBILE and DESKTOP LWC HOW WE DID IT` notes (see CLAUDE.md, Mobile).
- **Ownership and sharing:** the rep owns their records; much is shared. Robert: any user can slice "records that they have access to". Whether Pipeline may ever show more than standard Salesforce does is a question (Q23).
- **Team hierarchy:** people report to managers. PROD check (2026-10-24): all 152 active owners of open records have a manager on their user record (`User.ManagerId`), and no open implant or risk record has a blank `Owners_Manager__c`. How a team is worked out is a question for Robert (Q18). **Two sources exist:** the user manager links (`User.ManagerId`), and the Teams objects `Team__c` and `Team_Member__c` (AU and NZ, nested by `Parent_Team__c`, maintained by Robert for the BOARDRA and ROSTRA roll-up). Robert (2026-10-24): both are accurate; which Pipeline uses is not decided.
- **Chatter is essential:** users must still write Chatter-style posts and use its features, including **@mentions**, even if that needs a custom component (Apex ConnectApi can post mentions and read the feed). The object has a feed table, `SalesRisks__Feed`.
- **Fields:** only a handful are entered; the list and what is required will be gone through together (not done yet).
- **Name and prefix (Robert, 2026-10-24):** the tool is called **Pipeline**; code prefix `Pipeline`; dark theme; wordmark **"pipe" in amber, "line" in white**. **Splash screen with the tagline "Keep your deals close, and your risks closer."** (Robert chose it, 2026-10-24).

## 5A. Side notes (Robert, 2026-10-24, "the final note")

1. **Usages.** Include usages when looking at the deal overall.
2. **Med ed events.** Include any med ed events the surgeon has been to.
3. **The surgeon is the key link.** An implant opportunity or a risk must always link back to a surgeon. In Australia the myCase object `Case__c` holds all of that surgeon's bookings. When looking at (or analysing) a pipeline record, the tool should summarise what that surgeon is currently doing in terms of business with Zimmer Biomet.

Candidate objects found in PROD (names only, nothing chosen; see questions Q29 to Q35):

- Surgeon: `SalesRisks__c.Account__c` ("Primary HCP", Account); `Healthcare_Surgeon_Relationship__c` ("Account Relationship"); `Hospital_Surgeon_PM_Relationship__c`.
- Bookings: `Case__c` (myCase List, Australia).
- Usages: `Usage__c`; `myCase_Usage__c`; `myCase_Usage_Item__c`.
- Med ed events: `Event_Registration__c`, `Event__c`, `CventEvent__c` with `CVENT_Event_Contacts__c` (registrations), `Campaign` with `CampaignMember`, `Campaign_Member_List__c` ("Course Member List"), `Zimmer_Event_zem__c`.

## 5B. Choosing what you look at: Robert's examples (2026-10-24, discussion, nothing decided)

Robert: "nothing is that straightforward in the org" and "we have to be mindful of being very flexible with how somebody decides to use or isolate the data". Neither the user manager links nor Teams is enough alone.

- **Directors and managers (Ray Vercoe, Australia):** wants country performance and to drill into one team. Asks: how does he select, say, Brenton Buller's teams, or Brenton Buller as a manager "and the people he manages"? Could be picked from Teams or as a manager. Australian teams are state-aligned: NSW has three teams, Victoria two (about to be three), Queensland two; some states hold several teams.
- **Multi-country manager (Royden Chew, Singapore):** manages teams across Singapore, Malaysia and Thailand who do not report to him. He wants, for example, all open shoulder opportunities across those three countries.
- **Marketing and product managers (the knee marketing product manager):** nobody in the field reports to them, but the role hierarchy lets them see the country's opportunities. They want "New South Wales's hip opportunities", "Brenton Buller's team's hip opportunities", "the hip opportunities across Australia".
- **Most users do report to the right manager.** The awkward cases are marketing, area and multi-country managers and people with no direct sales relationship; Robert calls them "the least of my problems in terms of who will use it".
- **Teams:** Robert would be happy to define Teams for other countries, finds that "actually quite elegant if everybody's actually set up", and is open to Teams being part of, or the only, way to find data (while noting that "might be a bit difficult").
- **Access versus selection:** what a person may see comes from standard Salesforce sharing and the role hierarchy (that is why the knee marketing manager sees the country). The selection in Pipeline only narrows what is already visible. Whether Pipeline may ever show more than sharing allows is still Q23.

Questions arising are Q41 to Q47 in `Pipeline_Questions_For_Robert.md`.

## 5C. Decisions on choosing what you look at (Robert, 2026-10-24)

- **Saved filters:** users create, save, delete and manage their own, called **"filters"** and visually similar to COVRA's (people already know them). Details in Q49.
- **Ways to select the data:** a team from Teams; one or more countries; a state (where the country has states); a product segment (Hip, Knee, Shoulder, CMFT), roughly the record type; open or closed. Robert expects to iterate "for different sets of people" rather than settle everything now.
- **Opportunities and Risks are viewed separately, never combined.**
- **Teams** are kept as one source and the source for "manager and everyone below" (the nesting); Robert maintains them and will create them for the other countries.
- **Country** is decided by the **owner's country**.
- **Anyone who sits high enough can drill down** (Ray Vercoe's example); the order is not decided.
- **Access** comes from Salesforce sharing: country-based sharing at most, and an exception for multi-country people such as Royden Chew; no one sees another country's records otherwise. **Confirmed (Q23, Robert 2026-10-24): Pipeline respects the org-wide sharing rules for this object** and never shows more than sharing allows.
- **Countries (Q37, Robert 2026-10-24): all countries from the start; focus and most testing on Australia and New Zealand; prove Royden Chew can see sample Singapore, Malaysia and Thailand deals.**
- **Currency (Q40, Robert 2026-10-24): values and roll-ups are shown per currency, never mixed; no USD conversion for now.**
- **Closed deals (Q39, Robert 2026-10-24): start with a small recent range (suggested: last 12 months) that the user can expand.**
- **Opening view (Q42, Robert 2026-10-24): the user's saved default filter; else their team (Teams); else their own country.**
- **Filters can be shared with others (Q49, Robert 2026-10-24);** **one-to-one with a named person; a team manager may also share with their whole team; never with everybody. Sharing gives the receiver their own copy (they own it, and can edit or delete it); there is no shared group filter.**
- **Brand filter (Q51, Robert 2026-10-24): `Brand__c`; a deal shows if its brands include the chosen one.**
- **State (Q45, Robert 2026-10-24): the deal's state is the owner's (sales rep's) state.**
- **No export in this version (Q22, Robert 2026-10-24); parked for later.** The tool is for working within and keeping deals up to date.
- **Not settled:** how Shoulder is told apart, since no Shoulder record type exists (Q48).

## 5D. Selection model and scope, round 2 (Robert, 2026-10-24)

- **Team mode or manual mode (or both together).** Pick a predefined Team; or choose manually from country (only those shared with you), state (Australia only), segment, and brand; or pick a Team and narrow it manually (state manager Darren Agius, three teams, Hip only).
- **Open, closed or both** is a choice in every view.
- **Segments:** Hip, Knee, Extremities (which is where shoulders are), CMFT; Risk is separate. Sports Medicine and Trauma in Thailand are recognised. **CORRECTED 2026-10-24: ZBEdge is IN scope.** Robert first said it was out, then: "I said ZB Edge opportunity record type was out. Sorry, it is in." (AU and NZ ZBEdge record types; 13 records in PROD today; its own page layout.) How it appears among the segments is a design detail.
- **Brand** is a manual-mode filter (for example Persona within Knee); field to be confirmed (Q51).
- **No fixed drill-down order.** Seniors with no field staff under them (marketing, medical education, operations, the president) use manual mode; Teams are for those who manage people.
- **Saved filters:** one record per filter, settings as JSON in that record, no field per preference. Storage object is Claude's proposal (a new Pipeline object, not COVRA's), not yet confirmed (Q49).
- **UAT test data:** Robert builds rough teams for Singapore, Malaysia and Thailand; UAT already has the Australian and NZ teams.

## 5E. Staleness, age and value (Robert, 2026-10-24)

- **Manager screen contents, for now:** total value and count of open opportunities; value and count by stage; value by expected close quarter; a row per rep (open count, value, age); age in bands; priority flags (rep, state, national); stale opportunities. More will be added as we iterate.
- **"Falling behind" = stale.** A line in the sand: **no stage change in 90 days** is highlighted; **no Chatter update from the rep in 30 days** (reps are expected to post at least monthly on active, priority opportunities) means the record is starting to age.
- **Overall age** (from the created date) is shown too, so very old deals stand out (for example a five-year-old Plan-stage deal that should be closed off). Fields: `Days_Since_Last_Stage_Change__c`, `Days_Since_Last_Chatter_Update__c` (both read from plain date-time fields set by something outside Pipeline; the Chatter date follows the owner's own posts, tested on 12 records).
- **Expected close quarter:** `Expected_Closure_Quarter__c`; it means the next time that quarter comes round (Q4 now = Q4 2027), which is open to interpretation. **Robert wants the field changed to hold a quarter and a year, and the existing data backfilled** ("use this year if something is a little bit outdated"). That changes something existing, so it needs his explicit permission and a design first (Q52, Q56, Q57).
- **Stale bands (2026-10-24):** Chatter from the rep: within 30 days current; 30 to 90 days needs update; over 90 days very old. Stage change: warning at 90 days. A deal marked **On hold** (`OnHold__c`) gets no warnings. Names such as current, overdue and way overdue are not final. Old deals are put on hold, reviewed, or closed as lost (reopenable).
- **Value:** `AmountPerYear__c`, the **expected uplift in annual revenue** the deal adds (not total business).
- **Close Date** is not used for implants and risks (ROSA only). **Field audit done (read-only): see `Pipeline_Unused_Fields.md`.**

## 5F. The quarter-and-year change: what is there today (read-only, PROD, 2026-10-24)

Robert (2026-10-24): change the field to a quarter and a year; backfill generously (look at the created date and recent Chatter or stage change; example: Chatter in May and Q1 gives Q1 2027; reps review it); add a validation rule so the quarter and year cannot be set in the past ("it has to be moved"); "replace it, deprecate it" rather than reuse if conversion is not possible, and he fears adding a field to every page layout.

What exists:

- `Expected_Closure_Quarter__c`, label **"Expected Conversion Quarter"**: a locked (restricted) picklist with Q1 to Q4, history tracking on, and it appears on the detail pages as a required field.
- It is listed value by value on each of the **60 record types** (so a new value must be added to every record type), appears on **7 page layouts** in total (**5 for implants and risks**: CMFT, Extremities, Hip, Knee, Risk; Thailand's Sports Medicine and Trauma use the Hip layout; ROSA and ZBEdge have their own), and on the ZBEdge compact layout.
- **The formula field `pbiCloseQuarter__c` (for Power BI) is `text(Expected_Closure_Quarter__c)`.** Any change to the quarter field changes what Power BI sees.
- History: 102 changes on 100 records since April 2025.
- There are only two existing validation rules on the object (both India ROSA). A new one is a change to an existing object and needs Robert's explicit permission.
- A picklist cannot be converted into a date.

**DECIDED (Robert, 2026-10-24): option 1, adjust the current field.** Power BI is not a concern. Build still needs a design, a dry run and his go-ahead.

Options (Claude's analysis):

1. **Change the existing picklist in place**: add year-qualified values (for example "2026 Q4" to "2029 Q4"), move the old values over, keep the field on every layout. No new layouts to edit; the 60 record types still need the new values (one deployment); the Power BI formula starts returning "2027 Q1" instead of "Q1"; values must be added each year.
2. **A new field** (a year-qualified picklist) added to the 5 to 7 layouts and 60 record types, the old field left in place and later taken off the layouts; Power BI keeps working on the old field until it is switched.
3. **Two fields** (keep the quarter, add a year): two things to keep in step, so not recommended.
4. A date field is possible but gives a specific date, which people did not like.

## 5G. Quarter validation and backfill answers (Robert, 2026-10-24)

- **Validation rule:** when someone edits an active record whose quarter is in the past, they must change it; the message should say something like: "You need to adjust the quarter to represent when this deal is likely to close." **The current quarter is allowed; anything before it (Q3 2026 and earlier, from now) is not.** This is a new validation rule on an existing object, so it needs Robert's explicit permission and a design first. **Closed deals are exempt (rule applies to open deals only; Robert, 2026-10-24).** **On-hold deals are exempt too; taking a deal off hold and saving makes the rule fire (Robert).** Still to check (Claude, read-only): and making sure it does not stop automatic updates of the Chatter and stage dates.
- **Backfill:** "recent" means within the same 90 days as the stale rules. **Every deal gets the current or next occurrence of its quarter (from today in Q4 2026: Q4 becomes Q4 2026, Q1 to Q3 become 2027), generously, even with no recent activity; after go-live everybody is asked to review their deals.** Active deals with no recent activity are also flagged by the stale rules. The 35 open records with no quarter will be set by a judgement call.

## 5H. Access and editing (Robert, 2026-10-24)

- **Sharing:** Pipeline respects the org-wide sharing rules for `SalesRisks__c`; it adds no data permissions of its own (Q23, Q24).
- **Editing:** a manager or a rep can edit any of the fields in play for that opportunity type (the fields we define as editable); the same editing serves the rep tool. Hold, close as lost and reopen are done by editing (Q25). The field list per kind comes from Robert's sample walkthrough (Q11).

## 6. Open questions

All open questions for Robert are in **`Pipeline_Questions_For_Robert.md`** (Q1 to Q58) with a "Where we are" summary at the top. Nothing is assumed: an unanswered question stays open and nothing depending on it is built. Questions for the business go in `Pipeline_Team_Questions.md`.

Facts worth keeping beside them: UAT and PROD differ on `SalesRisks__c` (UAT has `Status__c`, PROD does not), so build against PROD's shape and check a field in both orgs before using it; PROD open records: 849 of 1,018 have a stage-change date, 630 have a Chatter date, and the longest wait since a stage change is 1,171 days.
