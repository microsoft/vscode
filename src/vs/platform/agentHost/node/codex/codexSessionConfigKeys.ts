/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReasoningEffort } from './protocol/generated/ReasoningEffort.js';
import type { ReasoningSummary } from './protocol/generated/ReasoningSummary.js';
import type { Personality } from './protocol/generated/Personality.js';
import type { WebSearchMode } from './protocol/generated/WebSearchMode.js';
import type { ModeKind } from './protocol/generated/ModeKind.js';
import type { SandboxMode } from './protocol/generated/v2/SandboxMode.js';
import { CodexSessionConfigKey, CODEX_DEFAULT_PERMISSIONS_PRESET, narrowCodexPermissionsPreset, presetForResolvedPermissions, resolveCodexPermissionsPreset, type CodexApprovalPolicy, type ICodexResolvedPermissions } from '../../common/codexSessionConfigKeys.js';

// Re-export the shared, protocol-free config-key surface so node callers can
// keep importing everything from this module.
export { CodexSessionConfigKey, resolveCodexPermissionsPreset, presetForResolvedPermissions, narrowCodexPermissionsPreset, CODEX_PERMISSIONS_PRESETS, CODEX_DEFAULT_PERMISSIONS_PRESET } from '../../common/codexSessionConfigKeys.js';
export type { CodexApprovalPolicy, CodexPermissionsPreset, CodexSandboxMode, CodexApprovalsReviewer, ICodexResolvedPermissions } from '../../common/codexSessionConfigKeys.js';

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

export function narrowSandboxMode(value: unknown): SandboxMode | undefined {
	switch (value) {
		case 'read-only':
		case 'workspace-write':
		case 'danger-full-access':
			return value;
		default:
			return undefined;
	}
}

/**
 * Resolve the Codex security axes (approval policy, sandbox, approvals
 * reviewer) for a session's stored config values.
 *
 * The user-facing {@link CodexSessionConfigKey.PermissionsPreset} is the source
 * of truth; when present it expands into all three axes. For backward
 * compatibility (older sessions / programmatic config) we fall back to the
 * individual {@link CodexSessionConfigKey.ApprovalPolicy} /
 * {@link CodexSessionConfigKey.SandboxMode} keys with a `user` reviewer.
 */
export function resolveCodexPermissions(
	values: Record<string, unknown> | undefined,
	defaults: { approvalPolicy: CodexApprovalPolicy; sandboxMode: SandboxMode },
): ICodexResolvedPermissions {
	const preset = narrowCodexPermissionsPreset(values?.[CodexSessionConfigKey.PermissionsPreset]);
	if (preset) {
		return resolveCodexPermissionsPreset(preset);
	}
	return {
		approvalPolicy: narrowApprovalPolicy(values?.[CodexSessionConfigKey.ApprovalPolicy]) ?? defaults.approvalPolicy,
		sandboxMode: narrowSandboxMode(values?.[CodexSessionConfigKey.SandboxMode]) ?? defaults.sandboxMode,
		approvalsReviewer: 'user',
	};
}

/**
 * Decide how a restored session's three permission keys (`permissionsPreset`,
 * `approvalPolicy`, `sandboxMode`) should be represented, given its raw
 * persisted config values.
 *
 * This exists to prevent a silent privilege escalation on restore: a legacy
 * session that persisted only the individual axes (for example
 * `sandboxMode = 'read-only'`) and never chose a preset must not have a
 * materialized `permissionsPreset = 'default'` inserted on top of it, because
 * {@link resolveCodexPermissions} checks the preset first and would resume the
 * session as `workspace-write`.
 *
 * The returned object contains ONLY the permission keys that should be present
 * afterwards, so callers should drop all three permission keys before applying
 * it:
 * - an explicitly chosen preset is kept as-is;
 * - legacy axes that map exactly onto a preset are migrated to that preset
 *   (single source of truth) and the raw axes dropped;
 * - legacy axes with a `workspace-write` or `danger-full-access` sandbox that
 *   do NOT map exactly onto a preset are snapped to the preset whose sandbox
 *   matches (`default` / `full-access`). This keeps the resolved axes in sync
 *   with the preset the "Approvals" chip displays, so a legacy
 *   `approvalPolicy = 'never'` + `workspace-write` session resolves to the
 *   `default` preset's `on-request` policy (and actually prompts) instead of
 *   silently running without approval while the chip claims "Default
 *   Permissions". Snapping never grants more sandbox access than the legacy
 *   value already had;
 * - legacy axes with a `read-only` sandbox (which no preset expands to, and
 *   which is more locked-down than any preset) are preserved verbatim and no
 *   preset is surfaced, so restore never silently escalates them to
 *   `workspace-write`.
 */
export function migrateCodexPermissionValues(
	config: Record<string, unknown> | undefined,
	defaults: { approvalPolicy: CodexApprovalPolicy; sandboxMode: SandboxMode },
): Record<string, string> {
	const explicitPreset = narrowCodexPermissionsPreset(config?.[CodexSessionConfigKey.PermissionsPreset]);
	if (explicitPreset) {
		return { [CodexSessionConfigKey.PermissionsPreset]: explicitPreset };
	}
	const resolved = resolveCodexPermissions(config, defaults);
	const equivalentPreset = presetForResolvedPermissions(resolved);
	if (equivalentPreset) {
		return { [CodexSessionConfigKey.PermissionsPreset]: equivalentPreset };
	}
	// `read-only` is more locked-down than any preset's sandbox and cannot be
	// represented by one, so preserve the raw axes — surfacing a preset here
	// would silently escalate the session to `workspace-write` on restore.
	if (resolved.sandboxMode === 'read-only') {
		return {
			[CodexSessionConfigKey.ApprovalPolicy]: resolved.approvalPolicy,
			[CodexSessionConfigKey.SandboxMode]: resolved.sandboxMode,
		};
	}
	// Otherwise snap onto the preset whose sandbox matches so the displayed chip
	// and the resolved axes stay consistent (`danger-full-access` → Full Access,
	// any other non-exact `workspace-write` combo → Default Permissions).
	return {
		[CodexSessionConfigKey.PermissionsPreset]: resolved.sandboxMode === 'danger-full-access'
			? 'full-access'
			: CODEX_DEFAULT_PERMISSIONS_PRESET,
	};
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

export function narrowWebSearchMode(value: unknown): WebSearchMode | undefined {
	switch (value) {
		case 'disabled':
		case 'cached':
		case 'live':
			return value;
		default:
			return undefined;
	}
}

export function narrowReasoningEffort(value: unknown): ReasoningEffort | undefined {
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

export function narrowPersonality(value: unknown): Personality | undefined {
	switch (value) {
		case 'none':
		case 'friendly':
		case 'pragmatic':
			return value;
		default:
			return undefined;
	}
}

export function narrowReasoningSummary(value: unknown): ReasoningSummary | undefined {
	switch (value) {
		case 'auto':
		case 'concise':
		case 'detailed':
		case 'none':
			return value;
		default:
			return undefined;
	}
}

/**
 * Map the platform-generic {@link SessionMode} (Agent Mode) to codex's native
 * collaboration {@link ModeKind}: VS Code "Plan" → codex `plan`, "Interactive"
 * → codex `default`.
 */
export function collaborationModeKind(value: unknown): ModeKind {
	return value === 'plan' ? 'plan' : 'default';
}
