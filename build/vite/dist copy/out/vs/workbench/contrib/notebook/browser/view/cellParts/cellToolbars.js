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
import * as DOM from '../../../../../../base/browser/dom.js';
import { ToolBar } from '../../../../../../base/browser/ui/toolbar/toolbar.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { createActionViewItem, getActionBarActions, MenuEntryActionViewItem } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { CodiconActionViewItem } from './cellActionView.js';
import { CellOverlayPart } from '../cellPart.js';
import { registerCellToolbarStickyScroll } from './cellToolbarStickyScroll.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
let BetweenCellToolbar = class BetweenCellToolbar extends CellOverlayPart {
    constructor(_notebookEditor, _titleToolbarContainer, _bottomCellToolbarContainer, instantiationService, contextMenuService, contextKeyService, menuService) {
        super();
        this._notebookEditor = _notebookEditor;
        this._bottomCellToolbarContainer = _bottomCellToolbarContainer;
        this.instantiationService = instantiationService;
        this.contextMenuService = contextMenuService;
        this.contextKeyService = contextKeyService;
        this.menuService = menuService;
    }
    _initialize() {
        if (this._betweenCellToolbar) {
            return this._betweenCellToolbar;
        }
        const betweenCellToolbar = this._register(new ToolBar(this._bottomCellToolbarContainer, this.contextMenuService, {
            actionViewItemProvider: (action, options) => {
                if (action instanceof MenuItemAction) {
                    if (this._notebookEditor.notebookOptions.getDisplayOptions().insertToolbarAlignment === 'center') {
                        return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
                    }
                    else {
                        return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
                    }
                }
                return undefined;
            }
        }));
        this._betweenCellToolbar = betweenCellToolbar;
        const menu = this._register(this.menuService.createMenu(this._notebookEditor.creationOptions.menuIds.cellInsertToolbar, this.contextKeyService));
        const updateActions = () => {
            const actions = getCellToolbarActions(menu);
            betweenCellToolbar.setActions(actions.primary, actions.secondary);
        };
        this._register(menu.onDidChange(() => updateActions()));
        this._register(this._notebookEditor.notebookOptions.onDidChangeOptions((e) => {
            if (e.insertToolbarAlignment) {
                updateActions();
            }
        }));
        updateActions();
        return betweenCellToolbar;
    }
    didRenderCell(element) {
        const betweenCellToolbar = this._initialize();
        if (this._notebookEditor.hasModel()) {
            betweenCellToolbar.context = {
                ui: true,
                cell: element,
                notebookEditor: this._notebookEditor,
                source: 'insertToolbar',
                $mid: 13 /* MarshalledId.NotebookCellActionContext */
            };
        }
        this.updateInternalLayoutNow(element);
    }
    updateInternalLayoutNow(element) {
        const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
        this._bottomCellToolbarContainer.style.transform = `translateY(${bottomToolbarOffset}px)`;
    }
};
BetweenCellToolbar = __decorate([
    __param(3, IInstantiationService),
    __param(4, IContextMenuService),
    __param(5, IContextKeyService),
    __param(6, IMenuService)
], BetweenCellToolbar);
export { BetweenCellToolbar };
let CellTitleToolbarPart = class CellTitleToolbarPart extends CellOverlayPart {
    get hasActions() {
        if (!this._model) {
            return false;
        }
        return this._model.actions.primary.length
            + this._model.actions.secondary.length
            + this._model.deleteActions.primary.length
            + this._model.deleteActions.secondary.length
            > 0;
    }
    constructor(toolbarContainer, _rootClassDelegate, toolbarId, deleteToolbarId, _notebookEditor, contextKeyService, menuService, instantiationService) {
        super();
        this.toolbarContainer = toolbarContainer;
        this._rootClassDelegate = _rootClassDelegate;
        this.toolbarId = toolbarId;
        this.deleteToolbarId = deleteToolbarId;
        this._notebookEditor = _notebookEditor;
        this.contextKeyService = contextKeyService;
        this.menuService = menuService;
        this.instantiationService = instantiationService;
        this._onDidUpdateActions = this._register(new Emitter());
        this.onDidUpdateActions = this._onDidUpdateActions.event;
    }
    _initializeModel() {
        if (this._model) {
            return this._model;
        }
        const titleMenu = this._register(this.menuService.createMenu(this.toolbarId, this.contextKeyService));
        const deleteMenu = this._register(this.menuService.createMenu(this.deleteToolbarId, this.contextKeyService));
        const actions = getCellToolbarActions(titleMenu);
        const deleteActions = getCellToolbarActions(deleteMenu);
        this._model = {
            titleMenu,
            actions,
            deleteMenu,
            deleteActions
        };
        return this._model;
    }
    _initialize(model, element) {
        if (this._view) {
            return this._view;
        }
        const hoverDelegate = this._register(createInstantHoverDelegate());
        const toolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, this.toolbarContainer, {
            actionViewItemProvider: (action, options) => {
                return createActionViewItem(this.instantiationService, action, options);
            },
            renderDropdownAsChildElement: true,
            hoverDelegate
        }));
        const deleteToolbar = this._register(this.instantiationService.invokeFunction(accessor => createDeleteToolbar(accessor, this.toolbarContainer, hoverDelegate, 'cell-delete-toolbar')));
        if (model.deleteActions.primary.length !== 0 || model.deleteActions.secondary.length !== 0) {
            deleteToolbar.setActions(model.deleteActions.primary, model.deleteActions.secondary);
        }
        this.setupChangeListeners(toolbar, model.titleMenu, model.actions);
        this.setupChangeListeners(deleteToolbar, model.deleteMenu, model.deleteActions);
        this._view = {
            toolbar,
            deleteToolbar
        };
        return this._view;
    }
    prepareRenderCell(element) {
        this._initializeModel();
    }
    didRenderCell(element) {
        const model = this._initializeModel();
        const view = this._initialize(model, element);
        this.cellDisposables.add(registerCellToolbarStickyScroll(this._notebookEditor, element, this.toolbarContainer, { extraOffset: 4, min: -14 }));
        if (this._notebookEditor.hasModel()) {
            const toolbarContext = {
                ui: true,
                cell: element,
                notebookEditor: this._notebookEditor,
                source: 'cellToolbar',
                $mid: 13 /* MarshalledId.NotebookCellActionContext */
            };
            this.updateContext(view, toolbarContext);
        }
    }
    updateContext(view, toolbarContext) {
        view.toolbar.context = toolbarContext;
        view.deleteToolbar.context = toolbarContext;
    }
    setupChangeListeners(toolbar, menu, initActions) {
        // #103926
        let dropdownIsVisible = false;
        let deferredUpdate;
        this.updateActions(toolbar, initActions);
        this._register(menu.onDidChange(() => {
            if (dropdownIsVisible) {
                const actions = getCellToolbarActions(menu);
                deferredUpdate = () => this.updateActions(toolbar, actions);
                return;
            }
            const actions = getCellToolbarActions(menu);
            this.updateActions(toolbar, actions);
        }));
        this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', false);
        this._register(toolbar.onDidChangeDropdownVisibility(visible => {
            dropdownIsVisible = visible;
            this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', visible);
            if (deferredUpdate && !visible) {
                disposableTimeout(() => {
                    deferredUpdate?.();
                }, 0, this._store);
                deferredUpdate = undefined;
            }
        }));
    }
    updateActions(toolbar, actions) {
        const hadFocus = DOM.isAncestorOfActiveElement(toolbar.getElement());
        toolbar.setActions(actions.primary, actions.secondary);
        if (hadFocus) {
            this._notebookEditor.focus();
        }
        if (actions.primary.length || actions.secondary.length) {
            this._rootClassDelegate.toggle('cell-has-toolbar-actions', true);
            this._onDidUpdateActions.fire();
        }
        else {
            this._rootClassDelegate.toggle('cell-has-toolbar-actions', false);
            this._onDidUpdateActions.fire();
        }
    }
};
CellTitleToolbarPart = __decorate([
    __param(5, IContextKeyService),
    __param(6, IMenuService),
    __param(7, IInstantiationService)
], CellTitleToolbarPart);
export { CellTitleToolbarPart };
function getCellToolbarActions(menu) {
    return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), g => /^inline/.test(g));
}
function createDeleteToolbar(accessor, container, hoverDelegate, elementClass) {
    const contextMenuService = accessor.get(IContextMenuService);
    const keybindingService = accessor.get(IKeybindingService);
    const instantiationService = accessor.get(IInstantiationService);
    const toolbar = new ToolBar(container, contextMenuService, {
        getKeyBinding: action => keybindingService.lookupKeybinding(action.id),
        actionViewItemProvider: (action, options) => {
            return createActionViewItem(instantiationService, action, options);
        },
        renderDropdownAsChildElement: true,
        hoverDelegate
    });
    if (elementClass) {
        toolbar.getElement().classList.add(elementClass);
    }
    return toolbar;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbFRvb2xiYXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L2NlbGxQYXJ0cy9jZWxsVG9vbGJhcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDM0UsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHdDQUF3QyxDQUFDO0FBR3hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxtQkFBbUIsRUFBRSx1QkFBdUIsRUFBOEIsTUFBTSx1RUFBdUUsQ0FBQztBQUN2TCxPQUFPLEVBQVMsWUFBWSxFQUFVLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ25ILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBR2hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNqRCxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsMEJBQTBCLEVBQUUs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