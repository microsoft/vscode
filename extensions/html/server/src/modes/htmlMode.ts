/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { getLanguageModelCache } from '../languageModelCache';
import { LanguageService as HTMLLanguageService, HTMLDocument, DocumentContext, FormattingOptions, HTMLFormatConfiguration } from 'vscode-html-languageservice';
import { TextDocument, Position, Range } from 'vscode-languageserver-types';
import { LanguageMode, Settings } from './languageModes';

import { FoldingRangeType, FoldingRange, FoldingRangeList } from '../protocol/foldingProvider.proposed';

export function getHTMLMode(htmlLanguageService: HTMLLanguageService): LanguageMode {
	let globalSettings: Settings = {};
	let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => htmlLanguageService.parseHTMLDocument(document));
	let completionParticipants = [];
	return {
		getId() {
			return 'html';
		},
		configure(options: any) {
			globalSettings = options;
		},
		doComplete(document: TextDocument, position: Position, settings: Settings = globalSettings) {
			let options = settings && settings.html && settings.html.suggest;
			let doAutoComplete = settings && settings.html && settings.html.autoClosingTags;
			if (doAutoComplete) {
				options.hideAutoCompleteProposals = true;
			}

			const htmlDocument = htmlDocuments.get(document);
			htmlLanguageService.setCompletionParticipants(completionParticipants);

			return htmlLanguageService.doComplete(document, position, htmlDocument, options);
		},
		setCompletionParticipants(registeredCompletionParticipants: any[]) {
			completionParticipants = registeredCompletionParticipants;
		},
		doHover(document: TextDocument, position: Position) {
			return htmlLanguageService.doHover(document, position, htmlDocuments.get(document));
		},
		findDocumentHighlight(document: TextDocument, position: Position) {
			return htmlLanguageService.findDocumentHighlights(document, position, htmlDocuments.get(document));
		},
		findDocumentLinks(document: TextDocument, documentContext: DocumentContext) {
			return htmlLanguageService.findDocumentLinks(document, documentContext);
		},
		findDocumentSymbols(document: TextDocument) {
			return htmlLanguageService.findDocumentSymbols(document, htmlDocuments.get(document));
		},
		format(document: TextDocument, range: Range, formatParams: FormattingOptions, settings: Settings = globalSettings) {
			let formatSettings: HTMLFormatConfiguration = settings && settings.html && settings.html.format;
			if (formatSettings) {
				formatSettings = merge(formatSettings, {});
			} else {
				formatSettings = {};
			}
			if (formatSettings.contentUnformatted) {
				formatSettings.contentUnformatted = formatSettings.contentUnformatted + ',script';
			} else {
				formatSettings.contentUnformatted = 'script';
			}
			formatSettings = merge(formatParams, formatSettings);
			return htmlLanguageService.format(document, range, formatSettings);
		},
		getFoldingRanges(document: TextDocument): FoldingRangeList {
			const scanner = htmlLanguageService.createScanner(document.getText());
			let token = scanner.scan();
			let ranges: FoldingRange[] = [];
			let stack: FoldingRange[] = [];
			let elementNames: string[] = [];
			let lastTagName = null;
			let prevStart = -1;
			while (token !== TokenType.EOS) {
				switch (token) {
					case TokenType.StartTagOpen: {
						let startLine = document.positionAt(scanner.getTokenOffset()).line;
						let range = { startLine, endLine: startLine };
						stack.push(range);
						break;
					}
					case TokenType.StartTag: {
						lastTagName = scanner.getTokenText();
						elementNames.push(lastTagName);
						break;
					}
					case TokenType.EndTag: {
						lastTagName = scanner.getTokenText();
						break;
					}
					case TokenType.EndTagClose:
					case TokenType.StartTagSelfClose: {
						let name = elementNames.pop();
						let range = stack.pop();
						while (name && name !== lastTagName) {
							name = elementNames.pop();
							range = stack.pop();
						}
						let line = document.positionAt(scanner.getTokenOffset()).line;
						if (range && line > range.startLine + 1 && prevStart !== range.startLine) {
							range.endLine = line - 1;
							ranges.push(range);
							prevStart = range.startLine;
						}
						break;
					}
					case TokenType.Comment: {
						let text = scanner.getTokenText();
						let m = text.match(/^\s*#(region\b)|(endregion\b)/);
						if (m) {
							let line = document.positionAt(scanner.getTokenOffset()).line;
							if (m[1]) { // start pattern match
								let range = { startLine: line, endLine: line, type: FoldingRangeType.Region };
								stack.push(range);
								elementNames.push('');
							} else {
								let i = stack.length - 1;
								while (i >= 0 && stack[i].type !== FoldingRangeType.Region) {
									i--;
								}
								if (i >= 0) {
									let range = stack[i];
									stack.length = i;
									if (line > range.startLine && prevStart !== range.startLine) {
										range.endLine = line;
										ranges.push(range);
										prevStart = range.startLine;
									}
								}
							}
						}
						break;
					}
				}
				token = scanner.scan();
			}
			return <FoldingRangeList>{ ranges };
		},

		doAutoClose(document: TextDocument, position: Position) {
			let offset = document.offsetAt(position);
			let text = document.getText();
			if (offset > 0 && text.charAt(offset - 1).match(/[>\/]/g)) {
				return htmlLanguageService.doTagComplete(document, position, htmlDocuments.get(document));
			}
			return null;
		},
		onDocumentRemoved(document: TextDocument) {
			htmlDocuments.onDocumentRemoved(document);
		},
		dispose() {
			htmlDocuments.dispose();
		}
	};
}

function merge(src: any, dst: any): any {
	for (var key in src) {
		if (src.hasOwnProperty(key)) {
			dst[key] = src[key];
		}
	}
	return dst;
}
