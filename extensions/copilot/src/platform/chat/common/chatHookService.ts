/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const IChatHookService = createServiceIdentifier<IChatHookService>('IChatHookService');

export interface IChatHookService {
	readonly _serviceBrand: undefined;

	/**
	 * Log telemetry about which hook types are configured for a request.
	 * Should be called once per request to report hook configuration.
	 *
	 * @param hooks The resolved hook commands for the session (from request.hooks).
	 */
	logConfiguredHooks(hooks: vscode.ChatRequestHooks | undefined): void;

	/**
	 * Execute all hooks of the specified type for the current chat session.
	 * Hooks are sourced from the resolved hook commands on the chat request.
	 *
	 * If a `sessionId` is provided, the session transcript is flushed to disk
	 * before the hook runs so that hook scripts see up-to-date content.
	 *
	 * @param hookType The type of hook to execute.
	 * @param hooks The resolved hook commands for the session (from request.hooks).
	 * @param input Input data to pass to the hook via stdin (will be JSON-serialized).
	 * @param sessionId Optional session ID — when provided the transcript is flushed first.
	 * @param token Optional cancellation token.
	 * @returns A promise that resolves to an array of hook execution results.
	 */
	executeHook(hookType: vscode.ChatHookType, hooks: vscode.ChatRequestHooks | undefined, input: unknown, sessionId?: string, token?: vscode.CancellationToken): Promise<vscode.ChatHookResult[]>;

	/**
	 * Execute the preToolUse hook and collapse results from all hooks into a single result.
	 *
	 * Multiple hooks' decisions are collapsed using the most restrictive rule: deny > ask > allow.
	 * `updatedInput` uses the last hook's value. `additionalContext` is collected from all hooks.
	 *
	 * @param toolName The name of the tool being invoked.
	 * @param toolInput The input parameters for the tool.
	 * @param toolCallId The unique ID for this tool call.
	 * @param hooks The resolved hook commands for the session (from request.hooks).
	 * @param sessionId Optional session ID — when provided the transcript is flushed first.
	 * @param token Optional cancellation token.
	 * @param outputStream Optional output stream for displaying hook warnings/errors.
	 * @returns The collapsed hook result, or undefined if no hooks are registered or none returned a result.
	 */
	executePreToolUseHook(toolName: string, toolInput: unknown, toolCallId: string, hooks: vscode.ChatRequestHooks | undefined, sessionId?: string, token?: vscode.CancellationToken, outputStream?: vscode.ChatResponseStream): Promise<IPreToolUseHookResult | undefined>;

	/**
	 * Execute the postToolUse hook and collapse results from all hooks into a single result.
	 *
	 * Called after a tool completes successfully. If any hook returns a 'block' decision,
	 * the block is included in the result. `additionalContext` is collected from all hooks.
	 *
	 * @param toolName The name of the tool that was invoked.
	 * @param toolInput The input parameters that were passed to the tool.
	 * @param toolResponseText The text representation of the tool's output.
	 * @param toolCallId The unique ID for this tool call.
	 * @param hooks The resolved hook commands for the session (from request.hooks).
	 * @param sessionId Optional session ID — when provided the transcript is flushed first.
	 * @param token Optional cancellation token.
	 * @param outputStream Optional output stream for displaying hook warnings/errors.
	 * @returns The collapsed hook result, or undefined if no hooks are registered or none returned a result.
	 */
	executePostToolUseHook(toolName: string, toolInput: unknown, toolResponseText: string, toolCallId: string, hooks: vscode.ChatRequestHooks | undefined, sessionId?: string, token?: vscode.CancellationToken, outputStream?: vscode.ChatResponseStream): Promise<IPostToolUseHookResult | undefined>;
}

/**
 * Collapsed result from all preToolUse hooks.
 */
export interface IPreToolUseHookResult {
	permissionDecision?: 'allow' | 'deny' | 'ask';
	permissionDecisionReason?: string;
	updatedInput?: object;
	additionalContext?: string[];
}

/**
 * Collapsed result from all postToolUse hooks.
 */
export interface IPostToolUseHookResult {
	decision?: 'block';
	reason?: string;
	additionalContext?: string[];
}

//#region Hook Input/Output Types

/**
 * Input passed to the UserPromptSubmit hook.
 */
export interface UserPromptSubmitHookInput {
	/**
	 * The user's prompt text.
	 */
	readonly prompt: string;
}

/**
 * Output from the UserPromptSubmit hook.
 */
export interface UserPromptSubmitHookOutput {
	/**
	 * Set to "block" to prevent the user prompt from being submitted to the agent.
	 */
	readonly decision?: 'block';
	/**
	 * Tells the agent why it should continue.
	 */
	readonly reason?: string;
	/**
	 * Hook-specific output from the UserPromptSubmit hook.
	 * This is nested under `hookSpecificOutput` to match the JSON contract used
	 * by other hook types.
	 */
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		/**
		 * Additional context to add to the agent's context.
		 * When multiple sources provide context (SessionStart/SubagentStart/UserPromptSubmit),
		 * they are concatenated.
		 */
		readonly additionalContext?: string;
	};
}

/**
 * Input passed to the Stop hook.
 */
export interface StopHookInput {
	/**
	 * True when the agent is already continuing as a result of a stop hook.
	 * Check this value or process the transcript to prevent the agent from running indefinitely.
	 */
	readonly stop_hook_active: boolean;
}

/**
 * Output from the Stop hook.
 */
export interface StopHookOutput {
	/**
	 * Hook-specific output from the Stop hook.
	 * This is nested under `hookSpecificOutput` to match the JSON contract used
	 * by other hook types.
	 */
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		/**
		 * Set to "block" to prevent the agent from stopping.
		 * Omit or set to undefined to allow the agent to stop.
		 */
		readonly decision?: 'block';
		/**
		 * Required when decision is "block". Tells the agent why it should continue.
		 */
		readonly reason?: string;
	};
}

/**
 * Input passed to the SessionStart hook.
 */
export interface SessionStartHookInput {
	/**
	 * The source of the session start. Always "new".
	 */
	readonly source: 'new';
}

/**
 * Output from the SessionStart hook.
 */
export interface SessionStartHookOutput {
	/**
	 * Hook-specific output from the SessionStart hook.
	 * This is nested under `hookSpecificOutput` to match the JSON contract used
	 * by other hook types.
	 */
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		/**
		 * Additional context to add to the agent's context.
		 * Multiple hooks' values are concatenated.
		 */
		readonly additionalContext?: string;
	};
}

/**
 * Input passed to the SubagentStart hook.
 */
export interface SubagentStartHookInput {
	/**
	 * The unique identifier for the subagent.
	 */
	readonly agent_id: string;
	/**
	 * The agent name (built-in agents like "Plan" or custom agent names).
	 */
	readonly agent_type: string;
}

/**
 * Output from the SubagentStart hook.
 */
export interface SubagentStartHookOutput {
	/**
	 * Hook-specific output from the SubagentStart hook.
	 * This is nested under `hookSpecificOutput` to match the JSON contract used
	 * by other hook types.
	 */
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		/**
		 * Additional context to add to the subagent's context.
		 */
		readonly additionalContext?: string;
	};
}

/**
 * Input passed to the SubagentStop hook.
 */
export interface SubagentStopHookInput {
	/**
	 * The unique identifier for the subagent.
	 */
	readonly agent_id: string;
	/**
	 * The agent name (built-in agents like "Plan" or custom agent names).
	 */
	readonly agent_type: string;
	/**
	 * True when the agent is already continuing as a result of a stop hook.
	 * Check this value or process the transcript to prevent the agent from running indefinitely.
	 */
	readonly stop_hook_active: boolean;
}

/**
 * Output from the SubagentStop hook.
 */
export interface SubagentStopHookOutput {
	/**
	 * Hook-specific output from the SubagentStop hook.
	 * This is nested under `hookSpecificOutput` to match the JSON contract used
	 * by other hook types.
	 */
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		/**
		 * Set to "block" to prevent the agent from stopping.
		 * Omit or set to undefined to allow the agent to stop.
		 */
		readonly decision?: 'block';
		/**
		 * Required when decision is "block". Tells the agent why it should continue.
		 */
		readonly reason?: string;
	};
}

/**
 * Input passed to the PreCompact hook.
 */
export interface PreCompactHookInput {
	/**
	 * How the compaction was triggered.
	 * "auto" when the conversation is too long for the prompt budget.
	 */
	readonly trigger: 'auto';
	/**
	 * Custom instructions for the compaction, if any.
	 */
	readonly custom_instructions?: string;
}

//#endregion
