/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import { SymbolInformation, SymbolKind, CompletionItem, Location, SignatureHelp, SignatureInformation, ParameterInformation, Definition, TextEdit, TextDocument, Diagnostic, DiagnosticSeverity, Range, CompletionItemKind, Hover, MarkedString, DocumentHighlight, DocumentHighlightKind, CompletionList, Position, FormattingOptions } from 'vscode-languageserver-types';
import { LanguageMode } from './languageModes';
import { getWordAtText, startsWith, isWhitespaceOnly, repeat } from '../utils/strings';
import { HTMLDocumentRegions } from './embeddedSupport';

import * as ts from 'typescript';
import { join } from 'path';

const FILE_NAME = 'vscode://javascript/1';  // the same 'file' is used for all contents
const JQUERY_D_TS = join(__dirname, '../../lib/jquery.d.ts');

const JS_WORD_REGEX = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;

export function getJavascriptMode(documentRegions: LanguageModelCache<HTMLDocumentRegions>): LanguageMode {
	let jsDocuments = getLanguageModelCache<TextDocument>(10, 60, document => documentRegions.get(document).getEmbeddedDocument('javascript'));

	let compilerOptions: ts.CompilerOptions = { allowNonTsExtensions: true, allowJs: true, lib: ['lib.es6.d.ts'], target: ts.ScriptTarget.Latest, moduleResolution: ts.ModuleResolutionKind.Classic };
	let currentTextDocument: TextDocument;
	let scriptFileVersion: number = 0;
	function updateCurrentTextDocument(doc: TextDocument) {
		if (!currentTextDocument || doc.uri !== currentTextDocument.uri || doc.version !== currentTextDocument.version) {
			currentTextDocument = jsDocuments.get(doc);
			scriptFileVersion++;
		}
	}
	let host = {
		getCompilationSettings: () => compilerOptions,
		getScriptFileNames: () => [FILE_NAME, JQUERY_D_TS],
		getScriptVersion: (fileName: string) => {
			if (fileName === FILE_NAME) {
				return String(scriptFileVersion);
			}
			return '1'; // default lib an jquery.d.ts are static
		},
		getScriptSnapshot: (fileName: string) => {
			let text = '';
			if (startsWith(fileName, 'vscode:')) {
				if (fileName === FILE_NAME) {
					text = currentTextDocument.getText();
				}
			} else {
				text = ts.sys.readFile(fileName) || '';
			}
			return {
				getText: (start, end) => text.substring(start, end),
				getLength: () => text.length,
				getChangeRange: () => void 0
			};
		},
		getCurrentDirectory: () => '',
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options)
	};
	let jsLanguageService = ts.createLanguageService(host);

	let settings: any = {};

	return {
		getId() {
			return 'javascript';
		},
		configure(options: any) {
			settings = options && options.javascript;
		},
		doValidation(document: TextDocument): Diagnostic[] {
			updateCurrentTextDocument(document);
			const diagnostics = jsLanguageService.getSyntacticDiagnostics(FILE_NAME);
			return diagnostics.map((diag): Diagnostic => {
				return {
					range: convertRange(currentTextDocument, diag),
					severity: DiagnosticSeverity.Error,
					message: ts.flattenDiagnosticMessageText(diag.messageText, '\n')
				};
			});
		},
		doComplete(document: TextDocument, position: Position): CompletionList {
			updateCurrentTextDocument(document);
			let offset = currentTextDocument.offsetAt(position);
			let completions = jsLanguageService.getCompletionsAtPosition(FILE_NAME, offset);
			if (!completions) {
				return { isIncomplete: false, items: [] };
			}
			let replaceRange = convertRange(currentTextDocument, getWordAtText(currentTextDocument.getText(), offset, JS_WORD_REGEX));
			return {
				isIncomplete: false,
				items: completions.entries.map(entry => {
					return {
						uri: document.uri,
						position: position,
						label: entry.name,
						sortText: entry.sortText,
						kind: convertKind(entry.kind),
						textEdit: TextEdit.replace(replaceRange, entry.name),
						data: { // data used for resolving item details (see 'doResolve')
							languageId: 'javascript',
							uri: document.uri,
							offset: offset
						}
					};
				})
			};
		},
		doResolve(document: TextDocument, item: CompletionItem): CompletionItem {
			updateCurrentTextDocument(document);
			let details = jsLanguageService.getCompletionEntryDetails(FILE_NAME, item.data.offset, item.label);
			if (details) {
				item.detail = ts.displayPartsToString(details.displayParts);
				item.documentation = ts.displayPartsToString(details.documentation);
				delete item.data;
			}
			return item;
		},
		doHover(document: TextDocument, position: Position): Hover {
			updateCurrentTextDocument(document);
			let info = jsLanguageService.getQuickInfoAtPosition(FILE_NAME, currentTextDocument.offsetAt(position));
			if (info) {
				let contents = ts.displayPartsToString(info.displayParts);
				return {
					range: convertRange(currentTextDocument, info.textSpan),
					contents: MarkedString.fromPlainText(contents)
				};
			}
			return null;
		},
		doSignatureHelp(document: TextDocument, position: Position): SignatureHelp {
			updateCurrentTextDocument(document);
			let signHelp = jsLanguageService.getSignatureHelpItems(FILE_NAME, currentTextDocument.offsetAt(position));
			if (signHelp) {
				let ret: SignatureHelp = {
					activeSignature: signHelp.selectedItemIndex,
					activeParameter: signHelp.argumentIndex,
					signatures: []
				};
				signHelp.items.forEach(item => {

					let signature: SignatureInformation = {
						label: '',
						documentation: null,
						parameters: []
					};

					signature.label += ts.displayPartsToString(item.prefixDisplayParts);
					item.parameters.forEach((p, i, a) => {
						let label = ts.displayPartsToString(p.displayParts);
						let parameter: ParameterInformation = {
							label: label,
							documentation: ts.displayPartsToString(p.documentation)
						};
						signature.label += label;
						signature.parameters.push(parameter);
						if (i < a.length - 1) {
							signature.label += ts.displayPartsToString(item.separatorDisplayParts);
						}
					});
					signature.label += ts.displayPartsToString(item.suffixDisplayParts);
					ret.signatures.push(signature);
				});
				return ret;
			};
			return null;
		},
		findDocumentHighlight(document: TextDocument, position: Position): DocumentHighlight[] {
			updateCurrentTextDocument(document);
			let occurrences = jsLanguageService.getOccurrencesAtPosition(FILE_NAME, currentTextDocument.offsetAt(position));
			if (occurrences) {
				return occurrences.map(entry => {
					return {
						range: convertRange(currentTextDocument, entry.textSpan),
						kind: <DocumentHighlightKind>(entry.isWriteAccess ? DocumentHighlightKind.Write : DocumentHighlightKind.Text)
					};
				});
			};
			return null;
		},
		findDocumentSymbols(document: TextDocument): SymbolInformation[] {
			updateCurrentTextDocument(document);
			let items = jsLanguageService.getNavigationBarItems(FILE_NAME);
			if (items) {
				let result: SymbolInformation[] = [];
				let existing = {};
				let collectSymbols = (item: ts.NavigationBarItem, containerLabel?: string) => {
					let sig = item.text + item.kind + item.spans[0].start;
					if (item.kind !== 'script' && !existing[sig]) {
						let symbol: SymbolInformation = {
							name: item.text,
							kind: convertSymbolKind(item.kind),
							location: {
								uri: document.uri,
								range: convertRange(currentTextDocument, item.spans[0])
							},
							containerName: containerLabel
						};
						existing[sig] = true;
						result.push(symbol);
						containerLabel = item.text;
					}

					if (item.childItems && item.childItems.length > 0) {
						for (let child of item.childItems) {
							collectSymbols(child, containerLabel);
						}
					}

				};

				items.forEach(item => collectSymbols(item));
				return result;
			}
			return null;
		},
		findDefinition(document: TextDocument, position: Position): Definition {
			updateCurrentTextDocument(document);
			let definition = jsLanguageService.getDefinitionAtPosition(FILE_NAME, currentTextDocument.offsetAt(position));
			if (definition) {
				return definition.filter(d => d.fileName === FILE_NAME).map(d => {
					return {
						uri: document.uri,
						range: convertRange(currentTextDocument, d.textSpan)
					};
				});
			}
			return null;
		},
		findReferences(document: TextDocument, position: Position): Location[] {
			updateCurrentTextDocument(document);
			let references = jsLanguageService.getReferencesAtPosition(FILE_NAME, currentTextDocument.offsetAt(position));
			if (references) {
				return references.filter(d => d.fileName === FILE_NAME).map(d => {
					return {
						uri: document.uri,
						range: convertRange(currentTextDocument, d.textSpan)
					};
				});
			}
			return null;
		},
		format(document: TextDocument, range: Range, formatParams: FormattingOptions): TextEdit[] {
			currentTextDocument = documentRegions.get(document).getEmbeddedDocument('javascript', true);
			scriptFileVersion++;

			let initialIndentLevel = computeInitialIndent(document, range, formatParams);
			let formatSettings = convertOptions(formatParams, settings && settings.format, initialIndentLevel + 1);
			let start = currentTextDocument.offsetAt(range.start);
			let end = currentTextDocument.offsetAt(range.end);
			let lastLineRange = null;
			if (range.end.character === 0 || isWhitespaceOnly(currentTextDocument.getText().substr(end - range.end.character, range.end.character))) {
				end -= range.end.character;
				lastLineRange = Range.create(Position.create(range.end.line, 0), range.end);
			}
			let edits = jsLanguageService.getFormattingEditsForRange(FILE_NAME, start, end, formatSettings);
			if (edits) {
				let result = [];
				for (let edit of edits) {
					if (edit.span.start >= start && edit.span.start + edit.span.length <= end) {
						result.push({
							range: convertRange(currentTextDocument, edit.span),
							newText: edit.newText
						});
					}
				}
				if (lastLineRange) {
					result.push({
						range: lastLineRange,
						newText: generateIndent(initialIndentLevel, formatParams)
					});
				}
				return result;
			}
			return null;
		},
		onDocumentRemoved(document: TextDocument) {
			jsDocuments.onDocumentRemoved(document);
		},
		dispose() {
			jsLanguageService.dispose();
			jsDocuments.dispose();
		}
	};
};

function convertRange(document: TextDocument, span: { start: number, length: number }): Range {
	let startPosition = document.positionAt(span.start);
	let endPosition = document.positionAt(span.start + span.length);
	return Range.create(startPosition, endPosition);
}

function convertKind(kind: string): CompletionItemKind {
	switch (kind) {
		case 'primitive type':
		case 'keyword':
			return CompletionItemKind.Keyword;
		case 'var':
		case 'local var':
			return CompletionItemKind.Variable;
		case 'property':
		case 'getter':
		case 'setter':
			return CompletionItemKind.Field;
		case 'function':
		case 'method':
		case 'construct':
		case 'call':
		case 'index':
			return CompletionItemKind.Function;
		case 'enum':
			return CompletionItemKind.Enum;
		case 'module':
			return CompletionItemKind.Module;
		case 'class':
			return CompletionItemKind.Class;
		case 'interface':
			return CompletionItemKind.Interface;
		case 'warning':
			return CompletionItemKind.File;
	}

	return CompletionItemKind.Property;
}

function convertSymbolKind(kind: string): SymbolKind {
	switch (kind) {
		case 'var':
		case 'local var':
		case 'const':
			return SymbolKind.Variable;
		case 'function':
		case 'local function':
			return SymbolKind.Function;
		case 'enum':
			return SymbolKind.Enum;
		case 'module':
			return SymbolKind.Module;
		case 'class':
			return SymbolKind.Class;
		case 'interface':
			return SymbolKind.Interface;
		case 'method':
			return SymbolKind.Method;
		case 'property':
		case 'getter':
		case 'setter':
			return SymbolKind.Property;
	}
	return SymbolKind.Variable;
}

function convertOptions(options: FormattingOptions, formatSettings: any, initialIndentLevel: number): ts.FormatCodeOptions {
	return {
		ConvertTabsToSpaces: options.insertSpaces,
		TabSize: options.tabSize,
		IndentSize: options.tabSize,
		IndentStyle: ts.IndentStyle.Smart,
		NewLineCharacter: '\n',
		BaseIndentSize: options.tabSize * initialIndentLevel,
		InsertSpaceAfterCommaDelimiter: Boolean(!formatSettings || formatSettings.insertSpaceAfterCommaDelimiter),
		InsertSpaceAfterSemicolonInForStatements: Boolean(!formatSettings || formatSettings.insertSpaceAfterSemicolonInForStatements),
		InsertSpaceBeforeAndAfterBinaryOperators: Boolean(!formatSettings || formatSettings.insertSpaceBeforeAndAfterBinaryOperators),
		InsertSpaceAfterKeywordsInControlFlowStatements: Boolean(!formatSettings || formatSettings.insertSpaceAfterKeywordsInControlFlowStatements),
		InsertSpaceAfterFunctionKeywordForAnonymousFunctions: Boolean(!formatSettings || formatSettings.insertSpaceAfterFunctionKeywordForAnonymousFunctions),
		InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis),
		InsertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets),
		InsertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces),
		PlaceOpenBraceOnNewLineForControlBlocks: Boolean(formatSettings && formatSettings.placeOpenBraceOnNewLineForFunctions),
		PlaceOpenBraceOnNewLineForFunctions: Boolean(formatSettings && formatSettings.placeOpenBraceOnNewLineForControlBlocks)
	};
}

function computeInitialIndent(document: TextDocument, range: Range, options: FormattingOptions) {
	let lineStart = document.offsetAt(Position.create(range.start.line, 0));
	let content = document.getText();

	let i = lineStart;
	let nChars = 0;
	let tabSize = options.tabSize || 4;
	while (i < content.length) {
		let ch = content.charAt(i);
		if (ch === ' ') {
			nChars++;
		} else if (ch === '\t') {
			nChars += tabSize;
		} else {
			break;
		}
		i++;
	}
	return Math.floor(nChars / tabSize);
}

function generateIndent(level: number, options: FormattingOptions) {
	if (options.insertSpaces) {
		return repeat(' ', level * options.tabSize);
	} else {
		return repeat('\t', level);
	}
}