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
var CommonFindController_1;
import { alert as alertFn } from '../../../../base/browser/ui/aria/aria.js';
import { Delayer } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import { EditorAction, EditorCommand, MultiEditorAction, registerEditorAction, registerEditorCommand, registerEditorContribution, registerMultiEditorAction } from '../../../browser/editorExtensions.js';
import { overviewRulerRangeHighlight } from '../../../common/core/editorColorRegistry.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { OverviewRulerLane } from '../../../common/model.js';
import { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE, CONTEXT_REPLACE_INPUT_FOCUSED, FindModelBoundToEditorModel, FIND_IDS, ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleSearchScopeKeybinding, ToggleWholeWordKeybinding } from './findModel.js';
import { FindOptionsWidget } from './findOptionsWidget.js';
import { FindReplaceState } from './findState.js';
import { FindWidget, NLS_NO_RESULTS } from './findWidget.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { FindWidgetSearchHistory } from './findWidgetSearchHistory.js';
import { ReplaceWidgetHistory } from './replaceWidgetHistory.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
const SEARCH_STRING_MAX_LENGTH = 524288;
export function getSelectionSearchString(editor, seedSearchStringFromSelection = 'single', seedSearchStringFromNonEmptySelection = false) {
    if (!editor.hasModel()) {
        return null;
    }
    const selection = editor.getSelection();
    // if selection spans multiple lines, default search string to empty
    if ((seedSearchStringFromSelection === 'single' && selection.startLineNumber === selection.endLineNumber)
        || seedSearchStringFromSelection === 'multiple') {
        if (selection.isEmpty()) {
            const wordAtPosition = editor.getConfiguredWordAtPosition(selection.getStartPosition());
            if (wordAtPosition && (false === seedSearchStringFromNonEmptySelection)) {
                return wordAtPosition.word;
            }
        }
        else {
            if (editor.getModel().getValueLengthInRange(selection) < SEARCH_STRING_MAX_LENGTH) {
                return editor.getModel().getValueInRange(selection);
            }
        }
    }
    return null;
}
export var FindStartFocusAction;
(function (FindStartFocusAction) {
    FindStartFocusAction[FindStartFocusAction["NoFocusChange"] = 0] = "NoFocusChange";
    FindStartFocusAction[FindStartFocusAction["FocusFindInput"] = 1] = "FocusFindInput";
    FindStartFocusAction[FindStartFocusAction["FocusReplaceInput"] = 2] = "FocusReplaceInput";
})(FindStartFocusAction || (FindStartFocusAction = {}));
let CommonFindController = class CommonFindController extends Disposable {
    static { CommonFindController_1 = this; }
    static { this.ID = 'editor.contrib.findController'; }
    get editor() {
        return this._editor;
    }
    static get(editor) {
        return editor.getContribution(CommonFindController_1.ID);
    }
    constructor(editor, contextKeyService, storageService, clipboardService, notificationService, hoverService) {
        super();
        this._editor = editor;
        this._findWidgetVisible = CONTEXT_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
        this._contextKeyService = contextKeyService;
        this._storageService = storageService;
        this._clipboardService = clipboardService;
        this._notificationService = notificationService;
        this._hoverService = hoverService;
        this._updateHistoryDelayer = this._register(new Delayer(500));
        this._state = this._register(new FindReplaceState());
        this.loadQueryState();
        this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
        this._model = null;
        this._register(this._editor.onDidChangeModel(() => {
            const shouldRestartFind = (this._editor.getModel() && this._state.isRevealed);
            this.disposeModel();
            this._state.change({
                searchScope: null,
                matchCase: this._storageService.getBoolean('editor.matchCase', 1 /* StorageScope.WORKSPACE */, false),
                wholeWord: this._storageService.getBoolean('editor.wholeWord', 1 /* StorageScope.WORKSPACE */, false),
                isRegex: this._storageService.getBoolean('editor.isRegex', 1 /* StorageScope.WORKSPACE */, false),
                preserveCase: this._storageService.getBoolean('editor.preserveCase', 1 /* StorageScope.WORKSPACE */, false)
            }, false);
            if (shouldRestartFind) {
                this._start({
                    forceRevealReplace: false,
                    seedSearchStringFromSelection: 'none',
                    seedSearchStringFromNonEmptySelection: false,
                    seedSearchStringFromGlobalClipboard: false,
                    shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                    shouldAnimate: false,
                    updateSearchScope: false,
                    loop: this._editor.getOption(50 /* EditorOption.find */).loop
                });
            }
        }));
    }
    dispose() {
        this.disposeModel();
        super.dispose();
    }
    disposeModel() {
        if (this._model) {
            this._model.dispose();
            this._model = null;
        }
    }
    _onStateChanged(e) {
        this.saveQueryState(e);
        if (e.isRevealed) {
            if (this._state.isRevealed) {
                this._findWidgetVisible.set(true);
            }
            else {
                this._findWidgetVisible.reset();
                this.disposeModel();
            }
        }
        if (e.searchString) {
            this.setGlobalBufferTerm(this._state.searchString);
        }
    }
    saveQueryState(e) {
        if (e.isRegex) {
            this._storageService.store('editor.isRegex', this._state.actualIsRegex, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        if (e.wholeWord) {
            this._storageService.store('editor.wholeWord', this._state.actualWholeWord, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        if (e.matchCase) {
            this._storageService.store('editor.matchCase', this._state.actualMatchCase, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        if (e.preserveCase) {
            this._storageService.store('editor.preserveCase', this._state.actualPreserveCase, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
    }
    loadQueryState() {
        this._state.change({
            matchCase: this._storageService.getBoolean('editor.matchCase', 1 /* StorageScope.WORKSPACE */, this._state.matchCase),
            wholeWord: this._storageService.getBoolean('editor.wholeWord', 1 /* StorageScope.WORKSPACE */, this._state.wholeWord),
            isRegex: this._storageService.getBoolean('editor.isRegex', 1 /* StorageScope.WORKSPACE */, this._state.isRegex),
            preserveCase: this._storageService.getBoolean('editor.preserveCase', 1 /* StorageScope.WORKSPACE */, this._state.preserveCase)
        }, false);
    }
    isFindInputFocused() {
        return !!CONTEXT_FIND_INPUT_FOCUSED.getValue(this._contextKeyService);
    }
    /**
     * Returns whether the Replace input was the last focused input in the find widget.
     * Returns false by default; overridden in FindController.
     */
    wasReplaceInputLastFocused() {
        return false;
    }
    /**
     * Focuses the last focused element in the find widget.
     * Implemented by FindController; base implementation does nothing.
     */
    focusLastElement() {
        // Base implementation - overridden in FindController
    }
    getState() {
        return this._state;
    }
    closeFindWidget() {
        this._state.change({
            isRevealed: false,
            searchScope: null
        }, false);
        this._editor.focus();
    }
    toggleCaseSensitive() {
        this._state.change({ matchCase: !this._state.matchCase }, false);
        if (!this._state.isRevealed) {
            this.highlightFindOptions();
        }
    }
    toggleWholeWords() {
        this._state.change({ wholeWord: !this._state.wholeWord }, false);
        if (!this._state.isRevealed) {
            this.highlightFindOptions();
        }
    }
    toggleRegex() {
        this._state.change({ isRegex: !this._state.isRegex }, false);
        if (!this._state.isRevealed) {
            this.highlightFindOptions();
        }
    }
    togglePreserveCase() {
        this._state.change({ preserveCase: !this._state.preserveCase }, false);
        if (!this._state.isRevealed) {
            this.highlightFindOptions();
        }
    }
    toggleSearchScope() {
        if (this._state.searchScope) {
            this._state.change({ searchScope: null }, true);
        }
        else {
            if (this._editor.hasModel()) {
                let selections = this._editor.getSelections();
                selections = selections.map(selection => {
                    if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
                        selection = selection.setEndPosition(selection.endLineNumber - 1, this._editor.getModel().getLineMaxColumn(selection.endLineNumber - 1));
                    }
                    if (!selection.isEmpty()) {
                        return selection;
                    }
                    return null;
                }).filter((element) => !!element);
                if (selections.length) {
                    this._state.change({ searchScope: selections }, true);
                }
            }
        }
    }
    setSearchString(searchString) {
        if (this._state.isRegex) {
            searchString = strings.escapeRegExpCharacters(searchString);
        }
        this._state.change({ searchString: searchString }, false);
    }
    highlightFindOptions(ignoreWhenVisible = false) {
        // overwritten in subclass
    }
    async _start(opts, newState) {
        this.disposeModel();
        if (!this._editor.hasModel()) {
            // cannot do anything with an editor that doesn't have a model...
            return;
        }
        const stateChanges = {
            ...newState,
            isRevealed: true
        };
        if (opts.seedSearchStringFromSelection === 'single') {
            const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection, opts.seedSearchStringFromNonEmptySelection);
            if (selectionSearchString) {
                if (this._state.isRegex) {
                    stateChanges.searchString = strings.escapeRegExpCharacters(selectionSearchString);
                }
                else {
                    stateChanges.searchString = selectionSearchString;
                }
            }
        }
        else if (opts.seedSearchStringFromSelection === 'multiple' && !opts.updateSearchScope) {
            const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection);
            if (selectionSearchString) {
                stateChanges.searchString = selectionSearchString;
            }
        }
        if (!stateChanges.searchString && opts.seedSearchStringFromGlobalClipboard) {
            const selectionSearchString = await this.getGlobalBufferTerm();
            if (!this._editor.hasModel()) {
                // the editor has lost its model in the meantime
                return;
            }
            if (selectionSearchString) {
                stateChanges.searchString = selectionSearchString;
            }
        }
        // Overwrite isReplaceRevealed
        if (opts.forceRevealReplace || stateChanges.isReplaceRevealed) {
            stateChanges.isReplaceRevealed = true;
        }
        else if (!this._findWidgetVisible.get()) {
            stateChanges.isReplaceRevealed = false;
        }
        if (opts.updateSearchScope) {
            const currentSelections = this._editor.getSelections();
            if (currentSelections.some(selection => !selection.isEmpty())) {
                stateChanges.searchScope = currentSelections;
            }
        }
        stateChanges.loop = opts.loop;
        this._state.change(stateChanges, false);
        if (!this._model) {
            this._model = new FindModelBoundToEditorModel(this._editor, this._state);
        }
    }
    start(opts, newState) {
        return this._start(opts, newState);
    }
    moveToNextMatch() {
        if (this._model) {
            this._model.moveToNextMatch();
            return true;
        }
        return false;
    }
    moveToPrevMatch() {
        if (this._model) {
            this._model.moveToPrevMatch();
            return true;
        }
        return false;
    }
    goToMatch(index) {
        if (this._model) {
            this._model.moveToMatch(index);
            return true;
        }
        return false;
    }
    replace() {
        if (this._model) {
            this._model.replace();
            return true;
        }
        return false;
    }
    replaceAll() {
        if (this._model) {
            if (this._editor.getModel()?.isTooLargeForHeapOperation()) {
                this._notificationService.warn(nls.localize('too.large.for.replaceall', "The file is too large to perform a replace all operation."));
                return false;
            }
            this._model.replaceAll();
            return true;
        }
        return false;
    }
    selectAllMatches() {
        if (this._model) {
            this._model.selectAllMatches();
            this._editor.focus();
            return true;
        }
        return false;
    }
    async getGlobalBufferTerm() {
        if (this._editor.getOption(50 /* EditorOption.find */).globalFindClipboard
            && this._editor.hasModel()
            && !this._editor.getModel().isTooLargeForSyncing()) {
            return this._clipboardService.readFindText();
        }
        return '';
    }
    setGlobalBufferTerm(text) {
        if (this._editor.getOption(50 /* EditorOption.find */).globalFindClipboard
            && this._editor.hasModel()
            && !this._editor.getModel().isTooLargeForSyncing()) {
            // intentionally not awaited
            this._clipboardService.writeFindText(text);
        }
    }
};
CommonFindController = CommonFindController_1 = __decorate([
    __param(1, IContextKeyService),
    __param(2, IStorageService),
    __param(3, IClipboardService),
    __param(4, INotificationService),
    __param(5, IHoverService)
], CommonFindController);
export { CommonFindController };
let FindController = class FindController extends CommonFindController {
    constructor(editor, _contextViewService, _contextKeyService, _keybindingService, notificationService, _storageService, clipboardService, hoverService, _configurationService, _accessibilityService) {
        super(editor, _contextKeyService, _storageService, clipboardService, notificationService, hoverService);
        this._contextViewService = _contextViewService;
        this._keybindingService = _keybindingService;
        this._configurationService = _configurationService;
        this._accessibilityService = _accessibilityService;
        this._widget = null;
        this._findOptionsWidget = null;
        this._findWidgetSearchHistory = FindWidgetSearchHistory.getOrCreate(_storageService);
        this._replaceWidgetHistory = ReplaceWidgetHistory.getOrCreate(_storageService);
    }
    async _start(opts, newState) {
        if (!this._widget) {
            this._createFindWidget();
        }
        const selection = this._editor.getSelection();
        let updateSearchScope = false;
        switch (this._editor.getOption(50 /* EditorOption.find */).autoFindInSelection) {
            case 'always':
                updateSearchScope = true;
                break;
            case 'never':
                updateSearchScope = false;
                break;
            case 'multiline': {
                const isSelectionMultipleLine = !!selection && selection.startLineNumber !== selection.endLineNumber;
                updateSearchScope = isSelectionMultipleLine;
                break;
            }
            default:
                break;
        }
        opts.updateSearchScope = opts.updateSearchScope || updateSearchScope;
        await super._start(opts, newState);
        if (this._widget) {
            if (opts.shouldFocus === 2 /* FindStartFocusAction.FocusReplaceInput */) {
                this._widget.focusReplaceInput();
            }
            else if (opts.shouldFocus === 1 /* FindStartFocusAction.FocusFindInput */) {
                this._widget.focusFindInput();
            }
        }
    }
    highlightFindOptions(ignoreWhenVisible = false) {
        if (!this._widget) {
            this._createFindWidget();
        }
        if (this._state.isRevealed && !ignoreWhenVisible) {
            this._widget.highlightFindOptions();
        }
        else {
            this._findOptionsWidget.highlightFindOptions();
        }
    }
    _createFindWidget() {
        this._widget = this._register(new FindWidget(this._editor, this, this._state, this._contextViewService, this._keybindingService, this._contextKeyService, this._hoverService, this._findWidgetSearchHistory, this._replaceWidgetHistory, this._configurationService, this._accessibilityService));
        this._findOptionsWidget = this._register(new FindOptionsWidget(this._editor, this._state, this._keybindingService));
    }
    /**
     * Returns whether the Replace input was the last focused input in the find widget.
     */
    wasReplaceInputLastFocused() {
        return this._widget?.lastFocusedInputWasReplace ?? false;
    }
    /**
     * Focuses the last focused element in the find widget.
     * This is more precise than just focusing the Find or Replace input,
     * as it can restore focus to checkboxes, buttons, etc.
     */
    focusLastElement() {
        this._widget?.focusLastElement();
    }
    saveViewState() {
        return this._widget?.getViewState();
    }
    restoreViewState(state) {
        this._widget?.setViewState(state);
    }
};
FindController = __decorate([
    __param(1, IContextViewService),
    __param(2, IContextKeyService),
    __param(3, IKeybindingService),
    __param(4, INotificationService),
    __param(5, IStorageService),
    __param(6, IClipboardService),
    __param(7, IHoverService),
    __param(8, IConfigurationService),
    __param(9, IAccessibilityService)
], FindController);
export { FindController };
export const StartFindAction = registerMultiEditorAction(new MultiEditorAction({
    id: FIND_IDS.StartFindAction,
    label: nls.localize2('startFindAction', "Find"),
    precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has('editorIsOpen')),
    kbOpts: {
        kbExpr: null,
        primary: 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */,
        weight: 100 /* KeybindingWeight.EditorContrib */
    },
    menuOpts: {
        menuId: MenuId.MenubarEditMenu,
        group: '3_find',
        title: nls.localize({ key: 'miFind', comment: ['&& denotes a mnemonic'] }, "&&Find"),
        order: 1
    }
}));
StartFindAction.addImplementation(0, (accessor, editor, args) => {
    const controller = CommonFindController.get(editor);
    if (!controller) {
        return false;
    }
    return controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
        seedSearchStringFromNonEmptySelection: editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection === 'selection',
        seedSearchStringFromGlobalClipboard: editor.getOption(50 /* EditorOption.find */).globalFindClipboard,
        shouldFocus: 1 /* FindStartFocusAction.FocusFindInput */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(50 /* EditorOption.find */).loop
    });
});
const findArgDescription = {
    description: 'Open a new In-Editor Find Widget.',
    args: [{
            name: 'Open a new In-Editor Find Widget args',
            schema: {
                properties: {
                    searchString: { type: 'string' },
                    replaceString: { type: 'string' },
                    isRegex: { type: 'boolean' },
                    matchWholeWord: { type: 'boolean' },
                    isCaseSensitive: { type: 'boolean' },
                    preserveCase: { type: 'boolean' },
                    findInSelection: { type: 'boolean' },
                }
            }
        }]
};
export class StartFindWithArgsAction extends EditorAction {
    constructor() {
        super({
            id: FIND_IDS.StartFindWithArgs,
            label: nls.localize2('startFindWithArgsAction', "Find with Arguments"),
            precondition: undefined,
            kbOpts: {
                kbExpr: null,
                primary: 0,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: findArgDescription
        });
    }
    async run(accessor, editor, args) {
        const controller = CommonFindController.get(editor);
        if (controller) {
            const newState = args ? {
                searchString: args.searchString,
                replaceString: args.replaceString,
                isReplaceRevealed: args.replaceString !== undefined,
                isRegex: args.isRegex,
                // isRegexOverride: args.regexOverride,
                wholeWord: args.matchWholeWord,
                // wholeWordOverride: args.wholeWordOverride,
                matchCase: args.isCaseSensitive,
                // matchCaseOverride: args.matchCaseOverride,
                preserveCase: args.preserveCase,
                // preserveCaseOverride: args.preserveCaseOverride,
            } : {};
            await controller.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: (controller.getState().searchString.length === 0) && editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
                seedSearchStringFromNonEmptySelection: editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection === 'selection',
                seedSearchStringFromGlobalClipboard: true,
                shouldFocus: 1 /* FindStartFocusAction.FocusFindInput */,
                shouldAnimate: true,
                updateSearchScope: args?.findInSelection || false,
                loop: editor.getOption(50 /* EditorOption.find */).loop
            }, newState);
            controller.setGlobalBufferTerm(controller.getState().searchString);
        }
    }
}
export class StartFindWithSelectionAction extends EditorAction {
    constructor() {
        super({
            id: FIND_IDS.StartFindWithSelection,
            label: nls.localize2('startFindWithSelectionAction', "Find with Selection"),
            precondition: undefined,
            kbOpts: {
                kbExpr: null,
                primary: 0,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 35 /* KeyCode.KeyE */,
                },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    async run(accessor, editor) {
        const controller = CommonFindController.get(editor);
        if (controller) {
            await controller.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'multiple',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: true,
                updateSearchScope: false,
                loop: editor.getOption(50 /* EditorOption.find */).loop
            });
            controller.setGlobalBufferTerm(controller.getState().searchString);
        }
    }
}
export class MatchFindAction extends EditorAction {
    async run(accessor, editor) {
        const controller = CommonFindController.get(editor);
        if (controller && !this._run(controller)) {
            await controller.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: (controller.getState().searchString.length === 0) && editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
                seedSearchStringFromNonEmptySelection: editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection === 'selection',
                seedSearchStringFromGlobalClipboard: true,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: true,
                updateSearchScope: false,
                loop: editor.getOption(50 /* EditorOption.find */).loop
            });
            this._run(controller);
        }
    }
}
async function matchFindAction(editor, next) {
    const controller = CommonFindController.get(editor);
    if (!controller) {
        return;
    }
    const shouldCloseOnResult = editor.getOption(50 /* EditorOption.find */).closeOnResult;
    const wasFindWidgetVisible = controller.getState().isRevealed;
    const runMatch = () => {
        const previousSelection = controller.editor.getSelection();
        const result = next ? controller.moveToNextMatch() : controller.moveToPrevMatch();
        let landedOnMatch = false;
        if (result) {
            const currentSelection = controller.editor.getSelection();
            if (!previousSelection && currentSelection) {
                landedOnMatch = true;
            }
            else if (previousSelection && currentSelection && !previousSelection.equalsSelection(currentSelection)) {
                landedOnMatch = true;
            }
        }
        if (landedOnMatch) {
            controller.editor.pushUndoStop();
            if (shouldCloseOnResult && wasFindWidgetVisible && controller.isFindInputFocused()) {
                controller.closeFindWidget();
            }
            return true;
        }
        return false;
    };
    if (!runMatch()) {
        await controller.start({
            forceRevealReplace: false,
            seedSearchStringFromSelection: (controller.getState().searchString.length === 0) && editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never' ? 'single' : 'none',
            seedSearchStringFromNonEmptySelection: editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection === 'selection',
            seedSearchStringFromGlobalClipboard: true,
            shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
            shouldAnimate: true,
            updateSearchScope: false,
            loop: editor.getOption(50 /* EditorOption.find */).loop
        });
        if (!runMatch()) {
            // Re-announce "no results" for screen readers on explicit navigation (#301126)
            const state = controller.getState();
            if (wasFindWidgetVisible && state.matchesCount === 0 && state.searchString) {
                alertFn(nls.localize('ariaSearchNoResult', "{0} found for '{1}'", NLS_NO_RESULTS, state.searchString));
            }
        }
    }
}
export const NextMatchFindAction = registerMultiEditorAction(new MultiEditorAction({
    id: FIND_IDS.NextMatchFindAction,
    label: nls.localize2('findNextMatchAction', "Find Next"),
    precondition: undefined,
    kbOpts: [{
            kbExpr: EditorContextKeys.focus,
            primary: 61 /* KeyCode.F3 */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */, secondary: [61 /* KeyCode.F3 */] },
            weight: 100 /* KeybindingWeight.EditorContrib */
        }, {
            kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
            primary: 3 /* KeyCode.Enter */,
            weight: 100 /* KeybindingWeight.EditorContrib */
        }]
}));
NextMatchFindAction.addImplementation(0, async (accessor, editor, args) => {
    return matchFindAction(editor, true);
});
export const PreviousMatchFindAction = registerMultiEditorAction(new MultiEditorAction({
    id: FIND_IDS.PreviousMatchFindAction,
    label: nls.localize2('findPreviousMatchAction', "Find Previous"),
    precondition: undefined,
    kbOpts: [{
            kbExpr: EditorContextKeys.focus,
            primary: 1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */,
            mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */, secondary: [1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */] },
            weight: 100 /* KeybindingWeight.EditorContrib */
        }, {
            kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
            primary: 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
            weight: 100 /* KeybindingWeight.EditorContrib */
        }]
}));
PreviousMatchFindAction.addImplementation(0, async (accessor, editor, args) => {
    return matchFindAction(editor, false);
});
export class MoveToMatchFindAction extends EditorAction {
    constructor() {
        super({
            id: FIND_IDS.GoToMatchFindAction,
            label: nls.localize2('findMatchAction.goToMatch', "Go to Match..."),
            precondition: CONTEXT_FIND_WIDGET_VISIBLE
        });
        this._highlightDecorations = [];
    }
    run(accessor, editor) {
        const controller = CommonFindController.get(editor);
        if (!controller) {
            return;
        }
        const matchesCount = controller.getState().matchesCount;
        if (matchesCount < 1) {
            const notificationService = accessor.get(INotificationService);
            notificationService.notify({
                severity: Severity.Warning,
                message: nls.localize('findMatchAction.noResults', "No matches. Try searching for something else.")
            });
            return;
        }
        const quickInputService = accessor.get(IQuickInputService);
        const disposables = new DisposableStore();
        const inputBox = disposables.add(quickInputService.createInputBox());
        inputBox.placeholder = nls.localize('findMatchAction.inputPlaceHolder', "Type a number to go to a specific match (between 1 and {0})", matchesCount);
        const toFindMatchIndex = (value) => {
            const index = parseInt(value);
            if (isNaN(index)) {
                return undefined;
            }
            const matchCount = controller.getState().matchesCount;
            if (index > 0 && index <= matchCount) {
                return index - 1; // zero based
            }
            else if (index < 0 && index >= -matchCount) {
                return matchCount + index;
            }
            return undefined;
        };
        const updatePickerAndEditor = (value) => {
            const index = toFindMatchIndex(value);
            if (typeof index === 'number') {
                // valid
                inputBox.validationMessage = undefined;
                controller.goToMatch(index);
                const currentMatch = controller.getState().currentMatch;
                if (currentMatch) {
                    this.addDecorations(editor, currentMatch);
                }
            }
            else {
                inputBox.validationMessage = nls.localize('findMatchAction.inputValidationMessage', "Please type a number between 1 and {0}", controller.getState().matchesCount);
                this.clearDecorations(editor);
            }
        };
        disposables.add(inputBox.onDidChangeValue(value => {
            updatePickerAndEditor(value);
        }));
        disposables.add(inputBox.onDidAccept(() => {
            const index = toFindMatchIndex(inputBox.value);
            if (typeof index === 'number') {
                controller.goToMatch(index);
                inputBox.hide();
            }
            else {
                inputBox.validationMessage = nls.localize('findMatchAction.inputValidationMessage', "Please type a number between 1 and {0}", controller.getState().matchesCount);
            }
        }));
        disposables.add(inputBox.onDidHide(() => {
            this.clearDecorations(editor);
            disposables.dispose();
        }));
        inputBox.show();
    }
    clearDecorations(editor) {
        editor.changeDecorations(changeAccessor => {
            this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, []);
        });
    }
    addDecorations(editor, range) {
        editor.changeDecorations(changeAccessor => {
            this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, [
                {
                    range,
                    options: {
                        description: 'find-match-quick-access-range-highlight',
                        className: 'rangeHighlight',
                        isWholeLine: true
                    }
                },
                {
                    range,
                    options: {
                        description: 'find-match-quick-access-range-highlight-overview',
                        overviewRuler: {
                            color: themeColorFromId(overviewRulerRangeHighlight),
                            position: OverviewRulerLane.Full
                        }
                    }
                }
            ]);
        });
    }
}
export class SelectionMatchFindAction extends EditorAction {
    async run(accessor, editor) {
        const controller = CommonFindController.get(editor);
        if (!controller) {
            return;
        }
        const selectionSearchString = getSelectionSearchString(editor, 'single', false);
        if (selectionSearchString) {
            controller.setSearchString(selectionSearchString);
        }
        if (!this._run(controller)) {
            await controller.start({
                forceRevealReplace: false,
                seedSearchStringFromSelection: 'none',
                seedSearchStringFromNonEmptySelection: false,
                seedSearchStringFromGlobalClipboard: false,
                shouldFocus: 0 /* FindStartFocusAction.NoFocusChange */,
                shouldAnimate: true,
                updateSearchScope: false,
                loop: editor.getOption(50 /* EditorOption.find */).loop
            });
            this._run(controller);
        }
    }
}
export class NextSelectionMatchFindAction extends SelectionMatchFindAction {
    constructor() {
        super({
            id: FIND_IDS.NextSelectionMatchFindAction,
            label: nls.localize2('nextSelectionMatchFindAction', "Find Next Selection"),
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 61 /* KeyCode.F3 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    _run(controller) {
        return controller.moveToNextMatch();
    }
}
export class PreviousSelectionMatchFindAction extends SelectionMatchFindAction {
    constructor() {
        super({
            id: FIND_IDS.PreviousSelectionMatchFindAction,
            label: nls.localize2('previousSelectionMatchFindAction', "Find Previous Selection"),
            precondition: undefined,
            kbOpts: {
                kbExpr: EditorContextKeys.focus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    _run(controller) {
        return controller.moveToPrevMatch();
    }
}
export const StartFindReplaceAction = registerMultiEditorAction(new MultiEditorAction({
    id: FIND_IDS.StartFindReplaceAction,
    label: nls.localize2('startReplace', "Replace"),
    precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has('editorIsOpen')),
    kbOpts: {
        kbExpr: null,
        primary: 2048 /* KeyMod.CtrlCmd */ | 38 /* KeyCode.KeyH */,
        mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */ },
        weight: 100 /* KeybindingWeight.EditorContrib */
    },
    menuOpts: {
        menuId: MenuId.MenubarEditMenu,
        group: '3_find',
        title: nls.localize({ key: 'miReplace', comment: ['&& denotes a mnemonic'] }, "&&Replace"),
        order: 2
    }
}));
StartFindReplaceAction.addImplementation(0, (accessor, editor, args) => {
    if (!editor.hasModel() || editor.getOption(104 /* EditorOption.readOnly */)) {
        return false;
    }
    const controller = CommonFindController.get(editor);
    if (!controller) {
        return false;
    }
    const currentSelection = editor.getSelection();
    const findInputFocused = controller.isFindInputFocused();
    // we only seed search string from selection when the current selection is single line and not empty,
    // + the find input is not focused
    const seedSearchStringFromSelection = !currentSelection.isEmpty()
        && currentSelection.startLineNumber === currentSelection.endLineNumber
        && (editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never')
        && !findInputFocused;
    /*
    * if the existing search string in find widget is empty and we don't seed search string from selection, it means the Find Input is still empty, so we should focus the Find Input instead of Replace Input.

    * findInputFocused true -> seedSearchStringFromSelection false, FocusReplaceInput
    * findInputFocused false, seedSearchStringFromSelection true FocusReplaceInput
    * findInputFocused false seedSearchStringFromSelection false FocusFindInput
    */
    const shouldFocus = (findInputFocused || seedSearchStringFromSelection) ?
        2 /* FindStartFocusAction.FocusReplaceInput */ : 1 /* FindStartFocusAction.FocusFindInput */;
    return controller.start({
        forceRevealReplace: true,
        seedSearchStringFromSelection: seedSearchStringFromSelection ? 'single' : 'none',
        seedSearchStringFromNonEmptySelection: editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection === 'selection',
        seedSearchStringFromGlobalClipboard: editor.getOption(50 /* EditorOption.find */).seedSearchStringFromSelection !== 'never',
        shouldFocus: shouldFocus,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(50 /* EditorOption.find */).loop
    });
});
registerEditorContribution(CommonFindController.ID, FindController, 0 /* EditorContributionInstantiation.Eager */); // eager because it uses `saveViewState`/`restoreViewState`
registerEditorAction(StartFindWithArgsAction);
registerEditorAction(StartFindWithSelectionAction);
registerEditorAction(MoveToMatchFindAction);
registerEditorAction(NextSelectionMatchFindAction);
registerEditorAction(PreviousSelectionMatchFindAction);
const FindCommand = EditorCommand.bindToContribution(CommonFindController.get);
registerEditorCommand(new FindCommand({
    id: FIND_IDS.CloseFindWidgetCommand,
    precondition: CONTEXT_FIND_WIDGET_VISIBLE,
    handler: x => x.closeFindWidget(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, ContextKeyExpr.not('isComposing')),
        primary: 9 /* KeyCode.Escape */,
        secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */]
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ToggleCaseSensitiveCommand,
    precondition: undefined,
    handler: x => x.toggleCaseSensitive(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: ToggleCaseSensitiveKeybinding.primary,
        mac: ToggleCaseSensitiveKeybinding.mac,
        win: ToggleCaseSensitiveKeybinding.win,
        linux: ToggleCaseSensitiveKeybinding.linux
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ToggleWholeWordCommand,
    precondition: undefined,
    handler: x => x.toggleWholeWords(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: ToggleWholeWordKeybinding.primary,
        mac: ToggleWholeWordKeybinding.mac,
        win: ToggleWholeWordKeybinding.win,
        linux: ToggleWholeWordKeybinding.linux
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ToggleRegexCommand,
    precondition: undefined,
    handler: x => x.toggleRegex(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: ToggleRegexKeybinding.primary,
        mac: ToggleRegexKeybinding.mac,
        win: ToggleRegexKeybinding.win,
        linux: ToggleRegexKeybinding.linux
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ToggleSearchScopeCommand,
    precondition: undefined,
    handler: x => x.toggleSearchScope(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: ToggleSearchScopeKeybinding.primary,
        mac: ToggleSearchScopeKeybinding.mac,
        win: ToggleSearchScopeKeybinding.win,
        linux: ToggleSearchScopeKeybinding.linux
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.TogglePreserveCaseCommand,
    precondition: undefined,
    handler: x => x.togglePreserveCase(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: TogglePreserveCaseKeybinding.primary,
        mac: TogglePreserveCaseKeybinding.mac,
        win: TogglePreserveCaseKeybinding.win,
        linux: TogglePreserveCaseKeybinding.linux
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ReplaceOneAction,
    precondition: CONTEXT_FIND_WIDGET_VISIBLE,
    handler: x => x.replace(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 22 /* KeyCode.Digit1 */
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ReplaceOneAction,
    precondition: CONTEXT_FIND_WIDGET_VISIBLE,
    handler: x => x.replace(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED, EditorContextKeys.isComposing.negate()),
        primary: 3 /* KeyCode.Enter */
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ReplaceAllAction,
    precondition: CONTEXT_FIND_WIDGET_VISIBLE,
    handler: x => x.replaceAll(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.ReplaceAllAction,
    precondition: CONTEXT_FIND_WIDGET_VISIBLE,
    handler: x => x.replaceAll(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED),
        primary: undefined,
        mac: {
            primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
        }
    }
}));
registerEditorCommand(new FindCommand({
    id: FIND_IDS.SelectAllMatchesAction,
    precondition: CONTEXT_FIND_WIDGET_VISIBLE,
    handler: x => x.selectAllMatches(),
    kbOpts: {
        weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
        kbExpr: EditorContextKeys.focus,
        primary: 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */
    }
}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZENvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZENvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLElBQUksT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTNELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUU5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBbUMsaUJBQWlCLEVBQUUsb0JBQW9CLEVBQUUscUJBQXFCLEVBQUUsMEJBQTBCLEVBQUUseUJBQXlCLEVBQW9CLE1BQU0sc0NBQXNDLENBQUM7QUFFN1AsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHMUYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN0QsT0FBTyxFQUFFLDBCQUEwQixFQUFFLDJCQUEyQixFQUFFLDZCQUE2QixFQUFFLDJCQUEyQixFQUFFLFFBQVEsRUFBRSw2QkFBNkIsRUFBRSw0QkFBNEIsRUFBRSxxQkFBcUIsRUFBRSwyQkFBMkIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQzNTLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBRSxnQkFBZ0IsRUFBc0QsTUFBTSxnQkFBZ0IsQ0FBQztBQUN0RyxPQUFPLEVBQUUs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