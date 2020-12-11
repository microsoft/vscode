/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { HTMLDocument, TextDocument as LSTextDocument } from 'vscode-html-languageservice';
import { getLanguageService } from './util';

type Pair<K, V> = {
	key: K;
	value: V;
};

// Map(filename, Pair(fileContent, parsedContent))
const _parseCache = new Map<string, Pair<string, HTMLDocument> | undefined>();

export function parseHTMLDocument(document: LSTextDocument): HTMLDocument {
	const languageService = getLanguageService();
	const key = document.uri;
	const result = _parseCache.get(key);
	const documentTextHash = getSha256(document.getText());
	if (result) {
		if (documentTextHash === result.key) {
			return result.value;
		}
	}

	const parsedDocument = languageService.parseHTMLDocument(document);
	_parseCache.set(key, { key: documentTextHash, value: parsedDocument });
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

function getSha256(text: string): string {
	const sha256 = createHash('sha256');
	sha256.update(text);
	return sha256.digest('hex');
}
