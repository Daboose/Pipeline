# PROD release: ROSA Shoulder POC, ROSA deal screen 0.25, Pipeline 0.182, Campaign Management 0.56

Prepared 2026-11-28. Source: GitHub branch `release-prod-rosa-poc` (only this release's items; matches main `456e722`). UAT and DEV level. PROD checked read-only the same day. Robert releases with Gearset.

ROSA has its own question bank (ROSA Question Set, ROSA Question); it uses nothing from APAC Events (Robert, 2026-11-28).

🟨 **Title:** ROSA Shoulder POC and ROSA deal screen (Pipeline 0.182, Campaign Management 0.56)

🟨 **Summary:** Brings in the ROSA Shoulder proof of concept: a checklist that drives a ROSA deal's stage, ROSA Deal Surgeons with volumes, credentialing and Q&A from ROSA's own question sets, a price table that calculates ROSA Growth $, sharing to the deal lead and sales rep, and the full-window ROSA deal screen opened from the deal page, Pipeline and campaigns. The old Robotics objects are repurposed: their two roll-ups are removed and the surgeon's master-detail becomes a lookup.

## The plan, in order

**Step 1: by hand in PROD.** Setup, Object Manager, ROSA Checklist (Robotics), Fields & Relationships: delete Total Surgeons and Total Units, then Deleted Fields: Erase both.

**Step 2: Gearset.** Compare GitHub branch release-prod-rosa-poc to PROD. Filter: the 19 types below. Select all on New and on Changed; nothing on Deleted. Tests: Run specified tests: ROSAAutomationTest, ROSADealControllerTest, PipelineCampaignControllerTest. (The branch also holds PROD's own Opportunities & Risks object file, unchanged, so Gearset can show its new fields; it shows as the same.)

| 🟧 Metadata type (Gearset) | 🟧 How many |
| -------------------------- | ----------- |
| Apex class                 | 6           |
| Visualforce page           | 2           |
| Apex trigger               | 5           |
| Aura component             | 1           |
| Compact layout             | 3           |
| Custom field               | 144         |
| Custom object              | 6           |
| Custom permission          | 1           |
| Custom tab                 | 2           |
| Lightning page             | 4           |
| Global Picklist Value Set  | 1           |
| Page layout                | 3           |
| Lightning web component    | 10          |
| List view                  | 2           |
| Permission set             | 3           |
| Quick action               | 4           |
| Record type                | 1           |
| Sharing reason             | 2           |
| Validation rule            | 11          |

**Step 3: after the release.**

| 🟧 # | 🟧 Step                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Assign ROSA Deal Management (deal leads, ROSA team) and ROSA Credentialing Admin (marketing)                                                                   |
| 2    | Activate ROSA_Deal_Record_Page for the ROSA record types (App Builder), as in UAT                                                                              |
| 3    | Run scripts/apex/rosa_share_existing_deals.apex once                                                                                                           |
| 4    | Marketing adds the real question sets in the ROSA Question Sets tab (or run scripts/apex/rosa_seed_shoulder_questions.apex) and the real prices in ROSA Prices |
| 5    | Hard refresh (Cmd+Shift+R)                                                                                                                                     |

## Every item (211)

| 🟧 # | 🟧 Metadata type (Gearset) | 🟧 Name                                                       | 🟧 New or changed | 🟧 Tests           |
| ---- | -------------------------- | ------------------------------------------------------------- | ----------------- | ------------------ |
| 1    | Apex class                 | PipelineCampaignController                                    |                   |                    |
| 2    | Apex class                 | PipelineCampaignControllerTest                                |                   | Test class: run it |
| 3    | Apex class                 | ROSAAutomation                                                |                   |                    |
| 4    | Apex class                 | ROSAAutomationTest                                            |                   | Test class: run it |
| 5    | Apex class                 | ROSADealController                                            |                   |                    |
| 6    | Apex class                 | ROSADealControllerTest                                        |                   | Test class: run it |
| 7    | Visualforce page           | PipelineApp                                                   |                   |                    |
| 8    | Visualforce page           | ROSADeal                                                      |                   |                    |
| 9    | Apex trigger               | ROSA_ChecklistTrigger                                         |                   |                    |
| 10   | Apex trigger               | ROSA_CredentialingAnswerTrigger                               |                   |                    |
| 11   | Apex trigger               | ROSA_DealTrigger                                              |                   |                    |
| 12   | Apex trigger               | ROSA_PriceTrigger                                             |                   |                    |
| 13   | Apex trigger               | ROSA_SurgeonTrigger                                           |                   |                    |
| 14   | Aura component             | ROSADealOut                                                   |                   |                    |
| 15   | Compact layout             | ROSA_Credentialing_Answer__c.ROSA_Answer                      |                   |                    |
| 16   | Compact layout             | Robotics_Surgeons__c.ROSA_Surgeon                             |                   |                    |
| 17   | Compact layout             | Robotics__c.ROSA_Deal_Checklist                               |                   |                    |
| 18   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answer_Date__c              | New               |                    |
| 19   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answer_Number__c            | New               |                    |
| 20   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answer_Text__c              | New               |                    |
| 21   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answer_Type__c              | New               |                    |
| 22   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answer_Yes_No__c            | New               |                    |
| 23   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answer__c                   | New               |                    |
| 24   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answered_By__c              | New               |                    |
| 25   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Answered_Date__c            | New               |                    |
| 26   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Display_Order__c            | New               |                    |
| 27   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Is_Answered__c              | New               |                    |
| 28   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Question_Link__c            | New               |                    |
| 29   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Question_Text__c            | New               |                    |
| 30   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Required__c                 | New               |                    |
| 31   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Set_Question__c             | New               |                    |
| 32   | Custom field               | ROSA_Credentialing_Answer__c.ROSA_Surgeon__c                  | New               |                    |
| 33   | Custom field               | ROSA_Price__c.ROSA_Active__c                                  | New               |                    |
| 34   | Custom field               | ROSA_Price__c.ROSA_Country__c                                 | New               |                    |
| 35   | Custom field               | ROSA_Price__c.ROSA_Joint__c                                   | New               |                    |
| 36   | Custom field               | ROSA_Price__c.ROSA_Key__c                                     | New               |                    |
| 37   | Custom field               | ROSA_Price__c.ROSA_Price__c                                   | New               |                    |
| 38   | Custom field               | ROSA_Question_Set__c.ROSA_Active__c                           | New               |                    |
| 39   | Custom field               | ROSA_Question_Set__c.ROSA_Pathway__c                          | New               |                    |
| 40   | Custom field               | ROSA_Question__c.ROSA_Active__c                               | New               |                    |
| 41   | Custom field               | ROSA_Question__c.ROSA_Answer_Type__c                          | New               |                    |
| 42   | Custom field               | ROSA_Question__c.ROSA_Display_Order__c                        | New               |                    |
| 43   | Custom field               | ROSA_Question__c.ROSA_Question_Set__c                         | New               |                    |
| 44   | Custom field               | ROSA_Question__c.ROSA_Question_Text__c                        | New               |                    |
| 45   | Custom field               | ROSA_Question__c.ROSA_Required__c                             | New               |                    |
| 46   | Custom field               | Robotics_Surgeons__c.ROSA_Career_Position__c                  | New               |                    |
| 47   | Custom field               | Robotics_Surgeons__c.ROSA_Champion__c                         | New               |                    |
| 48   | Custom field               | Robotics_Surgeons__c.ROSA_Course_Date__c                      | New               |                    |
| 49   | Custom field               | Robotics_Surgeons__c.ROSA_Credentialed_Date__c                | New               |                    |
| 50   | Custom field               | Robotics_Surgeons__c.ROSA_Credentialing_Status__c             | New               |                    |
| 51   | Custom field               | Robotics_Surgeons__c.ROSA_Credentialing_Summary__c            | New               |                    |
| 52   | Custom field               | Robotics_Surgeons__c.ROSA_Current_Summary__c                  | New               |                    |
| 53   | Custom field               | Robotics_Surgeons__c.ROSA_Deal_Surgeon_Key__c                 | New               |                    |
| 54   | Custom field               | Robotics_Surgeons__c.ROSA_Deal__c                             | New               |                    |
| 55   | Custom field               | Robotics_Surgeons__c.ROSA_First_Case_Date__c                  | New               |                    |
| 56   | Custom field               | Robotics_Surgeons__c.ROSA_Gaps__c                             | New               |                    |
| 57   | Custom field               | Robotics_Surgeons__c.ROSA_Growth_Disposables__c               | New               |                    |
| 58   | Custom field               | Robotics_Surgeons__c.ROSA_Growth_Implants__c                  | New               |                    |
| 59   | Custom field               | Robotics_Surgeons__c.ROSA_Growth_Value__c                     | New               |                    |
| 60   | Custom field               | Robotics_Surgeons__c.ROSA_PKA_Current_Cases__c                | New               |                    |
| 61   | Custom field               | Robotics_Surgeons__c.ROSA_PKA_Current_Supplier__c             | New               |                    |
| 62   | Custom field               | Robotics_Surgeons__c.ROSA_PKA_ROSA_Cases__c                   | New               |                    |
| 63   | Custom field               | Robotics_Surgeons__c.ROSA_PKA_ROSA_Supplier__c                | New               |                    |
| 64   | Custom field               | Robotics_Surgeons__c.ROSA_Pathway__c                          | New               |                    |
| 65   | Custom field               | Robotics_Surgeons__c.ROSA_Question_Set_Used__c                | New               |                    |
| 66   | Custom field               | Robotics_Surgeons__c.ROSA_Questions_To_Answer__c              | New               |                    |
| 67   | Custom field               | Robotics_Surgeons__c.ROSA_Ready__c                            | New               |                    |
| 68   | Custom field               | Robotics_Surgeons__c.ROSA_Surgeon_Link__c                     | New               |                    |
| 69   | Custom field               | Robotics_Surgeons__c.ROSA_THA_Current_Cases__c                | New               |                    |
| 70   | Custom field               | Robotics_Surgeons__c.ROSA_THA_Current_Supplier__c             | New               |                    |
| 71   | Custom field               | Robotics_Surgeons__c.ROSA_THA_ROSA_Cases__c                   | New               |                    |
| 72   | Custom field               | Robotics_Surgeons__c.ROSA_THA_ROSA_Supplier__c                | New               |                    |
| 73   | Custom field               | Robotics_Surgeons__c.ROSA_TKA_Current_Cases__c                | New               |                    |
| 74   | Custom field               | Robotics_Surgeons__c.ROSA_TKA_Current_Supplier__c             | New               |                    |
| 75   | Custom field               | Robotics_Surgeons__c.ROSA_TKA_ROSA_Cases__c                   | New               |                    |
| 76   | Custom field               | Robotics_Surgeons__c.ROSA_TKA_ROSA_Supplier__c                | New               |                    |
| 77   | Custom field               | Robotics_Surgeons__c.ROSA_TSA_RSA_Current_Cases__c            | New               |                    |
| 78   | Custom field               | Robotics_Surgeons__c.ROSA_TSA_RSA_Current_Supplier__c         | New               |                    |
| 79   | Custom field               | Robotics_Surgeons__c.ROSA_TSA_RSA_ROSA_Cases__c               | New               |                    |
| 80   | Custom field               | Robotics_Surgeons__c.ROSA_TSA_RSA_ROSA_Supplier__c            | New               |                    |
| 81   | Custom field               | Robotics_Surgeons__c.ROSA_Wave__c                             | New               |                    |
| 82   | Custom field               | Robotics_Surgeons__c.ROSA_With_ROSA_Summary__c                | New               |                    |
| 83   | Custom field               | Robotics_Surgeons__c.Robotics_Surgeon__c                      | Changed           |                    |
| 84   | Custom field               | Robotics__c.ROSA_Highest_Step__c                              | New               |                    |
| 85   | Custom field               | Robotics__c.ROSA_Step_1_Date__c                               | New               |                    |
| 86   | Custom field               | Robotics__c.ROSA_Step_1_Done_By__c                            | New               |                    |
| 87   | Custom field               | Robotics__c.ROSA_Step_1_Done__c                               | New               |                    |
| 88   | Custom field               | Robotics__c.ROSA_Step_2_Date__c                               | New               |                    |
| 89   | Custom field               | Robotics__c.ROSA_Step_2_Done_By__c                            | New               |                    |
| 90   | Custom field               | Robotics__c.ROSA_Step_2_Done__c                               | New               |                    |
| 91   | Custom field               | Robotics__c.ROSA_Step_3_Date__c                               | New               |                    |
| 92   | Custom field               | Robotics__c.ROSA_Step_3_Done_By__c                            | New               |                    |
| 93   | Custom field               | Robotics__c.ROSA_Step_3_Done__c                               | New               |                    |
| 94   | Custom field               | Robotics__c.ROSA_Step_4_Date__c                               | New               |                    |
| 95   | Custom field               | Robotics__c.ROSA_Step_4_Done_By__c                            | New               |                    |
| 96   | Custom field               | Robotics__c.ROSA_Step_4_Done__c                               | New               |                    |
| 97   | Custom field               | Robotics__c.ROSA_Step_5_Date__c                               | New               |                    |
| 98   | Custom field               | Robotics__c.ROSA_Step_5_Done_By__c                            | New               |                    |
| 99   | Custom field               | Robotics__c.ROSA_Step_5_Done__c                               | New               |                    |
| 100  | Custom field               | Robotics__c.ROSA_Step_6_Date__c                               | New               |                    |
| 101  | Custom field               | Robotics__c.ROSA_Step_6_Done_By__c                            | New               |                    |
| 102  | Custom field               | Robotics__c.ROSA_Step_6_Done__c                               | New               |                    |
| 103  | Custom field               | Robotics__c.ROSA_Step_7a_Date__c                              | New               |                    |
| 104  | Custom field               | Robotics__c.ROSA_Step_7a_Done_By__c                           | New               |                    |
| 105  | Custom field               | Robotics__c.ROSA_Step_7a_Done__c                              | New               |                    |
| 106  | Custom field               | Robotics__c.ROSA_Step_7b_Date__c                              | New               |                    |
| 107  | Custom field               | Robotics__c.ROSA_Step_7b_Done_By__c                           | New               |                    |
| 108  | Custom field               | Robotics__c.ROSA_Step_7b_Done__c                              | New               |                    |
| 109  | Custom field               | Robotics__c.ROSA_Step_7c_Date__c                              | New               |                    |
| 110  | Custom field               | Robotics__c.ROSA_Step_7c_Done_By__c                           | New               |                    |
| 111  | Custom field               | Robotics__c.ROSA_Step_7c_Done__c                              | New               |                    |
| 112  | Custom field               | Robotics__c.ROSA_Step_7d_Date__c                              | New               |                    |
| 113  | Custom field               | Robotics__c.ROSA_Step_7d_Done_By__c                           | New               |                    |
| 114  | Custom field               | Robotics__c.ROSA_Step_7d_Done__c                              | New               |                    |
| 115  | Custom field               | SalesRisks__c.ROSA_Additional_Opportunities__c                | New               |                    |
| 116  | Custom field               | SalesRisks__c.ROSA_Additional_Support_Who__c                  | New               |                    |
| 117  | Custom field               | SalesRisks__c.ROSA_Additional_Support__c                      | New               |                    |
| 118  | Custom field               | SalesRisks__c.ROSA_Additional_Unit_Required__c                | New               |                    |
| 119  | Custom field               | SalesRisks__c.ROSA_Champions__c                               | New               |                    |
| 120  | Custom field               | SalesRisks__c.ROSA_Checklist__c                               | New               |                    |
| 121  | Custom field               | SalesRisks__c.ROSA_Competitor_Robotics__c                     | New               |                    |
| 122  | Custom field               | SalesRisks__c.ROSA_Critical_To_Approval__c                    | New               |                    |
| 123  | Custom field               | SalesRisks__c.ROSA_Current_ZB_PKA__c                          | New               |                    |
| 124  | Custom field               | SalesRisks__c.ROSA_Current_ZB_Shoulder__c                     | New               |                    |
| 125  | Custom field               | SalesRisks__c.ROSA_Current_ZB_THA__c                          | New               |                    |
| 126  | Custom field               | SalesRisks__c.ROSA_Current_ZB_TKA__c                          | New               |                    |
| 127  | Custom field               | SalesRisks__c.ROSA_Existing_Unit__c                           | New               |                    |
| 128  | Custom field               | SalesRisks__c.ROSA_Exposure_Plan__c                           | New               |                    |
| 129  | Custom field               | SalesRisks__c.ROSA_Fellows__c                                 | New               |                    |
| 130  | Custom field               | SalesRisks__c.ROSA_Growth_Calculated__c                       | New               |                    |
| 131  | Custom field               | SalesRisks__c.ROSA_Growth_Cases__c                            | New               |                    |
| 132  | Custom field               | SalesRisks__c.ROSA_Growth_PKA_Cases__c                        | New               |                    |
| 133  | Custom field               | SalesRisks__c.ROSA_Growth_Shoulder_Cases__c                   | New               |                    |
| 134  | Custom field               | SalesRisks__c.ROSA_Growth_THA_Cases__c                        | New               |                    |
| 135  | Custom field               | SalesRisks__c.ROSA_Growth_TKA_Cases__c                        | New               |                    |
| 136  | Custom field               | SalesRisks__c.ROSA_Has_Surgeons__c                            | New               |                    |
| 137  | Custom field               | SalesRisks__c.ROSA_Identified_Risks__c                        | New               |                    |
| 138  | Custom field               | SalesRisks__c.ROSA_Overlord__c                                | Changed           |                    |
| 139  | Custom field               | SalesRisks__c.ROSA_Prices_Used__c                             | New               |                    |
| 140  | Custom field               | SalesRisks__c.ROSA_Primary_Case_Cover__c                      | New               |                    |
| 141  | Custom field               | SalesRisks__c.ROSA_Rep_Case_Cover_Suitable__c                 | New               |                    |
| 142  | Custom field               | SalesRisks__c.ROSA_Rep_Trained__c                             | New               |                    |
| 143  | Custom field               | SalesRisks__c.ROSA_Sales_Rep__c                               | New               |                    |
| 144  | Custom field               | SalesRisks__c.ROSA_Secondary_Case_Cover__c                    | New               |                    |
| 145  | Custom field               | SalesRisks__c.ROSA_Share_JJ__c                                | New               |                    |
| 146  | Custom field               | SalesRisks__c.ROSA_Share_Other__c                             | New               |                    |
| 147  | Custom field               | SalesRisks__c.ROSA_Share_SN__c                                | New               |                    |
| 148  | Custom field               | SalesRisks__c.ROSA_Share_Stryker__c                           | New               |                    |
| 149  | Custom field               | SalesRisks__c.ROSA_Share_ZB__c                                | New               |                    |
| 150  | Custom field               | SalesRisks__c.ROSA_Surgeon_Count__c                           | New               |                    |
| 151  | Custom field               | SalesRisks__c.ROSA_Surgeons_Credentialed__c                   | New               |                    |
| 152  | Custom field               | SalesRisks__c.ROSA_Trainees__c                                | New               |                    |
| 153  | Custom field               | SalesRisks__c.ROSA_Unit_Utilisation__c                        | New               |                    |
| 154  | Custom field               | SalesRisks__c.ROSA_With_ROSA_ZB_PKA__c                        | New               |                    |
| 155  | Custom field               | SalesRisks__c.ROSA_With_ROSA_ZB_Shoulder__c                   | New               |                    |
| 156  | Custom field               | SalesRisks__c.ROSA_With_ROSA_ZB_THA__c                        | New               |                    |
| 157  | Custom field               | SalesRisks__c.ROSA_With_ROSA_ZB_TKA__c                        | New               |                    |
| 158  | Custom field               | SalesRisks__c.ROSA_ZB_PKA_Users__c                            | New               |                    |
| 159  | Custom field               | SalesRisks__c.ROSA_ZB_Shoulder_Users__c                       | New               |                    |
| 160  | Custom field               | SalesRisks__c.ROSA_ZB_THA_Users__c                            | New               |                    |
| 161  | Custom field               | SalesRisks__c.ROSA_ZB_TKA_Users__c                            | New               |                    |
| 162  | Custom object              | ROSA_Credentialing_Answer__c                                  | New               |                    |
| 163  | Custom object              | ROSA_Price__c                                                 | New               |                    |
| 164  | Custom object              | ROSA_Question_Set__c                                          | New               |                    |
| 165  | Custom object              | ROSA_Question__c                                              | New               |                    |
| 166  | Custom object              | Robotics_Surgeons__c                                          | Changed           |                    |
| 167  | Custom object              | Robotics__c                                                   | Changed           |                    |
| 168  | Custom permission          | ROSA_Edit_Deals                                               |                   |                    |
| 169  | Custom tab                 | ROSA_Price__c                                                 |                   |                    |
| 170  | Custom tab                 | ROSA_Question_Set__c                                          |                   |                    |
| 171  | Lightning page             | ROSA_Checklist_Record_Page                                    |                   |                    |
| 172  | Lightning page             | ROSA_Credentialing_Answer_Record_Page                         |                   |                    |
| 173  | Lightning page             | ROSA_Deal_Record_Page                                         |                   |                    |
| 174  | Lightning page             | ROSA_Surgeon_Record_Page                                      |                   |                    |
| 175  | Global Picklist Value Set  | ROSA_Supplier                                                 |                   |                    |
| 176  | Page layout                | ROSA_Credentialing_Answer__c-ROSA Credentialing Answer Layout |                   |                    |
| 177  | Page layout                | ROSA_Price__c-ROSA Price Layout                               |                   |                    |
| 178  | Page layout                | Robotics_Surgeons__c-Robotics Surgeons Layout                 |                   |                    |
| 179  | Lightning web component    | pipelineApp                                                   |                   |                    |
| 180  | Lightning web component    | pipelineCampaignMembers                                       |                   |                    |
| 181  | Lightning web component    | pipelineCampaigns                                             |                   |                    |
| 182  | Lightning web component    | pipelineDeal                                                  |                   |                    |
| 183  | Lightning web component    | rosaDeal                                                      |                   |                    |
| 184  | Lightning web component    | rosaDealAction                                                |                   |                    |
| 185  | Lightning web component    | rosaDealFields                                                |                   |                    |
| 186  | Lightning web component    | rosaDealModal                                                 |                   |                    |
| 187  | Lightning web component    | rosaDealPicker                                                |                   |                    |
| 188  | Lightning web component    | rosaDealStyles                                                |                   |                    |
| 189  | List view                  | ROSA_Price__c.ROSA_Active_Prices                              |                   |                    |
| 190  | List view                  | Robotics__c.All                                               |                   |                    |
| 191  | Permission set             | Pipeline_User                                                 |                   |                    |
| 192  | Permission set             | ROSA_Credentialing_Admin                                      |                   |                    |
| 193  | Permission set             | ROSA_Deal_Management                                          |                   |                    |
| 194  | Quick action               | Robotics__c.ROSA_Deal_Steps                                   |                   |                    |
| 195  | Quick action               | Robotics__c.ROSA_Implementation_Steps                         |                   |                    |
| 196  | Quick action               | SalesRisks__c.ROSA_Add_Surgeon                                |                   |                    |
| 197  | Quick action               | SalesRisks__c.ROSA_Open_Deal                                  |                   |                    |
| 198  | Record type                | Robotics__c.ROSA_Deal_Checklist                               |                   |                    |
| 199  | Sharing reason             | SalesRisks__c.ROSA_Deal_Lead__c                               |                   |                    |
| 200  | Sharing reason             | SalesRisks__c.ROSA_Sales_Rep__c                               |                   |                    |
| 201  | Validation rule            | ROSA_Credentialing_Answer__c.ROSA_Answer_Matches_Type         |                   |                    |
| 202  | Validation rule            | Robotics_Surgeons__c.ROSA_Cases_Need_Supplier                 |                   |                    |
| 203  | Validation rule            | Robotics_Surgeons__c.ROSA_Deal_Must_Be_ROSA                   |                   |                    |
| 204  | Validation rule            | Robotics__c.ROSA_7_Needs_Closed_Won                           |                   |                    |
| 205  | Validation rule            | Robotics__c.ROSA_Step3_Needs_Surgeon                          |                   |                    |
| 206  | Validation rule            | Robotics__c.ROSA_Step6_Needs_Date                             |                   |                    |
| 207  | Validation rule            | Robotics__c.ROSA_Step7a_Needs_Install_Date                    |                   |                    |
| 208  | Validation rule            | Robotics__c.ROSA_Steps_In_Order                               |                   |                    |
| 209  | Validation rule            | SalesRisks__c.ROSA_Primary_Case_Cover_Active_User             |                   |                    |
| 210  | Validation rule            | SalesRisks__c.ROSA_Sales_Rep_Active_User                      |                   |                    |
| 211  | Validation rule            | SalesRisks__c.ROSA_Secondary_Case_Cover_Active_User           |                   |                    |
