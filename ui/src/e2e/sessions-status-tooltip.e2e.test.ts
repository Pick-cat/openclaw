// A session's run state renders as a dot plus a short word; the tooltip and
// the accessible name carry the "Status: <label>" form. Keyboard and
// screen-reader users only get that form through the focusable wrapper.
import { expect, it } from "vitest";
import { installMockGateway } from "../test-helpers/control-ui-e2e.ts";
import { createControlUiE2eSuite } from "./control-ui-e2e-suite.test-support.ts";
import { captureUiProof } from "./session-management.test-support.ts";

const suite = createControlUiE2eSuite({
  name: "Control UI sessions status tooltip mocked Gateway E2E",
  startServerBeforeBrowser: true,
  unavailableMessage: (executablePath) =>
    `Playwright Chromium is not installed or cannot start at ${executablePath}. Run \`pnpm --dir ui exec playwright install --with-deps chromium\`, or set OPENCLAW_UI_E2E_ALLOW_MISSING_CHROMIUM=1 only when intentionally skipping this lane.`,
});

suite.define(() => {
  it("reaches the session status tooltip from the keyboard", async () => {
    await suite.withPage(
      {
        locale: "en-US",
        serviceWorkers: "block",
        viewport: { height: 900, width: 1440 },
      },
      async ({ page }) => {
        await installMockGateway(page, {
          methodResponses: {
            "agents.list": {
              defaultId: "main",
              mainKey: "main",
              scope: "per-sender",
              agents: [{ id: "main" }],
            },
            "sessions.list": {
              count: 1,
              defaults: { contextTokens: null, model: null, modelProvider: null },
              path: "",
              sessions: [
                { key: "agent:main:failed-run", kind: "direct", status: "failed", updatedAt: 1 },
              ],
              ts: 1,
            },
          },
        });

        await page.goto(`${suite.server.baseUrl}sessions`);
        await page
          .locator(".session-status-stack .settings-status")
          .first()
          .waitFor({ timeout: 10_000 });

        // Capture before asserting, so a pre-fix run still leaves its own proof.
        // Tab from the page start rather than hovering: a pointer tooltip fires
        // regardless of focus and would blur the very difference under test.
        await page.keyboard.press("Tab");
        const tabTrace: string[] = [];
        for (let step = 0; step < 120; step += 1) {
          tabTrace.push(
            await page.evaluate(() => {
              const active = document.activeElement as HTMLElement | null;
              if (!active) {
                return "none";
              }
              const label = active.getAttribute("aria-label");
              return `${active.tagName.toLowerCase()}${label ? `[${label}]` : ""}`;
            }),
          );
          await page.keyboard.press("Tab");
        }
        const reachedByTab = tabTrace.some((entry) => entry.includes("Status: Failed"));
        // The walk above proves reachability; it leaves focus far from the badge,
        // so put it back on the trigger for a readable proof frame. A pre-fix run
        // has no such element and captures its unrendered-tooltip state instead.
        await page.evaluate(() => {
          const target = document.querySelector(
            ".session-status-stack > openclaw-tooltip > span[aria-label='Status: Failed']",
          );
          if (target instanceof HTMLElement) {
            target.focus();
          }
        });
        // Wait for the tooltip itself so the proof frame shows the described-by
        // text, not just a focus ring on a word the reader cannot interpret.
        await page
          .locator("openclaw-tooltip[open] .tooltip-content")
          .first()
          .waitFor({ timeout: 3_000 })
          .catch(() => {});
        await page.waitForTimeout(300);
        await captureUiProof(
          suite,
          page,
          `sessions-status-tooltip-${process.env.OPENCLAW_STATUS_TOOLTIP_PROOF ?? "after"}.png`,
        );
        // A tooltip that only a pointer can summon leaves the state unnamed for
        // keyboard and screen-reader users; the walk must reach the trigger.
        expect(reachedByTab).toBe(true);

        const wrapper = page.locator(
          ".session-status-stack > openclaw-tooltip > span[aria-label='Status: Failed']",
        );
        // The visible word alone does not name the state; the wrapper does.
        expect(await wrapper.evaluate((element) => element.getAttribute("tabindex"))).toBe("0");

        await wrapper.focus();
        await expect
          .poll(() => wrapper.evaluate((element) => element === document.activeElement))
          .toBe(true);
        await expect
          .poll(() =>
            page.locator(`openclaw-tooltip:has(.settings-status--danger)`).getAttribute("open"),
          )
          .toBe("");
        await expect
          .poll(() =>
            page
              .locator(`openclaw-tooltip:has(.settings-status--danger) .tooltip-content`)
              .textContent(),
          )
          .toContain("Status: Failed");
      },
    );
  });
});
