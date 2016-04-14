/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as editor from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import matches from 'vs/editor/common/modes/languageSelector';
import {IMarkerService, IMarkerData} from 'vs/platform/markers/common/markers';
import {IModelService} from 'vs/editor/common/services/modelService';
import {TypeScriptWorkerProtocol, LanguageServiceDefaults} from 'vs/languages/typescript/common/typescript';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';

export function register(modelService: IModelService, markerService: IMarkerService,
	selector: string, defaults:LanguageServiceDefaults, worker: (first: URI, ...more: URI[]) => TPromise<TypeScriptWorkerProtocol>): lifecycle.IDisposable {

	const disposables: lifecycle.IDisposable[] = [];
	disposables.push(modes.SuggestRegistry.register(selector, new SuggestAdapter(modelService, worker)));
	disposables.push(modes.ParameterHintsRegistry.register(selector, new ParameterHintsAdapter(modelService, worker)));
	disposables.push(modes.ExtraInfoRegistry.register(selector, new QuickInfoAdapter(modelService, worker)));
	disposables.push(modes.OccurrencesRegistry.register(selector, new OccurrencesAdapter(modelService, worker)));
	disposables.push(modes.DeclarationRegistry.register(selector, new DeclarationAdapter(modelService, worker)));
	disposables.push(modes.ReferenceSearchRegistry.register(selector, new ReferenceAdapter(modelService, worker)));
	disposables.push(modes.OutlineRegistry.register(selector, new OutlineAdapter(modelService, worker)));
	disposables.push(modes.FormatRegistry.register(selector, new FormatAdapter(modelService, worker)));
	disposables.push(modes.FormatOnTypeRegistry.register(selector, new FormatAdapter(modelService, worker)));
	disposables.push(new DiagnostcsAdapter(defaults, selector, markerService, modelService, worker));

	return lifecycle.combinedDisposable(disposables);
}

abstract class Adapter {

	constructor(protected _modelService: IModelService, protected _worker: (first:URI, ...more:URI[]) => TPromise<TypeScriptWorkerProtocol>) {

	}

	protected _positionToOffset(resource: URI, position: editor.IPosition): number {
		const model = this._modelService.getModel(resource);
		let result = position.column - 1;
		for (let i = 1; i < position.lineNumber; i++) {
			result += model.getLineContent(i).length + model.getEOL().length;
		}
		return result;
	}

	protected _offsetToPosition(resource: URI, offset: number): editor.IPosition {
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

	protected _textSpanToRange(resource: URI, span: ts.TextSpan): editor.IRange {
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

		const onModelAdd = (model: editor.IModel): void => {
			if (!matches(_selector, model.getAssociatedResource(), model.getModeId())) {
				return;
			}

			let handle: number;
			this._listener[model.getAssociatedResource().toString()] = model.addListener2(editor.EventType.ModelContentChanged2, () => {
				clearTimeout(handle);
				handle = setTimeout(() => this._doValidate(model.getAssociatedResource()), 500);
			});

			this._doValidate(model.getAssociatedResource());
		};

		const onModelRemoved = (model: editor.IModel): void => {
			delete this._listener[model.getAssociatedResource().toString()];
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

	suggest(resource: URI, position: editor.IPosition, triggerCharacter?: string) {

		const model = this._modelService.getModel(resource);
		const wordInfo = model.getWordUntilPosition(position);
		const offset = this._positionToOffset(resource, position);

		return this._worker(resource).then(worker => {
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
		});
	}

	getSuggestionDetails(resource: URI, position: editor.IPosition, suggestion: modes.ISuggestion) {

		return this._worker(resource).then(worker => {
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
		});
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

	getTriggerCharacters(): string[] {
		return ['.'];
	}

	shouldShowEmptySuggestionList(): boolean {
		return true;
	}

	shouldAutotriggerSuggest(context: modes.ILineContext, offset: number, triggeredByCharacter: string): boolean {
		return true;
	}
}

class ParameterHintsAdapter extends Adapter implements modes.IParameterHintsSupport {

	getParameterHintsTriggerCharacters(): string[] {
		return ['(', ','];
	}

	shouldTriggerParameterHints(context: modes.ILineContext, offset: number): boolean {
		return true;
	}

	getParameterHints(resource: URI, position: editor.IPosition, triggerCharacter?: string): TPromise<modes.IParameterHints> {
		return this._worker(resource).then(worker => worker.getSignatureHelpItems(resource.toString(), this._positionToOffset(resource, position))).then(info => {

			if (!info) {
				return;
			}

			let ret = <modes.IParameterHints>{
				currentSignature: info.selectedItemIndex,
				currentParameter: info.argumentIndex,
				signatures: []
			};

			info.items.forEach(item => {

				let signature = <modes.ISignature>{
					label: '',
					documentation: null,
					parameters: []
				};

				signature.label += ts.displayPartsToString(item.prefixDisplayParts);
				item.parameters.forEach((p, i, a) => {
					let label = ts.displayPartsToString(p.displayParts);
					let parameter = <modes.IParameter>{
						label: label,
						documentation: ts.displayPartsToString(p.documentation),
						signatureLabelOffset: signature.label.length,
						signatureLabelEnd: signature.label.length + label.length
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

		});
	}
}

// --- hover ------

class QuickInfoAdapter extends Adapter implements modes.IExtraInfoSupport {

	computeInfo(resource: URI, position: editor.IPosition): TPromise<modes.IComputeExtraInfoResult> {
		return this._worker(resource).then(worker => {
			return worker.getQuickInfoAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(info => {
			if (!info) {
				return;
			}
			return <modes.IComputeExtraInfoResult>{
				range: this._textSpanToRange(resource, info.textSpan),
				value: ts.displayPartsToString(info.displayParts)
			};
		});
	}
}

// --- occurrences ------

class OccurrencesAdapter extends Adapter implements modes.IOccurrencesSupport {

	findOccurrences(resource: URI, position: editor.IPosition, strict?: boolean): TPromise<modes.IOccurence[]> {
		return this._worker(resource).then(worker => {
			return worker.getOccurrencesAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(entries => {
			if (!entries) {
				return;
			}
			return entries.map(entry => {
				return <modes.IOccurence>{
					range: this._textSpanToRange(resource, entry.textSpan),
					kind: entry.isWriteAccess ? 'write' : 'text'
				};
			});
		});
	}
}

// --- definition ------

class DeclarationAdapter extends Adapter implements modes.IDeclarationSupport {

	canFindDeclaration(context: modes.ILineContext, offset: number): boolean {
		return true;
	}

	findDeclaration(resource: URI, position: editor.IPosition): TPromise<modes.IReference[]> {
		return this._worker(resource).then(worker => {
			return worker.getDefinitionAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(entries => {
			if (!entries) {
				return;
			}
			const result: modes.IReference[] = [];
			for (let entry of entries) {
				const uri = URI.parse(entry.fileName);
				if (this._modelService.getModel(uri)) {
					result.push({
						resource: uri,
						range: this._textSpanToRange(uri, entry.textSpan)
					});
				}
			}
			return result;
		});
	}
}

// --- references ------

class ReferenceAdapter extends Adapter implements modes.IReferenceSupport {

	canFindReferences(context: modes.ILineContext, offset: number): boolean {
		return true;
	}

	findReferences(resource: URI, position: editor.IPosition, includeDeclaration: boolean): TPromise<modes.IReference[]> {
		return this._worker(resource).then(worker => {
			return worker.getReferencesAtPosition(resource.toString(), this._positionToOffset(resource, position));
		}).then(entries => {
			if (!entries) {
				return;
			}
			const result: modes.IReference[] = [];
			for (let entry of entries) {
				const uri = URI.parse(entry.fileName);
				if (this._modelService.getModel(uri)) {
					result.push({
						resource: uri,
						range: this._textSpanToRange(uri, entry.textSpan)
					});
				}
			}
			return result;
		});
	}
}

// --- outline ------

class OutlineAdapter extends Adapter implements modes.IOutlineSupport {

	getOutline(resource: URI): TPromise<modes.IOutlineEntry[]> {
		return this._worker(resource).then(worker => worker.getNavigationBarItems(resource.toString())).then(items => {
			if (!items) {
				return;
			}

			const convert = (item: ts.NavigationBarItem): modes.IOutlineEntry => {
				return {
					label: item.text,
					type: item.kind,
					range: this._textSpanToRange(resource, item.spans[0]),
					children: item.childItems && item.childItems.map(convert)
				};
			};

			return items.map(convert);
		});
	}
}

// --- formatting ----

class FormatAdapter extends Adapter implements modes.IFormattingSupport {

	formatRange(resource: URI, range: editor.IRange, options: modes.IFormattingOptions): TPromise<editor.ISingleEditOperation[]>{
		return this._worker(resource).then(worker => {
			return worker.getFormattingEditsForRange(resource.toString(),
				this._positionToOffset(resource, { lineNumber: range.startLineNumber, column: range.startColumn }),
				this._positionToOffset(resource, { lineNumber: range.endLineNumber, column: range.endColumn }),
				FormatAdapter._convertOptions(options));
		}).then(edits => {
			if (edits) {
				return edits.map(edit => this._convertTextChanges(resource, edit));
			}
		});
	}

	get autoFormatTriggerCharacters() {
		return [';', '}', '\n'];
	}

	formatAfterKeystroke(resource: URI, position: editor.IPosition, ch: string, options: modes.IFormattingOptions): TPromise<editor.ISingleEditOperation[]> {
		return this._worker(resource).then(worker => {
			return worker.getFormattingEditsAfterKeystroke(resource.toString(),
				this._positionToOffset(resource, position),
				ch, FormatAdapter._convertOptions(options));
		}).then(edits => {
			if (edits) {
				return edits.map(edit => this._convertTextChanges(resource, edit));
			}
		});
	}

	private _convertTextChanges(resource: URI, change: ts.TextChange): editor.ISingleEditOperation {
		return <editor.ISingleEditOperation>{
			text: change.newText,
			range: this._textSpanToRange(resource, change.span)
		};
	}

	private static _convertOptions(options: modes.IFormattingOptions): ts.FormatCodeOptions {
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
}
