/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, Position, CompletionList, CompletionItemKind, Range } from 'vscode-languageserver-types';
import { HTMLDocument } from '../parser/htmlParser';
import { TokenType, createScanner, ScannerState } from '../parser/htmlScanner';
import { getHTML5TagProvider, getAngularTagProvider, getIonicTagProvider } from '../parser/htmlTags';
import { CompletionConfiguration } from '../htmlLanguageService';

let allTagProviders = [
	getHTML5TagProvider(),
	getAngularTagProvider(),
	getIonicTagProvider()
];

export function doComplete(document: TextDocument, position: Position, doc: HTMLDocument, settings?: CompletionConfiguration): CompletionList {

	let result: CompletionList = {
		isIncomplete: false,
		items: []
	};
	let tagProviders = allTagProviders.filter(p => p.isApplicable(document.languageId) && (!settings || !!settings[p.getId()]));

	let offset = document.offsetAt(position);
	let node = doc.findNodeBefore(offset);
	if (!node) {
		return result;
	}
	let scanner = createScanner(document.getText(), node.start);
	let currentTag: string;
	let currentAttributeName: string;

	function getReplaceRange(replaceStart: number) : Range {
		if (replaceStart > offset) {
			replaceStart = offset;
		}
		return { start: document.positionAt(replaceStart), end: document.positionAt(offset)};
	}

	function collectOpenTagSuggestions(afterOpenBracket: number) : CompletionList {
		let range = getReplaceRange(afterOpenBracket);
		tagProviders.forEach((provider) => {
			provider.collectTags((tag, label) => {
				result.items.push({
					label: tag,
					kind: CompletionItemKind.Property,
					documentation: label,
					textEdit: { newText: tag, range: range }
				});
			});
		});
		return result;
	}

	function collectCloseTagSuggestions(afterOpenBracket: number, matchingOnly: boolean) : CompletionList {
		let range = getReplaceRange(afterOpenBracket);
		let contentAfter = document.getText().substr(offset);
		let closeTag = contentAfter.match(/^\s*>/) ? '' : '>';
		let curr = node;
		while (curr) {
			let tag = curr.tag;
			if (tag && !curr.closed) {
				result.items.push({
					label: '/' + tag,
					kind: CompletionItemKind.Property,
					filterText: '/' + tag + closeTag,
					textEdit: { newText: '/' + tag + closeTag, range: range }
				});
				return result;
			}
			curr = curr.parent;
		}
		if (matchingOnly) {
			return result;
		}

		tagProviders.forEach((provider) => {
			provider.collectTags((tag, label) => {
				result.items.push({
					label: '/' + tag,
					kind: CompletionItemKind.Property,
					documentation: label,
					filterText: '/' + tag + closeTag,
					textEdit: { newText: '/' + tag + closeTag, range: range }
				});
			});
		});
		return result;
	}

	function collectTagSuggestions(tagStart: number) : CompletionList {
		collectOpenTagSuggestions(tagStart);
		collectCloseTagSuggestions(tagStart, true);
		return result;
	}

	function collectAttributeNameSuggestions(nameStart: number) : CompletionList {
		let range = getReplaceRange(nameStart);
		tagProviders.forEach((provider) => {
			provider.collectAttributes(currentTag, (attribute, type) => {
				let codeSnippet = attribute;
				if (type !== 'v') {
					codeSnippet = codeSnippet + '="{{}}"';
				}
				result.items.push({
					label: attribute,
					kind: type === 'handler' ? CompletionItemKind.Function : CompletionItemKind.Value,
					textEdit: { newText: codeSnippet, range: range }
				});
			});
		});
		return result;
	}

	function collectAttributeValueSuggestions(valueStart: number) : CompletionList {
		let range = getReplaceRange(valueStart);
		tagProviders.forEach((provider) => {
			provider.collectValues(currentTag, currentAttributeName, (value) => {
				let codeSnippet = '"' + value + '"';
				result.items.push({
					label: value,
					filterText: codeSnippet,
					kind: CompletionItemKind.Unit,
					textEdit: { newText: codeSnippet, range: range }
				});
			});
		});
		return result;
	}

	let token = scanner.scan();

	while (token !== TokenType.EOS && scanner.getTokenOffset() <= offset) {
		switch (token) {
			case TokenType.StartTagOpen:
				if (scanner.getTokenEnd() === offset) {
					return collectTagSuggestions(offset);
				}
				break;
			case TokenType.StartTag:
				if (scanner.getTokenOffset() <= offset && offset <= scanner.getTokenEnd()) {
					return collectOpenTagSuggestions(scanner.getTokenOffset());
				}
				currentTag = scanner.getTokenText();
				break;
			case TokenType.AttributeName:
				if (scanner.getTokenOffset() <= offset && offset <= scanner.getTokenEnd()) {
					return collectAttributeNameSuggestions(scanner.getTokenOffset());
				}
				currentAttributeName = scanner.getTokenText();
				break;
			case TokenType.DelimiterAssign:
				if (scanner.getTokenEnd() === offset) {
					return collectAttributeValueSuggestions(scanner.getTokenEnd());
				}
				break;
			case TokenType.AttributeValue:
				if (scanner.getTokenOffset() <= offset && offset <= scanner.getTokenEnd()) {
					return collectAttributeValueSuggestions(scanner.getTokenOffset());
				}
				break;
			case TokenType.Whitespace:
			case TokenType.Unknown:
				if (offset <= scanner.getTokenEnd()) {
					switch (scanner.getScannerState()) {
						case ScannerState.AfterOpeningStartTag:
							return collectTagSuggestions(scanner.getTokenOffset());
						case ScannerState.WithinTag:
						case ScannerState.AfterAttributeName:
							return collectAttributeNameSuggestions(scanner.getTokenEnd());
						case ScannerState.BeforeAttributeValue:
							return collectAttributeValueSuggestions(scanner.getTokenEnd());
						case ScannerState.AfterOpeningEndTag:
							return collectCloseTagSuggestions(scanner.getTokenOffset() - 1, false);
					}
				}
				break;
			case TokenType.EndTagOpen:
				if (offset <= scanner.getTokenEnd()) {
					return collectCloseTagSuggestions(scanner.getTokenOffset() + 1, false);
				}
				break;
			case TokenType.EndTag:
				if (offset <= scanner.getTokenEnd()) {
					let text = document.getText();
					let start = scanner.getTokenOffset() - 1;
					while (start >= 0) {
						let ch = text.charAt(start);
						if (ch === '/') {
							return collectCloseTagSuggestions(start, false);
						} else if (!isWhiteSpace(ch)) {
							break;
						}
						start--;
					}
				}
				break;
		}
		token = scanner.scan();
	}
	return result;
}

function isWhiteSpace(s:string) : boolean {
	return /^\s*$/.test(s);
}