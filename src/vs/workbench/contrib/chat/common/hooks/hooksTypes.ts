/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Internal hook types - types used within VS Code's hooks execution service.
 *
 * "Internal" means these types are used by VS Code code only - they never cross the
 * process boundary to external hook commands. They use camelCase for field names.
 *
 * Examples:
 * - IPreToolUseCallerInput: provided by VS Code callers (e.g., LanguageModelToolsService)
 * - IPreToolUseHookResult: returned TO VS Code callers after processing command output
 *
 * External types (in hooksCommandTypes.ts) define the contract with spawned commands.
 */

import { vEnum, vObj, vOptionalProp, vString } from '../../../../../base/common/validation.js';

//#region Common Hook Types

/**
 * Semantic hook result with common fields extracted and defaults applied.
 * This is what callers receive from executeHook.
 */
export interface IHookResult {
	/**
	 * If set, the agent should stop processing entirely after this hook.
	 * The message is shown to the user but not to the agent.
	 */
	readonly stopReason?: string;
	/**
	 * Message shown to the user.
	 * (Mapped from `systemMessage` in command output.)
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

export const commonHookOutputValidator = vObj({
	stopReason: vOptionalProp(vString()),
	systemMessage: vOptionalProp(vString()),
});

//#endregion

//#region PreToolUse Hook Types

/**
 * Input provided by VS Code callers when invoking the preToolUse hook.
 */
export interface IPreToolUseCallerInput {
	readonly toolName: string;
	readonly toolInput: unknown;
	readonly toolCallId: string;
}

export const preToolUseOutputValidator = vObj({
	hookSpecificOutput: vOptionalProp(vObj({
		hookEventName: vOptionalProp(vString()),
		permissionDecision: vEnum('allow', 'deny'),
		permissionDecisionReason: vOptionalProp(vString()),
		additionalContext: vOptionalProp(vString()),
	})),
});

/**
 * Valid permission decisions for preToolUse hooks.
 */
export type PreToolUsePermissionDecision = 'allow' | 'deny';

/**
 * Result from preToolUse hooks with permission decision fields.
 * Returned to VS Code callers.
 */
export interface IPreToolUseHookResult extends IHookResult {
	readonly permissionDecision?: PreToolUsePermissionDecision;
	readonly permissionDecisionReason?: string;
	readonly additionalContext?: string;
}

//#endregion
