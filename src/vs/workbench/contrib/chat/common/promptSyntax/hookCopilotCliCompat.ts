/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HookType } from './hookSchema.js';

/**
 * Maps Copilot CLI hook type names to our abstract HookType.
 * Copilot CLI uses camelCase names.
 */
export const COPILOT_CLI_HOOK_TYPE_MAP: Record<string, HookType> = {
	'sessionStart': HookType.SessionStart,
	'userPromptSubmitted': HookType.UserPromptSubmit,
	'preToolUse': HookType.PreToolUse,
	'postToolUse': HookType.PostToolUse,
};

/**
 * Cached inverse mapping from HookType to Copilot CLI hook type name.
 * Lazily computed on first access.
 */
let _hookTypeToCopilotCliName: Map<HookType, string> | undefined;

function getHookTypeToCopilotCliNameMap(): Map<HookType, string> {
	if (!_hookTypeToCopilotCliName) {
		_hookTypeToCopilotCliName = new Map();
		for (const [copilotCliName, hookType] of Object.entries(COPILOT_CLI_HOOK_TYPE_MAP)) {
			_hookTypeToCopilotCliName.set(hookType, copilotCliName);
		}
	}
	return _hookTypeToCopilotCliName;
}

/**
 * Resolves a Copilot CLI hook type name to our abstract HookType.
 */
export function resolveCopilotCliHookType(name: string): HookType | undefined {
	return COPILOT_CLI_HOOK_TYPE_MAP[name];
}

/**
 * Gets the Copilot CLI hook type name for a given abstract HookType.
 * Returns undefined if the hook type is not supported in Copilot CLI.
 */
export function getCopilotCliHookTypeName(hookType: HookType): string | undefined {
	return getHookTypeToCopilotCliNameMap().get(hookType);
}
