/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../base/common/event.js';
import { localize } from '../../nls.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { Disposable, toDisposable } from '../../base/common/lifecycle.js';
import { getOrSet, SetMap } from '../../base/common/map.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { mixin } from '../../base/common/objects.js';
import { Codicon } from '../../base/common/codicons.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
export const VIEWS_LOG_ID = 'views';
export const VIEWS_LOG_NAME = localize('views log', "Views");
export const defaultViewIcon = registerIcon('default-view-icon', Codicon.window, localize('defaultViewIcon', 'Default view icon.'));
export var Extensions;
(function (Extensions) {
    Extensions.ViewContainersRegistry = 'workbench.registry.view.containers';
    Extensions.ViewsRegistry = 'workbench.registry.view';
})(Extensions || (Extensions = {}));
export var ViewContainerLocation;
(function (ViewContainerLocation) {
    ViewContainerLocation[ViewContainerLocation["Sidebar"] = 0] = "Sidebar";
    ViewContainerLocation[ViewContainerLocation["Panel"] = 1] = "Panel";
    ViewContainerLocation[ViewContainerLocation["AuxiliaryBar"] = 2] = "AuxiliaryBar";
    ViewContainerLocation[ViewContainerLocation["ChatBar"] = 3] = "ChatBar";
})(ViewContainerLocation || (ViewContainerLocation = {}));
export function ViewContainerLocationToString(viewContainerLocation) {
    switch (viewContainerLocation) {
        case 0 /* ViewContainerLocation.Sidebar */: return 'sidebar';
        case 1 /* ViewContainerLocation.Panel */: return 'panel';
        case 2 /* ViewContainerLocation.AuxiliaryBar */: return 'auxiliarybar';
        case 3 /* ViewContainerLocation.ChatBar */: return 'chatbar';
    }
}
/**
 * Specifies in which window a view or view container should be visible.
 */
export var WindowVisibility;
(function (WindowVisibility) {
    /**
     * Visible only in the editor window
     */
    WindowVisibility[WindowVisibility["Editor"] = 1] = "Editor";
    /**
     * Visible only in agent sessions window
     */
    WindowVisibility[WindowVisibility["Sessions"] = 2] = "Sessions";
    /**
     * Visible in both editor and agent sessions windows
     */
    WindowVisibility[WindowVisibility["Both"] = 3] = "Both";
})(WindowVisibility || (WindowVisibility = {}));
class ViewContainersRegistryImpl extends Disposable {
    constructor() {
        super(...arguments);
        this._onDidRegister = this._register(new Emitter());
        this.onDidRegister = this._onDidRegister.event;
        this._onDidDeregister = this._register(new Emitter());
        this.onDidDeregister = this._onDidDeregister.event;
        this.viewContainers = new Map();
        this.defaultViewContainers = [];
    }
    get all() {
        return [...this.viewContainers.values()].flat();
    }
    registerViewContainer(viewContainerDescriptor, viewContainerLocation, options) {
        const existing = this.get(viewContainerDescriptor.id);
        if (existing) {
            return existing;
        }
        const viewContainer = viewContainerDescriptor;
        viewContainer.openCommandActionDescriptor = options?.doNotRegisterOpenCommand ? undefined : (viewContainer.openCommandActionDescriptor ?? { id: viewContainer.id });
        const viewContainers = getOrSet(this.viewContainers, viewContainerLocation, []);
        viewContainers.push(viewContainer);
        if (options?.isDefault) {
            this.defaultViewContainers.push(viewContainer);
        }
        this._onDidRegister.fire({ viewContainer, viewContainerLocation });
        return viewContainer;
    }
    deregisterViewContainer(viewContainer) {
        for (const viewContainerLocation of this.viewContainers.keys()) {
            const viewContainers = this.viewContainers.get(viewContainerLocation);
            const index = viewContainers?.indexOf(viewContainer);
            if (index !== -1) {
                viewContainers?.splice(index, 1);
                if (viewContainers.length === 0) {
                    this.viewContainers.delete(viewContainerLocation);
                }
                this._onDidDeregister.fire({ viewContainer, viewContainerLocation });
                return;
            }
        }
    }
    get(id) {
        return this.all.filter(viewContainer => viewContainer.id === id)[0];
    }
    getViewContainers(location) {
        return [...(this.viewContainers.get(location) || [])];
    }
    getViewContainerLocation(container) {
        return [...this.viewContainers.keys()].filter(location => this.getViewContainers(location).filter(viewContainer => viewContainer?.id === container.id).length > 0)[0];
    }
    getDefaultViewContainers(location) {
        return this.defaultViewContainers.filter(viewContainer => this.getViewContainerLocation(viewContainer) === location);
    }
}
Registry.add(Extensions.ViewContainersRegistry, new ViewContainersRegistryImpl());
export var ViewContentGroups;
(function (ViewContentGroups) {
    ViewContentGroups["Open"] = "2_open";
    ViewContentGroups["Debug"] = "4_debug";
    ViewContentGroups["SCM"] = "5_scm";
    ViewContentGroups["More"] = "9_more";
})(ViewContentGroups || (ViewContentGroups = {}));
function compareViewContentDescriptors(a, b) {
    const aGroup = a.group ?? ViewContentGroups.More;
    const bGroup = b.group ?? ViewContentGroups.More;
    if (aGroup !== bGroup) {
        return aGroup.localeCompare(bGroup);
    }
    return (a.order ?? 5) - (b.order ?? 5);
}
class ViewsRegistry extends Disposable {
    constructor() {
        super(...arguments);
        this._onViewsRegistered = this._register(new Emitter());
        this.onViewsRegistered = this._onViewsRegistered.event;
        this._onViewsDeregistered = this._register(new Emitter());
        this.onViewsDeregistered = this._onViewsDeregistered.event;
        this._onDidChangeContainer = this._register(new Emitter());
        this.onDidChangeContainer = this._onDidChangeContainer.event;
        this._onDidChangeViewWelcomeContent = this._register(new Emitter());
        this.onDidChangeViewWelcomeContent = this._onDidChangeViewWelcomeContent.event;
        this._viewContainers = [];
        this._views = new Map();
        this._viewWelcomeContents = new SetMap();
    }
    registerViews(views, viewContainer) {
        this.registerViews2([{ views, viewContainer }]);
    }
    registerViews2(views) {
        views.forEach(({ views, viewContainer }) => this.addViews(views, viewContainer));
        this._onViewsRegistered.fire(views);
    }
    deregisterViews(viewDescriptors, viewContainer) {
        const views = this.removeViews(viewDescriptors, viewContainer);
        if (views.length) {
            this._onViewsDeregistered.fire({ views, viewContainer });
        }
    }
    moveViews(viewsToMove, viewContainer) {
        for (const container of this._views.keys()) {
            if (container !== viewContainer) {
                const views = this.removeViews(viewsToMove, container);
                if (views.length) {
                    this.addViews(views, viewContainer);
                    this._onDidChangeContainer.fire({ views, from: container, to: viewContainer });
                }
            }
        }
    }
    getViews(loc) {
        return this._views.get(loc) || [];
    }
    getView(id) {
        for (const viewContainer of this._viewContainers) {
            const viewDescriptor = (this._views.get(viewContainer) || []).filter(v => v.id === id)[0];
            if (viewDescriptor) {
                return viewDescriptor;
            }
        }
        return null;
    }
    getViewContainer(viewId) {
        for (const viewContainer of this._viewContainers) {
            const viewDescriptor = (this._views.get(viewContainer) || []).filter(v => v.id === viewId)[0];
            if (viewDescriptor) {
                return viewContainer;
            }
        }
        return null;
    }
    registerViewWelcomeContent(id, viewContent) {
        this._viewWelcomeContents.add(id, viewContent);
        this._onDidChangeViewWelcomeContent.fire(id);
        return toDisposable(() => {
            this._viewWelcomeContents.delete(id, viewContent);
            this._onDidChangeViewWelcomeContent.fire(id);
        });
    }
    registerViewWelcomeContent2(id, viewContentMap) {
        const disposables = new Map();
        for (const [key, content] of viewContentMap) {
            this._viewWelcomeContents.add(id, content);
            disposables.set(key, toDisposable(() => {
                this._viewWelcomeContents.delete(id, content);
                this._onDidChangeViewWelcomeContent.fire(id);
            }));
        }
        this._onDidChangeViewWelcomeContent.fire(id);
        return disposables;
    }
    getViewWelcomeContent(id) {
        const result = [];
        this._viewWelcomeContents.forEach(id, descriptor => result.push(descriptor));
        return result.sort(compareViewContentDescriptors);
    }
    addViews(viewDescriptors, viewContainer) {
        let views = this._views.get(viewContainer);
        if (!views) {
            views = [];
            this._views.set(viewContainer, views);
            this._viewContainers.push(viewContainer);
        }
        for (const viewDescriptor of viewDescriptors) {
            if (this.getView(viewDescriptor.id) !== null) {
                throw new Error(localize('duplicateId', "A view with id '{0}' is already registered", viewDescriptor.id));
            }
            views.push(viewDescriptor);
        }
    }
    removeViews(viewDescriptors, viewContainer) {
        const views = this._views.get(viewContainer);
        if (!views) {
            return [];
        }
        const viewsToDeregister = [];
        const remaningViews = [];
        for (const view of views) {
            if (!viewDescriptors.includes(view)) {
                remaningViews.push(view);
            }
            else {
                viewsToDeregister.push(view);
            }
        }
        if (viewsToDeregister.length) {
            if (remaningViews.length) {
                this._views.set(viewContainer, remaningViews);
            }
            else {
                this._views.delete(viewContainer);
                this._viewContainers.splice(this._viewContainers.indexOf(viewContainer), 1);
            }
        }
        return viewsToDeregister;
    }
}
Registry.add(Extensions.ViewsRegistry, new ViewsRegistry());
export const IViewDescriptorService = createDecorator('viewDescriptorService');
export var ViewVisibilityState;
(function (ViewVisibilityState) {
    ViewVisibilityState[ViewVisibilityState["Default"] = 0] = "Default";
    ViewVisibilityState[ViewVisibilityState["Expand"] = 1] = "Expand";
})(ViewVisibilityState || (ViewVisibilityState = {}));
export var TreeItemCollapsibleState;
(function (TreeItemCollapsibleState) {
    TreeItemCollapsibleState[TreeItemCollapsibleState["None"] = 0] = "None";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Collapsed"] = 1] = "Collapsed";
    TreeItemCollapsibleState[TreeItemCollapsibleState["Expanded"] = 2] = "Expanded";
})(TreeItemCollapsibleState || (TreeItemCollapsibleState = {}));
export class ResolvableTreeItem {
    constructor(treeItem, resolve) {
        this.resolved = false;
        this._hasResolve = false;
        mixin(this, treeItem);
        this._hasResolve = !!resolve;
        this.resolve = async (token) => {
            if (resolve && !this.resolved) {
                const resolvedItem = await resolve(token);
                if (resolvedItem) {
                    // Resolvable elements. Currently tooltip and command.
                    this.tooltip = this.tooltip ?? resolvedItem.tooltip;
                    this.command = this.command ?? resolvedItem.command;
                }
            }
            if (!token.isCancellationRequested) {
                this.resolved = true;
            }
        };
    }
    get hasResolve() {
        return this._hasResolve;
    }
    resetResolve() {
        this.resolved = false;
    }
    asTreeItem() {
        return {
            handle: this.handle,
            parentHandle: this.parentHandle,
            collapsibleState: this.collapsibleState,
            label: this.label,
            description: this.description,
            icon: this.icon,
            iconDark: this.iconDark,
            themeIcon: this.themeIcon,
            resourceUri: this.resourceUri,
            tooltip: this.tooltip,
            contextValue: this.contextValue,
            command: this.command,
            children: this.children,
            accessibilityInformation: this.accessibilityInformation
        };
    }
}
export class NoTreeViewError extends Error {
    constructor(treeViewId) {
        super(localize('treeView.notRegistered', 'No tree view with id \'{0}\' registered.', treeViewId));
        this.name = 'NoTreeViewError';
    }
    static is(err) {
        return !!err && err.name === 'NoTreeViewError';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29tbW9uL3ZpZXdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQ3hDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN2RixPQUFPLEVBQWUsVUFBVSxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXZGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBUXRFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBSzNFLE1BQU0sQ0FBQyxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUM7QUFDcEMsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDN0QsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7QUFFcEksTUFBTSxLQUFXLFVBQVUsQ0FHMUI7QUFIRCxXQUFpQixVQUFVO0lBQ2IsaUNBQXNCLEdBQUcsb0NBQW9DLENBQUM7SUFDOUQsd0JBQWEsR0FBRyx5QkFBeUIsQ0FBQztBQUN4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