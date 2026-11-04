/**
 * Pipeline: the My Case Bookings panel in the deal flyout. How a surgeon is tracking: surgeries per month for the last 12
 * whole months (plus this month so far), by type of surgery (Hip, Knee, Shoulder, CMFT), split into primary and revision
 * (CMFT is never split), and by hospital so the screen can draw one graph per hospital as well as the total. Graphs only:
 * the comparison with the surgeon's usages and the changes it used to offer were taken out on 2026-11-04 (Robert) and are
 * kept in git (tag usage-reconciliation-v0.54) for a future Usage Management component.
 *
 * Who calls it: the pipelineBookings component (getBookings) and the deal flyout's bottom-bar badges (getBadges), and
 * PipelineBookingsControllerTest.
 * What it touches: reads SalesRisks__c (to find the surgeon), Account, Case__c (surgeries), myCase_Usage_Item__c (to count only
 * surgeries that have usage items, as Pipeline's surgeries count always did) and Usage__c (only the date of the newest change,
 * for the badge). Changes nothing. All in the signed-in person's own access (user mode).
 *
 * Rules (Robert, 2026-11-02 and 2026-11-03): a surgery counts when it has already happened and has at least one usage item;
 * demo and non-billable surgeries (Procedure Z02) are left out; Type A01 is a revision, anything else primary; the anatomy
 * comes from Case__c.Surgery_Type__c (201 Hip, 202 Knee, 205 Shoulder / Elbow, 209 CMFT).
 */
public with sharing class PipelineBookingsController {
  /** One hospital for a type of surgery: its own surgeries by month. A row with no id holds surgeries with no hospital recorded. */
  public class HospitalRow {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    /** Surgeries booked there in the last 12 whole months. */
    @AuraEnabled
    public Integer booked = 0;
    @AuraEnabled
    public List<Integer> primary = new List<Integer>();
    @AuraEnabled
    public List<Integer> revision = new List<Integer>();
    /** This month so far: primary, revision. Not in the 12-month total. */
    @AuraEnabled
    public List<Integer> partial = new List<Integer>{ 0, 0 };
  }

  public class BookingType {
    /** Hip, Knee, Shoulder or CMFT. */
    @AuraEnabled
    public String name;
    /** False for CMFT: there is no primary and revision split. */
    @AuraEnabled
    public Boolean split = true;
    @AuraEnabled
    public List<Integer> primary = new List<Integer>();
    @AuraEnabled
    public List<Integer> revision = new List<Integer>();
    /** This month so far: primary, revision. Not in the 12-month total. */
    @AuraEnabled
    public List<Integer> partial = new List<Integer>{ 0, 0 };
    @AuraEnabled
    public Integer booked = 0;
    /** Every hospital with bookings for this type, busiest first. */
    @AuraEnabled
    public List<HospitalRow> rows = new List<HospitalRow>();
  }

  public class Bookings {
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public String surgeonName;
    /** The first day of the first of the 12 whole months, and today. */
    @AuraEnabled
    public Date windowStart;
    @AuraEnabled
    public Date today;
    @AuraEnabled
    public List<BookingType> types = new List<BookingType>();
  }

  /** What the bottom-bar buttons show: the surgeon's usages (how long since the newest change) and the 12-month bookings. */
  public class Badges {
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public Boolean hasUsages = false;
    @AuraEnabled
    public Datetime usagesNewest;
    @AuraEnabled
    public Integer booked = 0;
  }

  /** Case__c.Surgery_Type__c to the name shown. */
  private static final Map<String, String> ANATOMY = new Map<String, String>{
    '201' => 'Hip',
    '202' => 'Knee',
    '205' => 'Shoulder',
    '209' => 'CMFT'
  };
  private static final List<String> ORDER = new List<String>{
    '201',
    '202',
    '205',
    '209'
  };
  private static final String NO_HOSPITAL = 'No hospital recorded';

  private static Id surgeonOf(Id dealId) {
    List<SalesRisks__c> d = [
      SELECT Account__c
      FROM SalesRisks__c
      WHERE Id = :dealId
      WITH USER_MODE
      LIMIT 1
    ];
    return d.isEmpty() ? null : d[0].Account__c;
  }

  /** One counted surgery. */
  private class Counted {
    String anatomy;
    Boolean revision;
    Integer month; // 0 to 11 for the 12 whole months, -1 for this month so far
    Id hospitalId;
    String hospitalName;
  }

  /** The surgeon's counted surgeries from the start of the 12 whole months up to today. */
  private static List<Counted> countedSurgeries(
    Id surgeon,
    Date start,
    Date today
  ) {
    List<Case__c> cases = [
      SELECT
        Id,
        Surgery_Date__c,
        Surgery_Type__c,
        Procedure__c,
        Healthcare_Facility__c,
        Healthcare_Facility__r.Name
      FROM Case__c
      WHERE
        Physician__c = :surgeon
        AND Surgery_Date__c >= :start
        AND Surgery_Date__c < :today
        AND Surgery_Type__c IN :ORDER
      WITH USER_MODE
      LIMIT 20000
    ];
    List<Counted> out = new List<Counted>();
    if (cases.isEmpty()) {
      return out;
    }
    Set<Id> withItems = new Set<Id>();
    for (AggregateResult ar : [
      SELECT Usage_Sheet_ID__r.Case__c c
      FROM myCase_Usage_Item__c
      WHERE
        Usage_Sheet_ID__r.Case__r.Physician__c = :surgeon
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :start
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :today
      WITH USER_MODE
      GROUP BY Usage_Sheet_ID__r.Case__c
    ]) {
      withItems.add((Id) ar.get('c'));
    }
    Date thisMonth = today.toStartOfMonth();
    for (Case__c c : cases) {
      if (!withItems.contains(c.Id) || c.Procedure__c == 'Z02') {
        continue;
      }
      Counted k = new Counted();
      k.anatomy = c.Surgery_Type__c;
      k.revision = c.Procedure__c == 'A01' && c.Surgery_Type__c != '209';
      k.month = c.Surgery_Date__c >= thisMonth
        ? -1
        : (c.Surgery_Date__c.year() - start.year()) * 12 +
          c.Surgery_Date__c.month() -
          start.month();
      k.hospitalId = c.Healthcare_Facility__c;
      k.hospitalName = c.Healthcare_Facility__r?.Name;
      out.add(k);
    }
    return out;
  }

  private static List<Integer> zeros() {
    List<Integer> z = new List<Integer>();
    for (Integer i = 0; i < 12; i++) {
      z.add(0);
    }
    return z;
  }

  @AuraEnabled
  public static Bookings getBookings(Id dealId) {
    Bookings out = new Bookings();
    out.surgeonId = surgeonOf(dealId);
    if (out.surgeonId == null) {
      return out;
    }
    Id surgeon = out.surgeonId;
    out.surgeonName = [
      SELECT Name
      FROM Account
      WHERE Id = :surgeon
      WITH USER_MODE
    ]
    .Name;
    Date today = Date.today();
    out.today = today;
    out.windowStart = today.toStartOfMonth().addMonths(-12);

    Map<String, BookingType> byAnatomy = new Map<String, BookingType>();
    Map<String, Map<String, HospitalRow>> hospitals = new Map<String, Map<String, HospitalRow>>();
    for (Counted k : countedSurgeries(surgeon, out.windowStart, today)) {
      BookingType t = byAnatomy.get(k.anatomy);
      if (t == null) {
        t = new BookingType();
        t.name = ANATOMY.get(k.anatomy);
        t.split = k.anatomy != '209';
        t.primary = zeros();
        t.revision = zeros();
        byAnatomy.put(k.anatomy, t);
        hospitals.put(k.anatomy, new Map<String, HospitalRow>());
      }
      String key = String.valueOf(k.hospitalId);
      HospitalRow h = hospitals.get(k.anatomy).get(key);
      if (h == null) {
        h = new HospitalRow();
        h.id = k.hospitalId;
        h.name = String.isBlank(k.hospitalName) ? NO_HOSPITAL : k.hospitalName;
        h.primary = zeros();
        h.revision = zeros();
        hospitals.get(k.anatomy).put(key, h);
      }
      Integer which = k.revision ? 1 : 0;
      if (k.month < 0) {
        t.partial[which] = t.partial[which] + 1;
        h.partial[which] = h.partial[which] + 1;
        continue;
      }
      if (k.revision) {
        t.revision[k.month] = t.revision[k.month] + 1;
        h.revision[k.month] = h.revision[k.month] + 1;
      } else {
        t.primary[k.month] = t.primary[k.month] + 1;
        h.primary[k.month] = h.primary[k.month] + 1;
      }
      t.booked++;
      h.booked++;
    }
    for (String a : ORDER) {
      BookingType t = byAnatomy.get(a);
      if (t == null) {
        continue;
      }
      List<HospitalRow> byCount = hospitals.get(a).values();
      byCount.sort(new HospitalOrder());
      t.rows = byCount;
      out.types.add(t);
    }
    return out;
  }

  /** Busiest hospital first, then by name. */
  private class HospitalOrder implements System.Comparator<HospitalRow> {
    public Integer compare(HospitalRow a, HospitalRow b) {
      if (a.booked != b.booked) {
        return b.booked - a.booked;
      }
      return (a.name == null ? '' : a.name)
        .compareTo(b.name == null ? '' : b.name);
    }
  }

  @AuraEnabled
  public static Badges getBadges(Id dealId) {
    Badges out = new Badges();
    out.surgeonId = surgeonOf(dealId);
    if (out.surgeonId == null) {
      return out;
    }
    Date today = Date.today();
    Date start = today.toStartOfMonth().addMonths(-12);
    for (Usage__c u : [
      SELECT LastModifiedDate
      FROM Usage__c
      WHERE HCP2__c = :out.surgeonId
      WITH USER_MODE
      ORDER BY LastModifiedDate DESC
      LIMIT 1
    ]) {
      out.hasUsages = true;
      out.usagesNewest = u.LastModifiedDate;
    }
    for (Counted k : countedSurgeries(out.surgeonId, start, today)) {
      if (k.month >= 0) {
        out.booked++;
      }
    }
    return out;
  }
}
