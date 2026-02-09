/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { basename, dirname } from '../../../../../base/common/path.js';
import { HookType, IHookCommand, toHookType, resolveHookCommand } from './hookSchema.js';
import { parseClaudeHooks } from './hookClaudeCompat.js';
import { resolveCopilotCliHookType } from './hookCopilotCliCompat.js';

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
			const resolved = resolveHookCommand(item as Record<string, unknown>, workspaceRootUri, userHome);
			if (resolved) {
				commands.push(resolved);
			}
		}

		if (commands.length > 0) {
			result.set(hookType, { hooks: commands, originalId });
		}
	}

	return result;
}

/**
 * Parses hooks from any supported format, auto-detecting the format from the file URI.
 */
export function parseHooksFromFile(
	fileUri: URI,
	json: unknown,
	workspaceRootUri: URI | undefined,
	userHome: string
): { format: HookSourceFormat; hooks: Map<HookType, { hooks: IHookCommand[]; originalId: string }> } {
	const format = getHookSourceFormat(fileUri);

	let hooks: Map<HookType, { hooks: IHookCommand[]; originalId: string }>;

	switch (format) {
		case HookSourceFormat.Claude:
			hooks = parseClaudeHooks(json, workspaceRootUri, userHome);
			break;
		case HookSourceFormat.Copilot:
		default:
			hooks = parseCopilotHooks(json, workspaceRootUri, userHome);
			break;
	}

	return { format, hooks };
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
