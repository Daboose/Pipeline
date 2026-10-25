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
- **"Data selectors" (Q19, Robert 2026-10-25): the team and manual ways of choosing data are called the data selectors; everyone gets the same ones.** Anyone can pick any team; sharing decides whether data comes back (an Australian team picked by a Singapore user shows nothing).
- **Design rule (Robert 2026-10-25): never hide a data selector because the user may lack access to the data.** All selectors are shown to everyone; if the user has no access, the result is simply empty. No access-based rules in the selectors (they would be "a whole myriad of rules").
- **More data selectors (Q20, Robert 2026-10-25): owner (one person), expected close quarter, rep priority** are wanted, on top of team, country, state, segment, brand and open/closed. **Stage is also a selector** (Robert). **A stale toggle is wanted (Robert 2026-10-25): an obvious on/off switch with a short plain definition of what it means so users understand why the list changes; "stale" may not be the label people understand, so choose the wording in the mockup.**
- **Design thought only, not a requirement (Robert 2026-10-25: "It's just a design thought. That's all."):** the data selectors area may be large, so consider a panel that **flies down from the top**, where all selections are made; on Apply it flies back up and the data fills the screen ("you can focus on the data at hand"). Concern: many choices permanently on screen leave less room for the data. Claude may try it in the mockup as one option; nothing is decided.
- **Brands per country and quarter range (Robert 2026-10-25):** brand lists come from the record type for the country picked (several countries: what is available across them); Risks show every brand through a type-ahead that turns picks into removable chips (round X on the right); the close quarter is chosen as a from and to range.
- **Default country (Q62, Robert 2026-10-25): where a country is needed and none is picked, use the user's own country from the user object.**
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
- **Overall age** (from the created date) is shown too, so very old deals stand out (for example a five-year-old Plan-stage deal that should be closed off). Fields: `Days_Since_Last_Stage_Change__c`, `Days_Since_Last_Chatter_Update__c` (both read from plain date-time fields set by something outside Pipeline; the Chatter date is set by any text post on the deal, whoever posts it; corrected 2026-10-25, see 5X).
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

## 5I. Screen layout and settings conventions (Robert, 2026-10-25)

- **Full screen button in the top right-hand corner.** Clicking it opens the tool in a new tab, full screen, without the Salesforce navigation.
- **Settings (cog wheel) in the top left-hand corner**, opening a **left flyout** where user settings live.
- **Dark mode and light mode from the start.** Everything is built to cater for both. **Dark or light is the first saved user preference**, alongside filter management and any other preferences.
- Mockups go through full iterations (Robert: "let's go through full mockup iterations").

## 5J. Mockups

- **v1 of the manager screen** (`docs/mockups/archive/pipeline_manager_v1.html`, 2026-10-25). Robert: "so far, so good. It does look quite good." Feedback: the fly-down looked like another panel sitting on top of the old screen, and the Opportunities | Risks and Open | Closed | Both buttons stayed visible and misleading.
- **v2** (`docs/mockups/archive/pipeline_manager_v2.html`): Change selection drops a panel from the very top covering the whole screen, the rest dimmed and blurred; only the panel can be used until Apply or Cancel; Opportunities | Risks and Open | Closed | Both are inside it; brands follow the segment.
- **v3** (`docs/mockups/archive/pipeline_manager_v3.html`), from Robert's feedback on v2 (2026-10-25): **Team** is a search box with a collapsible team tree and "My team" at the top (so a list covering every country stays easy to use); **state chips appear only after Australia is picked** (pick the country first; Robert is happy to have that rule on this screen); **Owner** is a type-ahead search over all active users (not a list of hundreds; people with no deals return nothing). Robert's other comments: country, segment, brand chips, stages, rep priority, the closed range (3, 12, 24 months) and "Needs attention" are good; the brand list is long for Risks but fine for opportunities. Robert on v3 (2026-10-25): "the screen looks a whole lot better", likes the team selector, and gave the feedback that produced v4.
- **v4** (`docs/mockups/archive/pipeline_manager_v4.html`), from Robert's feedback on v3: **brands are not offered at all until a segment is picked** ("I'd rather the person come in and go knees ... I want these brands"); **segment and brands are grouped in one box, brands indented under the segment; country and states are grouped the same way** (Where and What boxes; Team and Owner stacked on the left); **chevrons are a proper "greater than" that rotates down when open** (Robert dislikes triangles: team tree, dropdown arrows, sort arrows, Change selection); **Open | Closed | Both drive the stage chips and the stage chips drive the switch, with a fourth option Custom** (Open = the five open stages; Closed = the two closed stages; Both = all seven; any other mix = Custom; real stage names are used: Conversion and Unsuccessful Conversion, Closed Retained and Lost Business). Robert on v4 (2026-10-25): brand lists differ by country and record type; Risks need a type-ahead with chips; quarter as a from and to range.
- **v5** (`docs/mockups/archive/pipeline_manager_v5.html`): **brands follow the segment AND the country** (taken from the record types; Australia, New Zealand, Singapore, Malaysia and Thailand loaded; no country picked = what is available across all of them); **Risks brands are a type-ahead; picks become chips with a small round X on the right** (team and owner picks use the same chips); **expected close quarter is a From and To range**. Q62 (default country) was asked and is not yet answered.
- **v6** (`docs/mockups/archive/pipeline_manager_v6.html`, 2026-10-25): **the new pipe logo family is in**: a splash screen (blank pipe with live text "pipe" amber and "line" white, plus the tagline), the pipe with live text ON its black band in the top bar (the short pipe beside the text is a mockup option, after Robert said he expected the logo on the pipe), and the pipe icon as the browser tab icon; the project amber is now the logo's **#FDB827**. Robert on v6: "wow, that looks so good"; the logo text was re-centred on the pipe after his arrows showed it sitting low (text now placed from the band's own centre, lowercase body centred).
- **v7** (`docs/mockups/archive/pipeline_manager_v7.html`, 2026-10-25), from Robert's feedback on the Choose Your Data panel: **Stage sits in its own box under Segment** on the right (Where, What, Stage); **the left column is people only (Team and Owner)** with a taller team tree; **the titles Team, Owner, Expected close quarter and Needs attention are in the amber** like Where, What and Stage. Robert then asked whether the "Choose Your Data" heading could sit on a pipe too: yes, it fits the existing band (about 16 characters, no change to the logo file needed); added to v7 as the mockup option "Panel heading: On a pipe | Plain text". Robert then noticed the pipe had to be scaled up to fit the heading and proposed building the pipe in sections so only the black band grows: done with `scripts/build_pipeline_pipe.py`, which lengthens the band (and slides the flange and right end cap along) without making the pipe taller; `brand/pipeline-pipe-blank-wide.svg` (band 3,562 units instead of 2,262) is used for the heading, about 53 px tall at 400 px wide. **Heading colours (Robert): "CHOOSE" in amber and "YOUR DATA" in white, like the logo. The wordmark itself is now in capitals, "PIPE" amber and "LINE" white (splash, top bar), so pipe-style headers stay visually consistent.** Mockup behaviour (Robert, 2026-10-25): the splash plays about 25% longer (4 seconds) and the mockup starts in full screen so the explanation notes are not seen straight away. Robert's feedback on v7 produced v8.
- **v8** (`docs/mockups/pipeline_manager_v8.html`, 2026-10-25), from Robert's feedback on the panel: **Apply, Cancel and Reset sit on the bottom right** (Save as filter stays left); **Expected close quarter moved under Stage**, left-aligned with Where and Stage, leaving the left column to the people selectors; **a new "Only show" box sits to the right of Where with tick boxes: Rep priority, State priority and On hold** (Robert: "a little checkbox section ... on the very right"; State priority is `State_Priority__c`; "On hold" is `OnHold__c`). The small Cancel button at the top right of the panel was removed (Robert: redundant; Apply and Cancel at the bottom both close it, Reset resets it, Save as filter stays inside it); clicking the dimmed area still cancels. Splash (Robert, 2026-10-25): the pipe is centred horizontally and vertically on the screen, 50% bigger, with a larger tagline underneath. Robert on v8 (2026-10-25): "I think the settings window is in a really good place at the moment. I quite like it." Next: the main screen, then drilling into an opportunity, driven by his walkthrough of the fields (Q11). **Choose Your Data panel: settled for now.**
- **v9** (`docs/mockups/archive/pipeline_manager_v9.html`): Opportunities and Risks as independent on/off buttons, Charcoal slate panel. Robert's feedback (Q66) produced v10.
- **v10** (`docs/mockups/pipeline_manager_v10.html`, 2026-10-25): three on/off buttons (Opportunities, Risks, ROSA); one section per type on the main screen; narrower stage component with three views to compare; see 5S and 5T.
- **v11** (`docs/mockups/archive/pipeline_manager_v11.html`, 2026-10-25): v10 with four screen layouts to cut the empty space (As v10, Band, Columns, Strip; options bar "Screen layout"). Robert: "considering the volume of data, you've done a much better job. I find that to be quite acceptable."
- **v12** (`docs/mockups/pipeline_manager_v12.html`, 2026-10-25): v11 plus **a separate list for each type with its own columns** (options bar "Deals list" flips back to one shared list) and ROSA as the walkthrough described it (deal types Capital Sale, Rental, Placement, ROSA-E, ROSA-T; sales type; close date; install date; rep and state priority only). Two comparison pages for Robert's choices: `pipeline_choose_stage_view.html` (Q70) and `pipeline_choose_buttons.html` (Q67), see 5V.
- **Logo (Robert, 2026-10-25):** designed with Claude. The first full logo (smooth, flat) is dropped; **the new realistic chrome pipe family is the brand** (Robert gave Claude the image `Pipe.svg` as the base). Files in `brand/`: `pipeline-pipe-blank.svg` (pipe with an empty dark label band, for the splash), `pipeline-pipe-short.svg` (short pipe for the top bar), `pipeline-pipe-icon.svg` (square icon for tab and small uses), `pipeline-pipe-source.svg` (Robert's base image), and `archive-pipeline-logo-v0-original.svg` (the dropped first logo). The text is live (not part of the images) so it stays sharp and follows dark and light mode.
- **Brand facts (Claude, read-only, PROD, 2026-10-25):** the record types already limit brands per segment and country (Australia: Hip 10, Knee 11, Extremities 2, CMFT 5, Risk 39); in the data 43 distinct brands are in use across the object (the 8 in v1 were invented). With no segment picked the opportunity brands come to 25; risks can involve any brand (39). Some brands in use are not on a record type's current list (for example Wagner SL, CPT, RibFix, OnPoint). The real tool should take the lists from the record types or the data, per country. Robert: "not critical for us to keep going"; "a selection of CMFT and picking Persona will get you nothing".
- Colours (mint current, orange needs update, red very old) and the stale wording ("Needs attention" and alternatives) are proposals.

## 5K. Implant opportunity: fields and life cycle (Robert's walkthrough, 2026-10-25, creating an AU Knee opportunity in UAT)

**Creating a deal (what the rep fills in)**

- **Primary HCP** (`Account__c`): the link to the surgeon. "That's always required to create any type of implant record or risk record." (The CMFT page layout does not mark it required; Robert says always. To check.) "Really, the people's focus is on selling to the surgeons."
- **Healthcare Facility** (optional): often left blank because surgeons work across many facilities and the deal is not tied to one.
- **Expected Conversion Quarter** (mandatory): to become quarter and year (Q56, Q57). In the demo he picked a quarter to represent next year.
- **Expected Annual Value** (mandatory, `AmountPerYear__c`): the demo deal was $250,000; **Currency** defaults to the user's (Australian dollars).
- **Expected Annual Units/Cases** (optional): how many surgeries of this type of this product the surgeon is expected to do in a year (demo: 100). Used as it is (Q15).
- **Stage**: Plan, Action, Commit, 1st Case, 5th Case, Conversion, Unsuccessful Conversion. People should not create a deal at 1st or 5th Case (it should start at the beginning), but sometimes the conversation has already started. Demo: Action.
- **Rep Priority**: "is this a priority to me or not?" **State Priority**: mainly maintained by state managers, so reps prioritise their own work and a state manager can group their own top ten (say ten of twenty rep priorities); sometimes not used at all.
- **On Hold**: for example the surgeon is going overseas for training or on a six-month sabbatical; tells the manager the deal is still active but not moving forward.
- **Link To ROSA Deal**: used when the surgeon's knee work is part of a ROSA robot capital sale to the same hospital (ROSA is a surgeon's assistant robot for more precise knee cutting); ROSA is not in scope now.
- **Background Information**: what and why. Help text: "Give context as to why you have created this record. What are you trying to do?" (for example, the surgeon uses a competitor's knee and the ROSA robot would let them do more cases). So anyone reading the record knows why it exists.
- **Brands**: one or many, limited by the record type (UAT showed the ten Knee brands; PROD's Australian Knee list also has OptimiZe; UAT is behind PROD on this).
- **MyMo** (the MyMobility Apple Watch product): a tick box, plus its own **MyMo Stage**: Plan, Action, Commit, Contract, 5 Enrolments, 20 Enrolments, Conversion, Unsuccessful Conversion. It runs alongside the deal but lets a separate MyMobility team manage its own progress (the surgeon may do about ten surgeries before enrolling patients on the watch). Demo: MyMo on, at Action; the rep contacted the ZB Edge team.
- **Hip, Knee, Extremities (shoulders) and CMFT behave the same**; only the brands differ.

**Keeping it up to date (the life cycle)**

- The rep maintains the fields as the deal moves: the **stage** advances, the **quarter** is pulled forward or pushed out, the **value** goes up if the surgeon is upsold, and the rep moves the deal in and out of **priority**; MyMo stages are updated sometimes ("chances are I probably won't").
- **Chatter posts** are the running commentary, with @mentions of the MyMobility team, the manager, marketing or the product manager (for example to flag a product push). "It is a very collaborative approach to selling."
- Reps have **6 to 10 opportunities on the go** and prioritise and deprioritise them. The priority is "a visual indicator to the manager that they're actively working on that at the moment", evidenced by Chatter posts.
- **A separate monthly reporting system uses the priority flags** (it gathers every rep's priorities for their managers). Pipeline must not touch it.
- Next: the Risk walkthrough.

**MyMo in the settings (Robert, parked):** if MyMo matters to a user, a tick box (and its stage list) could be added to the selection panel in its own small box, but he is wary of the panel getting too big. Parked (Q64).

## 5L. The main screen: a funnel for the stages (Robert, 2026-10-25)

Robert on the stage display: "very important", but the business is used to a **graphical funnel**: wide at the top down to narrow at the bottom, through **Plan, Action, Commit, 1st Case, 5th Case**, with **the number of deals and the value inside each stage**. "The bar is irrelevant at the moment. The stages are important, and how many deals and the value of the deals are important." It is like the Expected Annual Revenue pill (for example 2.41 million) broken down by stage in the funnel. **He wants options for a funnel view before deciding** (not necessarily building it yet). Mockup options to follow.

## 5M. Risk: fields and life cycle (Robert's walkthrough, 2026-10-25, creating an AU Risk in UAT)

- **Primary HCP** (the surgeon): required. **Healthcare Facility**: optional (left blank in the demo).
- **Expected Conversion Quarter**: the same field as for opportunities. For a risk it means when the rep expects the surgeon to act (demo: "I know Aiden's unhappy. I'm predicting he might do something by Q2 next year"; with the new selector, Q2 2027).
- **Expected Annual Value**: the **potential loss of annual value to Zimmer Biomet if we lose this surgeon** (demo: $250,000). **There is no cases field** on a risk: "This is just more about managing the risk."
- **Stage**: Unhappy, Meeting With Competitors, 1st Case Competitor, Multiple Cases Competitor, and the two closed stages Closed Retained and Lost Business ("we either lose it or we don't"). (PROD also has a "Settled" open stage on a few Australian risks, not mentioned.) Demo: Meeting With Competitors.
- **Rep Priority** and **State Priority** (state managers tend to fill the latter), as for opportunities.
- **On Hold is not on the Risk layout, and Robert thinks that is intentional**: "A risk is probably a risk ... I don't think a risk goes on hold." So Pipeline must not offer On hold for Risks (done in the mockup) and the on-hold exemption from the stale rules does not arise for them.
- **Background Information**: free text.
- **Risk Product Information**: **Portfolio comes first** ("because it's universal, you actually pick the portfolio here before you pick the brand"), multi-select (demo: Hip and Knee), then **Brands**, multi-select, any brand (demo: G7, Taperloc and Persona). Robert: "portfolios, or segments ... maybe portfolios is a better word".
- **Claude's read-only check (PROD, 2026-10-25):** Portfolio is filled on 307 of 320 risks (145 of 152 open); open risks by portfolio: Knee 93, Hip 51, ROSA 10, Extremities 5, CMFT 2, Surgical 1 (14 have more than one); the brand matches the picked portfolio in 170 of 181 cases. So **a Risk's Portfolio works like an opportunity's Segment**, and Robert's earlier answer that risks have no alignment of brand to segment (Q61) may need revisiting: see Q65. **Robert agreed (2026-10-25): Risks get the same chips, filtering by Portfolio, and the brand list narrows to match; the label (Segment or Portfolio) is still to be chosen.**
- **Life cycle:** state managers work with the rep and with the leadership team on a risk (meetings and so on). The risk shows in the rep's profile as "how much risk we've got", and the rep can prioritise or deprioritise it. The value rarely changes ("a fairly good idea of a ballpark value"); the rep maintains it through the stages until the business is retained (no longer a risk) or lost.

## 5N. Build rule: live option lists (Robert, 2026-10-25)

Brand lists (per record type and country), stages, countries, teams and users must be read live from Salesforce, not typed into the tool, so a brand or stage added tomorrow appears without a code change. Verified read-only in PROD: the UI API returns each record type's current brand and stage values. A brand added to the field but not assigned to a record type does not show, which matches what reps see today. Risk brands narrow by Portfolio using the opportunity record types' lists for that portfolio. The mockups type the lists in by hand and say so.

## 5O. Words and the panel buttons (Robert, 2026-10-25)

- **Portfolio, not Segment:** the Hip, Knee, Extremities and CMFT chips are called **Portfolio** for opportunities and risks alike. Earlier notes in this file that say "segment" mean portfolio.
- **Reset is a red (destructive) button at the top right of the Choose Your Data panel**, not at the bottom: it resets the whole form and took too long to find. Cancel and Apply stay at the bottom right with **Apply always the far right button** (Robert), and Save as filter at the bottom left.

## 5P. Icons and the settings panel edge (Robert, 2026-10-25)

- **The cog and Full screen buttons use the same icons as ROSTRA and BOARDRA** (copied from BOARDRA's markup): a drawn gear in a square rounded button, and a single four-corner "expand" icon that becomes a "shrink" icon while in full screen.
- **The settings flyout opens wider (about 580 px, with more padding) and the screen behind it is blurred and dimmed**, like the Choose Your Data panel (Robert: too narrow and cramped).
- **The settings flyout has the same blue (indigo) line down its right edge** as the Choose Your Data panel has along its bottom.

## 5Q. Opportunities and Risks together (Robert, 2026-10-25) — changes an earlier decision

Earlier (2026-10-24) Robert said Opportunities and Risks are looked at separately and never combined. **Now: "A manager may want to have a look at opportunities and risks at the same time to see a total pipeline."** So the selector becomes **two independent on/off buttons**, Opportunities and Risks, either or both (at least one stays on). Robert likes the idea of an on/off pill: "a pill with the word 'opportunities' in it. On the right, there's a visual indicator ... almost like a tick in a box", and asked to iterate on the look.

v9 shows five styles to compare (mockup option "Opportunity / Risk selector"): **A** pill with a tick box on the right (Robert's idea, the default); **B** pill with a round tick; **C** pill with a small switch; **D** pill that fills with a tick before the word; **E** the old joined buttons where both can light up.

How a combined view behaves in v9 (to confirm): the stage chips show two rows (Opportunities and Risks); the Open / Closed / Both / Custom switch covers the stages of both; Portfolio chips and brands apply to both (a risk's Portfolio field acts like the opportunity's portfolio); On hold applies to opportunities only; **totals keep opportunity revenue and risk value apart** (they mean different things: expected revenue gained versus annual value that could be lost), the stage list is split into two groups, the Team table gets a second value column, and the Deals table gets a Type column. Whether to add them into one "total pipeline" figure is Q66.

## 5R. Darker panel background (Robert, 2026-10-25)

Robert finds the blue of the Choose Your Data panel "a bit too bright" in dark mode. **A separate comparison page, `docs/mockups/pipeline_panel_backgrounds.html`, shows eight darker choices** (not an official Pipeline mockup): 1 today (#20304f), 2 navy one notch darker (#1a2740), 3 deep navy (#162036), 4 midnight (#121b2d), 5 ink (#0e1626), 6 graphite, a neutral grey-blue (#1c222e), 7 charcoal slate (#171b24), 8 blue-black (#0f1a2e), each with matching box, field and line colours. **Robert picked set 7, Charcoal slate** (panel #171b24, boxes #1e232e, fields #11151c, lines #2c3444; dark mode only), applied to the Choose Your Data and settings panels in v9; Q68; it would also apply to the settings panel unless he says otherwise.

## 5S. Three types, kept apart; ROSA now (Robert, 2026-10-25) — changes 5Q and "ROSA later"

On v9 Robert said he expected **two components rather than a total pipeline**: "implant sales, risks, and Rosa are very separate types that get reported independently of each other, but could be reported together, just not mashed together." The business is relaunching ROSA, so **ROSA is in scope now** ("then we've captured it").

How v10 shows it (to confirm in review):

- **Three independent on/off buttons**: Opportunities, Risks, ROSA (at least one stays on). Each one on adds its own section.
- **Each section has its own totals** (count, value per currency, needs attention), **its own "By stage" component and its own "By expected close quarter" component.** No number ever adds values across types. The stage component is much narrower (about 520 px).
- **Stage view options** for Robert to compare (mockup option "Stage view"): funnel with width following the number of deals; funnel in even steps; compact bars. Count and value sit inside each stage. Q70.
- **ROSA** has its own stages: Sales Pipeline, Surgeon Engagement, Executive Presentation, Negotiation, then Closed Won and Deal Lost. Its value is ROSA Growth $ (`ROSAGrowthDollar__c`); it names a Healthcare Facility, not a surgeon. **Portfolio and brand do not apply to ROSA; On hold applies to opportunities only.** The Team table gets one value column per type; the Deals table gets a Type column; the stage chips in the panel are in one row per type.
- The ROSA facts above are from read-only PROD checks; the real field list, value meaning and stage use are for Robert's walkthrough (Q69). Invented data only in the mockup.

## 5T. Funnel options (answers 5L in part)

v10 builds the funnel Robert asked for in 5L, for each type separately, as two funnel styles beside the bars. He has not yet picked one (Q70).

## 5U. ROSA deal: fields and life cycle (Robert's walkthrough, 2026-10-25, creating an AU ROSA Opportunity in UAT)

A ROSA deal is about **a robot placed in a hospital**, so the record is about the **Healthcare Facility** (many surgeons may use it). Primary HCP can be filled but is not the point. **Healthcare Facility is the required field on a ROSA deal in PROD and should be the same in UAT (Robert, 2026-10-25, Q71); the facility is the main name shown.**

| What                      | Field (PROD)                                                                                     | Notes                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Value                     | `ROSAGrowthDollar__c` (ROSA Growth $)                                                            | What the business expects to grow by with the robot; some reps use just the robot's value, since linked implant deals can exist. Separate from `AmountPerYear__c`. |
| Stage                     | `Stage__c`                                                                                       | Open: Sales Pipeline, Surgeon Engagement, Executive Presentation, Negotiation. Finished: Closed Won, Deal Lost.                                                    |
| Deal type (rep picks one) | `ROSA_Deal_Type__c`                                                                              | Capital Sale, Rental, Placement, ROSA-E, ROSA-T.                                                                                                                   |
| Sales type (multi-select) | `ROSA_Sales_Type__c`                                                                             | Hip, Knee, Shoulder: the robot configuration (knee mostly; hip and shoulder with add-ons).                                                                         |
| Configuration stages      | `ROSA_Platform_Shoulder_Stage__c`, `ROSA_Platform_Hip_Stage__c`, `ROSA_Platform_Partial_Knee__c` | Same stage names, five values each (no Deal Lost); each configuration can move independently of the overall deal.                                                  |
| Dates                     | `Install_Date__c`, `Close_Date__c`                                                               | Real dates; they stay outside the expected conversion quarter.                                                                                                     |
| Quarter                   | `Expected_Closure_Quarter__c`                                                                    | Same year-qualified change as the other types.                                                                                                                     |
| Standard                  | priorities, background                                                                           | Rep priority, state priority, background information.                                                                                                              |

Other ROSA fields seen in PROD (questions only, nothing decided): `ROSA_Priority__c`, platform counts (`ROSA_Hip_Platforms__c`, `ROSA_Partial_Knee_Platforms__c`, `ROSA_Shoulder_Platforms__c`), `Install_QTR__c`, `ROSA_Deal_Replaces_Existing_Unit__c`, `Link_To_ROSA_Deal__c`. Q72 to Q74. **Read-only PROD facts (2026-10-25, 396 ROSA records):** ROSA Priority is set on 158 (State 155, National 117) and is the only place a national priority is recorded for ROSA (the national priority tick is on none); Install Quarter is typed text (160 hold just "Q") against Install Date filled on 61; Link To ROSA Deal is used by 16 implant deals and by no ROSA deal; "replaces existing unit" is ticked on 2; platform counts are automatic and above zero on 12. Robert thinks some of these may be deprecated: **nothing is changed without his sign-off.**

**Robert's answers (2026-10-25):** **priority for ROSA is just rep priority and state priority**; national priority goes for ROSA (managed by state now; it dates from when a ROSA manager looked after it nationally), so `ROSA_Priority__c` is not used by Pipeline (removing it from the layout or the field needs his explicit go-ahead). **A ROSA deal is closed by its stage** (Closed Won or Deal Lost), not by the closed tick, so the 14 "Deal Lost" records not ticked closed count as closed. **No filter on install quarter**; the expected quarter filter covers quarters; install quarter or install date might be a column in the ROSA list. Platform counts: he did not know what they are, so they are left out for now (Q74).

Life cycle: starts and finishes by its stages, different from implants; Chatter updates are posted as it progresses. **For the mockup:** show the real deal types (including ROSA-E and ROSA-T), the facility as the name, ROSA Growth $ as the value, and a deal-type filter for ROSA.

## 5V. Decide from examples; a list for each type (Robert, 2026-10-25)

- **Stage view (Q70) and button style (Q67):** Robert cannot decide from a letter or a description: "I'd have to see an example of all three." **Each choice gets its own comparison page with every option drawn side by side on the same data**, named in the question (never "options A to E"): `docs/mockups/pipeline_choose_stage_view.html` (three stage views, shown for Opportunities and Risks) and `docs/mockups/pipeline_choose_buttons.html` (five on/off button looks; the buttons work). Both have dark and light. Questions are written to be understood hours later.
- **A list for each type (Q75):** "We may have to consider showing the types of opportunities separately, like implant opportunities, risk opportunities and ROSA opportunities, because there could be some different columns that we want to show for each of them." So the Deals list may become one list per type, each with its own columns (for example ROSA: facility, deal type, install date, ROSA Growth $; opportunities: surgeon, portfolio, brand). Shown in `docs/mockups/pipeline_manager_v12.html` (options bar: "Deals list") for him to judge; not decided.
- **Order of work (Robert):** the manager screen is not finished, so rep mobile questions are deferred, and extra data (events) waits.

## 5W. Opening a deal: what Robert wants to see (Robert, 2026-10-25; not yet designed)

So far the screen has summaries and a list; **what a deal looks like when a manager clicks into it is still to be designed (a mockup comes first)**. What Robert has said belongs there:

- **The key information and fields** a rep fills in (from the walkthroughs: 5K implant, 5M risk, 5U ROSA), including MyMo detail (not a filter, Q64).
- **Chatter** (Q26, Q28): read the posts; write a new post or a reply; @mention people. Uses standard Chatter; notifications follow each user's own Salesforce settings, so nothing extra is built. No likes, files or photos.
- **The surgeon's usages** (Q29, Q30): the surgeon's **rating for the deal's portfolio** (a hip opportunity shows the hip rating: platinum, gold, silver or bronze, stored on the account), **when the usages were last updated** (oldest usage, or the last usage entered and when modified) and **a warning when they look old** (for example a gold hip rating built on 3-year-old usages), so a manager can ask the rep to check them. Usages are what surgeons do with Zimmer Biomet versus competitor products, rolled up onto the account by Declarative Lookup Rollup Summaries (read only). Verified read-only in PROD (2026-10-25): the object is `Usage__c`; the account holds the rolled-up counts and one formula rating per area: `HCPUsageHipRating__c`, `HCPUsageKneeRating__c`, `HCPUsageShoulderRating__c`, `HCPUsageCMFRating__c`, `HCPUsageRibFixRating__c`, `HCPUsageTMJRating__c`, `HCPUsageThoracicRating__c` (PLATINUM, GOLD, SILVER, BRONZE).
- **The surgeon's surgeries** (Q33 to Q35): from `Case__c` (Australia only today; New Zealand early 2027; SG, MY, TH perhaps a year later): **how many surgeries in the last 12 months, by surgery type** (hip, knee, shoulder), counting back 365 days from the day it is run, **past surgeries only**, worked out when the deal is opened. Always run it, zero records is fine elsewhere. Not commercially sensitive: everyone using the tool sees it. Verified: surgeon link `Physician__c`, date `Surgery_Date__c`, type `Surgery_Type__c` (labelled "Anatomy": Hip, Knee, Shoulder / Elbow and more).
- **Not now:** medical education events (Q31; `Cvent_Event_Contacts__c`, "Cvent registrations") are parked as nice-to-have extra data.

## 5X. What sets the stage-change and Chatter dates (Claude, read-only, PROD, 2026-10-25; Q58)

- **Last Stage Change Date** (`Last_Stage_Change_Date__c`): set to now by the active before-save flows "Sales & Risks - Fast Field Update" and "Sales & Risks - Pre-Save Flow" when the stage changes or the record is created.
- **Latest Chatter Date** (`Latest_Chatter_Date__c`): set by the active process "Sales/Risks FeedItem - Last Chatter Update Date" (runs on a new text post whose parent is a SalesRisks record) calling the flow "Sales Risks - Update Last Chatter Date" (live version 11; version 12 is an unfinished draft). **Anyone's text post sets it**; replies, links and files do not; no check on who posted. **This corrects the earlier note that it follows the owner's own posts** (a 12-record sample that happened to fit).
- No Apex class or trigger and no roll-up tool setting writes either date.
- **Consequences for design:** (1) the quarter validation rule must not fire on these system saves, so it checks only when the quarter is set or changed and on creation (to confirm with Robert); (2) because managers will post and reply from Pipeline, a manager's post would restart the rep's "last posted" clock unless Pipeline works the clock out itself from posts by the owner: Q76.

## 6. Open questions

All open questions for Robert are in **`Pipeline_Questions_For_Robert.md`** (Q1 to Q76) with a "Where we are" summary at the top. Nothing is assumed: an unanswered question stays open and nothing depending on it is built. Questions for the business go in `Pipeline_Team_Questions.md`.

Facts worth keeping beside them: UAT and PROD differ on `SalesRisks__c` (UAT has `Status__c`, PROD does not), so build against PROD's shape and check a field in both orgs before using it; PROD open records: 849 of 1,018 have a stage-change date, 630 have a Chatter date, and the longest wait since a stage change is 1,171 days.
