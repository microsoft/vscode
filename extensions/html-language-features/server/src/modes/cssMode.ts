/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import { Stylesheet, LanguageService as CSSLanguageService } from 'vscode-css-languageservice';
import { LanguageMode, Workspace, Color, TextDocument, TextEdit, Position, Range, CompletionList, DocumentContext, FormattingOptions, Diagnostic } from './languageModes';
import { HTMLDocumentRegions, CSS_STYLE_RULE } from './embeddedSupport';

export function getCSSMode(cssLanguageService: CSSLanguageService, documentRegions: LanguageModelCache<HTMLDocumentRegions>, workspace: Workspace): LanguageMode {
	const embeddedCSSDocuments = getLanguageModelCache<TextDocument>(10, 60, document => documentRegions.get(document).getEmbeddedDocument('css'));
	const cssStylesheets = getLanguageModelCache<Stylesheet>(10, 60, document => cssLanguageService.parseStylesheet(document));

	return {
		getId() {
			return 'css';
		},
		async doValidation(document: TextDocument, settings = workspace.settings) {
			const embedded = embeddedCSSDocuments.get(document);
			return (cssLanguageService.doValidation(embedded, cssStylesheets.get(embedded), settings && settings.css) as Diagnostic[]);
		},
		async doComplete(document: TextDocument, position: Position, documentContext: DocumentContext, _settings = workspace.settings) {
			const embedded = embeddedCSSDocuments.get(document);
			const stylesheet = cssStylesheets.get(embedded);
			return cssLanguageService.doComplete2(embedded, position, stylesheet, documentContext, _settings?.css?.completion) || CompletionList.create();
		},
		async doHover(document: TextDocument, position: Position, settings = workspace.settings) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.doHover(embedded, position, cssStylesheets.get(embedded), settings?.css?.hover);
		},
		async findDocumentHighlight(document: TextDocument, position: Position) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentHighlights(embedded, position, cssStylesheets.get(embedded));
		},
		async findDocumentSymbols(document: TextDocument) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentSymbols(embedded, cssStylesheets.get(embedded)).filter(s => s.name !== CSS_STYLE_RULE);
		},
		async findDefinition(document: TextDocument, position: Position) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDefinition(embedded, position, cssStylesheets.get(embedded));
		},
		async findReferences(document: TextDocument, position: Position) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findReferences(embedded, position, cssStylesheets.get(embedded));
		},
		async findDocumentColors(document: TextDocument) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.findDocumentColors(embedded, cssStylesheets.get(embedded));
		},
		async format(document: TextDocument, range: Range, formatParams: FormattingOptions, settings = workspace.settings): Promise<TextEdit[]> {
			const embedded = embeddedCSSDocuments.get(document);
			const formatSettings = {
				...settings?.css?.format,
				...formatParams,
			};

			// Indent and format corrections for embedded CSS in HTML documents
			const htmlSettings = settings?.html?.format;
			const baseIndent = htmlSettings?.indentSize ?? 2;
			const additionalIndent = htmlSettings?.indentInnerHtml ? 1 : 0;
			const styleContentIndent = baseIndent + additionalIndent;
			const styleTagIndent = styleContentIndent - 1;

			let edits = cssLanguageService.format(embedded, range, formatSettings);

			if (edits.length > 0) {
				edits = edits.map(edit => {
					const formattedLines = edit.newText.split('\n').map(line => {
						const indent = line.endsWith(';')
							? styleContentIndent + 1
							: styleContentIndent;
						return '\t'.repeat(indent) + line.trim();
					});

					return {
						...edit,
						newText: formattedLines.join('\n')
					};
				});

				const openTag = `${'\t'.repeat(styleTagIndent)}<style>\n`;
				const preCloseTag = `\n${'\t'.repeat(styleTagIndent)}`;

				edits[0].newText = openTag + edits[0].newText;
				edits[edits.length - 1].newText += preCloseTag;

				return edits;
			}
			return [];
		},
		async getColorPresentations(document: TextDocument, color: Color, range: Range) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.getColorPresentations(embedded, cssStylesheets.get(embedded), color, range);
		},
		async getFoldingRanges(document: TextDocument) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.getFoldingRanges(embedded, {});
		},
		async getSelectionRange(document: TextDocument, position: Position) {
			const embedded = embeddedCSSDocuments.get(document);
			return cssLanguageService.getSelectionRanges(embedded, [position], cssStylesheets.get(embedded))[0];
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
