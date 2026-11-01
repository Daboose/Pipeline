/**
 * Pipeline: finds records for the deal flyout's pickers (the deal's Primary HCP, Healthcare facility and Link To ROSA Deal).
 *
 * Who calls it: the pipelineLookup component, and PipelineLookupControllerTest.
 * What it touches: searches Account and SalesRisks__c in the signed-in person's own access (user mode). It changes nothing.
 *
 * What each picker may offer follows the field's own lookup filter on SalesRisks__c (read from PROD, 2026-11-01), because the
 * standard lookup search is not available to a custom screen: Primary HCP (Account__c) only person accounts; Healthcare
 * facility (Healthcare_Facility__c) only accounts that are not person accounts; Link To ROSA Deal (Link_To_ROSA_Deal__c)
 * only deals whose record type is ROSA. If those filters ever change, change them here too. Saving still goes through
 * Salesforce, which applies the real lookup filter, so a wrong offer here is refused there, not saved.
 */
public with sharing class PipelineLookupController {
  public class Hit {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String sub;
  }

  /** The pickers this class serves. Anything else is refused. */
  private static final Set<String> FIELDS = new Set<String>{
    'Account__c',
    'Healthcare_Facility__c',
    'Link_To_ROSA_Deal__c'
  };

  @AuraEnabled
  public static List<Hit> search(String fieldName, String term) {
    if (fieldName == null || !FIELDS.contains(fieldName)) {
      throw new AuraHandledException('That field cannot be searched.');
    }
    String t = term == null ? '' : term.trim();
    List<Hit> out = new List<Hit>();
    if (t.length() < 2) {
      return out;
    }
    String q = String.escapeSingleQuotes(t)
      .replaceAll('[?&|!{}\\[\\]()^~*:\\\\"\'+\\-]', ' ')
      .trim();
    if (q.length() < 2) {
      return out;
    }
    if (fieldName == 'Link_To_ROSA_Deal__c') {
      for (SalesRisks__c d : [
        SELECT Id, Name, Healthcare_FacilityName__c, Stage__c
        FROM SalesRisks__c
        WHERE
          pbiRecordType__c = 'ROSA'
          AND (Healthcare_FacilityName__c LIKE :('%' + q + '%')
          OR Name LIKE :('%' + q + '%'))
        WITH USER_MODE
        ORDER BY CreatedDate DESC
        LIMIT 8
      ]) {
        Hit h = new Hit();
        h.id = d.Id;
        h.name = String.isBlank(d.Healthcare_FacilityName__c)
          ? d.Name
          : d.Healthcare_FacilityName__c;
        h.sub = d.Stage__c;
        out.add(h);
      }
      return out;
    }
    Boolean person = fieldName == 'Account__c';
    // q holds only letters, digits and spaces (everything else was removed above), so it is safe inside the search text
    List<List<SObject>> found = Search.query(
      'FIND \'' +
        q +
        '*\' IN NAME FIELDS RETURNING Account(Id, Name, IsPersonAccount, BillingCity, BillingState WHERE IsPersonAccount = ' +
        (person ? 'true' : 'false') +
        ' ORDER BY Name LIMIT 8)',
      AccessLevel.USER_MODE
    );
    for (SObject o : found[0]) {
      Account a = (Account) o;
      Hit h = new Hit();
      h.id = a.Id;
      h.name = a.Name;
      h.sub = String.isBlank(a.BillingCity) ? a.BillingState : a.BillingCity;
      out.add(h);
    }
    return out;
  }
}
