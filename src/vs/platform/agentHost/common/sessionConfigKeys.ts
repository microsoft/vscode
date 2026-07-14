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
 * Agents that opt into the corresponding behavior should use these exact
 * property names in their `resolveSessionConfig` response.
 */
export const enum SessionConfigKey {
	/** `'autoApprove'` — tool auto-approval level. */
	AutoApprove = 'autoApprove',
	/** `'permissions'` — per-tool session allow/deny lists. */
	Permissions = 'permissions',
	/** `'isolation'` — `'folder'` or `'worktree'`. */
	Isolation = 'isolation',
	/** `'branch'` — base branch to work from. */
	Branch = 'branch',
	/** `'mode'` — agent execution mode (interactive / plan / autopilot). */
	Mode = 'mode',
	/** `'worktreeBranchPrefix'` — prefix for the worktree branch name. */
	WorktreeBranchPrefix = 'worktreeBranchPrefix',
	/** `'worktreeIncludeFiles'` — glob patterns for git-ignored files to copy into a new worktree. */
	WorktreeIncludeFiles = 'worktreeIncludeFiles',
}

/**
 * The set of enum values the unified permission picker *tolerates* for the
 * {@link SessionConfigKey.AutoApprove} property when deciding whether a
 * session's schema is "well-known" (and therefore handled by the dedicated
 * permission picker rather than the generic per-property fallback).
 *
 * `default` is the required baseline level; `autoApprove` is the offered
 * elevated level. `assisted` and `autopilot` are retained here purely for
 * backward/forward compatibility so a session whose schema was resolved by an
 * older or newer agent host (advertising those values) still renders the
 * dedicated picker rather than disappearing. The picker itself only ever
 * *offers* `default` / `autoApprove` (see the delegate's `availableLevels`).
 */
export const KNOWN_AUTO_APPROVE_VALUES: ReadonlySet<string> = new Set(['default', 'assisted', 'autoApprove', 'autopilot']);

/**
 * The set of enum values understood for the {@link SessionConfigKey.Mode}
 * property: the agent execution mode axis.
 */
export const KNOWN_MODE_VALUES: ReadonlySet<string> = new Set(['interactive', 'plan', 'autopilot']);
