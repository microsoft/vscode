/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname } from '../../../../../base/common/path.js';
import { IHookCommand, toHookType } from './hookSchema.js';
import { parseClaudeHooks, extractHookCommandsFromItem } from './hookClaudeCompat.js';
import { resolveCopilotCliHookType } from './hookCopilotCliCompat.js';
import { HookType } from './hookTypes.js';

/**
 * Supported hook file formats.
 */
export enum HookSourceFormat {
	/** GitHub Copilot hooks .json format */
	Copilot = 'copilot',
	/** Claude settings.json / settings.local.json format */
	Claude = 'claude',
}

/**
 * Determines the hook source format based on the file URI.
 */
export function getHookSourceFormat(fileUri: URI): HookSourceFormat {
	const filename = basename(fileUri.path).toLowerCase();
	const dir = dirname(fileUri.path);

	// Claude format: .claude/settings.json or .claude/settings.local.json
	if ((filename === 'settings.json' || filename === 'settings.local.json') && dir.endsWith('.claude')) {
		return HookSourceFormat.Claude;
	}

	// Default to Copilot format
	return HookSourceFormat.Copilot;
}

/**
 * Parses hooks from a Copilot hooks .json file (our native format).
 */
export function parseCopilotHooks(
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
		const hookType = resolveCopilotCliHookType(originalId) ?? toHookType(originalId);
		if (!hookType) {
			continue;
		}

		const hookArray = hooksObj[originalId];
		if (!Array.isArray(hookArray)) {
			continue;
		}

		const commands: IHookCommand[] = [];

		for (const item of hookArray) {
			// Use helper that handles both direct commands and Claude-style nested matcher structures
			const extracted = extractHookCommandsFromItem(item, workspaceRootUri, userHome);
			commands.push(...extracted);
		}

		if (commands.length > 0) {
			result.set(hookType, { hooks: commands, originalId });
		}
	}

	return result;
}

/**
 * Result of parsing hooks from a file.
 */
export interface IParseHooksFromFileResult {
	readonly format: HookSourceFormat;
	readonly hooks: Map<HookType, { hooks: IHookCommand[]; originalId: string }>;
	/**
	 * Whether all hooks from this file were disabled via `disableAllHooks: true`.
	 */
	readonly disabledAllHooks: boolean;
}

/**
 * Parses hooks from any supported format, auto-detecting the format from the file URI.
 */
export function parseHooksFromFile(
	fileUri: URI,
	json: unknown,
	workspaceRootUri: URI | undefined,
	userHome: string
): IParseHooksFromFileResult {
	const format = getHookSourceFormat(fileUri);

	let hooks: Map<HookType, { hooks: IHookCommand[]; originalId: string }>;
	let disabledAllHooks = false;

	switch (format) {
		case HookSourceFormat.Claude: {
			const result = parseClaudeHooks(json, workspaceRootUri, userHome);
			hooks = result.hooks;
			disabledAllHooks = result.disabledAllHooks;
			break;
		}
		case HookSourceFormat.Copilot:
		default:
			hooks = parseCopilotHooks(json, workspaceRootUri, userHome);
			break;
	}

	return { format, hooks, disabledAllHooks };
}

/**
 * Parses hooks from a file, ignoring the `disableAllHooks` flag.
 * Used by diagnostics to show which hooks are hidden when `disableAllHooks: true` is set.
 */
export function parseHooksIgnoringDisableAll(
	fileUri: URI,
	json: unknown,
	workspaceRootUri: URI | undefined,
	userHome: string
): IParseHooksFromFileResult {
	const format = getHookSourceFormat(fileUri);

	let hooks: Map<HookType, { hooks: IHookCommand[]; originalId: string }>;

	switch (format) {
		case HookSourceFormat.Claude: {
			// Strip `disableAllHooks` before parsing so the hooks are still extracted
			if (json && typeof json === 'object') {
				const { disableAllHooks: _, ...rest } = json as Record<string, unknown>;
				const result = parseClaudeHooks(rest, workspaceRootUri, userHome);
				hooks = result.hooks;
			} else {
				hooks = new Map();
			}
			break;
		}
		case HookSourceFormat.Copilot:
		default:
			hooks = parseCopilotHooks(json, workspaceRootUri, userHome);
			break;
	}

	return { format, hooks, disabledAllHooks: true };
}

/**
 * Builds a new hook entry object in the appropriate format for the given source format.
 * - Copilot format: `{ type: 'command', command: '' }`
 * - Claude format: `{ matcher: '', hooks: [{ type: 'command', command: '' }] }`
 */
export function buildNewHookEntry(format: HookSourceFormat): Record<string, unknown> {
	const commandEntry = { type: 'command', command: '' };
	if (format === HookSourceFormat.Claude) {
		return { matcher: '', hooks: [commandEntry] };
	}
	return commandEntry;
}
