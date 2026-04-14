# Copilot CLI External Provider Model Selection (Proposal)

## Summary
This proposal introduces an opt-in, flagged path for exposing externally provided models in Copilot CLI model selection, while preserving existing default behavior.

## Problem
Copilot CLI users currently have limited model selection paths and cannot explicitly opt into external provider-backed models in a structured, supportable way. This restricts experimentation and enterprise scenarios where externally managed model endpoints are required.

## Proposed API + Flag
- Add a gated setting/flag for Copilot CLI model selection:
  - CLI/runtime flag: `--enable-external-provider-models`
  - Product gate: feature flag `copilot.cli.externalProviderModels`
- Proposed API surface (draft):
  - `copilotCli.listAvailableModels({ includeExternal?: boolean })`
  - `copilotCli.selectModel(modelId: string, { source?: 'copilot' | 'external' })`
- Default behavior remains unchanged unless explicit opt-in is enabled.

## Gates
- Feature flag disabled by default.
- Optional trust/consent prompt before first external provider use.
- Telemetry and logging guarded by existing privacy and policy controls.
- Fallback to existing model list if external provider resolution fails.

## Acceptance Criteria
- No behavior change when flags are disabled.
- External provider models appear only when opt-in gate is enabled.
- Model selection clearly indicates provider/source.
- Failure paths degrade gracefully to current behavior.
- Documentation includes setup, risk notes, and rollback instructions.

## Non-Goals
- No implementation in this PR.
- No change to default Copilot CLI model selection UX.
- No commitment to a specific external provider protocol in this draft.

## Maintainer Approval
This PR is proposal-only and is **awaiting maintainer approval before implementation**.
