/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { toHookType, resolveHookCommand, IHookCommand, ChatRequestHooks } from './hookSchema.js';
import { HOOKS_BY_TARGET, HookType } from './hookTypes.js';
import { Target } from './promptTypes.js';
import { IMapValue, IValue } from './promptFileParser.js';

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

/**
 * Converts an {@link IValue} YAML AST node into a plain JavaScript value
 * (string, array, or object) suitable for passing to hook parsing helpers.
 */
function yamlValueToPlain(value: IValue): unknown {
	switch (value.type) {
		case 'scalar':
			return value.value;
		case 'sequence':
			return value.items.map(yamlValueToPlain);
		case 'map': {
			const obj: Record<string, unknown> = {};
			for (const prop of value.properties) {
				obj[prop.key.value] = yamlValueToPlain(prop.value);
			}
			return obj;
		}
	}
}

/**
 * Parses hooks from a subagent's YAML frontmatter `hooks` attribute.
 *
 * Supports two formats for hook entries:
 *
 * 1. **Direct command** (our format, without matcher):
 * ```yaml
 * hooks:
 *   PreToolUse:
 *     - type: command
 *       command: "./scripts/validate.sh"
 * ```
 *
 * 2. **Nested with matcher** (Claude Code format):
 * ```yaml
 * hooks:
 *   PreToolUse:
 *     - matcher: "Bash"
 *       hooks:
 *         - type: command
 *           command: "./scripts/validate.sh"
 * ```
 *
 * @param hooksMap The raw YAML map value from the `hooks` frontmatter attribute.
 * @param workspaceRootUri Workspace root for resolving relative `cwd` paths.
 * @param userHome User home directory path for tilde expansion.
 * @param target The agent's target, used to resolve hook type names correctly.
 * @returns Resolved hooks organized by hook type, ready for use in {@link ChatRequestHooks}.
 */
export function parseSubagentHooksFromYaml(
	hooksMap: IMapValue,
	workspaceRootUri: URI | undefined,
	userHome: string,
	target: Target = Target.Undefined,
): ChatRequestHooks {
	const result: Record<string, IHookCommand[]> = {};
	const targetHookMap = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];

	for (const prop of hooksMap.properties) {
		const hookTypeName = prop.key.value;

		// Resolve hook type name using the target's own map first, then fall back to canonical names
		const hookType = targetHookMap[hookTypeName] ?? toHookType(hookTypeName);
		if (!hookType) {
			continue;
		}

		// The value must be a sequence (array of hook entries)
		if (prop.value.type !== 'sequence') {
			continue;
		}

		const commands: IHookCommand[] = [];

		for (const item of prop.value.items) {
			// Convert the YAML AST node to a plain object so the existing
			// extractHookCommandsFromItem helper can handle both direct
			// commands and nested matcher structures.
			const plainItem = yamlValueToPlain(item);
			const extracted = extractHookCommandsFromItem(plainItem, workspaceRootUri, userHome);
			commands.push(...extracted);
		}

		if (commands.length > 0) {
			if (!result[hookType]) {
				result[hookType] = [];
			}
			result[hookType].push(...commands);
		}
	}

	return result as ChatRequestHooks;
}
