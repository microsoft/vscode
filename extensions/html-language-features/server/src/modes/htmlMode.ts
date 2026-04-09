/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLanguageModelCache } from '../languageModelCache';
import {
	LanguageService as HTMLLanguageService, HTMLDocument, DocumentContext, FormattingOptions,
	HTMLFormatConfiguration, SelectionRange,
	TextDocument, Position, Range, FoldingRange,
	LanguageMode, Workspace, Settings
} from './languageModes';

export function getHTMLMode(htmlLanguageService: HTMLLanguageService, workspace: Workspace): LanguageMode {
	const htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => htmlLanguageService.parseHTMLDocument(document));
	return {
		getId() {
			return 'html';
		},
		async getSelectionRange(document: TextDocument, position: Position): Promise<SelectionRange> {
			return htmlLanguageService.getSelectionRanges(document, [position])[0];
		},
		async doComplete(document: TextDocument, position: Position, documentContext: DocumentContext, settings = workspace.settings) {
			const htmlSettings = settings?.html;
			const options = merge(htmlSettings?.suggest, {});
			options.hideAutoCompleteProposals = htmlSettings?.autoClosingTags === true;
			options.attributeDefaultValue = htmlSettings?.completion?.attributeDefaultValue ?? 'doublequotes';

			const htmlDocument = htmlDocuments.get(document);
			const completionList = await htmlLanguageService.doComplete2(document, position, htmlDocument, documentContext, options);

			// Fix completion ranges for unclosed string literals (issue #273226).
			// When an attribute value has an opening quote but no closing quote,
			// the parser treats everything after the quote as the attribute value,
			// causing the replacement range to extend too far (e.g., into subsequent tags).
			// We clamp the replacement range to end before the next '<' character after the cursor.
			const text = document.getText();
			const offset = document.offsetAt(position);
			for (const item of completionList.items) {
				if (!item.textEdit) {
					continue;
				}
				const editRange = 'range' in item.textEdit ? item.textEdit.range : item.textEdit.replace;
				const editEndOffset = document.offsetAt(editRange.end);
				if (editEndOffset <= offset) {
					continue;
				}
				// Check if the text between cursor and end of range contains a '<',
				// which indicates the range leaked into subsequent HTML tags
				const textAfterCursor = text.substring(offset, editEndOffset);
				const angleBracketIndex = textAfterCursor.indexOf('<');
				if (angleBracketIndex !== -1) {
					const clampedEnd = document.positionAt(offset + angleBracketIndex);
					if ('range' in item.textEdit) {
						item.textEdit.range = Range.create(editRange.start, clampedEnd);
					} else {
						item.textEdit.replace = Range.create(editRange.start, clampedEnd);
					}
				}
			}

			return completionList;
		},
		async doHover(document: TextDocument, position: Position, settings?: Settings) {
			return htmlLanguageService.doHover(document, position, htmlDocuments.get(document), settings?.html?.hover);
		},
		async findDocumentHighlight(document: TextDocument, position: Position) {
			return htmlLanguageService.findDocumentHighlights(document, position, htmlDocuments.get(document));
		},
		async findDocumentLinks(document: TextDocument, documentContext: DocumentContext) {
			return htmlLanguageService.findDocumentLinks(document, documentContext);
		},
		async findDocumentSymbols(document: TextDocument) {
			return htmlLanguageService.findDocumentSymbols(document, htmlDocuments.get(document));
		},
		async format(document: TextDocument, range: Range, formatParams: FormattingOptions, settings = workspace.settings) {
			const formatSettings: HTMLFormatConfiguration = merge(settings?.html?.format, {});
			if (formatSettings.contentUnformatted) {
				formatSettings.contentUnformatted = formatSettings.contentUnformatted + ',script';
			} else {
				formatSettings.contentUnformatted = 'script';
			}
			merge(formatParams, formatSettings);
			return htmlLanguageService.format(document, range, formatSettings);
		},
		async getFoldingRanges(document: TextDocument): Promise<FoldingRange[]> {
			return htmlLanguageService.getFoldingRanges(document);
		},
		async doAutoInsert(document: TextDocument, position: Position, kind: 'autoQuote' | 'autoClose', settings = workspace.settings) {
			const offset = document.offsetAt(position);
			const text = document.getText();
			if (kind === 'autoQuote') {
				if (offset > 0 && text.charAt(offset - 1) === '=') {
					const htmlSettings = settings?.html;
					const options = merge(htmlSettings?.suggest, {});
					options.attributeDefaultValue = htmlSettings?.completion?.attributeDefaultValue ?? 'doublequotes';

					return htmlLanguageService.doQuoteComplete(document, position, htmlDocuments.get(document), options);
				}
			} else if (kind === 'autoClose') {
				if (offset > 0 && text.charAt(offset - 1).match(/[>\/]/g)) {
					return htmlLanguageService.doTagComplete(document, position, htmlDocuments.get(document));
				}
			}
			return null;
		},
		async doRename(document: TextDocument, position: Position, newName: string) {
			const htmlDocument = htmlDocuments.get(document);
			return htmlLanguageService.doRename(document, position, newName, htmlDocument);
		},
		async onDocumentRemoved(document: TextDocument) {
			htmlDocuments.onDocumentRemoved(document);
		},
		async findMatchingTagPosition(document: TextDocument, position: Position) {
			const htmlDocument = htmlDocuments.get(document);
			return htmlLanguageService.findMatchingTagPosition(document, position, htmlDocument);
		},
		async doLinkedEditing(document: TextDocument, position: Position) {
			const htmlDocument = htmlDocuments.get(document);
			return htmlLanguageService.findLinkedEditingRanges(document, position, htmlDocument);
		},
		dispose() {
			htmlDocuments.dispose();
		}
	};
}

function merge(src: any, dst: any): any {
	if (src) {
		for (const key in src) {
			if (src.hasOwnProperty(key)) {
				dst[key] = src[key];
			}
		}
	}
	return dst;
}
