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
import { ToolBar } from '../../../../../../base/browser/ui/toolbar/toolbar.js';
import { Action } from '../../../../../../base/common/actions.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { localize } from '../../../../../../nls.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { InputFocusedContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { CellContentPart } from '../cellPart.js';
import { registerCellToolbarStickyScroll } from './cellToolbarStickyScroll.js';
import { NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_FOCUSED } from '../../../common/notebookContextKeys.js';
let RunToolbar = class RunToolbar extends CellContentPart {
    constructor(notebookEditor, contextKeyService, cellContainer, runButtonContainer, primaryMenuId, secondaryMenuId, menuService, keybindingService, contextMenuService, instantiationService) {
        super();
        this.notebookEditor = notebookEditor;
        this.contextKeyService = contextKeyService;
        this.cellContainer = cellContainer;
        this.runButtonContainer = runButtonContainer;
        this.keybindingService = keybindingService;
        this.contextMenuService = contextMenuService;
        this.instantiationService = instantiationService;
        this.primaryMenu = this._register(menuService.createMenu(primaryMenuId, contextKeyService));
        this.secondaryMenu = this._register(menuService.createMenu(secondaryMenuId, contextKeyService));
        this.createRunCellToolbar(runButtonContainer, cellContainer, contextKeyService);
        const updateActions = () => {
            const actions = this.getCellToolbarActions(this.primaryMenu);
            const primary = actions.primary[0]; // Only allow one primary action
            this.toolbar.setActions(primary ? [primary] : []);
        };
        updateActions();
        this._register(this.primaryMenu.onDidChange(updateActions));
        this._register(this.secondaryMenu.onDidChange(updateActions));
        this._register(this.notebookEditor.notebookOptions.onDidChangeOptions(updateActions));
    }
    didRenderCell(element) {
        this.cellDisposables.add(registerCellToolbarStickyScroll(this.notebookEditor, element, this.runButtonContainer));
        if (this.notebookEditor.hasModel()) {
            const context = {
                ui: true,
                cell: element,
                notebookEditor: this.notebookEditor,
                $mid: 13 /* MarshalledId.NotebookCellActionContext */
            };
            this.toolbar.context = context;
        }
    }
    getCellToolbarActions(menu) {
        return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), g => /^inline/.test(g));
    }
    createRunCellToolbar(container, cellContainer, contextKeyService) {
        const actionViewItemDisposables = this._register(new DisposableStore());
        const dropdownAction = this._register(new Action('notebook.moreRunActions', localize('notebook.moreRunActionsLabel', "More..."), 'codicon-chevron-down', true));
        const keybindingProvider = (action) => this.keybindingService.lookupKeybinding(action.id, executionContextKeyService);
        const executionContextKeyService = this._register(getCodeCellExecutionContextKeyService(contextKeyService));
        this.toolbar = this._register(new ToolBar(container, this.contextMenuService, {
            getKeyBinding: keybindingProvider,
            actionViewItemProvider: (_action, _options) => {
                actionViewItemDisposables.clear();
                const primary = this.getCellToolbarActions(this.primaryMenu).primary[0];
                if (!(primary instanceof MenuItemAction)) {
                    return undefined;
                }
                const secondary = this.getCellToolbarActions(this.secondaryMenu).secondary;
                if (!secondary.length) {
                    return undefined;
                }
                const item = this.instantiationService.createInstance(DropdownWithPrimaryActionViewItem, primary, dropdownAction, secondary, 'notebook-cell-run-toolbar', {
                    ..._options,
                    getKeyBinding: keybindingProvider
                });
                actionViewItemDisposables.add(item.onDidChangeDropdownVisibility(visible => {
                    cellContainer.classList.toggle('cell-run-toolbar-dropdown-active', visible);
                }));
                return item;
            },
            renderDropdownAsChildElement: true
        }));
    }
};
RunToolbar = __decorate([
    __param(6, IMenuService),
    __param(7, IKeybindingService),
    __param(8, IContextMenuService),
    __param(9, IInstantiationService)
], RunToolbar);
export { RunToolbar };
export function getCodeCellExecutionContextKeyService(contextKeyService) {
    // Create a fake ContextKeyService, and look up the keybindings within this context.
    const executionContextKeyService = contextKeyService.createScoped(document.createElement('div'));
    InputFocusedContext.bindTo(executionContextKeyService).set(true);
    EditorContextKeys.editorTextFocus.bindTo(executionContextKeyService).set(true);
    EditorContextKeys.focus.bindTo(executionContextKeyService).set(true);
    EditorContextKeys.textInputFocus.bindTo(executionContextKeyService).set(true);
    NOTEBOOK_CELL_EXECUTION_STATE.bindTo(executionContextKeyService).set('idle');
    NOTEBOOK_CELL_LIST_FOCUSED.bindTo(executionContextKeyService).set(true);
    NOTEBOOK_EDITOR_FOCUSED.bindTo(executionContextKeyService).set(true);
    NOTEBOOK_CELL_TYPE.bindTo(executionContextKeyService).set('code');
    return executionContextKeyService;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUNlbGxSdW5Ub29sYmFyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L2NlbGxQYXJ0cy9jb2RlQ2VsbFJ1blRvb2xiYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxNQUFNLEVBQVcsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFN0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDekYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLGlGQUFpRixDQUFDO0FBQ3BJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVFQUF1RSxDQUFDO0FBQzVHLE9BQU8sRUFBUyxZQUFZLEVBQVUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFbkgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDcEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ2pELE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9FLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSwwQkFBMEIsRUFB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