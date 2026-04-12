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
import * as nls from '../../../../nls.js';
import { IRemoteExplorerService, REMOTE_EXPLORER_TYPE_KEY } from '../../../services/remote/common/remoteExplorerService.js';
import { isStringArray } from '../../../../base/common/types.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { VIEWLET_ID } from './remoteExplorer.js';
import { getVirtualWorkspaceLocation } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
export const SELECTED_REMOTE_IN_EXPLORER = new RawContextKey('selectedRemoteInExplorer', '');
let SwitchRemoteViewItem = class SwitchRemoteViewItem extends Disposable {
    constructor(contextKeyService, remoteExplorerService, environmentService, storageService, workspaceContextService) {
        super();
        this.contextKeyService = contextKeyService;
        this.remoteExplorerService = remoteExplorerService;
        this.environmentService = environmentService;
        this.storageService = storageService;
        this.workspaceContextService = workspaceContextService;
        this.completedRemotes = this._register(new DisposableMap());
        this.selectedRemoteContext = SELECTED_REMOTE_IN_EXPLORER.bindTo(contextKeyService);
        this.switchRemoteMenu = MenuId.for('workbench.remote.menu.switchRemoteMenu');
        this._register(MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
            submenu: this.switchRemoteMenu,
            title: nls.localize('switchRemote.label', "Switch Remote"),
            group: 'navigation',
            when: ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
            order: 1,
            isSelection: true
        }));
        this._register(remoteExplorerService.onDidChangeTargetType(e => {
            this.select(e);
        }));
    }
    setSelectionForConnection() {
        let isSetForConnection = false;
        if (this.completedRemotes.size > 0) {
            let authority;
            const remoteAuthority = this.environmentService.remoteAuthority;
            let virtualWorkspace;
            if (!remoteAuthority) {
                virtualWorkspace = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace())?.scheme;
            }
            isSetForConnection = true;
            const explorerType = remoteAuthority ? [remoteAuthority.split('+')[0]]
                : (virtualWorkspace ? [virtualWorkspace]
                    : (this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, 1 /* StorageScope.WORKSPACE */)?.split(',') ?? this.storageService.get(REMOTE_EXPLORER_TYPE_KEY, 0 /* StorageScope.PROFILE */)?.split(',')));
            if (explorerType !== undefined) {
                authority = this.getAuthorityForExplorerType(explorerType);
            }
            if (authority) {
                this.select(authority);
            }
        }
        return isSetForConnection;
    }
    select(authority) {
        this.selectedRemoteContext.set(authority[0]);
        this.remoteExplorerService.targetType = authority;
    }
    getAuthorityForExplorerType(explorerType) {
        let authority;
        for (const option of this.completedRemotes) {
            for (const authorityOption of option[1].authority) {
                for (const explorerOption of explorerType) {
                    if (authorityOption === explorerOption) {
                        authority = option[1].authority;
                        break;
                    }
                    else if (option[1].virtualWorkspace === explorerOption) {
                        authority = option[1].authority;
                        break;
                    }
                }
            }
        }
        return authority;
    }
    removeOptionItems(views) {
        for (const view of views) {
            if (view.group && view.group.startsWith('targets') && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
                const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
                this.completedRemotes.deleteAndDispose(authority[0]);
            }
        }
    }
    createOptionItems(views) {
        const startingCount = this.completedRemotes.size;
        for (const view of views) {
            if (view.group && view.group.startsWith('targets') && view.remoteAuthority && (!view.when || this.contextKeyService.contextMatchesRules(view.when))) {
                const text = view.name;
                const authority = isStringArray(view.remoteAuthority) ? view.remoteAuthority : [view.remoteAuthority];
                if (this.completedRemotes.has(authority[0])) {
                    continue;
                }
                const thisCapture = this;
                const action = registerAction2(class extends Action2 {
                    constructor() {
                        super({
                            id: `workbench.action.remoteExplorer.show.${authority[0]}`,
                            title: text,
                            toggled: SELECTED_REMOTE_IN_EXPLORER.isEqualTo(authority[0]),
                            menu: {
                                id: thisCapture.switchRemoteMenu
                            }
                        });
                    }
                    async run() {
                        thisCapture.select(authority);
                    }
                });
                this.completedRemotes.set(authority[0], { text: text.value, authority, virtualWorkspace: view.virtualWorkspace, dispose: () => action.dispose() });
            }
        }
        if (this.completedRemotes.size > startingCount) {
            this.setSelectionForConnection();
        }
    }
};
SwitchRemoteViewItem = __decorate([
    __param(0, IContextKeyService),
    __param(1, IRemoteExplorerService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IStorageService),
    __param(4, IWorkspaceContextService)
], SwitchRemoteViewItem);
export { SwitchRemoteViewItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwbG9yZXJWaWV3SXRlbXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9yZW1vdGUvYnJvd3Nlci9leHBsb3JlclZpZXdJdGVtcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRzVILE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUFnQixNQUFNLGdEQUFnRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxjQUFjLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2hILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN4RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBUWpGLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLElBQUksYUFBYSxDQUFTLDBCQUEwQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBRTlGLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsVUFBVTtJQUtuRCxZQUNxQixp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