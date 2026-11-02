#!/usr/bin/env python3
"""Builds the UAT deploy folder that adds the Expected Closing Year picklist values
to every SalesRisks__c record type and the field to every layout that carries
Expected Conversion Quarter (Pipeline slice 4).

Usage: pipeline_add_year_to_deals.py <retrieved-record-types-dir> <retrieved-layouts-dir> <out-dir>
Reads UAT copies (retrieved with sf), writes patched copies plus the new field and the
Pipeline_User permission set into <out-dir>. Never touches the repo's own files and is
never run against PROD (PROD record types and layouts are changed by Gearset / by hand).
"""
import os, re, shutil, sys

rt_dir, lay_dir, out = sys.argv[1:4]
repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
obj = os.path.join(out, "force-app/main/default/objects/SalesRisks__c")
YEARS = range(2033, 2022, -1)

os.makedirs(os.path.join(obj, "recordTypes"), exist_ok=True)
os.makedirs(os.path.join(obj, "fields"), exist_ok=True)
os.makedirs(os.path.join(out, "force-app/main/default/layouts"), exist_ok=True)
os.makedirs(os.path.join(out, "force-app/main/default/permissionsets"), exist_ok=True)
shutil.copy(os.path.join(repo, "sfdx-project.json"), out)
shutil.copy(os.path.join(repo, "force-app/main/default/objects/SalesRisks__c/fields/Expected_Closing_Year__c.field-meta.xml"), os.path.join(obj, "fields"))
shutil.copy(os.path.join(repo, "force-app/main/default/permissionsets/Pipeline_User.permissionset-meta.xml"), os.path.join(out, "force-app/main/default/permissionsets"))

block = "    <picklistValues>\n        <picklist>Expected_Closing_Year__c</picklist>\n" + "".join(
    f"        <values>\n            <fullName>{y}</fullName>\n            <default>false</default>\n        </values>\n" for y in YEARS
) + "    </picklistValues>\n"

n_rt = 0
for f in sorted(os.listdir(rt_dir)):
    if not f.endswith(".recordType-meta.xml"):
        continue
    s = open(os.path.join(rt_dir, f)).read()
    if "Expected_Closing_Year__c" in s:
        continue
    s = s.replace("</RecordType>", block + "</RecordType>")
    open(os.path.join(obj, "recordTypes", f), "w").write(s)
    n_rt += 1

n_lay = 0
item = re.compile(r"(?P<indent>[ ]*)<layoutItems>\s*<behavior>\w+</behavior>\s*<field>Expected_Closure_Quarter__c</field>\s*</layoutItems>\n")
for f in sorted(os.listdir(lay_dir)):
    if not f.endswith(".layout-meta.xml"):
        continue
    s = open(os.path.join(lay_dir, f)).read()
    m = item.search(s)
    if not m or "Expected_Closing_Year__c" in s:
        print("layout left alone:", f)
        continue
    i = m.group("indent")
    new = f"{i}<layoutItems>\n{i}    <behavior>Edit</behavior>\n{i}    <field>Expected_Closing_Year__c</field>\n{i}</layoutItems>\n"
    s = s[: m.end()] + new + s[m.end():]
    open(os.path.join(out, "force-app/main/default/layouts", f), "w").write(s)
    n_lay += 1
print(f"record types patched: {n_rt}; layouts patched: {n_lay}")
