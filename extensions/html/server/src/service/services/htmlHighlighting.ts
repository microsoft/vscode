/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {HTMLDocument} from '../parser/htmlParser';
import {TokenType, createScanner} from '../parser/htmlScanner';
import {TextDocument, Range, Position, DocumentHighlightKind, DocumentHighlight} from 'vscode-languageserver-types';

export function findDocumentHighlights(document: TextDocument, position: Position, htmlDocument: HTMLDocument): DocumentHighlight[] {
	let offset = document.offsetAt(position);
	let node = htmlDocument.findNodeAt(offset);
	if (!node.tag || typeof node.endTagStart !== 'number') {
		return [];
	}
	let startTagRange = getTagNameRange(TokenType.StartTag, document, node.start);
	let endTagRange = getTagNameRange(TokenType.EndTag, document, node.endTagStart);
	if (startTagRange && endTagRange && (covers(startTagRange, position) || covers(endTagRange, position))) {
		return [ { kind: DocumentHighlightKind.Read, range: startTagRange }, { kind: DocumentHighlightKind.Read, range: endTagRange }];
	}
	return [];
}

function isBeforeOrEqual(pos1: Position, pos2: Position) {
	return pos1.line < pos2.line || (pos1.line === pos2.line && pos1.character <= pos2.character);
}

function covers(range: Range, position: Position) {
	return isBeforeOrEqual(range.start, position) && isBeforeOrEqual(position, range.end);
}

function getTagNameRange(tokenType: TokenType, document: TextDocument, startOffset: number ) : Range {
	let scanner = createScanner(document.getText(), startOffset);
	let token = scanner.scan();
	while (token !== TokenType.EOS && token !== TokenType.StartTag) {
		token = scanner.scan();
	}
	if (token !== TokenType.EOS) {
		return  { start: document.positionAt(scanner.getTokenOffset()), end: document.positionAt(scanner.getTokenEnd()) };
	}
	return null;
}
