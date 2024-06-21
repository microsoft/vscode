/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { CancellationToken, cancelOnDispose } from 'vs/base/common/cancellation';
import { itemsEquals, structuralEquals } from 'vs/base/common/equals';
import { BugIndicatingError } from 'vs/base/common/errors';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, ISettableObservable, ITransaction, ObservablePromise, derived, derivedHandleChanges, derivedOpts, disposableObservableValue, observableSignal, observableValue, recomputeInitiallyAndOnChange, subtransaction } from 'vs/base/common/observable';
import { derivedDisposable } from 'vs/base/common/observableInternal/derived';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Command, InlineCompletionContext, InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { IFeatureDebounceInformation } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { InlineCompletionItem, InlineCompletionProviderResult, provideInlineCompletions } from 'vs/editor/contrib/inlineCompletions/browser/provideInlineCompletions';
import { InlineEdit } from 'vs/editor/contrib/inlineEdits/browser/inlineEditsWidget';

export class InlineEditsModel extends Disposable {
	private static _modelId = 0;
	private static _createUniqueUri(): URI {
		return URI.from({ scheme: 'inline-edits', path: new Date().toString() + String(InlineEditsModel._modelId++) });
	}

	private readonly _forceUpdateExplicitlySignal = observableSignal(this);

	// We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
	private readonly _selectedInlineCompletionId = observableValue<string | undefined>(this, undefined);

	private readonly _isActive = observableValue<boolean>(this, false);

	private readonly _originalModel = derivedDisposable(() => this._modelService.createModel('', null, InlineEditsModel._createUniqueUri())).keepObserved(this._store);
	private readonly _modifiedModel = derivedDisposable(() => this._modelService.createModel('', null, InlineEditsModel._createUniqueUri())).keepObserved(this._store);

	private readonly _pinnedRange = new TrackedRange(this.textModel, this._textModelVersionId);

	public readonly isPinned = this._pinnedRange.range.map(range => !!range);

	public readonly userPrompt: ISettableObservable<string | undefined> = observableValue<string | undefined>(this, undefined);

	constructor(
		public readonly textModel: ITextModel,
		public readonly _textModelVersionId: IObservable<number | null, IModelContentChangedEvent | undefined>,
		private readonly _selection: IObservable<Selection>,
		protected readonly _debounceValue: IFeatureDebounceInformation,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IDiffProviderFactoryService private readonly _diffProviderFactoryService: IDiffProviderFactoryService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super();

		this._register(recomputeInitiallyAndOnChange(this._fetchInlineEditsPromise));
	}

	public readonly inlineEdit = derived<InlineEdit | undefined>(this, reader => {
		return this._inlineEdit.read(reader)?.promiseResult.read(reader)?.data;
	});

	public readonly _inlineEdit = derived<ObservablePromise<InlineEdit | undefined> | undefined>(this, reader => {
		const edit = this.selectedInlineEdit.read(reader);
		if (!edit) { return undefined; }
		const range = edit.inlineCompletion.range;
		if (edit.inlineCompletion.insertText.trim() === '') {
			return undefined;
		}

		let newLines = edit.inlineCompletion.insertText.split(/\r\n|\r|\n/);

		function removeIndentation(lines: string[]): string[] {
			const indentation = lines[0].match(/^\s*/)?.[0] ?? '';
			return lines.map(l => l.replace(new RegExp('^' + indentation), ''));
		}
		newLines = removeIndentation(newLines);

		const existing = this.textModel.getValueInRange(range);
		let existingLines = existing.split(/\r\n|\r|\n/);
		existingLines = removeIndentation(existingLines);
		this._originalModel.get().setValue(existingLines.join('\n'));
		this._modifiedModel.get().setValue(newLines.join('\n'));

		const d = this._diffProviderFactoryService.createDiffProvider({ diffAlgorithm: 'advanced' });
		return ObservablePromise.fromFn(async () => {
			const result = await d.computeDiff(this._originalModel.get(), this._modifiedModel.get(), {
				computeMoves: false,
				ignoreTrimWhitespace: false,
				maxComputationTimeMs: 1000,
			}, CancellationToken.None);

			if (result.identical) {
				return undefined;
			}

			return new InlineEdit(LineRange.fromRangeInclusive(range), removeIndentation(newLines), result.changes);
		});
	});

	private readonly _fetchStore = this._register(new DisposableStore());

	private readonly _inlineEditsFetchResult = disposableObservableValue<InlineCompletionProviderResult | undefined>(this, undefined);
	private readonly _inlineEdits = derivedOpts<InlineEditData[]>({ owner: this, equalsFn: structuralEquals }, reader => {
		return this._inlineEditsFetchResult.read(reader)?.completions.map(c => new InlineEditData(c)) ?? [];
	});

	private readonly _fetchInlineEditsPromise = derivedHandleChanges({
		owner: this,
		createEmptyChangeSummary: () => ({
			inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic
		}),
		handleChange: (ctx, changeSummary) => {
			/** @description fetch inline completions */
			if (ctx.didChange(this._forceUpdateExplicitlySignal)) {
				changeSummary.inlineCompletionTriggerKind = InlineCompletionTriggerKind.Explicit;
			}
			return true;
		},
	}, async (reader, changeSummary) => {
		this._fetchStore.clear();
		this._forceUpdateExplicitlySignal.read(reader);
		/*if (!this._isActive.read(reader)) {
			return undefined;
		}*/
		this._textModelVersionId.read(reader);

		function mapValue<T, TOut>(value: T, fn: (value: T) => TOut): TOut {
			return fn(value);
		}

		const selection = this._pinnedRange.range.read(reader) ?? mapValue(this._selection.read(reader), v => v.isEmpty() ? undefined : v);
		if (!selection) {
			this._inlineEditsFetchResult.set(undefined, undefined);
			this.userPrompt.set(undefined, undefined);
			return undefined;
		}
		const context: InlineCompletionContext = {
			triggerKind: changeSummary.inlineCompletionTriggerKind,
			selectedSuggestionInfo: undefined,
			userPrompt: this.userPrompt.read(reader),
		};

		const token = cancelOnDispose(this._fetchStore);
		await timeout(200, token);
		const result = await provideInlineCompletions(this.languageFeaturesService.inlineCompletionsProvider, selection, this.textModel, context, token);
		if (token.isCancellationRequested) {
			return;
		}

		this._inlineEditsFetchResult.set(result, undefined);
	});

	public async trigger(tx?: ITransaction): Promise<void> {
		this._isActive.set(true, tx);
		await this._fetchInlineEditsPromise.get();
	}

	public async triggerExplicitly(tx?: ITransaction): Promise<void> {
		subtransaction(tx, tx => {
			this._isActive.set(true, tx);
			this._forceUpdateExplicitlySignal.trigger(tx);
		});
		await this._fetchInlineEditsPromise.get();
	}

	public stop(tx?: ITransaction): void {
		subtransaction(tx, tx => {
			this.userPrompt.set(undefined, tx);
			this._isActive.set(false, tx);
			this._inlineEditsFetchResult.set(undefined, tx);
			this._pinnedRange.setRange(undefined, tx);
			//this._source.clear(tx);
		});
	}

	private readonly _filteredInlineEditItems = derivedOpts<InlineEditData[]>({ owner: this, equalsFn: itemsEquals() }, reader => {
		return this._inlineEdits.read(reader);
	});

	public readonly selectedInlineCompletionIndex = derived<number>(this, (reader) => {
		const selectedInlineCompletionId = this._selectedInlineCompletionId.read(reader);
		const filteredCompletions = this._filteredInlineEditItems.read(reader);
		const idx = this._selectedInlineCompletionId === undefined ? -1
			: filteredCompletions.findIndex(v => v.semanticId === selectedInlineCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this._selectedInlineCompletionId.set(undefined, undefined);
			return 0;
		}
		return idx;
	});

	public readonly selectedInlineEdit = derived<InlineEditData | undefined>(this, (reader) => {
		const filteredCompletions = this._filteredInlineEditItems.read(reader);
		const idx = this.selectedInlineCompletionIndex.read(reader);
		return filteredCompletions[idx];
	});

	public readonly activeCommands = derivedOpts<Command[]>({ owner: this, equalsFn: itemsEquals() },
		r => this.selectedInlineEdit.read(r)?.inlineCompletion.source.inlineCompletions.commands ?? []
	);

	private async _deltaSelectedInlineCompletionIndex(delta: 1 | -1): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineEditItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
			this._selectedInlineCompletionId.set(completions[newIdx].semanticId, undefined);
		} else {
			this._selectedInlineCompletionId.set(undefined, undefined);
		}
	}

	public async next(): Promise<void> {
		await this._deltaSelectedInlineCompletionIndex(1);
	}

	public async previous(): Promise<void> {
		await this._deltaSelectedInlineCompletionIndex(-1);
	}

	public togglePin(): void {
		if (this.isPinned.get()) {
			this._pinnedRange.setRange(undefined, undefined);
		} else {
			this._pinnedRange.setRange(this._selection.get(), undefined);
		}
	}

	public async accept(editor: ICodeEditor): Promise<void> {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}
		const edit = this.selectedInlineEdit.get();
		if (!edit) {
			return;
		}

		editor.pushUndoStop();
		editor.executeEdits(
			'inlineSuggestion.accept',
			[
				edit.inlineCompletion.toSingleTextEdit().toSingleEditOperation()
			]
		);
		this.stop();
	}
}

class InlineEditData {
	public readonly semanticId = this.inlineCompletion.hash();

	constructor(public readonly inlineCompletion: InlineCompletionItem) {

	}
}

class TrackedRange extends Disposable {
	private readonly _decorations = observableValue<string[]>(this, []);

	constructor(
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservable<number | null>,
	) {
		super();
		this._register(toDisposable(() => {
			this._textModel.deltaDecorations(this._decorations.get(), []);
		}));
	}

	setRange(range: Range | undefined, tx: ITransaction | undefined): void {
		this._decorations.set(this._textModel.deltaDecorations(this._decorations.get(), range ? [{ range, options: { description: 'trackedRange' } }] : []), tx);
	}

	public readonly range = derived(this, reader => {
		this._versionId.read(reader);
		const deco = this._decorations.read(reader)[0];
		if (!deco) { return null; }

		return this._textModel.getDecorationRange(deco) ?? null;
	});
}
