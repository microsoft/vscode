/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 3

declare module 'vscode' {

	/**
	 * The type of hook to execute.
	 */
	export type ChatHookType = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'PreCompact' | 'SubagentStart' | 'SubagentStop' | 'Stop';

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
	 * The kind of result from executing a hook command.
	 * - 'success': Hook executed successfully (exit code 0)
	 * - 'error': Blocking error shown to model (exit code 2)
	 * - 'warning': Non-blocking warning shown to user only (other exit codes)
	 */
	export type ChatHookResultKind = 'success' | 'error' | 'warning';

	/**
	 * Result of executing a hook command.
	 * Contains common flow control fields and the hook's output.
	 */
	export interface ChatHookResult {
		/**
		 * The kind of result from executing the hook.
		 */
		readonly resultKind: ChatHookResultKind;
		/**
		 * If set, the agent should stop processing entirely after this hook.
		 * The message is shown to the user but not to the agent.
		 */
		readonly stopReason?: string;
		/**
		 * Warning message shown to the user.
		 */
		readonly warningMessage?: string;
		/**
		 * The hook's output (hook-specific fields only).
		 * For errors, this is the error message string.
		 */
		readonly output: unknown;
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
