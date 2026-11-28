// ROSA Shoulder POC: the ROSA Shoulder Credentialing question set and its four questions, in ROSA's own
// ROSA_Question_Set__c / ROSA_Question__c (Robert, 2026-11-28: nothing from APAC Events).
// Safe to run twice: it does nothing if the set already exists.
// Run: sf apex run -o UAT -f scripts/apex/rosa_seed_shoulder_questions.apex
String setName = 'ROSA Shoulder Credentialing';
List<ROSA_Question_Set__c> existing = [
  SELECT Id
  FROM ROSA_Question_Set__c
  WHERE Name = :setName
  LIMIT 1
];
if (!existing.isEmpty()) {
  System.debug('Already there: ' + existing[0].Id);
  return;
}
ROSA_Question_Set__c qset = new ROSA_Question_Set__c(
  Name = setName,
  ROSA_Active__c = true,
  ROSA_Pathway__c = 'Shoulder'
);
insert qset;
List<String> texts = new List<String>{
  'Confirm the surgeon does 30+ Zimmer Biomet shoulder cases a year.', // 30 is a placeholder until marketing sets the number
  'Confirm the surgeon has used Signature 2.0 planning.',
  'Confirm the surgeon has had the ROSA Shoulder demo and slide deck walk-through.',
  'Confirm the surgeon has access to a ROSA Shoulder unit.'
};
List<ROSA_Question__c> qs = new List<ROSA_Question__c>();
for (Integer i = 0; i < texts.size(); i++) {
  qs.add(
    new ROSA_Question__c(
      ROSA_Question_Set__c = qset.Id,
      ROSA_Question_Text__c = texts[i],
      ROSA_Answer_Type__c = 'Yes/No',
      ROSA_Required__c = true,
      ROSA_Active__c = true,
      ROSA_Display_Order__c = (i + 1) * 10
    )
  );
}
insert qs;
System.debug('Created ' + qset.Id + ' with ' + qs.size() + ' questions');
