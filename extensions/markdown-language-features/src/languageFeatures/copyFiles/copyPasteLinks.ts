/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { uriToWorkspaceEdit } from './shared';
class PasteLinkEditProvider implements vscode.DocumentPasteEditProvider {

	readonly id = 'insertMarkdownLink';
	async provideDocumentPasteEdits(
		document: vscode.TextDocument,
		ranges: readonly vscode.Range[],
		dataTransfer: vscode.DataTransfer,
		token: vscode.CancellationToken,
	): Promise<vscode.DocumentPasteEdit | undefined> {
		const enabled = vscode.workspace.getConfiguration('markdown', document).get<'always' | 'smart' | 'never'>('editor.pasteUrlAsFormattedLink.enabled', 'smart');
		if (enabled === 'never') {
			return;
		}

		const item = dataTransfer.get('text/plain');
		if (!detectLinks(item?.value)) {
			return;
		}

		const uriEdit = new vscode.DocumentPasteEdit('', this.id, '');
		const urlList = await item?.asString();
		if (!urlList) {
			return undefined;
		}
		const pasteEdit = await uriToWorkspaceEdit(document, ranges, urlList, token);
		if (!pasteEdit) {
			return;
		}

		uriEdit.label = pasteEdit.label;
		uriEdit.additionalEdit = pasteEdit.additionalEdits;
		return uriEdit;
	}
}

// function checkURL(item: vscode.DataTransferItem | undefined) {
// 	try {
// 		const url = new URL(item?.value);
// 		return externalUriSchemes.includes(url.protocol.slice(0, -1));
// 	} catch (error) {
// 		return false;
// 	}
// }

const CONTROL_CODES = '\\u0000-\\u0020\\u007f-\\u009f';
const WEB_LINK_REGEX = new RegExp('(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\\/\\/|data:|www\\.)[^\\s' + CONTROL_CODES + '"]{2,}[^\\s' + CONTROL_CODES + '"\')}\\],:;.!?]', 'ug');
const WIN_ABSOLUTE_PATH = /(?<=^|\s)(?:[a-zA-Z]:(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_RELATIVE_PATH = /(?<=^|\s)(?:(?:\~|\.)(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_PATH = new RegExp(`(${WIN_ABSOLUTE_PATH.source}|${WIN_RELATIVE_PATH.source})`);
const POSIX_PATH = /(?<=^|\s)((?:\~|\.)?(?:\/[\w\.-]*)+)/;
const LINE_COLUMN = /(?:\:([\d]+))?(?:\:([\d]+))?/;
const isWindows = (typeof navigator !== 'undefined') ? navigator.userAgent && navigator.userAgent.indexOf('Windows') >= 0 : false;
const PATH_LINK_REGEX = new RegExp(`${isWindows ? WIN_PATH.source : POSIX_PATH.source}${LINE_COLUMN.source}`, 'g');

const MAX_LENGTH = 2000;

type LinkKind = 'web' | 'path' | 'text';
type LinkPart = {
	kind: LinkKind;
	value: string;
};

function detectLinks(text: string): boolean | undefined {
	if (text.length > MAX_LENGTH) {
		return;
	}

	const regexes: RegExp[] = [WEB_LINK_REGEX, PATH_LINK_REGEX];
	const kinds: LinkKind[] = ['web', 'path'];
	const result: LinkPart[] = [];


	const splitOne = (text: string, regexIndex: number) => {
		if (regexIndex >= regexes.length) {
			const words = text.split(/\s+/); // Split the text into words based on white spaces or new lines
			for (const word of words) {
				if (word) { // Check if the word is not an empty string
					result.push({ value: word, kind: 'text' });
				}
			}
			return;
		}

		const regex = regexes[regexIndex];
		let currentIndex = 0;
		let match;
		regex.lastIndex = 0;
		while ((match = regex.exec(text)) !== null) {
			const stringBeforeMatch = text.substring(currentIndex, match.index);
			if (stringBeforeMatch) {
				splitOne(stringBeforeMatch, regexIndex + 1);
			}
			const value = match[0];
			result.push({
				value: value,
				kind: kinds[regexIndex],
			});
			currentIndex = match.index + value.length;
		}
		const stringAfterMatches = text.substring(currentIndex);
		if (stringAfterMatches) {
			splitOne(stringAfterMatches, regexIndex + 1);
		}
	};

	splitOne(text, 0);
	for (const r of result) {
		if (r.kind === 'text') {
			return false;
		}
	}
	return true;
}


export function registerLinkPasteSupport(selector: vscode.DocumentSelector,) {
	return vscode.languages.registerDocumentPasteEditProvider(selector, new PasteLinkEditProvider(), {
		pasteMimeTypes: [
			'text/plain',
		]
	});
}
