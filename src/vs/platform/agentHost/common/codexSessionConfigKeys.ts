/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Well-known session-config keys advertised by the agent-host Codex
 * provider in its `resolveSessionConfig` schema.
 *
 * Codex exposes its native two-axis safety model directly:
 * `codex.sandboxMode` controls filesystem/network access and
 * `codex.approvalPolicy` controls when the CLI asks the user before
 * escalating. Both keys are also consumed by browser-layer pickers
 * (`AgentHostCodexSandboxPicker`, `AgentHostCodexApprovalPolicyPicker`),
 * which is why this enum lives in `common/` rather than alongside the
 * node-only Codex agent.
 */
export const enum CodexSessionConfigKey {
	ApprovalPolicy = 'codex.approvalPolicy',
	SandboxMode = 'codex.sandboxMode',
	AdditionalDirectories = 'codex.additionalDirectories',
	NetworkAccessEnabled = 'codex.networkAccessEnabled',
	WebSearchMode = 'codex.webSearchMode',
	ModelReasoningEffort = 'codex.modelReasoningEffort',
}

/**
 * String values advertised by Codex for `codex.approvalPolicy`.
 * Subset of the Codex protocol's `AskForApproval` union (the protocol
 * additionally allows a granular variant the VS Code UI does not expose).
 */
export type CodexApprovalPolicy = 'never' | 'on-request' | 'on-failure' | 'untrusted';

/**
 * String values advertised by Codex for `codex.sandboxMode`.
 * Mirrors the Codex protocol's `SandboxMode` union exactly.
 */
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

/**
 * String values advertised by Codex for `codex.webSearchMode`.
 * Mirrors the Codex protocol's `WebSearchMode` union exactly.
 */
export type CodexWebSearchMode = 'disabled' | 'cached' | 'live';

/**
 * String values advertised by Codex for `codex.modelReasoningEffort`.
 * Mirrors the Codex protocol's `ReasoningEffort` union exactly.
 */
export type CodexReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export function isCodexSupportedModel(id: string, name?: string): boolean {
	if (id.toLowerCase() === 'auto') {
		return false;
	}
	return /^(gpt-5|codex)/i.test(id) || /codex/i.test(name ?? '');
}

export function normalizeCodexModelId(id: string): string | undefined {
	if (isCodexSupportedModel(id)) {
		return id;
	}
	const slashIndex = id.lastIndexOf('/');
	if (slashIndex === -1 || slashIndex === id.length - 1) {
		return undefined;
	}
	const rawId = id.substring(slashIndex + 1);
	return isCodexSupportedModel(rawId) ? rawId : undefined;
}

export function narrowApprovalPolicy(value: unknown): CodexApprovalPolicy | undefined {
	switch (value) {
		case 'never':
		case 'on-request':
		case 'on-failure':
		case 'untrusted':
			return value;
		default:
			return undefined;
	}
}

export function narrowSandboxMode(value: unknown): CodexSandboxMode | undefined {
	switch (value) {
		case 'read-only':
		case 'workspace-write':
		case 'danger-full-access':
			return value;
		default:
			return undefined;
	}
}

export function narrowAdditionalDirectories(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function narrowBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

export function narrowWebSearchMode(value: unknown): CodexWebSearchMode | undefined {
	switch (value) {
		case 'disabled':
		case 'cached':
		case 'live':
			return value;
		default:
			return undefined;
	}
}

export function narrowReasoningEffort(value: unknown): CodexReasoningEffort | undefined {
	switch (value) {
		case 'none':
		case 'minimal':
		case 'low':
		case 'medium':
		case 'high':
		case 'xhigh':
			return value;
		default:
			return undefined;
	}
}
