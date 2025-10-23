/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getCSSLanguageService } from 'vscode-css-languageservice';
import {
	DocumentContext, getLanguageService as getHTMLLanguageService, IHTMLDataProvider, ClientCapabilities
} from 'vscode-html-languageservice';
import {
	SelectionRange,
	CompletionItem, CompletionList, Definition, Diagnostic, DocumentHighlight, DocumentLink, FoldingRange, FormattingOptions,
	Hover, Location, Position, Range, SignatureHelp, SymbolInformation, TextEdit,
	Color, ColorInformation, ColorPresentation, WorkspaceEdit,
	WorkspaceFolder
} from 'vscode-languageserver';
import { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';

import { getLanguageModelCache, LanguageModelCache } from '../languageModelCache';
import { getCSSMode } from './cssMode';
import { getDocumentRegions, HTMLDocumentRegions } from './embeddedSupport';
import { getHTMLMode } from './htmlMode';
import { getJavaScriptMode } from './javascriptMode';
import { FileSystemProvider } from '../requests';

export {
	WorkspaceFolder, CompletionItem, CompletionList, CompletionItemKind, Definition, Diagnostic, DocumentHighlight, DocumentHighlightKind,
	DocumentLink, FoldingRange, FoldingRangeKind, FormattingOptions,
	Hover, Location, Position, Range, SignatureHelp, SymbolInformation, SymbolKind, TextEdit,
	Color, ColorInformation, ColorPresentation, WorkspaceEdit,
	SignatureInformation, ParameterInformation, DiagnosticSeverity,
	SelectionRange, TextDocumentIdentifier
} from 'vscode-languageserver';

export { ClientCapabilities, DocumentContext, LanguageService, HTMLDocument, HTMLFormatConfiguration, TokenType } from 'vscode-html-languageservice';

export { TextDocument, DocumentUri } from 'vscode-languageserver-textdocument';

export interface Settings {
	readonly css?: any;
	readonly html?: any;
	readonly javascript?: any;
	readonly 'js/ts'?: any;
}

export interface Workspace {
	readonly settings: Settings;
	readonly folders: WorkspaceFolder[];
}

export interface SemanticTokenData {
	start: Position;
	length: number;
	typeIdx: number;
	modifierSet: number;
}

export type CompletionItemData = {
	languageId: string;
	uri: string;
	offset: number;
};

export function isCompletionItemData(value: any): value is CompletionItemData {
	return value && typeof value.languageId === 'string' && typeof value.uri === 'string' && typeof value.offset === 'number';
}

export interface LanguageMode {
	getId(): string;
	getSelectionRange?: (document: TextDocument, position: Position) => Promise<SelectionRange>;
	doValidation?: (document: TextDocument, settings?: Settings) => Promise<Diagnostic[]>;
	doComplete?: (document: TextDocument, position: Position, documentContext: DocumentContext, settings?: Settings) => Promise<CompletionList>;
	doResolve?: (document: TextDocument, item: CompletionItem) => Promise<CompletionItem>;
	doHover?: (document: TextDocument, position: Position, settings?: Settings) => Promise<Hover | null>;
	doSignatureHelp?: (document: TextDocument, position: Position) => Promise<SignatureHelp | null>;
	doRename?: (document: TextDocument, position: Position, newName: string) => Promise<WorkspaceEdit | null>;
	doLinkedEditing?: (document: TextDocument, position: Position) => Promise<Range[] | null>;
	findDocumentHighlight?: (document: TextDocument, position: Position) => Promise<DocumentHighlight[]>;
	findDocumentSymbols?: (document: TextDocument) => Promise<SymbolInformation[]>;
	findDocumentLinks?: (document: TextDocument, documentContext: DocumentContext) => Promise<DocumentLink[]>;
	findDefinition?: (document: TextDocument, position: Position) => Promise<Definition | null>;
	findReferences?: (document: TextDocument, position: Position) => Promise<Location[]>;
	format?: (document: TextDocument, range: Range, options: FormattingOptions, settings?: Settings) => Promise<TextEdit[]>;
	findDocumentColors?: (document: TextDocument) => Promise<ColorInformation[]>;
	getColorPresentations?: (document: TextDocument, color: Color, range: Range) => Promise<ColorPresentation[]>;
	doAutoInsert?: (document: TextDocument, position: Position, kind: 'autoClose' | 'autoQuote') => Promise<string | null>;
	findMatchingTagPosition?: (document: TextDocument, position: Position) => Promise<Position | null>;
	getFoldingRanges?: (document: TextDocument) => Promise<FoldingRange[]>;
	onDocumentRemoved(document: TextDocument): void;
	getSemanticTokens?(document: TextDocument): Promise<SemanticTokenData[]>;
	getSemanticTokenLegend?(): { types: string[]; modifiers: string[] };
	getTextDocumentContent?(uri: DocumentUri): Promise<string | undefined>;
	dispose(): void;
}

export interface LanguageModes {
	updateDataProviders(dataProviders: IHTMLDataProvider[]): void;
	getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined;
	getModesInRange(document: TextDocument, range: Range): LanguageModeRange[];
	getAllModes(): LanguageMode[];
	getAllModesInDocument(document: TextDocument): LanguageMode[];
	getMode(languageId: string): LanguageMode | undefined;
	onDocumentRemoved(document: TextDocument): void;
	dispose(): void;
}

export interface LanguageModeRange extends Range {
	mode: LanguageMode | undefined;
	attributeValue?: boolean;
}

export const FILE_PROTOCOL = 'html-server';

export function getLanguageModes(supportedLanguages: { [languageId: string]: boolean }, workspace: Workspace, clientCapabilities: ClientCapabilities, requestService: FileSystemProvider): LanguageModes {
	const htmlLanguageService = getHTMLLanguageService({ clientCapabilities, fileSystemProvider: requestService });
	const cssLanguageService = getCSSLanguageService({ clientCapabilities, fileSystemProvider: requestService });

	const documentRegions = getLanguageModelCache<HTMLDocumentRegions>(10, 60, document => getDocumentRegions(htmlLanguageService, document));

	let modelCaches: LanguageModelCache<any>[] = [];
	modelCaches.push(documentRegions);

	let modes = Object.create(null);
	modes['html'] = getHTMLMode(htmlLanguageService, workspace);
	if (supportedLanguages['css']) {
		modes['css'] = getCSSMode(cssLanguageService, documentRegions, workspace);
	}
	if (supportedLanguages['javascript']) {
		modes['javascript'] = getJavaScriptMode(documentRegions, 'javascript', workspace);
		modes['typescript'] = getJavaScriptMode(documentRegions, 'typescript', workspace);
	}
	return {
		async updateDataProviders(dataProviders: IHTMLDataProvider[]): Promise<void> {
			htmlLanguageService.setDataProviders(true, dataProviders);
		},
		getModeAtPosition(document: TextDocument, position: Position): LanguageMode | undefined {
			const languageId = documentRegions.get(document).getLanguageAtPosition(position);
			if (languageId) {
				return modes[languageId];
			}
			return undefined;
		},
		getModesInRange(document: TextDocument, range: Range): LanguageModeRange[] {
			return documentRegions.get(document).getLanguageRanges(range).map((r): LanguageModeRange => {
				return {
					start: r.start,
					end: r.end,
					mode: r.languageId && modes[r.languageId],
					attributeValue: r.attributeValue
				};
			});
		},
		getAllModesInDocument(document: TextDocument): LanguageMode[] {
			const result = [];
			for (const languageId of documentRegions.get(document).getLanguagesInDocument()) {
				const mode = modes[languageId];
				if (mode) {
					result.push(mode);
				}
			}
			return result;
		},
		getAllModes(): LanguageMode[] {
			const result = [];
			for (const languageId in modes) {
				const mode = modes[languageId];
				if (mode) {
					result.push(mode);
				}
			}
			return result;
		},
		getMode(languageId: string): LanguageMode {
			return modes[languageId];
		},
		onDocumentRemoved(document: TextDocument) {
			modelCaches.forEach(mc => mc.onDocumentRemoved(document));
			for (const mode in modes) {
				modes[mode].onDocumentRemoved(document);
			}
		},
		dispose(): void {
			modelCaches.forEach(mc => mc.dispose());
			modelCaches = [];
			for (const mode in modes) {
				modes[mode].dispose();
			}
			modes = {};
		}
	};
}
