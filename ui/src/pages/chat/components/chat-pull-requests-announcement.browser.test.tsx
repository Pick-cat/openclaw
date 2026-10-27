import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountSolid } from "../../../test-helpers/mount-solid.ts";
import { flush } from "../../../test-helpers/solid-settle.ts";
import { ChatPullRequestsContent } from "./chat-pull-requests-content.tsx";
import { pullRequest } from "./chat-pull-requests.test-support.ts";

let mounted: ReturnType<typeof mountSolid> | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.body.appendChild(document.createElement("div"));
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  container.remove();
});

type Row = ReturnType<typeof pullRequest>;

const passing = { state: "passing", passed: 5, failed: 0, skipped: 1, running: 0 } as const;
const pending = { state: "pending", passed: 4, failed: 0, skipped: 0, running: 2 } as const;
const failing = { state: "failing", passed: 4, failed: 2, skipped: 0, running: 0 } as const;

const row = (number: number, checks: Row["checks"]): Row =>
  pullRequest({
    number,
    url: `https://github.com/openclaw/openclaw/pull/${number}`,
    checks,
  });

/**
 * Mounts once and drives the component through its real reactive updates. Re-mounting on each
 * "refresh" would destroy and recreate the live regions, which cannot say anything about whether a
 * poll re-announces; only an in-place update can.
 */
function mountWithRows(initial: Row[]) {
  const [rows, setRows] = createSignal(initial);
  mounted = mountSolid(
    () => <ChatPullRequestsContent pullRequests={rows()} status="ready" onDismiss={vi.fn()} />,
    { container },
  );
  flush();
  return setRows;
}

function regions(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[aria-live="polite"]'));
}

const countRegion = () => regions()[0];
const ciRegion = () => regions()[1];
const text = (node: HTMLElement | undefined) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Records every DOM mutation the browser reports inside `target`. */
async function mutationsDuring(target: Node, act: () => void): Promise<MutationRecord[]> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(target, { childList: true, characterData: true, subtree: true });
  act();
  await Promise.resolve();
  observer.disconnect();
  return records;
}

it("announces only the count, and only a real CI transition changes the payload", async () => {
  const setRows = mountWithRows([row(101, pending), row(102, pending)]);

  expect(container.querySelectorAll(".chat-prs a").length).toBeGreaterThanOrEqual(2);
  expect(text(countRegion())).toBe("2 pull requests");
  expect(text(ciRegion())).toBe("2 pull requests are still running CI");
  // Neither region carries interactive content.
  expect(countRegion()!.querySelectorAll("a, button").length).toBe(0);
  expect(ciRegion()!.querySelectorAll("a, button").length).toBe(0);

  // An identical poll: same rows, same check snapshots. Nothing may be announced.
  const countBefore = text(countRegion());
  const identical = await mutationsDuring(countRegion()!, () => {
    setRows([row(101, pending), row(102, pending)]);
    flush();
  });
  expect(identical).toEqual([]);
  expect(text(countRegion())).toBe(countBefore);

  // A real transition (pending -> failing) is worth exactly one announcement, and it is the CI
  // region that carries it; the count did not change, so that region stays untouched.
  const transition = await mutationsDuring(countRegion()!, () => {
    setRows([row(101, failing), row(102, failing)]);
    flush();
  });
  expect(transition).toEqual([]);
  expect(text(countRegion())).toBe("2 pull requests");
  expect(text(ciRegion())).toBe("2 pull requests have failing CI");

  // Completion must be announced, not produced by clearing the region: failing -> passing.
  await mutationsDuring(ciRegion()!, () => {
    setRows([row(101, passing), row(102, passing)]);
    flush();
  });
  expect(text(ciRegion())).toBe("CI passed for 2 pull requests");
});

it("announces CI completion when a pending row settles", async () => {
  const setRows = mountWithRows([row(101, pending)]);
  expect(text(ciRegion())).toBe("1 pull request is still running CI");

  const announced: string[] = [];
  const observer = new MutationObserver(() => announced.push(text(ciRegion())));
  observer.observe(ciRegion()!, { childList: true, characterData: true, subtree: true });

  setRows([row(101, passing)]);
  flush();
  await Promise.resolve();
  observer.disconnect();

  // The region changed rather than emptying, so the completion is announced once.
  expect(announced.length).toBeGreaterThan(0);
  expect(text(ciRegion())).toBe("CI passed for 1 pull request");
  expect(text(countRegion())).toBe("1 pull request");
});

it("updates the announced count in place when the row count changes", async () => {
  const setRows = mountWithRows([row(101, passing), row(102, passing)]);
  const live = countRegion()!;
  expect(text(live)).toBe("2 pull requests");
  // All checks settled, so the region carries the completion summary rather than going empty.
  expect(text(ciRegion())).toBe("CI passed for 2 pull requests");

  const records = await mutationsDuring(live, () => {
    setRows([row(101, passing)]);
    flush();
  });

  expect(records.length).toBeGreaterThan(0);
  expect(countRegion()).toBe(live);
  expect(text(live)).toBe("1 pull request");
});
