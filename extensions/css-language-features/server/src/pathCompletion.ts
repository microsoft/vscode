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
			const fullValue = stripQuotes(uriValue);

			if (shouldDoPathCompletion(fullValue)) {
				if (!workspaceFolders || workspaceFolders.length === 0) {
					return;
				}
				const workspaceRoot = resolveWorkspaceRoot(document, workspaceFolders);

				const paths = providePaths(fullValue, URI.parse(document.uri).fsPath, workspaceRoot);
				result.items = [...paths.map(p => pathToSuggestion(p, fullValue, fullValue, range)), ...result.items];
			}
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

function shouldDoPathCompletion(fullValue: string) {
	if (fullValue === '.') {
		return false;
	}
	return true;
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

function pathToSuggestion(p: string, valueBeforeCursor: string, fullValue: string, range: Range): CompletionItem {
	const isDir = p[p.length - 1] === '/';

	let replaceRange: Range;
	const lastIndexOfSlash = valueBeforeCursor.lastIndexOf('/');
	if (lastIndexOfSlash === -1) {
		replaceRange = shiftRange(range, 1, -1);
	} else {
		// For cases where cursor is in the middle of attribute value, like <script src="./s|rc/test.js">
		// Find the last slash before cursor, and calculate the start of replace range from there
		const valueAfterLastSlash = fullValue.slice(lastIndexOfSlash + 1);
		const startPos = shiftPosition(range.end, -1 - valueAfterLastSlash.length);
		// If whitespace exists, replace until it
		const whiteSpaceIndex = valueAfterLastSlash.indexOf(' ');
		let endPos;
		if (whiteSpaceIndex !== -1) {
			endPos = shiftPosition(startPos, whiteSpaceIndex);
		} else {
			endPos = shiftPosition(range.end, -1);
		}
		replaceRange = Range.create(startPos, endPos);
	}

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
