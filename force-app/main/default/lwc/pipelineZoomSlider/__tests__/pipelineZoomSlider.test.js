import { createElement } from "lwc";
import PipelineZoomSlider from "c/pipelineZoomSlider";

function make(props) {
  const el = createElement("c-pipeline-zoom-slider", {
    is: PipelineZoomSlider
  });
  Object.assign(el, props);
  document.body.appendChild(el);
  return el;
}

describe("c-pipeline-zoom-slider", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });

  it("shows the saved zoom on its handle and a number under each tick", async () => {
    const el = make({ value: 80 });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".hdl").textContent).toBe("80%");
    expect(el.shadowRoot.querySelectorAll(".tk").length).toBe(5);
    const labels = [...el.shadowRoot.querySelectorAll(".tl span")].map(
      (s) => s.textContent
    );
    expect(labels).toEqual(["100", "90", "80", "70", "60"]);
  });

  it("falls back to 80% for a value that is not a step, and leaves out the numbers when compact", async () => {
    const el = make({ value: 55, compact: true });
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".hdl").textContent).toBe("80%");
    expect(el.shadowRoot.querySelector(".tl")).toBeNull();
  });

  it("announces the step chosen with the arrow keys, smaller to the right", async () => {
    const el = make({ value: 100 });
    const handler = jest.fn();
    el.addEventListener("zoomchange", handler);
    await Promise.resolve();
    const track = el.shadowRoot.querySelector(".choices");
    track.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.value).toBe(90);
    expect(el.shadowRoot.querySelector(".hdl").textContent).toBe("90%");
    track.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    expect(handler.mock.calls[1][0].detail.value).toBe(60);
    // already at the end: nothing more is announced
    track.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
