import { createElement } from "lwc";
import PipelineBar from "c/pipelineBar";
import {
  splitStages,
  defaultFilter,
  withStatus,
  MINE
} from "c/pipelineFilterModel";

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

function make(props) {
  const el = createElement("c-pipeline-bar", { is: PipelineBar });
  Object.assign(el, {
    choices: CHOICES,
    teams: [],
    isRep: false,
    savedFilters: [],
    activeFilterId: "",
    filter: defaultFilter(["opp"], CHOICES, MINE),
    ...props
  });
  document.body.appendChild(el);
  return el;
}
const btn = (el, text) =>
  [...el.shadowRoot.querySelectorAll("button")].find(
    (b) => b.textContent.trim().toLowerCase() === text.toLowerCase()
  );

describe("c-pipeline-bar", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  const status = (el) =>
    el.shadowRoot.querySelector("c-pipeline-segmented").value;

  it("shows the types and the Status slider (Open / Closed / Both) worked out from the stages, and nothing chosen when the stages were picked one by one", () => {
    const el = make();
    expect(el.shadowRoot.querySelectorAll(".ktog.on").length).toBe(1);
    expect(status(el)).toBe("open");
    expect(el.shadowRoot.querySelector("c-pipeline-segmented").heading).toBe(
      "Status"
    );
    const both = make({
      filter: withStatus(defaultFilter(["opp"], CHOICES, MINE), "both", CHOICES)
    });
    expect(status(both)).toBe("both");
    const custom = make({
      filter: { ...defaultFilter(["opp"], CHOICES, MINE), stages: ["Plan"] }
    });
    expect(status(custom)).toBe("");
    expect(custom.shadowRoot.querySelector(".chips").textContent).toContain(
      "Plan"
    );
  });

  it("says in chips what is looked at", () => {
    const el = make();
    expect(el.shadowRoot.querySelector(".chips").textContent).toContain(
      "My team + below"
    );
    const rep = make({
      isRep: true,
      filter: defaultFilter(["opp"], CHOICES, "")
    });
    expect(rep.shadowRoot.querySelector(".chips").textContent).toContain(
      "My Pipeline"
    );
  });

  it("announces a type or a status that was pressed", () => {
    const el = make();
    const kind = jest.fn();
    const picked = jest.fn();
    el.addEventListener("kindtoggle", kind);
    el.addEventListener("statuspick", picked);
    btn(el, "Risks").click();
    expect(kind.mock.calls[0][0].detail.kind).toBe("risk");
    el.shadowRoot
      .querySelector("c-pipeline-segmented")
      .dispatchEvent(
        new CustomEvent("change", { detail: { value: "closed" } })
      );
    expect(picked.mock.calls[0][0].detail.value).toBe("closed");
  });
});
