/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as editor from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import * as lifecycle from 'vs/base/common/lifecycle';
import * as ts from 'vs/languages/typescript/common/lib/typescriptServices';
import AbstractWorker from './worker/worker';
import {IModelService} from 'vs/editor/common/services/modelService';
import {SuggestRegistry} from 'vs/editor/contrib/suggest/common/suggest';
import {ParameterHintsRegistry} from 'vs/editor/contrib/parameterHints/common/parameterHints';
import {OccurrencesRegistry} from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import {ExtraInfoRegistry} from 'vs/editor/contrib/hover/common/hover';
import {ReferenceRegistry} from 'vs/editor/contrib/referenceSearch/common/referenceSearch';
import {DeclarationRegistry} from 'vs/editor/contrib/goToDeclaration/common/goToDeclaration';

export default function registerLanguageFeatures(selector: string, modelService: IModelService, worker: () => TPromise<AbstractWorker>): lifecycle.IDisposable {
	const disposables: lifecycle.IDisposable[] = [];
	disposables.push(SuggestRegistry.register(selector, new SuggestAdapter(modelService, worker)));
	disposables.push(ParameterHintsRegistry.register(selector, new ParameterHintsAdapter(modelService, worker)));
	disposables.push(ExtraInfoRegistry.register(selector, new QuickInfoAdapter(modelService, worker)));
	disposables.push(OccurrencesRegistry.register(selector, new OccurrencesAdapter(modelService, worker)));
	disposables.push(DeclarationRegistry.register(selector, new DeclarationAdapter(modelService, worker)));
	disposables.push(ReferenceRegistry.register(selector, new ReferenceAdapter(modelService, worker)));
	return lifecycle.combinedDispose2(disposables);
}

abstract class Adapter {

	constructor(protected _modelService: IModelService, protected _worker: () => TPromise<AbstractWorker>) {

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

// --- suggest ------

class SuggestAdapter extends Adapter implements modes.ISuggestSupport {

	suggest(resource: URI, position: editor.IPosition, triggerCharacter?: string) {

		const model = this._modelService.getModel(resource);
		const wordInfo = model.getWordUntilPosition(position);
		const offset = this._positionToOffset(resource, position);

		return this._worker().then(worker => {
			return worker.getCompletionsAtPosition(resource.toString(), offset);
		}).then(info => {
			if (!info) {
				return;
			}
			let suggestions = info.entries.map(entry => {
				return <modes.ISuggestion>{
					label: entry.name,
					codeSnippet: entry.name,
					type: entry.kind
				};
			});

			return [{
				currentWord: wordInfo && wordInfo.word,
				suggestions
			}];
		});
	}

	getSuggestionDetails(resource: URI, position: editor.IPosition, suggestion: modes.ISuggestion) {

		return this._worker().then(worker => {
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
				type: details.kind,
				typeLabel: ts.displayPartsToString(details.displayParts),
				documentationLabel: ts.displayPartsToString(details.documentation)
			};
		});
	}

	getFilter(): modes.ISuggestionFilter {
		return;
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
		return this._worker().then(worker => worker.getSignatureHelpItems(resource.toString(), this._positionToOffset(resource, position))).then(info => {

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
		return this._worker().then(worker => {
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
		return this._worker().then(worker => {
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
		return this._worker().then(worker => {
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

	/**
	 * @returns a list of reference of the symbol at the position in the
	 * 	given resource.
	 */
	findReferences(resource: URI, position: editor.IPosition, includeDeclaration: boolean): TPromise<modes.IReference[]> {
		return this._worker().then(worker => {
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
