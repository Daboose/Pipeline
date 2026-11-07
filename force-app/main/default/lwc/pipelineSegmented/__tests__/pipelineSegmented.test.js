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
  it("turns the whole pill green or amber while the chosen option has a tone, and not otherwise", async () => {
    const options = [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes", tone: "good" }
    ];
    const el = make({ heading: "Rep priority", value: "no", options });
    await flush();
    const wrap = () => el.shadowRoot.querySelector(".wrap");
    expect(wrap().className).toBe("wrap");
    el.value = "yes";
    await flush();
    expect(wrap().classList.contains("t-good")).toBe(true);
    el.options = [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes", tone: "warn" }
    ];
    await flush();
    expect(wrap().classList.contains("t-warn")).toBe(true);
    expect(wrap().classList.contains("t-good")).toBe(false);
  });

  it("colours only the thumb, not the whole pill, when toneThumb is set (the phone's sliders)", async () => {
    const options = [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes", tone: "good" }
    ];
    const el = make({
      heading: "Rep priority",
      value: "yes",
      options,
      toneThumb: true
    });
    await flush();
    const wrap = el.shadowRoot.querySelector(".wrap");
    expect(wrap.classList.contains("tt-good")).toBe(true);
    expect(wrap.classList.contains("t-good")).toBe(false); // the label end and the track are not filled
    el.options = [
      { value: "no", label: "No" },
      { value: "yes", label: "Yes", tone: "warn" }
    ];
    await flush();
    expect(wrap.classList.contains("tt-warn")).toBe(true);
  });

  it("ignores a press when it is disabled", async () => {
    const el = make({
      value: "no",
      disabled: true,
      options: [
        { value: "no", label: "No" },
        { value: "yes", label: "Yes" }
      ]
    });
    await flush();
    const changed = jest.fn();
    el.addEventListener("change", changed);
    el.shadowRoot.querySelector('button[data-value="yes"]').click();
    expect(changed).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".wrap.off")).not.toBeNull();
  });
});
