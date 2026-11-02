#!/usr/bin/env python3
"""Works out which Usage__c records to delete in a clean-up (Pipeline, PROD release plan), and what that does to the ratings.

Usage: pipeline_usage_cleanup_list.py <usage_backup.csv> <out_dir> [accounts_rating.csv]
<usage_backup.csv> is a read-only export of every Usage__c with all fields (including RecordTypeId, HCP2__c,
Healthcare_Facility__c, CreatedDate, LastModifiedDate, HCP2__r.Name, Healthcare_Facility__r.Name, RecordType.Name).
[accounts_rating.csv] (optional) is a read-only export of the surgeons' Account rating fields; with it the script also lists
every surgeon and area whose Platinum/Gold/Silver/Bronze rating would change. Nothing is written to any org. The outputs hold
real names and ids: give it a folder OUTSIDE this repo. Regenerate on the day: PROD data keeps changing.

The rule (Robert, 2026-11-02):
- every usage must have a record type, a surgeon and a hospital (Robert, 2026-11-02: "every single usage must be tied to a
  surgeon and a hospital"): any without goes (the old no-record-type shells have no company and no cases);
- a usage that holds numbers for a portfolio other than its record type's own goes too (it is entered wrongly);
- a usage that has a record type but no company and no cases in any line is an empty shell and goes too;
- in each group of the same surgeon, hospital and record type (only valid records are grouped, so one that must go can
  never be the one kept) (no hospital counts as a hospital) keep the newest record and
  delete the rest. "Newest" is the latest real activity: a modification counts unless it is the 31 Dec 2024 mass update
  (7,115 usages were touched that day, so it says nothing about which record is current); otherwise the day it was created.
  A tie goes to the record with more data filled in, then to the higher Id.
The script then proves the result: no usage is left without a record type, a surgeon or a hospital, or with another
portfolio's numbers, and every surgeon, hospital and record type combination appears once.
"""
import csv, os, sys, collections

MASS_UPDATE_DAY = "2024-12-31"
DATA = ["CompanyHipStems__c", "CasesPAHipStem__c", "CompanyHipCups__c", "CasesPAHipCup__c", "CompanyTotalKnee__c",
        "CasesPATotalKnee__c", "CompanyAnatomical__c", "CasesPAAnatomical__c", "CompanyReverse__c", "CasesPAReverse__c",
        "Company_CMFT__c", "Cases_PA_CMFT__c"]

PORTFOLIO_FIELDS = {"Hip": ("CompanyHipStems__c", "CasesPAHipStem__c", "CompanyHipCups__c", "CasesPAHipCup__c"),
                    "Knee": ("CompanyTotalKnee__c", "CasesPATotalKnee__c"),
                    "Shoulder": ("CompanyAnatomical__c", "CasesPAAnatomical__c", "CompanyReverse__c", "CasesPAReverse__c"),
                    "CMFT": ("Company_CMFT__c", "Cases_PA_CMFT__c")}
SUFFIX = (("HIP", "Hip"), ("KNEE", "Knee"), ("SHOULDERS", "Shoulder"), ("CMFT", "CMFT"))
CASE_FIELDS = ["CasesPAHipStem__c", "CasesPAHipCup__c", "CasesPATotalKnee__c", "CasesPAAnatomical__c", "CasesPAReverse__c", "Cases_PA_CMFT__c"]

def portfolio_of(record_type_name):
    for k, p in SUFFIX:
        if (record_type_name or "").endswith(" " + k): return p
    return None

def has_data(r, portfolio):
    return any(r.get(c) not in ("", "0", "0.0", None) for c in PORTFOLIO_FIELDS[portfolio])

def num(x):
    try: return float(x)
    except (TypeError, ValueError): return 0.0

def activity(r):
    m, c = r["LastModifiedDate"], r["CreatedDate"]
    return c if (m[:10] == MASS_UPDATE_DAY and c < m) else max(m, c)

def filled(r):
    return sum(1 for c in DATA if r.get(c) not in ("", "0", "0.0", None))

def totals(records):
    S = collections.defaultdict(lambda: collections.defaultdict(float))
    for u in records:
        s = u["HCP2__c"]
        if not s: continue
        T = S[s]
        T["hz"] += num(u["CasesPAHipStem__c"]) if u["CompanyHipStems__c"] == "ZB" else 0
        T["hc"] += num(u["CasesPAHipStem__c"]) if u["CompanyHipStems__c"] not in ("", "ZB") else 0
        T["kz"] += num(u["CasesPATotalKnee__c"]) if u["CompanyTotalKnee__c"] == "ZB" else 0
        T["kc"] += num(u["CasesPATotalKnee__c"]) if u["CompanyTotalKnee__c"] not in ("", "ZB") else 0
        T["sz"] += (num(u["CasesPAAnatomical__c"]) if u["CompanyAnatomical__c"] == "ZB" else 0) + (num(u["CasesPAReverse__c"]) if u["CompanyReverse__c"] == "ZB" else 0)
        T["sc"] += (num(u["CasesPAAnatomical__c"]) if u["CompanyAnatomical__c"] not in ("", "ZB") else 0) + (num(u["CasesPAReverse__c"]) if u["CompanyReverse__c"] not in ("", "ZB") else 0)
        T["cz"] += num(u["Cases_PA_CMFT__c"]) if u["Company_CMFT__c"] == "ZB" else 0
        T["cc"] += num(u["Cases_PA_CMFT__c"]) if u["Company_CMFT__c"] not in ("", "ZB") else 0
    return S

def rating(z, c, threshold):
    total = z + c
    share = z / total if total > 0 else 0
    if total >= threshold and share >= 0.5: return "PLATINUM"
    if total >= threshold: return "GOLD"
    if share >= 0.5: return "SILVER"
    if total > 0 and c > 0: return "BRONZE"
    return ""

AREAS = [("Hip", "hz", "hc", "HCPUsageHipThreshold__c", "HCPUsageHipRating__c"),
         ("Knee", "kz", "kc", "UsageThresholdKnee__c", "HCPUsageKneeRating__c"),
         ("Shoulder", "sz", "sc", "HCPUsageShoulderThreshold__c", "HCPUsageShoulderRating__c"),
         ("CMFT", "cz", "cc", "HCPUsageCMFThreshold__c", "HCPUsageCMFRating__c")]

def main():
    src, out = sys.argv[1], sys.argv[2]
    acc_file = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    rows = list(csv.DictReader(open(src, newline="", encoding="utf-8")))
    delete, why, kept_of = {}, {}, {}
    for r in rows:
        own = portfolio_of(r.get("RecordType.Name"))
        if not r["RecordTypeId"]:
            delete[r["Id"]] = r; why[r["Id"]] = "no record type (old shell)"
        elif not r["HCP2__c"]:
            delete[r["Id"]] = r; why[r["Id"]] = "no surgeon"
        elif not r["Healthcare_Facility__c"]:
            delete[r["Id"]] = r; why[r["Id"]] = "no hospital"
        elif own and any(has_data(r, q) for q in PORTFOLIO_FIELDS if q != own):
            delete[r["Id"]] = r; why[r["Id"]] = "holds numbers for another portfolio than its record type"
    groups = collections.defaultdict(list)
    for r in rows:
        if r["Id"] not in delete:
            groups[(r["HCP2__c"], r["Healthcare_Facility__c"], r["RecordTypeId"])].append(r)
    reasons = collections.Counter()
    for g in groups.values():
        if len(g) < 2: continue
        g.sort(key=lambda r: (activity(r), filled(r), r["Id"]), reverse=True)
        keep = g[0]
        real = keep["LastModifiedDate"][:10] != MASS_UPDATE_DAY and keep["LastModifiedDate"] > keep["CreatedDate"]
        tie = activity(g[0]) == activity(g[1])
        reason = "duplicate: tie, more data filled in / higher Id" if tie else ("duplicate: newer real modification" if real else "duplicate: newer creation date")
        reasons[reason] += 1
        for r in g[1:]:
            delete[r["Id"]] = r; why[r["Id"]] = reason; kept_of[r["Id"]] = keep
    shells = 0
    for r in rows:
        if r["Id"] in delete or not r["RecordTypeId"]: continue
        if filled(r) == 0:
            delete[r["Id"]] = r; why[r["Id"]] = "typed but empty (no company, no cases)"; shells += 1
    with open(os.path.join(out, "Usage_DELETE_ids.csv"), "w", newline="") as f:
        w = csv.writer(f, lineterminator="\r\n"); w.writerow(["Id"]); [w.writerow([i]) for i in delete]
    with open(os.path.join(out, "Usage_DELETE_review.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["DeleteId", "KeptId", "Why", "Surgeon", "Hospital", "RecordType", "DeleteCreated", "DeleteModified", "KeptCreated", "KeptModified"])
        for i, r in delete.items():
            k = kept_of.get(i)
            w.writerow([i, k["Id"] if k else "", why[i], r.get("HCP2__r.Name", ""), r.get("Healthcare_Facility__r.Name", ""), r.get("RecordType.Name", ""),
                        r["CreatedDate"][:10], r["LastModifiedDate"][:10], k["CreatedDate"][:10] if k else "", k["LastModifiedDate"][:10] if k else ""])
    left = [r for r in rows if r["Id"] not in delete]
    by_why = collections.Counter(("duplicate" if v.startswith("duplicate") else v) for v in why.values())
    print(f"usages read: {len(rows)} | to delete: {len(delete)} {dict(by_why)} | left: {len(left)}")
    bad = {"no record type": sum(1 for r in left if not r["RecordTypeId"]), "no surgeon": sum(1 for r in left if not r["HCP2__c"]),
           "no hospital": sum(1 for r in left if not r["Healthcare_Facility__c"]),
           "another portfolio's numbers": sum(1 for r in left if portfolio_of(r.get("RecordType.Name")) and any(has_data(r, q) for q in PORTFOLIO_FIELDS if q != portfolio_of(r.get("RecordType.Name")))),
           "empty": sum(1 for r in left if filled(r) == 0)}
    combos = collections.Counter((r["HCP2__c"], r["Healthcare_Facility__c"], r["RecordTypeId"]) for r in left)
    bad["duplicate combinations"] = sum(1 for v in combos.values() if v > 1)
    print("CHECK after the delete (every one must be 0):", bad)
    assert not any(bad.values()), "the clean-up would leave non-compliant usages"
    print("CHECK passed: every remaining usage has a record type, a surgeon and a hospital, and each combination appears once.")
    print("duplicate groups decided by:", dict(reasons))
    if acc_file:
        acc = {r["Id"]: r for r in csv.DictReader(open(acc_file, newline="", encoding="utf-8"))}
        names = {r["HCP2__c"]: r.get("HCP2__r.Name", "") for r in rows if r["HCP2__c"]}
        before, after = totals(rows), totals([r for r in rows if r["Id"] not in delete])
        changed = collections.Counter(); moves = collections.Counter()
        with open(os.path.join(out, "Usage_rating_changes.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f); w.writerow(["Surgeon", "Area", "RatingBefore", "RatingAfter", "ZBCasesBefore", "ZBCasesAfter", "OtherCasesBefore", "OtherCasesAfter"])
            for s in sorted({r["HCP2__c"] for r in delete.values() if r["HCP2__c"]}):
                a = acc.get(s)
                if not a: continue
                for name, z, c, thr, rt in AREAS:
                    t = num(a[thr]); b = rating(before[s][z], before[s][c], t); af = rating(after[s][z], after[s][c], t)
                    if b != af:
                        changed[name] += 1; moves[(b or "none", af or "none")] += 1
                        w.writerow([names.get(s, s), name, b or "none", af or "none", before[s][z], after[s][z], before[s][c], after[s][c]])
        print("ratings that would change:", dict(changed), "| total", sum(changed.values()))
        for (b, af), n in moves.most_common(8): print(f"   {b:9} -> {af:9} {n}")
        for lab, k in (("hip", "hz"), ("knee", "kz"), ("shoulder", "sz"), ("CMFT", "cz")):
            b = sum(v[k] for v in before.values()); af = sum(v[k] for v in after.values())
            print(f"   {lab} ZB cases a year: {b:,.0f} now, {af:,.0f} after ({(af - b) / b * 100:.1f}%)")

if __name__ == "__main__":
    main()
