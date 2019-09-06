/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import URI from 'vscode-uri';

import { TextDocument, CompletionList, CompletionItemKind, CompletionItem, TextEdit, Range, Position } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver';
import { ICompletionParticipant } from 'vscode-css-languageservice';

import { startsWith, endsWith } from './utils/strings';

export function getPathCompletionParticipant(
	document: TextDocument,
	workspaceFolders: WorkspaceFolder[],
	result: CompletionList
): ICompletionParticipant {
	return {
		onCssURILiteralValue: ({ position, range, uriValue }) => {
			const fullValue = stripQuotes(uriValue);
			if (!shouldDoPathCompletion(uriValue, workspaceFolders)) {
				if (fullValue === '.' || fullValue === '..') {
					result.isIncomplete = true;
				}
				return;
			}

			let suggestions = providePathSuggestions(uriValue, position, range, document, workspaceFolders);
			result.items = [...suggestions, ...result.items];
		},
		onCssImportPath: ({ position, range, pathValue }) => {
			const fullValue = stripQuotes(pathValue);
			if (!shouldDoPathCompletion(pathValue, workspaceFolders)) {
				if (fullValue === '.' || fullValue === '..') {
					result.isIncomplete = true;
				}
				return;
			}

			let suggestions = providePathSuggestions(pathValue, position, range, document, workspaceFolders);

			if (document.languageId === 'scss') {
				suggestions.forEach(s => {
					if (startsWith(s.label, '_') && endsWith(s.label, '.scss')) {
						if (s.textEdit) {
							s.textEdit.newText = s.label.slice(1, -5);
						} else {
							s.label = s.label.slice(1, -5);
						}
					}
				});
			}

			result.items = [...suggestions, ...result.items];
		}
	};
}

function providePathSuggestions(pathValue: string, position: Position, range: Range, document: TextDocument, workspaceFolders: WorkspaceFolder[]) {
	const fullValue = stripQuotes(pathValue);
	const isValueQuoted = startsWith(pathValue, `'`) || startsWith(pathValue, `"`);
	const valueBeforeCursor = isValueQuoted
		? fullValue.slice(0, position.character - (range.start.character + 1))
		: fullValue.slice(0, position.character - range.start.character);
	const workspaceRoot = resolveWorkspaceRoot(document, workspaceFolders);
	const currentDocFsPath = URI.parse(document.uri).fsPath;

	const paths = providePaths(valueBeforeCursor, currentDocFsPath, workspaceRoot)
		.filter(p => {
			// Exclude current doc's path
			return path.resolve(currentDocFsPath, '../', p) !== currentDocFsPath;
		})
		.filter(p => {
			// Exclude paths that start with `.`
			return p[0] !== '.';
		});

	const fullValueRange = isValueQuoted ? shiftRange(range, 1, -1) : range;
	const replaceRange = pathToReplaceRange(valueBeforeCursor, fullValue, fullValueRange);

	const suggestions = paths.map(p => pathToSuggestion(p, replaceRange));
	return suggestions;
}

function shouldDoPathCompletion(pathValue: string, workspaceFolders: WorkspaceFolder[]): boolean {
	const fullValue = stripQuotes(pathValue);
	if (fullValue === '.' || fullValue === '..') {
		return false;
	}

	if (!workspaceFolders || workspaceFolders.length === 0) {
		return false;
	}

	return true;
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
	const lastIndexOfSlash = valueBeforeCursor.lastIndexOf('/');
	const valueBeforeLastSlash = valueBeforeCursor.slice(0, lastIndexOfSlash + 1);

	const startsWithSlash = startsWith(valueBeforeCursor, '/');
	let parentDir: string;
	if (startsWithSlash) {
		if (!root) {
			return [];
		}
		parentDir = path.resolve(root, '.' + valueBeforeLastSlash);
	} else {
		parentDir = path.resolve(activeDocFsPath, '..', valueBeforeLastSlash);
	}

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
		const whitespaceIndex = valueAfterLastSlash.indexOf(' ');
		let endPos;
		if (whitespaceIndex !== -1) {
			endPos = shiftPosition(startPos, whitespaceIndex);
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
			label: escapePath(p),
			kind: CompletionItemKind.Folder,
			textEdit: TextEdit.replace(replaceRange, escapePath(p)),
			command: {
				title: 'Suggest',
				command: 'editor.action.triggerSuggest'
			}
		};
	} else {
		return {
			label: escapePath(p),
			kind: CompletionItemKind.File,
			textEdit: TextEdit.replace(replaceRange, escapePath(p))
		};
	}
}

// Escape https://www.w3.org/TR/CSS1/#url
function escapePath(p: string) {
	return p.replace(/(\s|\(|\)|,|"|')/g, '\\$1');
}

function resolveWorkspaceRoot(activeDoc: TextDocument, workspaceFolders: WorkspaceFolder[]): string | undefined {
	for (const folder of workspaceFolders) {
		if (startsWith(activeDoc.uri, folder.uri)) {
			return path.resolve(URI.parse(folder.uri).fsPath);
		}
	}
	return undefined;
}

function shiftPosition(pos: Position, offset: number): Position {
	return Position.create(pos.line, pos.character + offset);
}
function shiftRange(range: Range, startOffset: number, endOffset: number): Range {
	const start = shiftPosition(range.start, startOffset);
	const end = shiftPosition(range.end, endOffset);
	return Range.create(start, end);
}
