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
import { mapFindFirst } from '../../../../../base/common/arraysFind.js';
import { arrayEqualsC } from '../../../../../base/common/equals.js';
import { BugIndicatingError, onUnexpectedExternalError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedHandleChanges, derivedOpts, mapObservableArrayCached, observableFromEvent, observableSignal, observableValue, recomputeInitiallyAndOnChange, subtransaction, transaction } from '../../../../../base/common/observable.js';
import { firstNonWhitespaceIndex } from '../../../../../base/common/strings.js';
import { isDefined } from '../../../../../base/common/types.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { CursorColumns } from '../../../../common/core/cursorColumns.js';
import { LineRange } from '../../../../common/core/ranges/lineRange.js';
import { Position } from '../../../../common/core/position.js';
import { Range } from '../../../../common/core/range.js';
import { Selection } from '../../../../common/core/selection.js';
import { TextReplacement, TextEdit } from '../../../../common/core/edits/textEdit.js';
import { TextLength } from '../../../../common/core/text/textLength.js';
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from '../../../../common/languages.js';
import { ILanguageConfigurationService } from '../../../../common/languages/languageConfigurationRegistry.js';
import { TextModelText } from '../../../../common/model/textModelText.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { SnippetController2 } from '../../../snippet/browser/snippetController2.js';
import { getEndPositionsAfterApplying, removeTextReplacementCommonSuffixPrefix } from '../utils.js';
import { AnimatedValue, easeOutCubic, ObservableAnimatedValue } from './animation.js';
import { computeGhostText } from './computeGhostText.js';
import { GhostText, ghostTextOrReplacementEquals, ghostTextsOrReplacementsEqual } from './ghostText.js';
import { InlineCompletionsSource } from './inlineCompletionsSource.js';
import { InlineCompletionEditorType } from './provideInlineCompletions.js';
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from './singleTextEditHelpers.js';
import { EditSources } from '../../../../common/textModelEditSource.js';
import { ICodeEditorService } from '../../../../browser/services/codeEditorService.js';
import { IInlineCompletionsService } from '../../../../browser/services/inlineCompletionsService.js';
import { TypingInterval } from './typingSpeed.js';
import { StringReplacement } from '../../../../common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../common/core/ranges/offsetRange.js';
import { URI } from '../../../../../base/common/uri.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { Schemas } from '../../../../../base/common/network.js';
import { getInlineCompletionsController } from '../controller/common.js';
let InlineCompletionsModel = class InlineCompletionsModel extends Disposable {
    get isAcceptingPartially() { return this._isAcceptingPartially; }
    get editor() {
        return this._editor;
    }
    constructor(textModel, _selectedSuggestItem, _textModelVersionId, _positions, _debounceValue, _enabled, _editor, _instantiationService, _commandService, _languageConfigurationService, _accessibilityService, _languageFeaturesService, _codeEditorService, _inlineCompletionsService, defaultAccountService) {
        super();
        this.textModel = textModel;
        this._selectedSuggestItem = _selectedSuggestItem;
        this._textModelVersionId = _textModelVersionId;
        this._positions = _positions;
        this._debounceValue = _debounceValue;
        this._enabled = _enabled;
        this._editor = _editor;
        this._instantiationService = _instantiationService;
        this._commandService = _commandService;
        this._languageConfigurationService = _languageConfigurationService;
        this._accessibilityService = _accessibilityService;
        this._languageFeaturesService = _languageFeaturesService;
        this._codeEditorService = _codeEditorService;
        this._inlineCompletionsService = _inlineCompletionsService;
        this._isActive = observableValue(this, false);
        this._onlyRequestInlineEditsSignal = observableSignal(this);
        this._forceUpdateExplicitlySignal = observableSignal(this);
        this._noDelaySignal = observableSignal(this);
        this._fetchSpecificProviderSignal = observableSignal(this);
        // We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
        this._selectedInlineCompletionId = observableValue(this, undefined);
        this.primaryPosition = derived(this, reader => this._positions.read(reader)[0] ?? new Position(1, 1));
        this.allPositions = derived(this, reader => this._positions.read(reader));
        this.sku = observableValue(this, undefined);
        this._isAcceptingPartially = false;
        this._appearedInsideViewport = derived(this, reader => {
            const state = this.state.read(reader);
            if (!state || !state.inlineSuggestion) {
                return false;
            }
            return isSuggestionInViewport(this._editor, state.inlineSuggestion);
        });
        this._onDidAccept = this._register(new Emitter());
        this.onDidAccept = this._onDidAccept.event;
        this._lastShownInlineCompletionInfo = undefined;
        this._lastAcceptedInlineCompletionInfo = undefined;
        this._didUndoInlineEdits = derivedHandleChanges({
            owner: this,
            changeTracker: {
                createChangeSummary: () => ({ didUndo: false }),
                handleChange: (ctx, changeSummary) => {
                    changeSummary.didUndo = ctx.didChange(this._textModelVersionId) && !!ctx.change?.isUndoing;
                    return true;
                }
            }
        }, (reader, changeSummary) => {
            const versionId = this._textModelVersionId.read(reader);
            if (versionId !== null
                && this._lastAcceptedInlineCompletionInfo
                && this._lastAcceptedInlineCompletionInfo.textModelVersionIdAfter === versionId - 1
                && this._lastAcceptedInlineCompletionInfo.inlineCompletion.isInlineEdit
                && changeSummary.didUndo) {
                this._lastAcceptedInlineCompletionInfo = undefined;
                return true;
            }
            return false;
        });
        this._preserveCurrentCompletionReasons = new Set([
            VersionIdChangeReason.Redo,
            VersionIdChangeReason.Undo,
            VersionIdChangeReason.AcceptWord,
        ]);
        this.dontRefetchSignal = observableSignal(this);
        this._fetchInlineCompletionsPromise = derivedHandleChanges({
            owner: this,
            changeTracker: {
                createChangeSummary: () => ({
                    dontRefetch: false,
                    preserveCurrentCompletion: false,
                    inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic,
                    onlyRequestInlineEdits: false,
                    shouldDebounce: true,
                    provider: undefined,
                    changeHint: undefined,
                    textChange: false,
                    changeReason: '',
                }),
                handleChange: (ctx, changeSummary) => {
                    /** @description fetch inline completions */
                    if (ctx.didChange(this._textModelVersionId)) {
                        if (this._preserveCurrentCompletionReasons.has(this._getReason(ctx.change))) {
                            changeSummary.preserveCurrentCompletion = true;
                        }
                        const detailedReasons = ctx.change?.detailedReasons ?? [];
                        changeSummary.changeReason = detailedReasons.length > 0 ? detailedReasons[0].getType() : '';
                        changeSummary.textChange = true;
                    }
                    else if (ctx.didChange(this._forceUpdateExplicitlySignal)) {
                        changeSummary.preserveCurrentCompletion = true;
                        changeSummary.inlineCompletionTriggerKind = InlineCompletionTriggerKind.Explicit;
                    }
                    else if (ctx.didChange(this.dontRefetchSignal)) {
                        changeSummary.dontRefetch = true;
                    }
                    else if (ctx.didChange(this._onlyRequestInlineEditsSignal)) {
                        changeSummary.onlyRequestInlineEdits = true;
                    }
                    else if (ctx.didChange(this._fetchSpecificProviderSignal)) {
                        changeSummary.provider = ctx.change?.provider;
                        changeSummary.changeHint = ctx.change?.changeHint;
                    }
                    return true;
                },
            },
        }, (reader, changeSummary) => {
            this._source.clearOperationOnTextModelChange.read(reader); // Make sure the clear operation runs before the fetch operation
            this._noDelaySignal.read(reader);
            this.dontRefetchSignal.read(reader);
            this._onlyRequestInlineEditsSignal.read(reader);
            this._forceUpdateExplicitlySignal.read(reader);
            this._fetchSpecificProviderSignal.read(reader);
            const shouldUpdate = ((this._enabled.read(reader) && this._selectedSuggestItem.read(reader)) || this._isActive.read(reader))
                && (!this._inlineCompletionsService.isSnoozing() || changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit);
            if (!shouldUpdate) {
                this._source.cancelUpdate();
                return undefined;
            }
            this._textModelVersionId.read(reader); // Refetch on text change
            const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(undefined);
            let suggestItem = this._selectedSuggestItem.read(reader);
            if (this._shouldShowOnSuggestConflict.read(undefined)) {
                suggestItem = undefined;
            }
            if (suggestWidgetInlineCompletions && !suggestItem) {
                this._source.seedInlineCompletionsWithSuggestWidget();
            }
            if (changeSummary.dontRefetch) {
                return Promise.resolve(true);
            }
            if (this._didUndoInlineEdits.read(reader) && changeSummary.inlineCompletionTriggerKind !== InlineCompletionTriggerKind.Explicit) {
                transaction(tx => {
                    this._source.clear(tx);
                });
                return undefined;
            }
            let reason = '';
            if (changeSummary.provider) {
                reason += 'providerOnDidChange';
            }
            else if (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit) {
                reason += 'explicit';
            }
            if (changeSummary.changeReason) {
                reason += reason.length > 0 ? `:${changeSummary.changeReason}` : changeSummary.changeReason;
            }
            const typingInterval = this._typing.getTypingInterval();
            const requestInfo = {
                editorType: this.editorType,
                startTime: Date.now(),
                languageId: this.textModel.getLanguageId(),
                reason,
                typingInterval: typingInterval.averageInterval,
                typingIntervalCharacterCount: typingInterval.characterCount,
                availableProviders: [],
                sku: this.sku.read(undefined),
            };
            let context = {
                triggerKind: changeSummary.inlineCompletionTriggerKind,
                selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo(),
                includeInlineCompletions: !changeSummary.onlyRequestInlineEdits,
                includeInlineEdits: this._inlineEditsEnabled.read(reader),
                requestIssuedDateTime: requestInfo.startTime,
                earliestShownDateTime: requestInfo.startTime + (changeSummary.inlineCompletionTriggerKind === InlineCompletionTriggerKind.Explicit || this.inAcceptFlow.read(undefined) ? 0 : this._minShowDelay.read(undefined)),
                changeHint: changeSummary.changeHint,
            };
            if (context.triggerKind === InlineCompletionTriggerKind.Automatic && changeSummary.textChange) {
                if (this.textModel.getAlternativeVersionId() === this._lastShownInlineCompletionInfo?.alternateTextModelVersionId) {
                    // When undoing back to a version where an inline edit/completion was shown,
                    // we want to show an inline edit (or completion) again if it was originally an inline edit (or completion).
                    context = {
                        ...context,
                        includeInlineCompletions: !this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit,
                        includeInlineEdits: this._lastShownInlineCompletionInfo.inlineCompletion.isInlineEdit,
                    };
                }
            }
            const itemToPreserveCandidate = this.selectedInlineCompletion.read(undefined) ?? this._inlineSuggestionItems.read(undefined)?.inlineEdit;
            const itemToPreserve = changeSummary.preserveCurrentCompletion || itemToPreserveCandidate?.forwardStable
                ? itemToPreserveCandidate : undefined;
            const userJumpedToActiveCompletion = this._jumpedToId.map(jumpedTo => !!jumpedTo && jumpedTo === this._inlineSuggestionItems.read(undefined)?.inlineEdit?.semanticId);
            const providers = changeSummary.provider
                ? { providers: [changeSummary.provider], label: 'single:' + changeSummary.provider.providerId?.toString() }
                : { providers: this._languageFeaturesService.inlineCompletionsProvider.all(this.textModel), label: undefined }; // TODO: should use inlineCompletionProviders
            const availableProviders = this.getAvailableProviders(providers.providers);
            requestInfo.availableProviders = availableProviders.map(p => p.providerId).filter(isDefined);
            return this._source.fetch(availableProviders, providers.label, context, itemToPreserve?.identity, changeSummary.shouldDebounce, userJumpedToActiveCompletion, requestInfo);
        });
        this._inlineSuggestionItems = derivedOpts({ owner: this }, reader => {
            const c = this._source.inlineCompletions.read(reader);
            if (!c) {
                return undefined;
            }
            const cursorPosition = this.primaryPosition.read(reader);
            let inlineEdit = undefined;
            const visibleCompletions = [];
            for (const completion of c.inlineCompletions) {
                if (!completion.isInlineEdit) {
                    if (completion.isVisible(this.textModel, cursorPosition)) {
                        visibleCompletions.push(completion);
                    }
                }
                else {
                    inlineEdit = completion;
                }
            }
            if (visibleCompletions.length !== 0) {
                // Don't show the inline edit if there is a visible completion
                inlineEdit = undefined;
            }
            return {
                inlineCompletions: visibleCompletions,
                inlineEdit,
            };
        });
        this._inlineCompletionItems = derivedOpts({ owner: this, equalsFn: arrayEqualsC() }, reader => {
            const c = this._inlineSuggestionItems.read(reader);
            return c?.inlineCompletions ?? [];
        });
        this.selectedInlineCompletionIndex = derived(this, (reader) => {
            const selectedInlineCompletionId = this._selectedInlineCompletionId.read(reader);
            const filteredCompletions = this._inlineCompletionItems.read(reader);
            const idx = this._selectedInlineCompletionId === undefined ? -1
                : filteredCompletions.findIndex(v => v.semanticId === selectedInlineCompletionId);
            if (idx === -1) {
                // Reset the selection so that the selection does not jump back when it appears again
                this._selectedInlineCompletionId.set(undefined, undefined);
                return 0;
            }
            return idx;
        });
        this.selectedInlineCompletion = derived(this, (reader) => {
            const filteredCompletions = this._inlineCompletionItems.read(reader);
            const idx = this.selectedInlineCompletionIndex.read(reader);
            return filteredCompletions[idx];
        });
        this.activeCommands = derivedOpts({ owner: this, equalsFn: arrayEqualsC() }, r => this.selectedInlineCompletion.read(r)?.source.inlineSuggestions.commands ?? []);
        this.inlineCompletionsCount = derived(this, reader => {
            if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
                return this._inlineCompletionItems.read(reader).length;
            }
            else {
                return undefined;
            }
        });
        this._hasVisiblePeekWidgets = derived(this, reader => this._editorObs.openedPeekWidgets.read(reader) > 0);
        this._shouldShowOnSuggestConflict = derived(this, reader => {
            const showOnSuggestConflict = this._showOnSuggestConflict.read(reader);
            if (showOnSuggestConflict !== 'never') {
                const hasInlineCompletion = !!this.selectedInlineCompletion.read(reader);
                if (hasInlineCompletion) {
                    const item = this._selectedSuggestItem.read(reader);
                    if (!item) {
                        return false;
                    }
                    if (showOnSuggestConflict === 'whenSuggestListIsIncomplete') {
                        return item.listIncomplete;
                    }
                    return true;
                }
            }
            return false;
        });
        this.state = derivedOpts({
            owner: this,
            equalsFn: (a, b) => {
                if (!a || !b) {
                    return a === b;
                }
                if (a.kind === 'ghostText' && b.kind === 'ghostText') {
                    return ghostTextsOrReplacementsEqual(a.ghostTexts, b.ghostTexts)
                        && a.inlineSuggestion === b.inlineSuggestion
                        && a.suggestItem === b.suggestItem;
                }
                else if (a.kind === 'inlineEdit' && b.kind === 'inlineEdit') {
                    return a.inlineSuggestion === b.inlineSuggestion;
                }
                return false;
            }
        }, (reader) => {
            const model = this.textModel;
            if (this._suppressInSnippetMode.read(reader) && this._isInSnippetMode.read(reader)) {
                return undefined;
            }
            const item = this._inlineSuggestionItems.read(reader);
            const inlineEditResult = item?.inlineEdit;
            if (inlineEditResult) {
                if (this._hasVisiblePeekWidgets.read(reader)) {
                    return undefined;
                }
                const cursorAtInlineEdit = this.primaryPosition.map(cursorPos => LineRange.fromRangeInclusive(inlineEditResult.targetRange).addMargin(1, 1).contains(cursorPos.lineNumber));
                const stringEdit = inlineEditResult.action?.kind === 'edit' ? inlineEditResult.action.stringEdit : undefined;
                const replacements = stringEdit ? TextEdit.fromStringEdit(stringEdit, new TextModelText(this.textModel)).replacements : [];
                let nextEditUri = (item.inlineEdit?.command?.id === 'vscode.open' || item.inlineEdit?.command?.id === '_workbench.open') &&
                    // eslint-disable-next-line local/code-no-any-casts
                    item.inlineEdit?.command.arguments?.length ? URI.from(item.inlineEdit?.command.arguments[0]) : undefined;
                if (!inlineEditResult.originalTextRef.targets(this.textModel)) {
                    nextEditUri = inlineEditResult.originalTextRef.uri;
                }
                return { kind: 'inlineEdit', inlineSuggestion: inlineEditResult, edits: replacements, cursorAtInlineEdit, nextEditUri };
            }
            const suggestItem = this._selectedSuggestItem.read(reader);
            if (!this._shouldShowOnSuggestConflict.read(reader) && suggestItem) {
                const suggestCompletionEdit = singleTextRemoveCommonPrefix(suggestItem.getSingleTextEdit(), model);
                const augmentation = this._computeAugmentation(suggestCompletionEdit, reader);
                const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
                if (!isSuggestionPreviewEnabled && !augmentation) {
                    return undefined;
                }
                const fullEdit = augmentation?.edit ?? suggestCompletionEdit;
                const fullEditPreviewLength = augmentation ? augmentation.edit.text.length - suggestCompletionEdit.text.length : 0;
                const mode = this._suggestPreviewMode.read(reader);
                const positions = this._positions.read(reader);
                const allPotentialEdits = [fullEdit, ...getSecondaryEdits(this.textModel, positions, fullEdit)];
                const validEditsAndGhostTexts = allPotentialEdits
                    .map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], fullEditPreviewLength) : undefined }))
                    .filter(({ edit, ghostText }) => edit !== undefined && ghostText !== undefined);
                const edits = validEditsAndGhostTexts.map(({ edit }) => edit);
                const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText);
                const primaryGhostText = ghostTexts[0] ?? new GhostText(fullEdit.range.endLineNumber, []);
                return { kind: 'ghostText', edits, primaryGhostText, ghostTexts, inlineSuggestion: augmentation?.completion, suggestItem };
            }
            else {
                if (!this._isActive.read(reader)) {
                    return undefined;
                }
                const inlineSuggestion = this.selectedInlineCompletion.read(reader);
                if (!inlineSuggestion) {
                    return undefined;
                }
                const replacement = inlineSuggestion.getSingleTextEdit();
                const mode = this._inlineSuggestMode.read(reader);
                const positions = this._positions.read(reader);
                const allPotentialEdits = [replacement, ...getSecondaryEdits(this.textModel, positions, replacement)];
                const validEditsAndGhostTexts = allPotentialEdits
                    .map((edit, idx) => ({ edit, ghostText: edit ? computeGhostText(edit, model, mode, positions[idx], 0) : undefined }))
                    .filter(({ edit, ghostText }) => edit !== undefined && ghostText !== undefined);
                const edits = validEditsAndGhostTexts.map(({ edit }) => edit);
                const ghostTexts = validEditsAndGhostTexts.map(({ ghostText }) => ghostText);
                if (!ghostTexts[0]) {
                    return undefined;
                }
                return { kind: 'ghostText', edits, primaryGhostText: ghostTexts[0], ghostTexts, inlineSuggestion, suggestItem: undefined };
            }
        });
        this.status = derived(this, reader => {
            if (this._source.loading.read(reader)) {
                return 'loading';
            }
            const s = this.state.read(reader);
            if (s?.kind === 'ghostText') {
                return 'ghostText';
            }
            if (s?.kind === 'inlineEdit') {
                return 'inlineEdit';
            }
            return 'noSuggestion';
        });
        this.inlineCompletionState = derived(this, reader => {
            const s = this.state.read(reader);
            if (!s || s.kind !== 'ghostText') {
                return undefined;
            }
            if (this._editorObs.inComposition.read(reader)) {
                return undefined;
            }
            return s;
        });
        this.inlineEditState = derived(this, reader => {
            const s = this.state.read(reader);
            if (!s || s.kind !== 'inlineEdit') {
                return undefined;
            }
            return s;
        });
        this.inlineEditAvailable = derived(this, reader => {
            const s = this.inlineEditState.read(reader);
            return !!s;
        });
        this.warning = derived(this, reader => {
            return this.inlineCompletionState.read(reader)?.inlineSuggestion?.warning;
        });
        this.ghostTexts = derivedOpts({ owner: this, equalsFn: ghostTextsOrReplacementsEqual }, reader => {
            const v = this.inlineCompletionState.read(reader);
            if (!v) {
                return undefined;
            }
            return v.ghostTexts;
        });
        this.primaryGhostText = derivedOpts({ owner: this, equalsFn: ghostTextOrReplacementEquals }, reader => {
            const v = this.inlineCompletionState.read(reader);
            if (!v) {
                return undefined;
            }
            return v?.primaryGhostText;
        });
        this.showCollapsed = derived(this, reader => {
            const state = this.state.read(reader);
            if (!state || state.kind !== 'inlineEdit') {
                return false;
            }
            if (state.inlineSuggestion.hint || state.inlineSuggestion.action?.kind === 'jumpTo') {
                return false;
            }
            const isCurrentModelVersion = state.inlineSuggestion.updatedEditModelVersion === this._textModelVersionId.read(reader);
            return (this._inlineEditsShowCollapsedEnabled.read(reader) || !isCurrentModelVersion)
                && this._jumpedToId.read(reader) !== state.inlineSuggestion.semanticId
                && !this._inAcceptFlow.read(reader);
        });
        this._tabShouldIndent = derived(this, reader => {
            if (this._inAcceptFlow.read(reader)) {
                return false;
            }
            function isMultiLine(range) {
                return range.startLineNumber !== range.endLineNumber;
            }
            function getNonIndentationRange(model, lineNumber) {
                const columnStart = model.getLineIndentColumn(lineNumber);
                const lastNonWsColumn = model.getLineLastNonWhitespaceColumn(lineNumber);
                const columnEnd = Math.max(lastNonWsColumn, columnStart);
                return new Range(lineNumber, columnStart, lineNumber, columnEnd);
            }
            const selections = this._editorObs.selections.read(reader);
            return selections?.some(s => {
                if (s.isEmpty()) {
                    return this.textModel.getLineLength(s.startLineNumber) === 0;
                }
                else {
                    return isMultiLine(s) || s.containsRange(getNonIndentationRange(this.textModel, s.startLineNumber));
                }
            });
        });
        this.tabShouldJumpToInlineEdit = derived(this, reader => {
            if (this._tabShouldIndent.read(reader)) {
                return false;
            }
            const s = this.inlineEditState.read(reader);
            if (!s) {
                return false;
            }
            if (s.inlineSuggestion.action?.kind === 'jumpTo') {
                return true;
            }
            if (this.showCollapsed.read(reader)) {
                return true;
            }
            if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
                return false;
            }
            return !s.cursorAtInlineEdit.read(reader);
        });
        this.tabShouldAcceptInlineEdit = derived(this, reader => {
            const s = this.inlineEditState.read(reader);
            if (!s) {
                return false;
            }
            if (s.inlineSuggestion.action?.kind === 'jumpTo') {
                return false;
            }
            if (this.showCollapsed.read(reader)) {
                return false;
            }
            if (this._tabShouldIndent.read(reader)) {
                return false;
            }
            if (this._inAcceptFlow.read(reader) && this._appearedInsideViewport.read(reader)) {
                return true;
            }
            if (s.inlineSuggestion.targetRange.startLineNumber === this._editorObs.cursorLineNumber.read(reader)) {
                return true;
            }
            if (this._jumpedToId.read(reader) === s.inlineSuggestion.semanticId) {
                return true;
            }
            return s.cursorAtInlineEdit.read(reader);
        });
        this._jumpedToId = observableValue(this, undefined);
        this._inAcceptFlow = observableValue(this, false);
        this.inAcceptFlow = this._inAcceptFlow;
        this._source = this._register(this._instantiationService.createInstance(InlineCompletionsSource, this.textModel, this._textModelVersionId, this._debounceValue, this.primaryPosition));
        this.lastTriggerKind = this._source.inlineCompletions.map(this, v => v?.request?.context.triggerKind);
        this._editorObs = observableCodeEditor(this._editor);
        const suggest = this._editorObs.getOption(134 /* EditorOption.suggest */);
        this._suggestPreviewEnabled = suggest.map(v => v.preview);
        this._suggestPreviewMode = suggest.map(v => v.previewMode);
        const inlineSuggest = this._editorObs.getOption(71 /* EditorOption.inlineSuggest */);
        this._inlineSuggestMode = inlineSuggest.map(v => v.mode);
        this._suppressedInlineCompletionGroupIds = inlineSuggest.map(v => new Set(v.experimental.suppressInlineSuggestions.split(',')));
        this._inlineEditsEnabled = inlineSuggest.map(v => !!v.edits.enabled);
        this._inlineEditsShowCollapsedEnabled = inlineSuggest.map(s => s.edits.showCollapsed);
        this._triggerCommandOnProviderChange = inlineSuggest.map(s => s.triggerCommandOnProviderChange);
        this._minShowDelay = inlineSuggest.map(s => s.minShowDelay);
        this._showOnSuggestConflict = inlineSuggest.map(s => s.experimental.showOnSuggestConflict);
        this._suppressInSnippetMode = inlineSuggest.map(s => s.suppressInSnippetMode);
        const snippetController = SnippetController2.get(this._editor);
        this._isInSnippetMode = snippetController?.isInSnippetObservable ?? constObservable(false);
        defaultAccountService.getDefaultAccount().then(createDisposableCb(account => this.sku.set(skuFromAccount(account), undefined), this._store));
        this._register(defaultAccountService.onDidChangeDefaultAccount(account => this.sku.set(skuFromAccount(account), undefined)));
        this._typing = this._register(new TypingInterval(this.textModel));
        this._register(this._inlineCompletionsService.onDidChangeIsSnoozing((isSnoozing) => {
            if (isSnoozing) {
                this.stop();
            }
        }));
        { // Determine editor type
            const isNotebook = this.textModel.uri.scheme === Schemas.vscodeNotebookCell;
            const [diffEditor] = this._codeEditorService.listDiffEditors()
                .filter(d => d.getOriginalEditor().getId() === this._editor.getId() ||
                d.getModifiedEditor().getId() === this._editor.getId());
            this.isInDiffEditor = !!diffEditor;
            this.editorType = isNotebook ? InlineCompletionEditorType.Notebook
                : this.isInDiffEditor ? InlineCompletionEditorType.DiffEditor
                    : InlineCompletionEditorType.TextEditor;
        }
        this._register(recomputeInitiallyAndOnChange(this.state, (s) => {
            if (s && s.inlineSuggestion) {
                this._inlineCompletionsService.reportNewCompletion(s.inlineSuggestion.requestUuid);
            }
        }));
        this._register(recomputeInitiallyAndOnChange(this._fetchInlineCompletionsPromise));
        this._register(autorun(reader => {
            this._editorObs.versionId.read(reader);
            this._inAcceptFlow.set(false, undefined);
        }));
        this._register(autorun(reader => {
            const jumpToReset = this.state.map((s, reader) => !s || s.kind === 'inlineEdit' && !s.cursorAtInlineEdit.read(reader)).read(reader);
            if (jumpToReset) {
                this._jumpedToId.set(undefined, undefined);
            }
        }));
        this._register(autorun(reader => {
            const inlineSuggestion = this.state.map(s => s?.inlineSuggestion).read(reader);
            if (inlineSuggestion) {
                inlineSuggestion.addPerformanceMarker('activeSuggestion');
            }
        }));
        const inlineEditSemanticId = this.inlineEditState.map(s => s?.inlineSuggestion.semanticId);
        this._register(autorun(reader => {
            const id = inlineEditSemanticId.read(reader);
            if (id) {
                this._editor.pushUndoStop();
                this._lastShownInlineCompletionInfo = {
                    alternateTextModelVersionId: this.textModel.getAlternativeVersionId(),
                    inlineCompletion: this.state.get().inlineSuggestion,
                };
            }
        }));
        // TODO: should use getAvailableProviders and update on _suppressedInlineCompletionGroupIds change
        const inlineCompletionProviders = observableFromEvent(this._languageFeaturesService.inlineCompletionsProvider.onDidChange, () => this._languageFeaturesService.inlineCompletionsProvider.all(textModel));
        mapObservableArrayCached(this, inlineCompletionProviders, (provider, store) => {
            if (!provider.onDidChangeInlineCompletions) {
                return;
            }
            store.add(provider.onDidChangeInlineCompletions(changeHint => {
                if (!this._enabled.get()) {
                    return;
                }
                // Only update the active editor
                const activeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
                if (activeEditor !== this._editor) {
                    return;
                }
                if (this._triggerCommandOnProviderChange.get()) {
                    // TODO@hediet remove this and always do the else branch.
                    this.trigger(undefined, { onlyFetchInlineEdits: true });
                    return;
                }
                // If there is an active suggestion from a different provider, we ignore the update
                const activeState = this.state.get();
                if (activeState && (activeState.inlineSuggestion || activeState.edits) && activeState.inlineSuggestion?.source.provider !== provider) {
                    return;
                }
                transaction(tx => {
                    this._fetchSpecificProviderSignal.trigger(tx, { provider, changeHint: changeHint ?? undefined });
                    this.trigger(tx);
                });
            }));
        }).recomputeInitiallyAndOnChange(this._store);
        this._didUndoInlineEdits.recomputeInitiallyAndOnChange(this._store);
    }
    debugGetSelectedSuggestItem() {
        return this._selectedSuggestItem;
    }
    getIndentationInfo(reader) {
        let startsWithIndentation = false;
        let startsWithIndentationLessThanTabSize = true;
        const ghostText = this?.primaryGhostText.read(reader);
        if (!!this?._selectedSuggestItem && ghostText && ghostText.parts.length > 0) {
            const { column, lines } = ghostText.parts[0];
            const firstLine = lines[0].line;
            const indentationEndColumn = this.textModel.getLineIndentColumn(ghostText.lineNumber);
            const inIndentation = column <= indentationEndColumn;
            if (inIndentation) {
                let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
                if (firstNonWsIdx === -1) {
                    firstNonWsIdx = firstLine.length - 1;
                }
                startsWithIndentation = firstNonWsIdx > 0;
                const tabSize = this.textModel.getOptions().tabSize;
                const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
                startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
            }
        }
        return {
            startsWithIndentation,
            startsWithIndentationLessThanTabSize,
        };
    }
    _getReason(e) {
        if (e?.isUndoing) {
            return VersionIdChangeReason.Undo;
        }
        if (e?.isRedoing) {
            return VersionIdChangeReason.Redo;
        }
        if (this.isAcceptingPartially) {
            return VersionIdChangeReason.AcceptWord;
        }
        return VersionIdChangeReason.Other;
    }
    // TODO: This is not an ideal implementation of excludesGroupIds, however as this is currently still behind proposed API
    // and due to the time constraints, we are using a simplified approach
    getAvailableProviders(providers) {
        const suppressedProviderGroupIds = this._suppressedInlineCompletionGroupIds.get();
        const unsuppressedProviders = providers.filter(provider => !(provider.groupId && suppressedProviderGroupIds.has(provider.groupId)));
        const excludedGroupIds = new Set();
        for (const provider of unsuppressedProviders) {
            provider.excludesGroupIds?.forEach(p => excludedGroupIds.add(p));
        }
        const availableProviders = [];
        for (const provider of unsuppressedProviders) {
            if (provider.groupId && excludedGroupIds.has(provider.groupId)) {
                continue;
            }
            availableProviders.push(provider);
        }
        return availableProviders;
    }
    async trigger(tx, options = {}) {
        subtransaction(tx, tx => {
            if (options.onlyFetchInlineEdits) {
                this._onlyRequestInlineEditsSignal.trigger(tx);
            }
            if (options.noDelay) {
                this._noDelaySignal.trigger(tx);
            }
            this._isActive.set(true, tx);
            if (options.explicit) {
                this._inAcceptFlow.set(true, tx);
                this._forceUpdateExplicitlySignal.trigger(tx);
            }
            if (options.provider) {
                this._fetchSpecificProviderSignal.trigger(tx, { provider: options.provider, changeHint: options.changeHint });
            }
        });
        await this._fetchInlineCompletionsPromise.get();
    }
    async triggerExplicitly(tx, onlyFetchInlineEdits = false) {
        return this.trigger(tx, { onlyFetchInlineEdits, explicit: true });
    }
    stop(stopReason = 'automatic', tx) {
        subtransaction(tx, tx => {
            if (stopReason === 'explicitCancel') {
                const inlineCompletion = this.state.get()?.inlineSuggestion;
                if (inlineCompletion) {
                    inlineCompletion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Rejected });
                }
            }
            this._isActive.set(false, tx);
            this._source.clear(tx);
        });
    }
    _computeAugmentation(suggestCompletion, reader) {
        const model = this.textModel;
        const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
        const candidateInlineCompletions = suggestWidgetInlineCompletions
            ? suggestWidgetInlineCompletions.inlineCompletions.filter(c => !c.isInlineEdit)
            : [this.selectedInlineCompletion.read(reader)].filter(isDefined);
        const augmentedCompletion = mapFindFirst(candidateInlineCompletions, completion => {
            let r = completion.getSingleTextEdit();
            r = singleTextRemoveCommonPrefix(r, model, Range.fromPositions(r.range.getStartPosition(), suggestCompletion.range.getEndPosition()));
            return singleTextEditAugments(r, suggestCompletion) ? { completion, edit: r } : undefined;
        });
        return augmentedCompletion;
    }
    async _deltaSelectedInlineCompletionIndex(delta) {
        await this.triggerExplicitly();
        const completions = this._inlineCompletionItems.get() || [];
        if (completions.length > 0) {
            const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
            this._selectedInlineCompletionId.set(completions[newIdx].semanticId, undefined);
        }
        else {
            this._selectedInlineCompletionId.set(undefined, undefined);
        }
    }
    async next() { await this._deltaSelectedInlineCompletionIndex(1); }
    async previous() { await this._deltaSelectedInlineCompletionIndex(-1); }
    _getMetadata(completion, languageId, type = undefined) {
        if (type) {
            return EditSources.inlineCompletionPartialAccept({
                nes: completion.isInlineEdit,
                requestUuid: completion.requestUuid,
                providerId: completion.source.provider.providerId,
                languageId,
                type,
                correlationId: completion.getSourceCompletion().correlationId,
            });
        }
        else {
            return EditSources.inlineCompletionAccept({
                nes: completion.isInlineEdit,
                requestUuid: completion.requestUuid,
                correlationId: completion.getSourceCompletion().correlationId,
                providerId: completion.source.provider.providerId,
                languageId
            });
        }
    }
    async accept(editor = this._editor, alternativeAction = false) {
        if (editor.getModel() !== this.textModel) {
            throw new BugIndicatingError();
        }
        let completion;
        let isNextEditUri = false;
        const state = this.state.get();
        if (state?.kind === 'ghostText') {
            if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
                return;
            }
            completion = state.inlineSuggestion;
        }
        else if (state?.kind === 'inlineEdit') {
            completion = state.inlineSuggestion;
            isNextEditUri = !!state.nextEditUri;
        }
        else {
            return;
        }
        // Make sure the completion list will not be disposed before the text change is sent.
        completion.addRef();
        try {
            let followUpTrigger = false;
            editor.pushUndoStop();
            if (!completion.originalTextRef.targets(this.textModel)) {
                // The edit targets a different document, open it and transplant the completion
                const targetEditor = await this._codeEditorService.openCodeEditor({ resource: completion.originalTextRef.uri }, this._editor);
                if (targetEditor) {
                    const controller = getInlineCompletionsController(targetEditor);
                    const m = controller?.model.get();
                    targetEditor.focus();
                    m?.transplantCompletion(completion);
                    targetEditor.revealLineInCenter(completion.targetRange.startLineNumber);
                }
            }
            else if (isNextEditUri) {
                // Do nothing
            }
            else if (completion.action?.kind === 'edit') {
                const action = completion.action;
                if (alternativeAction && action.alternativeAction) {
                    followUpTrigger = true;
                    const altCommand = action.alternativeAction.command;
                    await this._commandService
                        .executeCommand(altCommand.id, ...(altCommand.arguments || []))
                        .then(undefined, onUnexpectedExternalError);
                }
                else if (action.snippetInfo) {
                    const mainEdit = TextReplacement.delete(action.textReplacement.range);
                    const additionalEdits = completion.additionalTextEdits.map(e => new TextReplacement(Range.lift(e.range), e.text ?? ''));
                    const edit = TextEdit.fromParallelReplacementsUnsorted([mainEdit, ...additionalEdits]);
                    editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));
                    editor.setPosition(action.snippetInfo.range.getStartPosition(), 'inlineCompletionAccept');
                    SnippetController2.get(editor)?.insert(action.snippetInfo.snippet, { undoStopBefore: false });
                }
                else {
                    const edits = state.edits;
                    // The cursor should move to the end of the edit, not the end of the range provided by the extension
                    // Inline Edit diffs (human readable) the suggestion from the extension so it already removes common suffix/prefix
                    // Inline Completions does diff the suggestion so it may contain common suffix
                    let minimalEdits = edits;
                    if (state.kind === 'ghostText') {
                        minimalEdits = removeTextReplacementCommonSuffixPrefix(edits, this.textModel);
                    }
                    const selections = getEndPositionsAfterApplying(minimalEdits).map(p => Selection.fromPositions(p));
                    const additionalEdits = completion.additionalTextEdits.map(e => new TextReplacement(Range.lift(e.range), e.text ?? ''));
                    const edit = TextEdit.fromParallelReplacementsUnsorted([...edits, ...additionalEdits]);
                    editor.edit(edit, this._getMetadata(completion, this.textModel.getLanguageId()));
                    if (completion.hint === undefined) {
                        // do not move the cursor when the completion is displayed in a different location
                        editor.setSelections(state.kind === 'inlineEdit' ? selections.slice(-1) : selections, 'inlineCompletionAccept');
                    }
                    if (state.kind === 'inlineEdit' && !this._accessibilityService.isMotionReduced()) {
                        const editRanges = edit.getNewRanges();
                        const dec = this._store.add(new FadeoutDecoration(editor, editRanges, () => {
                            this._store.delete(dec);
                        }));
                    }
                }
            }
            this._onDidAccept.fire();
            // Reset before invoking the command, as the command might cause a follow up trigger (which we don't want to reset).
            this.stop();
            if (completion.command) {
                await this._commandService
                    .executeCommand(completion.command.id, ...(completion.command.arguments || []))
                    .then(undefined, onUnexpectedExternalError);
            }
            // TODO: how can we make alternative actions to retrigger?
            if (followUpTrigger) {
                this.trigger(undefined);
            }
            completion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction });
        }
        finally {
            completion.removeRef();
            this._inAcceptFlow.set(true, undefined);
            this._lastAcceptedInlineCompletionInfo = { textModelVersionIdAfter: this.textModel.getVersionId(), inlineCompletion: completion };
        }
    }
    async acceptNextWord() {
        await this._acceptNext(this._editor, 'word', (pos, text) => {
            const langId = this.textModel.getLanguageIdAtPosition(pos.lineNumber, pos.column);
            const config = this._languageConfigurationService.getLanguageConfiguration(langId);
            const wordRegExp = new RegExp(config.wordDefinition.source, config.wordDefinition.flags.replace('g', ''));
            const m1 = text.match(wordRegExp);
            let acceptUntilIndexExclusive = 0;
            if (m1 && m1.index !== undefined) {
                if (m1.index === 0) {
                    acceptUntilIndexExclusive = m1[0].length;
                }
                else {
                    acceptUntilIndexExclusive = m1.index;
                }
            }
            else {
                acceptUntilIndexExclusive = text.length;
            }
            const wsRegExp = /\s+/g;
            const m2 = wsRegExp.exec(text);
            if (m2 && m2.index !== undefined) {
                if (m2.index + m2[0].length < acceptUntilIndexExclusive) {
                    acceptUntilIndexExclusive = m2.index + m2[0].length;
                }
            }
            return acceptUntilIndexExclusive;
        }, 0 /* PartialAcceptTriggerKind.Word */);
    }
    async acceptNextLine() {
        await this._acceptNext(this._editor, 'line', (pos, text) => {
            const m = text.match(/\n/);
            if (m && m.index !== undefined) {
                return m.index + 1;
            }
            return text.length;
        }, 1 /* PartialAcceptTriggerKind.Line */);
    }
    async _acceptNext(editor, type, getAcceptUntilIndex, kind) {
        if (editor.getModel() !== this.textModel) {
            throw new BugIndicatingError();
        }
        const state = this.inlineCompletionState.get();
        if (!state || state.primaryGhostText.isEmpty() || !state.inlineSuggestion) {
            return;
        }
        const ghostText = state.primaryGhostText;
        const completion = state.inlineSuggestion;
        if (completion.snippetInfo) {
            // not in WYSIWYG mode, partial commit might change completion, thus it is not supported
            await this.accept(editor);
            return;
        }
        const firstPart = ghostText.parts[0];
        const ghostTextPos = new Position(ghostText.lineNumber, firstPart.column);
        const ghostTextVal = firstPart.text;
        const acceptUntilIndexExclusive = getAcceptUntilIndex(ghostTextPos, ghostTextVal);
        if (acceptUntilIndexExclusive === ghostTextVal.length && ghostText.parts.length === 1) {
            this.accept(editor);
            return;
        }
        const partialGhostTextVal = ghostTextVal.substring(0, acceptUntilIndexExclusive);
        const positions = this._positions.get();
        const cursorPosition = positions[0];
        // Executing the edit might free the completion, so we have to hold a reference on it.
        completion.addRef();
        try {
            this._isAcceptingPartially = true;
            try {
                editor.pushUndoStop();
                const replaceRange = Range.fromPositions(cursorPosition, ghostTextPos);
                const newText = editor.getModel().getValueInRange(replaceRange) + partialGhostTextVal;
                const primaryEdit = new TextReplacement(replaceRange, newText);
                const edits = [primaryEdit, ...getSecondaryEdits(this.textModel, positions, primaryEdit)].filter(isDefined);
                const selections = getEndPositionsAfterApplying(edits).map(p => Selection.fromPositions(p));
                editor.edit(TextEdit.fromParallelReplacementsUnsorted(edits), this._getMetadata(completion, type));
                editor.setSelections(selections, 'inlineCompletionPartialAccept');
                editor.revealPositionInCenterIfOutsideViewport(editor.getPosition(), 0 /* ScrollType.Smooth */);
            }
            finally {
                this._isAcceptingPartially = false;
            }
            const acceptedRange = Range.fromPositions(completion.editRange.getStartPosition(), TextLength.ofText(partialGhostTextVal).addToPosition(ghostTextPos));
            // This assumes that the inline completion and the model use the same EOL style.
            const text = editor.getModel().getValueInRange(acceptedRange, 1 /* EndOfLinePreference.LF */);
            const acceptedLength = text.length;
            completion.reportPartialAccept(acceptedLength, { kind, acceptedLength: acceptedLength }, { characters: acceptUntilIndexExclusive, ratio: acceptUntilIndexExclusive / ghostTextVal.length, count: 1 });
        }
        finally {
            completion.removeRef();
        }
    }
    handleSuggestAccepted(item) {
        const itemEdit = singleTextRemoveCommonPrefix(item.getSingleTextEdit(), this.textModel);
        const augmentedCompletion = this._computeAugmentation(itemEdit, undefined);
        if (!augmentedCompletion) {
            return;
        }
        // This assumes that the inline completion and the model use the same EOL style.
        const alreadyAcceptedLength = this.textModel.getValueInRange(augmentedCompletion.completion.editRange, 1 /* EndOfLinePreference.LF */).length;
        const acceptedLength = alreadyAcceptedLength + itemEdit.text.length;
        augmentedCompletion.completion.reportPartialAccept(itemEdit.text.length, {
            kind: 2 /* PartialAcceptTriggerKind.Suggest */,
            acceptedLength,
        }, {
            characters: itemEdit.text.length,
            count: 1,
            ratio: 1
        });
    }
    extractReproSample() {
        const value = this.textModel.getValue();
        const item = this.state.get()?.inlineSuggestion;
        return {
            documentValue: value,
            inlineCompletion: item?.getSourceCompletion(),
        };
    }
    jump() {
        const s = this.inlineEditState.get();
        if (!s) {
            return;
        }
        const suggestion = s.inlineSuggestion;
        if (!suggestion.originalTextRef.targets(this.textModel)) {
            this.accept(this._editor);
            return;
        }
        suggestion.addRef();
        try {
            transaction(tx => {
                if (suggestion.action?.kind === 'jumpTo') {
                    this.stop(undefined, tx);
                    suggestion.reportEndOfLife({ kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction: false });
                }
                this._jumpedToId.set(s.inlineSuggestion.semanticId, tx);
                this.dontRefetchSignal.trigger(tx);
                const targetRange = s.inlineSuggestion.targetRange;
                const targetPosition = targetRange.getStartPosition();
                this._editor.setPosition(targetPosition, 'inlineCompletions.jump');
                // TODO: consider using view information to reveal it
                const isSingleLineChange = targetRange.isSingleLine() && (s.inlineSuggestion.hint || (s.inlineSuggestion.action?.kind === 'edit' && !s.inlineSuggestion.action.textReplacement.text.includes('\n')));
                if (isSingleLineChange || s.inlineSuggestion.action?.kind === 'jumpTo') {
                    this._editor.revealPosition(targetPosition, 0 /* ScrollType.Smooth */);
                }
                else {
                    const revealRange = new Range(targetRange.startLineNumber - 1, 1, targetRange.endLineNumber + 1, 1);
                    this._editor.revealRange(revealRange, 0 /* ScrollType.Smooth */);
                }
                s.inlineSuggestion.identity.setJumpTo(tx);
                this._editor.focus();
            });
        }
        finally {
            suggestion.removeRef();
        }
    }
    async handleInlineSuggestionShown(inlineCompletion, viewKind, viewData, timeWhenShown) {
        await inlineCompletion.reportInlineEditShown(this._commandService, viewKind, viewData, this.textModel, timeWhenShown);
    }
    /**
     * Transplants an inline completion from another model to this one.
     * Used for cross-file inline edits.
     */
    transplantCompletion(item) {
        item.addRef();
        transaction(tx => {
            this._source.seedWithCompletion(item, tx);
            this._isActive.set(true, tx);
            this._inAcceptFlow.set(true, tx);
            this.dontRefetchSignal.trigger(tx);
        });
    }
};
InlineCompletionsModel = __decorate([
    __param(7, IInstantiationService),
    __param(8, ICommandService),
    __param(9, ILanguageConfigurationService),
    __param(10, IAccessibilityService),
    __param(11, ILanguageFeaturesService),
    __param(12, ICodeEditorService),
    __param(13, IInlineCompletionsService),
    __param(14, IDefaultAccountService)
], InlineCompletionsModel);
export { InlineCompletionsModel };
export var VersionIdChangeReason;
(function (VersionIdChangeReason) {
    VersionIdChangeReason[VersionIdChangeReason["Undo"] = 0] = "Undo";
    VersionIdChangeReason[VersionIdChangeReason["Redo"] = 1] = "Redo";
    VersionIdChangeReason[VersionIdChangeReason["AcceptWord"] = 2] = "AcceptWord";
    VersionIdChangeReason[VersionIdChangeReason["Other"] = 3] = "Other";
})(VersionIdChangeReason || (VersionIdChangeReason = {}));
export function getSecondaryEdits(textModel, positions, primaryTextRepl) {
    if (positions.length === 1) {
        // No secondary cursor positions
        return [];
    }
    const text = new TextModelText(textModel);
    const textTransformer = text.getTransformer();
    const primaryOffset = textTransformer.getOffset(positions[0]);
    const secondaryOffsets = positions.slice(1).map(pos => textTransformer.getOffset(pos));
    primaryTextRepl = primaryTextRepl.removeCommonPrefixAndSuffix(text);
    const primaryStringRepl = textTransformer.getStringReplacement(primaryTextRepl);
    const deltaFromOffsetToRangeStart = primaryStringRepl.replaceRange.start - primaryOffset;
    const primaryContextRange = primaryStringRepl.replaceRange.join(OffsetRange.emptyAt(primaryOffset));
    const primaryContextValue = text.getValueOfOffsetRange(primaryContextRange);
    const replacements = secondaryOffsets.map(secondaryOffset => {
        const newRangeStart = secondaryOffset + deltaFromOffsetToRangeStart;
        const newRangeEnd = newRangeStart + primaryStringRepl.replaceRange.length;
        const range = new OffsetRange(newRangeStart, newRangeEnd);
        const contextRange = range.join(OffsetRange.emptyAt(secondaryOffset));
        const contextValue = text.getValueOfOffsetRange(contextRange);
        if (contextValue !== primaryContextValue) {
            return undefined;
        }
        const stringRepl = new StringReplacement(range, primaryStringRepl.newText);
        const repl = textTransformer.getTextReplacement(stringRepl);
        return repl;
    }).filter(isDefined);
    return replacements;
}
class FadeoutDecoration extends Disposable {
    constructor(editor, ranges, onDispose) {
        super();
        if (onDispose) {
            this._register({ dispose: () => onDispose() });
        }
        this._register(observableCodeEditor(editor).setDecorations(constObservable(ranges.map(range => ({
            range: range,
            options: {
                description: 'animation',
                className: 'edits-fadeout-decoration',
                zIndex: 1,
            }
        })))));
        const animation = new AnimatedValue(1, 0, 1000, easeOutCubic);
        const val = new ObservableAnimatedValue(animation);
        this._register(autorun(reader => {
            const opacity = val.getValue(reader);
            editor.getContainerDomNode().style.setProperty('--animation-opacity', opacity.toString());
            if (animation.isFinished()) {
                this.dispose();
            }
        }));
    }
}
export function isSuggestionInViewport(editor, suggestion, reader = undefined) {
    const targetRange = suggestion.targetRange;
    // TODO make getVisibleRanges reactive!
    observableCodeEditor(editor).scrollTop.read(reader);
    const visibleRanges = editor.getVisibleRanges();
    if (visibleRanges.length < 1) {
        return false;
    }
    const viewportRange = new Range(visibleRanges[0].startLineNumber, visibleRanges[0].startColumn, visibleRanges[visibleRanges.length - 1].endLineNumber, visibleRanges[visibleRanges.length - 1].endColumn);
    return viewportRange.containsRange(targetRange);
}
function skuFromAccount(account) {
    if (account?.entitlementsData?.access_type_sku && account?.entitlementsData?.copilot_plan) {
        return { type: account.entitlementsData.access_type_sku, plan: account.entitlementsData.copilot_plan };
    }
    return undefined;
}
class DisposableCallback {
    constructor(cb) {
        this.handler = (val) => {
            return this._cb?.(val);
        };
        this._cb = cb;
    }
    dispose() {
        this._cb = undefined;
    }
}
function createDisposableCb(cb, store) {
    const dcb = new DisposableCallback(cb);
    store.add(dcb);
    return dcb.handler;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnNNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvbW9kZWwvaW5saW5lQ29tcGxldGlvbnNNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFtQixNQUFNLHlDQUF5QyxDQUFDO0FBQ3RGLE9BQU8sRUFBNkQsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLHdCQUF3QixFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSw2QkFBNkIsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDelUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztB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