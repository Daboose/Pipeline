import {
  ZOOM_STEPS,
  DEFAULT_ZOOM,
  cleanZoom,
  zoomStyle,
  zoomOf
} from "c/pipelineZoom";

describe("pipelineZoom", () => {
  it("offers 100, 90, 80, 70 and 60", () => {
    expect(ZOOM_STEPS).toEqual([100, 90, 80, 70, 60]);
  });

  it("is 80 until a person chooses (Robert, 2026-11-16)", () => {
    expect(DEFAULT_ZOOM).toBe(80);
    expect(cleanZoom(undefined)).toBe(80);
    expect(cleanZoom(null)).toBe(80);
    expect(cleanZoom("")).toBe(80);
  });

  it("cleans anything saved to one of the steps, the default when it is not one, and keeps a chosen 100", () => {
    expect(cleanZoom(100)).toBe(100);
    expect(cleanZoom(60)).toBe(60);
    expect(cleanZoom("70")).toBe(70);
    expect(cleanZoom(55)).toBe(80);
    expect(cleanZoom(50)).toBe(80);
    expect(cleanZoom("big")).toBe(80);
  });

  it("writes the one number the screen is scaled by", () => {
    expect(zoomStyle(100)).toBe("--z:1");
    expect(zoomStyle(80)).toBe("--z:0.8");
    expect(zoomStyle(999)).toBe("--z:0.8");
  });

  it("reads the zoom in force from --z, and 1 when there is none", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(zoomOf(el)).toBe(1);
    el.style.setProperty("--z", "0.7");
    expect(zoomOf(el)).toBeCloseTo(0.7, 5);
    el.style.setProperty("--z", "3");
    expect(zoomOf(el)).toBe(1);
    document.body.removeChild(el);
  });
});
