"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkDetector = void 0;
exports.linkify = linkify;
const htmlHelper_1 = require("./htmlHelper");
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
class LinkDetector {
    // used by unit tests
    static injectedHtmlCreator;
    shouldGenerateHtml(trustHtml) {
        return trustHtml && (!!LinkDetector.injectedHtmlCreator || !!htmlHelper_1.ttPolicy);
    }
    createHtml(value) {
        if (LinkDetector.injectedHtmlCreator) {
            return LinkDetector.injectedHtmlCreator(value);
        }
        else {
            return htmlHelper_1.ttPolicy?.createHTML(value).toString();
        }
    }
    /**
     * Matches and handles web urls, absolute and relative file links in the string provided.
     * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/>.
     * 'onclick' event is attached to all anchored links that opens them in the editor.
     * When splitLines is true, each line of the text, even if it contains no links, is wrapped in a <span>
     * and added as a child of the returned <span>.
     */
    linkify(text, options, splitLines) {
        if (splitLines) {
            const lines = text.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
                lines[i] = lines[i] + '\n';
            }
            if (!lines[lines.length - 1]) {
                // Remove the last element ('') that split added.
                lines.pop();
            }
            const elements = lines.map(line => this.linkify(line, options, false));
            if (elements.length === 1) {
                // Do not wrap single line with extra span.
                return elements[0];
            }
            const container = document.createElement('span');
            elements.forEach(e => container.appendChild(e));
            return container;
        }
        const container = document.createElement('span');
        for (const part of this.detectLinks(text, !!options.trustHtml, options.linkifyFilePaths)) {
            try {
                let span = null;
                switch (part.kind) {
                    case 'text':
                        container.appendChild(document.createTextNode(part.value));
                        break;
                    case 'web':
                    case 'path':
                        container.appendChild(this.createWebLink(part.value));
                        break;
                    case 'html':
                        span = document.createElement('span');
                        span.innerHTML = this.createHtml(part.value);
                        container.appendChild(span);
                        break;
                }
            }
            catch (e) {
                container.appendChild(document.createTextNode(part.value));
            }
        }
        return container;
    }
    createWebLink(url) {
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
    createLink(text) {
        const link = document.createElement('a');
        link.textContent = text;
        return link;
    }
    detectLinks(text, trustHtml, detectFilepaths) {
        if (text.length > MAX_LENGTH) {
            return [{ kind: 'text', value: text, captures: [] }];
        }
        const regexes = [];
        const kinds = [];
        const result = [];
        if (this.shouldGenerateHtml(trustHtml)) {
            regexes.push(HTML_LINK_REGEX);
            kinds.push('html');
        }
        regexes.push(WEB_LINK_REGEX);
        kinds.push('web');
        if (detectFilepaths) {
            regexes.push(PATH_LINK_REGEX);
            kinds.push('path');
        }
        const splitOne = (text, regexIndex) => {
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
exports.LinkDetector = LinkDetector;
const linkDetector = new LinkDetector();
function linkify(text, linkOptions, splitLines) {
    return linkDetector.linkify(text, linkOptions, splitLines);
}
//# sourceMappingURL=linkify.js.map