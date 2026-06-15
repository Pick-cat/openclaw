import { describe, expect, it, vi } from "vitest";
import type { ToolDescriptor } from "../tools/types.js";
import { auditPluginToolDescriptors } from "./tool-descriptor-plan-audit.js";

function descriptor(name: string, overrides: Partial<ToolDescriptor> = {}): ToolDescriptor {
  return {
    name,
    description: `${name} description`,
    inputSchema: { type: "object" },
    owner: { kind: "plugin", pluginId: "demo" },
    executor: { kind: "plugin", pluginId: "demo", toolName: name },
    ...overrides,
  };
}

describe("auditPluginToolDescriptors", () => {
  it("warns when a descriptor has an empty availability group", () => {
    const logger = { warn: vi.fn() };
    auditPluginToolDescriptors({
      pluginId: "demo",
      descriptors: [descriptor("cron", { availability: { anyOf: [] } })],
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "[plugins] tool descriptor authoring error (demo/cron): Empty availability anyOf group",
    );
  });

  it("does not warn for available descriptors", () => {
    const logger = { warn: vi.fn() };
    auditPluginToolDescriptors({
      pluginId: "demo",
      descriptors: [descriptor("cron")],
      logger,
    });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not throw when allOf is not an array", () => {
    const logger = { warn: vi.fn() };
    expect(() =>
      auditPluginToolDescriptors({
        pluginId: "demo",
        descriptors: [descriptor("cron", { availability: { allOf: "not-array" } as never })],
        logger,
      }),
    ).not.toThrow();
  });

  it("does not throw when anyOf is not an array", () => {
    const logger = { warn: vi.fn() };
    expect(() =>
      auditPluginToolDescriptors({
        pluginId: "demo",
        descriptors: [descriptor("cron", { availability: { anyOf: "not-array" } as never })],
        logger,
      }),
    ).not.toThrow();
  });

  it("does not throw when signal is missing required fields", () => {
    const logger = { warn: vi.fn() };
    expect(() =>
      auditPluginToolDescriptors({
        pluginId: "demo",
        descriptors: [descriptor("cron", { availability: { kind: "config" } as never })],
        logger,
      }),
    ).not.toThrow();
  });
});
