/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tool interfaces for the agent loop.
 *
 * A tool has a name, a description, a JSON Schema for its parameters, and an
 * execute function. Tools do not know about the loop, the conversation, or the
 * model. They receive validated input and return output. The loop orchestrates
 * calling them.
 */

import { CancellationToken } from '../../../base/common/cancellation.js';
import { IDisposable } from '../../../base/common/lifecycle.js';

// -- Tool definition (passed to the model) ------------------------------------

/**
 * A tool definition as presented to the model. This is the schema the model
 * uses to decide when and how to call the tool.
 */
export interface IAgentToolDefinition {
	readonly name: string;
	readonly description: string;
	/**
	 * JSON Schema describing the tool's parameters.
	 * The model uses this to generate valid arguments.
	 */
	readonly parametersSchema: Record<string, unknown>;
}

// -- Tool context -------------------------------------------------------------

/**
 * Context provided to a tool during execution. Tools use this for
 * cancellation, coordination with other tools, and accessing the
 * working directory.
 */
export interface IToolContext {
	/** Cancellation token for aborting tool execution. */
	readonly token: CancellationToken;
	/** The working directory for the session (e.g., workspace root). */
	readonly workingDirectory: string;
	/**
	 * Session-scoped scratchpad for tools that need to coordinate
	 * (e.g., a shell tool maintaining a persistent process).
	 */
	readonly scratchpad: Map<string, unknown>;
	/**
	 * Register a disposable that will be cleaned up when the session is
	 * disposed. Tools that create long-lived resources (child processes,
	 * file handles, etc.) must register cleanup here.
	 */
	registerDisposable(disposable: IDisposable): void;
}

// -- Tool result --------------------------------------------------------------

export interface IToolResult {
	/** The tool's output content (will be fed back to the model). */
	readonly content: string;
	/** Whether the tool execution resulted in an error. */
	readonly isError?: boolean;
}

// -- Tool interface -----------------------------------------------------------

/**
 * A tool that can be invoked by the agent loop.
 */
export interface IAgentTool extends IAgentToolDefinition {
	/**
	 * Whether this tool is safe to run concurrently with other read-only tools.
	 * Mutating tools (file writes, shell commands) should return `false`.
	 * Read-only tools (file read, grep, glob) should return `true`.
	 */
	readonly readOnly: boolean;

	/**
	 * Execute the tool with the given arguments.
	 *
	 * @param args - Validated arguments matching the tool's parameter schema.
	 * @param context - Execution context with cancellation, working directory, etc.
	 * @returns The tool's result.
	 */
	execute(args: Record<string, unknown>, context: IToolContext): Promise<IToolResult>;
}
