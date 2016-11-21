/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { TextDocument, Position, HTMLDocument, Node, LanguageService, TokenType, Range, Scanner } from 'vscode-html-languageservice';

export interface LanguageRange extends Range {
	languageId: string;
}

interface EmbeddedContent { languageId: string; start: number; end: number; attributeValue?: boolean; };

export function getLanguageAtPosition(languageService: LanguageService, document: TextDocument, htmlDocument: HTMLDocument, position: Position): string {
	let offset = document.offsetAt(position);
	let node = htmlDocument.findNodeAt(offset);
	if (node) {
		let embeddedContent = getEmbeddedContentForNode(languageService, document, node);
		if (embeddedContent) {
			for (let c of embeddedContent) {
				if (c.start <= offset && offset <= c.end) {
					return c.languageId;
				}
			}
		}
	}
	return 'html';
}

export function getLanguagesInContent(languageService: LanguageService, document: TextDocument, htmlDocument: HTMLDocument): string[] {
	let embeddedLanguageIds = ['html'];
	const maxEmbbeddedLanguages = 3;
	function collectEmbeddedLanguages(node: Node): void {
		if (embeddedLanguageIds.length < maxEmbbeddedLanguages) {
			let embeddedContent = getEmbeddedContentForNode(languageService, document, node);
			if (embeddedContent) {
				for (let c of embeddedContent) {
					if (!isWhitespace(document.getText(), c.start, c.end)) {
						if (embeddedLanguageIds.lastIndexOf(c.languageId) === -1) {
							embeddedLanguageIds.push(c.languageId);
							if (embeddedLanguageIds.length === maxEmbbeddedLanguages) {
								return;
							}
						}
					}
				}
			}
			node.children.forEach(collectEmbeddedLanguages);
		}
	}

	htmlDocument.roots.forEach(collectEmbeddedLanguages);
	return embeddedLanguageIds;
}

export function getLanguagesInRange(languageService: LanguageService, document: TextDocument, htmlDocument: HTMLDocument, range: Range): LanguageRange[] {
	let ranges: LanguageRange[] = [];
	let currentPos = range.start;
	let currentOffset = document.offsetAt(currentPos);
	let rangeEndOffset = document.offsetAt(range.end);
	function collectEmbeddedNodes(node: Node): void {
		if (node.start < rangeEndOffset && node.end > currentOffset) {
			let embeddedContent = getEmbeddedContentForNode(languageService, document, node);
			if (embeddedContent) {
				for (let c of embeddedContent) {
					if (c.start < rangeEndOffset) {
						let startPos = document.positionAt(c.start);
						if (currentOffset < c.start) {
							ranges.push({
								start: currentPos,
								end: startPos,
								languageId: 'html'
							});
						}
						let end = Math.min(c.end, rangeEndOffset);
						let endPos = document.positionAt(end);
						if (end > c.start) {
							ranges.push({
								start: startPos,
								end: endPos,
								languageId: c.languageId
							});
						}
						currentOffset = end;
						currentPos = endPos;
					}
				}
			}
		}
		node.children.forEach(collectEmbeddedNodes);
	}

	htmlDocument.roots.forEach(collectEmbeddedNodes);
	if (currentOffset < rangeEndOffset) {
		ranges.push({
			start: currentPos,
			end: range.end,
			languageId: 'html'
		});
	}
	return ranges;
}

export function getEmbeddedDocument(languageService: LanguageService, document: TextDocument, htmlDocument: HTMLDocument, languageId: string): TextDocument {
	let contents: EmbeddedContent[] = [];
	function collectEmbeddedNodes(node: Node): void {
		let embeddedContent = getEmbeddedContentForNode(languageService, document, node);
		if (embeddedContent) {
			for (let c of embeddedContent) {
				if (c.languageId === languageId) {
					contents.push(c);
				}
			}
		}
		node.children.forEach(collectEmbeddedNodes);
	}

	htmlDocument.roots.forEach(collectEmbeddedNodes);

	let currentPos = 0;
	let oldContent = document.getText();
	let result = '';
	let lastSuffix = '';
	for (let c of contents) {
		result = substituteWithWhitespace(result, currentPos, c.start, oldContent, lastSuffix, getPrefix(c));
		result += oldContent.substring(c.start, c.end);
		currentPos = c.end;
		lastSuffix = getSuffix(c);
	}
	result = substituteWithWhitespace(result, currentPos, oldContent.length, oldContent, lastSuffix, '');
	return TextDocument.create(document.uri, languageId, document.version, result);
}

function getPrefix(c: EmbeddedContent) {
	if (c.attributeValue) {
		switch (c.languageId) {
			case 'css': return 'x{';
		}
	}
	return '';
}
function getSuffix(c: EmbeddedContent) {
	if (c.attributeValue) {
		switch (c.languageId) {
			case 'css': return '}';
			case 'javascript': return ';';
		}
	}
	return '';
}


function substituteWithWhitespace(result: string, start: number, end: number, oldContent: string, before: string, after: string) {
	let accumulatedWS = 0;
	result += before;
	for (let i = start + before.length; i < end; i++) {
		let ch = oldContent[i];
		if (ch === '\n' || ch === '\r') {
			// only write new lines, skip the whitespace
			accumulatedWS = 0;
			result += ch;
		} else {
			accumulatedWS++;
		}
	}
	result = append(result, ' ', accumulatedWS - after.length);
	result += after;
	return result;
}

function append(result: string, str: string, n: number): string {
	while (n > 0) {
		if (n & 1) {
			result += str;
		}
		n >>= 1;
		str += str;
	}
	return result;
}

function getEmbeddedContentForNode(languageService: LanguageService, document: TextDocument, node: Node): EmbeddedContent[] {
	if (node.tag === 'style') {
		let scanner = languageService.createScanner(document.getText().substring(node.start, node.end));
		let token = scanner.scan();
		while (token !== TokenType.EOS) {
			if (token === TokenType.Styles) {
				return [{ languageId: 'css', start: node.start + scanner.getTokenOffset(), end: node.start + scanner.getTokenEnd() }];
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
				return [{ languageId, start: node.start + scanner.getTokenOffset(), end: node.start + scanner.getTokenEnd() }];
			}
			token = scanner.scan();
		}
	} else if (node.attributeNames) {
		let scanner: Scanner;
		let result;
		for (let name of node.attributeNames) {
			let languageId = getAttributeLanguage(name);
			if (languageId) {
				if (!scanner) {
					scanner = languageService.createScanner(document.getText().substring(node.start, node.end));
				}
				let token = scanner.scan();
				let lastAttribute;
				while (token !== TokenType.EOS) {
					if (token === TokenType.AttributeName) {
						lastAttribute = scanner.getTokenText();
					} else if (token === TokenType.AttributeValue && lastAttribute === name) {
						let start = scanner.getTokenOffset() + node.start;
						let end = scanner.getTokenEnd() + node.start;
						let firstChar = document.getText()[start];
						if (firstChar === '\'' || firstChar === '"') {
							start++;
							end--;
						}
						if (!result) {
							result = [];
						}
						result.push({ languageId, start, end, attributeValue: true });
						lastAttribute = null;
						break;
					}
					token = scanner.scan();
				}
			}
		}
		return result;
	}
	return void 0;
}

function getAttributeLanguage(attributeName: string): string {
	let match = attributeName.match(/^(style)|(on\w+)$/i);
	if (!match) {
		return null;
	}
	return match[1] ? 'css' : 'javascript';
}

function isWhitespace(str: string, start: number, end: number): boolean {
	if (start === end) {
		return true;
	}
	return !!str.substring(start, end).match(/^\s*$/);
}