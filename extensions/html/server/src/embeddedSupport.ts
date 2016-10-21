/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { TextDocument, Position, HTMLDocument, Node, LanguageService, TokenType } from 'vscode-html-languageservice';

export function getEmbeddedLanguageAtPosition(languageService: LanguageService, document: TextDocument, htmlDocument: HTMLDocument, position: Position): string {
	let offset = document.offsetAt(position);
	let node = htmlDocument.findNodeAt(offset);
	if (node && node.children.length === 0) {
		let embeddedContent = getEmbeddedContentForNode(languageService, document, node);
		if (embeddedContent && embeddedContent.start <= offset && offset <= embeddedContent.end) {
			return embeddedContent.languageId;
		}
	}
	return null;
}

export function getEmbeddedContent(languageService: LanguageService, document: TextDocument, htmlDocument: HTMLDocument, languageId: string): string {
	let contents = [];
	function collectEmbeddedNodes(node: Node): void {
		let c = getEmbeddedContentForNode(languageService, document, node);
		if (c && c.languageId === languageId) {
			contents.push(c);
		}
		node.children.forEach(collectEmbeddedNodes);
	}

	htmlDocument.roots.forEach(collectEmbeddedNodes);

	let currentPos = 0;
	let oldContent = document.getText();
	let result = '';
	for (let c of contents) {
		result = substituteWithWhitespace(result, currentPos, c.start, oldContent);
		result += oldContent.substring(c.start, c.end);
		currentPos = c.end;
	}
	result = substituteWithWhitespace(result, currentPos, oldContent.length, oldContent);
	return result;
}

function substituteWithWhitespace(result, start, end, oldContent) {
	let accumulatedWS = 0;
	for (let i = start; i < end; i++) {
		let ch = oldContent[i];
		if (ch === '\n' || ch === '\r') {
			// only write new lines, skip the whitespace
			accumulatedWS = 0;
			result += ch;
		} else {
			accumulatedWS++;
		}
	}
	result = append(result, ' ', accumulatedWS);
	return result;
}

function append(result: string, str: string, n: number): string {
	while (n) {
		if (n & 1) {
			result += str;
		}
		n >>= 1;
		str += str;
	}
	return result;
}

function getEmbeddedContentForNode(languageService: LanguageService, document: TextDocument, node: Node): { languageId: string, start: number, end: number } {
	if (node.tag === 'style') {
		let scanner = languageService.createScanner(document.getText().substring(node.start, node.end));
		let token = scanner.scan();
		while (token !== TokenType.EOS) {
			if (token === TokenType.Styles) {
				return { languageId: 'css', start: node.start + scanner.getTokenOffset(), end: node.start + scanner.getTokenEnd() };
			}
			token = scanner.scan();
		}
	} else if (node.tag === 'script') {
		let scanner = languageService.createScanner(document.getText().substring(node.start, node.end));
		let token = scanner.scan();
		let isTypeAttribute = false;
		let languageId = 'javascript';
		while (token !== TokenType.EOS) {
			if (token === TokenType.AttributeName) {
				isTypeAttribute = scanner.getTokenText() === 'type';
			} else if (token === TokenType.AttributeValue) {
				if (isTypeAttribute) {
					if (/["'](text|application)\/(java|ecma)script["']/.test(scanner.getTokenText())) {
						languageId = 'javascript';
					} else {
						languageId = void 0;
					}
				}
				isTypeAttribute = false;
			} else if (token === TokenType.Script) {
				return { languageId, start: node.start + scanner.getTokenOffset(), end: node.start + scanner.getTokenEnd() };
			}
			token = scanner.scan();
		}
	}
	return void 0;
}