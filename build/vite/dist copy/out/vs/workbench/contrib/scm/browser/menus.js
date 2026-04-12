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
import { equals } from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import './media/scm.css';
import { localize } from '../../../../nls.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ISCMService } from '../common/scm.js';
function actionEquals(a, b) {
    return a.id === b.id;
}
let SCMTitleMenu = class SCMTitleMenu {
    get actions() { return this._actions; }
    get secondaryActions() { return this._secondaryActions; }
    constructor(menuService, contextKeyService) {
        this._actions = [];
        this._secondaryActions = [];
        this.disposables = new DisposableStore();
        this._onDidChangeTitle = this.disposables.add(new Emitter());
        this.onDidChangeTitle = this._onDidChangeTitle.event;
        this.menu = menuService.createMenu(MenuId.SCMTitle, contextKeyService);
        this.disposables.add(this.menu);
        this.menu.onDidChange(this.updateTitleActions, this, this.disposables);
        this.updateTitleActions();
    }
    updateTitleActions() {
        const { primary, secondary } = getActionBarActions(this.menu.getActions({ shouldForwardArgs: true }));
        if (equals(primary, this._actions, actionEquals) && equals(secondary, this._secondaryActions, actionEquals)) {
            return;
        }
        this._actions = primary;
        this._secondaryActions = secondary;
        this._onDidChangeTitle.fire();
    }
    dispose() {
        this.disposables.dispose();
    }
};
SCMTitleMenu = __decorate([
    __param(0, IMenuService),
    __param(1, IContextKeyService)
], SCMTitleMenu);
export { SCMTitleMenu };
class SCMMenusItem {
    get resourceFolderMenu() {
        if (!this._resourceFolderMenu) {
            this._resourceFolderMenu = this.menuService.createMenu(MenuId.SCMResourceFolderContext, this.contextKeyService);
        }
        return this._resourceFolderMenu;
    }
    constructor(contextKeyService, menuService) {
        this.contextKeyService = contextKeyService;
        this.menuService = menuService;
    }
    getResourceGroupMenu(resourceGroup) {
        if (typeof resourceGroup.contextValue === 'undefined') {
            if (!this.genericResourceGroupMenu) {
                this.genericResourceGroupMenu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, this.contextKeyService);
            }
            return this.genericResourceGroupMenu;
        }
        if (!this.contextualResourceGroupMenus) {
            this.contextualResourceGroupMenus = new Map();
        }
        let item = this.contextualResourceGroupMenus.get(resourceGroup.contextValue);
        if (!item) {
            const contextKeyService = this.contextKeyService.createOverlay([['scmResourceGroupState', resourceGroup.contextValue]]);
            const menu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, contextKeyService);
            item = {
                menu, dispose() {
                    menu.dispose();
                }
            };
            this.contextualResourceGroupMenus.set(resourceGroup.contextValue, item);
        }
        return item.menu;
    }
    getResourceMenu(resource) {
        if (typeof resource.contextValue === 'undefined') {
            if (!this.genericResourceMenu) {
                this.genericResourceMenu = this.menuService.createMenu(MenuId.SCMResourceContext, this.contextKeyService);
            }
            return this.genericResourceMenu;
        }
        if (!this.contextualResourceMenus) {
            this.contextualResourceMenus = new Map();
        }
        let item = this.contextualResourceMenus.get(resource.contextValue);
        if (!item) {
            const contextKeyService = this.contextKeyService.createOverlay([['scmResourceState', resource.contextValue]]);
            const menu = this.menuService.createMenu(MenuId.SCMResourceContext, contextKeyService);
            item = {
                menu, dispose() {
                    menu.dispose();
                }
            };
            this.contextualResourceMenus.set(resource.contextValue, item);
        }
        return item.menu;
    }
    dispose() {
        this.genericResourceGroupMenu?.dispose();
        this.genericResourceMenu?.dispose();
        this._resourceFolderMenu?.dispose();
        if (this.contextualResourceGroupMenus) {
            dispose(this.contextualResourceGroupMenus.values());
            this.contextualResourceGroupMenus.clear();
            this.contextualResourceGroupMenus = undefined;
        }
        if (this.contextualResourceMenus) {
            dispose(this.contextualResourceMenus.values());
            this.contextualResourceMenus.clear();
            this.contextualResourceMenus = undefined;
        }
    }
}
let SCMRepositoryMenus = class SCMRepositoryMenus {
    constructor(provider, contextKeyService, instantiationService, menuService) {
        this.provider = provider;
        this.menuService = menuService;
        this.artifactGroupMenus = new Map();
        this.artifactMenus = new Map();
        this.resourceGroupMenusItems = new Map();
        this.disposables = new DisposableStore();
        this.contextKeyService = contextKeyService.createOverlay([
            ['scmProvider', provider.providerId],
            ['scmProviderRootUri', provider.rootUri?.toString()],
            ['scmProviderHasRootUri', !!provider.rootUri],
        ]);
        const serviceCollection = new ServiceCollection([IContextKeyService, this.contextKeyService]);
        instantiationService = instantiationService.createChild(serviceCollection, this.disposables);
        this.titleMenu = instantiationService.createInstance(SCMTitleMenu);
        this.disposables.add(this.titleMenu);
        provider.onDidChangeResourceGroups(this.onDidChangeResourceGroups, this, this.disposables);
        this.onDidChangeResourceGroups();
    }
    getArtifactGroupMenu(artifactGroup) {
        let item = this.artifactGroupMenus.get(artifactGroup.id);
        if (!item) {
            const contextKeyService = this.contextKeyService.createOverlay([['scmArtifactGroup', artifactGroup.id]]);
            const menu = this.menuService.createMenu(MenuId.SCMArtifactGroupContext, contextKeyService);
            item = {
                menu, dispose() {
                    menu.dispose();
                }
            };
            this.artifactGroupMenus.set(artifactGroup.id, item);
        }
        return item.menu;
    }
    getArtifactMenu(artifactGroup, artifact) {
        const historyProvider = this.provider.historyProvider.get();
        const historyItemRef = historyProvider?.historyItemRef.get();
        const isHistoryItemRef = artifact.id === historyItemRef?.id;
        const key = isHistoryItemRef ? `${artifactGroup.id}|historyItemRef` : artifactGroup.id;
        let item = this.artifactMenus.get(key);
        if (!item) {
            const contextKeyService = this.contextKeyService.createOverlay([
                ['scmArtifactGroupId', artifactGroup.id],
                ['scmArtifactIsHistoryItemRef', isHistoryItemRef]
            ]);
            const menu = this.menuService.createMenu(MenuId.SCMArtifactContext, contextKeyService);
            item = {
                menu, dispose() {
                    menu.dispose();
                }
            };
            this.artifactMenus.set(key, item);
        }
        return item.menu;
    }
    getRepositoryMenu(repository) {
        const contextValue = repository.provider.contextValue.get();
        if (typeof contextValue === 'undefined') {
            if (!this.genericRepositoryMenu) {
                this.genericRepositoryMenu = this.menuService.createMenu(MenuId.SCMSourceControlInline, this.contextKeyService);
            }
            return this.genericRepositoryMenu;
        }
        if (!this.contextualRepositoryMenus) {
            this.contextualRepositoryMenus = new Map();
        }
        let item = this.contextualRepositoryMenus.get(contextValue);
        if (!item) {
            const contextKeyService = this.contextKeyService.createOverlay([['scmProviderContext', contextValue]]);
            const menu = this.menuService.createMenu(MenuId.SCMSourceControlInline, contextKeyService);
            item = {
                menu, dispose() {
                    menu.dispose();
                }
            };
            this.contextualRepositoryMenus.set(contextValue, item);
        }
        return item.menu;
    }
    getRepositoryContextMenu(repository) {
        const contextValue = repository.provider.contextValue.get();
        if (typeof contextValue === 'undefined') {
            if (!this.genericRepositoryContextMenu) {
                this.genericRepositoryContextMenu = this.menuService.createMenu(MenuId.SCMSourceControl, this.contextKeyService);
            }
            return this.genericRepositoryContextMenu;
        }
        if (!this.contextualRepositoryContextMenus) {
            this.contextualRepositoryContextMenus = new Map();
        }
        let item = this.contextualRepositoryContextMenus.get(contextValue);
        if (!item) {
            const contextKeyService = this.contextKeyService.createOverlay([['scmProviderContext', contextValue]]);
            const menu = this.menuService.createMenu(MenuId.SCMSourceControl, contextKeyService);
            item = {
                menu, dispose() {
                    menu.dispose();
                }
            };
            this.contextualRepositoryContextMenus.set(contextValue, item);
        }
        return item.menu;
    }
    getResourceGroupMenu(group) {
        return this.getOrCreateResourceGroupMenusItem(group).getResourceGroupMenu(group);
    }
    getResourceMenu(resource) {
        return this.getOrCreateResourceGroupMenusItem(resource.resourceGroup).getResourceMenu(resource);
    }
    getResourceFolderMenu(group) {
        return this.getOrCreateResourceGroupMenusItem(group).resourceFolderMenu;
    }
    getOrCreateResourceGroupMenusItem(group) {
        let result = this.resourceGroupMenusItems.get(group);
        if (!result) {
            const contextKeyService = this.contextKeyService.createOverlay([
                ['scmResourceGroup', group.id],
                ['multiDiffEditorEnableViewChanges', group.multiDiffEditorEnableViewChanges],
            ]);
            result = new SCMMenusItem(contextKeyService, this.menuService);
            this.resourceGroupMenusItems.set(group, result);
        }
        return result;
    }
    onDidChangeResourceGroups() {
        for (const resourceGroup of this.resourceGroupMenusItems.keys()) {
            if (!this.provider.groups.includes(resourceGroup)) {
                this.resourceGroupMenusItems.get(resourceGroup)?.dispose();
                this.resourceGroupMenusItems.delete(resourceGroup);
            }
        }
    }
    dispose() {
        this.genericRepositoryMenu?.dispose();
        if (this.contextualRepositoryMenus) {
            dispose(this.contextualRepositoryMenus.values());
            this.contextualRepositoryMenus.clear();
            this.contextualRepositoryMenus = undefined;
        }
        this.resourceGroupMenusItems.forEach(item => item.dispose());
        this.disposables.dispose();
    }
};
SCMRepositoryMenus = __decorate([
    __param(1, IContextKeyService),
    __param(2, IInstantiationService),
    __param(3, IMenuService)
], SCMRepositoryMenus);
export { SCMRepositoryMenus };
let SCMMenus = class SCMMenus {
    constructor(scmService, instantiationService) {
        this.instantiationService = instantiationService;
        this.disposables = new DisposableStore();
        this.menus = new Map();
        this.titleMenu = instantiationService.createInstance(SCMTitleMenu);
        scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
    }
    onDidRemoveRepository(repository) {
        const menus = this.menus.get(repository.provider);
        menus?.dispose();
        this.menus.delete(repository.provider);
    }
    getRepositoryMenus(provider) {
        let result = this.menus.get(provider);
        if (!result) {
            const menus = this.instantiationService.createInstance(SCMRepositoryMenus, provider);
            const dispose = () => {
                menus.dispose();
                this.menus.delete(provider);
            };
            result = { menus, dispose };
            this.menus.set(provider, result);
        }
        return result.menus;
    }
    dispose() {
        this.disposables.dispose();
    }
};
SCMMenus = __decorate([
    __param(0, ISCMService),
    __param(1, IInstantiationService)
], SCMMenus);
export { SCMMenus };
MenuRegistry.appendMenuItem(MenuId.SCMResourceContext, {
    title: localize('miShare', "Share"),
    submenu: MenuId.SCMResourceContextShare,
    group: '45_share',
    order: 3,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zY20vYnJvd3Nlci9tZW51cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQWUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0YsT0FBTyxpQkFBaUIsQ0FBQztBQUN6QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDdEcsT0FBTyxFQUFTLFlBQVksRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDM0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDbkcsT0FBTyxFQUFpRyxXQUFXLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUc5SSxTQUFTLFlBQVksQ0FBQyxDQUFVLEVBQUUsQ0FBVTtJQUMzQyxPQUFPLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUN0QixDQUFDO0FBRU0sSUFBTSxZQUFZLEdBQWxCLE1BQU0sWUFBWTtJQUd4QixJQUFJLE9BQU8sS0FBZ0IsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUdsRCxJQUFJLGdCQUFnQixLQUFnQixPQUFPLElBQUks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