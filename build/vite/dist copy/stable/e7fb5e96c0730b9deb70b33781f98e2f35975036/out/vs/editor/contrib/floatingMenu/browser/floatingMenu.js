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
import { Separator } from '../../../../base/common/actions.js';
import { h } from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableFromEvent } from '../../../../base/common/observable.js';
import { getActionBarActions, MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { observableCodeEditor } from '../../../browser/observableCodeEditor.js';
let FloatingEditorToolbar = class FloatingEditorToolbar extends Disposable {
    static { this.ID = 'editor.contrib.floatingToolbar'; }
    constructor(editor, instantiationService, keybindingService, menuService) {
        super();
        const editorObs = this._register(observableCodeEditor(editor));
        const editorUriObs = derived(reader => editorObs.model.read(reader)?.uri);
        // Widget
        const widget = this._register(instantiationService.createInstance(FloatingEditorToolbarWidget, MenuId.EditorContent, editor.contextKeyService, editorUriObs));
        // Render widget
        this._register(autorun(reader => {
            const hasActions = widget.hasActions.read(reader);
            if (!hasActions) {
                return;
            }
            // Overlay widget
            reader.store.add(editorObs.createOverlayWidget({
                allowEditorOverflow: false,
                domNode: widget.element,
                minContentWidthInPx: constObservable(0),
                position: constObservable({
                    preference: 1 /* OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER */
                })
            }));
        }));
    }
};
FloatingEditorToolbar = __decorate([
    __param(1, IInstantiationService),
    __param(2, IKeybindingService),
    __param(3, IMenuService)
], FloatingEditorToolbar);
export { FloatingEditorToolbar };
let FloatingEditorToolbarWidget = class FloatingEditorToolbarWidget extends Disposable {
    constructor(_menuId, _scopedContextKeyService, _toolbarContext, instantiationService, keybindingService, menuService) {
        super();
        const menu = this._register(menuService.createMenu(_menuId, _scopedContextKeyService));
        const menuGroupsObs = observableFromEvent(this, menu.onDidChange, () => menu.getActions());
        const menuPrimaryActionsObs = derived(reader => {
            const menuGroups = menuGroupsObs.read(reader);
            const { primary } = getActionBarActions(menuGroups, () => true);
            return primary.filter(a => a.id !== Separator.ID);
        });
        this.hasActions = derived(reader => menuPrimaryActionsObs.read(reader).length > 0);
        this.element = h('div.floating-menu-overlay-widget').root;
        this._register(toDisposable(() => this.element.remove()));
        this._register(autorun(reader => {
            const primaryActions = menuPrimaryActionsObs.read(reader);
            const hasActions = primaryActions.length > 0;
            const menuPrimaryActionId = hasActions ? primaryActions[0].id : undefined;
            const isSingleButton = primaryActions.length === 1;
            this.element.classList.toggle('single-button', isSingleButton);
            // Set height explicitly to ensure that the floating menu element
            // is rendered in the lower right corner at the correct position.
            this.element.style.height = isSingleButton ? '28px' : '26px';
            if (!hasActions) {
                return;
            }
            // Toolbar
            const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, _menuId, {
                actionViewItemProvider: (action, options) => {
                    if (!(action instanceof MenuItemAction)) {
                        return undefined;
                    }
                    return instantiationService.createInstance(class extends MenuEntryActionViewItem {
                        render(container) {
                            super.render(container);
                            // Highlight primary action
                            if (action.id === menuPrimaryActionId) {
                                this.element?.classList.add('primary');
                            }
                        }
                        updateLabel() {
                            const keybinding = keybindingService.lookupKeybinding(action.id);
                            const keybindingLabel = keybinding ? keybinding.getLabel() : undefined;
                            if (this.options.label && this.label) {
                                this.label.textContent = keybindingLabel
                                    ? `${this._commandAction.label} (${keybindingLabel})`
                                    : this._commandAction.label;
                            }
                        }
                    }, action, { ...options, keybindingNotRenderedWithLabel: true });
                },
                hiddenItemStrategy: 0 /* HiddenItemStrategy.Ignore */,
                menuOptions: {
                    shouldForwardArgs: true
                },
                telemetrySource: 'editor.overlayToolbar',
                toolbarOptions: {
                    primaryGroup: () => true,
                    useSeparatorsInPrimaryActions: true
                },
            });
            reader.store.add(toolbar);
            reader.store.add(autorun(reader => {
                const context = _toolbarContext.read(reader);
                toolbar.context = context;
            }));
        }));
    }
};
FloatingEditorToolbarWidget = __decorate([
    __param(3, IInstantiationService),
    __param(4, IKeybindingService),
    __param(5, IMenuService)
], FloatingEditorToolbarWidget);
export { FloatingEditorToolbarWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmxvYXRpbmdNZW51LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZmxvYXRpbmdNZW51L2Jyb3dzZXIvZmxvYXRpbmdNZW51LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRixPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUU1SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMvSCxPQUFPLEVBQXNCLG9CQUFvQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDM0csT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFdEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFMUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFHekUsSUFBTSxxQkFBcUIsR0FBM0IsTUFBTSxxQkFBc0IsU0FBUSxVQUFVO2FBQ3BDLE9BQUUsR0FBRyxnQ0FBZ0MsQUFBbkMsQ0FBb0M7SUFFdEQsWUFDQyxNQUFtQixFQUNJLG9CQUEyQyxFQUM5QyxpQkFBcUMsRUFDM0MsV0FBeUI7UUFFdkMsS0FBSyxFQUFFLENBQUM7UUFFUixNQUFNLFNBQVMsR0FBRyxJ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