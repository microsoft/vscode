/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import * as fs from 'fs';
import URI from 'vscode-uri';

import { TextDocument, CompletionList, CompletionItemKind, CompletionItem, TextEdit, Range, Position } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver';
import { ICompletionParticipant } from 'vscode-css-languageservice';

import { startsWith } from './utils/strings';

export function getPathCompletionParticipant(
	document: TextDocument,
	workspaceFolders: WorkspaceFolder[],
	result: CompletionList
): ICompletionParticipant {
	return {
		onURILiteralValue: ({ position, range, uriValue }) => {
			const isValueQuoted = startsWith(uriValue, `'`) || startsWith(uriValue, `"`);
			const fullValue = stripQuotes(uriValue);
			const valueBeforeCursor = isValueQuoted
				? fullValue.slice(0, position.character - (range.start.character + 1))
				: fullValue.slice(0, position.character - range.start.character);

			if (fullValue === '.' || fullValue === '..') {
				result.isIncomplete = true;
				return;
			}

			if (!workspaceFolders || workspaceFolders.length === 0) {
				return;
			}
			const workspaceRoot = resolveWorkspaceRoot(document, workspaceFolders);
			const paths = providePaths(valueBeforeCursor, URI.parse(document.uri).fsPath, workspaceRoot);

			const fullValueRange = isValueQuoted ? shiftRange(range, 1, -1) : range;
			const replaceRange = pathToReplaceRange(valueBeforeCursor, fullValue, fullValueRange);
			const suggestions = paths.map(p => pathToSuggestion(p, replaceRange));
			result.items = [...suggestions, ...result.items];
		}

	};
}

function stripQuotes(fullValue: string) {
	if (startsWith(fullValue, `'`) || startsWith(fullValue, `"`)) {
		return fullValue.slice(1, -1);
	} else {
		return fullValue;
	}
}

/**
 * Get a list of path suggestions. Folder suggestions are suffixed with a slash.
 */
function providePaths(valueBeforeCursor: string, activeDocFsPath: string, root?: string): string[] {
	if (startsWith(valueBeforeCursor, '/') && !root) {
		return [];
	}

	const lastIndexOfSlash = valueBeforeCursor.lastIndexOf('/');
	const valueBeforeLastSlash = valueBeforeCursor.slice(0, lastIndexOfSlash + 1);

	const parentDir = startsWith(valueBeforeCursor, '/')
		? path.resolve(root, '.' + valueBeforeLastSlash)
		: path.resolve(activeDocFsPath, '..', valueBeforeLastSlash);

	try {
		return fs.readdirSync(parentDir).map(f => {
			return isDir(path.resolve(parentDir, f))
				? f + '/'
				: f;
		});
	} catch (e) {
		return [];
	}
}

const isDir = (p: string) => {
	try {
		return fs.statSync(p).isDirectory();
	} catch (e) {
		return false;
	}
};

function pathToReplaceRange(valueBeforeCursor: string, fullValue: string, fullValueRange: Range) {
	let replaceRange: Range;
	const lastIndexOfSlash = valueBeforeCursor.lastIndexOf('/');
	if (lastIndexOfSlash === -1) {
		replaceRange = fullValueRange;
	} else {
		// For cases where cursor is in the middle of attribute value, like <script src="./s|rc/test.js">
		// Find the last slash before cursor, and calculate the start of replace range from there
		const valueAfterLastSlash = fullValue.slice(lastIndexOfSlash + 1);
		const startPos = shiftPosition(fullValueRange.end, -valueAfterLastSlash.length);
		// If whitespace exists, replace until it
		const whiteSpaceIndex = valueAfterLastSlash.indexOf(' ');
		let endPos;
		if (whiteSpaceIndex !== -1) {
			endPos = shiftPosition(startPos, whiteSpaceIndex);
		} else {
			endPos = fullValueRange.end;
		}
		replaceRange = Range.create(startPos, endPos);
	}

	return replaceRange;
}

function pathToSuggestion(p: string, replaceRange: Range): CompletionItem {
	const isDir = p[p.length - 1] === '/';

	if (isDir) {
		return {
			label: p,
			kind: CompletionItemKind.Folder,
			textEdit: TextEdit.replace(replaceRange, p),
			command: {
				title: 'Suggest',
				command: 'editor.action.triggerSuggest'
			}
		};
	} else {
		return {
			label: p,
			kind: CompletionItemKind.File,
			textEdit: TextEdit.replace(replaceRange, p)
		};
	}
}

function resolveWorkspaceRoot(activeDoc: TextDocument, workspaceFolders: WorkspaceFolder[]): string | undefined {
	for (let i = 0; i < workspaceFolders.length; i++) {
		if (startsWith(activeDoc.uri, workspaceFolders[i].uri)) {
			return path.resolve(URI.parse(workspaceFolders[i].uri).fsPath);
		}
	}
}

function shiftPosition(pos: Position, offset: number): Position {
	return Position.create(pos.line, pos.character + offset);
}
function shiftRange(range: Range, startOffset: number, endOffset: number): Range {
	const start = shiftPosition(range.start, startOffset);
	const end = shiftPosition(range.end, endOffset);
	return Range.create(start, end);
}
