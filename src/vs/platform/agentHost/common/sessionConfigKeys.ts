/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Well-known keys used in the agent-host configuration value bag.
 *
 * The Agent Host Protocol's config schema is intentionally generic — agents
 * are free to advertise any property names. These constants capture the
 * names that the platform itself consumes (e.g. {@link SessionConfigKey.AutoApprove}
 * drives tool auto-approval) or that clients interpret via convention
 * (e.g. {@link SessionConfigKey.Branch}, {@link SessionConfigKey.Isolation}).
 *
 * Provider-owned platform properties use these names in an agent's
 * `resolveSessionConfig` response. Worktree properties are owned and
 * contributed by the host and are not passed to agents.
 */
export const enum SessionConfigKey {
	/** `'autoApprove'` — tool auto-approval level. */
	AutoApprove = 'autoApprove',
	/** `'permissions'` — per-tool session allow/deny lists. */
	Permissions = 'permissions',
	/** `'isolation'` — host-owned `'folder'` or `'worktree'` selection. */
	Isolation = 'isolation',
	/** `'branch'` — host-owned base branch to work from. */
	Branch = 'branch',
	/** `'mode'` — agent execution mode (interactive / plan / autopilot). */
	Mode = 'mode',
	/** `'worktreeBranchPrefix'` — host-owned prefix for the worktree branch name. */
	WorktreeBranchPrefix = 'worktreeBranchPrefix',
	/** `'worktreeIncludeFiles'` — host-owned glob patterns for files copied into a new worktree. */
	WorktreeIncludeFiles = 'worktreeIncludeFiles',
}

/**
 * The set of enum values the unified permission picker *tolerates* for the
 * {@link SessionConfigKey.AutoApprove} property when deciding whether a
 * session's schema is "well-known" (and therefore handled by the dedicated
 * permission picker rather than the generic per-property fallback).
 *
 * `default` is the required baseline level; `assisted` and `autoApprove` are
 * offered elevated levels. `autopilot` is retained for backward compatibility
 * with sessions created before it moved onto the mode axis.
 */
export const KNOWN_AUTO_APPROVE_VALUES: ReadonlySet<string> = new Set(['default', 'assisted', 'autoApprove', 'autopilot']);

/**
 * The set of enum values understood for the {@link SessionConfigKey.Mode}
 * property: the agent execution mode axis.
 */
export const KNOWN_MODE_VALUES: ReadonlySet<string> = new Set(['interactive', 'plan', 'autopilot']);
