/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findNodeAtLocation, Node, parse as parseJSONC, parseTree } from '../../../../../base/common/json.js';
import { ITextEditorSelection } from '../../../../../platform/editor/common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { formatHookCommandLabel, HOOK_TYPES, HookType, IHookCommand } from '../../common/promptSyntax/hookSchema.js';
import { parseHooksFromFile, parseHooksIgnoringDisableAll } from '../../common/promptSyntax/hookCompatibility.js';
import * as nls from '../../../../../nls.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';

/**
 * Converts an offset in content to a 1-based line and column.
 */
function offsetToPosition(content: string, offset: number): { line: number; column: number } {
	let line = 1;
	let column = 1;
	for (let i = 0; i < offset && i < content.length; i++) {
		if (content[i] === '\n') {
			line++;
			column = 1;
		} else {
			column++;
		}
	}
	return { line, column };
}

/**
 * Finds the n-th command field node in a hook type array, handling both simple and nested formats.
 * This iterates through the structure in the same order as the parser flattens hooks.
 */
function findNthCommandNode(tree: Node, hookType: string, targetIndex: number, fieldName: string): Node | undefined {
	const hookTypeArray = findNodeAtLocation(tree, ['hooks', hookType]);
	if (!hookTypeArray || hookTypeArray.type !== 'array' || !hookTypeArray.children) {
		return undefined;
	}

	let currentIndex = 0;

	for (let i = 0; i < hookTypeArray.children.length; i++) {
		const item = hookTypeArray.children[i];
		if (item.type !== 'object') {
			continue;
		}

		// Check if this item has nested hooks (matcher format)
		const nestedHooksNode = findNodeAtLocation(tree, ['hooks', hookType, i, 'hooks']);
		if (nestedHooksNode && nestedHooksNode.type === 'array' && nestedHooksNode.children) {
			// Iterate through nested hooks
			for (let j = 0; j < nestedHooksNode.children.length; j++) {
				if (currentIndex === targetIndex) {
					return findNodeAtLocation(tree, ['hooks', hookType, i, 'hooks', j, fieldName]);
				}
				currentIndex++;
			}
		} else {
			// Simple format - direct command
			if (currentIndex === targetIndex) {
				return findNodeAtLocation(tree, ['hooks', hookType, i, fieldName]);
			}
			currentIndex++;
		}
	}

	return undefined;
}

/**
 * Finds the selection range for a hook command field value in JSON content.
 * Supports both simple format and nested matcher format:
 * - Simple: { hooks: { hookType: [{ command: "..." }] } }
 * - Nested: { hooks: { hookType: [{ matcher: "", hooks: [{ command: "..." }] }] } }
 *
 * The index is a flattened index across all commands in the hook type, regardless of nesting.
 *
 * @param content The JSON file content
 * @param hookType The hook type (e.g., "sessionStart")
 * @param index The flattened index of the hook command within the hook type
 * @param fieldName The field name to find ('command', 'bash', or 'powershell')
 * @returns The selection range for the field value, or undefined if not found
 */
export function findHookCommandSelection(content: string, hookType: string, index: number, fieldName: string): ITextEditorSelection | undefined {
	const tree = parseTree(content);
	if (!tree) {
		return undefined;
	}

	const node = findNthCommandNode(tree, hookType, index, fieldName);
	if (!node || node.type !== 'string') {
		return undefined;
	}

	// Node offset/length includes quotes, so adjust to select only the value content
	const valueStart = node.offset + 1; // After opening quote
	const valueEnd = node.offset + node.length - 1; // Before closing quote

	const start = offsetToPosition(content, valueStart);
	const end = offsetToPosition(content, valueEnd);

	return {
		startLineNumber: start.line,
		startColumn: start.column,
		endLineNumber: end.line,
		endColumn: end.column
	};
}

/**
 * Parsed hook information.
 */
export interface IParsedHook {
	hookType: HookType;
	hookTypeLabel: string;
	command: IHookCommand;
	commandLabel: string;
	fileUri: URI;
	filePath: string;
	index: number;
	/** The original hook type ID as it appears in the JSON file */
	originalHookTypeId: string;
	/** If true, this hook is disabled via `disableAllHooks: true` in its file */
	disabled?: boolean;
}

export interface IParseAllHookFilesOptions {
	/** Additional file URIs to parse (e.g., files skipped due to disableAllHooks) */
	additionalDisabledFileUris?: readonly URI[];
}

/**
 * Parses all hook files and extracts individual hooks.
 * This is a shared helper used by both the configure action and diagnostics.
 */
export async function parseAllHookFiles(
	promptsService: IPromptsService,
	fileService: IFileService,
	labelService: ILabelService,
	workspaceRootUri: URI | undefined,
	userHome: string,
	os: OperatingSystem,
	token: CancellationToken,
	options?: IParseAllHookFilesOptions
): Promise<IParsedHook[]> {
	const hookFiles = await promptsService.listPromptFiles(PromptsType.hook, token);
	const parsedHooks: IParsedHook[] = [];

	for (const hookFile of hookFiles) {
		try {
			const content = await fileService.readFile(hookFile.uri);
			const json = parseJSONC(content.value.toString());

			// Use format-aware parsing
			const { hooks } = parseHooksFromFile(hookFile.uri, json, workspaceRootUri, userHome);

			for (const [hookType, { hooks: commands, originalId }] of hooks) {
				const hookTypeMeta = HOOK_TYPES.find(h => h.id === hookType);
				if (!hookTypeMeta) {
					continue;
				}

				for (let i = 0; i < commands.length; i++) {
					const command = commands[i];
					const commandLabel = formatHookCommandLabel(command, os) || nls.localize('commands.hook.emptyCommand', '(empty command)');
					parsedHooks.push({
						hookType,
						hookTypeLabel: hookTypeMeta.label,
						command,
						commandLabel,
						fileUri: hookFile.uri,
						filePath: labelService.getUriLabel(hookFile.uri, { relative: true }),
						index: i,
						originalHookTypeId: originalId
					});
				}
			}
		} catch (error) {
			// Skip files that can't be parsed, but surface the failure for diagnostics
			console.error('Failed to read or parse hook file', hookFile.uri.toString(), error);
		}
	}

	// Parse additional disabled files (e.g., files with disableAllHooks: true)
	// These are parsed ignoring the disableAllHooks flag so we can show their hooks as disabled
	if (options?.additionalDisabledFileUris) {
		for (const uri of options.additionalDisabledFileUris) {
			try {
				const content = await fileService.readFile(uri);
				const json = parseJSONC(content.value.toString());

				// Parse hooks ignoring disableAllHooks - use the underlying format parsers directly
				const { hooks } = parseHooksIgnoringDisableAll(uri, json, workspaceRootUri, userHome);

				for (const [hookType, { hooks: commands, originalId }] of hooks) {
					const hookTypeMeta = HOOK_TYPES.find(h => h.id === hookType);
					if (!hookTypeMeta) {
						continue;
					}

					for (let i = 0; i < commands.length; i++) {
						const command = commands[i];
						const commandLabel = formatHookCommandLabel(command, os) || nls.localize('commands.hook.emptyCommand', '(empty command)');
						parsedHooks.push({
							hookType,
							hookTypeLabel: hookTypeMeta.label,
							command,
							commandLabel,
							fileUri: uri,
							filePath: labelService.getUriLabel(uri, { relative: true }),
							index: i,
							originalHookTypeId: originalId,
							disabled: true
						});
					}
				}
			} catch (error) {
				console.error('Failed to read or parse disabled hook file', uri.toString(), error);
			}
		}
	}

	return parsedHooks;
}
