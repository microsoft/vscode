/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TextDocument, Position, CompletionList, CompletionItemKind, Range } from 'vscode-languageserver-types';
import { HTMLDocument } from '../parser/htmlParser';
import { TokenType, createScanner, ScannerState } from '../parser/htmlScanner';
import { IHTMLTagProvider, getHTML5TagProvider, getAngularTagProvider, getIonicTagProvider } from '../parser/htmlTags';
import { startsWith } from '../utils/strings';

let tagProviders: IHTMLTagProvider[] = [];
tagProviders.push(getHTML5TagProvider());
tagProviders.push(getAngularTagProvider());
tagProviders.push(getIonicTagProvider());


export function doComplete(document: TextDocument, position: Position, doc: HTMLDocument): CompletionList {

	let result: CompletionList = {
		isIncomplete: false,
		items: []
	};

	let offset = document.offsetAt(position);
	let node = doc.findNodeBefore(offset);
	if (!node) {
		return result;
	}
	let scanner = createScanner(document.getText(), node.start);
	let currentTag: string;
	let currentAttributeName: string;


	function collectOpenTagSuggestions(afterOpenBracket: number) : CompletionList {
		let range : Range = { start: document.positionAt(afterOpenBracket), end: document.positionAt(offset)};
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
		let range : Range = { start: document.positionAt(afterOpenBracket), end: document.positionAt(offset)};
		let contentAfter = document.getText().substr(offset);
		let closeTag = isWhiteSpace(contentAfter) || startsWith(contentAfter, '<') ? '>' : '';
		if (node.parent && node.parent.tag) {
			let tag = node.parent.tag;
			result.items.push({
				label: '/' + tag,
				kind: CompletionItemKind.Property,
				filterText: '/' + tag + closeTag,
				textEdit: { newText: '/' + tag + closeTag, range: range }
			});
			return;
		}
		if (matchingOnly) {
			return;
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
		let range : Range = { start: document.positionAt(nameStart), end: document.positionAt(offset)};
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
		let range : Range = { start: document.positionAt(valueStart), end: document.positionAt(offset)};
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
					}
				}
				break;
			case TokenType.EndTagOpen:
				if (offset <= scanner.getTokenEnd()) {
					return collectCloseTagSuggestions(scanner.getTokenOffset() + 1, false);
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