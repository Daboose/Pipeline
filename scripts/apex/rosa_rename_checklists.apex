// ROSA Shoulder POC (UAT): gives every ROSA Deal Checklist the name "ROSA Checklist for ROSA deal <deal number>"
// instead of its record Id. Safe to run again.
List<Robotics__c> rows = [
  SELECT Id, Name, Sales_Risks__r.Name
  FROM Robotics__c
  WHERE RecordType.DeveloperName = 'ROSA_Deal_Checklist'
];
List<Robotics__c> changes = new List<Robotics__c>();
for (Robotics__c c : rows) {
  String n = ROSAAutomation.checklistName(
    c.Sales_Risks__r == null ? null : c.Sales_Risks__r.Name
  );
  if (c.Name != n)
    changes.add(new Robotics__c(Id = c.Id, Name = n));
}
update changes;
System.debug('renamed ' + changes.size() + ' of ' + rows.size());
