/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { toHookType, IHookCommand, extractHookCommandsFromItem } from './hookSchema.js';
import { HOOKS_BY_TARGET, HookType } from './hookTypes.js';
import { Target } from './promptTypes.js';

export { extractHookCommandsFromItem };

/**
 * Cached inverse mapping from HookType to Claude hook type name.
 * Lazily computed on first access.
 */
let _hookTypeToClaudeName: Map<HookType, string> | undefined;

function getHookTypeToClaudeNameMap(): Map<HookType, string> {
	if (!_hookTypeToClaudeName) {
		_hookTypeToClaudeName = new Map();
		for (const [claudeName, hookType] of Object.entries(HOOKS_BY_TARGET[Target.Claude])) {
			_hookTypeToClaudeName.set(hookType, claudeName);
		}
	}
	return _hookTypeToClaudeName;
}

/**
 * Resolves a Claude hook type name to our abstract HookType.
 */
export function resolveClaudeHookType(name: string): HookType | undefined {
	return HOOKS_BY_TARGET[Target.Claude][name];
}

/**
 * Gets the Claude hook type name for a given abstract HookType.
 * Returns undefined if the hook type is not supported in Claude.
 */
export function getClaudeHookTypeName(hookType: HookType): string | undefined {
	return getHookTypeToClaudeNameMap().get(hookType);
}

/**
 * Result of parsing Claude hooks file.
 */
export interface IParseClaudeHooksResult {
	/**
	 * The parsed hooks by type.
	 */
	readonly hooks: Map<HookType, { hooks: IHookCommand[]; originalId: string }>;
	/**
	 * Whether all hooks from this file were disabled via `disableAllHooks: true`.
	 */
	readonly disabledAllHooks: boolean;
}

/**
 * Parses hooks from a Claude settings.json file.
 * Claude format:
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       { "matcher": "Bash", "hooks": [{ "type": "command", "command": "..." }] }
 *     ]
 *   }
 * }
 *
 * Or simpler format:
 * {
 *   "hooks": {
 *     "PreToolUse": [{ "type": "command", "command": "..." }]
 *   }
 * }
 *
 * If the file has `disableAllHooks: true` at the top level, all hooks are filtered out.
 */
export function parseClaudeHooks(
	json: unknown,
	workspaceRootUri: URI | undefined,
	userHome: string
): IParseClaudeHooksResult {
	const result = new Map<HookType, { hooks: IHookCommand[]; originalId: string }>();

	if (!json || typeof json !== 'object') {
		return { hooks: result, disabledAllHooks: false };
	}

	const root = json as Record<string, unknown>;

	// Check for disableAllHooks property at the top level
	if (root.disableAllHooks === true) {
		return { hooks: result, disabledAllHooks: true };
	}

	const hooks = root.hooks;

	if (!hooks || typeof hooks !== 'object') {
		return { hooks: result, disabledAllHooks: false };
	}

	const hooksObj = hooks as Record<string, unknown>;

	for (const originalId of Object.keys(hooksObj)) {
		// Resolve Claude hook type name to our canonical HookType
		const hookType = resolveClaudeHookType(originalId) ?? toHookType(originalId);
		if (!hookType) {
			continue;
		}

		const hookArray = hooksObj[originalId];
		if (!Array.isArray(hookArray)) {
			continue;
		}

		const commands: IHookCommand[] = [];

		for (const item of hookArray) {
			// Use shared helper that handles both direct commands and nested matcher structures
			const extracted = extractHookCommandsFromItem(item, workspaceRootUri, userHome);
			commands.push(...extracted);
		}

		if (commands.length > 0) {
			const existing = result.get(hookType);
			if (existing) {
				existing.hooks.push(...commands);
			} else {
				result.set(hookType, { hooks: commands, originalId });
			}
		}
	}

	return { hooks: result, disabledAllHooks: false };
}


