import { createElement } from "lwc";
import PipelineSurgeonFlyout from "c/pipelineSurgeonFlyout";

// the Usage Card reads its own data from Salesforce; here it is an empty stand-in
jest.mock(
  "c/pipelineUsageCard",
  () => {
    const { LightningElement, registerDecorators } = require("lwc");
    class Stub extends LightningElement {}
    registerDecorators(Stub, {
      publicProps: { embedded: { config: 0 }, recordId: { config: 0 } }
    });
    return { __esModule: true, default: Stub };
  },
  { virtual: true }
);

jest.mock(
  "c/pipelineNewDeal",
  () => {
    const { LightningElement, registerDecorators } = require("lwc");
    class Stub extends LightningElement {}
    registerDecorators(Stub, {
      publicProps: {
        accountId: { config: 0 },
        accountName: { config: 0 },
        campaignId: { config: 0 }
      }
    });
    return { __esModule: true, default: Stub };
  },
  { virtual: true }
);

jest.mock(
  "c/pipelineNewRosaDeal",
  () => {
    const { LightningElement, registerDecorators } = require("lwc");
    class Stub extends LightningElement {}
    registerDecorators(Stub, {
      publicProps: {
        accountId: { config: 0 },
        accountName: { config: 0 },
        campaignId: { config: 0 }
      }
    });
    return { __esModule: true, default: Stub };
  },
  { virtual: true }
);

// Guards the flyout for a surgeon with no deal: the surgeon's name, the Usage Card for their account, slide in and out, and close.
describe("c-pipeline-surgeon-flyout", () => {
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
  });
  function make(props = {}) {
    const el = createElement("c-pipeline-surgeon-flyout", {
      is: PipelineSurgeonFlyout
    });
    Object.assign(el, {
      accountId: "001000000000001",
      name: "Dr Test",
      ...props
    });
    document.body.appendChild(el);
    return el;
  }

  const pills = (el) =>
    [...el.shadowRoot.querySelectorAll(".fm .btn.nav")].map((b) => ({
      text: b.textContent.trim(),
      on: b.className.includes(" on")
    }));

  it("has two pills, New Deal and Surgeon Usages, and opens on Surgeon Usages unless told to start on New Deal", async () => {
    const usages = make();
    await Promise.resolve();
    expect(pills(usages)).toEqual([
      { text: "New Deal", on: false },
      { text: "Surgeon Usages", on: true }
    ]);
    expect(usages.shadowRoot.querySelector("c-pipeline-new-deal")).toBeNull();
    const fresh = make({ startScreen: "new", campaignId: "c1" });
    await Promise.resolve();
    expect(pills(fresh)[0].on).toBe(true);
    const nd = fresh.shadowRoot.querySelector("c-pipeline-new-deal");
    expect(nd.accountId).toBe("001000000000001");
    expect(nd.accountName).toBe("Dr Test");
    expect(nd.campaignId).toBe("c1");
    expect(fresh.shadowRoot.querySelector("c-pipeline-usage-card")).toBeNull();
  });

  it("for a healthcare facility has only New Deal, which is the ROSA deal screen, and passes on a deal that was made", async () => {
    const el = make({
      isFacility: true,
      startScreen: "new",
      campaignId: "c1",
      name: "Bathurst Base Hospital"
    });
    const created = jest.fn();
    el.addEventListener("dealcreated", created);
    await Promise.resolve();
    expect(pills(el)).toEqual([{ text: "New Deal", on: true }]);
    expect(el.shadowRoot.querySelector("c-pipeline-new-deal")).toBeNull();
    expect(el.shadowRoot.querySelector("c-pipeline-usage-card")).toBeNull();
    const rosa = el.shadowRoot.querySelector("c-pipeline-new-rosa-deal");
    expect(rosa.accountId).toBe("001000000000001");
    expect(rosa.accountName).toBe("Bathurst Base Hospital");
    expect(rosa.campaignId).toBe("c1");
    rosa.dispatchEvent(
      new CustomEvent("created", { detail: { id: "a02", linkError: "" } })
    );
    expect(created.mock.calls[0][0].detail.id).toBe("a02");
  });

  it("swaps between the two screens with the pills, and passes on a deal that was made", async () => {
    const el = make({ startScreen: "new", campaignId: "c1" });
    const created = jest.fn();
    el.addEventListener("dealcreated", created);
    await Promise.resolve();
    el.shadowRoot.querySelectorAll(".fm .btn.nav")[1].click();
    await Promise.resolve();
    expect(el.shadowRoot.querySelector("c-pipeline-usage-card")).not.toBeNull();
    el.shadowRoot.querySelectorAll(".fm .btn.nav")[0].click();
    await Promise.resolve();
    el.shadowRoot
      .querySelector("c-pipeline-new-deal")
      .dispatchEvent(
        new CustomEvent("created", { detail: { id: "a01", linkError: "" } })
      );
    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0].detail.id).toBe("a01");
  });

  it("shows the surgeon's name and the Usage Card for their account, embedded", async () => {
    const el = make();
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".name").textContent).toBe("Dr Test");
    const card = el.shadowRoot.querySelector("c-pipeline-usage-card");
    expect(card.recordId).toBe("001000000000001");
    expect(card.embedded).toBe(true);
    expect(el.shadowRoot.querySelector(".btn.nav.on").textContent.trim()).toBe(
      "Surgeon Usages"
    );
  });

  it("slides in only when told to open", async () => {
    const el = make();
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fly.on")).toBeNull();
    el.open = true;
    await Promise.resolve();
    expect(el.shadowRoot.querySelector(".fly.on")).not.toBeNull();
    expect(el.shadowRoot.querySelector(".scrim.on")).not.toBeNull();
  });

  it("says close from the close button and from the dimmed screen", async () => {
    const el = make({ open: true });
    const onClose = jest.fn();
    el.addEventListener("close", onClose);
    await Promise.resolve();
    el.shadowRoot.querySelector(".rbtn").click();
    el.shadowRoot.querySelector(".scrim").click();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
