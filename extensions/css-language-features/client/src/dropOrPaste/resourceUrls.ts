/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import type { URI } from 'vscode-uri';
import type { UriList } from './uriList';

export function createUriListText(documentDir: URI | undefined, uriList: UriList, languageId = 'css'): string {
	return uriList.entries.map(entry => {
		const suffixStart = entry.str.search(/[?#]/);
		const pathText = suffixStart < 0 ? entry.str : entry.str.slice(0, suffixStart);
		const hasEncodedPathSeparator = /%2f|%5c/i.test(pathText);
		const relativePath = hasEncodedPathSeparator ? undefined : getRelativePath(documentDir, entry.uri);
		const suffix = suffixStart < 0 ? '' : entry.str.slice(suffixStart);
		const url = relativePath === undefined
			? entry.str
			: relativePath.split('/').map(encodeURIComponent).join('/') + suffix;
		return `url("${escapeCssString(url, languageId)}")`;
	}).join(' ');
}

function getRelativePath(from: URI | undefined, to: URI): string | undefined {
	if (!from || from.scheme !== to.scheme || from.authority !== to.authority) {
		return undefined;
	}

	if (to.scheme === 'file') {
		const fromDrive = /^\/(?<drive>[a-z]:)(?:\/|$)/i.exec(from.path)?.groups?.drive;
		const toDrive = /^\/(?<drive>[a-z]:)(?:\/|$)/i.exec(to.path)?.groups?.drive;
		if (fromDrive?.toLowerCase() !== toDrive?.toLowerCase()) {
			return undefined;
		}

		const relativePath = path.relative(from.fsPath, to.fsPath);
		if (path.isAbsolute(relativePath)) {
			return undefined;
		}
		return withTrailingSlash(relativePath.split(path.sep).join('/') || '.', to);
	}

	return withTrailingSlash(path.posix.relative(from.path, to.path) || '.', to);
}

function withTrailingSlash(relativePath: string, uri: URI): string {
	return uri.path.endsWith('/') && !relativePath.endsWith('/') ? relativePath + '/' : relativePath;
}

function escapeCssString(value: string, languageId: string): string {
	return value.replace(/["\\\x00-\x1f\x7f]|[#@$](?=\{)/g, char => {
		if (char === '#' && languageId !== 'scss' || (char === '@' || char === '$') && languageId !== 'less') {
			return char;
		}
		if (char === '"' || char === '\\') {
			return '\\' + char;
		}
		return '\\' + char.charCodeAt(0).toString(16) + ' ';
	});
}

/** Checks all insertion positions in a single forward scan of the document. */
export function shouldInsertCssUrl(text: string, offsets: readonly number[], languageId: string): boolean {
	let depth = 0;
	let urlDepth = 0;
	let urlQuoteAllowed = false;
	let inUnquotedUrl = false;
	let quote: string | undefined;
	let commentStart: number | undefined;
	let inLineComment = false;
	let escapedUntil = -1;
	let i = 0;

	for (const offset of [...offsets].sort((a, b) => a - b)) {
		for (; i < offset; i++) {
			const char = text[i];
			if (commentStart !== undefined) {
				if (char === '/' && text[i - 1] === '*' && i > commentStart + 2) {
					commentStart = undefined;
				}
				continue;
			}
			if (inLineComment) {
				if (char === '\n' || char === '\r') {
					inLineComment = false;
				}
				continue;
			}
			if (i <= escapedUntil) {
				continue;
			}
			if (quote) {
				if (char === '\\') {
					escapedUntil = i + (text[i + 1] === '\r' && text[i + 2] === '\n' ? 2 : 1);
				} else if (char === quote || char === '\n' || char === '\r' || char === '\f') {
					quote = undefined;
				}
				continue;
			}
			if (urlQuoteAllowed && !/[\t\n\r\f ]/.test(char)) {
				inUnquotedUrl = char !== '"' && char !== '\'';
				urlQuoteAllowed = false;
			}
			const inUrlToken = inUnquotedUrl && depth === urlDepth;
			if (char === '\\') {
				escapedUntil = i + 1;
			} else if (char === '/' && text[i + 1] === '*' && !inUrlToken) {
				commentStart = i;
			} else if (char === '/' && text[i + 1] === '/' && languageId !== 'css' && !urlDepth) {
				inLineComment = true;
			} else if ((char === '"' || char === '\'') && !inUrlToken) {
				quote = char;
			} else if (char === '(') {
				depth++;
				let start = i;
				while (start > 0 && /[\w\u0080-\uffff-]/.test(text[start - 1])) {
					start--;
				}
				if (!urlDepth && text.slice(start, i).toLowerCase() === 'url') {
					urlDepth = depth;
					urlQuoteAllowed = true;
				}
			} else if (char === ')') {
				if (depth === urlDepth) {
					urlDepth = 0;
					inUnquotedUrl = false;
					urlQuoteAllowed = false;
				}
				depth = Math.max(0, depth - 1);
			}
		}
		if (urlDepth || quote || commentStart !== undefined || inLineComment) {
			return false;
		}
	}

	return offsets.length > 0;
}
