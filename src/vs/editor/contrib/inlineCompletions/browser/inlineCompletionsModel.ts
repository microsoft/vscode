/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { BugIndicatingError } from 'vs/base/common/errors';
import { matchesSubString } from 'vs/base/common/filters';
import { Disposable, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ITransaction, autorun, derived, observableSignal, observableValue } from 'vs/base/common/observable';
import { disposableObservableValue, transaction } from 'vs/base/common/observableImpl/base';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { InlineCompletionContext, InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { GhostText } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { Replacement, computeGhostText } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionToGhostText';
import { InlineCompletionItem, InlineCompletionProviderResult, provideInlineCompletions } from 'vs/editor/contrib/inlineCompletions/browser/provideInlineCompletions';
import { SuggestItemInfo } from 'vs/editor/contrib/inlineCompletions/browser/suggestWidgetInlineCompletionProvider';
import { rangeExtends } from 'vs/editor/contrib/inlineCompletions/browser/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class InlineCompletionsModel extends Disposable {
	private readonly _source = this._instantiationService.createInstance(InlineCompletionsSource, this.textModel);
	private readonly _isActive = observableValue('isActive', false);

	constructor(
		public readonly textModel: ITextModel,
		public readonly selectedSuggestItem: IObservable<SuggestItemInfo | undefined>,
		public readonly cursorPosition: IObservable<Position>,
		public readonly textModelVersionId: IObservable<number>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(autorun('update', (reader) => {
			if (this._isActive.read(reader)) {
				this._update(reader, InlineCompletionTriggerKind.Automatic);
			}
		}));
	}

	private async _update(reader: IReader | undefined, triggerKind: InlineCompletionTriggerKind): Promise<void> {
		const suggestItem = this.selectedSuggestItem.read(reader);
		const cursorPosition = this.cursorPosition.read(reader);
		this.textModelVersionId.read(reader);

		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.get();
		if (suggestWidgetInlineCompletions && !suggestItem) {
			const inlineCompletions = this._source.inlineCompletions.get();
			if (inlineCompletions && suggestWidgetInlineCompletions.request.versionId > inlineCompletions.request.versionId) {
				this._source.inlineCompletions.set(suggestWidgetInlineCompletions.clone(), undefined);
			}
			this._source.clearSuggestWidgetInlineCompletions();
		}

		await this._source.update(
			cursorPosition,
			{ triggerKind, selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo() },
			suggestItem ? undefined : this.currentInlineCompletion.get()
		);
	}

	public trigger(tx: ITransaction): void {
		this._isActive.set(true, tx);
	}

	public clear(tx: ITransaction): void {
		this._isActive.set(false, tx);
		this._source.clear(tx);
	}

	private readonly _filteredInlineCompletionItems = derived('filteredInlineCompletionItems', (reader) => {
		const c = this._source.inlineCompletions.read(reader);
		if (!c) { return []; }

		const versionId = this.textModelVersionId.read(reader);
		const inlineCompletions = c.getInlineCompletions(versionId);

		const model = this.textModel;
		const cursorPosition = model.validatePosition(this.cursorPosition.read(reader));
		const filteredCompletions = inlineCompletions.filter(c => c.isVisible(model, cursorPosition));
		return filteredCompletions;
	});

	// We use a semantic id to track the selection even if the cache changes.
	private _currentInlineCompletionId: string | undefined = undefined;
	private readonly _selectedCompletionIdChanged = observableSignal('selectedCompletionIdChanged');

	private _fixAndGetIndexOfCurrentSelection(reader?: IReader): number {
		this._selectedCompletionIdChanged.read(reader);

		const filteredCompletions = this._filteredInlineCompletionItems.get();
		if (!this._currentInlineCompletionId || filteredCompletions.length === 0) {
			return 0;
		}

		const idx = filteredCompletions.findIndex(v => v.semanticId === this._currentInlineCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this._currentInlineCompletionId = undefined;
			return 0;
		}
		return idx;
	}

	public readonly currentInlineCompletion = derived<InlineCompletionWithUpdatedRange | undefined>('currentCachedCompletion', (reader) => {
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		return filteredCompletions[this._fixAndGetIndexOfCurrentSelection(reader)];
	});

	public async next(): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineCompletionItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this._fixAndGetIndexOfCurrentSelection() + 1) % completions.length;
			this._currentInlineCompletionId = completions[newIdx].semanticId;
		} else {
			this._currentInlineCompletionId = undefined;
		}
		this._selectedCompletionIdChanged.trigger(undefined);
	}

	public async previous(): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineCompletionItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this._fixAndGetIndexOfCurrentSelection() + completions.length - 1) % completions.length;
			this._currentInlineCompletionId = completions[newIdx].semanticId;
		} else {
			this._currentInlineCompletionId = undefined;
		}
		this._selectedCompletionIdChanged.trigger(undefined);
	}

	public async triggerExplicitly(): Promise<void> {
		await this._update(undefined, InlineCompletionTriggerKind.Explicit);
	}

	public accept(): void { }

	public acceptNextWord(): void { }

	public readonly ghostText = derived('ghostText', (reader) => {
		if (!this._isActive.read(reader)) {
			return undefined;
		}

		const versionId = this.textModelVersionId.read(reader);

		const model = this.textModel;

		const activeItem = this.selectedSuggestItem.read(reader);
		if (activeItem) {
			// enhance the ghost text

			const inlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);

			const candidateInlineCompletion = (inlineCompletions
				? inlineCompletions.getInlineCompletions(versionId)[0]
				: this.currentInlineCompletion.read(reader))?.toReplacement();

			const isSuggestionPreviewEnabled = true;//this.isSuggestionPreviewEnabled();

			const augmentedCompletion = candidateInlineCompletion?.minimize(model);

			const suggestInlineCompletion = activeItem.toReplacement()?.minimize(model);

			const isAugmentedCompletionValid = augmentedCompletion
				&& suggestInlineCompletion
				// The intellisense completion must be a prefix of the augmented completion
				&& augmentedCompletion.text.startsWith(suggestInlineCompletion.text)
				// The augmented completion must replace the intellisense completion range, but can replace even more
				&& rangeExtends(augmentedCompletion.range, suggestInlineCompletion.range);

			if (!isSuggestionPreviewEnabled && !isAugmentedCompletionValid) {
				return undefined;
			}

			// If the augmented completion is not valid and there is no suggest inline completion, we still show the augmented completion.
			const finalCompletion = isAugmentedCompletionValid ? augmentedCompletion : (suggestInlineCompletion || augmentedCompletion);

			const inlineCompletionPreviewLength = isAugmentedCompletionValid ? finalCompletion!.text.length - suggestInlineCompletion.text.length : 0;

			//const mode = this.editor.getOptions().get(EditorOption.suggest).previewMode;
			const newGhostText = finalCompletion
				? (
					computeGhostText(finalCompletion, model, 'subwordSmart', this.cursorPosition.read(reader), inlineCompletionPreviewLength) ||
					// Show an invisible ghost text to reserve space
					new GhostText(finalCompletion.range.endLineNumber, [], /* todo */ 0)
				)
				: undefined;

			return newGhostText;
		}

		const c = this._source.inlineCompletions.read(reader);
		if (!c) { return undefined; }

		const item = this.currentInlineCompletion.read(reader);
		if (!item) {
			return undefined;
		}

		return computeGhostText(new Replacement(item.updatedRange, item.inlineCompletion.insertText), model, 'subwordSmart', this.cursorPosition.read(reader));
	});
}

function computeIndent(line: string): number {
	let indent = 0;
	for (const c of line) {
		if (c === ' ' || c === '\t') {
			indent++;
		} else {
			break;
		}
	}
	return indent;
}


export class InlineCompletionsSource extends Disposable {
	private readonly updateOperation = this._register(new MutableDisposable<UpdateOperation>());

	public readonly inlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('inlineCompletions', undefined);
	public readonly suggestWidgetInlineCompletions = disposableObservableValue<UpToDateInlineCompletions | undefined>('suggestWidgetInlineCompletions', undefined);


	constructor(
		private readonly textModel: ITextModel,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
	) {
		super();

		this._register(this.textModel.onDidChangeContent(() => {
			this.updateOperation.clear();
		}));
	}

	public clear(tx: ITransaction): void {
		this.updateOperation.clear();
		this.inlineCompletions.set(undefined, tx);
		this.suggestWidgetInlineCompletions.set(undefined, tx);
	}

	public clearSuggestWidgetInlineCompletions(): void {
		if (this.updateOperation.value?.request.context.selectedSuggestionInfo) {
			this.updateOperation.clear();
		}
		this.suggestWidgetInlineCompletions.set(undefined, undefined);
	}

	public update(position: Position, context: InlineCompletionContext, activeInlineCompletion: InlineCompletionWithUpdatedRange | undefined): Promise<boolean> {
		const request = new UpdateRequest(position, context, activeInlineCompletion, this.textModel.getVersionId());

		const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions : this.inlineCompletions;

		if (this.updateOperation.value?.request.satisfies(request)) {
			return this.updateOperation.value.promise;
		} else if (target.get()?.request.satisfies(request)) {
			return Promise.resolve(true);
		}

		const updateOngoing = !!this.updateOperation.value;
		this.updateOperation.clear();

		const source = new CancellationTokenSource();

		const promise = (async () => {
			const shouldDebounce = updateOngoing || context.triggerKind === InlineCompletionTriggerKind.Automatic;
			if (shouldDebounce) {
				// This debounces the operation
				await wait(200);
			}

			if (source.token.isCancellationRequested || this.textModel.getVersionId() !== request.versionId) {
				return false;
			}

			const value = await provideInlineCompletions(
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
			const updatedCompletions = activeInlineCompletion && activeInlineCompletion.updatedRange.containsPosition(position)
				&& activeInlineCompletion.isVisible(this.textModel, position)
				&& !activeInlineCompletion.isSmallerThanOriginal()
				? value.withExternalInlineCompletion(activeInlineCompletion.toInlineCompletion())
				: value;


			transaction(tx => {
				const completions = new UpToDateInlineCompletions(updatedCompletions, request, this.textModel);
				target.set(completions, tx);
			});
			this.updateOperation.clear();

			return true;
		})();

		const updateOperation = new UpdateOperation(request, source, promise);
		this.updateOperation.value = updateOperation;

		return promise;
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
		public readonly activeInlineCompletion: InlineCompletionWithUpdatedRange | undefined,
		public readonly versionId: number,
	) {
	}

	public satisfies(other: UpdateRequest): boolean {
		return this.position.equals(other.position)
			&& equals(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, (v1, v2) => v1.equals(v2))
			&& (other.context.triggerKind === InlineCompletionTriggerKind.Automatic
				|| this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
			&& this.activeInlineCompletion === other.activeInlineCompletion
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
	private lastVersionId: number = -1;
	private readonly inlineCompletions: readonly InlineCompletionWithUpdatedRange[];
	private refCount = 1;

	constructor(
		private readonly inlineCompletionProviderResult: InlineCompletionProviderResult,
		public readonly request: UpdateRequest,
		private readonly textModel: ITextModel
	) {
		const ids = textModel.deltaDecorations([], inlineCompletionProviderResult.completions.map(i => ({
			range: i.range,
			options: {
				description: 'inline-completion-tracking-range'
			},
		})));

		this.inlineCompletions = inlineCompletionProviderResult.completions.map(
			(i, index) => new InlineCompletionWithUpdatedRange(i, ids[index])
		);
	}

	public clone(): this {
		this.refCount++;
		return this;
	}

	public dispose(): void {
		this.refCount--;
		if (this.refCount === 0) {
			this.textModel.deltaDecorations(this.inlineCompletions.map(i => i.decorationId), []);
			this.inlineCompletionProviderResult.dispose();
		}
	}

	/**
	 * The ranges of the inline completions are extended as the user typed.
	 */
	public getInlineCompletions(versionId: number): readonly InlineCompletionWithUpdatedRange[] {
		if (versionId !== this.textModel.getVersionId()) {
			throw new BugIndicatingError();
		}
		if (this.textModel.getVersionId() !== this.lastVersionId) {
			this.inlineCompletions.forEach(i => i.updateRange(this.textModel));
			this.lastVersionId = this.textModel.getVersionId();
		}
		return this.inlineCompletions;
	}
}

export class InlineCompletionWithUpdatedRange {
	public readonly semanticId = JSON.stringify([this.inlineCompletion.filterText, this.inlineCompletion.insertText, this.inlineCompletion.range.getStartPosition().toString()]);
	private _updatedRange: Range;
	public get updatedRange(): Range { return this._updatedRange; }

	constructor(
		public readonly inlineCompletion: InlineCompletionItem,
		public readonly decorationId: string,
	) {
		this._updatedRange = inlineCompletion.range;
	}

	public updateRange(textModel: ITextModel): void {
		const range = textModel.getDecorationRange(this.decorationId);
		if (!range) {
			throw new BugIndicatingError();
		}
		this._updatedRange = range;
	}

	public toInlineCompletion(): InlineCompletionItem {
		return this.inlineCompletion.withRange(this.updatedRange);
	}

	public toReplacement(): Replacement {
		return new Replacement(this.updatedRange, this.inlineCompletion.insertText);
	}

	public toFilterTextReplacement(): Replacement {
		return new Replacement(this.updatedRange, this.inlineCompletion.filterText);
	}

	public isVisible(model: ITextModel, cursorPosition: Position): boolean {
		const minimizedReplacement = this.toFilterTextReplacement().minimize(model);

		if (!this.inlineCompletion.range.getStartPosition().equals(this.updatedRange.getStartPosition())) {
			return false;
		}

		if (cursorPosition.lineNumber !== minimizedReplacement.range.startLineNumber) {
			return false;
		}

		const originalValue = model.getValueInRange(minimizedReplacement.range, EndOfLinePreference.LF).toLowerCase();
		const filterText = this.inlineCompletion.filterText.toLowerCase();

		const cursorPosIndex = Math.max(0, cursorPosition.column - minimizedReplacement.range.startColumn);

		let filterTextBefore = filterText.substring(0, cursorPosIndex);
		let filterTextAfter = filterText.substring(cursorPosIndex);

		let originalValueBefore = originalValue.substring(0, cursorPosIndex);
		let originalValueAfter = originalValue.substring(cursorPosIndex);

		const originalValueIndent = computeIndent(filterText);
		if (this.updatedRange.startColumn <= originalValueIndent) {
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

	public isSmallerThanOriginal(): boolean {
		return length(this.updatedRange).isBefore(length(this.inlineCompletion.range));
	}
}

function length(range: Range): Position {
	if (range.startLineNumber === range.endLineNumber) {
		return new Position(1, 1 + range.endColumn - range.startColumn);
	} else {
		return new Position(1 + range.endLineNumber - range.startLineNumber, range.endColumn);
	}
}
