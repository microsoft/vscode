/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import { TextDocument, Position, Range } from 'vscode-languageserver-types';
import { getCSSLanguageService, Stylesheet, ICompletionParticipant } from 'vscode-css-languageservice';
import { LanguageMode, Settings } from './languageModes';
import { HTMLDocumentRegions, CSS_STYLE_RULE } from './embeddedSupport';
import { Color } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';
import { extractAbbreviation } from 'vscode-emmet-helper';

const emmetAbbreviationThatBreaksParsing = /\.\d+$/;

export function getCSSMode(documentRegions: LanguageModelCache<HTMLDocumentRegions>): LanguageMode {
	let cssLanguageService = getCSSLanguageService();
	let embeddedCSSDocuments = getLanguageModelCache<TextDocument>(10, 60, document => documentRegions.get(document).getEmbeddedDocument('css'));
	let cssStylesheets = getLanguageModelCache<Stylesheet>(10, 60, document => cssLanguageService.parseStylesheet(document));

	return {
		getId() {
			return 'css';
		},
		configure(options: any) {
			cssLanguageService.configure(options && options.css);
		},
		doValidation(document: TextDocument, settings?: Settings) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doValidation(embedded, cssStylesheets.get(embedded), settings && settings.css);
		},
		doComplete(document: TextDocument, position: Position, settings: Settings, registeredCompletionParticipants: ICompletionParticipant[]) {
			if (registeredCompletionParticipants) {
				cssLanguageService.setCompletionParticipants(registeredCompletionParticipants);
			}

			let embedded = embeddedCSSDocuments.get(document);

			// Workaround for https://github.com/Microsoft/vscode-css-languageservice/issues/69
			const stylesheet = cssStylesheets.get(embedded);
			if (typeof (<any>stylesheet).end === 'number'
				&& document.offsetAt(position) > (<any>stylesheet).end) {
				const extractedResults = extractAbbreviation(document, position, { lookAhead: false, syntax: 'css' });
				if (extractedResults && emmetAbbreviationThatBreaksParsing.test(extractedResults.abbreviation)) {
					const emmetCompletionParticipant = registeredCompletionParticipants.filter(x => typeof (<any>x).getId === 'function' && (<any>x).getId() === 'emmet');
					if (emmetCompletionParticipant && emmetCompletionParticipant.length === 1) {
						emmetCompletionParticipant[0].onCssProperty({ propertyName: extractedResults.abbreviation, range: extractedResults.abbreviationRange });
					}
				}
			}
			return cssLanguageService.doComplete(embedded, position, stylesheet);
		},
		setCompletionParticipants(registeredCompletionParticipants: ICompletionParticipant[]) {
			cssLanguageService.setCompletionParticipants(registeredCompletionParticipants);
		},
		doHover(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doHover(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentHighlight(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentHighlights(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentSymbols(document: TextDocument) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentSymbols(embedded, cssStylesheets.get(embedded)).filter(s => s.name !== CSS_STYLE_RULE);
		},
		findDefinition(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDefinition(embedded, position, cssStylesheets.get(embedded));
		},
		findReferences(document: TextDocument, position: Position) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findReferences(embedded, position, cssStylesheets.get(embedded));
		},
		findDocumentColors(document: TextDocument) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentColors(embedded, cssStylesheets.get(embedded));
		},
		getColorPresentations(document: TextDocument, color: Color, range: Range) {
			let embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.getColorPresentations(embedded, cssStylesheets.get(embedded), color, range);
		},
		onDocumentRemoved(document: TextDocument) {
			embeddedCSSDocuments.onDocumentRemoved(document);
			cssStylesheets.onDocumentRemoved(document);
		},
		dispose() {
			embeddedCSSDocuments.dispose();
			cssStylesheets.dispose();
		}
	};
}