import { createElement } from "lwc";
import PipelineSurgeries from "c/pipelineSurgeries";
import getSurgeries from "@salesforce/apex/PipelineSurgeonController.getSurgeries";

jest.mock(
  "@salesforce/apex/PipelineSurgeonController.getSurgeries",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// eslint-disable-next-line @lwc/lwc/no-async-operation
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(props) {
  const el = createElement("c-pipeline-surgeries", { is: PipelineSurgeries });
  Object.assign(el, props);
  document.body.appendChild(el);
  return el;
}

describe("c-pipeline-surgeries", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("draws a bar for each type, the longest bar full width", async () => {
    getSurgeries.mockResolvedValue({
      surgeonId: "001",
      total: 30,
      byType: [
        { type: "Hip", count: 20 },
        { type: "Knee", count: 10 },
        { type: "Shoulder / Elbow", count: 0 }
      ]
    });
    const el = make({ recordId: "a1", country: "AU" });
    await flush();
    const fills = [...el.shadowRoot.querySelectorAll(".fill")].map(
      (f) => f.style.width
    );
    expect(fills).toEqual(["100%", "50%", "0%"]);
    expect(el.shadowRoot.querySelector(".foot").textContent).toContain(
      "usage items"
    );
  });

  it("explains that surgery records are Australia only for other countries", async () => {
    getSurgeries.mockResolvedValue({
      surgeonId: "001",
      total: 0,
      byType: [{ type: "Hip", count: 0 }]
    });
    const el = make({ recordId: "a1", country: "NZ" });
    await flush();
    expect(el.shadowRoot.querySelector(".foot").textContent).toContain(
      "Australia only"
    );
  });
});
