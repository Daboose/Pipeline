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

  it("shows the types and the Open / Closed / Both / Custom worked out from the stages", () => {
    const el = make();
    expect(el.shadowRoot.querySelectorAll(".ktog.on").length).toBe(1);
    expect(
      el.shadowRoot.querySelector(".seg button.on").textContent.trim()
    ).toBe("Open");
    const both = make({
      filter: withStatus(defaultFilter(["opp"], CHOICES, MINE), "both", CHOICES)
    });
    expect(
      both.shadowRoot.querySelector(".seg button.on").textContent.trim()
    ).toBe("Both");
    const custom = make({
      filter: { ...defaultFilter(["opp"], CHOICES, MINE), stages: ["Plan"] }
    });
    expect(
      custom.shadowRoot.querySelector(".seg button.on").textContent.trim()
    ).toBe("Custom");
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
      "My pipeline"
    );
  });

  it("announces a type or a status that was pressed, and opens the panel from Custom", () => {
    const el = make();
    const kind = jest.fn();
    const status = jest.fn();
    const panel = jest.fn();
    el.addEventListener("kindtoggle", kind);
    el.addEventListener("statuspick", status);
    el.addEventListener("openpanel", panel);
    btn(el, "Risks").click();
    expect(kind.mock.calls[0][0].detail.kind).toBe("risk");
    btn(el, "Closed").click();
    expect(status.mock.calls[0][0].detail.value).toBe("closed");
    btn(el, "Custom").click();
    expect(status).toHaveBeenCalledTimes(1);
    expect(panel).toHaveBeenCalledTimes(1);
  });
});
