/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { getLanguageModelCache } from '../languageModelCache';
import { LanguageService as HTMLLanguageService, HTMLDocument, DocumentContext, FormattingOptions, HTMLFormatConfiguration, ICompletionParticipant } from 'vscode-html-languageservice';
import { TextDocument, Position, Range, CompletionItem } from 'vscode-languageserver-types';
import { LanguageMode, Settings, Workspace } from './languageModes';

import { FoldingRange } from '../protocol/foldingProvider.proposed';
import { getHTMLFoldingRegions } from './htmlFolding';
import { getPathCompletionParticipant } from './pathCompletion';

export function getHTMLMode(htmlLanguageService: HTMLLanguageService, workspace: Workspace): LanguageMode {
	let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => htmlLanguageService.parseHTMLDocument(document));
	return {
		getId() {
			return 'html';
		},
		doComplete(document: TextDocument, position: Position, settings = workspace.settings, completionParticipants?: ICompletionParticipant[]) {
			let options = settings && settings.html && settings.html.suggest;
			let doAutoComplete = settings && settings.html && settings.html.autoClosingTags;
			if (doAutoComplete) {
				options.hideAutoCompleteProposals = true;
			}
			let pathCompletionProposals: CompletionItem[] = [];
			let participants = [getPathCompletionParticipant(document, workspace.folders, pathCompletionProposals)];
			if (completionParticipants) {
				participants.push(...completionParticipants);
			}
			htmlLanguageService.setCompletionParticipants(participants);

			const htmlDocument = htmlDocuments.get(document);
			let completionList = htmlLanguageService.doComplete(document, position, htmlDocument, options);
			completionList.items.push(...pathCompletionProposals);
			return completionList;
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
		format(document: TextDocument, range: Range, formatParams: FormattingOptions, settings = workspace.settings) {
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
		getFoldingRanges(document: TextDocument, range: Range): FoldingRange[] {
			return getHTMLFoldingRegions(htmlLanguageService, document, range);
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
