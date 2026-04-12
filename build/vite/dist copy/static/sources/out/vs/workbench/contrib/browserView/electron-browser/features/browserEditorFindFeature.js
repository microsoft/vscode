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
import { localize, localize2 } from '../../../../../nls.js';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Emitter } from '../../../../../base/common/event.js';
import { BrowserViewCommandId } from '../../../../../platform/browserView/common/browserView.js';
import { SimpleFindWidget } from '../../../codeEditor/browser/find/simpleFindWidget.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { BrowserEditor, BrowserEditorContribution, CONTEXT_BROWSER_HAS_ERROR, CONTEXT_BROWSER_HAS_URL } from '../browserEditor.js';
import { BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';
const CONTEXT_BROWSER_FIND_WIDGET_VISIBLE = new RawContextKey('browserFindWidgetVisible', false, localize('browser.findWidgetVisible', "Whether the browser find widget is visible"));
const CONTEXT_BROWSER_FIND_WIDGET_FOCUSED = new RawContextKey('browserFindWidgetFocused', false, localize('browser.findWidgetFocused', "Whether the browser find widget is focused"));
/**
 * Find widget for the integrated browser view.
 * Uses the SimpleFindWidget base class and communicates with the browser view model
 * to perform find operations in the rendered web page.
 */
let BrowserFindWidget = class BrowserFindWidget extends SimpleFindWidget {
    constructor(container, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService) {
        super({
            showCommonFindToggles: true,
            checkImeCompletionState: true,
            showResultCount: true,
            enableSash: true,
            initialWidth: 350,
            previousMatchActionId: BrowserViewCommandId.FindPrevious,
            nextMatchActionId: BrowserViewCommandId.FindNext,
            closeWidgetActionId: BrowserViewCommandId.HideFind
        }, contextViewService, contextKeyService, hoverService, keybindingService, configurationService, accessibilityService);
        this._modelDisposables = this._register(new DisposableStore());
        this._hasFoundMatch = false;
        this._onDidChangeHeight = this._register(new Emitter());
        this.onDidChangeHeight = this._onDidChangeHeight.event;
        this._findWidgetVisible = CONTEXT_BROWSER_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
        this._findWidgetFocused = CONTEXT_BROWSER_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
        const domNode = this.getDomNode();
        container.appendChild(domNode);
        let lastHeight = domNode.offsetHeight;
        const resizeObserver = new (getWindow(container).ResizeObserver)(() => {
            const newHeight = domNode.offsetHeight;
            if (newHeight !== lastHeight) {
                lastHeight = newHeight;
                this._onDidChangeHeight.fire();
            }
        });
        resizeObserver.observe(domNode);
        this._register(toDisposable(() => resizeObserver.disconnect()));
    }
    /**
     * Set the browser view model to use for find operations.
     * This should be called whenever the editor input changes.
     */
    setModel(model) {
        this._modelDisposables.clear();
        this._model = model;
        this._lastFindResult = undefined;
        this._hasFoundMatch = false;
        if (model) {
            this._modelDisposables.add(model.onDidFindInPage(result => {
                this._lastFindResult = {
                    resultIndex: result.activeMatchOrdinal - 1, // Convert to 0-based index
                    resultCount: result.matches
                };
                this._hasFoundMatch = result.matches > 0;
                this.updateButtons(this._hasFoundMatch);
                this.updateResultCount();
            }));
            this._modelDisposables.add(model.onWillDispose(() => {
                this.setModel(undefined);
            }));
        }
    }
    reveal(initialInput) {
        const wasVisible = this.isVisible();
        super.reveal(initialInput);
        this._findWidgetVisible.set(true);
        // Focus the find input
        this.focusFindBox();
        // If there's existing input and the widget wasn't already visible, trigger a search
        if (this.inputValue && !wasVisible) {
            this._onInputChanged();
        }
    }
    hide() {
        super.hide(false);
        this._findWidgetVisible.reset();
        // Stop find and clear highlights in the browser view
        this._model?.stopFindInPage(true);
        this._model?.focus();
        this._lastFindResult = undefined;
        this._hasFoundMatch = false;
    }
    find(previous) {
        const value = this.inputValue;
        if (value && this._model) {
            this._model.findInPage(value, {
                forward: !previous,
                recompute: false,
                matchCase: this._getCaseSensitiveValue()
            });
        }
    }
    findFirst() {
        const value = this.inputValue;
        if (value && this._model) {
            this._model.findInPage(value, {
                forward: true,
                recompute: true,
                matchCase: this._getCaseSensitiveValue()
            });
        }
    }
    clear() {
        if (this._model) {
            this._model.stopFindInPage(false);
            this._lastFindResult = undefined;
            this._hasFoundMatch = false;
        }
    }
    _onInputChanged() {
        if (this.inputValue) {
            this.findFirst();
        }
        else if (this._model) {
            this.clear();
        }
        return false;
    }
    async _getResultCount() {
        return this._lastFindResult;
    }
    _onFocusTrackerFocus() {
        this._findWidgetFocused.set(true);
    }
    _onFocusTrackerBlur() {
        this._findWidgetFocused.reset();
    }
    _onFindInputFocusTrackerFocus() {
        // No-op
    }
    _onFindInputFocusTrackerBlur() {
        // No-op
    }
};
BrowserFindWidget = __decorate([
    __param(1, IContextViewService),
    __param(2, IContextKeyService),
    __param(3, IHoverService),
    __param(4, IKeybindingService),
    __param(5, IConfigurationService),
    __param(6, IAccessibilityService)
], BrowserFindWidget);
/**
 * Browser editor contribution that manages the find-in-page widget.
 *
 * Creates a container just below the toolbar and lazily instantiates the
 * {@link BrowserFindWidget}.  When the find widget's height changes the
 * browser container is re-laid-out so that the web-contents view stays in
 * sync.
 */
let BrowserEditorFindContribution = class BrowserEditorFindContribution extends BrowserEditorContribution {
    constructor(editor, instantiationService) {
        super(editor);
        this.instantiationService = instantiationService;
        this._findWidgetContainer = $('.browser-find-widget-wrapper');
        this._findWidget = new Lazy(() => {
            const findWidget = this.instantiationService.createInstance(BrowserFindWidget, this._findWidgetContainer);
            if (editor.model) {
                findWidget.setModel(editor.model);
            }
            findWidget.onDidChangeHeight(() => {
                editor.layoutBrowserContainer();
            });
            return findWidget;
        });
        this._register(toDisposable(() => this._findWidget.rawValue?.dispose()));
    }
    /**
     * The container element to insert below the toolbar.
     */
    get toolbarElements() {
        return [this._findWidgetContainer];
    }
    subscribeToModel(model, _store) {
        this._findWidget.rawValue?.setModel(model);
    }
    clear() {
        this._findWidget.rawValue?.setModel(undefined);
        this._findWidget.rawValue?.hide();
    }
    layout(width) {
        this._findWidget.rawValue?.layout(width);
    }
    /**
     * Show the find widget, optionally pre-populated with selected text from the browser view
     */
    async showFind() {
        const selectedText = (await this.editor.model?.getSelectedText())?.trim();
        const textToReveal = selectedText && !/[\r\n]/.test(selectedText) ? selectedText : undefined;
        this._findWidget.value.reveal(textToReveal);
        this._findWidget.value.layout(this._findWidgetContainer.clientWidth);
    }
    /**
     * Hide the find widget
     */
    hideFind() {
        this._findWidget.rawValue?.hide();
    }
    /**
     * Find the next match
     */
    findNext() {
        this._findWidget.rawValue?.find(false);
    }
    /**
     * Find the previous match
     */
    findPrevious() {
        this._findWidget.rawValue?.find(true);
    }
};
BrowserEditorFindContribution = __decorate([
    __param(1, IInstantiationService)
], BrowserEditorFindContribution);
export { BrowserEditorFindContribution };
BrowserEditor.registerContribution(BrowserEditorFindContribution);
// -- Actions ----------------------------------------------------------------
class ShowBrowserFindAction extends Action2 {
    static { this.ID = BrowserViewCommandId.ShowFind; }
    constructor() {
        super({
            id: ShowBrowserFindAction.ID,
            title: localize2('browser.showFindAction', 'Find in Page'),
            category: BrowserActionCategory,
            f1: true,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL, CONTEXT_BROWSER_HAS_ERROR.negate()),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Page,
                order: 1,
            },
            keybinding: {
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */
            }
        });
    }
    run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            void browserEditor.getContribution(BrowserEditorFindContribution)?.showFind();
        }
    }
}
class HideBrowserFindAction extends Action2 {
    static { this.ID = BrowserViewCommandId.HideFind; }
    constructor() {
        super({
            id: HideBrowserFindAction.ID,
            title: localize2('browser.hideFindAction', 'Close Find Widget'),
            category: BrowserActionCategory,
            f1: false,
            precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_FIND_WIDGET_VISIBLE),
            keybinding: {
                weight: 100 /* KeybindingWeight.EditorContrib */ + 5,
                primary: 9 /* KeyCode.Escape */
            }
        });
    }
    run(accessor) {
        const browserEditor = accessor.get(IEditorService).activeEditorPane;
        if (browserEditor instanceof BrowserEditor) {
            browserEditor.getContribution(BrowserEditorFindContribution)?.hideFind();
        }
    }
}
class BrowserFindNextAction extends Action2 {
    static { this.ID = BrowserViewCommandId.FindNext; }
    constructor() {
        super({
            id: BrowserFindNextAction.ID,
            title: localize2('browser.findNextAction', 'Find Next'),
            category: BrowserActionCategory,
            f1: false,
            precondition: BROWSER_EDITOR_ACTIVE,
            keybinding: [{
                    when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
                    weight: 100 /* KeybindingWeight.EditorContrib */,
                    primary: 3 /* KeyCode.Enter */
                }, {
                    when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
                    weight: 100 /* KeybindingWeight.EditorContrib */,
                    primary: 61 /* KeyCode.F3 */,
                    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 37 /* KeyCode.KeyG */ }
                }]
        });
    }
    run(accessor) {
        const browserEditor = accessor.get(IEditorService).activeEditorPane;
        if (browserEditor instanceof BrowserEditor) {
            browserEditor.getContribution(BrowserEditorFindContribution)?.findNext();
        }
    }
}
class BrowserFindPreviousAction extends Action2 {
    static { this.ID = BrowserViewCommandId.FindPrevious; }
    constructor() {
        super({
            id: BrowserFindPreviousAction.ID,
            title: localize2('browser.findPreviousAction', 'Find Previous'),
            category: BrowserActionCategory,
            f1: false,
            precondition: BROWSER_EDITOR_ACTIVE,
            keybinding: [{
                    when: CONTEXT_BROWSER_FIND_WIDGET_FOCUSED,
                    weight: 100 /* KeybindingWeight.EditorContrib */,
                    primary: 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */
                }, {
                    when: CONTEXT_BROWSER_FIND_WIDGET_VISIBLE,
                    weight: 100 /* KeybindingWeight.EditorContrib */,
                    primary: 1024 /* KeyMod.Shift */ | 61 /* KeyCode.F3 */,
                    mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */ }
                }]
        });
    }
    run(accessor) {
        const browserEditor = accessor.get(IEditorService).activeEditorPane;
        if (browserEditor instanceof BrowserEditor) {
            browserEditor.getContribution(BrowserEditorFindContribution)?.findPrevious();
        }
    }
}
registerAction2(ShowBrowserFindAction);
registerAction2(HideBrowserFindAction);
registerAction2(BrowserFindNextAction);
registerAction2(BrowserFindPreviousAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckVkaXRvckZpbmRGZWF0dXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci9mZWF0dXJlcy9icm93c2VyRWRpdG9yRmluZEZlYXR1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xFLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekksT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckcsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLCtEQUErRCxDQUFDO0FBR3hILE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFFckUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDakcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDeEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDakcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9B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