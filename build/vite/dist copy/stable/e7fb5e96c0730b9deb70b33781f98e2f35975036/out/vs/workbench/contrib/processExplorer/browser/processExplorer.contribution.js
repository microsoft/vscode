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
import { localize, localize2 } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { ProcessExplorerEditorInput } from './processExplorerEditorInput.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { RemoteNameContext } from '../../../common/contextkeys.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
//#region --- process explorer
let ProcessExplorerEditorContribution = class ProcessExplorerEditorContribution {
    static { this.ID = 'workbench.contrib.processExplorerEditor'; }
    constructor(editorResolverService, instantiationService) {
        editorResolverService.registerEditor(`${ProcessExplorerEditorInput.RESOURCE.scheme}:**/**`, {
            id: ProcessExplorerEditorInput.ID,
            label: localize('promptOpenWith.processExplorer.displayName', "Process Explorer"),
            priority: RegisteredEditorPriority.exclusive
        }, {
            singlePerResource: true,
            canSupportResource: resource => resource.scheme === ProcessExplorerEditorInput.RESOURCE.scheme
        }, {
            createEditorInput: () => {
                return {
                    editor: instantiationService.createInstance(ProcessExplorerEditorInput),
                    options: {
                        pinned: true
                    }
                };
            }
        });
    }
};
ProcessExplorerEditorContribution = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IInstantiationService)
], ProcessExplorerEditorContribution);
registerWorkbenchContribution2(ProcessExplorerEditorContribution.ID, ProcessExplorerEditorContribution, 1 /* WorkbenchPhase.BlockStartup */);
class ProcessExplorerEditorInputSerializer {
    canSerialize(editorInput) {
        return true;
    }
    serialize(editorInput) {
        return '';
    }
    deserialize(instantiationService) {
        return ProcessExplorerEditorInput.instance;
    }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ProcessExplorerEditorInput.ID, ProcessExplorerEditorInputSerializer);
//#endregion
//#region --- process explorer commands
const supported = ContextKeyExpr.or(IsWebContext.negate(), RemoteNameContext.notEqualsTo('')); // only on desktop or in web with a remote
class OpenProcessExplorer extends Action2 {
    static { this.ID = 'workbench.action.openProcessExplorer'; }
    static { this.STATE_KEY = 'workbench.processExplorerWindowState'; }
    static { this.DEFAULT_STATE = { bounds: { width: 800, height: 500 } }; }
    constructor() {
        super({
            id: OpenProcessExplorer.ID,
            title: localize2('openProcessExplorer', 'Open Process Explorer'),
            category: Categories.Developer,
            precondition: supported,
            f1: true
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        const auxiliaryWindowService = accessor.get(IAuxiliaryWindowService);
        const storageService = accessor.get(IStorageService);
        const pane = await editorService.openEditor({
            resource: ProcessExplorerEditorInput.RESOURCE,
            options: {
                pinned: true,
                revealIfOpened: true,
                auxiliary: {
                    ...this.loadState(storageService),
                    compact: true,
                    alwaysOnTop: true
                }
            }
        }, AUX_WINDOW_GROUP);
        if (pane) {
            const listener = pane.input?.onWillDispose(() => {
                listener?.dispose();
                this.saveState(pane.group.id, storageService, editorGroupService, auxiliaryWindowService);
            });
        }
    }
    loadState(storageService) {
        const stateRaw = storageService.get(OpenProcessExplorer.STATE_KEY, -1 /* StorageScope.APPLICATION */);
        if (!stateRaw) {
            return OpenProcessExplorer.DEFAULT_STATE;
        }
        try {
            return JSON.parse(stateRaw);
        }
        catch {
            return OpenProcessExplorer.DEFAULT_STATE;
        }
    }
    saveState(group, storageService, editorGroupService, auxiliaryWindowService) {
        const auxiliaryWindow = auxiliaryWindowService.getWindow(editorGroupService.getPart(group).windowId);
        if (!auxiliaryWindow) {
            return;
        }
        const bounds = auxiliaryWindow.createState().bounds;
        if (!bounds) {
            return;
        }
        storageService.store(OpenProcessExplorer.STATE_KEY, JSON.stringify({ bounds }), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
}
registerAction2(OpenProcessExplorer);
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
    group: '5_tools',
    command: {
        id: OpenProcessExplorer.ID,
        title: localize({ key: 'miOpenProcessExplorerer', comment: ['&& denotes a mnemonic'] }, "Open &&Process Explorer")
    },
    when: supported,
    order: 2
});
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc0V4cGxvcmVyLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Byb2Nlc3NFeHBsb3Jlci9icm93c2VyL3Byb2Nlc3NFeHBsb3Jlci5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0sa0NBQWtDLENBQUM7QUFDMUgsT0FBTyxFQUFxQixnQkFBZ0IsRUFBMkMsTUFBTSwyQkFBMkIsQ0FBQztBQUV6SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM1SCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBRTlHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzlHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzlGLE9BQU8s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