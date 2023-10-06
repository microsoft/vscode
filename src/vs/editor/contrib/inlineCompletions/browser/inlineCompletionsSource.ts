/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { matchesSubString } from 'vs/base/common/filters';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ITransaction, derived, disposableObservableValue, transaction } from 'vs/base/common/observable';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { InlineCompletionContext, InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { IFeatureDebounceInformation } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { InlineCompletionItem, InlineCompletionProviderResult, provideInlineCompletions } from 'vs/editor/contrib/inlineCompletions/browser/provideInlineCompletions';
import { SingleTextEdit } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';

export class InlineCompletionsSource extends Disposable {
	private readonly _updateOperation = this._register(new MutableDisposable<UpdateOperation>());
	public readonly inlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('inlineCompletions', undefined);
	public readonly suggestWidgetInlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('suggestWidgetInlineCompletions', undefined);

	constructor(
		private readonly textModel: ITextModel,
		private readonly versionId: IObservable<number>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
	) {
		super();

		this._register(this.textModel.onDidChangeContent(() => {
			this._updateOperation.clear();
		}));
	}

	public fetch(position: Position, context: InlineCompletionContext, activeInlineCompletion: InlineCompletionWithUpdatedRange | undefined): Promise<boolean> {
		const request = new UpdateRequest(position, context, this.textModel.getVersionId());

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
				await wait(this._debounceValue.get(this.textModel));
			}

			if (source.token.isCancellationRequested || this.textModel.getVersionId() !== request.versionId) {
				return false;
			}

			const startTime = new Date();
			const updatedCompletions = await provideInlineCompletions(
				this.languageFeaturesService.inlineCompletionsProvider,
				position,
				this.textModel,
				context,
				source.token,
				this.languageConfigurationService
			);

			if (source.token.isCancellationRequested || this.textModel.getVersionId() !== request.versionId) {
				return false;
			}

			const endTime = new Date();
			this._debounceValue.update(this.textModel, endTime.getTime() - startTime.getTime());

			const completions = new UpToDateInlineCompletions(updatedCompletions, request, this.textModel, this.versionId);
			if (activeInlineCompletion) {
				const asInlineCompletion = activeInlineCompletion.toInlineCompletion(undefined);
				if (activeInlineCompletion.canBeReused(this.textModel, position) && !updatedCompletions.has(asInlineCompletion)) {
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
			&& equals(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, (v1, v2) => v1.equals(v2))
			&& (other.context.triggerKind === InlineCompletionTriggerKind.Automatic
				|| this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
			&& this.versionId === other.versionId;
	}
}

function equals<T>(v1: T | undefined, v2: T | undefined, equals: (v1: T, v2: T) => boolean): boolean {
	if (!v1 || !v2) {
		return v1 === v2;
	}
	return equals(v1, v2);
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

	private _rangeVersionIdValue = 0;
	private readonly _rangeVersionId = derived(this, reader => {
		this.versionId.read(reader);
		let changed = false;
		for (const i of this._inlineCompletions) {
			changed = changed || i._updateRange(this.textModel);
		}
		if (changed) {
			this._rangeVersionIdValue++;
		}
		return this._rangeVersionIdValue;
	});

	constructor(
		private readonly inlineCompletionProviderResult: InlineCompletionProviderResult,
		public readonly request: UpdateRequest,
		private readonly textModel: ITextModel,
		private readonly versionId: IObservable<number>,
	) {
		const ids = textModel.deltaDecorations([], inlineCompletionProviderResult.completions.map(i => ({
			range: i.range,
			options: {
				description: 'inline-completion-tracking-range'
			},
		})));

		this._inlineCompletions = inlineCompletionProviderResult.completions.map(
			(i, index) => new InlineCompletionWithUpdatedRange(i, ids[index], this._rangeVersionId)
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
				if (!this.textModel.isDisposed()) {
					// This is just cleanup. It's ok if it happens with a delay.
					this.textModel.deltaDecorations(this._inlineCompletions.map(i => i.decorationId), []);
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

		const id = this.textModel.deltaDecorations([], [{
			range,
			options: {
				description: 'inline-completion-tracking-range'
			},
		}])[0];
		this._inlineCompletions.unshift(new InlineCompletionWithUpdatedRange(inlineCompletion, id, this._rangeVersionId, range));
		this._prependedInlineCompletionItems.push(inlineCompletion);
	}
}

export class InlineCompletionWithUpdatedRange {
	public readonly semanticId = JSON.stringify([
		this.inlineCompletion.filterText,
		this.inlineCompletion.insertText,
		this.inlineCompletion.range.getStartPosition().toString()
	]);
	private _updatedRange: Range;
	private _isValid = true;

	public get forwardStable() {
		return this.inlineCompletion.source.inlineCompletions.enableForwardStability ?? false;
	}

	constructor(
		public readonly inlineCompletion: InlineCompletionItem,
		public readonly decorationId: string,
		private readonly rangeVersion: IObservable<number>,
		initialRange?: Range,
	) {
		this._updatedRange = initialRange ?? inlineCompletion.range;
	}

	public toInlineCompletion(reader: IReader | undefined): InlineCompletionItem {
		return this.inlineCompletion.withRange(this._getUpdatedRange(reader));
	}

	public toSingleTextEdit(reader: IReader | undefined): SingleTextEdit {
		return new SingleTextEdit(this._getUpdatedRange(reader), this.inlineCompletion.insertText);
	}

	public isVisible(model: ITextModel, cursorPosition: Position, reader: IReader | undefined): boolean {
		const minimizedReplacement = this._toFilterTextReplacement(reader).removeCommonPrefix(model);

		if (
			!this._isValid
			|| !this.inlineCompletion.range.getStartPosition().equals(this._getUpdatedRange(reader).getStartPosition())
			|| cursorPosition.lineNumber !== minimizedReplacement.range.startLineNumber
		) {
			return false;
		}

		const originalValue = model.getValueInRange(minimizedReplacement.range, EndOfLinePreference.LF).toLowerCase();
		const filterText = minimizedReplacement.text.toLowerCase();

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
		const result = this._isValid
			&& this._getUpdatedRange(undefined).containsPosition(position)
			&& this.isVisible(model, position, undefined)
			&& !this._isSmallerThanOriginal(undefined);
		return result;
	}

	private _toFilterTextReplacement(reader: IReader | undefined): SingleTextEdit {
		return new SingleTextEdit(this._getUpdatedRange(reader), this.inlineCompletion.filterText);
	}

	private _isSmallerThanOriginal(reader: IReader | undefined): boolean {
		return length(this._getUpdatedRange(reader)).isBefore(length(this.inlineCompletion.range));
	}

	private _getUpdatedRange(reader: IReader | undefined): Range {
		this.rangeVersion.read(reader); // This makes sure all the ranges are updated.
		return this._updatedRange;
	}

	public _updateRange(textModel: ITextModel): boolean {
		const range = textModel.getDecorationRange(this.decorationId);
		if (!range) {
			// A setValue call might flush all decorations.
			this._isValid = false;
			return true;
		}
		if (!this._updatedRange.equalsRange(range)) {
			this._updatedRange = range;
			return true;
		}
		return false;
	}
}

function length(range: Range): Position {
	if (range.startLineNumber === range.endLineNumber) {
		return new Position(1, 1 + range.endColumn - range.startColumn);
	} else {
		return new Position(1 + range.endLineNumber - range.startLineNumber, range.endColumn);
	}
}
