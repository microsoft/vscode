/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HOOKS_BY_TARGET, HookType } from './hookTypes.js';
import { Target } from './promptTypes.js';

const COPILOT_CLI_HOOK_TYPE_MAP: Record<string, HookType> = HOOKS_BY_TARGET[Target.GitHubCopilot];

/**
 * Resolves a Copilot CLI hook type name to our abstract HookType.
 */
export function resolveCopilotCliHookType(name: string): HookType | undefined {
	return (COPILOT_CLI_HOOK_TYPE_MAP as Record<string, HookType>)[name];
}
