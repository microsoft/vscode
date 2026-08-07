/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ToolDefinition, URI } from './state/sessionState.js';

/** Execution details supplied by the provider when invoking a server tool. */
export interface IAgentServerToolExecutionContext {
	/** Use `policy` for non-interactive policy approval, `assisted` only with the state token returned by {@link IAgentServerToolAutoApprovalContext}; omit the context after interactive approval. */
	readonly approval: IAgentServerToolApproval;
}

/** How a confirmation-required server tool was approved without user interaction. */
export type IAgentServerToolApproval =
	| { readonly kind: 'policy' }
	| { readonly kind: 'assisted'; readonly stateToken: string };

/** Untrusted tool input and assessment criteria for assisted auto-approval. */
export interface IAgentServerToolAutoApprovalContext {
	readonly instructions: string;
	readonly untrustedContent: string;
	readonly stateToken: string;
	/** Whether the untrusted content requires a model review before assisted approval. */
	readonly requiresModelReview: boolean;
}

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
	 * Providers can still bypass the confirmation under an explicit auto-approve
	 * policy and report that through {@link IAgentServerToolExecutionContext}.
	 * Returns `false` for unknown tools and tools without a confirmation UI.
	 */
	requiresConfirmation(toolName: string): boolean;
	/** Returns tool-owned context for an assisted auto-approval judge. Tool groups may incorporate validated arguments and current server state. */
	getAutoApprovalContext?(sessionUri: URI, toolName: string, rawArgs: unknown): IAgentServerToolAutoApprovalContext | undefined;
	/**
	 * Executes a server tool against the session's state, dispatching any
	 * resulting actions, and returns the textual tool result for the agent.
	 *
	 * @throws if {@link toolName} is not a known server tool or the arguments
	 * are invalid.
	 */
	executeTool(sessionUri: URI, toolName: string, rawArgs: unknown, context?: IAgentServerToolExecutionContext): string | Promise<string>;
}
