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
 * `@anthropic-ai/claude-agent-sdk` typings). The six values mirror
 * the SDK's enum exactly so that the value flowing back into
 * `query({ permissionMode })` requires no translation layer.
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
 * Mirror of the SDK's `PermissionMode` union for protocol-stable strings.
 */
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
