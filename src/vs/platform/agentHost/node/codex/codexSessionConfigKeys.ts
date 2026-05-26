/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ApprovalMode, SandboxMode, WebSearchMode } from '@openai/codex-sdk';

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
	/**
	 * Extra directories (absolute paths) the sandbox is allowed to write
	 * to, in addition to the session's working directory. Maps to the
	 * codex SDK's `additionalDirectories` (`-c sandbox_workspace_write.writable_roots=[...]`).
	 */
	AdditionalDirectories = 'codex.additionalDirectories',
	/** Allow the sandbox to make outbound network requests. */
	NetworkAccessEnabled = 'codex.networkAccessEnabled',
	/**
	 * Web-search availability for the codex tool surface. Maps to the
	 * codex CLI's `--config web_search="<mode>"`. Three states:
	 *   - `disabled`: tool is hidden from the model.
	 *   - `cached`: tool is available but only serves cached results.
	 *   - `live`: tool is available and hits the network.
	 */
	WebSearchMode = 'codex.webSearchMode',
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

/**
 * Narrow an arbitrary runtime value to a list of absolute paths suitable
 * for the codex SDK's `additionalDirectories` (extra writable roots).
 * Filters out non-strings and empty entries; returns `undefined` when the
 * input isn't an array (so the schema default can still apply).
 */
export function narrowAdditionalDirectories(value: unknown): readonly string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const dirs = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
	return dirs;
}

/** Coerce to boolean; returns `undefined` for non-boolean values. */
export function narrowBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

/**
 * Narrow an arbitrary runtime value to the codex SDK's
 * {@link WebSearchMode} union, returning `undefined` when the value
 * doesn't match.
 */
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
