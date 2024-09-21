/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { equalsIfDefined, itemEquals } from '../../../../../base/common/equals.js';
import { matchesSubString } from '../../../../../base/common/filters.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, ITransaction, derivedOpts, disposableObservableValue, transaction } from '../../../../../base/common/observable.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit } from '../../../../common/core/textEdit.js';
import { TextLength } from '../../../../common/core/textLength.js';
import { InlineCompletionContext, InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { EndOfLinePreference, ITextModel } from '../../../../common/model.js';
import { IFeatureDebounceInformation } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { InlineCompletionItem, InlineCompletionProviderResult, provideInlineCompletions } from './provideInlineCompletions.js';
import { singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';

export class InlineCompletionsSource extends Disposable {
	private readonly _updateOperation = this._register(new MutableDisposable<UpdateOperation>());
	public readonly inlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('inlineCompletions', undefined);
	public readonly suggestWidgetInlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('suggestWidgetInlineCompletions', undefined);

	constructor(
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservable<number | null>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
	) {
		super();

		this._register(this._textModel.onDidChangeContent(() => {
			this._updateOperation.clear();
		}));
	}

	public fetch(position: Position, context: InlineCompletionContext, activeInlineCompletion: InlineCompletionWithUpdatedRange | undefined): Promise<boolean> {
		const request = new UpdateRequest(position, context, this._textModel.getVersionId());

		const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions : this.inlineCompletions;

		if (this._updateOperation.value?.request.satisfies(request)) {
			return this._updateOperation.value.promise;
		} else if (target.get()?.request.satisfies(request)) {
			return Promise.resolve(true);
		}

		const updateOngoing = !!this._updateOperation.value;
		this._updateOperation.clear();

		const source = new CancellationTokenSource();

		const promise = (async () => {
			const shouldDebounce = updateOngoing || context.triggerKind === InlineCompletionTriggerKind.Automatic;
			if (shouldDebounce) {
				// This debounces the operation
				await wait(this._debounceValue.get(this._textModel), source.token);
			}

			if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
				return false;
			}

			const startTime = new Date();
			const updatedCompletions = await provideInlineCompletions(
				this._languageFeaturesService.inlineCompletionsProvider,
				position,
				this._textModel,
				context,
				source.token,
				this._languageConfigurationService
			);

			if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
				return false;
			}

			const endTime = new Date();
			this._debounceValue.update(this._textModel, endTime.getTime() - startTime.getTime());

			const completions = new UpToDateInlineCompletions(updatedCompletions, request, this._textModel, this._versionId);
			if (activeInlineCompletion) {
				const asInlineCompletion = activeInlineCompletion.toInlineCompletion(undefined);
				if (activeInlineCompletion.canBeReused(this._textModel, position) && !updatedCompletions.has(asInlineCompletion)) {
					completions.prepend(activeInlineCompletion.inlineCompletion, asInlineCompletion.range, true);
				}
			}

			this._updateOperation.clear();
			transaction(tx => {
				/** @description Update completions with provider result */
				target.set(completions, tx);
			});

			return true;
		})();

		const updateOperation = new UpdateOperation(request, source, promise);
		this._updateOperation.value = updateOperation;

		return promise;
	}

	public clear(tx: ITransaction): void {
		this._updateOperation.clear();
		this.inlineCompletions.set(undefined, tx);
		this.suggestWidgetInlineCompletions.set(undefined, tx);
	}

	public clearSuggestWidgetInlineCompletions(tx: ITransaction): void {
		if (this._updateOperation.value?.request.context.selectedSuggestionInfo) {
			this._updateOperation.clear();
		}
		this.suggestWidgetInlineCompletions.set(undefined, tx);
	}

	public cancelUpdate(): void {
		this._updateOperation.clear();
	}
}

function wait(ms: number, cancellationToken?: CancellationToken): Promise<void> {
	return new Promise(resolve => {
		let d: IDisposable | undefined = undefined;
		const handle = setTimeout(() => {
			if (d) { d.dispose(); }
			resolve();
		}, ms);
		if (cancellationToken) {
			d = cancellationToken.onCancellationRequested(() => {
				clearTimeout(handle);
				if (d) { d.dispose(); }
				resolve();
			});
		}
	});
}

class UpdateRequest {
	constructor(
		public readonly position: Position,
		public readonly context: InlineCompletionContext,
		public readonly versionId: number,
	) {
	}

	public satisfies(other: UpdateRequest): boolean {
		return this.position.equals(other.position)
			&& equalsIfDefined(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, itemEquals())
			&& (other.context.triggerKind === InlineCompletionTriggerKind.Automatic
				|| this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
			&& this.versionId === other.versionId;
	}
}

class UpdateOperation implements IDisposable {
	constructor(
		public readonly request: UpdateRequest,
		public readonly cancellationTokenSource: CancellationTokenSource,
		public readonly promise: Promise<boolean>,
	) {
	}

	dispose() {
		this.cancellationTokenSource.cancel();
	}
}

export class UpToDateInlineCompletions implements IDisposable {
	private readonly _inlineCompletions: InlineCompletionWithUpdatedRange[];
	public get inlineCompletions(): ReadonlyArray<InlineCompletionWithUpdatedRange> { return this._inlineCompletions; }

	private _refCount = 1;
	private readonly _prependedInlineCompletionItems: InlineCompletionItem[] = [];

	constructor(
		private readonly inlineCompletionProviderResult: InlineCompletionProviderResult,
		public readonly request: UpdateRequest,
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservable<number | null>,
	) {
		const ids = _textModel.deltaDecorations([], inlineCompletionProviderResult.completions.map(i => ({
			range: i.range,
			options: {
				description: 'inline-completion-tracking-range'
			},
		})));

		this._inlineCompletions = inlineCompletionProviderResult.completions.map(
			(i, index) => new InlineCompletionWithUpdatedRange(i, ids[index], this._textModel, this._versionId)
		);
	}

	public clone(): this {
		this._refCount++;
		return this;
	}

	public dispose(): void {
		this._refCount--;
		if (this._refCount === 0) {
			setTimeout(() => {
				// To fix https://github.com/microsoft/vscode/issues/188348
				if (!this._textModel.isDisposed()) {
					// This is just cleanup. It's ok if it happens with a delay.
					this._textModel.deltaDecorations(this._inlineCompletions.map(i => i.decorationId), []);
				}
			}, 0);
			this.inlineCompletionProviderResult.dispose();
			for (const i of this._prependedInlineCompletionItems) {
				i.source.removeRef();
			}
		}
	}

	public prepend(inlineCompletion: InlineCompletionItem, range: Range, addRefToSource: boolean): void {
		if (addRefToSource) {
			inlineCompletion.source.addRef();
		}

		const id = this._textModel.deltaDecorations([], [{
			range,
			options: {
				description: 'inline-completion-tracking-range'
			},
		}])[0];
		this._inlineCompletions.unshift(new InlineCompletionWithUpdatedRange(inlineCompletion, id, this._textModel, this._versionId));
		this._prependedInlineCompletionItems.push(inlineCompletion);
	}
}

export class InlineCompletionWithUpdatedRange {
	public readonly semanticId = JSON.stringify([
		this.inlineCompletion.filterText,
		this.inlineCompletion.insertText,
		this.inlineCompletion.range.getStartPosition().toString()
	]);

	public get forwardStable() {
		return this.inlineCompletion.source.inlineCompletions.enableForwardStability ?? false;
	}

	private readonly _updatedRange = derivedOpts<Range | null>({ owner: this, equalsFn: Range.equalsRange }, reader => {
		this._modelVersion.read(reader);
		return this._textModel.getDecorationRange(this.decorationId);
	});

	constructor(
		public readonly inlineCompletion: InlineCompletionItem,
		public readonly decorationId: string,
		private readonly _textModel: ITextModel,
		private readonly _modelVersion: IObservable<number | null>,
	) {
	}

	public toInlineCompletion(reader: IReader | undefined): InlineCompletionItem {
		return this.inlineCompletion.withRange(this._updatedRange.read(reader) ?? emptyRange);
	}

	public toSingleTextEdit(reader: IReader | undefined): SingleTextEdit {
		return new SingleTextEdit(this._updatedRange.read(reader) ?? emptyRange, this.inlineCompletion.insertText);
	}

	public isVisible(model: ITextModel, cursorPosition: Position, reader: IReader | undefined): boolean {
		const minimizedReplacement = singleTextRemoveCommonPrefix(this._toFilterTextReplacement(reader), model);
		const updatedRange = this._updatedRange.read(reader);
		if (
			!updatedRange
			|| !this.inlineCompletion.range.getStartPosition().equals(updatedRange.getStartPosition())
			|| cursorPosition.lineNumber !== minimizedReplacement.range.startLineNumber
		) {
			return false;
		}

		// We might consider comparing by .toLowerText, but this requires GhostTextReplacement
		const originalValue = model.getValueInRange(minimizedReplacement.range, EndOfLinePreference.LF);
		const filterText = minimizedReplacement.text;

		const cursorPosIndex = Math.max(0, cursorPosition.column - minimizedReplacement.range.startColumn);

		let filterTextBefore = filterText.substring(0, cursorPosIndex);
		let filterTextAfter = filterText.substring(cursorPosIndex);

		let originalValueBefore = originalValue.substring(0, cursorPosIndex);
		let originalValueAfter = originalValue.substring(cursorPosIndex);

		const originalValueIndent = model.getLineIndentColumn(minimizedReplacement.range.startLineNumber);
		if (minimizedReplacement.range.startColumn <= originalValueIndent) {
			// Remove indentation
			originalValueBefore = originalValueBefore.trimStart();
			if (originalValueBefore.length === 0) {
				originalValueAfter = originalValueAfter.trimStart();
			}
			filterTextBefore = filterTextBefore.trimStart();
			if (filterTextBefore.length === 0) {
				filterTextAfter = filterTextAfter.trimStart();
			}
		}

		return filterTextBefore.startsWith(originalValueBefore)
			&& !!matchesSubString(originalValueAfter, filterTextAfter);
	}

	public canBeReused(model: ITextModel, position: Position): boolean {
		const updatedRange = this._updatedRange.read(undefined);
		const result = !!updatedRange
			&& updatedRange.containsPosition(position)
			&& this.isVisible(model, position, undefined)
			&& TextLength.ofRange(updatedRange).isGreaterThanOrEqualTo(TextLength.ofRange(this.inlineCompletion.range));
		return result;
	}

	private _toFilterTextReplacement(reader: IReader | undefined): SingleTextEdit {
		return new SingleTextEdit(this._updatedRange.read(reader) ?? emptyRange, this.inlineCompletion.filterText);
	}
}

const emptyRange = new Range(1, 1, 1, 1);
