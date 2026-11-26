/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname } from '../../../../../base/common/path.js';
import { IHookCommand, toHookType } from './hookSchema.js';
import { parseClaudeHooks, extractHookCommandsFromItem } from './hookClaudeCompat.js';
import { resolveCopilotCliHookType } from './hookCopilotCliCompat.js';
import { HookType, isLocalFormatHookEventName } from './hookTypes.js';

/**
 * Represents a hook source with its original and normalized properties.
 * Used to display hooks from different formats in a unified view.
 */
export interface IResolvedHookEntry {
	/** The normalized hook type (our canonical HookType enum) */
	readonly hookType: HookType;
	/** The original hook type ID as it appears in the source file */
	readonly originalHookTypeId: string;
	/** The source format this hook came from */
	readonly sourceFormat: HookSourceFormat;
	/** The resolved hook command */
	readonly command: IHookCommand;
	/** The index of this hook in its array (for editing) */
	readonly index: number;
}

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
 * Checks if a file is read-only based on its source format.
 * Claude settings files should be read-only from our perspective since they have a different format.
 */
export function isReadOnlyHookSource(format: HookSourceFormat): boolean {
	return format === HookSourceFormat.Claude;
}

/**
 * Whether a hook file belongs to Claude Code: a Claude settings file, or any file inside a `.claude` folder.
 * Claude Code hooks use capitalised event names by design and are never treated as Local-format hooks.
 */
export function isClaudeHookFile(fileUri: URI): boolean {
	return getHookSourceFormat(fileUri) === HookSourceFormat.Claude
		|| fileUri.path.split('/').some(segment => segment.toLowerCase() === '.claude');
}

/**
 * Returns the event names in a hook file that use the deprecated Local hook format
 * (capitalised names such as `PreToolUse`). Returns an empty array for Claude Code hook files
 * and for files that use only native event names.
 */
export function getLocalFormatHookEvents(fileUri: URI, json: unknown): string[] {
	if (isClaudeHookFile(fileUri) || !json || typeof json !== 'object') {
		return [];
	}
	const hooks = (json as Record<string, unknown>).hooks;
	if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
		return [];
	}
	return Object.keys(hooks).filter(isLocalFormatHookEventName);
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
 * Gets a human-readable label for a hook source format.
 */
export function getHookSourceFormatLabel(format: HookSourceFormat): string {
	switch (format) {
		case HookSourceFormat.Claude:
			return 'Claude';
		case HookSourceFormat.Copilot:
			return 'GitHub Copilot';
	}
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

/**
 * Builds a new Copilot-format hook file with an empty command hook for the Copilot event `eventName`.
 */
export function buildNewCopilotHookFile(eventName: string): { version: number; hooks: Record<string, Record<string, unknown>[]> } {
	return {
		version: 1,
		hooks: {
			[eventName]: [buildNewHookEntry(HookSourceFormat.Copilot)]
		}
	};
}
