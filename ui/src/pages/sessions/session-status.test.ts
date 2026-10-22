/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  disposeSessionViews,
  renderSessionsView,
  buildProps,
  buildResult,
} from "./view.test-support.tsx";

afterEach(disposeSessionViews);

describe("session status badge accessibility", () => {
  it("exposes the status badge to keyboard users", async () => {
    const container = document.createElement("div");
    renderSessionsView(
      {
        ...buildProps(
          buildResult({
            key: "agent:main:status",
            kind: "direct",
            updatedAt: 20,
            hasActiveRun: true,
            status: "running",
          }),
        ),
        expandedSessionKey: "agent:main:status",
      },
      container,
    );
    await Promise.resolve();
    document.body.append(container);
    try {
      const badge = container.querySelector(".session-details-panel__badges .settings-status");
      expect(badge?.textContent?.replace(/\s+/g, " ").trim()).toBe("Live");

      // Without a focusable trigger the tooltip cannot be opened from the
      // keyboard, and the badge alone exposes just the bare label word.
      const wrapper = badge?.closest<HTMLElement>('[tabindex="0"]');
      expect(wrapper?.getAttribute("tabindex")).toBe("0");
      expect(wrapper?.getAttribute("aria-label")).toBe("Status: Live");

      const tooltip = wrapper?.parentElement as (HTMLElement & { content: string }) | null;
      expect(tooltip?.content).toBe("Status: Live");

      // Focus must land on the wrapper, not fall through to the pill.
      wrapper!.focus();
      expect(document.activeElement).toBe(wrapper);
    } finally {
      container.remove();
    }
  });
});
