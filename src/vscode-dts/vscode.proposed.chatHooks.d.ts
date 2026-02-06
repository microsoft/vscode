/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 2

declare module 'vscode' {

	/**
	 * The type of hook to execute.
	 */
	export type ChatHookType = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'SubagentStart' | 'SubagentStop' | 'Stop';

	/**
	 * Options for executing a hook command.
	 */
	export interface ChatHookExecutionOptions {
		/**
		 * Input data to pass to the hook via stdin (will be JSON-serialized).
		 */
		readonly input?: unknown;
		/**
		 * The tool invocation token from the chat request context,
		 * used to associate the hook execution with the current chat session.
		 */
		readonly toolInvocationToken: ChatParticipantToolToken;
	}

	/**
	 * Result of executing a hook command.
	 * Contains common flow control fields and the hook's output.
	 */
	export interface ChatHookResult {
		/**
		 * If set, the agent should stop processing entirely after this hook.
		 * The message is shown to the user but not to the agent.
		 */
		readonly stopReason?: string;
		/**
		 * Message shown to the user.
		 */
		readonly messageForUser?: string;
		/**
		 * The hook's output (hook-specific fields only).
		 * For errors, this is the error message string.
		 */
		readonly output: unknown;
		/**
		 * Whether the hook command executed successfully (exit code 0).
		 */
		readonly success: boolean;
	}

	export namespace chat {
		/**
		 * Execute all hooks of the specified type for the current chat session.
		 * Hooks are configured in hooks.json files in the workspace.
		 *
		 * @param hookType The type of hook to execute.
		 * @param options Hook execution options including the input data.
		 * @param token Optional cancellation token.
		 * @returns A promise that resolves to an array of hook execution results.
		 */
		export function executeHook(hookType: ChatHookType, options: ChatHookExecutionOptions, token?: CancellationToken): Thenable<ChatHookResult[]>;
	}
}
