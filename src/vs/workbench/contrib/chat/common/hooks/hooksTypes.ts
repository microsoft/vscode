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
 * External types (in hooksCommandTypes.ts) define the contract with spawned commands.
 */

import { vBoolean, vObj, vOptionalProp, vString } from '../../../../../base/common/validation.js';

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
	continue: vOptionalProp(vBoolean()),
	stopReason: vOptionalProp(vString()),
	systemMessage: vOptionalProp(vString()),
});

//#endregion
