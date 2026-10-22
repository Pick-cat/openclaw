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
  it.each([
    { status: "running" as const, hasActiveRun: true, label: "Live" },
    { status: "failed" as const, hasActiveRun: false, label: "Failed" },
    { status: "queued" as const, hasActiveRun: false, label: "Queued" },
  ])(
    "exposes the $label status badge to keyboard users",
    async ({ status, hasActiveRun, label }) => {
      const container = document.createElement("div");
      renderSessionsView(
        {
          ...buildProps(
            buildResult({
              key: "agent:main:status",
              kind: "direct",
              updatedAt: 20,
              hasActiveRun,
              status,
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
        expect(badge?.textContent?.replace(/\s+/g, " ").trim()).toBe(label);

        // Without a focusable trigger the tooltip cannot be opened from the
        // keyboard, and the badge alone exposes just the bare label word.
        const wrapper = badge?.closest<HTMLElement>('[tabindex="0"]');
        expect(wrapper?.getAttribute("tabindex")).toBe("0");
        expect(wrapper?.getAttribute("aria-label")).toBe(`Status: ${label}`);

        const tooltip = wrapper?.parentElement as (HTMLElement & { content: string }) | null;
        expect(tooltip?.content).toBe(`Status: ${label}`);

        // Focus must land on the wrapper, not fall through to the pill.
        wrapper!.focus();
        expect(document.activeElement).toBe(wrapper);
      } finally {
        container.remove();
      }
    },
  );
});
