/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ttPolicy } from './htmlHelper';

const CONTROL_CODES = '\\u0000-\\u0020\\u007f-\\u009f';
const WEB_LINK_REGEX = new RegExp('(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\\/\\/|data:|www\\.)[^\\s' + CONTROL_CODES + '"]{2,}[^\\s' + CONTROL_CODES + '"\')}\\],:;.!?]', 'ug');

const WIN_ABSOLUTE_PATH = /(?<=^|\s)(?:[a-zA-Z]:(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_RELATIVE_PATH = /(?<=^|\s)(?:(?:\~|\.)(?:(?:\\|\/)[\w\.-]*)+)/;
const WIN_PATH = new RegExp(`(${WIN_ABSOLUTE_PATH.source}|${WIN_RELATIVE_PATH.source})`);
const POSIX_PATH = /(?<=^|\s)((?:\~|\.)?(?:\/[\w\.-]*)+)/;
const LINE_COLUMN = /(?:\:([\d]+))?(?:\:([\d]+))?/;
const isWindows = (typeof navigator !== 'undefined') ? navigator.userAgent && navigator.userAgent.indexOf('Windows') >= 0 : false;
const PATH_LINK_REGEX = new RegExp(`${isWindows ? WIN_PATH.source : POSIX_PATH.source}${LINE_COLUMN.source}`, 'g');
const HTML_LINK_REGEX = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*?>.*?<\/a>/gi;

const MAX_LENGTH = 2000;

type LinkKind = 'web' | 'path' | 'html' | 'text';
type LinkPart = {
	kind: LinkKind;
	value: string;
	captures: string[];
};

export class LinkDetector {

	// used by unit tests
	static injectedHtmlCreator: (value: string) => string;

	private shouldGenerateHtml(trustHtml: boolean) {
		return trustHtml && (!!LinkDetector.injectedHtmlCreator || !!ttPolicy);
	}

	private createHtml(value: string) {
		if (LinkDetector.injectedHtmlCreator) {
			return LinkDetector.injectedHtmlCreator(value);
		}
		else {
			return ttPolicy?.createHTML(value).toString();
		}
	}

	/**
	 * Matches and handles web urls, absolute and relative file links in the string provided.
	 * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/>.
	 * 'onclick' event is attached to all anchored links that opens them in the editor.
	 * When splitLines is true, each line of the text, even if it contains no links, is wrapped in a <span>
	 * and added as a child of the returned <span>.
	 */
	linkify(text: string, splitLines?: boolean, workspaceFolder?: string, trustHtml?: boolean): HTMLElement {
		if (splitLines) {
			const lines = text.split('\n');
			for (let i = 0; i < lines.length - 1; i++) {
				lines[i] = lines[i] + '\n';
			}
			if (!lines[lines.length - 1]) {
				// Remove the last element ('') that split added.
				lines.pop();
			}
			const elements = lines.map(line => this.linkify(line, false, workspaceFolder, trustHtml));
			if (elements.length === 1) {
				// Do not wrap single line with extra span.
				return elements[0];
			}
			const container = document.createElement('span');
			elements.forEach(e => container.appendChild(e));
			return container;
		}

		const container = document.createElement('span');
		for (const part of this.detectLinks(text)) {
			try {
				switch (part.kind) {
					case 'text':
						container.appendChild(document.createTextNode(part.value));
						break;
					case 'web':
					case 'path':
						container.appendChild(this.createWebLink(part.value));
						break;
					case 'html':
						if (this.shouldGenerateHtml(!!trustHtml)) {
							const span = document.createElement('span');
							span.innerHTML = this.createHtml(part.value)!;
							container.appendChild(span);
						} else {
							container.appendChild(document.createTextNode(part.value));
						}
						break;
				}
			} catch (e) {
				container.appendChild(document.createTextNode(part.value));
			}
		}
		return container;
	}

	private createWebLink(url: string): Node {
		const link = this.createLink(url);
		link.href = url;
		return link;
	}

	// private createPathLink(text: string, path: string, lineNumber: number, columnNumber: number, workspaceFolder: string | undefined): Node {
	// 	if (path[0] === '/' && path[1] === '/') {
	// 		// Most likely a url part which did not match, for example ftp://path.
	// 		return document.createTextNode(text);
	// 	}

	// 	const options = { selection: { startLineNumber: lineNumber, startColumn: columnNumber } };
	// 	if (path[0] === '.') {
	// 		if (!workspaceFolder) {
	// 			return document.createTextNode(text);
	// 		}
	// 		const uri = workspaceFolder.toResource(path);
	// 		const link = this.createLink(text);
	// 		this.decorateLink(link, uri, (preserveFocus: boolean) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
	// 		return link;
	// 	}

	// 	if (path[0] === '~') {
	// 		const userHome = this.pathService.resolvedUserHome;
	// 		if (userHome) {
	// 			path = osPath.join(userHome.fsPath, path.substring(1));
	// 		}
	// 	}

	// 	const link = this.createLink(text);
	// 	link.tabIndex = 0;
	// 	const uri = URI.file(osPath.normalize(path));
	// 	this.fileService.resolve(uri).then(stat => {
	// 		if (stat.isDirectory) {
	// 			return;
	// 		}
	// 		this.decorateLink(link, uri, (preserveFocus: boolean) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
	// 	}).catch(() => {
	// 		// If the uri can not be resolved we should not spam the console with error, remain quite #86587
	// 	});
	// 	return link;
	// }

	private createLink(text: string): HTMLAnchorElement {
		const link = document.createElement('a');
		link.textContent = text;
		return link;
	}

	private detectLinks(text: string): LinkPart[] {
		if (text.length > MAX_LENGTH) {
			return [{ kind: 'text', value: text, captures: [] }];
		}

		const regexes: RegExp[] = [HTML_LINK_REGEX, WEB_LINK_REGEX, PATH_LINK_REGEX];
		const kinds: LinkKind[] = ['html', 'web', 'path'];
		const result: LinkPart[] = [];

		const splitOne = (text: string, regexIndex: number) => {
			if (regexIndex >= regexes.length) {
				result.push({ value: text, kind: 'text', captures: [] });
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
					captures: match.slice(1)
				});
				currentIndex = match.index + value.length;
			}
			const stringAfterMatches = text.substring(currentIndex);
			if (stringAfterMatches) {
				splitOne(stringAfterMatches, regexIndex + 1);
			}
		};

		splitOne(text, 0);
		return result;
	}
}

const linkDetector = new LinkDetector();
export function linkify(text: string, splitLines?: boolean, workspaceFolder?: string, trustHtml = false) {
	return linkDetector.linkify(text, splitLines, workspaceFolder, trustHtml);
}
