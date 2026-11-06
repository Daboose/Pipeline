# APAC Campaigns: the complete write-up and proposed new objects (for Robert's OK, 2026-11-06)

**THREE NEW CUSTOM OBJECTS. Nothing is created until Robert says OK and then "build". UAT first.**

Why objects and not fields: the standard Campaign object is not on the Platform licence; a campaign needs real member rows (one per surgeon) that can be matched, counted and reported on; and a deal can be in many campaigns while a campaign holds many deals, which a field on the deal cannot do. No field is added to `SalesRisks__c` or Account, and no existing automation is touched.

Per Robert (2026-11-06) these objects and their fields use plain names and labels (no `Pipeline` prefix). Everything else created (Apex, LWC, permission sets, app, tab) keeps the prefix.

## 1. APAC Campaign (`APAC_Campaign__c`)

One row per campaign.

| Field                                                                        | Type              | Notes                                                                                                                          |
| ---------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Name                                                                         | text (system-set) | Friendly name plus country codes, e.g. "Singapore Shoulder Symposium SG-MY-TH". Never typed: a trigger on this object sets it. |
| Friendly Name                                                                | text 40           | What the person types.                                                                                                         |
| Countries                                                                    | multi-select list | AU, NZ, SG, MY, TH, HK, TW, KR, IN (China is out of scope).                                                                    |
| Portfolios                                                                   | multi-select list | Hip, Knee, Extremities, CMFT.                                                                                                  |
| Active                                                                       | checkbox          | Only active campaigns can be linked to deals.                                                                                  |
| Campaign Manager                                                             | lookup to User    | Active, non-portal users only.                                                                                                 |
| Start Date, End Date                                                         | date              | Optional.                                                                                                                      |
| Description                                                                  | long text         | Optional.                                                                                                                      |
| Sharing: everyone reads (needed for the lookup); managers create and change. |

## 2. APAC Campaign Member (`APAC_Campaign_Member__c`)

One row per surgeon per campaign.

| Field                                                                                                                               | Type                           | Notes                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Name                                                                                                                                | auto-number                    |                                                                                  |
| Campaign                                                                                                                            | master-detail to APAC Campaign | Members follow the campaign (sharing, delete, count).                            |
| Surgeon                                                                                                                             | lookup to Account              | Required. Only record type Physician or Emerging Consultant (a validation rule). |
| Unique Key                                                                                                                          | text, unique                   | Campaign + surgeon, so nobody is added twice.                                    |
| The Account page can show a "campaigns" related list from this (changing the Account layout needs Robert's sign-off at build time). |

## 3. APAC Campaign Deal (`APAC_Campaign_Deal__c`)

One row per deal per campaign: the link a rep switches on and off. Nobody works with it directly; the Campaigns screen creates and deletes the rows.

| Field                                                                                                                                                                                                                                                                                                                                                                          | Type                                              | Notes                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| Name                                                                                                                                                                                                                                                                                                                                                                           | auto-number                                       |                                                            |
| Campaign                                                                                                                                                                                                                                                                                                                                                                       | master-detail to APAC Campaign                    |                                                            |
| Deal                                                                                                                                                                                                                                                                                                                                                                           | lookup to Opportunities & Risks (`SalesRisks__c`) | Required. A lookup, so the existing object is not changed. |
| Unique Key                                                                                                                                                                                                                                                                                                                                                                     | text, unique                                      | Campaign + deal.                                           |
| Rules kept in code (not in a trigger on `SalesRisks__c`): the campaign is active, covers the deal owner's country and the deal's portfolio, and the deal's Primary HCP is a member; the person can edit the deal. If a Primary HCP is changed after linking, the Campaign view shows the link as "surgeon no longer a member" rather than a trigger rewriting it (to confirm). |

## Permission sets (new) and how reps get access

- `Pipeline_Campaign_Manager` (the only new permission set for people): create, edit and delete campaigns and their members, and the Campaign Management app and its classes. Robert gives it to campaign managers.
- **No permission set for reps (Robert, 2026-11-06).** He does not want one to give to every user: he will add the access to the 10 country profiles that already drive Sales and Risks. After the build Claude tells him exactly what a rep's profile needs. Expected: read on APAC Campaign (for the lookup); read, create and delete on APAC Campaign Deal (the link) with its fields; and access to the Campaigns control's Apex class. Membership checks are made in code in system mode, so reps should not need to read the members.
- Pipeline users: read access added to `Pipeline_User` (ours) for the Campaign view.

## What would be built, in three separate stages (each deployable on its own)

1. **The objects, permission sets and the Campaign Management app** (campaign list, form, members, paste and import with the check screen).
2. **The Campaigns control** (the record-page quick actions for desktop and phone, and the button in the Pipeline deal flyout). Needs Robert's sign-off for the record page change, and a phone test.
3. **The Pipeline Campaign view** (the toggle, tiles, graphs, members list), replacing the Event choice in Change selection. Version 0.60's event pieces are then removed (the stage path stays).

## Alternatives rejected

- A multi-value field on the deal: needs a new field on an existing object, cannot be reported on, cannot say "which surgeons are missing".
- A deal lookup on the member row (two objects): one deal per surgeon per campaign only; Robert wants a surgeon to have more than one.

## Added 2026-11-06 (Robert): formula fields on the link and member objects, for related lists

Robert approved the three objects and field list ("everything looks really good"), and asked for **formula fields on APAC Campaign Deal that read the campaign's details**, so a related list of campaigns on the Opportunities & Risks page can show them (and, the same way, formula fields on APAC Campaign Member for a campaigns related list on the surgeon's Account). The relationship fields already exist (`Campaign__c` is a master-detail), so these are simple formulas. **Confirmed by Robert, 2026-11-06 ("that's a good idea"): all seven.**

- Campaign Name, Campaign Active, Campaign Manager (name), Start Date, End Date.
- **Portfolios and Countries:** a formula cannot read a multi-select list as text, so two read-only helper text fields on APAC Campaign (`Countries_Text__c`, `Portfolios_Text__c`), filled by the same trigger that sets the name, and the formulas read those.
  The related lists themselves go on the Opportunities & Risks and Account layouts (existing things): Robert adds them in App Builder or the layout himself.

## NAME COLLISION FOUND 2026-11-06 (read-only check of PROD, UAT and DEV): `APAC_Campaign__c` already exists

An existing custom object **`APAC_Campaign__c`, label "APAC Campaign"**, is in all three orgs. It has Name, `Active__c` ("Active?"), `Country__c` (multi-select, AU IN KR MY NZ SG TH TW) and `Description__c`, and 10 records in PROD (names such as "General HCP Check-In", "ATAS 2025", "Hips", "Knees", "New User Tracking"; mostly Thailand, created 2024 to 2026). Its only child is `APAC_Check_In__c` ("APAC Check In", 445 records in PROD: an HCP and healthcare facility visit log with feedback, pointing at the campaign). So it is a label for check-ins, not a selling campaign. **Our proposed object name `APAC_Campaign__c` cannot be created, and its fields would clash.** Hard rule: never change an existing object without explicit sign-off. Separately, `Campaign_Member_List__c` ("Course Member List", 44,622 records, China's courses on the standard Campaign object) exists and is unrelated.
**Recommendation: three differently named new objects**, e.g. `APAC_Sales_Campaign__c` ("APAC Sales Campaign"), `APAC_Sales_Campaign_Member__c` and `APAC_Sales_Campaign_Deal__c`, fields unchanged. Not decided; names are not changed in this document until Robert decides.

## DECIDED 2026-11-06 (Robert): the objects are called **Sales Campaign**, with no APAC

Free in PROD, UAT and DEV (checked): **`Sales_Campaign__c`** ("Sales Campaign"), **`Sales_Campaign_Member__c`** ("Sales Campaign Member") and **`Sales_Campaign_Deal__c`** ("Sales Campaign Deal"). Everywhere in this document, "APAC Campaign", "APAC Campaign Member" and "APAC Campaign Deal" (and their API names `APAC_Campaign__c` and so on) mean these three. The existing `APAC_Campaign__c` (check-in topics) is left alone. Fields, formulas, triggers, permission sets and screens are as written. The related list on Opportunities & Risks is "Sales Campaign Deals".

---

# The whole picture (everything decided in the 2026-11-06 discussion)

## Why

An event is attendance; a campaign is a chosen target list with a sales outcome. Linking deals to an event mixed everyone who came with the people actually targeted. The Link to APAC Event in Pipeline (version 0.60, UAT only) is replaced by campaigns. Campaign Management, the Campaigns control and the Pipeline Campaign view are three mockups in `docs/mockups/` (all liked by Robert): `pipeline_campaign_management_v1.html`, `pipeline_deal_campaigns_v2.html`, `pipeline_campaign_view_v1.html`.

## The rules

1. **Linking is always a decision**, never automatic. Easy at both ends: a rep from the deal, a campaign manager (or anyone covering) from the campaign.
2. **The surgeon is the join.** A deal can join a campaign only if its Primary HCP is a member. Members must be real Accounts of record type Physician or Emerging Consultant (not staging, demo or clinic contacts).
3. **A deal is offered a campaign** when the campaign is active, covers the deal owner's country, and covers the deal's portfolio (a campaign can have several portfolios).
4. **A surgeon's own country never blocks membership.** The member search starts in the campaign's countries (using the surgeon's mailing country, which every surgeon has) and "Widen search" reaches the rest. China is out of scope.
5. **Campaign name is set by the system** from the friendly name plus country codes.
6. **Adding members:** by lookup (2 characters minimum, searching the name and the English name `Preferred_Name__c`, showing current hospitals from `Healthcare_Surgeon_Relationship__c` and the mailing city) or by paste/CSV, always through a check screen: exact matches ticked by the user, wrong suggestions lead to a lookup, unmatched names can create the surgeon or be deleted, only confirmed rows become members.
7. **Values are shown per currency**, never mixed (a multi-country campaign has several).

## The three screens

- **Campaign Management** (new full-screen app): campaign list, form, members, import and check screen.
- **Campaigns control:** a quick action on the standard record page for reps (desktop LWC action and an Aura wrapper for the phone, device-filtered, as APAC Events did), and a button in Pipeline's deal flyout. Switches add or remove the deal and save at once; a fold-out says why other campaigns are not offered.
- **Pipeline Campaign view:** shown only when a campaign is chosen; a toggle in the top middle (Campaign left, Pipeline right) slides between the screens; tiles, rating and stage graphs, and the member list showing who has a deal and who does not (with Link and Remove). The deals lists also get a **Country column** whenever a selection spans more than one country.

## Open points

- Robert's OK for the three new objects (this document), their names, and the trigger that sets the campaign name.
- Friendly-name limit (40 assumed); extra campaign details; the app's name.
- What happens if a deal's Primary HCP is changed after it was linked.
- Phone: must be proven in the Salesforce mobile app.
- Record page and Account layout changes need Robert's explicit sign-off when built (he makes them in App Builder).
- Whether the campaign tool stays in this repo (assumed yes).
- The exact profile permissions a rep needs (to be listed for Robert after the build; he adds them to the 10 country profiles himself).

## Next

Robert's OK on the objects, then "build" for stage 1 only (UAT first, dry run, then deploy; DEV on his word; PROD by Gearset with a table, title and summary).

## BUILT 2026-11-06 (slice 1, UAT only)

Built as `Sales_Campaign__c`, `Sales_Campaign_Member__c` and `Sales_Campaign_Deal__c`. Differences from the text above: the link's Deal field is a master-detail (not a lookup); `Pipeline_Campaign_Manager` also reads `SalesRisks__c`; `Campaign_Manager__c` and `Surgeon__c` clear on delete with required enforced by validation rules; three triggers. See Build Spec "Campaign Management, slice 1".
