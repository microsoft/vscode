/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument, CompletionItemKind, CompletionItem, TextEdit, Range, Position } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { ICompletionParticipant } from 'vscode-html-languageservice';
import { startsWith } from '../utils/strings';
import { contains } from '../utils/arrays';

export function getPathCompletionParticipant(
	document: TextDocument,
	workspaceFolders: WorkspaceFolder[],
	result: CompletionItem[]
): ICompletionParticipant {
	return {
		onHtmlAttributeValue: ({ tag, attribute, value: valueBeforeCursor, range }) => {
			const fullValue = stripQuotes(document.getText(range));

			if (shouldDoPathCompletion(tag, attribute, fullValue)) {
				if (workspaceFolders.length === 0) {
					return;
				}
				const workspaceRoot = resolveWorkspaceRoot(document, workspaceFolders);

				const paths = providePaths(valueBeforeCursor, URI.parse(document.uri).fsPath, workspaceRoot);
				result.push(...paths.map(p => pathToSuggestion(p, valueBeforeCursor, fullValue, range)));
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

function shouldDoPathCompletion(tag: string, attr: string, value: string) {
	if (startsWith(value, 'http') || startsWith(value, 'https') || startsWith(value, '//')) {
		return false;
	}

	if (PATH_TAG_AND_ATTR[tag]) {
		if (typeof PATH_TAG_AND_ATTR[tag] === 'string') {
			return PATH_TAG_AND_ATTR[tag] === attr;
		} else {
			return contains(<string[]>PATH_TAG_AND_ATTR[tag], attr);
		}
	}

	return false;
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
		const paths = fs.readdirSync(parentDir).map(f => {
			return isDir(path.resolve(parentDir, f))
				? f + '/'
				: f;
		});
		return paths.filter(p => p[0] !== '.');
	} catch (e) {
		return [];
	}
}

function isDir(p: string) {
	try {
		return fs.statSync(p).isDirectory();
	} catch (e) {
		return false;
	}
}

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

		// If whitespace exists, replace until there is no more
		const whitespaceIndex = valueAfterLastSlash.indexOf(' ');
		let endPos;
		if (whitespaceIndex !== -1) {
			endPos = shiftPosition(startPos, whitespaceIndex);
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

// Selected from https://stackoverflow.com/a/2725168/1780148
const PATH_TAG_AND_ATTR: { [tag: string]: string | string[] } = {
	// HTML 4
	a: 'href',
	area: 'href',
	body: 'background',
	del: 'cite',
	form: 'action',
	frame: ['src', 'longdesc'],
	img: ['src', 'longdesc'],
	ins: 'cite',
	link: 'href',
	object: 'data',
	q: 'cite',
	script: 'src',
	// HTML 5
	audio: 'src',
	button: 'formaction',
	command: 'icon',
	embed: 'src',
	html: 'manifest',
	input: ['src', 'formaction'],
	source: 'src',
	track: 'src',
	video: ['src', 'poster']
};
