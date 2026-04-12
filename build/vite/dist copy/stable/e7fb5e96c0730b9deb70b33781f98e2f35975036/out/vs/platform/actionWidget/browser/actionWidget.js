var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../base/browser/dom.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import './actionWidget.css';
import { localize, localize2 } from '../../../nls.js';
import { acceptSelectedActionCommand, ActionList, previewSelectedActionCommand } from './actionList.js';
import { Action2, registerAction2 } from '../../actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../contextkey/common/contextkey.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { inputActiveOptionBackground, registerColor } from '../../theme/common/colorRegistry.js';
registerColor('actionBar.toggledBackground', inputActiveOptionBackground, localize('actionBar.toggledBackground', 'Background color for toggled action items in action bar.'));
const ActionWidgetContextKeys = {
    Visible: new RawContextKey('codeActionMenuVisible', false, localize('codeActionMenuVisible', "Whether the action widget list is visible")),
    FilterFocused: new RawContextKey('codeActionMenuFilterFocused', false, localize('codeActionMenuFilterFocused', "Whether the action widget filter input is focused")),
};
export const IActionWidgetService = createDecorator('actionWidgetService');
let ActionWidgetService = class ActionWidgetService extends Disposable {
    get isVisible() {
        return ActionWidgetContextKeys.Visible.getValue(this._contextKeyService) || false;
    }
    constructor(_contextViewService, _contextKeyService, _instantiationService) {
        super();
        this._contextViewService = _contextViewService;
        this._contextKeyService = _contextKeyService;
        this._instantiationService = _instantiationService;
        this._list = this._register(new MutableDisposable());
    }
    show(user, supportsPreview, items, delegate, anchor, container, actionBarActions, accessibilityProvider, listOptions) {
        const visibleContext = ActionWidgetContextKeys.Visible.bindTo(this._contextKeyService);
        const list = this._instantiationService.createInstance(ActionList, user, supportsPreview, items, delegate, accessibilityProvider, listOptions, anchor);
        this._contextViewService.showContextView({
            getAnchor: () => anchor,
            render: (container) => {
                visibleContext.set(true);
                return this._renderWidget(container, list, actionBarActions ?? []);
            },
            onHide: (didCancel) => {
                visibleContext.reset();
                this._onWidgetClosed(didCancel);
            },
            get anchorPosition() { return list.anchorPosition; },
        }, container, false);
    }
    acceptSelected(preview) {
        this._list.value?.acceptSelected(preview);
    }
    focusPrevious() {
        this._list?.value?.focusPrevious();
    }
    focusNext() {
        this._list?.value?.focusNext();
    }
    collapseSection() {
        this._list?.value?.collapseFocusedSection();
    }
    expandSection() {
        this._list?.value?.expandFocusedSection();
    }
    toggleSection() {
        return this._list?.value?.toggleFocusedSection() ?? false;
    }
    clearFilter() {
        return this._list?.value?.clearFilter() ?? false;
    }
    hide(didCancel) {
        this._list.value?.hide(didCancel);
        this._list.clear();
    }
    clear() {
        this._list.clear();
    }
    _renderWidget(element, list, actionBarActions) {
        const widget = document.createElement('div');
        widget.classList.add('action-widget');
        element.appendChild(widget);
        this._list.value = list;
        if (this._list.value) {
            if (this._list.value.filterContainer) {
                widget.appendChild(this._list.value.filterContainer);
            }
            widget.appendChild(this._list.value.domNode);
        }
        else {
            throw new Error('List has no value');
        }
        const renderDisposables = new DisposableStore();
        // Invisible div to block mouse interaction in the rest of the UI
        const menuBlock = document.createElement('div');
        const block = element.appendChild(menuBlock);
        block.classList.add('context-view-block');
        renderDisposables.add(dom.addDisposableListener(block, dom.EventType.MOUSE_DOWN, e => e.stopPropagation()));
        // Invisible div to block mouse interaction with the menu
        const pointerBlockDiv = document.createElement('div');
        const pointerBlock = element.appendChild(pointerBlockDiv);
        pointerBlock.classList.add('context-view-pointerBlock');
        // Removes block on click INSIDE widget or ANY mouse movement
        renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
        renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.MOUSE_DOWN, () => pointerBlock.remove()));
        // Action bar
        let actionBarWidth = 0;
        if (actionBarActions.length) {
            const actionBar = this._createActionBar('.action-widget-action-bar', actionBarActions);
            if (actionBar) {
                widget.appendChild(actionBar.getContainer().parentElement);
                renderDisposables.add(actionBar);
                actionBarWidth = actionBar.getContainer().offsetWidth;
            }
        }
        const width = this._list.value?.layout(actionBarWidth);
        widget.style.width = `${width}px`;
        this._list.value?.focus();
        // Track filter input focus state
        const filterFocusedContext = ActionWidgetContextKeys.FilterFocused.bindTo(this._contextKeyService);
        renderDisposables.add({ dispose: () => filterFocusedContext.reset() });
        if (this._list.value?.filterInput) {
            const filterInput = this._list.value.filterInput;
            renderDisposables.add(dom.addDisposableListener(filterInput, 'focus', () => filterFocusedContext.set(true)));
            renderDisposables.add(dom.addDisposableListener(filterInput, 'blur', () => filterFocusedContext.set(false)));
        }
        const focusTracker = renderDisposables.add(dom.trackFocus(element));
        renderDisposables.add(focusTracker.onDidBlur(() => {
            // Don't hide if focus moved to a hover or submenu that belongs to this action widget
            const activeElement = dom.getActiveElement();
            if (activeElement?.closest('.action-widget-hover') || activeElement?.closest('.action-list-submenu-panel')) {
                return;
            }
            this.hide(true);
        }));
        return renderDisposables;
    }
    _createActionBar(className, actions) {
        if (!actions.length) {
            return undefined;
        }
        const container = dom.$(className);
        const actionBar = new ActionBar(container);
        actionBar.push(actions, { icon: false, label: true });
        return actionBar;
    }
    _onWidgetClosed(didCancel) {
        this._list.value?.hide(didCancel);
    }
};
ActionWidgetService = __decorate([
    __param(0, IContextViewService),
    __param(1, IContextKeyService),
    __param(2, IInstantiationService)
], ActionWidgetService);
registerSingleton(IActionWidgetService, ActionWidgetService, 1 /* InstantiationType.Delayed */);
const weight = 100 /* KeybindingWeight.EditorContrib */ + 1000;
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'hideCodeActionWidget',
            title: localize2('hideCodeActionWidget.title', "Hide action widget"),
            precondition: ActionWidgetContextKeys.Visible,
            keybinding: {
                weight,
                primary: 9 /* KeyCode.Escape */,
                secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */]
            },
        });
    }
    run(accessor) {
        accessor.get(IActionWidgetService).hide(true);
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'clearFilterCodeActionWidget',
            title: localize2('clearFilterCodeActionWidget.title', "Clear action widget filter"),
            precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused),
            keybinding: {
                weight: weight + 1,
                primary: 9 /* KeyCode.Escape */,
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            if (!widgetService.clearFilter()) {
                widgetService.hide(true);
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'selectPrevCodeAction',
            title: localize2('selectPrevCodeAction.title', "Select previous action"),
            precondition: ActionWidgetContextKeys.Visible,
            keybinding: {
                weight,
                primary: 16 /* KeyCode.UpArrow */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */],
                mac: { primary: 16 /* KeyCode.UpArrow */, secondary: [2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */, 256 /* KeyMod.WinCtrl */ | 46 /* KeyCode.KeyP */] },
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            widgetService.focusPrevious();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'selectNextCodeAction',
            title: localize2('selectNextCodeAction.title', "Select next action"),
            precondition: ActionWidgetContextKeys.Visible,
            keybinding: {
                weight,
                primary: 18 /* KeyCode.DownArrow */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */],
                mac: { primary: 18 /* KeyCode.DownArrow */, secondary: [2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */, 256 /* KeyMod.WinCtrl */ | 44 /* KeyCode.KeyN */] }
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            widgetService.focusNext();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'collapseSectionCodeAction',
            title: localize2('collapseSectionCodeAction.title', "Collapse section"),
            precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
            keybinding: {
                weight,
                primary: 15 /* KeyCode.LeftArrow */,
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            widgetService.collapseSection();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'expandSectionCodeAction',
            title: localize2('expandSectionCodeAction.title', "Expand section"),
            precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
            keybinding: {
                weight,
                primary: 17 /* KeyCode.RightArrow */,
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            widgetService.expandSection();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'toggleSectionCodeAction',
            title: localize2('toggleSectionCodeAction.title', "Toggle section"),
            precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
            keybinding: {
                weight,
                primary: 10 /* KeyCode.Space */,
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            if (!widgetService.toggleSection()) {
                widgetService.acceptSelected();
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: acceptSelectedActionCommand,
            title: localize2('acceptSelected.title', "Accept selected action"),
            precondition: ActionWidgetContextKeys.Visible,
            keybinding: {
                weight,
                primary: 3 /* KeyCode.Enter */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */],
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            widgetService.acceptSelected();
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: previewSelectedActionCommand,
            title: localize2('previewSelected.title', "Preview selected action"),
            precondition: ActionWidgetContextKeys.Visible,
            keybinding: {
                weight,
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
            }
        });
    }
    run(accessor) {
        const widgetService = accessor.get(IActionWidgetService);
        if (widgetService instanceof ActionWidgetService) {
            widgetService.acceptSelected(true);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBSTVFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEgsT0FBTyxvQkFBb0IsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3RELE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxVQUFVLEVBQTRELDRCQUE0QixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDbEssT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQy9FLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDZDQUE2QyxDQUFDO0FBRXZILE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxhQUFhLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUlqRyxhQUFhLENBQ1osNkJBQTZCLEVBQzdCLDJCQUEyQixFQUMzQixRQUFRLENBQUMsNkJBQTZCLEVBQUUsMERBQTBELENBQUMsQ0FDbkcsQ0FBQztB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