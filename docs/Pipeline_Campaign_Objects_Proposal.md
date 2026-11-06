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

## Permission sets (new)

- `Pipeline_Campaign_Manager`: create and change campaigns and members; the Campaign Management app and its classes.
- `Pipeline_Campaign_User`: read campaigns and members; create and delete links for deals the person can edit; for reps (who do not have `Pipeline_User`).
- Pipeline users: read access added to `Pipeline_User` for the Campaign view.

## What would be built, in three separate stages (each deployable on its own)

1. **The objects, permission sets and the Campaign Management app** (campaign list, form, members, paste and import with the check screen).
2. **The Campaigns control** (the record-page quick actions for desktop and phone, and the button in the Pipeline deal flyout). Needs Robert's sign-off for the record page change, and a phone test.
3. **The Pipeline Campaign view** (the toggle, tiles, graphs, members list), replacing the Event choice in Change selection. Version 0.60's event pieces are then removed (the stage path stays).

## Alternatives rejected

- A multi-value field on the deal: needs a new field on an existing object, cannot be reported on, cannot say "which surgeons are missing".
- A deal lookup on the member row (two objects): one deal per surgeon per campaign only; Robert wants a surgeon to have more than one.

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
- A rep with only `Pipeline_Campaign_User`: confirm record access to the deals they link.

## Next

Robert's OK on the objects, then "build" for stage 1 only (UAT first, dry run, then deploy; DEV on his word; PROD by Gearset with a table, title and summary).
