/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HTMLDocument, TextDocument as LSTextDocument } from 'vscode-html-languageservice';
import { getLanguageService } from './util';

type Pair<K, V> = {
	key: K;
	value: V;
};

// Map(filename, Pair(fileVersion, parsedContent))
const _parseCache = new Map<string, Pair<number, HTMLDocument> | undefined>();

export function parseHTMLDocument(document: LSTextDocument): HTMLDocument {
	const languageService = getLanguageService();
	const key = document.uri;
	const result = _parseCache.get(key);
	const documentVersion = document.version;
	if (result) {
		if (documentVersion === result.key) {
			return result.value;
		}
	}

	const parsedDocument = languageService.parseHTMLDocument(document);
	_parseCache.set(key, { key: documentVersion, value: parsedDocument });
	return parsedDocument;
}

export function addFileToParseCache(document: LSTextDocument) {
	const filename = document.uri;
	_parseCache.set(filename, undefined);
}

export function removeFileFromParseCache(document: LSTextDocument) {
	const filename = document.uri;
	_parseCache.delete(filename);
}
