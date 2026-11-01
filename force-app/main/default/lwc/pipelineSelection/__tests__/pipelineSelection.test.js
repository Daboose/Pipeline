import { createElement } from "lwc";
import PipelineSelection from "c/pipelineSelection";
import { registerLdsTestWireAdapter } from "@salesforce/sfdx-lwc-jest";
import { getPicklistValuesByRecordType } from "lightning/uiObjectInfoApi";
import { splitStages, defaultFilter, MINE } from "c/pipelineFilterModel";

jest.mock(
  "@salesforce/apex/PipelineFilterController.searchOwners",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const brandAdapter = registerLdsTestWireAdapter(getPicklistValuesByRecordType);

const CHOICES = {
  opp: splitStages("opp", [
    "Plan",
    "Action",
    "Conversion",
    "Unsuccessful Conversion"
  ]),
  risk: splitStages("risk", ["Unhappy", "Closed Retained", "Lost Business"]),
  rosa: splitStages("rosa", ["Sales Pipeline", "Closed Won", "Deal Lost"])
};
const TEAMS = [
  { id: "t1", name: "Director", parentId: null, mine: false },
  { id: "t2", name: "My patch", parentId: "t1", mine: true }
];

function make(props) {
  const el = createElement("c-pipeline-selection", { is: PipelineSelection });
  Object.assign(el, {
    filter: defaultFilter(["opp"], CHOICES, MINE),
    choices: CHOICES,
    teams: TEAMS,
    options: {
      countries: ["AU", "NZ"],
      states: ["Victoria"],
      segments: ["Knee"],
      brands: ["Persona"],
      quarters: ["Q1", "Q2"]
    },
    isManager: true,
    startTeam: MINE,
    cols: {},
    recordTypes: {
      "AU KNEE Opportunity": "rtAuKnee",
      "NZ KNEE Opportunity": "rtNzKnee",
      "AU HIP Opportunity": "rtAuHip"
    },
    ...props
  });
  document.body.appendChild(el);
  return el;
}
const btn = (el, text) =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent.trim().toLowerCase() === text.toLowerCase()
  );

describe("c-pipeline-selection", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("changes nothing until Apply: the choices are a copy", async () => {
    const el = make();
    const apply = jest.fn();
    el.addEventListener("apply", apply);
    btn(el, "AU").click();
    await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
    btn(el, "Apply").click();
    expect(apply.mock.calls[0][0].detail.filter.countries).toEqual(["AU"]);
    expect(el.filter.countries).toEqual([]);
  });

  it("throws the copy away on Cancel", () => {
    const el = make();
    const apply = jest.fn();
    const cancel = jest.fn();
    el.addEventListener("apply", apply);
    el.addEventListener("cancel", cancel);
    btn(el, "AU").click();
    btn(el, "Cancel").click();
    expect(cancel).toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("offers the team tree and an owner search to a manager, and neither to a rep", () => {
    expect(make().shadowRoot.textContent).toContain("Include teams below");
    const rep = make({
      isManager: false,
      filter: defaultFilter(["opp"], CHOICES, "")
    });
    expect(rep.shadowRoot.textContent).not.toContain("Include teams below");
    expect(rep.shadowRoot.textContent).not.toContain(
      "Searches every active user"
    );
  });

  it("starts a manager on My team, and picking another team shows it as a chip", async () => {
    const el = make();
    expect(el.shadowRoot.querySelector(".xchip").textContent).toContain(
      "My team"
    );
    const row = [...el.shadowRoot.querySelectorAll(".trow")].find((r) =>
      r.textContent.includes("Director")
    );
    row.click();
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".xchip").textContent).toContain(
      "Director"
    );
    const apply = jest.fn();
    el.addEventListener("apply", apply);
    btn(el, "Apply").click();
    expect(apply.mock.calls[0][0].detail.filter.teamId).toBe("t1");
  });

  it("opens the team tree down to the chosen team, so it is in view without clicking", async () => {
    const el = make({
      filter: { ...defaultFilter(["opp"], CHOICES, ""), teamId: "t2" },
      startTeam: ""
    });
    await Promise.resolve();
    await Promise.resolve();
    const rows = [...el.shadowRoot.querySelectorAll(".tree .trow")].map((r) =>
      r.textContent.trim()
    );
    expect(rows.some((r) => r.includes("Director"))).toBe(true);
    expect(rows.some((r) => r.includes("My patch"))).toBe(true);
    expect(
      el.shadowRoot.querySelector(".tree .trow.sel").textContent
    ).toContain("My patch");
  });

  it("clears the country and state when a team is picked, since the team already says whose deals these are", async () => {
    const el = make({
      filter: {
        ...defaultFilter(["opp"], CHOICES, ""),
        countries: ["AU"],
        states: ["Victoria"]
      }
    });
    const row = [...el.shadowRoot.querySelectorAll(".trow")].find((r) =>
      r.textContent.includes("Director")
    );
    row.click();
    await Promise.resolve();
    const apply = jest.fn();
    el.addEventListener("apply", apply);
    btn(el, "Apply").click();
    const f = apply.mock.calls[0][0].detail.filter;
    expect(f.teamId).toBe("t1");
    expect(f.countries).toEqual([]);
    expect(f.states).toEqual([]);
  });

  it("gives every team row the same chevron space, so a team with no teams below lines up with its siblings", async () => {
    const el = make();
    const rows = [...el.shadowRoot.querySelectorAll(".tree .trow")].filter(
      (r) => !r.classList.contains("none")
    );
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.querySelector(".car")).not.toBeNull());
  });

  it("puts a round clear button on the team and owner searches while they hold text", async () => {
    const el = make();
    expect(el.shadowRoot.querySelectorAll(".sclear").length).toBe(0);
    const inputs = el.shadowRoot.querySelectorAll(".sbox input");
    expect(inputs.length).toBe(2);
    const team = inputs[0];
    team.value = "dir";
    team.dispatchEvent(new CustomEvent("input"));
    await Promise.resolve();
    const clear = el.shadowRoot.querySelector(".sbox .sclear");
    expect(clear).not.toBeNull();
    clear.click();
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".sbox input").value).toBe("");
    expect(el.shadowRoot.querySelectorAll(".sclear").length).toBe(0);
  });

  it("lists the stages of each chosen type and follows Open / Closed / Both", async () => {
    const el = make();
    const stages = () =>
      [...el.shadowRoot.querySelectorAll(".pill.on")].map((p) =>
        p.textContent.trim()
      );
    expect(stages()).toEqual(expect.arrayContaining(["Plan", "Action"]));
    expect(stages()).not.toContain("Conversion");
    btn(el, "Both").click();
    await Promise.resolve();
    expect(stages()).toContain("Conversion");
    expect(el.shadowRoot.textContent).toContain("Closed deals shown");
    btn(el, "Open").click();
    await Promise.resolve();
    expect(el.shadowRoot.textContent).not.toContain("Closed deals shown");
  });

  it("only offers states once Australia is chosen", async () => {
    const el = make();
    expect(el.shadowRoot.textContent).not.toContain("State (Australia)");
    [...el.shadowRoot.querySelectorAll(".pill")]
      .find((p) => p.textContent.trim() === "AU")
      .click();
    await Promise.resolve();
    expect(el.shadowRoot.textContent).toContain("State (Australia)");
  });

  it("puts everything back on Reset and says so", () => {
    const el = make();
    const reset = jest.fn();
    el.addEventListener("reset", reset);
    btn(el, "AU").click();
    btn(el, "Reset").click();
    expect(reset.mock.calls[0][0].detail.filter.countries).toEqual([]);
    expect(reset.mock.calls[0][0].detail.filter.teamId).toBe(MINE);
  });

  it("shows a hint until a portfolio is chosen, then only the brands that apply to it and the countries", async () => {
    const brands = {
      rtAuKnee: ["Persona", "Oxford"],
      rtNzKnee: ["Persona", "Vanguard"],
      rtAuHip: ["Taperloc"]
    };
    const flush = () => new Promise((r) => setTimeout(r, 0)); // eslint-disable-line @lwc/lwc/no-async-operation
    /* answers each record type the panel asks for, one after another, as Salesforce would */
    const answerAll = async () => {
      for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        await flush();
        const cfg = brandAdapter.getLastConfig();
        if (!cfg || !cfg.recordTypeId) return;
        brandAdapter.emit({
          picklistFieldValues: {
            Brand__c: {
              values: brands[cfg.recordTypeId].map((value) => ({ value }))
            }
          }
        });
      }
    };
    const el = make({
      options: {
        countries: ["AU", "NZ"],
        states: [],
        segments: ["Knee", "Hip"],
        brands: ["Persona", "Oxford", "Vanguard", "Taperloc", "Other"],
        quarters: []
      }
    });
    expect(el.shadowRoot.textContent).toContain("Pick a portfolio above");
    const pill = (t) =>
      [...el.shadowRoot.querySelectorAll(".pill")].find(
        (p) => p.textContent.trim() === t
      );
    pill("Knee").click();
    await answerAll();
    await flush();
    const names = () =>
      [...el.shadowRoot.querySelectorAll(".fld")]
        .find(
          (f) =>
            f.querySelector(".t") &&
            f.querySelector(".t").textContent.trim() === "Brand"
        )
        .querySelectorAll(".pill");
    const text = () => [...names()].map((p) => p.textContent.trim()).sort();
    expect(text()).toEqual(["Oxford", "Persona", "Vanguard"]);
    pill("NZ").click(); // only New Zealand's knee brands now
    await answerAll();
    await flush();
    expect(text()).toEqual(["Persona", "Vanguard"]);
  });
});
