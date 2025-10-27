/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { booleanComparator, compareBy, compareUndefinedSmallest, numberComparator } from '../../../../../base/common/arrays.js';
import { findLastMax } from '../../../../../base/common/arraysFind.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { equalsIfDefined, itemEquals } from '../../../../../base/common/equals.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable, IObservableWithChange, ITransaction, observableValue, recordChangesLazy, transaction } from '../../../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { observableReducerSettable } from '../../../../../base/common/observableInternal/experimental/reducer.js';
import { isDefined, isObject } from '../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from '../../../../../platform/dataChannel/browser/forwardingTelemetryService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import product from '../../../../../platform/product/common/product.js';
import { StringEdit } from '../../../../common/core/edits/stringEdit.js';
import { Position } from '../../../../common/core/position.js';
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind, InlineCompletionsProvider } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { ITextModel } from '../../../../common/model.js';
import { offsetEditFromContentChanges } from '../../../../common/model/textModelStringEdit.js';
import { IFeatureDebounceInformation } from '../../../../common/services/languageFeatureDebounce.js';
import { IModelContentChangedEvent } from '../../../../common/textModelEvents.js';
import { formatRecordableLogEntry, IRecordableEditorLogEntry, IRecordableLogEntry, StructuredLogger } from '../structuredLogger.js';
import { InlineCompletionEndOfLifeEvent, sendInlineCompletionsEndOfLifeTelemetry } from '../telemetry.js';
import { wait } from '../utils.js';
import { InlineSuggestionIdentity, InlineSuggestionItem } from './inlineSuggestionItem.js';
import { InlineCompletionContextWithoutUuid, InlineSuggestRequestInfo, provideInlineCompletions, runWhenCancelled } from './provideInlineCompletions.js';

export class InlineCompletionsSource extends Disposable {
	private static _requestId = 0;

	private readonly _updateOperation = this._register(new MutableDisposable<UpdateOperation>());

	private readonly _loggingEnabled;
	private readonly _sendRequestData;

	private readonly _structuredFetchLogger;

	private readonly _state = observableReducerSettable(this, {
		initial: () => ({
			inlineCompletions: InlineCompletionsState.createEmpty(),
			suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty(),
		}),
		disposeFinal: (values) => {
			values.inlineCompletions.dispose();
			values.suggestWidgetInlineCompletions.dispose();
		},
		changeTracker: recordChangesLazy(() => ({ versionId: this._versionId })),
		update: (reader, previousValue, changes) => {
			const edit = StringEdit.compose(changes.changes.map(c => c.change ? offsetEditFromContentChanges(c.change.changes) : StringEdit.empty).filter(isDefined));

			if (edit.isEmpty()) {
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

	private _completionsEnabled: Record<string, boolean> | undefined = undefined;

	constructor(
		private readonly _textModel: ITextModel,
		private readonly _versionId: IObservableWithChange<number | null, IModelContentChangedEvent | undefined>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		private readonly _cursorPosition: IObservable<Position>,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._loggingEnabled = observableConfigValue('editor.inlineSuggest.logFetch', false, this._configurationService).recomputeInitiallyAndOnChange(this._store);
		this._sendRequestData = observableConfigValue('editor.inlineSuggest.emptyResponseInformation', true, this._configurationService).recomputeInitiallyAndOnChange(this._store);
		this._structuredFetchLogger = this._register(this._instantiationService.createInstance(StructuredLogger.cast<
			{ kind: 'start'; requestId: number; context: unknown } & IRecordableEditorLogEntry
			| { kind: 'end'; error: unknown; durationMs: number; result: unknown; requestId: number } & IRecordableLogEntry
		>(),
			'editor.inlineSuggest.logFetch.commandId'
		));

		this.clearOperationOnTextModelChange.recomputeInitiallyAndOnChange(this._store);

		const enablementSetting = product.defaultChatAgent?.completionsEnablementSetting ?? undefined;
		if (enablementSetting) {
			this._updateCompletionsEnablement(enablementSetting);
			this._register(this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(enablementSetting)) {
					this._updateCompletionsEnablement(enablementSetting);
				}
			}));
		}

		this._state.recomputeInitiallyAndOnChange(this._store);
	}

	private _updateCompletionsEnablement(enalementSetting: string) {
		const result = this._configurationService.getValue<Record<string, boolean>>(enalementSetting);
		if (!isObject(result)) {
			this._completionsEnabled = undefined;
		} else {
			this._completionsEnabled = result;
		}
	}

	public readonly clearOperationOnTextModelChange = derived(this, reader => {
		this._versionId.read(reader);
		this._updateOperation.clear();
		return undefined; // always constant
	});

	private _log(entry:
		{ sourceId: string; kind: 'start'; requestId: number; context: unknown; provider: string | undefined } & IRecordableEditorLogEntry
		| { sourceId: string; kind: 'end'; error: unknown; durationMs: number; result: unknown; requestId: number; didAllProvidersReturn: boolean } & IRecordableLogEntry
	) {
		if (this._loggingEnabled.get()) {
			this._logService.info(formatRecordableLogEntry(entry));
		}
		this._structuredFetchLogger.log(entry);
	}

	private readonly _loadingCount = observableValue(this, 0);
	public readonly loading = this._loadingCount.map(this, v => v > 0);

	public fetch(
		providers: InlineCompletionsProvider[],
		providersLabel: string | undefined,
		context: InlineCompletionContextWithoutUuid,
		activeInlineCompletion: InlineSuggestionIdentity | undefined,
		withDebounce: boolean,
		userJumpedToActiveCompletion: IObservable<boolean>,
		requestInfo: InlineSuggestRequestInfo
	): Promise<boolean> {
		const position = this._cursorPosition.get();
		const request = new UpdateRequest(position, context, this._textModel.getVersionId(), new Set(providers));

		const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions.get() : this.inlineCompletions.get();

		if (this._updateOperation.value?.request.satisfies(request)) {
			return this._updateOperation.value.promise;
		} else if (target?.request?.satisfies(request)) {
			return Promise.resolve(true);
		}

		const updateOngoing = !!this._updateOperation.value;
		this._updateOperation.clear();

		const source = new CancellationTokenSource();

		const promise = (async () => {
			const store = new DisposableStore();

			this._loadingCount.set(this._loadingCount.get() + 1, undefined);
			let didDecrease = false;
			const decreaseLoadingCount = () => {
				if (!didDecrease) {
					didDecrease = true;
					this._loadingCount.set(this._loadingCount.get() - 1, undefined);
				}
			};
			const loadingReset = store.add(new RunOnceScheduler(() => decreaseLoadingCount(), 10 * 1000));
			loadingReset.schedule();

			const inlineSuggestionsProviders = providers.filter(p => p.providerId);
			const requestResponseInfo = new RequestResponseData(context, requestInfo, inlineSuggestionsProviders);


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
					requestResponseInfo.setNoSuggestionReasonIfNotSet('canceled:beforeFetch');
					return false;
				}

				const requestId = InlineCompletionsSource._requestId++;
				if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
					this._log({
						sourceId: 'InlineCompletions.fetch',
						kind: 'start',
						requestId,
						modelUri: this._textModel.uri,
						modelVersion: this._textModel.getVersionId(),
						context: { triggerKind: context.triggerKind, suggestInfo: context.selectedSuggestionInfo ? true : undefined },
						time: Date.now(),
						provider: providersLabel,
					});
				}

				const startTime = new Date();
				const providerResult = provideInlineCompletions(providers, this._cursorPosition.get(), this._textModel, context, requestInfo, this._languageConfigurationService);

				runWhenCancelled(source.token, () => providerResult.cancelAndDispose({ kind: 'tokenCancellation' }));

				let shouldStopEarly = false;
				let producedSuggestion = false;

				const suggestions: InlineSuggestionItem[] = [];
				for await (const list of providerResult.lists) {
					if (!list) {
						continue;
					}
					list.addRef();
					store.add(toDisposable(() => list.removeRef(list.inlineSuggestionsData.length === 0 ? { kind: 'empty' } : { kind: 'notTaken' })));

					for (const item of list.inlineSuggestionsData) {
						producedSuggestion = true;
						if (!context.includeInlineEdits && (item.isInlineEdit || item.showInlineEditMenu)) {
							item.setNotShownReason('notInlineEditRequested');
							continue;
						}
						if (!context.includeInlineCompletions && !(item.isInlineEdit || item.showInlineEditMenu)) {
							item.setNotShownReason('notInlineCompletionRequested');
							continue;
						}

						const i = InlineSuggestionItem.create(item, this._textModel);
						suggestions.push(i);
						// Stop after first visible inline completion
						if (!i.isInlineEdit && !i.showInlineEditMenu && context.triggerKind === InlineCompletionTriggerKind.Automatic) {
							if (i.isVisible(this._textModel, this._cursorPosition.get())) {
								shouldStopEarly = true;
							}
						}
					}

					if (shouldStopEarly) {
						break;
					}
				}

				providerResult.cancelAndDispose({ kind: 'lostRace' });

				if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
					const didAllProvidersReturn = providerResult.didAllProvidersReturn;
					let error: string | undefined = undefined;
					if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
						error = 'canceled';
					}
					const result = suggestions.map(c => ({
						range: c.editRange.toString(),
						text: c.insertText,
						hint: c.hint,
						isInlineEdit: c.isInlineEdit,
						showInlineEditMenu: c.showInlineEditMenu,
						providerId: c.source.provider.providerId?.toString(),
					}));
					this._log({ sourceId: 'InlineCompletions.fetch', kind: 'end', requestId, durationMs: (Date.now() - startTime.getTime()), error, result, time: Date.now(), didAllProvidersReturn });
				}

				requestResponseInfo.setRequestUuid(providerResult.contextWithUuid.requestUuid);
				if (producedSuggestion) {
					requestResponseInfo.setHasProducedSuggestion();
					if (suggestions.length > 0 && source.token.isCancellationRequested) {
						suggestions.forEach(s => s.setNotShownReasonIfNotSet('canceled:whileAwaitingOtherProviders'));
					}
				} else {
					if (source.token.isCancellationRequested) {
						requestResponseInfo.setNoSuggestionReasonIfNotSet('canceled:whileFetching');
					} else {
						const completionsQuotaExceeded = this._contextKeyService.getContextKeyValue<boolean>('completionsQuotaExceeded');
						requestResponseInfo.setNoSuggestionReasonIfNotSet(completionsQuotaExceeded ? 'completionsQuotaExceeded' : 'noSuggestion');
					}
				}

				const remainingTimeToWait = context.earliestShownDateTime - Date.now();
				if (remainingTimeToWait > 0) {
					await wait(remainingTimeToWait, source.token);
				}

				if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId
					|| userJumpedToActiveCompletion.get()  /* In the meantime the user showed interest for the active completion so dont hide it */) {
					const notShownReason =
						source.token.isCancellationRequested ? 'canceled:afterMinShowDelay' :
							this._store.isDisposed ? 'canceled:disposed' :
								this._textModel.getVersionId() !== request.versionId ? 'canceled:documentChanged' :
									userJumpedToActiveCompletion.get() ? 'canceled:userJumped' :
										'unknown';
					suggestions.forEach(s => s.setNotShownReasonIfNotSet(notShownReason));
					return false;
				}

				const endTime = new Date();
				this._debounceValue.update(this._textModel, endTime.getTime() - startTime.getTime());

				const cursorPosition = this._cursorPosition.get();
				this._updateOperation.clear();
				transaction(tx => {
					/** @description Update completions with provider result */
					const v = this._state.get();

					if (context.selectedSuggestionInfo) {
						this._state.set({
							inlineCompletions: InlineCompletionsState.createEmpty(),
							suggestWidgetInlineCompletions: v.suggestWidgetInlineCompletions.createStateWithAppliedResults(suggestions, request, this._textModel, cursorPosition, activeInlineCompletion),
						}, tx);
					} else {
						this._state.set({
							inlineCompletions: v.inlineCompletions.createStateWithAppliedResults(suggestions, request, this._textModel, cursorPosition, activeInlineCompletion),
							suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty(),
						}, tx);
					}

					v.inlineCompletions.dispose();
					v.suggestWidgetInlineCompletions.dispose();
				});
			} finally {
				store.dispose();
				decreaseLoadingCount();
				this.sendInlineCompletionsRequestTelemetry(requestResponseInfo);
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

	private sendInlineCompletionsRequestTelemetry(
		requestResponseInfo: RequestResponseData
	): void {
		if (!this._sendRequestData.get() && !this._contextKeyService.getContextKeyValue<boolean>('isRunningUnificationExperiment')) {
			return;
		}

		if (requestResponseInfo.requestUuid === undefined || requestResponseInfo.hasProducedSuggestion) {
			return;
		}


		if (!isCompletionsEnabled(this._completionsEnabled, this._textModel.getLanguageId())) {
			return;
		}

		if (!requestResponseInfo.providers.some(p => isCopilotLikeExtension(p.providerId?.extensionId))) {
			return;
		}

		const emptyEndOfLifeEvent: InlineCompletionEndOfLifeEvent = {
			opportunityId: requestResponseInfo.requestUuid,
			noSuggestionReason: requestResponseInfo.noSuggestionReason ?? 'unknown',
			extensionId: 'vscode-core',
			extensionVersion: '0.0.0',
			groupId: 'empty',
			shown: false,
			editorType: requestResponseInfo.requestInfo.editorType,
			requestReason: requestResponseInfo.requestInfo.reason,
			typingInterval: requestResponseInfo.requestInfo.typingInterval,
			typingIntervalCharacterCount: requestResponseInfo.requestInfo.typingIntervalCharacterCount,
			languageId: requestResponseInfo.requestInfo.languageId,
			selectedSuggestionInfo: !!requestResponseInfo.context.selectedSuggestionInfo,
			availableProviders: requestResponseInfo.providers.map(p => p.providerId?.toString()).filter(isDefined).join(','),
			...forwardToChannelIf(requestResponseInfo.providers.some(p => isCopilotLikeExtension(p.providerId?.extensionId))),
			timeUntilProviderRequest: undefined,
			timeUntilProviderResponse: undefined,
			viewKind: undefined,
			preceeded: undefined,
			superseded: undefined,
			reason: undefined,
			correlationId: undefined,
			shownDuration: undefined,
			shownDurationUncollapsed: undefined,
			timeUntilShown: undefined,
			partiallyAccepted: undefined,
			partiallyAcceptedCountSinceOriginal: undefined,
			partiallyAcceptedRatioSinceOriginal: undefined,
			partiallyAcceptedCharactersSinceOriginal: undefined,
			cursorColumnDistance: undefined,
			cursorLineDistance: undefined,
			lineCountOriginal: undefined,
			lineCountModified: undefined,
			characterCountOriginal: undefined,
			characterCountModified: undefined,
			disjointReplacements: undefined,
			sameShapeReplacements: undefined,
			notShownReason: undefined,
		};

		const dataChannel = this._instantiationService.createInstance(DataChannelForwardingTelemetryService);
		sendInlineCompletionsEndOfLifeTelemetry(dataChannel, emptyEndOfLifeEvent);
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
		public readonly context: InlineCompletionContextWithoutUuid,
		public readonly versionId: number,
		public readonly providers: Set<InlineCompletionsProvider>,
	) {
	}

	public satisfies(other: UpdateRequest): boolean {
		return this.position.equals(other.position)
			&& equalsIfDefined(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, itemEquals())
			&& (other.context.triggerKind === InlineCompletionTriggerKind.Automatic
				|| this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
			&& this.versionId === other.versionId
			&& isSubset(other.providers, this.providers);
	}

	public get isExplicitRequest() {
		return this.context.triggerKind === InlineCompletionTriggerKind.Explicit;
	}
}

class RequestResponseData {
	public requestUuid: string | undefined;
	public noSuggestionReason: string | undefined;
	public hasProducedSuggestion = false;

	constructor(
		public readonly context: InlineCompletionContextWithoutUuid,
		public readonly requestInfo: InlineSuggestRequestInfo,
		public readonly providers: InlineCompletionsProvider[],
	) { }

	setRequestUuid(uuid: string) {
		this.requestUuid = uuid;
	}

	setNoSuggestionReasonIfNotSet(type: string) {
		this.noSuggestionReason ??= type;
	}

	setHasProducedSuggestion() {
		this.hasProducedSuggestion = true;
	}
}

function isSubset<T>(set1: Set<T>, set2: Set<T>): boolean {
	return [...set1].every(item => set2.has(item));
}

function isCompletionsEnabled(completionsEnablementObject: Record<string, boolean> | undefined, modeId: string = '*'): boolean {
	if (completionsEnablementObject === undefined) {
		return false; // default to disabled if setting is not available
	}

	if (typeof completionsEnablementObject[modeId] !== 'undefined') {
		return Boolean(completionsEnablementObject[modeId]); // go with setting if explicitly defined
	}

	return Boolean(completionsEnablementObject['*']); // fallback to global setting otherwise
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
	public createStateWithAppliedEdit(edit: StringEdit, textModel: ITextModel): InlineCompletionsState {
		const newInlineCompletions = this.inlineCompletions.map(i => i.withEdit(edit, textModel)).filter(isDefined);
		return new InlineCompletionsState(newInlineCompletions, this.request);
	}

	public createStateWithAppliedResults(updatedSuggestions: InlineSuggestionItem[], request: UpdateRequest, textModel: ITextModel, cursorPosition: Position, itemIdToPreserveAtTop: InlineSuggestionIdentity | undefined): InlineCompletionsState {
		let itemToPreserve: InlineSuggestionItem | undefined = undefined;
		if (itemIdToPreserveAtTop) {
			const itemToPreserveCandidate = this._findById(itemIdToPreserveAtTop);
			if (itemToPreserveCandidate && itemToPreserveCandidate.canBeReused(textModel, request.position)) {
				itemToPreserve = itemToPreserveCandidate;

				const updatedItemToPreserve = updatedSuggestions.find(i => i.hash === itemToPreserveCandidate.hash);
				if (updatedItemToPreserve) {
					updatedSuggestions = moveToFront(updatedItemToPreserve, updatedSuggestions);
				} else {
					updatedSuggestions = [itemToPreserveCandidate, ...updatedSuggestions];
				}
			}
		}

		const preferInlineCompletions = itemToPreserve
			// itemToPreserve has precedence
			? !itemToPreserve.isInlineEdit
			// Otherwise: prefer inline completion if there is a visible one
			: updatedSuggestions.some(i => !i.isInlineEdit && i.isVisible(textModel, cursorPosition));

		let updatedItems: InlineSuggestionItem[] = [];
		for (const i of updatedSuggestions) {
			const oldItem = this._findByHash(i.hash);
			let item;
			if (oldItem && oldItem !== i) {
				item = i.withIdentity(oldItem.identity);
				i.setIsPreceeded(oldItem);
				oldItem.setEndOfLifeReason({ kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: i.getSourceCompletion() });
			} else {
				item = i;
			}
			if (preferInlineCompletions !== item.isInlineEdit) {
				updatedItems.push(item);
			}
		}

		updatedItems.sort(compareBy(i => i.showInlineEditMenu, booleanComparator));
		updatedItems = distinctByKey(updatedItems, i => i.semanticId);

		return new InlineCompletionsState(updatedItems, request);
	}

	public clone(): InlineCompletionsState {
		return new InlineCompletionsState(this.inlineCompletions, this.request);
	}
}

/** Keeps the first item in case of duplicates. */
function distinctByKey<T>(items: T[], key: (item: T) => unknown): T[] {
	const seen = new Set();
	return items.filter(item => {
		const k = key(item);
		if (seen.has(k)) {
			return false;
		}
		seen.add(k);
		return true;
	});
}

function moveToFront<T>(item: T, items: T[]): T[] {
	const index = items.indexOf(item);
	if (index > -1) {
		return [item, ...items.slice(0, index), ...items.slice(index + 1)];
	}
	return items;
}
