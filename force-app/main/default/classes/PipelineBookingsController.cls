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
 * comes from Case__c.Surgery_Type__c (201 Hip, 202 Knee, 205 Shoulder / Elbow, 209 CMFT). The hospital's bookings on a ROSA deal
 * (getHospitalBookings, called by pipelineHospitalBookings) follow the same rules except that demos with usage items count, under
 * their own Demo chip (Robert, 2026-11-25).
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

  /** One type of surgery in the hospital's chart: its cases by month (12 columns, oldest first). */
  public class HospitalType {
    /** Hip, Knee, Shoulder or CMFT. */
    @AuraEnabled
    public String name;
    @AuraEnabled
    public List<Integer> months = new List<Integer>();
    @AuraEnabled
    public Integer booked = 0;
  }

  /**
   * One line of the hospital's cases (Robert, 2026-11-25): the cases of one surgeon, one brand, one type of surgery and one case Type
   * (Primary, Revision or Demo), by month. The screen adds these lines up for every view and switches them on and off with its chips
   * and filters, so the server sends them once.
   */
  public class HospitalLine {
    /** The surgeon's Account id; empty when the case has no surgeon recorded. */
    @AuraEnabled
    public Id surgeonId;
    @AuraEnabled
    public String surgeon;
    /** The case's Brand (its label). */
    @AuraEnabled
    public String brand;
    /** Hip, Knee, Shoulder or CMFT. */
    @AuraEnabled
    public String anatomy;
    /** Primary, Revision or Demo (the case's Type, Case__c.Procedure__c). */
    @AuraEnabled
    public String procedure;
    /** True when the case's usage holds the ROSA robotic unit drape, the sign the ROSA was used (Robert, 2026-11-28). */
    @AuraEnabled
    public Boolean rosa = false;
    @AuraEnabled
    public List<Integer> months = new List<Integer>();
  }

  /** What the hospital chart needs: the hospital, the 12 months, the four types' counts (always all four, in order) and the lines. */
  public class HospitalBookings {
    @AuraEnabled
    public Id hospitalId;
    @AuraEnabled
    public String hospitalName;
    /** COMPLETED: the first day of the 11th month back, and today (the current month so far is the last column). BOOKED: today, and the last day of the 12th month. */
    @AuraEnabled
    public Date windowStart;
    @AuraEnabled
    public Date windowEnd;
    /** False when the hospital had no counted surgery in the window. */
    @AuraEnabled
    public Boolean hasBookings = false;
    @AuraEnabled
    public Integer booked = 0;
    @AuraEnabled
    public List<HospitalType> types = new List<HospitalType>();
    /** Every surgeon, brand, type and case Type with cases, for the Surgeon Total and Surgeon / Brand views and the chips. */
    @AuraEnabled
    public List<HospitalLine> lines = new List<HospitalLine>();
  }

  private static final String NO_SURGEON = 'No surgeon recorded';
  private static final String NO_BRAND = 'No brand recorded';

  /** Case__c.Procedure__c to the word on the chip: A00 Primary, A01 Revision, Z02 Demo (Demo/Non-Billable); anything else Primary. */
  private static String procedureName(String code) {
    if (code == 'A01') {
      return 'Revision';
    }
    if (code == 'Z02') {
      return 'Demo';
    }
    return 'Primary';
  }

  /**
   * ROSA deals (Robert, 2026-11-19): the MyCase bookings seen from the hospital's side. For the deal's Healthcare Facility, the
   * surgeries of the last 12 months up to and including today (the current month is the last column; Robert, 2026-11-28), by month and by type of surgery
   * (Hip, Knee, Shoulder, CMFT), primary and revision together: it is cases booked. A case counts when the surgery has happened and
   * has at least one usage item (a case with none is a booking whose surgery did not go ahead); the anatomy comes from
   * Case__c.Surgery_Type__c. Demos (Z02) with usage items count too (Robert, 2026-11-25: the screen has a Demo chip), unlike the
   * surgeon's panel. Also sends the lines by surgeon, brand, type and case Type (see HospitalLine). A deal with no hospital returns
   * no hospital; a hospital with no surgeries returns zeros and hasBookings false. No error either way.
   *
   * Who calls it: the pipelineHospitalBookings component (the MyCase Bookings screen of a ROSA deal) and its test class.
   * What it touches: reads SalesRisks__c (the deal's hospital), Account (the hospital's and surgeons' names), Case__c and
   * myCase_Usage_Item__c, in the signed-in person's own access (user mode). Changes nothing.
   */
  @AuraEnabled
  public static HospitalBookings getHospitalBookings(Id dealId) {
    return hospitalBookings(dealId, false);
  }

  /**
   * BOOKED (Robert, 2026-11-28): the hospital's surgeries booked from today for 12 months (the first column is the current month from
   * today on). No usage is needed; ROSA is the booking's Technology, ROSA or ROSA+PSI. Cancelled bookings (SAP Surgery Status R or C,
   * or Booking Status C) are left out. Same shape as getHospitalBookings. Who calls it: pipelineHospitalBookings and its test.
   * Reads Case__c and Account in the person's own access; changes nothing.
   */
  @AuraEnabled
  public static HospitalBookings getHospitalBooked(Id dealId) {
    return hospitalBookings(dealId, true);
  }

  private static HospitalBookings hospitalBookings(Id dealId, Boolean booked) {
    HospitalBookings out = new HospitalBookings();
    Date thisMonth = Date.today().toStartOfMonth();
    // COMPLETED (Robert, 2026-11-28): the 12 months ending with this month, up to and including today (on 28 Nov 2026: Dec 2025 to 28 Nov 2026)
    out.windowStart = booked ? Date.today() : thisMonth.addMonths(-11);
    out.windowEnd = booked ? thisMonth.addMonths(12).addDays(-1) : Date.today();
    Map<String, HospitalType> byAnatomy = new Map<String, HospitalType>();
    for (String a : ORDER) {
      HospitalType t = new HospitalType();
      t.name = ANATOMY.get(a);
      t.months = zeros();
      byAnatomy.put(a, t);
      out.types.add(t);
    }
    List<SalesRisks__c> d = [
      SELECT Healthcare_Facility__c, Healthcare_Facility__r.Name
      FROM SalesRisks__c
      WHERE Id = :dealId
      WITH USER_MODE
      LIMIT 1
    ];
    if (d.isEmpty() || d[0].Healthcare_Facility__c == null) {
      return out;
    }
    out.hospitalId = d[0].Healthcare_Facility__c;
    out.hospitalName = d[0].Healthcare_Facility__r?.Name;
    Map<String, HospitalLine> lines = new Map<String, HospitalLine>();
    for (
      HospitalCase k : booked
        ? bookedAtHospital(
            out.hospitalId,
            out.windowStart,
            thisMonth.addMonths(12)
          )
        : countedAtHospital(
            out.hospitalId,
            out.windowStart,
            Date.today().addDays(1)
          )
    ) {
      HospitalType t = byAnatomy.get(k.anatomy);
      t.months[k.month] = t.months[k.month] + 1;
      t.booked++;
      out.booked++;
      String key =
        k.surgeonId +
        '|' +
        k.surgeon +
        '|' +
        k.brand +
        '|' +
        k.anatomy +
        '|' +
        k.procedure +
        '|' +
        k.rosa;
      HospitalLine line = lines.get(key);
      if (line == null) {
        line = new HospitalLine();
        line.surgeonId = k.surgeonId;
        line.surgeon = k.surgeon;
        line.brand = k.brand;
        line.anatomy = t.name;
        line.procedure = k.procedure;
        line.rosa = k.rosa;
        line.months = zeros();
        lines.put(key, line);
        out.lines.add(line);
      }
      line.months[k.month] = line.months[k.month] + 1;
    }
    out.hasBookings = out.booked > 0;
    return out;
  }

  /** One counted case at the hospital. */
  private class HospitalCase {
    String anatomy;
    Integer month;
    Id surgeonId;
    String surgeon;
    String brand;
    String procedure;
    Boolean rosa;
  }

  /**
   * The ROSA robotic unit drape: a case whose usage (any sheet, manual included) holds one was done with the ROSA robot, since a drape
   * is always used with it (Robert, 2026-11-28). Used by the ROSA / non-ROSA choice on MyCase Bookings.
   */
  public static final Set<String> ROSA_DRAPE = new Set<String>{
    '20-8020-080-00',
    '20-8020-080-01'
  };

  /** Case__c.Technology__c values that mean the ROSA robot is booked: 3 ROSA, 4 ROSA+PSI (Robert, 2026-11-28). */
  public static final Set<String> ROSA_TECHNOLOGY = new Set<String>{ '3', '4' };

  /**
   * The booking fields BOOKED reads beyond the usual ones, only those the person can read (not every profile can see Technology or
   * Booking Status, e.g. India in UAT): a field they cannot read is simply not used, so BOOKED never fails on field access.
   */
  public static String bookingFields() {
    String out = '';
    Map<String, Schema.SObjectField> fields = Schema.SObjectType.Case__c.fields.getMap();
    for (
      String f : new List<String>{
        'Status__c',
        'Booking_Status__c',
        'Technology__c'
      }
    ) {
      if (fields.get(f).getDescribe().isAccessible()) {
        out += ', ' + f;
      }
    }
    return out;
  }

  /** A field of a case, or null when it was not read. */
  private static Object valueOf(Case__c c, String field) {
    return c.getPopulatedFieldsAsMap().get(field);
  }

  /** True when the booking's Technology is ROSA or ROSA+PSI. */
  public static Boolean isRosaBooking(Case__c c) {
    return ROSA_TECHNOLOGY.contains((String) valueOf(c, 'Technology__c'));
  }

  /** True when a booking is cancelled: SAP Surgery Status R or C (Cancelled / Canceled), or Booking Status C (Cancelled). */
  public static Boolean isCancelled(Case__c c) {
    String status = (String) valueOf(c, 'Status__c');
    String booking = (String) valueOf(c, 'Booking_Status__c');
    return status == 'R' || status == 'C' || booking == 'C';
  }

  /** The hospital's bookings from `start` (today) up to `endExclusive`, cancelled ones left out; ROSA from the Technology. */
  private static List<HospitalCase> bookedAtHospital(
    Id hospital,
    Date start,
    Date endExclusive
  ) {
    List<HospitalCase> out = new List<HospitalCase>();
    Map<String, Object> binds = new Map<String, Object>{
      'hospital' => hospital,
      'startDate' => start,
      'endDate' => endExclusive,
      'types' => ORDER
    };
    String q =
      'SELECT Id, Surgery_Date__c, Surgery_Type__c, Procedure__c, toLabel(Brand__c), Physician__c, Physician__r.Name' +
      bookingFields() +
      ' FROM Case__c WHERE Healthcare_Facility__c = :hospital AND Surgery_Date__c >= :startDate' +
      ' AND Surgery_Date__c < :endDate AND Surgery_Type__c IN :types LIMIT 20000';
    for (
      Case__c c : (List<Case__c>) Database.queryWithBinds(
        q,
        binds,
        AccessLevel.USER_MODE
      )
    ) {
      if (isCancelled(c)) {
        continue;
      }
      HospitalCase k = toCase(c, start);
      k.rosa = isRosaBooking(c);
      out.add(k);
    }
    return out;
  }

  private static HospitalCase toCase(Case__c c, Date start) {
    HospitalCase k = new HospitalCase();
    k.anatomy = c.Surgery_Type__c;
    k.month =
      (c.Surgery_Date__c.year() - start.year()) * 12 +
      c.Surgery_Date__c.month() -
      start.month();
    k.surgeonId = c.Physician__c;
    k.surgeon = c.Physician__c == null
      ? NO_SURGEON
      : (String.isBlank(c.Physician__r?.Name)
          ? NO_SURGEON
          : c.Physician__r.Name);
    k.brand = String.isBlank(c.Brand__c) ? NO_BRAND : c.Brand__c;
    k.procedure = procedureName(c.Procedure__c);
    return k;
  }

  /** The hospital's counted surgeries from `start` up to (not including) `endExclusive`: happened, with at least one usage item. */
  private static List<HospitalCase> countedAtHospital(
    Id hospital,
    Date start,
    Date endExclusive
  ) {
    List<Case__c> cases = [
      SELECT
        Id,
        Surgery_Date__c,
        Surgery_Type__c,
        Procedure__c,
        toLabel(Brand__c),
        Physician__c,
        Physician__r.Name
      FROM Case__c
      WHERE
        Healthcare_Facility__c = :hospital
        AND Surgery_Date__c >= :start
        AND Surgery_Date__c < :endExclusive
        AND Surgery_Type__c IN :ORDER
      WITH USER_MODE
      LIMIT 20000
    ];
    List<HospitalCase> out = new List<HospitalCase>();
    if (cases.isEmpty()) {
      return out;
    }
    Set<Id> withItems = new Set<Id>();
    for (AggregateResult ar : [
      SELECT Usage_Sheet_ID__r.Case__c c
      FROM myCase_Usage_Item__c
      WHERE
        Usage_Sheet_ID__r.Case__r.Healthcare_Facility__c = :hospital
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :start
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :endExclusive
      WITH USER_MODE
      GROUP BY Usage_Sheet_ID__r.Case__c
    ]) {
      withItems.add((Id) ar.get('c'));
    }
    Set<Id> withDrape = new Set<Id>();
    for (AggregateResult ar : [
      SELECT Usage_Sheet_ID__r.Case__c c
      FROM myCase_Usage_Item__c
      WHERE
        Usage_Sheet_ID__r.Case__r.Healthcare_Facility__c = :hospital
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c >= :start
        AND Usage_Sheet_ID__r.Case__r.Surgery_Date__c < :endExclusive
        AND SAP_Material_Number__c IN :ROSA_DRAPE
      WITH USER_MODE
      GROUP BY Usage_Sheet_ID__r.Case__c
    ]) {
      withDrape.add((Id) ar.get('c'));
    }
    for (Case__c c : cases) {
      if (!withItems.contains(c.Id)) {
        continue;
      }
      HospitalCase k = toCase(c, start);
      k.rosa = withDrape.contains(c.Id);
      out.add(k);
    }
    return out;
  }
}
