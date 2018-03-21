/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, CompletionList, CompletionItemKind, CompletionItem, TextEdit, Range, Position } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver';
import * as path from 'path';
import * as fs from 'fs';
import URI from 'vscode-uri';
import { ICompletionParticipant } from 'vscode-html-languageservice';
import { startsWith } from '../utils/strings';
import { contains } from '../utils/arrays';

export function getPathCompletionParticipant(
	document: TextDocument,
	workspaceFolders: WorkspaceFolder[] | undefined,
	result: CompletionList
): ICompletionParticipant {
	return {
		onHtmlAttributeValue: ({ tag, attribute, value, range }) => {

			if (shouldDoPathCompletion(tag, attribute, value)) {
				if (!workspaceFolders || workspaceFolders.length === 0) {
					return;
				}
				const workspaceRoot = resolveWorkspaceRoot(document, workspaceFolders);

				const paths = providePaths(value, URI.parse(document.uri).fsPath, workspaceRoot);
				const suggestions = paths.map(p => pathToSuggestion(p, value, range));
				result.items = [...suggestions, ...result.items];
			}
		}
	};
}

function shouldDoPathCompletion(tag: string, attr: string, value: string): boolean {
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
function providePaths(value: string, activeDocFsPath: string, root?: string): string[] {
	if (startsWith(value, '/') && !root) {
		return [];
	}

	const lastIndexOfSlash = value.lastIndexOf('/');
	let parentDir: string;
	if (lastIndexOfSlash === -1) {
		parentDir = path.resolve(root);
	} else {
		const valueBeforeLastSlash = value.slice(0, lastIndexOfSlash + 1);

		parentDir = startsWith(value, '/')
			? path.resolve(root, '.' + valueBeforeLastSlash)
			: path.resolve(activeDocFsPath, '..', valueBeforeLastSlash);
	}

	try {
		return fs.readdirSync(parentDir).map(f => {
			return fs.statSync(path.resolve(parentDir, f)).isDirectory()
				? f + '/'
				: f;
		});
	} catch (e) {
		return [];
	}
}

function pathToSuggestion(p: string, value: string, range: Range): CompletionItem {
	const isDir = p[p.length - 1] === '/';

	let replaceRange: Range;
	const lastIndexOfSlash = value.lastIndexOf('/');
	if (lastIndexOfSlash === -1) {
		replaceRange = getFullReplaceRange(range);
	} else {
		const valueAfterLastSlash = value.slice(lastIndexOfSlash + 1);
		replaceRange = getReplaceRange(range, valueAfterLastSlash);
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

function getFullReplaceRange(valueRange: Range) {
	const start = Position.create(valueRange.end.line, valueRange.start.character + 1);
	const end = Position.create(valueRange.end.line, valueRange.end.character - 1);
	return Range.create(start, end);
}
function getReplaceRange(valueRange: Range, valueAfterLastSlash: string) {
	const start = Position.create(valueRange.end.line, valueRange.end.character - 1 - valueAfterLastSlash.length);
	const end = Position.create(valueRange.end.line, valueRange.end.character - 1);
	return Range.create(start, end);
}

// Selected from https://stackoverflow.com/a/2725168/1780148
const PATH_TAG_AND_ATTR: { [tag: string]: string | string[] } = {
	// HTML 4
	a: 'href',
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
	input: 'formaction',
	source: 'src',
	track: 'src',
	video: ['src', 'poster']
};
