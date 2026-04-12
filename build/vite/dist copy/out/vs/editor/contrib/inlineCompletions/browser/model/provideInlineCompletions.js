/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { BugIndicatingError, onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { prefixedUuid } from '../../../../../base/common/uuid.js';
import { StringReplacement } from '../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { TextReplacement } from '../../../../common/core/edits/textEdit.js';
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { fixBracketsInLine } from '../../../../common/model/bracketPairsTextModelPart/fixBrackets.js';
import { SnippetParser, Text } from '../../../snippet/browser/snippetParser.js';
import { ErrorResult, getReadonlyEmptyArray } from '../utils.js';
import { groupByMap } from '../../../../../base/common/collections.js';
import { DirectedGraph } from './graph.js';
import { CachedFunction } from '../../../../../base/common/cache.js';
import { InlineCompletionViewKind } from '../view/inlineEdits/inlineEditsViewInterface.js';
import { isDefined } from '../../../../../base/common/types.js';
import { inlineCompletionIsVisible } from './inlineCompletionIsVisible.js';
import { EditDeltaInfo } from '../../../../common/textModelEditSource.js';
import { URI } from '../../../../../base/common/uri.js';
export function provideInlineCompletions(providers, position, model, context, requestInfo, languageConfigurationService) {
    const requestUuid = prefixedUuid('icr');
    const cancellationTokenSource = new CancellationTokenSource();
    let cancelReason = undefined;
    const contextWithUuid = { ...context, requestUuid: requestUuid };
    const defaultReplaceRange = getDefaultRange(position, model);
    const providersByGroupId = groupByMap(providers, p => p.groupId);
    const yieldsToGraph = DirectedGraph.from(providers, p => {
        return p.yieldsToGroupIds?.flatMap(groupId => providersByGroupId.get(groupId) ?? []) ?? [];
    });
    const { foundCycles } = yieldsToGraph.removeCycles();
    if (foundCycles.length > 0) {
        onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected.`
            + ` Path: ${foundCycles.map(s => s.toString ? s.toString() : ('' + s)).join(' -> ')}`));
    }
    let runningCount = 0;
    const queryProvider = new CachedFunction(async (provider) => {
        try {
            runningCount++;
            if (cancellationTokenSource.token.isCancellationRequested) {
                return undefined;
            }
            const yieldsTo = yieldsToGraph.getOutgoing(provider);
            for (const p of yieldsTo) {
                // We know there is no cycle, so no recursion here
                const result = await queryProvider.get(p);
                if (result) {
                    for (const item of result.inlineSuggestions.items) {
                        if (item.isInlineEdit || typeof item.insertText !== 'string' && item.insertText !== undefined) {
                            return undefined;
                        }
                        if (item.insertText !== undefined) {
                            const t = new TextReplacement(Range.lift(item.range) ?? defaultReplaceRange, item.insertText);
                            if (inlineCompletionIsVisible(t, undefined, model, position)) {
                                return undefined;
                            }
                        }
                        // else: inline completion is not visible, so lets not block
                    }
                }
            }
            let result;
            const providerStartTime = Date.now();
            try {
                result = await provider.provideInlineCompletions(model, position, contextWithUuid, cancellationTokenSource.token);
            }
            catch (e) {
                onUnexpectedExternalError(e);
                return undefined;
            }
            const providerEndTime = Date.now();
            if (!result) {
                return undefined;
            }
            const data = [];
            const list = new InlineSuggestionList(result, data, provider);
            list.addRef();
            runWhenCancelled(cancellationTokenSource.token, () => {
                return list.removeRef(cancelReason);
            });
            if (cancellationTokenSource.token.isCancellationRequested) {
                return undefined; // The list is disposed now, so we cannot return the items!
            }
            for (const item of result.items) {
                const r = toInlineSuggestData(item, list, defaultReplaceRange, model, languageConfigurationService, contextWithUuid, requestInfo, { startTime: providerStartTime, endTime: providerEndTime });
                if (ErrorResult.is(r)) {
                    r.logError();
                    continue;
                }
                data.push(r);
            }
            return list;
        }
        finally {
            runningCount--;
        }
    });
    const inlineCompletionLists = AsyncIterableProducer.fromPromisesResolveOrder(providers.map(p => queryProvider.get(p))).filter(isDefined);
    return {
        contextWithUuid,
        get didAllProvidersReturn() { return runningCount === 0; },
        lists: inlineCompletionLists,
        cancelAndDispose: reason => {
            if (cancelReason !== undefined) {
                return;
            }
            cancelReason = reason;
            cancellationTokenSource.dispose(true);
        }
    };
}
/** If the token is eventually cancelled, this will not leak either. */
export function runWhenCancelled(token, callback) {
    if (token.isCancellationRequested) {
        callback();
        return Disposable.None;
    }
    else {
        const listener = token.onCancellationRequested(() => {
            listener.dispose();
            callback();
        });
        return { dispose: () => listener.dispose() };
    }
}
function toInlineSuggestData(inlineCompletion, source, defaultReplaceRange, textModel, languageConfigurationService, context, requestInfo, providerRequestInfo) {
    let action;
    const uri = inlineCompletion.uri ? URI.revive(inlineCompletion.uri) : undefined;
    if (inlineCompletion.jumpToPosition !== undefined) {
        action = {
            kind: 'jumpTo',
            position: Position.lift(inlineCompletion.jumpToPosition),
            uri,
        };
    }
    else if (inlineCompletion.insertText !== undefined) {
        let insertText;
        let snippetInfo;
        let range = inlineCompletion.range ? Range.lift(inlineCompletion.range) : defaultReplaceRange;
        if (typeof inlineCompletion.insertText === 'string') {
            insertText = inlineCompletion.insertText;
            if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
                insertText = closeBrackets(insertText, range.getStartPosition(), textModel, languageConfigurationService);
                // Modify range depending on if brackets are added or removed
                const diff = insertText.length - inlineCompletion.insertText.length;
                if (diff !== 0) {
                    range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
                }
            }
            snippetInfo = undefined;
        }
        else if ('snippet' in inlineCompletion.insertText) {
            const preBracketCompletionLength = inlineCompletion.insertText.snippet.length;
            if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
                inlineCompletion.insertText.snippet = closeBrackets(inlineCompletion.insertText.snippet, range.getStartPosition(), textModel, languageConfigurationService);
                // Modify range depending on if brackets are added or removed
                const diff = inlineCompletion.insertText.snippet.length - preBracketCompletionLength;
                if (diff !== 0) {
                    range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
                }
            }
            const snippet = new SnippetParser().parse(inlineCompletion.insertText.snippet);
            if (snippet.children.length === 1 && snippet.children[0] instanceof Text) {
                insertText = snippet.children[0].value;
                snippetInfo = undefined;
            }
            else {
                insertText = snippet.toString();
                snippetInfo = {
                    snippet: inlineCompletion.insertText.snippet,
                    range: range
                };
            }
        }
        else {
            assertNever(inlineCompletion.insertText);
        }
        action = {
            kind: 'edit',
            range,
            insertText,
            snippetInfo,
            uri,
            alternativeAction: undefined,
        };
    }
    else {
        action = undefined;
        if (!inlineCompletion.hint) {
            return ErrorResult.message('Inline completion has no insertText, jumpToPosition nor hint.');
        }
    }
    return new InlineSuggestData(action, inlineCompletion.hint, inlineCompletion.additionalTextEdits || getReadonlyEmptyArray(), inlineCompletion, source, context, inlineCompletion.isInlineEdit ?? false, inlineCompletion.supportsRename ?? false, requestInfo, providerRequestInfo, inlineCompletion.correlationId);
}
export class InlineSuggestData {
    static createForTest(action, targetUri) {
        const mockInlineCompletion = {
            insertText: action?.kind === 'edit' ? action.insertText : '',
            range: action?.kind === 'edit' ? action.range : undefined,
            isInlineEdit: true,
        };
        const mockProvider = {
            provideInlineCompletions: () => ({ items: [] }),
            disposeInlineCompletions: () => { },
        };
        const mockSource = new InlineSuggestionList({ items: [mockInlineCompletion] }, [], mockProvider);
        const mockContext = {
            triggerKind: InlineCompletionTriggerKind.Explicit,
            selectedSuggestionInfo: undefined,
            requestUuid: 'test-' + Date.now(),
            earliestShownDateTime: 0,
            includeInlineCompletions: true,
            includeInlineEdits: false,
            requestIssuedDateTime: Date.now(),
        };
        const mockRequestInfo = {
            startTime: Date.now(),
            sku: undefined,
            editorType: InlineCompletionEditorType.TextEditor,
            languageId: 'plaintext',
            availableProviders: [],
            reason: '',
            typingInterval: 0,
            typingIntervalCharacterCount: 0,
        };
        const mockProviderRequestInfo = {
            startTime: Date.now(),
            endTime: Date.now(),
        };
        return new InlineSuggestData(action, undefined, [], mockInlineCompletion, mockSource, mockContext, true, false, mockRequestInfo, mockProviderRequestInfo, undefined);
    }
    get action() {
        return this._action;
    }
    constructor(_action, hint, additionalTextEdits, sourceInlineCompletion, source, context, isInlineEdit, supportsRename, _requestInfo, _providerRequestInfo, _correlationId) {
        this._action = _action;
        this.hint = hint;
        this.additionalTextEdits = additionalTextEdits;
        this.sourceInlineCompletion = sourceInlineCompletion;
        this.source = source;
        this.context = context;
        this.isInlineEdit = isInlineEdit;
        this.supportsRename = supportsRename;
        this._requestInfo = _requestInfo;
        this._providerRequestInfo = _providerRequestInfo;
        this._correlationId = _correlationId;
        this._didShow = false;
        this._timeUntilShown = undefined;
        this._timeUntilActuallyShown = undefined;
        this._showStartTime = undefined;
        this._shownDuration = 0;
        this._showUncollapsedStartTime = undefined;
        this._showUncollapsedDuration = 0;
        this._notShownReason = undefined;
        this._didReportEndOfLife = false;
        this._lastSetEndOfLifeReason = undefined;
        this._isPreceeded = false;
        this._partiallyAcceptedCount = 0;
        this._partiallyAcceptedSinceOriginal = { characters: 0, ratio: 0, count: 0 };
        this._renameInfo = undefined;
        this._editKind = undefined;
        this.performance = new InlineSuggestionsPerformance();
        this._viewData = { editorType: _requestInfo.editorType };
    }
    get showInlineEditMenu() { return this.sourceInlineCompletion.showInlineEditMenu ?? false; }
    get partialAccepts() { return this._partiallyAcceptedSinceOriginal; }
    async reportInlineEditShown(commandService, updatedInsertText, viewKind, viewData, editKind, timeWhenShown) {
        this.updateShownDuration(viewKind);
        if (this._didShow || this._didReportEndOfLife) {
            return;
        }
        this.addPerformanceMarker('shown');
        this._didShow = true;
        this._editKind = editKind;
        this._viewData.viewKind = viewKind;
        this._viewData.renderData = viewData;
        this._timeUntilShown = timeWhenShown - this._requestInfo.startTime;
        this._timeUntilActuallyShown = Date.now() - this._requestInfo.startTime;
        const editDeltaInfo = new EditDeltaInfo(viewData.lineCountModified, viewData.lineCountOriginal, viewData.characterCountModified, viewData.characterCountOriginal);
        this.source.provider.handleItemDidShow?.(this.source.inlineSuggestions, this.sourceInlineCompletion, updatedInsertText, editDeltaInfo);
        if (this.sourceInlineCompletion.shownCommand) {
            await commandService.executeCommand(this.sourceInlineCompletion.shownCommand.id, ...(this.sourceInlineCompletion.shownCommand.arguments || []));
        }
    }
    reportPartialAccept(acceptedCharacters, info, partialAcceptance) {
        this._partiallyAcceptedCount++;
        this._partiallyAcceptedSinceOriginal.characters += partialAcceptance.characters;
        this._partiallyAcceptedSinceOriginal.ratio = Math.min(this._partiallyAcceptedSinceOriginal.ratio + (1 - this._partiallyAcceptedSinceOriginal.ratio) * partialAcceptance.ratio, 1);
        this._partiallyAcceptedSinceOriginal.count += partialAcceptance.count;
        this.source.provider.handlePartialAccept?.(this.source.inlineSuggestions, this.sourceInlineCompletion, acceptedCharacters, info);
    }
    /**
     * Sends the end of life event to the provider.
     * If no reason is provided, the last set reason is used.
     * If no reason was set, the default reason is used.
    */
    reportEndOfLife(reason) {
        if (this._didReportEndOfLife) {
            return;
        }
        this._didReportEndOfLife = true;
        this.reportInlineEditHidden();
        if (!reason) {
            reason = this._lastSetEndOfLifeReason ?? { kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: undefined };
        }
        // A suggestion can only be "rejected" if it was actually shown to the user.
        // If the suggestion was never shown, downgrade to "ignored".
        if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected && !this._didShow) {
            reason = { kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: undefined };
        }
        if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected && this.source.provider.handleRejection) {
            this.source.provider.handleRejection(this.source.inlineSuggestions, this.sourceInlineCompletion);
        }
        if (this.source.provider.handleEndOfLifetime) {
            const summary = {
                requestUuid: this.context.requestUuid,
                correlationId: this._correlationId,
                selectedSuggestionInfo: !!this.context.selectedSuggestionInfo,
                partiallyAccepted: this._partiallyAcceptedCount,
                partiallyAcceptedCountSinceOriginal: this._partiallyAcceptedSinceOriginal.count,
                partiallyAcceptedRatioSinceOriginal: this._partiallyAcceptedSinceOriginal.ratio,
                partiallyAcceptedCharactersSinceOriginal: this._partiallyAcceptedSinceOriginal.characters,
                shown: this._didShow,
                shownDuration: this._shownDuration,
                shownDurationUncollapsed: this._showUncollapsedDuration,
                editKind: this._editKind?.toString(),
                preceeded: this._isPreceeded,
                timeUntilShown: this._timeUntilShown,
                timeUntilActuallyShown: this._timeUntilActuallyShown,
                timeUntilProviderRequest: this._providerRequestInfo.startTime - this._requestInfo.startTime,
                timeUntilProviderResponse: this._providerRequestInfo.endTime - this._requestInfo.startTime,
                editorType: this._viewData.editorType,
                languageId: this._requestInfo.languageId,
                requestReason: this._requestInfo.reason,
                viewKind: this._viewData.viewKind,
                notShownReason: this._notShownReason,
                performanceMarkers: this.performance.toString(),
                renameCreated: this._renameInfo?.createdRename,
                renameDuration: this._renameInfo?.duration,
                renameTimedOut: this._renameInfo?.timedOut,
                renameDroppedOtherEdits: this._renameInfo?.droppedOtherEdits,
                renameDroppedRenameEdits: this._renameInfo?.droppedRenameEdits,
                typingInterval: this._requestInfo.typingInterval,
                typingIntervalCharacterCount: this._requestInfo.typingIntervalCharacterCount,
                skuPlan: this._requestInfo.sku?.plan,
                skuType: this._requestInfo.sku?.type,
                availableProviders: this._requestInfo.availableProviders.map(p => p.toString()).join(','),
                ...this._viewData.renderData?.getData(),
            };
            this.source.provider.handleEndOfLifetime(this.source.inlineSuggestions, this.sourceInlineCompletion, reason, summary);
        }
    }
    setIsPreceeded(partialAccepts) {
        this._isPreceeded = true;
        if (this._partiallyAcceptedSinceOriginal.characters !== 0 || this._partiallyAcceptedSinceOriginal.ratio !== 0 || this._partiallyAcceptedSinceOriginal.count !== 0) {
            console.warn('Expected partiallyAcceptedCountSinceOriginal to be { characters: 0, rate: 0, partialAcceptances: 0 } before setIsPreceeded.');
        }
        this._partiallyAcceptedSinceOriginal = partialAccepts;
    }
    setNotShownReason(reason) {
        this._notShownReason ??= reason;
    }
    /**
     * Sets the end of life reason, but does not send the event to the provider yet.
    */
    setEndOfLifeReason(reason) {
        this.reportInlineEditHidden();
        this._lastSetEndOfLifeReason = reason;
    }
    updateShownDuration(viewKind) {
        const timeNow = Date.now();
        if (!this._showStartTime) {
            this._showStartTime = timeNow;
        }
        const isCollapsed = viewKind === InlineCompletionViewKind.Collapsed;
        if (!isCollapsed && this._showUncollapsedStartTime === undefined) {
            this._showUncollapsedStartTime = timeNow;
        }
        if (isCollapsed && this._showUncollapsedStartTime !== undefined) {
            this._showUncollapsedDuration += timeNow - this._showUncollapsedStartTime;
        }
    }
    reportInlineEditHidden() {
        if (this._showStartTime === undefined) {
            return;
        }
        const timeNow = Date.now();
        this._shownDuration += timeNow - this._showStartTime;
        this._showStartTime = undefined;
        if (this._showUncollapsedStartTime === undefined) {
            return;
        }
        this._showUncollapsedDuration += timeNow - this._showUncollapsedStartTime;
        this._showUncollapsedStartTime = undefined;
    }
    setRenameProcessingInfo(info) {
        if (this._renameInfo) {
            throw new BugIndicatingError('Rename info has already been set.');
        }
        this._renameInfo = info;
    }
    withAction(action) {
        this._action = action;
        return this;
    }
    addPerformanceMarker(marker) {
        this.performance.mark(marker);
    }
}
class InlineSuggestionsPerformance {
    constructor() {
        this.markers = [];
        this.markers.push({ name: 'start', timeStamp: Date.now() });
    }
    mark(marker) {
        this.markers.push({ name: marker, timeStamp: Date.now() });
    }
    toString() {
        const deltas = [];
        for (let i = 1; i < this.markers.length; i++) {
            const delta = this.markers[i].timeStamp - this.markers[i - 1].timeStamp;
            deltas.push({ [this.markers[i].name]: delta });
        }
        return JSON.stringify(deltas);
    }
}
export var InlineCompletionEditorType;
(function (InlineCompletionEditorType) {
    InlineCompletionEditorType["TextEditor"] = "textEditor";
    InlineCompletionEditorType["DiffEditor"] = "diffEditor";
    InlineCompletionEditorType["Notebook"] = "notebook";
})(InlineCompletionEditorType || (InlineCompletionEditorType = {}));
/**
 * A ref counted pointer to the computed `InlineCompletions` and the `InlineCompletionsProvider` that
 * computed them.
 */
export class InlineSuggestionList {
    constructor(inlineSuggestions, inlineSuggestionsData, provider) {
        this.inlineSuggestions = inlineSuggestions;
        this.inlineSuggestionsData = inlineSuggestionsData;
        this.provider = provider;
        this.refCount = 0;
    }
    addRef() {
        this.refCount++;
    }
    removeRef(reason = { kind: 'other' }) {
        this.refCount--;
        if (this.refCount === 0) {
            for (const item of this.inlineSuggestionsData) {
                // Fallback if it has not been called before
                item.reportEndOfLife();
            }
            this.provider.disposeInlineCompletions(this.inlineSuggestions, reason);
        }
    }
}
function getDefaultRange(position, model) {
    const word = model.getWordAtPosition(position);
    const maxColumn = model.getLineMaxColumn(position.lineNumber);
    // By default, always replace up until the end of the current line.
    // This default might be subject to change!
    return word
        ? new Range(position.lineNumber, word.startColumn, position.lineNumber, maxColumn)
        : Range.fromPositions(position, position.with(undefined, maxColumn));
}
function closeBrackets(text, position, model, languageConfigurationService) {
    const currentLine = model.getLineContent(position.lineNumber);
    const edit = StringReplacement.replace(new OffsetRange(position.column - 1, currentLine.length), text);
    const proposedLineTokens = model.tokenization.tokenizeLinesAt(position.lineNumber, [edit.replace(currentLine)]);
    const textTokens = proposedLineTokens?.[0].sliceZeroCopy(edit.getRangeAfterReplace());
    if (!textTokens) {
        return text;
    }
    const fixedText = fixBracketsInLine(textTokens, languageConfigurationService);
    return fixedText;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdmlkZUlubGluZUNvbXBsZXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVFLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRyxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBR2xFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RSxPQUFPLEVBQW1DLG1DQUFtQyxFQUFrTSwyQkFBMkIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBR3BWLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDaEYsT0FBTyxFQUFF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