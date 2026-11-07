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

  /**
   * The Healthcare facility picker on the phone (Robert, 2026-11-07): the same search, but the hospitals the chosen surgeon is linked to
   * (Healthcare_Surgeon_Relationship__c, still current, hospital not inactive) come first, and only when their name matches what was typed
   * (a linked hospital that does not match is never offered). The rest follow from the ordinary search, without repeating a hospital,
   * up to the same 8. Any other picker, or no surgeon yet, is just the ordinary search. The relationship is read in system mode (it only
   * helps order the list); the hospitals themselves are read in the signed-in person's own access, so nobody is offered a hospital they
   * cannot see. The desktop picker does not use this.
   */
  @AuraEnabled
  public static List<Hit> searchNear(
    String fieldName,
    String term,
    Id surgeonId
  ) {
    List<Hit> rest = search(fieldName, term);
    if (fieldName != 'Healthcare_Facility__c' || surgeonId == null) {
      return rest;
    }
    List<String> words = new List<String>();
    for (
      String w : String.escapeSingleQuotes(term)
        .replaceAll('[?&|!{}\\[\\]()^~*:\\\\"\'+\\-%_]', ' ')
        .split(' ')
    ) {
      if (!String.isBlank(w) && words.size() < 4) {
        words.add(w.trim());
      }
    }
    if (words.isEmpty()) {
      return rest;
    }
    String cond = '';
    Map<String, Object> binds = new Map<String, Object>{
      'surgeonId' => surgeonId
    };
    for (Integer i = 0; i < words.size(); i++) {
      cond += ' AND Healthcare_Facility__r.Name LIKE :w' + i;
      binds.put('w' + i, '%' + words[i] + '%');
    }
    Set<Id> facilityIds = new Set<Id>();
    for (
      Healthcare_Surgeon_Relationship__c r : (List<Healthcare_Surgeon_Relationship__c>) Database.queryWithBinds(
        'SELECT Healthcare_Facility__c FROM Healthcare_Surgeon_Relationship__c WHERE Surgeon__c = :surgeonId AND Relationship_End_Date__c = NULL AND Healthcare_Facility_Inactive__c = FALSE' +
          cond +
          ' LIMIT 50',
        binds,
        AccessLevel.SYSTEM_MODE
      )
    ) {
      facilityIds.add(r.Healthcare_Facility__c);
    }
    if (facilityIds.isEmpty()) {
      return rest;
    }
    List<Hit> out = new List<Hit>();
    Set<Id> taken = new Set<Id>();
    for (Account a : [
      SELECT Id, Name, BillingCity, BillingState
      FROM Account
      WHERE Id IN :facilityIds AND IsPersonAccount = FALSE
      WITH USER_MODE
      ORDER BY Name
      LIMIT 8
    ]) {
      Hit h = new Hit();
      h.id = a.Id;
      h.name = a.Name;
      h.sub = String.isBlank(a.BillingCity) ? a.BillingState : a.BillingCity;
      out.add(h);
      taken.add(a.Id);
    }
    for (Hit h : rest) {
      if (out.size() < 8 && !taken.contains(h.id)) {
        out.add(h);
      }
    }
    return out;
  }
}
