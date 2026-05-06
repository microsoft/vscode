/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionConfigPropertySchema } from './state/protocol/commands.js';

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
	/** `'mode'` — agent execution mode (interactive / plan). */
	Mode = 'mode',
}

/**
 * The set of enum values the unified permission picker understands for the
 * {@link SessionConfigKey.AutoApprove} property.
 *
 * `default` is the required baseline level; `autoApprove` and `autopilot`
 * are optional (an agent may choose to advertise a subset).
 */
export const KNOWN_AUTO_APPROVE_VALUES: ReadonlySet<string> = new Set(['default', 'autoApprove', 'autopilot']);

const REQUIRED_MODE_VALUE = 'interactive';

/**
 * Returns `true` when a `mode` session-config property uses the shape the
 * dedicated agent-host mode picker expects: a string enum that contains
 * at least `interactive`.
 *
 * Callers use this to decide whether to render the dedicated mode picker
 * (with mode-specific icons and behavior) or fall back to the generic
 * per-property picker.
 */
export function isWellKnownModeSchema(schema: SessionConfigPropertySchema): boolean {
	if (schema.type !== 'string' || !Array.isArray(schema.enum) || schema.enum.length === 0) {
		return false;
	}
	if (!schema.enum.includes(REQUIRED_MODE_VALUE)) {
		return false;
	}
	return true;
}
