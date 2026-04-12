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
var InlineCompletionsController_1;
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { timeout } from '../../../../../base/common/async.js';
import { cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, derivedDisposable, derivedObservableWithCache, observableFromEvent, observableSignal, observableValue, runOnChange, runOnChangeWithStore, transaction, waitForState } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { isUndefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { hotClassGetOriginalInstance } from '../../../../../platform/observable/common/wrapInHotClass.js';
import { CoreEditingCommands } from '../../../../browser/coreCommands.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { TriggerInlineEditCommandsRegistry } from '../../../../browser/triggerInlineEditCommandsRegistry.js';
import { getOuterEditor } from '../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { Position } from '../../../../common/core/position.js';
import { ILanguageFeatureDebounceService } from '../../../../common/services/languageFeatureDebounce.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { FIND_IDS } from '../../../find/browser/findModel.js';
import { NextMarkerAction, NextMarkerInFilesAction, PrevMarkerAction, PrevMarkerInFilesAction } from '../../../gotoError/browser/gotoError.js';
import { InsertLineAfterAction, InsertLineBeforeAction } from '../../../linesOperations/browser/linesOperations.js';
import { InlineSuggestionHintsContentWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { TextModelChangeRecorder } from '../model/changeRecorder.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import { ObservableSuggestWidgetAdapter } from '../model/suggestWidgetAdapter.js';
import { ObservableContextKeyService } from '../utils.js';
import { InlineSuggestionsView } from '../view/inlineSuggestionsView.js';
import { inlineSuggestCommitId } from './commandIds.js';
import { setInlineCompletionsControllerGetter } from './common.js';
import { InlineCompletionContextKeys } from './inlineCompletionContextKeys.js';
setInlineCompletionsControllerGetter((editor) => InlineCompletionsController.get(editor));
let InlineCompletionsController = class InlineCompletionsController extends Disposable {
    static { InlineCompletionsController_1 = this; }
    static { this._instances = new Set(); }
    static { this.hot = createHotClass(this); }
    static { this.ID = 'editor.contrib.inlineCompletionsController'; }
    /**
     * Find the controller in the focused editor or in the outer editor (if applicable)
     */
    static getInFocusedEditorOrParent(accessor) {
        const outerEditor = getOuterEditor(accessor);
        if (!outerEditor) {
            return null;
        }
        return InlineCompletionsController_1.get(outerEditor);
    }
    static get(editor) {
        return hotClassGetOriginalInstance(editor.getContribution(InlineCompletionsController_1.ID));
    }
    constructor(editor, _instantiationService, _contextKeyService, _configurationService, _commandService, _debounceService, _languageFeaturesService, _accessibilitySignalService, _keybindingService, _accessibilityService) {
        super();
        this.editor = editor;
        this._instantiationService = _instantiationService;
        this._contextKeyService = _contextKeyService;
        this._configurationService = _configurationService;
        this._commandService = _commandService;
        this._debounceService = _debounceService;
        this._languageFeaturesService = _languageFeaturesService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._keybindingService = _keybindingService;
        this._accessibilityService = _accessibilityService;
        this._enabled = derived(this, reader => this._enabledInConfig.read(reader) && (!this._isScreenReaderEnabled.read(reader) || !this._editorDictationInProgress.read(reader)));
        this._focusIsInMenu = observableValue(this, false);
        this._focusIsInEditorOrMenu = derived(this, reader => {
            const editorHasFocus = this._editorObs.isFocused.read(reader);
            const menuHasFocus = this._focusIsInMenu.read(reader);
            return editorHasFocus || menuHasFocus;
        });
        this._cursorIsInIndentation = derived(this, reader => {
            const cursorPos = this._editorObs.cursorPosition.read(reader);
            if (cursorPos === null) {
                return false;
            }
            const model = this._editorObs.model.read(reader);
            if (!model) {
                return false;
            }
            this._editorObs.versionId.read(reader);
            const indentMaxColumn = model.getLineIndentColumn(cursorPos.lineNumber);
            return cursorPos.column <= indentMaxColumn;
        });
        this.model = derivedDisposable(this, reader => {
            if (this._editorObs.isReadonly.read(reader)) {
                return undefined;
            }
            const textModel = this._editorObs.model.read(reader);
            if (!textModel) {
                return undefined;
            }
            const model = this._instantiationService.createInstance(InlineCompletionsModel, textModel, this._suggestWidgetAdapter.selectedItem, this._editorObs.versionId, this._positions, this._debounceValue, this._enabled, this.editor);
            return model;
        });
        this._playAccessibilitySignal = observableSignal(this);
        this._view = derived(reader => reader.store.add(this._instantiationService.createInstance(InlineSuggestionsView.hot.read(reader), this.editor, this.model, this._focusIsInMenu)));
        this._editorObs = observableCodeEditor(this.editor);
        this._positions = derived(this, reader => this._editorObs.selections.read(reader)?.map(s => s.getEndPosition()) ?? [new Position(1, 1)]);
        this._suggestWidgetAdapter = this._register(new ObservableSuggestWidgetAdapter(this._editorObs, item => this.model.get()?.handleSuggestAccepted(item), () => this.model.get()?.selectedInlineCompletion.get()?.getSingleTextEdit()));
        this._enabledInConfig = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(71 /* EditorOption.inlineSuggest */).enabled);
        this._isScreenReaderEnabled = observableFromEvent(this, this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());
        this._editorDictationInProgress = observableFromEvent(this, this._contextKeyService.onDidChangeContext, () => this._contextKeyService.getContext(this.editor.getDomNode()).getValue('editorDictation.inProgress') === true);
        this._debounceValue = this._debounceService.for(this._languageFeaturesService.inlineCompletionsProvider, 'InlineCompletionsDebounce', { min: 50, max: 50 });
        this.model.recomputeInitiallyAndOnChange(this._store);
        this._hideInlineEditOnSelectionChange = this._editorObs.getOption(71 /* EditorOption.inlineSuggest */).map(val => true);
        this._view.recomputeInitiallyAndOnChange(this._store);
        InlineCompletionsController_1._instances.add(this);
        this._register(toDisposable(() => InlineCompletionsController_1._instances.delete(this)));
        this._register(autorun(reader => {
            // Cancel all other inline completions when a new one starts
            const model = this.model.read(reader);
            if (!model) {
                return;
            }
            const state = model.state.read(reader);
            if (!state) {
                return;
            }
            if (!this._focusIsInEditorOrMenu.read(undefined)) {
                return;
            }
            // This controller is in focus, hence reject others.
            // However if we display a NES that relates to another edit then trigger NES on that related controller
            const nextEditUri = state.kind === 'inlineEdit' ? state.nextEditUri : undefined;
            for (const ctrl of InlineCompletionsController_1._instances) {
                if (ctrl === this) {
                    continue;
                }
                else if (nextEditUri && isEqual(nextEditUri, ctrl.editor.getModel()?.uri)) {
                    // The next edit in other edito is related to this controller, trigger it.
                    ctrl.model.read(undefined)?.trigger();
                }
                else {
                    ctrl.reject();
                }
            }
        }));
        this._register(autorun(reader => {
            // Cancel all other inline completions when a new one starts
            const model = this.model.read(reader);
            const uri = this.editor.getModel()?.uri;
            if (!model || !uri) {
                return;
            }
            // This NES was accepted, its possible there is an NES that points to this editor.
            // I.e. there's an NES that reads `Go To Next Edit`,
            // If there is one that points to this editor, then we need to hide that as this NES was accepted.
            reader.store.add(model.onDidAccept(() => {
                for (const ctrl of InlineCompletionsController_1._instances) {
                    if (ctrl === this) {
                        continue;
                    }
                    // Find the nes from another editor that points to this.
                    const state = ctrl.model.read(undefined)?.state.read(undefined);
                    if (state?.kind === 'inlineEdit' && isEqual(state.nextEditUri, uri)) {
                        ctrl.model.read(undefined)?.stop('automatic');
                    }
                }
            }));
        }));
        this._register(runOnChange(this._editorObs.onDidType, (_value, _changes) => {
            if (this._enabled.get()) {
                this.model.get()?.trigger();
            }
        }));
        this._register(runOnChange(this._editorObs.onDidPaste, (_value, _changes) => {
            if (this._enabled.get()) {
                this.model.get()?.trigger();
            }
        }));
        // These commands don't trigger onDidType.
        const triggerCommands = new Set([
            CoreEditingCommands.Tab.id,
            CoreEditingCommands.DeleteLeft.id,
            CoreEditingCommands.DeleteRight.id,
            inlineSuggestCommitId,
            'acceptSelectedSuggestion',
            InsertLineAfterAction.ID,
            InsertLineBeforeAction.ID,
            FIND_IDS.NextMatchFindAction,
            NextMarkerAction.ID,
            PrevMarkerAction.ID,
            NextMarkerInFilesAction.ID,
            PrevMarkerInFilesAction.ID,
            ...TriggerInlineEditCommandsRegistry.getRegisteredCommands(),
        ]);
        this._register(this._commandService.onDidExecuteCommand((e) => {
            if (triggerCommands.has(e.commandId) && editor.hasTextFocus() && this._enabled.get()) {
                let noDelay = false;
                if (e.commandId === inlineSuggestCommitId) {
                    noDelay = true;
                }
                this._editorObs.forceUpdate(tx => {
                    /** @description onDidExecuteCommand */
                    this.model.get()?.trigger(tx, { noDelay });
                });
            }
        }));
        this._register(runOnChange(this._editorObs.selections, (_value, _, changes) => {
            if (changes.some(e => e.reason === 3 /* CursorChangeReason.Explicit */ || e.source === 'api')) {
                if (!this._hideInlineEditOnSelectionChange.get() && this.model.get()?.state.get()?.kind === 'inlineEdit') {
                    return;
                }
                const m = this.model.get();
                if (!m) {
                    return;
                }
                if (m.state.get()?.kind === 'ghostText') {
                    this.model.get()?.stop();
                }
            }
        }));
        this._register(autorun(reader => {
            const isFocused = this._focusIsInEditorOrMenu.read(reader);
            const model = this.model.read(undefined);
            if (isFocused) {
                // If this model already has an NES for another editor, then leave as is
                // Else stop other models.
                const state = model?.state.read(undefined);
                if (!state || state.kind !== 'inlineEdit' || !state.nextEditUri) {
                    transaction(tx => {
                        for (const ctrl of InlineCompletionsController_1._instances) {
                            if (ctrl !== this) {
                                ctrl.model.read(undefined)?.stop('automatic', tx);
                            }
                        }
                    });
                }
                return;
            }
            // This is a hidden setting very useful for debugging
            if (this._contextKeyService.getContextKeyValue('accessibleViewIsShown')
                || this._configurationService.getValue('editor.inlineSuggest.keepOnBlur')
                || editor.getOption(71 /* EditorOption.inlineSuggest */).keepOnBlur
                || InlineSuggestionHintsContentWidget.dropDownVisible) {
                return;
            }
            if (!model) {
                return;
            }
            if (model.state.read(undefined)?.inlineSuggestion?.isFromExplicitRequest && model.inlineEditAvailable.read(undefined)) {
                // dont hide inline edits on blur when requested explicitly
                return;
            }
            transaction(tx => {
                /** @description InlineCompletionsController.onDidBlurEditorWidget */
                model.stop('automatic', tx);
            });
        }));
        this._register(autorun(reader => {
            /** @description InlineCompletionsController.forceRenderingAbove */
            const state = this.model.read(reader)?.inlineCompletionState.read(reader);
            if (state?.suggestItem) {
                if (state.primaryGhostText.lineCount >= 2) {
                    this._suggestWidgetAdapter.forceRenderingAbove();
                }
            }
            else {
                this._suggestWidgetAdapter.stopForceRenderingAbove();
            }
        }));
        this._register(toDisposable(() => {
            this._suggestWidgetAdapter.stopForceRenderingAbove();
        }));
        const currentInlineCompletionBySemanticId = derivedObservableWithCache(this, (reader, last) => {
            const model = this.model.read(reader);
            const state = model?.state.read(reader);
            if (this._suggestWidgetAdapter.selectedItem.get()) {
                return last;
            }
            return state?.inlineSuggestion?.semanticId;
        });
        this._register(runOnChangeWithStore(derived(reader => {
            this._playAccessibilitySignal.read(reader);
            currentInlineCompletionBySemanticId.read(reader);
            return {};
        }), async (_value, _, _deltas, store) => {
            /** @description InlineCompletionsController.playAccessibilitySignalAndReadSuggestion */
            let model = this.model.get();
            let state = model?.state.get();
            if (!state || !model) {
                return;
            }
            await timeout(50, cancelOnDispose(store));
            await waitForState(this._suggestWidgetAdapter.selectedItem, isUndefined, () => false, cancelOnDispose(store));
            model = this.model.get();
            state = model?.state.get();
            if (!state || !model) {
                return;
            }
            const lineText = state.kind === 'ghostText' ? model.textModel.getLineContent(state.primaryGhostText.lineNumber) : '';
            this._accessibilitySignalService.playSignal(state.kind === 'ghostText' ? AccessibilitySignal.inlineSuggestion : AccessibilitySignal.nextEditSuggestion);
            if (this.editor.getOption(12 /* EditorOption.screenReaderAnnounceInlineSuggestion */)) {
                if (state.kind === 'ghostText') {
                    this._provideScreenReaderUpdate(state.primaryGhostText.renderForScreenReader(lineText));
                }
                else {
                    this._provideScreenReaderUpdate(''); // Only announce Alt+F2
                }
            }
        }));
        // TODO@hediet
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('accessibility.verbosity.inlineCompletions')) {
                this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });
            }
        }));
        this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });
        const contextKeySvcObs = new ObservableContextKeyService(this._contextKeyService);
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorInIndentation, this._cursorIsInIndentation));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.hasSelection, reader => !this._editorObs.cursorSelection.read(reader)?.isEmpty()));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorAtInlineEdit, this.model.map((m, reader) => m?.inlineEditState?.read(reader)?.cursorAtInlineEdit.read(reader))));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldAcceptInlineEdit, this.model.map((m, r) => !!m?.tabShouldAcceptInlineEdit.read(r))));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.tabShouldJumpToInlineEdit, this.model.map((m, r) => !!m?.tabShouldJumpToInlineEdit.read(r))));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineEditVisible, reader => this.model.read(reader)?.inlineEditState.read(reader) !== undefined));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionHasIndentation, reader => this.model.read(reader)?.getIndentationInfo(reader)?.startsWithIndentation));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize, reader => this.model.read(reader)?.getIndentationInfo(reader)?.startsWithIndentationLessThanTabSize));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.suppressSuggestions, reader => {
            const model = this.model.read(reader);
            const state = model?.inlineCompletionState.read(reader);
            return state?.primaryGhostText && state?.inlineSuggestion ? state.inlineSuggestion.source.inlineSuggestions.suppressSuggestions : undefined;
        }));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionAlternativeActionVisible, reader => {
            const model = this.model.read(reader);
            const state = model?.inlineEditState.read(reader);
            const action = state?.inlineSuggestion.action;
            return action && action.kind === 'edit' && action.alternativeAction !== undefined;
        }));
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.inlineSuggestionVisible, reader => {
            const model = this.model.read(reader);
            const state = model?.inlineCompletionState.read(reader);
            return !!state?.inlineSuggestion && state?.primaryGhostText !== undefined && !state?.primaryGhostText.isEmpty();
        }));
        const firstGhostTextPos = derived(this, reader => {
            const model = this.model.read(reader);
            const state = model?.inlineCompletionState.read(reader);
            const primaryGhostText = state?.primaryGhostText;
            if (!primaryGhostText || primaryGhostText.isEmpty()) {
                return undefined;
            }
            const firstPartPos = new Position(primaryGhostText.lineNumber, primaryGhostText.parts[0].column);
            return firstPartPos;
        });
        this._register(contextKeySvcObs.bind(InlineCompletionContextKeys.cursorBeforeGhostText, reader => {
            const firstPartPos = firstGhostTextPos.read(reader);
            if (!firstPartPos) {
                return false;
            }
            const cursorPos = this._editorObs.cursorPosition.read(reader);
            if (!cursorPos) {
                return false;
            }
            return firstPartPos.equals(cursorPos);
        }));
        this._register(this._instantiationService.createInstance(TextModelChangeRecorder, this.editor));
    }
    playAccessibilitySignal(tx) {
        this._playAccessibilitySignal.trigger(tx);
    }
    _provideScreenReaderUpdate(content) {
        const accessibleViewShowing = this._contextKeyService.getContextKeyValue('accessibleViewIsShown');
        const accessibleViewKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleView');
        let hint;
        if (!accessibleViewShowing && accessibleViewKeybinding && this.editor.getOption(169 /* EditorOption.inlineCompletionsAccessibilityVerbose */)) {
            hint = localize('showAccessibleViewHint', "Inspect this in the accessible view ({0})", accessibleViewKeybinding.getAriaLabel());
        }
        alert(hint ? content + ', ' + hint : content);
    }
    shouldShowHoverAt(range) {
        const ghostText = this.model.get()?.primaryGhostText.get();
        if (!ghostText) {
            return false;
        }
        return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
    }
    shouldShowHoverAtViewZone(viewZoneId) {
        return this._view.get().shouldShowHoverAtViewZone(viewZoneId);
    }
    reject() {
        transaction(tx => {
            const m = this.model.get();
            if (m) {
                m.stop('explicitCancel', tx);
                // Only if this controller is in focus can we cancel others.
                if (this._focusIsInEditorOrMenu.get()) {
                    for (const ctrl of InlineCompletionsController_1._instances) {
                        if (ctrl !== this && !ctrl._focusIsInEditorOrMenu.get()) {
                            ctrl.model.get()?.stop('automatic', tx);
                        }
                    }
                }
            }
        });
    }
    jump() {
        const m = this.model.get();
        if (m) {
            m.jump();
        }
    }
};
InlineCompletionsController = InlineCompletionsController_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IContextKeyService),
    __param(3, IConfigurationService),
    __param(4, ICommandService),
    __param(5, ILanguageFeatureDebounceService),
    __param(6, ILanguageFeaturesService),
    __param(7, IAccessibilitySignalService),
    __param(8, IKeybindingService),
    __param(9, IAccessibilityService)
], InlineCompletionsController);
export { InlineCompletionsController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDN0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkYsT0FBTyxFQUFnQixPQUFPLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLDBCQUEwQixFQUFFLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQy9QLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLG1GQUFtRixDQUFDO0FBQ3JKLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFB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