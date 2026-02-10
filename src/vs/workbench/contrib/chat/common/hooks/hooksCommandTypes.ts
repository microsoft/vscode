/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * External hook types - types that cross the process boundary to/from spawned hook commands.
 *
 * "External" means these types define the contract between VS Code and the external hook
 * command process.
 *
 * Examples:
 * - IPreToolUseCommandInput: sent TO the spawned command via stdin
 * - IPreToolUseCommandOutput: received FROM the spawned command via stdout
 *
 * Internal types (in hooksTypes.ts) are used within VS Code.
 */

import { URI } from '../../../../../base/common/uri.js';

//#region Common Hook Types

/**
 * Common properties added to all hook command inputs.
 */
export interface IHookCommandInput {
	readonly timestamp: string;
	readonly cwd: URI;
	readonly sessionId: string;
	readonly hookEventName: string;
	readonly transcript_path?: URI;
}

/**
 * Common output fields that can be present in any hook command result.
 * These fields control execution flow and user feedback.
 */
export interface IHookCommandOutput {
	/**
	 * If set, stops processing entirely after this hook.
	 * The message is shown to the user but not to the agent.
	 */
	readonly stopReason?: string;
	/**
	 * Message shown to the user.
	 */
	readonly systemMessage?: string;
}

export const enum HookCommandResultKind {
	Success = 1,
	/** Blocking error - shown to model */
	Error = 2,
	/** Non-blocking error - shown to user only */
	NonBlockingError = 3
}

/**
 * Raw result from spawning a hook command.
 * This is the low-level result before semantic processing.
 */
export interface IHookCommandResult {
	readonly kind: HookCommandResultKind;
	/**
	 * For success, this is stdout (parsed as JSON if valid, otherwise string).
	 * For errors, this is stderr.
	 */
	readonly result: string | object;
}

//#endregion

//#region PreToolUse Hook Types

/**
 * Tool-specific command input fields for preToolUse hook.
 * These are mixed with IHookCommandInput at runtime.
 */
export interface IPreToolUseCommandInput {
	readonly tool_name: string;
	readonly tool_input: unknown;
	readonly tool_use_id: string;
}

/**
 * External command output for preToolUse hook.
 * Extends common output with hookSpecificOutput wrapper.
 */
export interface IPreToolUseCommandOutput extends IHookCommandOutput {
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		readonly permissionDecision?: 'allow' | 'deny';
		readonly permissionDecisionReason?: string;
		readonly updatedInput?: object;
		readonly additionalContext?: string;
	};
}

//#endregion

//#region PostToolUse Hook Types

/**
 * Tool-specific command input fields for postToolUse hook.
 * These are mixed with IHookCommandInput at runtime.
 */
export interface IPostToolUseCommandInput {
	readonly tool_name: string;
	readonly tool_input: unknown;
	readonly tool_response: string;
	readonly tool_use_id: string;
}

/**
 * External command output for postToolUse hook.
 * Extends common output with decision control fields.
 */
export interface IPostToolUseCommandOutput extends IHookCommandOutput {
	readonly decision?: 'block';
	readonly reason?: string;
	readonly hookSpecificOutput?: {
		readonly hookEventName?: string;
		readonly additionalContext?: string;
	};
}

//#endregion
