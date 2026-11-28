// ROSA (2026-11-28, Robert: no dependency on APAC Events): copies the ROSA question sets kept in Event_Category__c / Question__c
// into ROSA's own ROSA_Question_Set__c / ROSA_Question__c, then points each ROSA Deal Surgeon and each answer at the copies.
// UAT and DEV only (PROD never had the old objects). Safe to run twice: a set already copied (same name) is reused.
// Run before the old fields ROSA_Question_Set__c and ROSA_Question__c are deleted.
Map<Id, ROSA_Question_Set__c> setFor = new Map<Id, ROSA_Question_Set__c>();
Map<String, ROSA_Question_Set__c> have = new Map<String, ROSA_Question_Set__c>();
for (ROSA_Question_Set__c s : [SELECT Id, Name FROM ROSA_Question_Set__c])
  have.put(s.Name, s);
List<SObject> cats = Database.query(
  'SELECT Id, Name, Active__c, ROSA_Pathway__c FROM Event_Category__c WHERE ROSA_Usage__c = \'ROSA Credentialing\''
);
List<ROSA_Question_Set__c> newSets = new List<ROSA_Question_Set__c>();
for (SObject c : cats) {
  String n = (String) c.get('Name');
  ROSA_Question_Set__c s = have.containsKey(n)
    ? have.get(n)
    : new ROSA_Question_Set__c(
        Name = n,
        ROSA_Active__c = (Boolean) c.get('Active__c'),
        ROSA_Pathway__c = (String) c.get('ROSA_Pathway__c')
      );
  if (s.Id == null)
    newSets.add(s);
  setFor.put(c.Id, s);
}
insert newSets;
Map<Id, ROSA_Question__c> qFor = new Map<Id, ROSA_Question__c>();
Set<Id> catIds = setFor.keySet();
List<ROSA_Question__c> newQs = new List<ROSA_Question__c>();
Map<String, ROSA_Question__c> haveQ = new Map<String, ROSA_Question__c>();
for (ROSA_Question__c q : [
  SELECT Id, ROSA_Question_Set__c, ROSA_Question_Text__c
  FROM ROSA_Question__c
])
  haveQ.put(q.ROSA_Question_Set__c + '|' + q.ROSA_Question_Text__c, q);
for (
  SObject q : Database.query(
    'SELECT Id, Event_Category__c, Question_Text_2__c, Answer_Type__c, Answer_Required__c, Active__c, Display_Order__c FROM Question__c WHERE Event_Category__c IN :catIds'
  )
) {
  ROSA_Question_Set__c s = setFor.get((Id) q.get('Event_Category__c'));
  String key = s.Id + '|' + (String) q.get('Question_Text_2__c');
  ROSA_Question__c nq = haveQ.containsKey(key)
    ? haveQ.get(key)
    : new ROSA_Question__c(
        ROSA_Question_Set__c = s.Id,
        ROSA_Question_Text__c = (String) q.get('Question_Text_2__c'),
        ROSA_Answer_Type__c = (String) q.get('Answer_Type__c'),
        ROSA_Required__c = (Boolean) q.get('Answer_Required__c'),
        ROSA_Active__c = (Boolean) q.get('Active__c'),
        ROSA_Display_Order__c = (Decimal) q.get('Display_Order__c')
      );
  if (nq.Id == null)
    newQs.add(nq);
  qFor.put(q.Id, nq);
}
insert newQs;
List<Robotics_Surgeons__c> sUp = new List<Robotics_Surgeons__c>();
for (
  SObject s : Database.query(
    'SELECT Id, ROSA_Question_Set__c FROM Robotics_Surgeons__c WHERE ROSA_Question_Set__c IN :catIds'
  )
) {
  sUp.add(
    new Robotics_Surgeons__c(
      Id = s.Id,
      ROSA_Question_Set_Used__c = setFor.get((Id) s.get('ROSA_Question_Set__c'))
        .Id
    )
  );
}
update sUp;
Set<Id> qIds = qFor.keySet();
List<ROSA_Credentialing_Answer__c> aUp = new List<ROSA_Credentialing_Answer__c>();
for (
  SObject a : Database.query(
    'SELECT Id, ROSA_Question__c FROM ROSA_Credentialing_Answer__c WHERE ROSA_Question__c IN :qIds'
  )
) {
  aUp.add(
    new ROSA_Credentialing_Answer__c(
      Id = a.Id,
      ROSA_Set_Question__c = qFor.get((Id) a.get('ROSA_Question__c')).Id
    )
  );
}
update aUp;
System.debug(
  'MOVED sets ' +
    newSets.size() +
    ' (of ' +
    cats.size() +
    '), questions ' +
    newQs.size() +
    ', surgeons ' +
    sUp.size() +
    ', answers ' +
    aUp.size()
);
