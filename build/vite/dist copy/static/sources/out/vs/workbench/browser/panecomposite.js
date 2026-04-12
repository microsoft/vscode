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
import { Registry } from '../../platform/registry/common/platform.js';
import { Composite, CompositeDescriptor, CompositeRegistry } from './composite.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { Separator } from '../../base/common/actions.js';
import { SubmenuItemAction } from '../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../platform/contextview/browser/contextView.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { ViewsSubMenu } from './parts/views/viewPaneContainer.js';
import { IExtensionService } from '../services/extensions/common/extensions.js';
import { VIEWPANE_FILTER_ACTION } from './parts/views/viewPane.js';
let PaneComposite = class PaneComposite extends Composite {
    constructor(id, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService) {
        super(id, telemetryService, themeService, storageService);
        this.storageService = storageService;
        this.instantiationService = instantiationService;
        this.contextMenuService = contextMenuService;
        this.extensionService = extensionService;
        this.contextService = contextService;
    }
    create(parent) {
        super.create(parent);
        this.viewPaneContainer = this._register(this.createViewPaneContainer(parent));
        this._register(this.viewPaneContainer.onTitleAreaUpdate(() => this.updateTitleArea()));
        this.viewPaneContainer.create(parent);
    }
    setVisible(visible) {
        super.setVisible(visible);
        this.viewPaneContainer?.setVisible(visible);
    }
    layout(dimension) {
        this.viewPaneContainer?.layout(dimension);
    }
    setBoundarySashes(sashes) {
        this.viewPaneContainer?.setBoundarySashes(sashes);
    }
    getOptimalWidth() {
        return this.viewPaneContainer?.getOptimalWidth() ?? 0;
    }
    openView(id, focus) {
        return this.viewPaneContainer?.openView(id, focus);
    }
    getViewPaneContainer() {
        return this.viewPaneContainer;
    }
    getActionsContext() {
        return this.getViewPaneContainer()?.getActionsContext();
    }
    getContextMenuActions() {
        return this.viewPaneContainer?.menuActions?.getContextMenuActions() ?? [];
    }
    getMenuIds() {
        const result = [];
        if (this.viewPaneContainer?.menuActions) {
            result.push(this.viewPaneContainer.menuActions.menuId);
            if (this.viewPaneContainer.isViewMergedWithContainer()) {
                result.push(this.viewPaneContainer.panes[0].menuActions.menuId);
            }
        }
        return result;
    }
    getActions() {
        const result = [];
        if (this.viewPaneContainer?.menuActions) {
            result.push(...this.viewPaneContainer.menuActions.getPrimaryActions());
            if (this.viewPaneContainer.isViewMergedWithContainer()) {
                const viewPane = this.viewPaneContainer.panes[0];
                if (viewPane.shouldShowFilterInHeader()) {
                    result.push(VIEWPANE_FILTER_ACTION);
                }
                result.push(...viewPane.menuActions.getPrimaryActions());
            }
        }
        return result;
    }
    getSecondaryActions() {
        if (!this.viewPaneContainer?.menuActions) {
            return [];
        }
        const viewPaneActions = this.viewPaneContainer.isViewMergedWithContainer() ? this.viewPaneContainer.panes[0].menuActions.getSecondaryActions() : [];
        let menuActions = this.viewPaneContainer.menuActions.getSecondaryActions();
        const viewsSubmenuActionIndex = menuActions.findIndex(action => action instanceof SubmenuItemAction && action.item.submenu === ViewsSubMenu);
        if (viewsSubmenuActionIndex !== -1) {
            const viewsSubmenuAction = menuActions[viewsSubmenuActionIndex];
            if (viewsSubmenuAction.actions.some(({ enabled }) => enabled)) {
                if (menuActions.length === 1 && viewPaneActions.length === 0) {
                    menuActions = viewsSubmenuAction.actions.slice();
                }
                else if (viewsSubmenuActionIndex !== 0) {
                    menuActions = [viewsSubmenuAction, ...menuActions.slice(0, viewsSubmenuActionIndex), ...menuActions.slice(viewsSubmenuActionIndex + 1)];
                }
            }
            else {
                // Remove views submenu if none of the actions are enabled
                menuActions.splice(viewsSubmenuActionIndex, 1);
            }
        }
        if (menuActions.length && viewPaneActions.length) {
            return [
                ...menuActions,
                new Separator(),
                ...viewPaneActions
            ];
        }
        return menuActions.length ? menuActions : viewPaneActions;
    }
    getActionViewItem(action, options) {
        return this.viewPaneContainer?.getActionViewItem(action, options);
    }
    getTitle() {
        return this.viewPaneContainer?.getTitle() ?? '';
    }
    focus() {
        super.focus();
        this.viewPaneContainer?.focus();
    }
};
PaneComposite = __decorate([
    __param(1, ITelemetryService),
    __param(2, IStorageService),
    __param(3, IInstantiationService),
    __param(4, IThemeService),
    __param(5, IContextMenuService),
    __param(6, IExtensionService),
    __param(7, IWorkspaceContextService)
], PaneComposite);
export { PaneComposite };
/**
 * A Pane Composite descriptor is a lightweight descriptor of a Pane Composite in the workbench.
 */
export class PaneCompositeDescriptor extends CompositeDescriptor {
    static create(ctor, id, name, cssClass, order, requestedIndex, iconUrl) {
        return new PaneCompositeDescriptor(ctor, id, name, cssClass, order, requestedIndex, iconUrl);
    }
    constructor(ctor, id, name, cssClass, order, requestedIndex, iconUrl) {
        super(ctor, id, name, cssClass, order, requestedIndex);
        this.iconUrl = iconUrl;
    }
}
export const Extensions = {
    Viewlets: 'workbench.contributions.viewlets',
    Panels: 'workbench.contributions.panels',
    Auxiliary: 'workbench.contributions.auxiliary',
    ChatBar: 'workbench.contributions.chatbar',
};
export class PaneCompositeRegistry extends CompositeRegistry {
    /**
     * Registers a viewlet to the platform.
     */
    registerPaneComposite(descriptor) {
        super.registerComposite(descriptor);
    }
    /**
     * Deregisters a viewlet to the platform.
     */
    deregisterPaneComposite(id) {
        super.deregisterComposite(id);
    }
    /**
     * Returns the viewlet descriptor for the given id or null if none.
     */
    getPaneComposite(id) {
        return this.getComposite(id);
    }
    /**
     * Returns an array of registered viewlets known to the platform.
     */
    getPaneComposites() {
        return this.getComposites();
    }
}
Registry.add(Extensions.Viewlets, new PaneCompositeRegistry());
Registry.add(Extensions.Panels, new PaneCompositeRegistry());
Registry.add(Extensions.Auxiliary, new PaneCompositeRegistry());
Registry.add(Extensions.ChatBar, new PaneCompositeRegistry());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFuZWNvbXBvc2l0ZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhbmVjb21wb3NpdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxTQUFTLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNuRixPQUFPLEVBQXlDLHFCQUFxQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFJcEksT0FBTyxFQUFXLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2xFLE9BQU8sRUFBVSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNqRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEYsT0FBTyxFQUFxQixZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUdyRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNoRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUk1RCxJQUFlLGFBQWEsR0FBNUIsTUFBZSxhQUFtRCxTQUFRLFNBQXNCO0lBSXRHLFlBQ0MsRUFBVSxFQUNTLGdCQUFtQyxFQUMzQixjQUErQixFQUN6QixvQkFBMkMsRUFDN0QsWUFBMkIs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