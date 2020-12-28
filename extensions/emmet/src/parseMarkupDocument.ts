/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode';
import { HtmlNode as HtmlFlatNode } from 'EmmetFlatNode';
import parse from '@emmetio/html-matcher';

type Pair<K, V> = {
	key: K;
	value: V;
};

// Map(filename, Pair(fileVersion, rootNodeOfParsedContent))
const _parseCache = new Map<string, Pair<number, HtmlFlatNode> | undefined>();

export function getRootNode(document: TextDocument, useCache: boolean = true): HtmlFlatNode {
	const key = document.uri.toString();
	const result = _parseCache.get(key);
	const documentVersion = document.version;
	if (useCache && result) {
		if (documentVersion === result.key) {
			return result.value;
		}
	}

	const rootNode = parse(document.getText());
	if (useCache) {
		_parseCache.set(key, { key: documentVersion, value: rootNode });
	}
	return rootNode;
}

export function addFileToMarkupParseCache(document: TextDocument) {
	const filename = document.uri.toString();
	_parseCache.set(filename, undefined);
}

export function removeFileFromMarkupParseCache(document: TextDocument) {
	const filename = document.uri.toString();
	_parseCache.delete(filename);
}
