import { createElement } from "lwc";
import PipelineBookings from "c/pipelineBookings";
import getBookings from "@salesforce/apex/PipelineBookingsController.getBookings";
import saveHospital from "@salesforce/apex/PipelineBookingsController.saveHospital";

jest.mock(
  "@salesforce/apex/PipelineBookingsController.getBookings",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/PipelineBookingsController.saveHospital",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
// the helper reads Salesforce; here it is an empty stand-in that the tests drive by an event
jest.mock(
  "c/pipelineUsageChoices",
  () => {
    const { LightningElement } = require("lwc");
    return { __esModule: true, default: class extends LightningElement {} };
  },
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

const row = (over) => ({
  id: "h1",
  name: "Westside",
  booked: 22,
  lines: [],
  ...over
});
const type = (over) => ({
  name: "Knee",
  portfolio: "Knee",
  split: true,
  primary: [6, 7, 5, 8, 7, 6, 8, 7, 6, 7, 8, 6],
  revision: [0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0],
  partial: [1, 0],
  booked: 85,
  usage: "none",
  zb: 0,
  canAuto: true,
  recordTypeId: "rt1",
  rows: [row()],
  ...over
});
const data = (types, over) => ({
  surgeonId: "001",
  surgeonName: "Dr Test",
  windowStart: "2025-11-01",
  today: "2026-11-02",
  noUsagesAtAll: false,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  types,
  ...over
});
function make() {
  const el = createElement("c-pipeline-bookings", { is: PipelineBookings });
  el.recordId = "a1";
  document.body.appendChild(el);
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);
const qa = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];
const button = (el, text) =>
  qa(el, "button").find((b) => b.textContent.trim() === text);
const radio = (el, text) =>
  qa(el, ".rad").find((r) => r.textContent.includes(text));
const knownCompanies = (el, byKey) =>
  q(el, "c-pipeline-usage-choices").dispatchEvent(
    new CustomEvent("choices", { detail: { recordTypeId: "rt1", byKey } })
  );

describe("c-pipeline-bookings", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("shows the same three columns for every type: graph and total, hospital list, hospital panel", async () => {
    getBookings.mockResolvedValue(
      data([
        type(),
        type({
          name: "Hip",
          portfolio: "Hip",
          booked: 4,
          rows: [row({ booked: 4 })]
        })
      ])
    );
    const el = make();
    await flush();
    expect(qa(el, ".sect").length).toBe(2);
    expect(q(el, ".sect .big").textContent).toContain("85");
    expect(q(el, ".sect .sm").textContent).toContain("Revision");
    expect(q(el, ".sect svg")).not.toBeNull();
    expect(qa(el, ".sect")[1].querySelector(".list .hrow")).not.toBeNull();
    expect(qa(el, ".sect")[1].querySelector(".detail .dh")).not.toBeNull();
    expect(q(el, ".window").textContent).toContain("1 Nov 2025 to 31 Oct 2026");
  });

  it("starts on the first hospital that needs attention and says what was found", async () => {
    getBookings.mockResolvedValue(
      data([
        type({
          rows: [
            row({
              id: "h1",
              name: "Accurate",
              booked: 40,
              lines: [{ usageId: "u1", company: "ZB", cases: 40 }]
            }),
            row({
              id: "h2",
              name: "Needs one",
              booked: 10,
              lines: []
            })
          ]
        })
      ])
    );
    const el = make();
    await flush();
    expect(q(el, ".detail .hn").textContent).toBe("Needs one");
    expect(q(el, ".found").textContent).toContain("No knee usage");
    expect(q(el, ".att").textContent).toContain("1 hospital needs attention");
    qa(el, ".hrow")[0].click();
    await flush();
    expect(q(el, ".found").textContent).toContain("within 10%");
  });

  it("offers to add the ZB usage next to a competitor's, and saves it only after a confirmation", async () => {
    getBookings.mockResolvedValue(
      data([
        type({
          rows: [
            row({
              booked: 22,
              lines: [{ usageId: "u1", company: "Stryker", cases: 60 }]
            })
          ]
        })
      ])
    );
    saveHospital.mockResolvedValue({ created: 1, updated: 0, deleted: 0 });
    const el = make();
    await flush();
    expect(q(el, ".found").textContent).toContain("Stryker, 60 a year");
    expect(qa(el, ".rad").length).toBe(3);
    expect(q(el, ".rad.on").textContent).toContain(
      "Add the ZB usage, and change or delete the competitor"
    );
    expect(q(el, ".res").textContent).toContain(
      "Stryker, 60 a year  +  ZB, 22 a year"
    );
    const changed = jest.fn();
    el.addEventListener("usageschanged", changed);
    button(el, "Review change").click();
    await flush();
    expect(saveHospital).not.toHaveBeenCalled();
    expect(q(el, ".dfoot").textContent).toContain(
      "Add a ZB usage, 22 a year (Stryker, 60 a year stays)?"
    );
    getBookings.mockResolvedValue(
      data([
        type({
          rows: [
            row({
              booked: 22,
              lines: [
                { usageId: "u1", company: "Stryker", cases: 60 },
                { usageId: "u2", company: "ZB", cases: 22 }
              ]
            })
          ]
        })
      ])
    );
    button(el, "Confirm").click();
    await flush();
    expect(saveHospital).toHaveBeenCalledWith({
      dealId: "a1",
      portfolio: "Knee",
      hospitalId: "h1",
      opsJson: JSON.stringify([{ op: "zb", cases: 22 }])
    });
    expect(q(el, ".donebox").textContent).toContain("Saved.");
    expect(changed).toHaveBeenCalled();
    expect(getBookings).toHaveBeenCalledTimes(2);
  });

  it("changes or deletes the competitor in the same save as adding the ZB usage", async () => {
    getBookings.mockResolvedValue(
      data([
        type({
          rows: [
            row({
              booked: 22,
              lines: [{ usageId: "u1", company: "Stryker", cases: 60 }]
            })
          ]
        })
      ])
    );
    saveHospital.mockResolvedValue({ created: 1, updated: 0, deleted: 1 });
    const el = make();
    await flush();
    button(el, "Delete").click();
    await flush();
    expect(q(el, ".res").textContent).toContain("After");
    expect(q(el, ".res b").textContent).toBe("ZB, 22 a year");
    button(el, "Review change").click();
    await flush();
    button(el, "Confirm").click();
    await flush();
    expect(saveHospital.mock.calls[0][0].opsJson).toBe(
      JSON.stringify([
        { op: "zb", cases: 22 },
        { op: "del", usageId: "u1" }
      ])
    );
  });

  it("lets the person change the suggested ZB number, and holds the button back until a number is there", async () => {
    getBookings.mockResolvedValue(data([type()]));
    const el = make();
    await flush();
    const zb = q(el, 'input[data-f="zb"]');
    expect(zb.value).toBe("22");
    zb.value = "";
    zb.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(button(el, "Review change").disabled).toBe(true);
    expect(q(el, ".dfoot").textContent).toContain("Enter the ZB cases a year");
    q(el, 'input[data-f="zb"]').value = "25";
    q(el, 'input[data-f="zb"]').dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(button(el, "Review change").disabled).toBe(false);
    expect(q(el, ".res b").textContent).toBe("ZB, 25 a year");
  });

  it("adds a competitor's usage from the companies read from Salesforce, leaving out ZB and those already there", async () => {
    getBookings.mockResolvedValue(data([type()]));
    saveHospital.mockResolvedValue({ created: 2, updated: 0, deleted: 0 });
    const el = make();
    await flush();
    knownCompanies(el, { knee: ["Depuy", "Stryker", "ZB"] });
    await flush();
    // the first "Add" is the ZB toggle; the second is the competitor toggle
    qa(el, ".seg")
      .filter((b) => b.textContent.trim() === "Add")[1]
      .click();
    await flush();
    const options = qa(el, 'select[data-f="compName"] option').map((o) =>
      o.textContent.trim()
    );
    expect(options).toEqual(["Depuy", "Stryker"]);
    const cases = q(el, 'input[data-f="compCases"]');
    cases.value = "7";
    cases.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(q(el, ".res b").textContent).toBe(
      "ZB, 22 a year  +  Depuy, 7 a year"
    );
    button(el, "Review change").click();
    await flush();
    button(el, "Confirm").click();
    await flush();
    expect(saveHospital.mock.calls[0][0].opsJson).toBe(
      JSON.stringify([
        { op: "zb", cases: 22 },
        { op: "add", company: "Depuy", cases: 7 }
      ])
    );
  });

  it("shows the reason when a save is refused, and keeps the choices", async () => {
    getBookings.mockResolvedValue(data([type()]));
    saveHospital.mockRejectedValue({ body: { message: "bad value" } });
    const el = make();
    await flush();
    button(el, "Review change").click();
    await flush();
    button(el, "Confirm").click();
    await flush();
    expect(q(el, ".errs").textContent).toContain("bad value");
    expect(button(el, "Review change")).toBeDefined();
  });

  it("moves on to the next hospital that needs attention, and a hospital can be left as it is", async () => {
    getBookings.mockResolvedValue(
      data([
        type({
          rows: [
            row({ id: "h1", name: "First", booked: 10 }),
            row({ id: "h2", name: "Second", booked: 5 })
          ]
        })
      ])
    );
    const el = make();
    await flush();
    expect(q(el, ".detail .hn").textContent).toBe("First");
    radio(el, "Leave as it is").click();
    await flush();
    button(el, "Leave and move on").click();
    await flush();
    expect(q(el, ".donebox").textContent).toContain("Left as it is");
    button(el, "Next hospital").click();
    await flush();
    expect(q(el, ".detail .hn").textContent).toBe("Second");
    expect(q(el, ".att").textContent).toContain("1 hospital needs attention");
  });

  it("never changes shoulder from here, and says so", async () => {
    getBookings.mockResolvedValue(
      data([type({ name: "Shoulder", portfolio: "Shoulder", canAuto: false })])
    );
    const el = make();
    await flush();
    expect(q(el, ".msg").textContent).toContain("anatomical and reverse");
    expect(button(el, "Review change")).toBeUndefined();
    const open = jest.fn();
    el.addEventListener("openusages", open);
    button(el, "Open Surgeon Usages").click();
    expect(open).toHaveBeenCalled();
  });

  it("offers no choices to a person who may not change usages, or for surgeries with no hospital", async () => {
    getBookings.mockResolvedValue(
      data([type()], { canEdit: false, canCreate: false })
    );
    const el = make();
    await flush();
    expect(qa(el, ".rad").length).toBe(0);
    expect(q(el, ".msg").textContent).toContain("Your access does not allow");
    getBookings.mockResolvedValue(
      data([type({ rows: [row({ id: null, name: "No hospital recorded" })] })])
    );
    const el2 = make();
    await flush();
    expect(el2.shadowRoot.querySelector(".msg").textContent).toContain(
      "no hospital recorded"
    );
  });

  it("warns in red when the surgeon has no usages at all", async () => {
    getBookings.mockResolvedValue(
      data([type({ usage: "none" })], { noUsagesAtAll: true })
    );
    const el = make();
    await flush();
    expect(q(el, ".topchip .pill").textContent).toContain(
      "Usages are missing for this surgeon"
    );
  });

  it("draws CMFT in one colour with no split", async () => {
    getBookings.mockResolvedValue(
      data([
        type({ name: "CMFT", portfolio: "CMF", split: false, revision: null })
      ])
    );
    const el = make();
    await flush();
    expect(q(el, ".sm").textContent).toContain("no primary or revision split");
  });
});
