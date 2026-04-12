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
import * as dom from '../../../../base/browser/dom.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalService, terminalEditorId } from './terminal.js';
import { getTerminalActionBarArgs } from './terminalMenus.js';
import { ITerminalProfileResolverService, ITerminalProfileService } from '../common/terminal.js';
import { openContextMenu } from './terminalContextMenu.js';
import { ACTIVE_GROUP } from '../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
let TerminalEditor = class TerminalEditor extends EditorPane {
    constructor(group, telemetryService, themeService, storageService, _terminalEditorService, _terminalProfileResolverService, _terminalService, _terminalConfigurationService, contextKeyService, menuService, _instantiationService, _contextMenuService, _terminalProfileService, _workbenchLayoutService) {
        super(terminalEditorId, group, telemetryService, themeService, storageService);
        this._terminalEditorService = _terminalEditorService;
        this._terminalProfileResolverService = _terminalProfileResolverService;
        this._terminalService = _terminalService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._instantiationService = _instantiationService;
        this._contextMenuService = _contextMenuService;
        this._terminalProfileService = _terminalProfileService;
        this._workbenchLayoutService = _workbenchLayoutService;
        this._editorInput = undefined;
        this._cancelContextMenu = false;
        this._newDropdown = this._register(new MutableDisposable());
        this._sessionDisposables = this._register(new DisposableStore());
        this._disposableStore = this._register(new DisposableStore());
        this._dropdownMenu = this._register(menuService.createMenu(MenuId.TerminalNewDropdownContext, contextKeyService));
        this._instanceMenu = this._register(menuService.createMenu(MenuId.TerminalInstanceContext, contextKeyService));
        this._register(this._terminalProfileService.onDidChangeAvailableProfiles(profiles => this._updateTabActionBar(profiles)));
    }
    async setInput(newInput, options, context, token) {
        this._editorInput?.terminalInstance?.detachFromElement();
        this._editorInput = newInput;
        await super.setInput(newInput, options, context, token);
        this._editorInput.terminalInstance?.attachToElement(this._overflowGuardElement);
        if (this._lastDimension) {
            this.layout(this._lastDimension);
        }
        this._editorInput.terminalInstance?.setVisible(this.isVisible() && this._workbenchLayoutService.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, this.window));
        if (this._editorInput.terminalInstance) {
            // since the editor does not monitor focus changes, for ex. between the terminal
            // panel and the editors, this is needed so that the active instance gets set
            // when focus changes between them.
            this._sessionDisposables.add(this._editorInput.terminalInstance.onDidFocus(() => this._setActiveInstance()));
            this._editorInput.setCopyLaunchConfig(this._editorInput.terminalInstance.shellLaunchConfig);
        }
    }
    clearInput() {
        super.clearInput();
        this._sessionDisposables.clear();
        if (this._overflowGuardElement && this._editorInput?.terminalInstance?.domElement.parentElement === this._overflowGuardElement) {
            this._editorInput.terminalInstance?.detachFromElement();
        }
        this._editorInput = undefined;
    }
    _setActiveInstance() {
        if (!this._editorInput?.terminalInstance) {
            return;
        }
        this._terminalEditorService.setActiveInstance(this._editorInput.terminalInstance);
    }
    focus() {
        super.focus();
        this._editorInput?.terminalInstance?.focus(true);
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    createEditor(parent) {
        this._editorInstanceElement = parent;
        this._overflowGuardElement = dom.$('.terminal-overflow-guard.terminal-editor');
        this._editorInstanceElement.appendChild(this._overflowGuardElement);
        this._registerListeners();
    }
    _registerListeners() {
        if (!this._editorInstanceElement) {
            return;
        }
        this._register(dom.addDisposableListener(this._editorInstanceElement, 'mousedown', async (event) => {
            const terminal = this._terminalEditorService.activeInstance;
            if (this._terminalEditorService.instances.length > 0 && terminal) {
                const result = await terminal.handleMouseEvent(event, this._instanceMenu);
                if (typeof result === 'object' && result.cancelContextMenu) {
                    this._cancelContextMenu = true;
                }
            }
        }));
        this._register(dom.addDisposableListener(this._editorInstanceElement, 'contextmenu', (event) => {
            const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
            if (rightClickBehavior === 'nothing' && !event.shiftKey) {
                event.preventDefault();
                event.stopImmediatePropagation();
                this._cancelContextMenu = false;
                return;
            }
            else if (!this._cancelContextMenu && rightClickBehavior !== 'copyPaste' && rightClickBehavior !== 'paste') {
                if (!this._cancelContextMenu) {
                    openContextMenu(this.window, event, this._editorInput?.terminalInstance, this._instanceMenu, this._contextMenuService);
                }
                event.preventDefault();
                event.stopImmediatePropagation();
                this._cancelContextMenu = false;
            }
        }));
    }
    _updateTabActionBar(profiles) {
        this._disposableStore.clear();
        const actions = getTerminalActionBarArgs(TerminalLocation.Editor, profiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
        this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
    }
    layout(dimension) {
        const instance = this._editorInput?.terminalInstance;
        if (instance) {
            instance.attachToElement(this._overflowGuardElement);
            instance.layout(dimension);
        }
        this._lastDimension = dimension;
    }
    setVisible(visible) {
        super.setVisible(visible);
        this._editorInput?.terminalInstance?.setVisible(visible && this._workbenchLayoutService.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, this.window));
    }
    getActionViewItem(action, options) {
        switch (action.id) {
            case "workbench.action.createTerminalEditorSameGroup" /* TerminalCommandId.CreateTerminalEditorSameGroup */: {
                if (action instanceof MenuItemAction) {
                    const location = { viewColumn: ACTIVE_GROUP };
                    this._disposableStore.clear();
                    const actions = getTerminalActionBarArgs(location, this._terminalProfileService.availableProfiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
                    this._newDropdown.value = this._instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, actions.dropdownAction, actions.dropdownMenuActions, actions.className, { hoverDelegate: options.hoverDelegate });
                    this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
                    return this._newDropdown.value;
                }
            }
        }
        return super.getActionViewItem(action, options);
    }
    _getDefaultProfileName() {
        let defaultProfileName;
        try {
            defaultProfileName = this._terminalProfileService.getDefaultProfileName();
        }
        catch (e) {
            defaultProfileName = this._terminalProfileResolverService.defaultProfileName;
        }
        return defaultProfileName;
    }
};
TerminalEditor = __decorate([
    __param(1, ITelemetryService),
    __param(2, IThemeService),
    __param(3, IStorageService),
    __param(4, ITerminalEditorService),
    __param(5, ITerminalProfileResolverService),
    __param(6, ITerminalService),
    __param(7, ITerminalConfigurationService),
    __param(8, IContextKeyService),
    __param(9, IMenuService),
    __param(10, IInstantiationService),
    __param(11, IContextMenuService),
    __param(12, ITerminalProfileService),
    __param(13, IWorkbenchLayoutService)
], TerminalEditor);
export { TerminalEditor };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFJdkQsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFDOUgsT0FBTyxFQUFTLFlBQVksRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDN0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFOUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFekUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBRTFILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlELE9BQU8sRUFBRSwrQkFBK0IsRUFBRSx1QkFBdUIsRUFBcUIsTUFBTSx1QkFBdUIsQ0FBQztBQUVwSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDM0QsT0FB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