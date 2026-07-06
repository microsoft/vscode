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
 * `sessionUri` is the session's protocol URI.
 */
export interface IAgentServerToolHost {
	/** Every server tool definition across the contributed groups. */
	readonly definitions: readonly ToolDefinition[];
	/** Names of every server tool across the contributed groups. */
	readonly toolNames: readonly string[];
	/** Advertises all server tools on the session's `serverTools`. */
	advertise(sessionUri: URI): void;
	/**
	 * Whether {@link toolName} must be confirmed by the user before it runs.
	 * Providers exclude such tools from their server-tool auto-approve lists so
	 * the call surfaces a confirmation instead of executing silently. Returns
	 * `false` for unknown tools and for tools that are auto-approved.
	 */
	requiresConfirmation(toolName: string): boolean;
	/**
	 * Executes a server tool against the session's state, dispatching any
	 * resulting actions, and returns the textual tool result for the agent.
	 *
	 * @throws if {@link toolName} is not a known server tool or the arguments
	 * are invalid.
	 */
	executeTool(sessionUri: URI, toolName: string, rawArgs: unknown): string;
}
