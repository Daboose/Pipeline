#!/usr/bin/env python3
"""Works out the Expected Closing Year to load into every deal that has an Expected Conversion Quarter (Pipeline slice 4).

Usage: pipeline_year_backfill.py <deals.csv> <out.csv> [today as YYYY-MM-DD]
<deals.csv> is a read-only export of SalesRisks__c with the columns Id, Expected_Closure_Quarter__c, IsClosed__c,
Last_Stage_Change_Date__c, CreatedDate. <out.csv> gets Id and Expected_Closing_Year__c, ready for a bulk update
(sf data update bulk, or Gearset / Data Loader). Writes no data to any org; the real deal ids stay in the files you give it,
so keep them OUTSIDE this repo.

The rule (Robert, 2026-11-01 and 2026-11-02; docs/Pipeline_Quarter_Year_Design.md):
- an open deal gets the current or next occurrence of its quarter (from Q4 2026: Q4 is 2026, Q1 to Q3 are 2027);
- a closed deal gets the year of its Last Stage Change Date, else the year it was created, never earlier than 2023 (the
  first year in the picklist) and never later than 2033 (the last); so that if a closed deal is ever reopened the
  validation rule has a year to work with;
- a deal with no quarter is left blank.
When the load runs, the person loading needs the Pipeline_Quarter_Rule_Bypass permission set (custom permission
Pipeline_Bypass_Quarter_Rule) so the validation rule does not refuse the load; remove it afterwards.
"""
import csv, sys, datetime

FIRST, LAST = 2023, 2033

def current_or_next(quarter, today):
    q = int(quarter[1])
    cur = (today.month - 1) // 3 + 1
    return today.year if q >= cur else today.year + 1

def year_for(row, today):
    quarter = (row.get("Expected_Closure_Quarter__c") or "").strip()
    if quarter not in ("Q1", "Q2", "Q3", "Q4"):
        return None
    if str(row.get("IsClosed__c")).lower() != "true":
        year = current_or_next(quarter, today)
    else:
        stamp = (row.get("Last_Stage_Change_Date__c") or row.get("CreatedDate") or "")[:4]
        year = int(stamp) if stamp.isdigit() else today.year
    return min(max(year, FIRST), LAST)

def main():
    src, out = sys.argv[1], sys.argv[2]
    today = datetime.date.fromisoformat(sys.argv[3]) if len(sys.argv) > 3 else datetime.date.today()
    rows = list(csv.DictReader(open(src, newline="", encoding="utf-8")))
    n = {"open": 0, "closed": 0, "blank": 0}
    by_year = {}
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\r\n")
        w.writerow(["Id", "Expected_Closing_Year__c"])
        for r in rows:
            y = year_for(r, today)
            if y is None:
                n["blank"] += 1
                continue
            n["closed" if str(r.get("IsClosed__c")).lower() == "true" else "open"] += 1
            by_year[y] = by_year.get(y, 0) + 1
            w.writerow([r["Id"], y])
    print(f"deals read: {len(rows)} | open with a quarter: {n['open']} | closed with a quarter: {n['closed']} | no quarter, left blank: {n['blank']}")
    print("by year:", dict(sorted(by_year.items())))

if __name__ == "__main__":
    main()
