#!/usr/bin/env python3
"""Builds the Data Loader files that move Pipeline's settings and saved filters into the shared objects (PROD release, 2026-11-17).

Usage: pipeline_settings_prod_load.py <export.csv> <out folder>
<export.csv> is a read-only export of Pipeline_Filter__c with the columns Id, OwnerId, Name, Is_User_Settings__c, Is_Default__c,
Settings_Json__c, Filter_Json__c, LastModifiedDate and the owner's Owner.IsActive. Writes two files into <out folder>:
  UserSettings_load.csv  (insert into UserSettings__c): OwnerId, Name, User_Key__c, Pipeline_JSON__c, Campaign_JSON__c
  UserFilter_load.csv    (insert into UserFilter__c): OwnerId, Name, Solution__c, Filter_Json__c, Is_Default__c
and prints a check report. It writes nothing to any org. The files hold real data (people's Ids and settings): keep them
OUTSIDE this repo, never commit them.

The rules (AAADESIGN/user-settings-and-filters.md; docs/Pipeline_Settings_Move_Plan.md):
- each person's most recently modified settings record is copied whole into Pipeline_JSON__c; its theme, zoom and headColour
  keys (and only those) go into Campaign_JSON__c; User_Key__c is the person's own 18-character Id; Name is exactly UserSettings;
- each named filter keeps its owner, name, JSON and default flag, with Solution__c = Pipeline;
- anything unreadable, over 30,000 characters, owned by an inactive user, or with a bad Id stops the run with a message.
The person loading needs field access to the new fields (System Administrator by hand, or a temporary permission set).
"""
import csv, json, sys, os

CAMPAIGN_KEYS = ("theme", "zoom", "headColour")
SOLUTION = "Pipeline"

def fail(msg):
    print("STOP: " + msg)
    sys.exit(1)

def main(src, outdir):
    with open(src, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        fail("the export is empty")
    for r in rows:
        if len(r["OwnerId"]) != 18:
            fail("owner Id is not 18 characters: " + r["OwnerId"])
        if r.get("Owner.IsActive", "true").lower() != "true":
            fail("a record is owned by an inactive user: " + r["OwnerId"])
    settings, filters = {}, []
    for r in rows:
        if r["Is_User_Settings__c"].lower() == "true":
            cur = settings.get(r["OwnerId"])
            if cur is None or r["LastModifiedDate"] > cur["LastModifiedDate"]:
                settings[r["OwnerId"]] = r
        else:
            filters.append(r)
    os.makedirs(outdir, exist_ok=True)
    set_rows = []
    for owner, r in sorted(settings.items()):
        whole = r["Settings_Json__c"]
        if not whole or len(whole) > 30000:
            fail("settings JSON is empty or too long for " + owner)
        try:
            parsed = json.loads(whole)
        except ValueError:
            fail("settings JSON is unreadable for " + owner)
        camp = {k: parsed[k] for k in CAMPAIGN_KEYS if k in parsed}
        set_rows.append({
            "OwnerId": owner,
            "Name": "UserSettings",
            "User_Key__c": owner,
            "Pipeline_JSON__c": whole,
            "Campaign_JSON__c": json.dumps(camp, separators=(",", ":")),
        })
    fil_rows = []
    defaults = {}
    for r in sorted(filters, key=lambda x: (x["OwnerId"], x["Name"])):
        if not r["Name"] or len(r["Name"]) > 80:
            fail("a filter name is empty or over 80 characters for " + r["OwnerId"])
        if not r["Filter_Json__c"] or len(r["Filter_Json__c"]) > 30000:
            fail("filter JSON is empty or too long: " + r["Name"])
        try:
            json.loads(r["Filter_Json__c"])
        except ValueError:
            fail("filter JSON is unreadable: " + r["Name"])
        is_def = r["Is_Default__c"].lower() == "true"
        if is_def:
            defaults[r["OwnerId"]] = defaults.get(r["OwnerId"], 0) + 1
            if defaults[r["OwnerId"]] > 1:
                fail("more than one default filter for " + r["OwnerId"])
        fil_rows.append({
            "OwnerId": r["OwnerId"],
            "Name": r["Name"],
            "Solution__c": SOLUTION,
            "Filter_Json__c": r["Filter_Json__c"],
            "Is_Default__c": "true" if is_def else "false",
        })
    with open(os.path.join(outdir, "UserSettings_load.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["OwnerId", "Name", "User_Key__c", "Pipeline_JSON__c", "Campaign_JSON__c"], quoting=csv.QUOTE_ALL)
        w.writeheader(); w.writerows(set_rows)
    with open(os.path.join(outdir, "UserFilter_load.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["OwnerId", "Name", "Solution__c", "Filter_Json__c", "Is_Default__c"], quoting=csv.QUOTE_ALL)
        w.writeheader(); w.writerows(fil_rows)
    print("settings people: %d (one record each) -> UserSettings_load.csv" % len(set_rows))
    print("named filters:   %d -> UserFilter_load.csv (%d people with a default)" % (len(fil_rows), len(defaults)))

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
