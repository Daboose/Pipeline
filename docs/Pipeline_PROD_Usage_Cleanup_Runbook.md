# PROD usage clean-up: the steps (Robert runs it; Claude prepares and checks, and never changes PROD)

The rules it applies are in `Pipeline_PROD_Release_Plan.md` ("The usage clean-up first"): every usage must have a record type, a surgeon and a hospital; no usage may hold another portfolio's numbers or be completely empty; of duplicates (same surgeon, hospital and record type) the newest is kept. The files named here are in `Opportunities and Risks/exports/` (outside the repo, because they hold real names and ids).

## Before

1. **Backup:** `PROD_Usage_all_backup_PRE-CLEANUP.csv` (every usage, all fields, taken just before the run). Keep it.
2. **The list:** `PROD_usage_cleanup_FINAL/Usage_DELETE_ids.csv` (one column, `Id`). Its row count is written in the message that came with it; check the file has that many rows.
3. **Look through** `Usage_DELETE_review.csv` (each record to delete beside the record kept, with the reason). A handful of each reason is enough.
4. **Tell people** who use the usage ratings or totals (reports, Power BI, wallboards): about 480 surgeon-areas change rating, mostly down, and the ZB case totals fall about 30%; `Usage_rating_changes.csv` lists them.
5. **Choose a quiet time.** Every delete makes the roll-up tool add the surgeon's totals up again, instantly.

## Run

Use **Data Loader** (or Workbench): operation **Delete**, object **Usage__c**, the file `Usage_DELETE_ids.csv`, map `Id` to `Id`. **Batch size 200**, and **do not tick "Use Bulk API"** (the normal API runs the roll-ups one batch at a time, which is the gentle way). Save the success and error files.

If some rows fail with a limit or a lock error, run the error file again with a batch size of 50.

## After

6. **Count:** usages should be the backup's count minus the ids deleted.
   6b. **Recalculate the roll-ups (needed after a delete).** In PROD the roll-ups on usages are set to "Process Builder" mode, which recalculates when a usage is **created or edited**, not when one is **deleted**. So after the delete the surgeons' account totals and Platinum/Gold/Silver/Bronze ratings still count the deleted records (checked right after the 2026-11-02 delete: 246 surgeons' hip totals and 402 knee totals were too high, and no rating had moved). In the Declarative Lookup Rollup Summaries app, open each rollup whose child object is `Usage__c` and run **Calculate** (a gentle batch job): the `HCP_...` ones (Hip, Knee, Shoulder, CMFT_CMF, and the RibFix, TMJ and Thoracic ones) feed the surgeon ratings and Pipeline; the `HCF_...` ones feed the hospital totals and should be run too. If an unfinished calculate job is blocking, clear it from the Lookup Rollup Calculate Jobs tab first. Afterwards ask Claude to compare the stored totals with the usages (it must find none out), and the ratings should match `Usage_rating_changes.csv`.
7. **In Workbench or the developer console**, each should return 0:
   `SELECT COUNT() FROM Usage__c WHERE RecordTypeId = null`,
   `SELECT COUNT() FROM Usage__c WHERE Healthcare_Facility__c = null`,
   `SELECT COUNT() FROM Usage__c WHERE HCP2__c = null`.
8. **Ask Claude to prove it:** it takes a fresh export and runs the same script on it; the answer must be "to delete: 0" and every check 0.
9. **Spot check** a few surgeons from `Usage_rating_changes.csv`: the rating on the account should now be the "after" one.

## Taking it back

Deleted records sit in the **Recycle Bin for about 15 days** (select them and Undelete; the roll-ups add them back). After that, re-insert rows from the backup file (they get new ids).
