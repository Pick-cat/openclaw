/** Resolves model fallback chains for isolated cron runs and preflight. */
import { resolveAgentConfig } from "../../agents/agent-scope-config.js";
import { resolveModelCandidateChain } from "../../agents/model-fallback.js";
import type { ModelCandidate } from "../../agents/model-fallback.types.js";
import {
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
} from "../../config/model-input.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import type { CronJob } from "../types.js";
import {
  resolveEffectiveModelFallbacks,
  resolveSubagentModelFallbacksOverride,
} from "./run-execution.runtime.js";

/** Resolves cron model fallbacks, giving explicit payload fallbacks precedence over subagent/default policy. */
export function resolveCronFallbacksOverride(params: {
  cfg: OpenClawConfig;
  job: CronJob;
  agentId: string;
  useSubagentFallbacks?: boolean;
}): string[] | undefined {
  const payload = params.job.payload.kind === "agentTurn" ? params.job.payload : undefined;
  const payloadFallbacks = Array.isArray(payload?.fallbacks) ? payload.fallbacks : undefined;
  const hasCronPayloadModelOverride =
    typeof payload?.model === "string" && payload.model.trim().length > 0;
  if (payloadFallbacks !== undefined) {
    return payloadFallbacks;
  }
  if (params.useSubagentFallbacks === true && !hasCronPayloadModelOverride) {
    // A payload model override owns its full candidate chain; otherwise the
    // selected subagent can contribute its configured fallback policy.
    const subagentFallbacksOverride = resolveSubagentModelFallbacksOverride(
      params.cfg,
      params.agentId,
    );
    if (subagentFallbacksOverride !== undefined) {
      return subagentFallbacksOverride;
    }
  }
  const effectiveFallbacks = resolveEffectiveModelFallbacks({
    cfg: params.cfg,
    agentId: params.agentId,
    hasSessionModelOverride: hasCronPayloadModelOverride,
    modelOverrideSource: hasCronPayloadModelOverride ? "auto" : undefined,
  });
  if (!hasCronPayloadModelOverride && effectiveFallbacks?.length === 0) {
    const agentModel = resolveAgentConfig(params.cfg, params.agentId)?.model;
    const agentPrimary =
      typeof agentModel === "string" && agentModel.trim().length > 0 ? agentModel.trim() : null;
    const defaultPrimary = resolveAgentModelPrimaryValue(params.cfg.agents?.defaults?.model);
    const hasDefaultFallbacks =
      resolveAgentModelFallbackValues(params.cfg.agents?.defaults?.model).length > 0;
    if (agentPrimary && agentPrimary === defaultPrimary?.trim() && hasDefaultFallbacks) {
      return undefined;
    }
  }
  return effectiveFallbacks;
}

/** Builds the ordered model candidates used by cron preflight checks. */
export function resolveCronPreflightCandidates(params: {
  cfg: OpenClawConfig;
  fallbackPolicyCfg?: OpenClawConfig;
  job: CronJob;
  agentId: string;
  provider: string;
  model: string;
  useSubagentFallbacks?: boolean;
}): ModelCandidate[] {
  const fallbacksOverride = resolveCronFallbacksOverride({
    cfg: params.fallbackPolicyCfg ?? params.cfg,
    job: params.job,
    agentId: params.agentId,
    useSubagentFallbacks: params.useSubagentFallbacks,
  });
  return resolveModelCandidateChain({
    cfg: params.cfg,
    provider: params.provider,
    model: params.model,
    fallbacksOverride,
  });
}
