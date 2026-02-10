/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { HookType, IHookCommand, toHookType, resolveHookCommand } from './hookSchema.js';

/**
 * Maps Claude hook type names to our abstract HookType.
 * Claude uses PascalCase and slightly different names.
 * @see https://docs.anthropic.com/en/docs/claude-code/hooks
 */
export const CLAUDE_HOOK_TYPE_MAP: Record<string, HookType> = {
	'SessionStart': HookType.SessionStart,
	'UserPromptSubmit': HookType.UserPromptSubmit,
	'PreToolUse': HookType.PreToolUse,
	'PostToolUse': HookType.PostToolUse,
	'PreCompact': HookType.PreCompact,
	'SubagentStart': HookType.SubagentStart,
	'SubagentStop': HookType.SubagentStop,
	'Stop': HookType.Stop,
};

/**
 * Cached inverse mapping from HookType to Claude hook type name.
 * Lazily computed on first access.
 */
let _hookTypeToClaudeName: Map<HookType, string> | undefined;

function getHookTypeToClaudeNameMap(): Map<HookType, string> {
	if (!_hookTypeToClaudeName) {
		_hookTypeToClaudeName = new Map();
		for (const [claudeName, hookType] of Object.entries(CLAUDE_HOOK_TYPE_MAP)) {
			_hookTypeToClaudeName.set(hookType, claudeName);
		}
	}
	return _hookTypeToClaudeName;
}

/**
 * Resolves a Claude hook type name to our abstract HookType.
 */
export function resolveClaudeHookType(name: string): HookType | undefined {
	return CLAUDE_HOOK_TYPE_MAP[name];
}

/**
 * Gets the Claude hook type name for a given abstract HookType.
 * Returns undefined if the hook type is not supported in Claude.
 */
export function getClaudeHookTypeName(hookType: HookType): string | undefined {
	return getHookTypeToClaudeNameMap().get(hookType);
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
 */
export function parseClaudeHooks(
	json: unknown,
	workspaceRootUri: URI | undefined,
	userHome: string
): Map<HookType, { hooks: IHookCommand[]; originalId: string }> {
	const result = new Map<HookType, { hooks: IHookCommand[]; originalId: string }>();

	if (!json || typeof json !== 'object') {
		return result;
	}

	const root = json as Record<string, unknown>;
	const hooks = root.hooks;

	if (!hooks || typeof hooks !== 'object') {
		return result;
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
			if (!item || typeof item !== 'object') {
				continue;
			}

			const itemObj = item as Record<string, unknown>;

			// Claude can have nested hooks with matchers: { matcher: "Bash", hooks: [...] }
			const nestedHooks = (itemObj as { hooks?: unknown }).hooks;
			if (nestedHooks !== undefined && Array.isArray(nestedHooks)) {
				for (const nestedHook of nestedHooks) {
					const resolved = resolveClaudeCommand(nestedHook as Record<string, unknown>, workspaceRootUri, userHome);
					if (resolved) {
						commands.push(resolved);
					}
				}
			} else {
				// Direct hook command
				const resolved = resolveClaudeCommand(itemObj, workspaceRootUri, userHome);
				if (resolved) {
					commands.push(resolved);
				}
			}
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

	return result;
}

/**
 * Resolves a Claude hook command to our IHookCommand format.
 * Claude commands can be: { type: "command", command: "..." } or { command: "..." }
 */
function resolveClaudeCommand(
	raw: Record<string, unknown>,
	workspaceRootUri: URI | undefined,
	userHome: string
): IHookCommand | undefined {
	// Claude might not require 'type' field, so we're more lenient
	const hasValidType = raw.type === undefined || raw.type === 'command';
	if (!hasValidType) {
		return undefined;
	}

	// Add type if missing for resolveHookCommand
	const normalized = { ...raw, type: 'command' };
	return resolveHookCommand(normalized, workspaceRootUri, userHome);
}
