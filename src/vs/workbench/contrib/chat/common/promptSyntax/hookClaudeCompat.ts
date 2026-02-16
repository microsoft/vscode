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

/**
 * Helper to extract hook commands from an item that could be:
 * 1. A direct command object: { type: 'command', command: '...' }
 * 2. A nested structure with matcher (Claude style): { matcher: '...', hooks: [{ type: 'command', command: '...' }] }
 *
 * This allows Copilot format to handle Claude-style entries if pasted.
 * Also handles Claude's leniency where 'type' field can be omitted.
 */
export function extractHookCommandsFromItem(
	item: unknown,
	workspaceRootUri: URI | undefined,
	userHome: string
): IHookCommand[] {
	if (!item || typeof item !== 'object') {
		return [];
	}

	const itemObj = item as Record<string, unknown>;
	const commands: IHookCommand[] = [];

	// Check for nested hooks with matcher (Claude style): { matcher: "...", hooks: [...] }
	const nestedHooks = itemObj.hooks;
	if (nestedHooks !== undefined && Array.isArray(nestedHooks)) {
		for (const nestedHook of nestedHooks) {
			if (!nestedHook || typeof nestedHook !== 'object') {
				continue;
			}
			const normalized = normalizeForResolve(nestedHook as Record<string, unknown>);
			const resolved = resolveHookCommand(normalized, workspaceRootUri, userHome);
			if (resolved) {
				commands.push(resolved);
			}
		}
	} else {
		// Direct command object
		const normalized = normalizeForResolve(itemObj);
		const resolved = resolveHookCommand(normalized, workspaceRootUri, userHome);
		if (resolved) {
			commands.push(resolved);
		}
	}

	return commands;
}

/**
 * Normalizes a hook command object for resolving.
 * Claude format allows omitting the 'type' field, treating it as 'command'.
 * This ensures compatibility when Claude-style hooks are pasted into Copilot format.
 */
function normalizeForResolve(raw: Record<string, unknown>): Record<string, unknown> {
	// If type is missing or already 'command', ensure it's set to 'command'
	if (raw.type === undefined || raw.type === 'command') {
		return { ...raw, type: 'command' };
	}
	return raw;
}
