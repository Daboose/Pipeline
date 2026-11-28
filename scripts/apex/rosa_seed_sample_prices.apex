// ROSA Shoulder POC (UAT only): SAMPLE prices, not real ones, for Australia (AUD) and New Zealand (NZD): an average implant
// price and a ROSA disposables price per joint. Retires (unticks) any older active price for the same item, then adds
// the sample one. Safe to run again.
Map<String, Decimal> au = new Map<String, Decimal>{
  'TKA' => 5000,
  'PKA' => 4000,
  'THA' => 5000,
  'TSA/RSA' => 6000,
  'TKA Disposable' => 750,
  'PKA Disposable' => 750,
  'THA Disposable' => 750,
  'TSA/RSA Disposable' => 750
};
Map<String, Decimal> nz = new Map<String, Decimal>{
  'TKA' => 5500,
  'PKA' => 4400,
  'THA' => 5500,
  'TSA/RSA' => 6600,
  'TKA Disposable' => 825,
  'PKA Disposable' => 825,
  'THA Disposable' => 825,
  'TSA/RSA Disposable' => 825
};
Map<String, ROSA_Price__c> have = new Map<String, ROSA_Price__c>();
for (ROSA_Price__c p : [
  SELECT Id, ROSA_Key__c, ROSA_Price__c
  FROM ROSA_Price__c
  WHERE ROSA_Active__c = TRUE
])
  have.put(p.ROSA_Key__c, p);
List<ROSA_Price__c> retire = new List<ROSA_Price__c>();
List<ROSA_Price__c> add = new List<ROSA_Price__c>();
for (String c : new List<String>{ 'AU', 'NZ' }) {
  Map<String, Decimal> m = c == 'AU' ? au : nz;
  String cur = c == 'AU' ? 'AUD' : 'NZD';
  for (String item : m.keySet()) {
    ROSA_Price__c old = have.get(c + '|' + item + '|' + cur);
    if (old != null && old.ROSA_Price__c == m.get(item))
      continue;
    if (old != null)
      retire.add(new ROSA_Price__c(Id = old.Id, ROSA_Active__c = false));
    add.add(
      new ROSA_Price__c(
        ROSA_Country__c = c,
        ROSA_Joint__c = item,
        ROSA_Price__c = m.get(item),
        CurrencyIsoCode = cur,
        ROSA_Active__c = true
      )
    );
  }
}
// the old single "ROSA Disposable" sample rows are retired too
for (ROSA_Price__c p : [
  SELECT Id
  FROM ROSA_Price__c
  WHERE ROSA_Joint__c = 'ROSA Disposable' AND ROSA_Active__c = TRUE
])
  retire.add(new ROSA_Price__c(Id = p.Id, ROSA_Active__c = false));
update retire;
insert add;
System.debug(
  'retired ' + retire.size() + ', added ' + add.size() + ' SAMPLE prices'
);
