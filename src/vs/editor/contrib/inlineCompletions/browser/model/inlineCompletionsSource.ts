/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareUndefinedSmallest, numberComparator } from '../../../../../base/common/arrays.js';
import { findLastMax } from '../../../../../base/common/arraysFind.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { equalsIfDefined, itemEquals } from '../../../../../base/common/equals.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, IObservableWithChange, ITransaction, observableValue, recordChanges, transaction } from '../../../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { observableReducerSettable } from '../../../../../base/common/observableInternal/reducer.js';
import { isDefined } from '../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { OffsetEdit } from '../../../../common/core/offsetEdit.js';
import { Position } from '../../../../common/core/position.js';
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionContext, InlineCompletionTriggerKind, InlineCompletionsProvider } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { OffsetEdits } from '../../../../common/model/textModelOffsetEdit.js';
import { IFeatureDebounceInformation } from '../../../../common/services/languageFeatureDebounce.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';
import { formatRecordableLogEntry, IRecordableEditorLogEntry, IRecordableLogEntry, StructuredLogger } from '../structuredLogger.js';
import { wait } from '../utils.js';
import { InlineSuggestionIdentity, InlineSuggestionItem } from './inlineSuggestionItem.js';
import { InlineCompletionProviderResult, provideInlineCompletions } from './provideInlineCompletions.js';

export class InlineCompletionsSource extends Disposable {
	private static _requestId = 0;

	private readonly _updateOperation = this._register(new MutableDisposable<UpdateOperation>());

	private readonly _loggingEnabled = observableConfigValue('editor.inlineSuggest.logFetch', false, this._configurationService).recomputeInitiallyAndOnChange(this._store);

	private readonly _structuredFetchLogger = this._register(this._instantiationService.createInstance(StructuredLogger.cast<
		{ kind: 'start'; requestId: number; context: unknown } & IRecordableEditorLogEntry
		| { kind: 'end'; error: any; durationMs: number; result: unknown; requestId: number } & IRecordableLogEntry
	>(),
		'editor.inlineSuggest.logFetch.commandId'
	));

	private readonly _state = observableReducerSettable(this, {
		initial: () => ({
			inlineCompletions: InlineCompletionsState.createEmpty(),
			suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty(),
		}),
		disposeFinal: (values) => {
			values.inlineCompletions.dispose();
			values.suggestWidgetInlineCompletions.dispose();
		},
		changeTracker: recordChanges({ versionId: this._versionId }),
		update: (reader, previousValue, changes) => {
			const edit = OffsetEdit.join(changes.changes.map(c => c.change ? OffsetEdits.fromContentChanges(c.change.changes) : OffsetEdit.empty).filter(isDefined));

			if (edit.isEmpty) {
				return previousValue;
			}
			try {
				return {
					inlineCompletions: previousValue.inlineCompletions.createStateWithAppliedEdit(edit, this._textModel),
					suggestWidgetInlineCompletions: previousValue.suggestWidgetInlineCompletions.createStateWithAppliedEdit(edit, this._textModel),
				};
			} finally {
				previousValue.inlineCompletions.dispose();
				previousValue.suggestWidgetInlineCompletions.dispose();
			}
		}
	});

	public readonly inlineCompletions = this._state.map(this, v => v.inlineCompletions);
	public readonly suggestWidgetInlineCompletions = this._state.map(this, v => v.suggestWidgetInlineCompletions);

	constructor(
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
		private readonly _debounceValue: IFeatureDebounceInformation,
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

	public fetch(providers: InlineCompletionsProvider[], position: Position, context: InlineCompletionContext, activeInlineCompletion: InlineSuggestionIdentity | undefined, withDebounce: boolean, userJumpedToActiveCompletion: IObservable<boolean>, providerhasChangedCompletion: boolean): Promise<boolean> {
		const request = new UpdateRequest(position, context, this._textModel.getVersionId());

		const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions.get() : this.inlineCompletions.get();

		if (!providerhasChangedCompletion && this._updateOperation.value?.request.satisfies(request)) {
			return this._updateOperation.value.promise;
		} else if (target?.request?.satisfies(request)) {
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
					providers.map(p => p.debounceDelayMs),
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
				let providerResult: InlineCompletionProviderResult | undefined = undefined;
				let error: any = undefined;
				try {
					providerResult = await provideInlineCompletions(
						providers,
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
						const result = providerResult?.completions.map(c => ({
							range: c.range.toString(),
							text: c.insertText,
							isInlineEdit: !!c.isInlineEdit,
							source: c.source.provider.groupId,
						}));
						this._log({ sourceId: 'InlineCompletions.fetch', kind: 'end', requestId, durationMs: (Date.now() - startTime.getTime()), error, result, time: Date.now() });
					}
				}

				if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId || userJumpedToActiveCompletion.get() /* In the meantime the user showed interest for the active completion so dont hide it */) {
					providerResult.dispose();
					return false;
				}

				const endTime = new Date();
				this._debounceValue.update(this._textModel, endTime.getTime() - startTime.getTime());

				this._updateOperation.clear();
				transaction(tx => {
					const v = this._state.get();
					/** @description Update completions with provider result */
					if (context.selectedSuggestionInfo) {
						this._state.set({
							inlineCompletions: InlineCompletionsState.createEmpty(),
							suggestWidgetInlineCompletions: v.suggestWidgetInlineCompletions.createStateWithAppliedResults(providerResult, request, this._textModel, activeInlineCompletion),
						}, tx);
					} else {
						this._state.set({
							inlineCompletions: v.inlineCompletions.createStateWithAppliedResults(providerResult, request, this._textModel, activeInlineCompletion),
							suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty(),
						}, tx);
					}

					providerResult.dispose();
					v.inlineCompletions.dispose();
					v.suggestWidgetInlineCompletions.dispose();
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
		const v = this._state.get();
		this._state.set({
			inlineCompletions: InlineCompletionsState.createEmpty(),
			suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
		}, tx);
		v.inlineCompletions.dispose();
		v.suggestWidgetInlineCompletions.dispose();
	}

	public seedInlineCompletionsWithSuggestWidget(): void {
		const inlineCompletions = this.inlineCompletions.get();
		const suggestWidgetInlineCompletions = this.suggestWidgetInlineCompletions.get();
		if (!suggestWidgetInlineCompletions) {
			return;
		}
		transaction(tx => {
			/** @description Seed inline completions with (newer) suggest widget inline completions */
			if (!inlineCompletions || (suggestWidgetInlineCompletions.request?.versionId ?? -1) > (inlineCompletions.request?.versionId ?? -1)) {
				inlineCompletions?.dispose();
				const s = this._state.get();
				this._state.set({
					inlineCompletions: suggestWidgetInlineCompletions.clone(),
					suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty(),
				}, tx);
				s.inlineCompletions.dispose();
				s.suggestWidgetInlineCompletions.dispose();
			}
			this.clearSuggestWidgetInlineCompletions(tx);
		});
	}

	public clearSuggestWidgetInlineCompletions(tx: ITransaction): void {
		if (this._updateOperation.value?.request.context.selectedSuggestionInfo) {
			this._updateOperation.clear();
		}
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
	public static createEmpty(): InlineCompletionsState {
		return new InlineCompletionsState([], undefined);
	}

	constructor(
		public readonly inlineCompletions: readonly InlineSuggestionItem[],
		public readonly request: UpdateRequest | undefined,
	) {
		for (const inlineCompletion of inlineCompletions) {
			inlineCompletion.addRef();
		}

		super();

		this._register({
			dispose: () => {
				for (const inlineCompletion of this.inlineCompletions) {
					inlineCompletion.removeRef();
				}
			}
		});
	}

	private _findById(id: InlineSuggestionIdentity): InlineSuggestionItem | undefined {
		return this.inlineCompletions.find(i => i.identity === id);
	}

	private _findByHash(hash: string): InlineSuggestionItem | undefined {
		return this.inlineCompletions.find(i => i.hash === hash);
	}

	/**
	 * Applies the edit on the state.
	*/
	public createStateWithAppliedEdit(edit: OffsetEdit, textModel: ITextModel): InlineCompletionsState {
		const newInlineCompletions = this.inlineCompletions.map(i => i.withEdit(edit, textModel)).filter(isDefined);
		return new InlineCompletionsState(newInlineCompletions, this.request);
	}

	public createStateWithAppliedResults(update: InlineCompletionProviderResult, request: UpdateRequest, textModel: ITextModel, itemToPreserve: InlineSuggestionIdentity | undefined): InlineCompletionsState {
		const items: InlineSuggestionItem[] = [];

		for (const item of update.completions) {
			const i = InlineSuggestionItem.create(item, textModel);
			const oldItem = this._findByHash(i.hash);
			if (oldItem) {
				items.push(i.withIdentity(oldItem.identity));
				oldItem.setEndOfLifeReason({ kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: i.getSourceCompletion() });
			} else {
				items.push(i);
			}
		}

		if (itemToPreserve) {
			const item = this._findById(itemToPreserve);
			if (item && !update.has(item.getSingleTextEdit()) && item.canBeReused(textModel, request.position)) {
				items.unshift(item);
			}
		}

		return new InlineCompletionsState(items, request);
	}

	public clone(): InlineCompletionsState {
		return new InlineCompletionsState(this.inlineCompletions, this.request);
	}
}
