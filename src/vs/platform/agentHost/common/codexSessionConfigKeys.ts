/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';

/**
 * Well-known session-config keys advertised by the agent-host Codex provider
 * in its `resolveSessionConfig` schema.
 *
 * Shared with browser pickers. Native permission resolution and protocol-typed
 * narrowing helpers live in `node/codex/codexSessionConfigKeys.ts`.
 */
export const enum CodexSessionConfigKey {
	PermissionsPreset = 'codex.permissionsPreset',
	ApprovalPolicy = 'codex.approvalPolicy',
	SandboxMode = 'codex.sandboxMode',
	AdditionalDirectories = 'codex.additionalDirectories',
	NetworkAccessEnabled = 'codex.networkAccessEnabled',
	WebSearchMode = 'codex.webSearchMode',
	ModelReasoningEffort = 'codex.modelReasoningEffort',
	Personality = 'codex.personality',
	ReasoningSummary = 'codex.reasoningSummary',
}

/**
 * Codex collapses its three security axes (sandbox × approval policy ×
 * approvals reviewer) into a single user-facing "permissions" preset, matching
 * the selector in the Codex app and IDE extension.
 *
 * @see https://developers.openai.com/codex/concepts/sandboxing#how-you-control-it
 */
export type CodexPermissionsPreset = 'default' | 'auto-review' | 'full-access';

/** Ordered preset list advertised in the Codex session-config schema. */
export const CODEX_PERMISSIONS_PRESETS: readonly CodexPermissionsPreset[] = ['default', 'auto-review', 'full-access'];

export const CODEX_PERMISSIONS_PRESET_LABELS: Readonly<Record<CodexPermissionsPreset, string>> = {
	default: localize('codex.sessionConfig.permissionsPreset.default', "Default Permissions"),
	'auto-review': localize('codex.sessionConfig.permissionsPreset.autoReview', "Auto-Review"),
	'full-access': localize('codex.sessionConfig.permissionsPreset.fullAccess', "Full Access"),
};

/** Default preset applied to new Codex sessions. */
export const CODEX_DEFAULT_PERMISSIONS_PRESET: CodexPermissionsPreset = 'default';

/** Returns Codex's provider-native configuration for unattended Agent Merge turns. */
export function getCodexAutonomousSessionConfig(policyRestricted: boolean): Record<string, unknown> | undefined {
	return policyRestricted ? undefined : { [CodexSessionConfigKey.PermissionsPreset]: 'auto-review' satisfies CodexPermissionsPreset };
}

/**
 * Single source of truth for narrowing an arbitrary runtime value to the
 * closed {@link CodexPermissionsPreset} union. Returns `undefined` for
 * non-strings or unmatched strings; callers apply their own fallback.
 */
export function narrowCodexPermissionsPreset(raw: unknown): CodexPermissionsPreset | undefined {
	switch (raw) {
		case 'default':
		case 'auto-review':
		case 'full-access':
			return raw;
		default:
			return undefined;
	}
}
