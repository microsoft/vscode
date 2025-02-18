/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelCache, getLanguageModelCache } from '../languageModelCache';
import {
	SymbolInformation, SymbolKind, CompletionItem, Location, SignatureHelp, SignatureInformation, ParameterInformation,
	Definition, TextEdit, TextDocument, Diagnostic, DiagnosticSeverity, Range, CompletionItemKind, Hover,
	DocumentHighlight, DocumentHighlightKind, CompletionList, Position, FormattingOptions, FoldingRange, FoldingRangeKind, SelectionRange,
	LanguageMode, Settings, SemanticTokenData, Workspace, DocumentContext, CompletionItemData, isCompletionItemData
} from './languageModes';
import { getWordAtText, isWhitespaceOnly, repeat } from '../utils/strings';
import { HTMLDocumentRegions } from './embeddedSupport';

import * as ts from 'typescript';
import { getSemanticTokens, getSemanticTokenLegend } from './javascriptSemanticTokens';

const JS_WORD_REGEX = /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;

function getLanguageServiceHost(scriptKind: ts.ScriptKind) {
	const compilerOptions: ts.CompilerOptions = { allowNonTsExtensions: true, allowJs: true, lib: ['lib.es2020.full.d.ts'], target: ts.ScriptTarget.Latest, moduleResolution: ts.ModuleResolutionKind.Classic, experimentalDecorators: false };

	let currentTextDocument = TextDocument.create('init', 'javascript', 1, '');
	const jsLanguageService = import(/* webpackChunkName: "javascriptLibs" */ './javascriptLibs.js').then(libs => {
		const host: ts.LanguageServiceHost = {
			getCompilationSettings: () => compilerOptions,
			getScriptFileNames: () => [currentTextDocument.uri, 'jquery'],
			getScriptKind: (fileName) => {
				if (fileName === currentTextDocument.uri) {
					return scriptKind;
				}
				return fileName.substr(fileName.length - 2) === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS;
			},
			getScriptVersion: (fileName: string) => {
				if (fileName === currentTextDocument.uri) {
					return String(currentTextDocument.version);
				}
				return '1'; // default lib an jquery.d.ts are static
			},
			getScriptSnapshot: (fileName: string) => {
				let text = '';
				if (fileName === currentTextDocument.uri) {
					text = currentTextDocument.getText();
				} else {
					text = libs.loadLibrary(fileName);
				}
				return {
					getText: (start, end) => text.substring(start, end),
					getLength: () => text.length,
					getChangeRange: () => undefined
				};
			},
			getCurrentDirectory: () => '',
			getDefaultLibFileName: (_options: ts.CompilerOptions) => 'es2020.full',
			readFile: (path: string, _encoding?: string | undefined): string | undefined => {
				if (path === currentTextDocument.uri) {
					return currentTextDocument.getText();
				} else {
					return libs.loadLibrary(path);
				}
			},
			fileExists: (path: string): boolean => {
				if (path === currentTextDocument.uri) {
					return true;
				} else {
					return !!libs.loadLibrary(path);
				}
			},
			directoryExists: (path: string): boolean => {
				// typescript tries to first find libraries in node_modules/@types and node_modules/@typescript
				// there's no node_modules in our setup
				if (path.startsWith('node_modules')) {
					return false;
				}
				return true;

			}
		};
		return ts.createLanguageService(host);
	});
	return {
		async getLanguageService(jsDocument: TextDocument): Promise<ts.LanguageService> {
			currentTextDocument = jsDocument;
			return jsLanguageService;
		},
		getCompilationSettings() {
			return compilerOptions;
		},
		dispose() {
			jsLanguageService.then(s => s.dispose());
		}
	};
}

const ignoredErrors = [
	1108,  /* A_return_statement_can_only_be_used_within_a_function_body_1108 */
	2792, /* Cannot_find_module_0_Did_you_mean_to_set_the_moduleResolution_option_to_node_or_to_add_aliases_to_the_paths_option */
];

export function getJavaScriptMode(documentRegions: LanguageModelCache<HTMLDocumentRegions>, languageId: 'javascript' | 'typescript', workspace: Workspace): LanguageMode {
	const jsDocuments = getLanguageModelCache<TextDocument>(10, 60, document => documentRegions.get(document).getEmbeddedDocument(languageId));

	const host = getLanguageServiceHost(languageId === 'javascript' ? ts.ScriptKind.JS : ts.ScriptKind.TS);
	const globalSettings: Settings = {};

	function updateHostSettings(settings: Settings) {
		const hostSettings = host.getCompilationSettings();
		hostSettings.experimentalDecorators = settings?.['js/ts']?.implicitProjectConfig?.experimentalDecorators;
		hostSettings.strictNullChecks = settings?.['js/ts']?.implicitProjectConfig.strictNullChecks;
	}

	return {
		getId() {
			return languageId;
		},
		async doValidation(document: TextDocument, settings = workspace.settings): Promise<Diagnostic[]> {
			updateHostSettings(settings);

			const jsDocument = jsDocuments.get(document);
			const languageService = await host.getLanguageService(jsDocument);
			const syntaxDiagnostics: ts.Diagnostic[] = languageService.getSyntacticDiagnostics(jsDocument.uri);
			const semanticDiagnostics = languageService.getSemanticDiagnostics(jsDocument.uri);
			return syntaxDiagnostics.concat(semanticDiagnostics).filter(d => !ignoredErrors.includes(d.code)).map((diag: ts.Diagnostic): Diagnostic => {
				return {
					range: convertRange(jsDocument, diag),
					severity: DiagnosticSeverity.Error,
					source: languageId,
					message: ts.flattenDiagnosticMessageText(diag.messageText, '\n')
				};
			});
		},
		async doComplete(document: TextDocument, position: Position, _documentContext: DocumentContext): Promise<CompletionList> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const offset = jsDocument.offsetAt(position);
			const completions = jsLanguageService.getCompletionsAtPosition(jsDocument.uri, offset, { includeExternalModuleExports: false, includeInsertTextCompletions: false });
			if (!completions) {
				return { isIncomplete: false, items: [] };
			}
			const replaceRange = convertRange(jsDocument, getWordAtText(jsDocument.getText(), offset, JS_WORD_REGEX));
			return {
				isIncomplete: false,
				items: completions.entries.map(entry => {
					const data: CompletionItemData = { // data used for resolving item details (see 'doResolve')
						languageId,
						uri: document.uri,
						offset: offset
					};
					return {
						uri: document.uri,
						position: position,
						label: entry.name,
						sortText: entry.sortText,
						kind: convertKind(entry.kind),
						textEdit: TextEdit.replace(replaceRange, entry.name),
						data
					};
				})
			};
		},
		async doResolve(document: TextDocument, item: CompletionItem): Promise<CompletionItem> {
			if (isCompletionItemData(item.data)) {
				const jsDocument = jsDocuments.get(document);
				const jsLanguageService = await host.getLanguageService(jsDocument);
				const details = jsLanguageService.getCompletionEntryDetails(jsDocument.uri, item.data.offset, item.label, undefined, undefined, undefined, undefined);
				if (details) {
					item.detail = ts.displayPartsToString(details.displayParts);
					item.documentation = ts.displayPartsToString(details.documentation);
					delete item.data;
				}
			}
			return item;
		},
		async doHover(document: TextDocument, position: Position): Promise<Hover | null> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const info = jsLanguageService.getQuickInfoAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
			if (info) {
				const contents = ts.displayPartsToString(info.displayParts);
				return {
					range: convertRange(jsDocument, info.textSpan),
					contents: ['```typescript', contents, '```'].join('\n')
				};
			}
			return null;
		},
		async doSignatureHelp(document: TextDocument, position: Position): Promise<SignatureHelp | null> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const signHelp = jsLanguageService.getSignatureHelpItems(jsDocument.uri, jsDocument.offsetAt(position), undefined);
			if (signHelp) {
				const ret: SignatureHelp = {
					activeSignature: signHelp.selectedItemIndex,
					activeParameter: signHelp.argumentIndex,
					signatures: []
				};
				signHelp.items.forEach(item => {

					const signature: SignatureInformation = {
						label: '',
						documentation: undefined,
						parameters: []
					};

					signature.label += ts.displayPartsToString(item.prefixDisplayParts);
					item.parameters.forEach((p, i, a) => {
						const label = ts.displayPartsToString(p.displayParts);
						const parameter: ParameterInformation = {
							label: label,
							documentation: ts.displayPartsToString(p.documentation)
						};
						signature.label += label;
						signature.parameters!.push(parameter);
						if (i < a.length - 1) {
							signature.label += ts.displayPartsToString(item.separatorDisplayParts);
						}
					});
					signature.label += ts.displayPartsToString(item.suffixDisplayParts);
					ret.signatures.push(signature);
				});
				return ret;
			}
			return null;
		},
		async doRename(document: TextDocument, position: Position, newName: string) {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const jsDocumentPosition = jsDocument.offsetAt(position);
			const { canRename } = jsLanguageService.getRenameInfo(jsDocument.uri, jsDocumentPosition);
			if (!canRename) {
				return null;
			}
			const renameInfos = jsLanguageService.findRenameLocations(jsDocument.uri, jsDocumentPosition, false, false);

			const edits: TextEdit[] = [];
			renameInfos?.map(renameInfo => {
				edits.push({
					range: convertRange(jsDocument, renameInfo.textSpan),
					newText: newName,
				});
			});

			return {
				changes: { [document.uri]: edits },
			};
		},
		async findDocumentHighlight(document: TextDocument, position: Position): Promise<DocumentHighlight[]> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const highlights = jsLanguageService.getDocumentHighlights(jsDocument.uri, jsDocument.offsetAt(position), [jsDocument.uri]);
			const out: DocumentHighlight[] = [];
			for (const entry of highlights || []) {
				for (const highlight of entry.highlightSpans) {
					out.push({
						range: convertRange(jsDocument, highlight.textSpan),
						kind: highlight.kind === 'writtenReference' ? DocumentHighlightKind.Write : DocumentHighlightKind.Text
					});
				}
			}
			return out;
		},
		async findDocumentSymbols(document: TextDocument): Promise<SymbolInformation[]> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const items = jsLanguageService.getNavigationBarItems(jsDocument.uri);
			if (items) {
				const result: SymbolInformation[] = [];
				const existing = Object.create(null);
				const collectSymbols = (item: ts.NavigationBarItem, containerLabel?: string) => {
					const sig = item.text + item.kind + item.spans[0].start;
					if (item.kind !== 'script' && !existing[sig]) {
						const symbol: SymbolInformation = {
							name: item.text,
							kind: convertSymbolKind(item.kind),
							location: {
								uri: document.uri,
								range: convertRange(jsDocument, item.spans[0])
							},
							containerName: containerLabel
						};
						existing[sig] = true;
						result.push(symbol);
						containerLabel = item.text;
					}

					if (item.childItems && item.childItems.length > 0) {
						for (const child of item.childItems) {
							collectSymbols(child, containerLabel);
						}
					}

				};

				items.forEach(item => collectSymbols(item));
				return result;
			}
			return [];
		},
		async findDefinition(document: TextDocument, position: Position): Promise<Definition | null> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const definition = jsLanguageService.getDefinitionAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
			if (definition) {
				return definition.filter(d => d.fileName === jsDocument.uri).map(d => {
					return {
						uri: document.uri,
						range: convertRange(jsDocument, d.textSpan)
					};
				});
			}
			return null;
		},
		async findReferences(document: TextDocument, position: Position): Promise<Location[]> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const references = jsLanguageService.getReferencesAtPosition(jsDocument.uri, jsDocument.offsetAt(position));
			if (references) {
				return references.filter(d => d.fileName === jsDocument.uri).map(d => {
					return {
						uri: document.uri,
						range: convertRange(jsDocument, d.textSpan)
					};
				});
			}
			return [];
		},
		async getSelectionRange(document: TextDocument, position: Position): Promise<SelectionRange> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			function convertSelectionRange(selectionRange: ts.SelectionRange): SelectionRange {
				const parent = selectionRange.parent ? convertSelectionRange(selectionRange.parent) : undefined;
				return SelectionRange.create(convertRange(jsDocument, selectionRange.textSpan), parent);
			}
			const range = jsLanguageService.getSmartSelectionRange(jsDocument.uri, jsDocument.offsetAt(position));
			return convertSelectionRange(range);
		},
		async format(document: TextDocument, range: Range, formatParams: FormattingOptions, settings: Settings = globalSettings): Promise<TextEdit[]> {
			const jsDocument = documentRegions.get(document).getEmbeddedDocument('javascript', true);
			const jsLanguageService = await host.getLanguageService(jsDocument);

			const formatterSettings = settings && settings.javascript && settings.javascript.format;

			const initialIndentLevel = computeInitialIndent(document, range, formatParams);
			const formatSettings = convertOptions(formatParams, formatterSettings, initialIndentLevel + 1);
			const start = jsDocument.offsetAt(range.start);
			let end = jsDocument.offsetAt(range.end);
			let lastLineRange = null;
			if (range.end.line > range.start.line && (range.end.character === 0 || isWhitespaceOnly(jsDocument.getText().substr(end - range.end.character, range.end.character)))) {
				end -= range.end.character;
				lastLineRange = Range.create(Position.create(range.end.line, 0), range.end);
			}
			const edits = jsLanguageService.getFormattingEditsForRange(jsDocument.uri, start, end, formatSettings);
			if (edits) {
				const result = [];
				for (const edit of edits) {
					if (edit.span.start >= start && edit.span.start + edit.span.length <= end) {
						result.push({
							range: convertRange(jsDocument, edit.span),
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
			return [];
		},
		async getFoldingRanges(document: TextDocument): Promise<FoldingRange[]> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			const spans = jsLanguageService.getOutliningSpans(jsDocument.uri);
			const ranges: FoldingRange[] = [];
			for (const span of spans) {
				const curr = convertRange(jsDocument, span.textSpan);
				const startLine = curr.start.line;
				const endLine = curr.end.line;
				if (startLine < endLine) {
					const foldingRange: FoldingRange = { startLine, endLine };
					const match = document.getText(curr).match(/^\s*\/(?:(\/\s*#(?:end)?region\b)|(\*|\/))/);
					if (match) {
						foldingRange.kind = match[1] ? FoldingRangeKind.Region : FoldingRangeKind.Comment;
					}
					ranges.push(foldingRange);
				}
			}
			return ranges;
		},
		onDocumentRemoved(document: TextDocument) {
			jsDocuments.onDocumentRemoved(document);
		},
		async getSemanticTokens(document: TextDocument): Promise<SemanticTokenData[]> {
			const jsDocument = jsDocuments.get(document);
			const jsLanguageService = await host.getLanguageService(jsDocument);
			return [...getSemanticTokens(jsLanguageService, jsDocument, jsDocument.uri)];
		},
		getSemanticTokenLegend(): { types: string[]; modifiers: string[] } {
			return getSemanticTokenLegend();
		},
		dispose() {
			host.dispose();
			jsDocuments.dispose();
		}
	};
}




function convertRange(document: TextDocument, span: { start: number | undefined; length: number | undefined }): Range {
	if (typeof span.start === 'undefined') {
		const pos = document.positionAt(0);
		return Range.create(pos, pos);
	}
	const startPosition = document.positionAt(span.start);
	const endPosition = document.positionAt(span.start + (span.length || 0));
	return Range.create(startPosition, endPosition);
}

function convertKind(kind: string): CompletionItemKind {
	switch (kind) {
		case Kind.primitiveType:
		case Kind.keyword:
			return CompletionItemKind.Keyword;

		case Kind.const:
		case Kind.let:
		case Kind.variable:
		case Kind.localVariable:
		case Kind.alias:
		case Kind.parameter:
			return CompletionItemKind.Variable;

		case Kind.memberVariable:
		case Kind.memberGetAccessor:
		case Kind.memberSetAccessor:
			return CompletionItemKind.Field;

		case Kind.function:
		case Kind.localFunction:
			return CompletionItemKind.Function;

		case Kind.method:
		case Kind.constructSignature:
		case Kind.callSignature:
		case Kind.indexSignature:
			return CompletionItemKind.Method;

		case Kind.enum:
			return CompletionItemKind.Enum;

		case Kind.enumMember:
			return CompletionItemKind.EnumMember;

		case Kind.module:
		case Kind.externalModuleName:
			return CompletionItemKind.Module;

		case Kind.class:
		case Kind.type:
			return CompletionItemKind.Class;

		case Kind.interface:
			return CompletionItemKind.Interface;

		case Kind.warning:
			return CompletionItemKind.Text;

		case Kind.script:
			return CompletionItemKind.File;

		case Kind.directory:
			return CompletionItemKind.Folder;

		case Kind.string:
			return CompletionItemKind.Constant;

		default:
			return CompletionItemKind.Property;
	}
}
const enum Kind {
	alias = 'alias',
	callSignature = 'call',
	class = 'class',
	const = 'const',
	constructorImplementation = 'constructor',
	constructSignature = 'construct',
	directory = 'directory',
	enum = 'enum',
	enumMember = 'enum member',
	externalModuleName = 'external module name',
	function = 'function',
	indexSignature = 'index',
	interface = 'interface',
	keyword = 'keyword',
	let = 'let',
	localFunction = 'local function',
	localVariable = 'local var',
	method = 'method',
	memberGetAccessor = 'getter',
	memberSetAccessor = 'setter',
	memberVariable = 'property',
	module = 'module',
	primitiveType = 'primitive type',
	script = 'script',
	type = 'type',
	variable = 'var',
	warning = 'warning',
	string = 'string',
	parameter = 'parameter',
	typeParameter = 'type parameter'
}

function convertSymbolKind(kind: string): SymbolKind {
	switch (kind) {
		case Kind.module: return SymbolKind.Module;
		case Kind.class: return SymbolKind.Class;
		case Kind.enum: return SymbolKind.Enum;
		case Kind.enumMember: return SymbolKind.EnumMember;
		case Kind.interface: return SymbolKind.Interface;
		case Kind.indexSignature: return SymbolKind.Method;
		case Kind.callSignature: return SymbolKind.Method;
		case Kind.method: return SymbolKind.Method;
		case Kind.memberVariable: return SymbolKind.Property;
		case Kind.memberGetAccessor: return SymbolKind.Property;
		case Kind.memberSetAccessor: return SymbolKind.Property;
		case Kind.variable: return SymbolKind.Variable;
		case Kind.let: return SymbolKind.Variable;
		case Kind.const: return SymbolKind.Variable;
		case Kind.localVariable: return SymbolKind.Variable;
		case Kind.alias: return SymbolKind.Variable;
		case Kind.function: return SymbolKind.Function;
		case Kind.localFunction: return SymbolKind.Function;
		case Kind.constructSignature: return SymbolKind.Constructor;
		case Kind.constructorImplementation: return SymbolKind.Constructor;
		case Kind.typeParameter: return SymbolKind.TypeParameter;
		case Kind.string: return SymbolKind.String;
		default: return SymbolKind.Variable;
	}
}

function convertOptions(options: FormattingOptions, formatSettings: any, initialIndentLevel: number): ts.FormatCodeSettings {
	return {
		convertTabsToSpaces: options.insertSpaces,
		tabSize: options.tabSize,
		indentSize: options.tabSize,
		indentStyle: ts.IndentStyle.Smart,
		newLineCharacter: '\n',
		baseIndentSize: options.tabSize * initialIndentLevel,
		insertSpaceAfterCommaDelimiter: Boolean(!formatSettings || formatSettings.insertSpaceAfterCommaDelimiter),
		insertSpaceAfterConstructor: Boolean(formatSettings && formatSettings.insertSpaceAfterConstructor),
		insertSpaceAfterSemicolonInForStatements: Boolean(!formatSettings || formatSettings.insertSpaceAfterSemicolonInForStatements),
		insertSpaceBeforeAndAfterBinaryOperators: Boolean(!formatSettings || formatSettings.insertSpaceBeforeAndAfterBinaryOperators),
		insertSpaceAfterKeywordsInControlFlowStatements: Boolean(!formatSettings || formatSettings.insertSpaceAfterKeywordsInControlFlowStatements),
		insertSpaceAfterFunctionKeywordForAnonymousFunctions: Boolean(!formatSettings || formatSettings.insertSpaceAfterFunctionKeywordForAnonymousFunctions),
		insertSpaceBeforeFunctionParenthesis: Boolean(formatSettings && formatSettings.insertSpaceBeforeFunctionParenthesis),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces),
		insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: Boolean(!formatSettings || formatSettings.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces),
		insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces),
		insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: Boolean(formatSettings && formatSettings.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces),
		insertSpaceAfterTypeAssertion: Boolean(formatSettings && formatSettings.insertSpaceAfterTypeAssertion),
		placeOpenBraceOnNewLineForControlBlocks: Boolean(formatSettings && formatSettings.placeOpenBraceOnNewLineForFunctions),
		placeOpenBraceOnNewLineForFunctions: Boolean(formatSettings && formatSettings.placeOpenBraceOnNewLineForControlBlocks),
		semicolons: formatSettings?.semicolons
	};
}

function computeInitialIndent(document: TextDocument, range: Range, options: FormattingOptions) {
	const lineStart = document.offsetAt(Position.create(range.start.line, 0));
	const content = document.getText();

	let i = lineStart;
	let nChars = 0;
	const tabSize = options.tabSize || 4;
	while (i < content.length) {
		const ch = content.charAt(i);
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
