# Plan: Pipeline's settings and filters move to the shared objects

Written 2026-11-17 for Robert's approval. **Nothing in this plan is built.** The shared definition every repo follows is `/Users/robertreeves/VSCODE/AAADESIGN/user-settings-and-filters.md`. Rule for this plan: UAT first (dry run, then the real deploy), DEV only when Robert says UAT is fine, PROD only by Robert with Gearset.

## What changes for people

Nothing they can see. Their settings (theme, Zoom, heading colour, columns and so on) and their saved filters keep working exactly as now; they just live in the shared objects. Campaign Management gets its own copy of theme, Zoom and heading colour, so the two screens stop sharing them.

## What gets built

| #   | Piece                                   | New or changed                                 | Notes                                                                                                                                                                                                              |
| --- | --------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Pipeline_JSON__c` on `UserSettings__c` | New field                                      | Long text, 131,072, description and help text. Pipeline writes it.                                                                                                                                                 |
| 2   | `Campaign_JSON__c` on `UserSettings__c` | New field                                      | Same. Campaign Management writes it.                                                                                                                                                                               |
| 3   | The `UserSettings__c` object file       | Copied byte for byte from the APAC Events repo | Only after that repo's copy has Robert's neutral description ("A Shared Object for Global User Settings."). The Pipeline repo adds only fields 1 and 2.                                                            |
| 4   | **`UserFilter__c` (NEW OBJECT)**        | New                                            | Name, Owner, `Solution__c`, `Filter_Json__c`, `Is_Default__c`. Private, no tab, described. Robert approved creating it, 2026-11-17. No unique key (a person has many filters).                                     |
| 5   | `PipelineController`                    | Changed                                        | Reads and saves the person's settings in `Pipeline_JSON__c` on their `UserSettings` record. The method names and what the screens send do not change.                                                              |
| 6   | `PipelineCampaignController`            | Changed                                        | Reads theme, Zoom and heading colour from `Campaign_JSON__c`; `saveGlobalSettings` writes theme and Zoom there, leaving other keys alone.                                                                          |
| 7   | `PipelineFilterController`              | Changed                                        | Every query and save uses `UserFilter__c` with `Solution__c = 'Pipeline'`. Sharing a copy sets the same Solution. The 50-filter limit and the one default are counted per solution.                                |
| 8   | The three tests                         | Changed                                        | Settings saved in the new field; Campaign and Pipeline do not overwrite each other; a person's filters are not mixed with another solution's; oldest record is used when there are two; sharing copies still work. |
| 9   | `Pipeline_User`                         | Changed                                        | Read, create and edit on `UserSettings__c` and `Pipeline_JSON__c` only; read, create, edit and delete on `UserFilter__c` and its fields. No access to `Campaign_JSON__c` or `APAC_Events_JSON__c`.                 |
| 10  | `Pipeline_Campaign_Manager`             | Changed                                        | Read, create and edit on `UserSettings__c` and `Campaign_JSON__c` only.                                                                                                                                            |
| 11  | A one-off migration script              | New, in `scripts/migration/`, never deployed   | Copies the data (below). Safe to run twice.                                                                                                                                                                        |

**No Lightning web component changes.** The screens call the same Apex methods with the same inputs, so only the Apex classes and the two permission sets change. (The desktop version number is raised with the release, as usual.)

- A person's record is found by Name `UserSettings` and owner; if there is none, the first save creates it (named `UserSettings`, owned by that person). Robert wants exactly ONE record per person, always (2026-11-17), and approved a unique key field on `UserSettings__c` (`User_Key__c`, the person's own 18-character user Id, required and unique; see the shared definition) because two tabs saving at the same moment could each create a record. **Created in UAT on 2026-11-17 by this session at Robert's request** (field file in this repo; APAC Events copies it). Being a required field, it is not listed in any permission set. Pipeline (an extra common field in row 3) and sets it when it creates a record, and on a duplicate-value error reads the existing record and carries on. The migration sets it too.
- `saveGlobalSettings` stays in system mode on the person's own record, as now (a campaign manager may not hold `Pipeline_User`), and the permission sets are given the field access anyway.
- The old `Pipeline_Filter__c` object, its fields and its permission entries stay exactly as they are. Nothing is deleted in this plan.

## The migration (the data)

| From (`Pipeline_Filter__c`)                                               | To                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Each person's settings record (flagged `Is_User_Settings__c`), whole JSON | `Pipeline_JSON__c` on that person's `UserSettings` record (created if missing, owned by them) |
| The same JSON's theme, Zoom and heading colour only                       | `Campaign_JSON__c` on the same record                                                         |
| Each named filter                                                         | A `UserFilter__c` record: same owner, name, JSON and default flag; `Solution__c = 'Pipeline'` |

- **If a person has more than one old settings record, the most recently modified one is copied (Robert, 2026-11-17: it is the most current).** Any other is left in the old object and reported to Robert.
- Run twice-safe: a person whose new field is already filled is skipped; a filter already copied (same owner, name and JSON) is skipped.
- After each run I count old against new and compare a sample of the JSON; the result is reported to Robert.
- UAT and DEV: run by me. PROD: I prepare the files and check them read-only; **Robert loads them** (as with the usage clean-up). Nothing is written to PROD by me.

## Order of work

| Step | Where | What                                                                                                                                                                                                                                       | Who                 |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| 0    |       | Robert approves this plan; confirms the `UserFilter__c` OK and name; the oldest-record rule; and that the APAC repo's object file has the neutral description                                                                              | Robert              |
| 1    | UAT   | **Done 2026-11-17:** `UserFilter__c` (deploy `0AfOg000007TOu9KAG`) and `User_Key__c` on `UserSettings__c`. fields 1 and 2 and the neutral object file also **done 2026-11-17** (deploy `0AfOg000007TKsEKAW`)                               | Claude              |
| 2    | UAT   | Run the migration; count and compare                                                                                                                                                                                                       | Claude              |
| 3    | UAT   | **Deployed 2026-11-17 (`0AfOg000007TPBtKAO`, 32 of 32 tests; Pipeline 0.137):** code and permission sets (dry run, then deploy, naming the three tests plus the campaign and usage tests that touch these classes); desktop version raised | Claude              |
| 4    | UAT   | Robert tests: theme, Zoom, a saved filter, a shared copy, the default filter, the campaign screen's theme and Zoom                                                                                                                         | Robert              |
| 5    | DEV   | Only when Robert says UAT is fine: the same four steps                                                                                                                                                                                     | Claude              |
| 6    | PROD  | The common part (the two objects) first; then Robert loads the migration files; then the code and permission sets, in one Gearset deployment (title, summary and a 🟧 table given at the time); then a read-only check by me               | Robert, then Claude |
| 7    | later | Retire `Pipeline_Filter__c` (the old object) only when Robert says so                                                                                                                                                                      | Robert              |

Why the data moves before the code (steps 2 and 3, and in PROD): if the code went first, everyone would see the default settings and no saved filters until the data arrived. Just before the code release, one more quick run copies any settings or filters changed since the first run.

## Things to know

- **Release order in PROD:** `UserSettings__c` and `UserFilter__c` must be there before anything of ours. In Gearset, never tick deletions for these objects (other solutions' fields would show as "only in the org").
- **Campaign starts with a copy** of each person's theme, Zoom and heading colour (Robert: migrate what exists). After that the two screens are independent: a Zoom changed on one no longer changes the other.
- **Phone:** the phone app reads the same settings through the same Apex; it is not changed, but I will check it still loads after step 3.
- **Not part of this plan:** the Usage Card (UAT only), and the other solutions' own filters.
