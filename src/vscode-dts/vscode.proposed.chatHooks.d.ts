/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// version: 6

declare module 'vscode' {

	/**
	 * The type of hook to execute.
	 */
	export type ChatHookType = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'PreCompact' | 'SubagentStart' | 'SubagentStop' | 'Stop';

	/**
	 * A resolved hook command ready for execution.
	 * The command has already been resolved for the current platform.
	 */
	export interface ChatHookCommand {
		/**
		 * The shell command to execute, already resolved for the current platform.
		 */
		readonly command: string;
		/**
		 * Working directory for the command.
		 */
		readonly cwd?: Uri;
		/**
		 * Additional environment variables for the command.
		 */
		readonly env?: Record<string, string>;
		/**
		 * Maximum execution time in seconds.
		 */
		readonly timeout?: number;
	}

	/**
	 * Collected hooks for a chat request, organized by hook type.
	 */
	export interface ChatRequestHooks {
		readonly [hookType: string]: readonly ChatHookCommand[];
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

	export interface ChatRequest {
		/**
		 * Resolved hook commands for this request, organized by hook type.
		 * The commands have already been resolved for the current platform.
		 * Only present when hooks are enabled.
		 */
		readonly hooks?: ChatRequestHooks;
	}

	/**
	 * A progress part representing the execution result of a hook.
	 * Hooks are user-configured scripts that run at specific points during chat processing.
	 * If {@link stopReason} is set, the hook blocked/denied the operation.
	 */
	export class ChatResponseHookPart {
		/** The type of hook that was executed */
		hookType: ChatHookType;
		/** If set, the hook blocked processing. This message is shown to the user. */
		stopReason?: string;
		/** Warning/system message from the hook, shown to the user */
		systemMessage?: string;
		/** Optional metadata associated with the hook execution */
		metadata?: { readonly [key: string]: unknown };

		/**
		 * Creates a new hook progress part.
		 * @param hookType The type of hook that was executed
		 * @param stopReason Message shown when processing was stopped
		 * @param systemMessage Warning/system message from the hook
		 * @param metadata Optional metadata
		 */
		constructor(hookType: ChatHookType, stopReason?: string, systemMessage?: string, metadata?: { readonly [key: string]: unknown });
	}

	export interface ExtendedChatResponseParts {
		ChatResponseHookPart: ChatResponseHookPart;
	}

	export interface ChatResponseStream {

		/**
		 * Push a hook execution result to this stream.
		 * @param hookType The type of hook that was executed
		 * @param stopReason If set, the hook blocked processing. This message is shown to the user.
		 * @param systemMessage Warning/system message from the hook
		 */
		hookProgress(hookType: ChatHookType, stopReason?: string, systemMessage?: string): void;
	}
}
