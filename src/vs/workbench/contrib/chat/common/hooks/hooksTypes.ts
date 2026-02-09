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

import { vEnum, vObj, vObjAny, vOptionalProp, vString } from '../../../../../base/common/validation.js';

//#region Common Hook Types

/**
 * The kind of result from executing a hook command.
 */
export type HookResultKind = 'success' | 'error' | 'warning';

/**
 * Semantic hook result with common fields extracted and defaults applied.
 * This is what callers receive from executeHook.
 */
export interface IHookResult {
	/**
	 * The kind of result from executing the hook.
	 */
	readonly resultKind: HookResultKind;
	/**
	 * If set, the agent should stop processing entirely after this hook.
	 * The message is shown to the user but not to the agent.
	 */
	readonly stopReason?: string;
	/**
	 * Warning message shown to the user.
	 * (Mapped from `systemMessage` in command output, or stderr for non-blocking errors.)
	 */
	readonly warningMessage?: string;
	/**
	 * The hook's output (hook-specific fields only).
	 * For errors, this is the error message string.
	 */
	readonly output: unknown;
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
		permissionDecision: vOptionalProp(vEnum('allow', 'deny', 'ask')),
		permissionDecisionReason: vOptionalProp(vString()),
		updatedInput: vOptionalProp(vObjAny()),
		additionalContext: vOptionalProp(vString()),
	})),
});

/**
 * Valid permission decisions for preToolUse hooks.
 * - 'allow': Auto-approve the tool execution (skip user confirmation)
 * - 'deny': Deny the tool execution
 * - 'ask': Always require user confirmation (never auto-approve)
 */
export type PreToolUsePermissionDecision = 'allow' | 'deny' | 'ask';

/**
 * Result from preToolUse hooks with permission decision fields.
 * Returned to VS Code callers. Represents the collapsed result of all hooks.
 */
export interface IPreToolUseHookResult extends IHookResult {
	readonly permissionDecision?: PreToolUsePermissionDecision;
	readonly permissionDecisionReason?: string;
	/**
	 * Modified tool input parameters from the hook.
	 * When set, replaces the original tool input before execution.
	 * Combine with 'allow' to auto-approve, or 'ask' to show modified input to the user.
	 */
	readonly updatedInput?: object;
	readonly additionalContext?: string[];
}

//#endregion

//#region PostToolUse Hook Types

/**
 * Input provided by VS Code callers when invoking the postToolUse hook.
 * The toolResponse is a lazy getter that renders the tool result content to a string.
 * It is only called if there are PostToolUse hooks registered.
 */
export interface IPostToolUseCallerInput {
	readonly toolName: string;
	readonly toolInput: unknown;
	readonly getToolResponseText: () => string;
	readonly toolCallId: string;
}

export const postToolUseOutputValidator = vObj({
	decision: vOptionalProp(vEnum('block')),
	reason: vOptionalProp(vString()),
	hookSpecificOutput: vOptionalProp(vObj({
		hookEventName: vOptionalProp(vString()),
		additionalContext: vOptionalProp(vString()),
	})),
});

export type PostToolUseDecision = 'block';

/**
 * Result from postToolUse hooks with decision fields.
 * Returned to VS Code callers. Represents the collapsed result of all hooks.
 */
export interface IPostToolUseHookResult extends IHookResult {
	readonly decision?: PostToolUseDecision;
	readonly reason?: string;
	readonly additionalContext?: string[];
}

//#endregion
