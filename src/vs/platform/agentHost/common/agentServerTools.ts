/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolDefinition, URI } from './state/sessionState.js';

/**
 * Server-side host for the agent host's **server tools** — tools that the
 * agent host owns and executes in-process (against a session's own state
 * channels) rather than round-tripping to the workbench. Providers (Copilot,
 * Claude) implement nothing here; they consume this host to discover the
 * server tools, advertise them on a session, and execute them by name.
 *
 * The set of server tools is open-ended: each group of tools (feedback
 * "comments" is the first) is contributed to the host at startup, so providers
 * never hard-code any specific tool — they read {@link definitions} /
 * {@link toolNames} and route through {@link executeTool}.
 *
 * Tool invocation methods take the exact Agent Host chat channel URI. The host
 * resolves its owning session for session-scoped state and tools.
 */
export interface IAgentServerToolHost {
	/** Every server tool definition across the contributed groups. */
	readonly definitions: readonly ToolDefinition[];
	/** Names of every server tool across the contributed groups. */
	readonly toolNames: readonly string[];
	/** Advertises all server tools on the session's `serverTools`. */
	advertise(sessionUri: URI): void;
	/**
	 * Whether {@link toolName} can ever prompt for confirmation, independent of
	 * any session's current state. Providers use this to decide up front which
	 * tools must route through their confirmation path; a tool that answers
	 * `false` is auto-approved and never asks {@link requiresConfirmation}.
	 * Returns `false` for unknown tools.
	 *
	 * This must stay session-independent: providers bake the answer into
	 * long-lived SDK allow-lists, so a state-dependent value would go stale.
	 */
	canRequireConfirmation(toolName: string): boolean;
	/**
	 * Whether {@link toolName} needs to prompt for *this* invocation, given the
	 * current state of {@link chatUri}. Lets a tool that normally confirms
	 * run silently when it has nothing to confirm. Defaults to
	 * {@link canRequireConfirmation} when the owning group has no
	 * session-specific condition.
	 *
	 * Providers must consult this before prompting or executing the tool.
	 */
	requiresConfirmation(chatUri: URI, toolName: string): boolean;
	/**
	 * Executes a server tool for the exact chat that invoked it, dispatching any
	 * resulting actions, and returns the textual tool result for the agent.
	 *
	 * @throws if {@link toolName} is not a known server tool or the arguments
	 * are invalid.
	 */
	executeTool(chatUri: URI, toolName: string, rawArgs: unknown): string | Promise<string>;
}
