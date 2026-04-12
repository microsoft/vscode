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
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { BrowserEditor, BrowserEditorContribution } from '../browserEditor.js';
import { Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { BrowserViewCommandId, BrowserViewStorageScope } from '../../../../../platform/browserView/common/browserView.js';
import { IContextKeyService, ContextKeyExpr, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { BrowserActionCategory, BrowserActionGroup } from '../browserViewActions.js';
const CONTEXT_BROWSER_STORAGE_SCOPE = new RawContextKey('browserStorageScope', '', localize('browser.storageScope', "The storage scope of the current browser view"));
let BrowserEditorStorageScopeContribution = class BrowserEditorStorageScopeContribution extends BrowserEditorContribution {
    constructor(editor, contextKeyService) {
        super(editor);
        this._storageScopeContext = CONTEXT_BROWSER_STORAGE_SCOPE.bindTo(contextKeyService);
    }
    subscribeToModel(model, _store) {
        this._storageScopeContext.set(model.storageScope);
    }
    clear() {
        this._storageScopeContext.reset();
    }
};
BrowserEditorStorageScopeContribution = __decorate([
    __param(1, IContextKeyService)
], BrowserEditorStorageScopeContribution);
BrowserEditor.registerContribution(BrowserEditorStorageScopeContribution);
class ClearGlobalBrowserStorageAction extends Action2 {
    static { this.ID = BrowserViewCommandId.ClearGlobalStorage; }
    constructor() {
        super({
            id: ClearGlobalBrowserStorageAction.ID,
            title: localize2('browser.clearGlobalStorageAction', 'Clear Storage (Global)'),
            category: BrowserActionCategory,
            icon: Codicon.clearAll,
            f1: true,
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Settings,
                order: 1,
                when: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Global)
            }
        });
    }
    async run(accessor) {
        const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
        await browserViewWorkbenchService.clearGlobalStorage();
    }
}
class ClearWorkspaceBrowserStorageAction extends Action2 {
    static { this.ID = BrowserViewCommandId.ClearWorkspaceStorage; }
    constructor() {
        super({
            id: ClearWorkspaceBrowserStorageAction.ID,
            title: localize2('browser.clearWorkspaceStorageAction', 'Clear Storage (Workspace)'),
            category: BrowserActionCategory,
            icon: Codicon.clearAll,
            f1: true,
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Settings,
                order: 1,
                when: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Workspace)
            }
        });
    }
    async run(accessor) {
        const browserViewWorkbenchService = accessor.get(IBrowserViewWorkbenchService);
        await browserViewWorkbenchService.clearWorkspaceStorage();
    }
}
class ClearEphemeralBrowserStorageAction extends Action2 {
    static { this.ID = BrowserViewCommandId.ClearEphemeralStorage; }
    constructor() {
        super({
            id: ClearEphemeralBrowserStorageAction.ID,
            title: localize2('browser.clearEphemeralStorageAction', 'Clear Storage (Ephemeral)'),
            category: BrowserActionCategory,
            icon: Codicon.clearAll,
            f1: true,
            precondition: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Ephemeral),
            menu: {
                id: MenuId.BrowserActionsToolbar,
                group: BrowserActionGroup.Settings,
                order: 1,
                when: ContextKeyExpr.equals(CONTEXT_BROWSER_STORAGE_SCOPE.key, BrowserViewStorageScope.Ephemeral)
            }
        });
    }
    async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
        if (browserEditor instanceof BrowserEditor) {
            await browserEditor.clearStorage();
        }
    }
}
registerAction2(ClearGlobalBrowserStorageAction);
registerAction2(ClearWorkspaceBrowserStorageAction);
registerAction2(ClearEphemeralBrowserStorageAction);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
    ...workbenchConfigurationNodeBase,
    properties: {
        'workbench.browser.dataStorage': {
            type: 'string',
            enum: [
                BrowserViewStorageScope.Global,
                BrowserViewStorageScope.Workspace,
                BrowserViewStorageScope.Ephemeral
            ],
            markdownEnumDescriptions: [
                localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.global' }, 'All browser views share a single persistent session across all workspaces.'),
                localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.workspace' }, 'Browser views within the same workspace share a persistent session. If no workspace is opened, `ephemeral` storage is used.'),
                localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage.ephemeral' }, 'Each browser view has its own session that is cleaned up when closed.')
            ],
            restricted: true,
            default: BrowserViewStorageScope.Global,
            markdownDescription: localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'browser.dataStorage' }, 'Controls how browser data (cookies, cache, storage) is shared between browser views.\n\n**Note**: In untrusted workspaces, this setting is ignored and `ephemeral` storage is always used.'),
            scope: 4 /* ConfigurationScope.WINDOW */,
            order: 100
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlckRhdGFTdG9yYWdlRmVhdHVyZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9icm93c2VyVmlldy9lbGVjdHJvbi1icm93c2VyL2ZlYXR1cmVzL2Jyb3dzZXJEYXRhU3RvcmFnZUZlYXR1cmVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxhQUFhLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMvRSxPQUFPLEVBQTBCLFVBQVUsSUFBSSx1QkFBdUIsRUFBc0IsTUFBTSx1RUFBdUUsQ0FBQztBQUMxSyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRixPQUFPLEVBQXFCLDRCQUE0QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDOUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDMUgsT0FBTyxFQUFlLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxhQUFhLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6SSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBSXJGLE1BQU0sNkJBQTZC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