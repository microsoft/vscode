/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Hook command input and output types.
 *
 * These types define the JSON contract between the extension and the spawned hook
 * command processes. Input types describe what is written to stdin; output types
 * describe what is expected on stdout.
 */

//#region PreToolUse

/**
 * Input written to stdin for a PreToolUse hook command.
 */
export interface IPreToolUseHookCommandInput {
	readonly tool_name: string;
	readonly tool_input: unknown;
	readonly tool_use_id: string;
}

/**
 * Hook-specific output fields returned by a PreToolUse hook command (inside `hookSpecificOutput`).
 */
export interface IPreToolUseHookSpecificCommandOutput {
	readonly hookEventName?: string;
	readonly permissionDecision?: 'allow' | 'deny' | 'ask';
	readonly permissionDecisionReason?: string;
	readonly updatedInput?: object;
	readonly additionalContext?: string;
}

//#endregion

//#region PostToolUse

/**
 * Input written to stdin for a PostToolUse hook command.
 */
export interface IPostToolUseHookCommandInput {
	readonly tool_name: string;
	readonly tool_input: unknown;
	readonly tool_response: string;
	readonly tool_use_id: string;
}

/**
 * Hook-specific output fields returned by a PostToolUse hook command (inside `hookSpecificOutput`).
 */
export interface IPostToolUseHookSpecificCommandOutput {
	readonly hookEventName?: string;
	readonly additionalContext?: string;
}

//#endregion
