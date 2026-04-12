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
var InlineChatEditorAffordance_1;
import './media/inlineChatEditorAffordance.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { computeIndentLevel } from '../../../../editor/common/model/utils.js';
import { autorun } from '../../../../base/common/observable.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { quickFixCommandId } from '../../../../editor/contrib/codeAction/browser/codeAction.js';
import { CodeActionController } from '../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ACTION_START, ACTION_ASK_IN_CHAT } from '../common/inlineChat.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
let QuickFixActionViewItem = class QuickFixActionViewItem extends MenuEntryActionViewItem {
    constructor(action, _editor, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService, commandService) {
        const wrappedAction = new class extends MenuItemAction {
            constructor() {
                super(action.item, action.alt?.item, {}, action.hideActions, action.menuKeybinding, contextKeyService, commandService);
                this.elementGetter = () => undefined;
            }
            async run(...args) {
                const controller = CodeActionController.get(_editor);
                const info = controller?.lightBulbState.get();
                const element = this.elementGetter();
                if (controller && info && element) {
                    const { bottom, left } = element.getBoundingClientRect();
                    await controller.showCodeActions(info.trigger, info.actions, { x: left, y: bottom });
                }
            }
        };
        super(wrappedAction, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
        this._editor = _editor;
        this._lightBulbStore = this._store.add(new MutableDisposable());
        wrappedAction.elementGetter = () => this.element;
    }
    render(container) {
        super.render(container);
        this._updateFromLightBulb();
    }
    getTooltip() {
        return this._currentTitle ?? super.getTooltip();
    }
    _updateFromLightBulb() {
        const controller = CodeActionController.get(this._editor);
        if (!controller) {
            return;
        }
        const store = new DisposableStore();
        this._lightBulbStore.value = store;
        store.add(autorun(reader => {
            const info = controller.lightBulbState.read(reader);
            if (this.label) {
                // Update icon
                const icon = info?.icon ?? Codicon.lightBulb;
                const iconClasses = ThemeIcon.asClassNameArray(icon);
                this.label.className = '';
                this.label.classList.add('codicon', 'action-label', ...iconClasses);
            }
            // Update tooltip
            this._currentTitle = info?.title;
            this.updateTooltip();
        }));
    }
};
QuickFixActionViewItem = __decorate([
    __param(2, IKeybindingService),
    __param(3, INotificationService),
    __param(4, IContextKeyService),
    __param(5, IThemeService),
    __param(6, IContextMenuService),
    __param(7, IAccessibilityService),
    __param(8, ICommandService)
], QuickFixActionViewItem);
let LabelWithKeybindingActionViewItem = class LabelWithKeybindingActionViewItem extends MenuEntryActionViewItem {
    constructor(action, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService) {
        super(action, { draggable: false }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
        this.options.label = true;
        this.options.icon = false;
        this._kbLabel = keybindingService.lookupKeybinding(action.id)?.getLabel() ?? undefined;
    }
    updateLabel() {
        if (this.label) {
            dom.reset(this.label, this.action.label, ...(this._kbLabel ? [dom.$('span.inline-chat-keybinding', undefined, this._kbLabel)] : []));
        }
    }
};
LabelWithKeybindingActionViewItem = __decorate([
    __param(1, IKeybindingService),
    __param(2, INotificationService),
    __param(3, IContextKeyService),
    __param(4, IThemeService),
    __param(5, IContextMenuService),
    __param(6, IAccessibilityService)
], LabelWithKeybindingActionViewItem);
/**
 * Content widget that shows a small sparkle icon at the cursor position.
 * When clicked, it shows the overlay widget for inline chat.
 */
let InlineChatEditorAffordance = class InlineChatEditorAffordance extends Disposable {
    static { InlineChatEditorAffordance_1 = this; }
    static { this._idPool = 0; }
    constructor(_editor, selection, instantiationService) {
        super();
        this._editor = _editor;
        this._id = `inline-chat-content-widget-${InlineChatEditorAffordance_1._idPool++}`;
        this._position = null;
        this._isVisible = false;
        this._onDidRunAction = this._store.add(new Emitter());
        this.onDidRunAction = this._onDidRunAction.event;
        this.allowEditorOverflow = true;
        this.suppressMouseDown = false;
        // Create the widget DOM
        this._domNode = dom.$('.inline-chat-content-widget');
        // Create toolbar with the inline chat start action
        const toolbar = this._store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this._domNode, MenuId.InlineChatEditorAffordance, {
            telemetrySource: 'inlineChatEditorAffordance',
            hiddenItemStrategy: 0 /* HiddenItemStrategy.Ignore */,
            menuOptions: { renderShortTitle: true },
            toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
            actionViewItemProvider: (action) => {
                if (action instanceof MenuItemAction && action.id === quickFixCommandId) {
                    return instantiationService.createInstance(QuickFixActionViewItem, action, this._editor);
                }
                if (action instanceof MenuItemAction && (action.id === ACTION_START || action.id === ACTION_ASK_IN_CHAT || action.id === 'inlineChat.fixDiagnostics')) {
                    return instantiationService.createInstance(LabelWithKeybindingActionViewItem, action);
                }
                return undefined;
            }
        }));
        this._store.add(toolbar.actionRunner.onDidRun((e) => {
            this._onDidRunAction.fire(e.action.id);
            this._hide();
        }));
        this._store.add(autorun(r => {
            const sel = selection.read(r);
            if (sel) {
                this._show(sel);
            }
            else {
                this._hide();
            }
        }));
        this._store.add(this._editor.onDidScrollChange(() => {
            const sel = selection.get();
            if (!sel) {
                return;
            }
            const isInViewport = this._isPositionInViewport();
            if (isInViewport && !this._isVisible) {
                this._show(sel);
            }
            else if (!isInViewport && this._isVisible) {
                this._hide();
            }
        }));
    }
    _show(selection) {
        if (selection.isEmpty()) {
            this._showAtLineStart(selection.getPosition().lineNumber);
        }
        else {
            this._showAtSelection(selection);
        }
        if (this._isVisible) {
            this._editor.layoutContentWidget(this);
        }
        else {
            this._editor.addContentWidget(this);
            this._isVisible = true;
        }
    }
    _showAtSelection(selection) {
        const cursorPosition = selection.getPosition();
        const direction = selection.getDirection();
        const preference = direction === 1 /* SelectionDirection.RTL */
            ? 1 /* ContentWidgetPositionPreference.ABOVE */
            : 2 /* ContentWidgetPositionPreference.BELOW */;
        this._position = {
            position: cursorPosition,
            preference: [preference],
        };
    }
    _showAtLineStart(lineNumber) {
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        const tabSize = model.getOptions().tabSize;
        const fontInfo = this._editor.getOptions().get(59 /* EditorOption.fontInfo */);
        const lineContent = model.getLineContent(lineNumber);
        const indent = computeIndentLevel(lineContent, tabSize);
        const lineHasSpace = indent < 0 ? true : fontInfo.spaceWidth * indent > 22;
        let effectiveLineNumber = lineNumber;
        if (!lineHasSpace) {
            const isLineEmptyOrIndented = (ln) => {
                const content = model.getLineContent(ln);
                return /^\s*$|^\s+/.test(content);
            };
            const lineCount = model.getLineCount();
            if (lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1)) {
                effectiveLineNumber = lineNumber - 1;
            }
            else if (lineNumber < lineCount && isLineEmptyOrIndented(lineNumber + 1)) {
                effectiveLineNumber = lineNumber + 1;
            }
        }
        const effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;
        this._position = {
            position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
            preference: [0 /* ContentWidgetPositionPreference.EXACT */],
        };
    }
    _isPositionInViewport() {
        const widgetPosition = this._position?.position;
        if (!widgetPosition) {
            return false;
        }
        // Check vertical visibility
        const visibleRanges = this._editor.getVisibleRanges();
        const isLineVisible = visibleRanges.some(range => widgetPosition.lineNumber >= range.startLineNumber && widgetPosition.lineNumber <= range.endLineNumber);
        if (!isLineVisible) {
            return false;
        }
        // Check horizontal visibility
        const scrolledPos = this._editor.getScrolledVisiblePosition(widgetPosition);
        if (!scrolledPos) {
            return false;
        }
        const layoutInfo = this._editor.getOptions().get(165 /* EditorOption.layoutInfo */);
        return scrolledPos.left >= 0 && scrolledPos.left <= layoutInfo.width;
    }
    _hide() {
        if (this._isVisible) {
            this._isVisible = false;
            this._editor.removeContentWidget(this);
        }
    }
    getId() {
        return this._id;
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        return this._position;
    }
    beforeRender() {
        const position = this._editor.getPosition();
        const lineHeight = position ? this._editor.getLineHeightForPosition(position) : this._editor.getOption(75 /* EditorOption.lineHeight */);
        this._domNode.style.setProperty('--vscode-inline-chat-affordance-height', `${lineHeight}px`);
        return null;
    }
    dispose() {
        if (this._isVisible) {
            this._editor.removeContentWidget(this);
        }
        super.dispose();
    }
};
InlineChatEditorAffordance = InlineChatEditorAffordance_1 = __decorate([
    __param(2, IInstantiationService)
], InlineChatEditorAffordance);
export { InlineChatEditorAffordance };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sd0NBQXdDLENBQUM7QUFFaEQsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUlsRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFlLE1BQU0sdUNBQXVDLENBQUM7QUFDN0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RixPQUFPLEVBQXNCLG9CQUFvQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDM0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFFN0csT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDMUcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEw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