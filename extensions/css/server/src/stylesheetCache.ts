/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextDocument} from 'vscode-languageserver';
import {Stylesheet} from 'vscode-css-languageservice';

export interface StylesheetCache {
	getStylesheet(document: TextDocument): Stylesheet;
	onDocumentRemoved(document: TextDocument): void;
	dispose(): void;
}

export function getStylesheetCache(maxEntries: number, cleanupIntervalTimeInSec: number, parseStylesheet: (document: TextDocument) => Stylesheet) : StylesheetCache {
	let styleSheets: { [uri:string]: {version:number, languageId: string, cTime: number, stylesheet: Stylesheet}} = {};
	let nStyleSheets = 0;

	let cleanupInterval = void 0;
	if (cleanupIntervalTimeInSec > 0) {
		cleanupInterval = setInterval(() => {
			let cutoffTime = Date.now() - cleanupIntervalTimeInSec * 1000;
			let uris = Object.keys(styleSheets);
			for (let uri of uris) {
				let stylesheetInfo = styleSheets[uri];
				if (stylesheetInfo.cTime < cutoffTime) {
					delete styleSheets[uri];
					nStyleSheets--;
				}
			}
		}, cleanupIntervalTimeInSec * 1000);
	}

	return {
		getStylesheet(document: TextDocument) {
			let version = document.version;
			let languageId = document.languageId;
			let stylesheetInfo = styleSheets[document.uri];
			if (stylesheetInfo && stylesheetInfo.version === version && stylesheetInfo.languageId === languageId) {
				stylesheetInfo.cTime = Date.now();
				return stylesheetInfo.stylesheet;
			}
			let stylesheet = parseStylesheet(document);
			styleSheets[document.uri] = { stylesheet, version, languageId, cTime: Date.now()};
			if (!stylesheetInfo) {
				nStyleSheets++;
			}

			if (nStyleSheets === maxEntries) {
				let oldestTime = Number.MAX_VALUE;
				let oldestUri = null;
				for (let uri in styleSheets) {
					let stylesheetInfo = styleSheets[uri];
					if (stylesheetInfo.cTime < oldestTime) {
						oldestUri = uri;
						oldestTime = stylesheetInfo.cTime;
					}
				}
				if (oldestUri) {
					delete styleSheets[oldestUri];
					nStyleSheets--;
				}
			}
			return stylesheet;

		},
		onDocumentRemoved(document: TextDocument) {
			let uri = document.uri;
			if (styleSheets[uri]) {
				delete styleSheets[uri];
				nStyleSheets--;
			}
		},
		dispose() {
			if (typeof cleanupInterval !== 'undefined') {
				clearInterval(cleanupInterval);
				cleanupInterval = void 0;
				styleSheets = {};
				nStyleSheets = 0;
			}
		}
	};
}