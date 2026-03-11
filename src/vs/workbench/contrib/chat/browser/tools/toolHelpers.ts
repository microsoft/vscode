/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IToolResult } from '../../common/tools/languageModelToolsService.js';
import { createToolSimpleTextResult } from '../../common/tools/builtinTools/toolHelpers.js';

export interface ISymbolToolInput {
	symbol: string;
	uri?: string;
	filePath?: string;
	lineContent: string;
}

/**
 * Resolves a URI from tool input. Accepts either a full URI string or a
 * workspace-relative file path.
 */
export function resolveToolUri(input: ISymbolToolInput, workspaceContextService: IWorkspaceContextService): URI | undefined {
	if (input.uri) {
		return URI.parse(input.uri);
	}
	if (input.filePath) {
		const folders = workspaceContextService.getWorkspace().folders;
		if (folders.length === 1) {
			return folders[0].toResource(input.filePath);
		}
		// try each folder, return the first
		for (const folder of folders) {
			return folder.toResource(input.filePath);
		}
	}
	return undefined;
}

/**
 * Finds the line number in the model that matches the given line content.
 * Whitespace is normalized so that extra spaces in the input still match.
 *
 * @returns The 1-based line number, or `undefined` if not found.
 */
export function findLineNumber(model: ITextModel, lineContent: string): number | undefined {
	const parts = lineContent.trim().split(/\s+/);
	const pattern = parts.map(escapeRegExpCharacters).join('\\s+');
	const matches = model.findMatches(pattern, false, true, false, null, false, 1);
	if (matches.length === 0) {
		return undefined;
	}
	return matches[0].range.startLineNumber;
}

/**
 * Finds the 1-based column of a symbol within a line of text using word
 * boundary matching.
 *
 * @returns The 1-based column, or `undefined` if not found.
 */
export function findSymbolColumn(lineText: string, symbol: string): number | undefined {
	const pattern = new RegExp(`\\b${escapeRegExpCharacters(symbol)}\\b`);
	const match = pattern.exec(lineText);
	if (match) {
		return match.index + 1; // 1-based column
	}
	return undefined;
}

/**
 * Creates an error tool result with the given message as both the content
 * and the tool result message.
 */
export function errorResult(message: string): IToolResult {
	const result = createToolSimpleTextResult(message);
	result.toolResultMessage = new MarkdownString(message);
	return result;
}
