/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Well-known session-config keys advertised by the agent-host Claude
 * provider in its `resolveSessionConfig` schema.
 *
 * Claude collapses the platform's two-axis approval model
 * (`autoApprove` × `mode`) onto a single `permissionMode` axis matching
 * the Claude SDK's native `PermissionMode` (see
 * `@anthropic-ai/claude-agent-sdk` typings, `sdk.d.ts:1560`). The five
 * values mirror the SDK enum values that VS Code exposes, excluding
 * `dontAsk`, so that the value flowing back into `query({ permissionMode })`
 * requires no translation layer.
 *
 * The platform `Permissions` key (allow/deny tool lists) is reused
 * unchanged from `platformSessionSchema` because the Claude SDK accepts
 * `allowedTools` / `disallowedTools` natively.
 */
export const enum ClaudeSessionConfigKey {
	/** `'permissionMode'` — Claude SDK approval mode. */
	PermissionMode = 'permissionMode',
}

/**
 * Permission-mode values advertised in the Claude session-config schema.
 */
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'auto';

/**
 * Single source of truth for narrowing an arbitrary runtime value to the
 * closed {@link ClaudePermissionMode} union. Returns `undefined` for
 * non-strings or unmatched strings; callers apply their own fallback.
 */
export function narrowClaudePermissionMode(raw: unknown): ClaudePermissionMode | undefined {
	switch (raw) {
		case 'default':
		case 'acceptEdits':
		case 'bypassPermissions':
		case 'plan':
		case 'auto':
			return raw;
		default:
			return undefined;
	}
}
