# Pipeline: the year on the 7 deal layouts (for the Gearset deployment to PROD)

These 7 `SalesRisks__c` layouts are PROD's own, read from PROD on 3 November 2026, with one thing added to each: the field
`Expected_Closing_Year__c` placed straight after the Expected Conversion Quarter. Nothing else is changed (checked line by
line against PROD's own files: nothing removed, only year lines added). Compare this branch to PROD in Gearset and tick the
7 layouts; nothing else on this branch needs deploying.

The year field and its values are already in PROD (they went in with stage 1, and Salesforce added the values to all 60 record
types itself), so no record types are on this branch.
