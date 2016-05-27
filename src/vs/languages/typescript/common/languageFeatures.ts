/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import matches from 'vs/editor/common/modes/languageSelector';
import {IMarkerService, IMarkerData} from 'vs/platform/markers/common/markers';
import {IModelService} from 'vs/editor/common/services/modelService';
import {TypeScriptWorkerProtocol, LanguageServiceDefaults} from 'vs/languages/typescript/common/typescript';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import {CancellationToken} from 'vs/base/common/cancellation';
import {wireCancellationToken} from 'vs/base/common/async';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';

export function register(modelService: IModelService, markerService: IMarkerService,
	selector: string, defaults:LanguageServiceDefaults, worker: (first: URI, ...more: URI[]) => TPromise<TypeScriptWorkerProtocol>): lifecycle.IDisposable {

	const disposables: lifecycle.IDisposable[] = [];
	disposables.push(modes.SuggestRegistry.register(selector, new SuggestAdapter(modelService, worker), true));
	disposables.push(modes.SignatureHelpProviderRegistry.register(selector, new SignatureHelpAdapter(modelService, worker), true));
	disposables.push(modes.HoverProviderRegistry.register(selector, new QuickInfoAdapter(modelService, worker), true));
	disposables.push(modes.DocumentHighlightProviderRegistry.register(selector, new OccurrencesAdapter(modelService, worker), true));
	disposables.push(modes.DefinitionProviderRegistry.register(selector, new DefinitionAdapter(modelService, worker), true));
	disposables.push(modes.ReferenceProviderRegistry.register(selector, new ReferenceAdapter(modelService, worker), true));
	disposables.push(modes.DocumentSymbolProviderRegistry.register(selector, new OutlineAdapter(modelService, worker), true));
	disposables.push(modes.DocumentRangeFormattingEditProviderRegistry.register(selector, new FormatAdapter(modelService, worker), true));
	disposables.push(modes.OnTypeFormattingEditProviderRegistry.register(selector, new FormatOnTypeAdapter(modelService, worker), true));
	disposables.push(new DiagnostcsAdapter(defaults, selector, markerService, modelService, worker));

	return lifecycle.combinedDisposable(disposables);
}

abstract class Adapter {

	constructor(protected _modelService: IModelService, protected _worker: (first:URI, ...more:URI[]) => TPromise<TypeScriptWorkerProtocol>) {

	}

	protected _positionToOffset(resource: URI, position: editorCommon.IPosition): number {
		const model = this._modelService.getModel(resource);
		let result = position.column - 1;
		for (let i = 1; i < position.lineNumber; i++) {
			result += model.getLineContent(i).length + model.getEOL().length;
		}
		return result;
	}

	protected _offsetToPosition(resource: URI, offset: number): editorCommon.IPosition {
		const model = this._modelService.getModel(resource);
		let lineNumber = 1;
		while (true) {
			let len = model.getLineContent(lineNumber).length + model.getEOL().length;
			if (offset < len) {
				break;
			}
			offset -= len;
			lineNumber++;
		}
		return { lineNumber, column: 1 + offset };
	}

	protected _textSpanToRange(resource: URI, span: ts.TextSpan): editorCommon.IRange {
		let p1 = this._offsetToPosition(resource, span.start);
		let p2 = this._offsetToPosition(resource, span.start + span.length);
		let {lineNumber: startLineNumber, column: startColumn} = p1;
		let {lineNumber: endLineNumber, column: endColumn} = p2;
		return { startLineNumber, startColumn, endLineNumber, endColumn };
	}
}

// --- diagnostics --- ---

class DiagnostcsAdapter extends Adapter {

	private _disposables: lifecycle.IDisposable[] = [];
	private _listener: { [uri: string]: lifecycle.IDisposable } = Object.create(null);

	constructor(private _defaults: LanguageServiceDefaults, private _selector: string,
		private _markerService: IMarkerService, modelService: IModelService,
		worker: (first: URI, ...more: URI[]) => TPromise<TypeScriptWorkerProtocol>
	) {
		super(modelService, worker);

		const onModelAdd = (model: editorCommon.IModel): void => {
			if (!matches(_selector, model.uri, model.getModeId())) {
				return;
			}

			let handle: number;
			this._listener[model.uri.toString()] = model.onDidChangeContent(() => {
				clearTimeout(handle);
				handle = setTimeout(() => this._doValidate(model.uri), 500);
			});

			this._doValidate(model.uri);
		};

		const onModelRemoved = (model: editorCommon.IModel): void => {
			delete this._listener[model.uri.toString()];
		};

		this._disposables.push(modelService.onModelAdded(onModelAdd));
		this._disposables.push(modelService.onModelRemoved(onModelRemoved));
		this._disposables.push(modelService.onModelModeChanged(event => {
			onModelRemoved(event.model);
			onModelAdd(event.model);
		}));

		this._disposables.push({
			dispose: () => {
				for (let key in this._listener) {
					this._listener[key].dispose();
				}
			}
		});

		modelService.getModels().forEach(onModelAdd);
	}

	public dispose(): void {
		this._disposables = lifecycle.dispose(this._disposables);
	}

	private _doValidate(resource: URI): void {
		this._worker(resource).then(worker => {
			let promises: TPromise<ts.Diagnostic[]>[] = [];
			if (!this._defaults.diagnosticsOptions.noSyntaxValidation) {
				promises.push(worker.getSyntacticDiagnostics(resource.toString()));
			}
			if (!this._defaults.diagnosticsOptions.noSemanticValidation) {
				promises.push(worker.getSemanticDiagnostics(resource.toString()));
			}
			return TPromise.join(promises);
		}).then(diagnostics => {
			const markers = diagnostics
				.reduce((p, c) => c.concat(p), [])
				.map(d => this._convertDiagnostics(resource, d));
			this._markerService.changeOne(this._selector, resource, markers);
		}).done(undefined, err => {
			console.error(err);
		});
	}

	private _convertDiagnostics(resource: URI, diag: ts.Diagnostic): IMarkerData {
		const {lineNumber: startLineNumber, column: startColumn} = this._offsetToPosition(resource, diag.start);
		const {lineNumber: endLineNumber, column: endColumn} = this._offsetToPosition(resource, diag.start + diag.length);

		return {
			severity: Severity.Error,
			startLineNumber,
			startColumn,
			endLineNumber,
			endColumn,
			message: ts.flattenDiagnosticMessageText(diag.messageText, '\n')
		};
	}
}

// --- suggest ------

class SuggestAdapter extends Adapter implements modes.ISuggestSupport {

	public get triggerCharacters(): string[] {
		return ['.'];
	}

	public get shouldAutotriggerSuggest(): boolean {
		return true;
	}

	provideCompletionItems(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Thenable<modes.ISuggestResult[]> {
		const wordInfo = model.getWordUntilPosition(position);
		const resource = model.uri;
		const offset = this._positionToOffset(resource, position);

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getCompletionsAtPosition(resource.toString(), offset);
		}).then(info => {
			if (!info) {
				return;
			}
			let suggestions = info.entries.map(entry => {
				return <modes.ISuggestion>{
					label: entry.name,
					codeSnippet: entry.name,
					type: SuggestAdapter.asType(entry.kind)
				};
			});

			return [{
				currentWord: wordInfo && wordInfo.word,
				suggestions
			}];
		}));
	}

	resolveCompletionItem(model:editorCommon.IReadOnlyModel, position:Position, suggestion: modes.ISuggestion, token: CancellationToken): Thenable<modes.ISuggestion> {
		const resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getCompletionEntryDetails(resource.toString(),
				this._positionToOffset(resource, position),
				suggestion.label);

		}).then(details => {
			if (!details) {
				return suggestion;
			}
			return <modes.ISuggestion>{
				label: details.name,
				codeSnippet: details.name,
				type: SuggestAdapter.asType(details.kind),
				typeLabel: ts.displayPartsToString(details.displayParts),
				documentationLabel: ts.displayPartsToString(details.documentation)
			};
		}));
	}

	static asType(kind: string): modes.SuggestionType{
		switch (kind) {
			case 'getter':
			case 'setting':
			case 'constructor':
			case 'method':
			case 'property':
				return 'property';
			case 'function':
			case 'local function':
				return 'function';
			case 'class':
				return 'class';
			case 'interface':
				return 'interface';
		}

		return 'variable';
	}
}

class SignatureHelpAdapter extends Adapter implements modes.SignatureHelpProvider {

	public signatureHelpTriggerCharacters = ['(', ','];

	provideSignatureHelp(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.SignatureHelp> {
		let resource = model.uri;
		return wireCancellationToken(token, this._worker(resource).then(worker => worker.getSignatureHelpItems(resource.toString(), this._positionToOffset(resource, position))).then(info => {

			if (!info) {
				return;
			}

			let ret:modes.SignatureHelp = {
				activeSignature: info.selectedItemIndex,
				activeParameter: info.argumentIndex,
				signatures: []
			};

			info.items.forEach(item => {

				let signature:modes.SignatureInformation = {
					label: '',
					documentation: null,
					parameters: []
				};

				signature.label += ts.displayPartsToString(item.prefixDisplayParts);
				item.parameters.forEach((p, i, a) => {
					let label = ts.displayPartsToString(p.displayParts);
					let parameter:modes.ParameterInformation = {
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

		}));
	}
}

// --- hover ------

class QuickInfoAdapter extends Adapter implements modes.HoverProvider {

	provideHover(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Thenable<modes.Hover> {
		let resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getQuickInfoAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(info => {
			if (!info) {
				return;
			}
			return <modes.Hover>{
				range: this._textSpanToRange(resource, info.textSpan),
				htmlContent: [{ text: ts.displayPartsToString(info.displayParts) }]
			};
		}));
	}
}

// --- occurrences ------

class OccurrencesAdapter extends Adapter implements modes.DocumentHighlightProvider {

	public provideDocumentHighlights(model: editorCommon.IReadOnlyModel, position: Position, token: CancellationToken): Thenable<modes.DocumentHighlight[]> {
		const resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getOccurrencesAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(entries => {
			if (!entries) {
				return;
			}
			return entries.map(entry => {
				return <modes.DocumentHighlight>{
					range: this._textSpanToRange(resource, entry.textSpan),
					kind: entry.isWriteAccess ? modes.DocumentHighlightKind.Write : modes.DocumentHighlightKind.Text
				};
			});
		}));
	}
}

// --- definition ------

class DefinitionAdapter extends Adapter {

	public provideDefinition(model:editorCommon.IReadOnlyModel, position:Position, token:CancellationToken): Thenable<modes.Definition> {
		const resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getDefinitionAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(entries => {
			if (!entries) {
				return;
			}
			const result: modes.Location[] = [];
			for (let entry of entries) {
				const uri = URI.parse(entry.fileName);
				if (this._modelService.getModel(uri)) {
					result.push({
						uri: uri,
						range: this._textSpanToRange(uri, entry.textSpan)
					});
				}
			}
			return result;
		}));
	}
}

// --- references ------

class ReferenceAdapter extends Adapter implements modes.ReferenceProvider {

	provideReferences(model:editorCommon.IReadOnlyModel, position:Position, context: modes.ReferenceContext, token: CancellationToken): Thenable<modes.Location[]> {
		const resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getReferencesAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(entries => {
			if (!entries) {
				return;
			}
			const result: modes.Location[] = [];
			for (let entry of entries) {
				const uri = URI.parse(entry.fileName);
				if (this._modelService.getModel(uri)) {
					result.push({
						uri: uri,
						range: this._textSpanToRange(uri, entry.textSpan)
					});
				}
			}
			return result;
		}));
	}
}

// --- outline ------

class OutlineAdapter extends Adapter implements modes.DocumentSymbolProvider {

	public provideDocumentSymbols(model:editorCommon.IReadOnlyModel, token: CancellationToken): Thenable<modes.SymbolInformation[]> {
		const resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => worker.getNavigationBarItems(resource.toString())).then(items => {
			if (!items) {
				return;
			}

			function convert(bucket: modes.SymbolInformation[], item: ts.NavigationBarItem, containerLabel?: string): void {
				let result: modes.SymbolInformation = {
					name: item.text,
					kind: outlineTypeTable[item.kind] || modes.SymbolKind.Variable,
					location: {
						uri: resource,
						range: this._textSpanToRange(resource, item.spans[0])
					},
					containerName: containerLabel
				};

				if (item.childItems && item.childItems.length > 0) {
					for (let child of item.childItems) {
						convert(bucket, child, result.name);
					}
				}

				bucket.push(result);
			}

			let result: modes.SymbolInformation[] = [];
			items.forEach(item => convert(result, item));
			return result;
		}));
	}
}

export class Kind {
	public static unknown:string = '';
	public static keyword:string = 'keyword';
	public static script:string = 'script';
	public static module:string = 'module';
	public static class:string = 'class';
	public static interface:string = 'interface';
	public static type:string = 'type';
	public static enum:string = 'enum';
	public static variable:string = 'var';
	public static localVariable:string = 'local var';
	public static function:string = 'function';
	public static localFunction:string = 'local function';
	public static memberFunction:string = 'method';
	public static memberGetAccessor:string = 'getter';
	public static memberSetAccessor:string = 'setter';
	public static memberVariable:string = 'property';
	public static constructorImplementation:string = 'constructor';
	public static callSignature:string = 'call';
	public static indexSignature:string = 'index';
	public static constructSignature:string = 'construct';
	public static parameter:string = 'parameter';
	public static typeParameter:string = 'type parameter';
	public static primitiveType:string = 'primitive type';
	public static label:string = 'label';
	public static alias:string = 'alias';
	public static const:string = 'const';
	public static let:string = 'let';
	public static warning:string = 'warning';
}

let outlineTypeTable: { [kind: string]: modes.SymbolKind } = Object.create(null);
outlineTypeTable[Kind.module] = modes.SymbolKind.Module;
outlineTypeTable[Kind.class] = modes.SymbolKind.Class;
outlineTypeTable[Kind.enum] = modes.SymbolKind.Enum;
outlineTypeTable[Kind.interface] = modes.SymbolKind.Interface;
outlineTypeTable[Kind.memberFunction] = modes.SymbolKind.Method;
outlineTypeTable[Kind.memberVariable] = modes.SymbolKind.Property;
outlineTypeTable[Kind.memberGetAccessor] = modes.SymbolKind.Property;
outlineTypeTable[Kind.memberSetAccessor] = modes.SymbolKind.Property;
outlineTypeTable[Kind.variable] = modes.SymbolKind.Variable;
outlineTypeTable[Kind.const] = modes.SymbolKind.Variable;
outlineTypeTable[Kind.localVariable] = modes.SymbolKind.Variable;
outlineTypeTable[Kind.variable] = modes.SymbolKind.Variable;
outlineTypeTable[Kind.function] = modes.SymbolKind.Function;
outlineTypeTable[Kind.localFunction] = modes.SymbolKind.Function;

// --- formatting ----

abstract class FormatHelper extends Adapter {
	protected static _convertOptions(options: modes.IFormattingOptions): ts.FormatCodeOptions {
		return {
			ConvertTabsToSpaces: options.insertSpaces,
			TabSize: options.tabSize,
			IndentSize: options.tabSize,
			IndentStyle: ts.IndentStyle.Smart,
			NewLineCharacter: '\n',
			InsertSpaceAfterCommaDelimiter: true,
			InsertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
			InsertSpaceAfterKeywordsInControlFlowStatements: false,
			InsertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: true,
			InsertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: true,
			InsertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: true,
			InsertSpaceAfterSemicolonInForStatements: false,
			InsertSpaceBeforeAndAfterBinaryOperators: true,
			PlaceOpenBraceOnNewLineForControlBlocks: false,
			PlaceOpenBraceOnNewLineForFunctions: false
		};
	}

	protected _convertTextChanges(resource: URI, change: ts.TextChange): editorCommon.ISingleEditOperation {
		return <editorCommon.ISingleEditOperation>{
			text: change.newText,
			range: this._textSpanToRange(resource, change.span)
		};
	}
}

class FormatAdapter extends FormatHelper implements modes.DocumentRangeFormattingEditProvider {

	provideDocumentRangeFormattingEdits(model: editorCommon.IReadOnlyModel, range: Range, options: modes.IFormattingOptions, token: CancellationToken): Thenable<editorCommon.ISingleEditOperation[]> {
		const resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getFormattingEditsForRange(resource.toString(),
				this._positionToOffset(resource, { lineNumber: range.startLineNumber, column: range.startColumn }),
				this._positionToOffset(resource, { lineNumber: range.endLineNumber, column: range.endColumn }),
				FormatHelper._convertOptions(options));
		}).then(edits => {
			if (edits) {
				return edits.map(edit => this._convertTextChanges(resource, edit));
			}
		}));
	}
}

class FormatOnTypeAdapter extends FormatHelper implements modes.OnTypeFormattingEditProvider {

	get autoFormatTriggerCharacters() {
		return [';', '}', '\n'];
	}

	provideOnTypeFormattingEdits(model: editorCommon.IReadOnlyModel, position: Position, ch: string, options: modes.IFormattingOptions, token: CancellationToken): Thenable<editorCommon.ISingleEditOperation[]> {
		const resource = model.uri;

		return wireCancellationToken(token, this._worker(resource).then(worker => {
			return worker.getFormattingEditsAfterKeystroke(resource.toString(),
				this._positionToOffset(resource, position),
				ch, FormatHelper._convertOptions(options));
		}).then(edits => {
			if (edits) {
				return edits.map(edit => this._convertTextChanges(resource, edit));
			}
		}));
	}
}
