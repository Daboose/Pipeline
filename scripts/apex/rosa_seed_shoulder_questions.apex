// ROSA Shoulder POC (UAT only): the ROSA Shoulder Credentialing question set and its four questions.
// Safe to run twice: it does nothing if the set already exists. Leaves every other question category alone.
// Run: sf apex run -o UAT -f scripts/apex/rosa_seed_shoulder_questions.apex
String setName = 'ROSA Shoulder Credentialing';
List<Event_Category__c> existing = [
  SELECT Id
  FROM Event_Category__c
  WHERE Name = :setName
  LIMIT 1
];
if (!existing.isEmpty()) {
  System.debug('Already there: ' + existing[0].Id);
  return;
}
Event_Category__c cat = new Event_Category__c(
  Name = setName,
  Active__c = true,
  ROSA_Usage__c = 'ROSA Credentialing',
  ROSA_Pathway__c = 'Shoulder'
);
insert cat;
List<String> texts = new List<String>{
  'Confirm the surgeon does 30+ Zimmer Biomet shoulder cases a year.', // 30 is a placeholder until marketing sets the number
  'Confirm the surgeon has used Signature 2.0 planning.',
  'Confirm the surgeon has had the ROSA Shoulder demo and slide deck walk-through.',
  'Confirm the surgeon has access to a ROSA Shoulder unit.'
};
List<Question__c> qs = new List<Question__c>();
for (Integer i = 0; i < texts.size(); i++) {
  qs.add(
    new Question__c(
      Event_Category__c = cat.Id,
      Question_Text_2__c = texts[i],
      Answer_Type__c = 'Yes/No',
      Answer_Required__c = true,
      Active__c = true,
      Display_Order__c = (i + 1) * 10
    )
  );
}
insert qs;
System.debug('Created ' + cat.Id + ' with ' + qs.size() + ' questions');
