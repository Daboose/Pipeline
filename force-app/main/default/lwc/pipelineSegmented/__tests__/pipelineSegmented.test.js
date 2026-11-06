import { createElement } from "lwc";
import PipelineSegmented from "c/pipelineSegmented";

const make = (props) => {
  const el = createElement("c-pipeline-segmented", { is: PipelineSegmented });
  Object.assign(el, props);
  document.body.appendChild(el);
  return el;
};
const flush = () => Promise.resolve();

describe("c-pipeline-segmented", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("shows the label end and the options, with the chosen one marked", async () => {
    const el = make({
      heading: "Show",
      value: "active",
      options: [
        { value: "active", label: "Active" },
        { value: "all", label: "All" }
      ]
    });
    await flush();
    const root = el.shadowRoot;
    expect(root.querySelector(".slbl").textContent).toBe("Show");
    const opts = root.querySelectorAll(".opt");
    expect(opts.length).toBe(2);
    expect(opts[0].classList.contains("on")).toBe(true);
    expect(opts[1].classList.contains("on")).toBe(false);
  });

  it("tells its parent which option was picked, but not the one already chosen", async () => {
    const el = make({
      value: "light",
      options: [
        { value: "light", label: "Light", icon: "sun" },
        { value: "dark", label: "Dark", icon: "moon" }
      ]
    });
    const picked = [];
    el.addEventListener("change", (e) => picked.push(e.detail.value));
    await flush();
    const opts = el.shadowRoot.querySelectorAll(".opt");
    expect(opts[0].querySelector("svg")).not.toBeNull(); // a picture, no words
    opts[0].click();
    opts[1].click();
    expect(picked).toEqual(["dark"]);
  });
});
