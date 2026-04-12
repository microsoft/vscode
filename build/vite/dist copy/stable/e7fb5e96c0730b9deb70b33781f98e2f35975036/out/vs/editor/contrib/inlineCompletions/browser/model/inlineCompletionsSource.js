/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var InlineCompletionsSource_1;
import { booleanComparator, compareBy, compareUndefinedSmallest, numberComparator } from '../../../../../base/common/arrays.js';
import { findLastMax } from '../../../../../base/common/arraysFind.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { equalsIfDefined, thisEqualsC } from '../../../../../base/common/equals.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { cloneAndChange } from '../../../../../base/common/objects.js';
import { derived, observableValue, recordChangesLazy, runOnChange, transaction } from '../../../../../base/common/observable.js';
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
import { Range } from '../../../../common/core/range.js';
import { Command, InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { offsetEditFromContentChanges } from '../../../../common/model/textModelStringEdit.js';
import { isCompletionsEnabledFromObject } from '../../../../common/services/completionsEnablement.js';
import { ITextModelService } from '../../../../common/services/resolverService.js';
import { formatRecordableLogEntry, StructuredLogger } from '../structuredLogger.js';
import { sendInlineCompletionsEndOfLifeTelemetry } from '../telemetry.js';
import { wait } from '../utils.js';
import { InlineSuggestionItem } from './inlineSuggestionItem.js';
import { provideInlineCompletions, runWhenCancelled } from './provideInlineCompletions.js';
import { RenameSymbolProcessor } from './renameSymbolProcessor.js';
import { TextModelValueReference } from './textModelValueReference.js';
let InlineCompletionsSource = class InlineCompletionsSource extends Disposable {
    static { InlineCompletionsSource_1 = this; }
    static { this._requestId = 0; }
    constructor(_textModel, _versionId, _debounceValue, _cursorPosition, _languageConfigurationService, _logService, _configurationService, _instantiationService, _contextKeyService, _textModelService) {
        super();
        this._textModel = _textModel;
        this._versionId = _versionId;
        this._debounceValue = _debounceValue;
        this._cursorPosition = _cursorPosition;
        this._languageConfigurationService = _languageConfigurationService;
        this._logService = _logService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._contextKeyService = _contextKeyService;
        this._textModelService = _textModelService;
        this._updateOperation = this._register(new MutableDisposable());
        this._state = observableReducerSettable(this, {
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
                }
                finally {
                    previousValue.inlineCompletions.dispose();
                    previousValue.suggestWidgetInlineCompletions.dispose();
                }
            }
        });
        this.inlineCompletions = this._state.map(this, v => v.inlineCompletions);
        this.suggestWidgetInlineCompletions = this._state.map(this, v => v.suggestWidgetInlineCompletions);
        this._completionsEnabled = undefined;
        this.clearOperationOnTextModelChange = derived(this, reader => {
            this._versionId.read(reader);
            this._updateOperation.clear();
            return undefined; // always constant
        });
        this._loadingCount = observableValue(this, 0);
        this.loading = this._loadingCount.map(this, v => v > 0);
        this._loggingEnabled = observableConfigValue('editor.inlineSuggest.logFetch', false, this._configurationService).recomputeInitiallyAndOnChange(this._store);
        this._sendRequestData = observableConfigValue('editor.inlineSuggest.emptyResponseInformation', true, this._configurationService).recomputeInitiallyAndOnChange(this._store);
        this._structuredFetchLogger = this._register(this._instantiationService.createInstance(StructuredLogger.cast(), 'editor.inlineSuggest.logFetch.commandId'));
        this._renameProcessor = this._store.add(this._instantiationService.createInstance(RenameSymbolProcessor));
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
    _updateCompletionsEnablement(enalementSetting) {
        const result = this._configurationService.getValue(enalementSetting);
        if (!isObject(result)) {
            this._completionsEnabled = undefined;
        }
        else {
            this._completionsEnabled = result;
        }
    }
    _log(entry) {
        if (this._loggingEnabled.get()) {
            this._logService.info(formatRecordableLogEntry(entry));
        }
        this._structuredFetchLogger.log(entry);
    }
    fetch(providers, providersLabel, context, activeInlineCompletion, withDebounce, userJumpedToActiveCompletion, requestInfo) {
        const position = this._cursorPosition.get();
        const request = new UpdateRequest(position, context, this._textModel.getVersionId(), new Set(providers));
        const target = context.selectedSuggestionInfo ? this.suggestWidgetInlineCompletions.get() : this.inlineCompletions.get();
        if (this._updateOperation.value?.request.satisfies(request)) {
            return this._updateOperation.value.promise;
        }
        else if (target?.request?.satisfies(request)) {
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
                const debounceValue = findLastMax(providers.map(p => p.debounceDelayMs), compareUndefinedSmallest(numberComparator)) ?? recommendedDebounceValue;
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
                const requestId = InlineCompletionsSource_1._requestId++;
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
                const providerSuggestions = [];
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
                        item.addPerformanceMarker('providerReturned');
                        const targetUri = item.action?.uri;
                        let targetModel;
                        let disposable;
                        if (targetUri && targetUri.toString() !== this._textModel.uri.toString()) {
                            const modelRef = await this._textModelService.createModelReference(targetUri);
                            targetModel = modelRef.object.textEditorModel;
                            disposable = modelRef;
                        }
                        else {
                            targetModel = this._textModel;
                            disposable = undefined;
                        }
                        const ref = TextModelValueReference.snapshot(targetModel);
                        const i = InlineSuggestionItem.create(item, ref);
                        if (disposable) {
                            const s = runOnChange(i.identity.onDispose, () => {
                                disposable?.dispose();
                                s.dispose();
                            });
                        }
                        item.addPerformanceMarker('itemCreated');
                        providerSuggestions.push(i);
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
                providerSuggestions.forEach(s => s.addPerformanceMarker('providersResolved'));
                const suggestions = await Promise.all(providerSuggestions.map(async (s) => {
                    return this._renameProcessor.proposeRenameRefactoring(this._textModel, s, context);
                }));
                suggestions.forEach(s => s.addPerformanceMarker('renameProcessed'));
                providerResult.cancelAndDispose({ kind: 'lostRace' });
                if (this._loggingEnabled.get() || this._structuredFetchLogger.isEnabled.get()) {
                    const didAllProvidersReturn = providerResult.didAllProvidersReturn;
                    let error = undefined;
                    if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId) {
                        error = 'canceled';
                    }
                    const result = suggestions.map(c => {
                        const comp = c.getSourceCompletion();
                        if (comp.doNotLog) {
                            return undefined;
                        }
                        const obj = {
                            insertText: comp.insertText,
                            range: comp.range,
                            additionalTextEdits: comp.additionalTextEdits,
                            uri: comp.uri,
                            command: comp.command,
                            gutterMenuLinkAction: comp.gutterMenuLinkAction,
                            shownCommand: comp.shownCommand,
                            completeBracketPairs: comp.completeBracketPairs,
                            isInlineEdit: comp.isInlineEdit,
                            showInlineEditMenu: comp.showInlineEditMenu,
                            showRange: comp.showRange,
                            warning: comp.warning,
                            hint: comp.hint,
                            supportsRename: comp.supportsRename,
                            correlationId: comp.correlationId,
                            jumpToPosition: comp.jumpToPosition,
                        };
                        return {
                            ...cloneAndChange(obj, v => {
                                if (Range.isIRange(v)) {
                                    return Range.lift(v).toString();
                                }
                                if (Position.isIPosition(v)) {
                                    return Position.lift(v).toString();
                                }
                                if (Command.is(v)) {
                                    return { $commandId: v.id };
                                }
                                return v;
                            }),
                            $providerId: c.source.provider.providerId?.toString(),
                        };
                    }).filter(result => result !== undefined);
                    this._log({ sourceId: 'InlineCompletions.fetch', kind: 'end', requestId, durationMs: (Date.now() - startTime.getTime()), error, result, time: Date.now(), didAllProvidersReturn });
                }
                requestResponseInfo.setRequestUuid(providerResult.contextWithUuid.requestUuid);
                if (producedSuggestion) {
                    requestResponseInfo.setHasProducedSuggestion();
                    if (suggestions.length > 0 && source.token.isCancellationRequested) {
                        suggestions.forEach(s => s.setNotShownReasonIfNotSet('canceled:whileAwaitingOtherProviders'));
                    }
                }
                else {
                    if (source.token.isCancellationRequested) {
                        requestResponseInfo.setNoSuggestionReasonIfNotSet('canceled:whileFetching');
                    }
                    else {
                        const completionsQuotaExceeded = this._contextKeyService.getContextKeyValue('completionsQuotaExceeded');
                        requestResponseInfo.setNoSuggestionReasonIfNotSet(completionsQuotaExceeded ? 'completionsQuotaExceeded' : 'noSuggestion');
                    }
                }
                const remainingTimeToWait = context.earliestShownDateTime - Date.now();
                if (remainingTimeToWait > 0) {
                    await wait(remainingTimeToWait, source.token);
                }
                suggestions.forEach(s => s.addPerformanceMarker('minShowDelayPassed'));
                if (source.token.isCancellationRequested || this._store.isDisposed || this._textModel.getVersionId() !== request.versionId
                    || userJumpedToActiveCompletion.get() /* In the meantime the user showed interest for the active completion so dont hide it */) {
                    const notShownReason = source.token.isCancellationRequested ? 'canceled:afterMinShowDelay' :
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
                    }
                    else {
                        this._state.set({
                            inlineCompletions: v.inlineCompletions.createStateWithAppliedResults(suggestions, request, this._textModel, cursorPosition, activeInlineCompletion),
                            suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty(),
                        }, tx);
                    }
                    v.inlineCompletions.dispose();
                    v.suggestWidgetInlineCompletions.dispose();
                });
            }
            finally {
                store.dispose();
                decreaseLoadingCount();
                this._sendInlineCompletionsRequestTelemetry(requestResponseInfo);
            }
            return true;
        })();
        const updateOperation = new UpdateOperation(request, source, promise);
        this._updateOperation.value = updateOperation;
        return promise;
    }
    clear(tx) {
        if (this._store.isDisposed) {
            return;
        }
        this._updateOperation.clear();
        const v = this._state.get();
        this._state.set({
            inlineCompletions: InlineCompletionsState.createEmpty(),
            suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty()
        }, tx);
        v.inlineCompletions.dispose();
        v.suggestWidgetInlineCompletions.dispose();
    }
    seedInlineCompletionsWithSuggestWidget() {
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
    /**
     * Seeds the inline completions with an external inline completion item.
     * Used when transplanting a completion from one model to another (cross-file edits).
     */
    seedWithCompletion(item, tx) {
        const s = this._state.get();
        this._state.set({
            inlineCompletions: new InlineCompletionsState([item], undefined),
            suggestWidgetInlineCompletions: InlineCompletionsState.createEmpty(),
        }, tx);
        s.inlineCompletions.dispose();
        s.suggestWidgetInlineCompletions.dispose();
    }
    _sendInlineCompletionsRequestTelemetry(requestResponseInfo) {
        if (!this._sendRequestData.get() && !this._contextKeyService.getContextKeyValue('isRunningUnificationExperiment')) {
            return;
        }
        if (requestResponseInfo.requestUuid === undefined || requestResponseInfo.hasProducedSuggestion) {
            return;
        }
        if (!isCompletionsEnabledFromObject(this._completionsEnabled, this._textModel.getLanguageId())) {
            return;
        }
        if (!requestResponseInfo.providers.some(p => isCopilotLikeExtension(p.providerId?.extensionId))) {
            return;
        }
        const emptyEndOfLifeEvent = {
            opportunityId: requestResponseInfo.requestUuid,
            noSuggestionReason: requestResponseInfo.noSuggestionReason ?? 'unknown',
            extensionId: 'vscode-core',
            extensionVersion: '0.0.0',
            groupId: 'empty',
            shown: false,
            skuPlan: requestResponseInfo.requestInfo.sku?.plan,
            skuType: requestResponseInfo.requestInfo.sku?.type,
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
            acceptedAlternativeAction: undefined,
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
            longDistanceHintVisible: undefined,
            longDistanceHintDistance: undefined,
            notShownReason: undefined,
            renameCreated: false,
            renameDuration: undefined,
            renameTimedOut: false,
            renameDroppedOtherEdits: undefined,
            renameDroppedRenameEdits: undefined,
            performanceMarkers: undefined,
            editKind: undefined,
        };
        const dataChannel = this._instantiationService.createInstance(DataChannelForwardingTelemetryService);
        sendInlineCompletionsEndOfLifeTelemetry(dataChannel, emptyEndOfLifeEvent);
    }
    clearSuggestWidgetInlineCompletions(tx) {
        if (this._updateOperation.value?.request.context.selectedSuggestionInfo) {
            this._updateOperation.clear();
        }
    }
    cancelUpdate() {
        this._updateOperation.clear();
    }
};
InlineCompletionsSource = InlineCompletionsSource_1 = __decorate([
    __param(4, ILanguageConfigurationService),
    __param(5, ILogService),
    __param(6, IConfigurationService),
    __param(7, IInstantiationService),
    __param(8, IContextKeyService),
    __param(9, ITextModelService)
], InlineCompletionsSource);
export { InlineCompletionsSource };
class UpdateRequest {
    constructor(position, context, versionId, providers) {
        this.position = position;
        this.context = context;
        this.versionId = versionId;
        this.providers = providers;
    }
    satisfies(other) {
        return this.position.equals(other.position)
            && equalsIfDefined(this.context.selectedSuggestionInfo, other.context.selectedSuggestionInfo, thisEqualsC())
            && (other.context.triggerKind === InlineCompletionTriggerKind.Automatic
                || this.context.triggerKind === InlineCompletionTriggerKind.Explicit)
            && this.versionId === other.versionId
            && isSubset(other.providers, this.providers);
    }
    get isExplicitRequest() {
        return this.context.triggerKind === InlineCompletionTriggerKind.Explicit;
    }
}
class RequestResponseData {
    constructor(context, requestInfo, providers) {
        this.context = context;
        this.requestInfo = requestInfo;
        this.providers = providers;
        this.hasProducedSuggestion = false;
    }
    setRequestUuid(uuid) {
        this.requestUuid = uuid;
    }
    setNoSuggestionReasonIfNotSet(type) {
        this.noSuggestionReason ??= type;
    }
    setHasProducedSuggestion() {
        this.hasProducedSuggestion = true;
    }
}
function isSubset(set1, set2) {
    return [...set1].every(item => set2.has(item));
}
class UpdateOperation {
    constructor(request, cancellationTokenSource, promise) {
        this.request = request;
        this.cancellationTokenSource = cancellationTokenSource;
        this.promise = promise;
    }
    dispose() {
        this.cancellationTokenSource.cancel();
    }
}
export class InlineCompletionsState extends Disposable {
    static createEmpty() {
        return new InlineCompletionsState([], undefined);
    }
    constructor(inlineCompletions, request) {
        super();
        this.inlineCompletions = inlineCompletions;
        this.request = request;
        for (const inlineCompletion of this.inlineCompletions) {
            inlineCompletion.addRef();
        }
        this._register({
            dispose: () => {
                for (const inlineCompletion of this.inlineCompletions) {
                    inlineCompletion.removeRef();
                }
            }
        });
    }
    _findById(id) {
        return this.inlineCompletions.find(i => i.identity === id);
    }
    _findByHash(hash) {
        return this.inlineCompletions.find(i => i.hash === hash);
    }
    /**
     * Applies the edit on the state.
    */
    createStateWithAppliedEdit(edit, textModel) {
        const newInlineCompletions = this.inlineCompletions.map(i => i.withEdit(edit, textModel)).filter(isDefined);
        return new InlineCompletionsState(newInlineCompletions, this.request);
    }
    createStateWithAppliedResults(updatedSuggestions, request, textModel, cursorPosition, itemIdToPreserveAtTop) {
        let itemToPreserve = undefined;
        if (itemIdToPreserveAtTop) {
            const itemToPreserveCandidate = this._findById(itemIdToPreserveAtTop);
            if (itemToPreserveCandidate && itemToPreserveCandidate.canBeReused(textModel, request.position)) {
                itemToPreserve = itemToPreserveCandidate;
                const updatedItemToPreserve = updatedSuggestions.find(i => i.hash === itemToPreserveCandidate.hash);
                if (updatedItemToPreserve) {
                    updatedSuggestions = moveToFront(updatedItemToPreserve, updatedSuggestions);
                }
                else {
                    updatedSuggestions = [itemToPreserveCandidate, ...updatedSuggestions];
                }
            }
        }
        const preferInlineCompletions = itemToPreserve
            // itemToPreserve has precedence
            ? !itemToPreserve.isInlineEdit
            // Otherwise: prefer inline completion if there is a visible one
            : updatedSuggestions.some(i => !i.isInlineEdit && i.isVisible(textModel, cursorPosition));
        let updatedItems = [];
        for (const i of updatedSuggestions) {
            const oldItem = this._findByHash(i.hash);
            let item;
            if (oldItem && oldItem !== i) {
                item = i.withIdentity(oldItem.identity);
                i.setIsPreceeded(oldItem);
                oldItem.setEndOfLifeReason({ kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: i.getSourceCompletion() });
            }
            else {
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
    clone() {
        return new InlineCompletionsState(this.inlineCompletions, this.request);
    }
}
/** Keeps the first item in case of duplicates. */
function distinctByKey(items, key) {
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
function moveToFront(item, items) {
    const index = items.indexOf(item);
    if (index > -1) {
        return [item, ...items.slice(0, index), ...items.slice(index + 1)];
    }
    return items;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnNTb3VyY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL2lubGluZUNvbXBsZXRpb25zU291cmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLHdCQUF3QixFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEksT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEksT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQW9ELGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkwsaUVBQWlFO0FBQ2pFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQ2xILE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0s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