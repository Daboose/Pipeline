# Pipeline — fields on the real page layouts (PROD, read-only, 2026-10-25)

What a rep sees today when entering or editing a deal, by Australian record type (other countries use the same layouts per segment). **R** = required on the layout, **x** = shown, blank = not on that layout. Read from the PROD page layouts; nothing is changed. This is a checklist for Robert's walkthrough of the fields (Q11), not a decision.

| Field (label on the layout) | API name                      | Hip | Knee | Extremities | CMFT | Risk | ZBEdge |
| --------------------------- | ----------------------------- | --- | ---- | ----------- | ---- | ---- | ------ |
| Primary HCP                 | `Account__c`                  | R   | R    | R           | x    | R    | R      |
| Stage                       | `Stage__c`                    | R   | R    | R           | R    | R    | R      |
| Healthcare Facility         | `Healthcare_Facility__c`      | x   | x    | x           | x    | x    |        |
| Portfolio                   | `Portfolio__c`                |     |      |             |      | R    | R      |
| Technology                  | `Technology__c`               |     |      |             |      |      | R      |
| Brands                      | `Brand__c`                    | R   | R    | R           | R    | R    |        |
| Expected Conversion Quarter | `Expected_Closure_Quarter__c` | R   | R    | R           | R    | R    | R      |
| Expected Annual Value $     | `AmountPerYear__c`            | R   | R    | R           | R    | R    |        |
| Currency                    | `CurrencyIsoCode`             | x   | x    | x           | x    | x    |        |
| Expected Annual Units/Cases | `UnitsCasesPerYear__c`        | x   | x    | x           | x    |      |        |
| Rep Priority                | `Priority__c`                 | x   | x    | x           | x    | x    | x      |
| State Priority              | `State_Priority__c`           | x   | x    | x           | x    | x    | x      |
| On Hold                     | `OnHold__c`                   | x   | x    | x           | x    |      | x      |
| HCP Rating                  | `pbiSegmentationRating__c`    | x   | x    | x           | x    | x    | x      |
| Segmentation Competitors    | `Segmentation_Competitors__c` | x   | x    | x           | x    |      | x      |
| Link To ROSA Deal           | `Link_To_ROSA_Deal__c`        | x   | x    | x           |      |      |        |
| myMo                        | `myMo__c`                     | x   | x    | x           |      |      |        |
| myMo Stage                  | `myMo_Stage__c`               | x   | x    | x           |      |      |        |
| Background Information      | `Objective__c`                | x   | x    | R           | x    | x    | R      |
| Last Stage Change Date      | `Last_Stage_Change_Date__c`   | x   | x    | x           | x    | x    | x      |
| Latest Chatter Date         | `Latest_Chatter_Date__c`      | x   | x    | x           | x    | x    | x      |
| Owner                       | `OwnerId`                     | x   | x    | x           | x    | x    | x      |
| Record Type                 | `RecordTypeId`                | x   | x    | x           | x    | x    | x      |

Read only on the layouts: **Owner and Record Type only** (checked). **Last Stage Change Date and Latest Chatter Date are editable on the layouts**, even though something else normally sets them; worth knowing because they drive the stale warnings.

## Things worth a look in the walkthrough

- **Risks** show Portfolio (required) and Brands, but not On Hold, and not the myMobility fields; their brand list is every brand (Q61). `Risk_Product__c` (filled on 175 of 320 risks) is **not on the Risk layout** (it may be set another way).
- **Primary HCP (the surgeon)** is required on Hip, Knee, Extremities, Risk and ZBEdge but **not on CMFT** (Q32).
- **Background Information** is required only on Extremities and ZBEdge.
- **myMo and myMo Stage** appear only on Hip, Knee and Extremities.
- **Link To ROSA Deal** appears on Hip, Knee and Extremities (16 records use it).
- **Portfolio** and **Technology** are required on ZBEdge; Portfolio is required on Risk, but Portfolio is filled on only 14% of open deals overall.
- **National Priority** and **Reporting Quarter** are on none of these layouts.
- **Expected Conversion Quarter** is the field that will become year-qualified (Q56, Q57).
