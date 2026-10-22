import { expect as expectBrowser } from "playwright/test";
import { it } from "vitest";
import {
  captureUiProof,
  createChatFlowE2eSuite,
  installMockGateway,
} from "./chat-flow.test-support.ts";

const suite = createChatFlowE2eSuite();
suite.define(() => {
  it("reaches the session status badge by keyboard", async () => {
    await suite.withPage({ viewport: { width: 1280, height: 800 } }, async ({ page }) => {
      await installMockGateway(page, {
        sessionKey: "agent:main:status",
        methodResponses: {
          "sessions.list": {
            count: 1,
            defaults: { contextTokens: null, model: null, modelProvider: null },
            path: "",
            sessions: [
              {
                key: "agent:main:status",
                kind: "direct",
                label: "Keyboard walk",
                updatedAt: 6,
                hasActiveRun: true,
                status: "running",
              },
            ],
            ts: 10,
          },
        },
      });
      await page.goto(`${suite.server.baseUrl}sessions`);

      // Status badges live in the expanded session details, so open them first.
      const toggle = page.locator(".session-details-toggle").first();
      await expectBrowser(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expectBrowser(toggle).toHaveAttribute("aria-expanded", "true");
      const badges = page.locator(".session-details-panel__badges");
      await expectBrowser(badges).toBeVisible();

      // Walk the real tab order rather than focusing the badge directly: the
      // defect is that the badge never joins that order.
      const trace: string[] = [];
      await page.locator("body").click();
      let reachedBadge = false;
      for (let press = 0; press < 120; press += 1) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) {
            return null;
          }
          const label = el.getAttribute("aria-label") ?? "";
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          return {
            tag: el.tagName,
            label: label || text,
            isStatus: label.startsWith("Status: "),
          };
        });
        if (!focused) {
          break;
        }
        trace.push(`${focused.tag}:${focused.label}`);
        if (focused.isStatus) {
          reachedBadge = true;
          break;
        }
      }

      // Capture the walk result before asserting, so a failing run still leaves
      // proof of where focus ended up.
      await captureUiProof(suite, page, "status-badge-keyboard", "walk-end.png");

      expectBrowser(reachedBadge, `tab trace: ${trace.join(" | ")}`).toBe(true);
      const statusTrigger = badges.locator('[aria-label^="Status: "]');
      await expectBrowser(statusTrigger).toHaveCount(1);
      await expectBrowser(statusTrigger).toBeFocused();
      await expectBrowser(statusTrigger).toHaveAttribute("aria-label", "Status: Live");
      await expectBrowser(statusTrigger).toHaveAttribute("tabindex", "0");

      // Focus alone must open the tooltip, not just move the focus ring.
      await expectBrowser(page.locator("openclaw-tooltip[open]")).toHaveCount(1);
      await expectBrowser(page.locator("openclaw-tooltip[open] .tooltip-content")).toContainText(
        "Status: Live",
      );

      // Engine-independent accessibility check: what a screen reader would
      // announce, read back from the live accessibility attributes rather than
      // inferred from markup.
      const surface = await statusTrigger.evaluate((element) => {
        const describedBy = element.getAttribute("aria-describedby");
        return {
          label: element.getAttribute("aria-label") ?? "",
          description: describedBy
            ? (document.getElementById(describedBy)?.textContent ?? "").trim()
            : "",
          tabIndex: (element as HTMLElement).tabIndex,
        };
      });
      expectBrowser(surface.tabIndex).toBe(0);
      expectBrowser(surface.label).toBe("Status: Live");
      // The tooltip owner reuses the same text as the description, so the badge
      // announces its status once whether the reader uses either attribute.
      expectBrowser(surface.description).toBe("Status: Live");

      await captureUiProof(suite, page, "status-badge-keyboard", "focused.png");
    });
  });
});
