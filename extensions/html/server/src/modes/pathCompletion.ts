/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, CompletionList, CompletionItemKind, CompletionItem } from 'vscode-languageserver-types';
import { WorkspaceFolder } from 'vscode-languageserver-protocol/lib/protocol.workspaceFolders.proposed';
import * as path from 'path';
import * as fs from 'fs';
import URI from 'vscode-uri';
import { ICompletionParticipant } from 'vscode-html-languageservice/lib/htmlLanguageService';
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
				let workspaceRoot;

				if (startsWith(value, '/')) {
					if (!workspaceFolders || workspaceFolders.length === 0) {
						return;
					}

					workspaceRoot = resolveWorkspaceRoot(document, workspaceFolders);
				}

				const suggestions = providePathSuggestions(value, URI.parse(document.uri).fsPath, workspaceRoot);
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

export function providePathSuggestions(value: string, activeDocFsPath: string, root?: string): CompletionItem[] {
	if (value.indexOf('/') === -1) {
		return [];
	}

	if (startsWith(value, '/') && !root) {
		return [];
	}

	const valueAfterLastSlash = value.slice(value.lastIndexOf('/') + 1);
	const valueBeforeLastSlash = value.slice(0, value.lastIndexOf('/') + 1);
	const parentDir = startsWith(value, '/')
		? path.resolve(root, '.' + valueBeforeLastSlash)
		: path.resolve(activeDocFsPath, '..', valueBeforeLastSlash);

	return fs.readdirSync(parentDir).map(f => {
		return {
			label: f,
			kind: isDir(path.resolve(parentDir, f)) ? CompletionItemKind.Folder : CompletionItemKind.File,
			insertText: f.slice(valueAfterLastSlash.length)
		};
	});
}

const isDir = (p: string) => {
	return fs.statSync(p).isDirectory();
};

function resolveWorkspaceRoot(activeDoc: TextDocument, workspaceFolders: WorkspaceFolder[]): string | undefined {
	for (let i = 0; i < workspaceFolders.length; i++) {
		if (startsWith(activeDoc.uri, workspaceFolders[i].uri)) {
			return path.resolve(URI.parse(workspaceFolders[i].uri).fsPath);
		}
	}
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
