/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ApprovalMode, SandboxMode } from '@openai/codex-sdk';

/**
 * Per-session config keys specific to the Codex agent. Sit alongside
 * the platform-shared keys in `sessionConfigKeys.ts`.
 *
 * Naming mirrors the `ClaudeSessionConfigKey` pattern: each key is the
 * string that surfaces on the wire in `IAgentCreateSessionConfig.config`
 * and on `resolveSessionConfig.values`. Both the agent and any future
 * client-side UI (pickers, command palette) key off these constants.
 */
export const enum CodexSessionConfigKey {
	/** Maps to the codex CLI `--config approval_policy=...`. */
	ApprovalPolicy = 'codex.approvalPolicy',
	/** Maps to the codex CLI `--sandbox` flag. */
	SandboxMode = 'codex.sandboxMode',
}

/**
 * Narrow an arbitrary runtime value to the codex SDK's
 * {@link ApprovalMode} union, returning `undefined` when the value
 * doesn't match. Used by both the agent (to forward into
 * `Codex.startThread`) and the schema validator (defense-in-depth).
 */
export function narrowApprovalPolicy(value: unknown): ApprovalMode | undefined {
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

/**
 * Narrow an arbitrary runtime value to the codex SDK's
 * {@link SandboxMode} union, returning `undefined` when the value
 * doesn't match.
 */
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
