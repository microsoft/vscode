/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareUndefinedSmallest, numberComparator } from '../../../../../base/common/arrays.js';
import { findLastMax } from '../../../../../base/common/arraysFind.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { equalsIfDefined, itemEquals } from '../../../../../base/common/equals.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { matchesSubString } from '../../../../../base/common/filters.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { DebugOwner, IObservable, IObservableSignal, IObservableWithChange, IReader, ITransaction, derived, derivedHandleChanges, disposableObservableValue, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import { commonPrefixLength, commonSuffixLength, splitLines } from '../../../../../base/common/strings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { applyEditsToRanges, OffsetEdit, SingleOffsetEdit } from '../../../../common/core/offsetEdit.js';
import { OffsetRange } from '../../../../common/core/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { SingleTextEdit, StringText, TextEdit } from '../../../../common/core/textEdit.js';
import { TextLength } from '../../../../common/core/textLength.js';
import { linesDiffComputers } from '../../../../common/diff/linesDiffComputers.js';
import { Command, InlineCompletion, InlineCompletionContext, InlineCompletions, InlineCompletionsProvider, InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { EndOfLinePreference, ITextModel } from '../../../../common/model.js';
import { OffsetEdits } from '../../../../common/model/textModelOffsetEdit.js';
import { IFeatureDebounceInformation } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';
import { InlineCompletionItemOld, InlineCompletionProviderResult, provideInlineCompletions, SnippetInfo } from './provideInlineCompletions.js';
import { singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';
import { StructuredLogger, IRecordableEditorLogEntry, IRecordableLogEntry, formatRecordableLogEntry } from '../structuredLogger.js';
import { ISingleEditOperation } from '../../../../common/core/editOperation.js';


interface IReducerOptions<T, TChangeSummary = void> {
	createInitial(): T;
	dispose?(value: T): void;
	trackChanges?: IChangeTracker<TChangeSummary>;
	update(reader: IReader, previousValue: T, changes: TChangeSummary): T;
}

interface IChangeTracker<TChangeSummary> {
	createChangeSummary(previousChangeSummary: TChangeSummary): TChangeSummary;
	handleChange(delta: unknown, change: TChangeSummary): void;
	beforeUpdate?(reader: IReader, change: TChangeSummary): void;
}

//function changes1<T, TDelta>(obs: IObservableWithChange<T, TDelta>): IChangeTracker<{ value: T, changes: readonly TDelta[] }> { }

function trackChanges<TObs extends Record<any, IObservableWithChange<any, any>>>(obs: TObs):
	IChangeTracker<{ [TKey in keyof TObs]: ReturnType<TObs[TKey]['get']> }
		& { changes: readonly ({ [TKey in keyof TObs]: { key: TKey; change: TObs[TKey]['TChange'] } }[keyof TObs])[] }> {
	return {

	};
}

function reducer<T, TChanges>(owner: DebugOwner, args: IReducerOptions<T, TChanges>): IObservable<T> {
}



const demo1: IObservableWithChange<string, { strChange: string }> = null!;
const demo2: IObservableWithChange<number, { numberChange: number }> = null!;

reducer(this, {
	createInitial: () => ({
		inlineCompletions: undefined as InlineCompletionsState | undefined,
		suggestWidgetInlineCompletions: undefined as InlineCompletionsState | undefined,
	}),
	dispose: (values) => {
		values.inlineCompletions?.dispose();
		values.suggestWidgetInlineCompletions?.dispose();
	},
	trackChanges: trackChanges({ demo1, demo2 }),
	update: (reader, previousValue, changes) => {
		return previousValue;
	}
});



export class InlineCompletionsSource extends Disposable {
	private static _requestId = 0;

	private readonly _updateOperation = this._register(new MutableDisposable<UpdateOperation>());
	public readonly inlineCompletions = this._register(disposableObservableValue<InlineCompletionsState | undefined>(this, undefined));
	public readonly suggestWidgetInlineCompletions = this._register(disposableObservableValue<InlineCompletionsState | undefined>(this, undefined));

	private readonly _loggingEnabled = observableConfigValue('editor.inlineSuggest.logFetch', false, this._configurationService).recomputeInitiallyAndOnChange(this._store);

	private readonly _structuredFetchLogger = this._register(this._instantiationService.createInstance(StructuredLogger.cast<
		{ kind: 'start'; requestId: number; context: unknown } & IRecordableEditorLogEntry
		| { kind: 'end'; error: any; durationMs: number; result: unknown; requestId: number } & IRecordableLogEntry
	>(),
		'editor.inlineSuggest.logFetch.commandId'
	));

	public readonly state = reducer(this, {
		createInitial: () => ({
			inlineCompletions: undefined as InlineCompletionsState | undefined,
			suggestWidgetInlineCompletions: undefined as InlineCompletionsState | undefined,
		}),
		dispose: (values) => {
			values.inlineCompletions?.dispose();
			values.suggestWidgetInlineCompletions?.dispose();
		},
		trackChanges: changes({ versionId: this._versionId }),
		update: (reader, previousValue, changes) => {
			return previousValue;
		}
	});

	constructor(
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.clearOperationOnTextModelChange.recomputeInitiallyAndOnChange(this._store);
	}

	public readonly clearOperationOnTextModelChange = derived(this, reader => {
		this._versionId.read(reader);
		this._updateOperation.clear();
		return undefined; // always constant
	});

	private _log(entry:
		{ sourceId: string; kind: 'start'; requestId: number; context: unknown } & IRecordableEditorLogEntry
		| { sourceId: string; kind: 'end'; error: any; durationMs: number; result: unknown; requestId: number } & IRecordableLogEntry
	) {
		if (this._loggingEnabled.get()) {
			this._logService.info(formatRecordableLogEntry(entry));
		}
		this._structuredFetchLogger.log(entry);
	}

	private readonly _loadingCount = observableValue(this, 0);
	public readonly loading = this._loadingCount.map(this, v => v > 0);

	public fetch(position: Position, context: InlineCompletionContext, activeInlineCompletion: InlineCompletionItem | undefined, withDebounce: boolean, userJumpedToActiveCompletion: IObservable<boolean>): Promise<boolean> {
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
			this._loadingCount.set(this._loadingCount.get() + 1, undefined);
			try {
				const recommendedDebounceValue = this._debounceValue.get(this._textModel);
				const debounceValue = findLastMax(
					this._languageFeaturesService.inlineCompletionsProvider.all(this._textModel).map(p => p.debounceDelayMs),
					compareUndefinedSmallest(numberComparator)
				) ?? recommendedDebounceValue;

				// Debounce in any case if update is ongoing
				const shouldDebounce = updateOngoing || (withDebounce && context.triggerKind === InlineCompletionTriggerKind.Automatic);
				if (shouldDebounce) {
					// This debounces the operation
					await wait(debounceValue, source.token);
				}

				if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
					return false;
				}

				const requestId = InlineCompletionsSource._requestId++;
				if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
					this._log({ sourceId: 'InlineCompletions.fetch', kind: 'start', requestId, modelUri: this._textModel.uri.toString(), modelVersion: this._textModel.getVersionId(), context: { triggerKind: context.triggerKind }, time: Date.now() });
				}

				const startTime = new Date();
				let updatedCompletions: InlineCompletionProviderResult | undefined = undefined;
				let error: any = undefined;
				try {
					updatedCompletions = await provideInlineCompletions(
						this._languageFeaturesService.inlineCompletionsProvider,
						position,
						this._textModel,
						context,
						source.token,
						this._languageConfigurationService
					);
				} catch (e) {
					error = e;
					throw e;
				} finally {
					if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
						if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
							error = 'canceled';
						}
						const result = updatedCompletions?.completions.map(c => ({
							range: c.range.toString(),
							text: c.insertText,
							isInlineEdit: !!c.isInlineEdit,
							source: c.source.provider.groupId,
						}));
						this._log({ sourceId: 'InlineCompletions.fetch', kind: 'end', requestId, durationMs: (Date.now() - startTime.getTime()), error, result, time: Date.now() });
					}
				}

				if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId || userJumpedToActiveCompletion.get() /* In the meantime the user showed interest for the active completion so dont hide it */) {
					updatedCompletions.dispose();
					return false;
				}

				// Reuse Inline Edit if possible
				if (activeInlineCompletion && activeInlineCompletion.isInlineEdit && activeInlineCompletion.updatedEditModelVersion === this._textModel.getVersionId() && (
					activeInlineCompletion.canBeReused(this._textModel, position)
					|| updatedCompletions.has(activeInlineCompletion.inlineCompletion) /* Inline Edit wins over completions if it's already been shown*/
					|| updatedCompletions.isEmpty() /* Incoming completion is empty, keep the current one alive */
				)) {
					activeInlineCompletion.reuse();
					updatedCompletions.dispose();
					return false;
				}

				const endTime = new Date();
				this._debounceValue.update(this._textModel, endTime.getTime() - startTime.getTime());

				// Reuse Inline Completion if possible
				const completions = new UpToDateInlineCompletions(updatedCompletions, request, this._textModel, this._versionId);
				if (activeInlineCompletion && !activeInlineCompletion.isInlineEdit && activeInlineCompletion.canBeReused(this._textModel, position)) {
					const asInlineCompletion = activeInlineCompletion.toInlineCompletion(undefined);
					if (!updatedCompletions.has(asInlineCompletion)) {
						completions.prepend(activeInlineCompletion.inlineCompletion, asInlineCompletion.range, true);
					}
				}

				this._updateOperation.clear();
				transaction(tx => {
					/** @description Update completions with provider result */
					target.set(completions, tx);
				});

			} finally {
				this._loadingCount.set(this._loadingCount.get() - 1, undefined);
			}

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

	public get isExplicitRequest() {
		return this.context.triggerKind === InlineCompletionTriggerKind.Explicit;
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


class InlineCompletionsState extends Disposable {
	constructor(
		public readonly inlineCompletions: readonly InlineCompletionItem[],
	) {
		for (const inlineCompletion of inlineCompletions) {
			inlineCompletion.identity.addRef();
			inlineCompletion.source.addRef();
		}

		super();

		this._register({
			dispose: () => {
				for (const inlineCompletion of this.inlineCompletions) {
					inlineCompletion.identity.removeRef();
					inlineCompletion.source.removeRef();
				}
			}
		});
	}

	/**
	 * Applies the edit on the state.
	*/
	public createStateWithAppliedEdit(edit: TextEdit): InlineCompletionsState {
		return this;
	}

	public createStateWithAppliedResults(update: InlineCompletionProviderResult): InlineCompletionsState {
		return this;
	}
}

export class InlineCompletionList {
	private refCount = 1;
	constructor(
		public readonly inlineCompletions: InlineCompletions,
		public readonly provider: InlineCompletionsProvider,
	) { }

	addRef(): void {
		this.refCount++;
	}

	removeRef(): void {
		this.refCount--;
		if (this.refCount === 0) {
			this.provider.freeInlineCompletions(this.inlineCompletions);
		}
	}
}

class InlineCompletionItem {
	public static from(
		inlineCompletion: InlineCompletion,
		source: InlineCompletionList,
		defaultReplaceRange: Range,
		textModel: ITextModel,
		languageConfigurationService: ILanguageConfigurationService | undefined,
	) {
		// TODO
	}

	constructor(
		readonly filterText: string,
		readonly command: Command | undefined,
		/** @deprecated. Use handleItemDidShow */
		readonly shownCommand: Command | undefined,
		readonly action: Command | undefined,
		readonly range: Range,
		readonly insertText: string,
		readonly snippetInfo: SnippetInfo | undefined,
		readonly cursorShowRange: Range | undefined,

		readonly additionalTextEdits: readonly ISingleEditOperation[],


		/**
		 * A reference to the original inline completion this inline completion has been constructed from.
		 * Used for event data to ensure referential equality.
		*/
		readonly sourceInlineCompletion: InlineCompletion,

		/**
		 * A reference to the original inline completion list this inline completion has been constructed from.
		 * Used for event data to ensure referential equality.
		*/
		readonly source: InlineCompletionList,

		public readonly identity: InlineCompletionIdentity,
	) { }


	public get isInlineEdit() { return this.sourceInlineCompletion.isInlineEdit; }
	public get forwardStable() { return this.source.inlineCompletions.enableForwardStability ?? false; }

	public readonly semanticId = JSON.stringify([
		this.inlineCompletion.filterText,
		this.inlineCompletion.insertText,
		this.inlineCompletion.range.getStartPosition().toString()
	]);

	public getEdit(): OffsetEdit { }

	public getLastAgreeingModelVersion(): number { }

	public canBeReused(model: ITextModel, position: Position): boolean { }

	public isVisible(model: ITextModel, cursorPosition: Position): boolean { }

	public toInlineCompletion(): InlineCompletionItemOld {
		const singleTextEdit = this.toSingleTextEdit();
		return this.inlineCompletion.withRangeInsertTextAndFilterText(singleTextEdit.range, singleTextEdit.text, singleTextEdit.text);
	}

	public toSingleTextEdit(): SingleTextEdit { }
}

class InlineCompletionIdentity {
	private static _id = 0;
	public readonly id = 'InlineCompletion:' + InlineCompletionIdentity._id++;
	private readonly _onDisposedSignal = observableSignal<void>(this);
	public readonly onDisposed: IObservable<void> = this._onDisposedSignal;

	private _refCount = 0;

	public addRef(): void {
		this._refCount++;
	}

	public removeRef(): void {
		this._refCount--;
		if (this._refCount === 0) {
			this._onDisposedSignal.trigger(undefined);
		}
	}
}
