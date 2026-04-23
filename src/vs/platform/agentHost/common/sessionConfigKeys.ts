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
	/** `'branchNameHint'` — client-supplied hint used during worktree creation. */
	BranchNameHint = 'branchNameHint',
}

/**
 * The set of enum values the unified permission picker understands for the
 * {@link SessionConfigKey.AutoApprove} property.
 *
 * `default` is the required baseline level; `autoApprove` and `autopilot`
 * are optional (an agent may choose to advertise a subset).
 */
export const KNOWN_AUTO_APPROVE_VALUES: ReadonlySet<string> = new Set(['default', 'autoApprove', 'autopilot']);
