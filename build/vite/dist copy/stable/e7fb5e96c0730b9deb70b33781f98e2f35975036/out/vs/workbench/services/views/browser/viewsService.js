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
import { Disposable, toDisposable, DisposableStore, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { FocusedViewContext, getVisbileViewContextKey } from '../../../common/contextkeys.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { isString } from '../../../../base/common/types.js';
import { MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { PaneCompositeDescriptor, PaneComposite } from '../../../browser/panecomposite.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
import { URI } from '../../../../base/common/uri.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IEditorGroupsService } from '../../editor/common/editorGroupsService.js';
import { FilterViewPaneContainer } from '../../../browser/parts/views/viewsViewlet.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IViewsService } from '../common/viewsService.js';
let ViewsService = class ViewsService extends Disposable {
    constructor(viewDescriptorService, paneCompositeService, contextKeyService, layoutService, editorService) {
        super();
        this.viewDescriptorService = viewDescriptorService;
        this.paneCompositeService = paneCompositeService;
        this.contextKeyService = contextKeyService;
        this.layoutService = layoutService;
        this.editorService = editorService;
        this._onDidChangeViewVisibility = this._register(new Emitter());
        this.onDidChangeViewVisibility = this._onDidChangeViewVisibility.event;
        this._onDidChangeViewContainerVisibility = this._register(new Emitter());
        this.onDidChangeViewContainerVisibility = this._onDidChangeViewContainerVisibility.event;
        this._onDidChangeFocusedView = this._register(new Emitter());
        this.onDidChangeFocusedView = this._onDidChangeFocusedView.event;
        this.viewContainerDisposables = this._register(new DisposableMap());
        this.viewDisposable = new Map();
        this.enabledViewContainersContextKeys = new Map();
        this.visibleViewContextKeys = new Map();
        this.viewPaneContainers = new Map();
        this._register(toDisposable(() => {
            this.viewDisposable.forEach(disposable => disposable.dispose());
            this.viewDisposable.clear();
        }));
        this.viewDescriptorService.viewContainers.forEach(viewContainer => this.onDidRegisterViewContainer(viewContainer, this.viewDescriptorService.getViewContainerLocation(viewContainer)));
        this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeContainers(added, removed)));
        this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeContainerLocation(viewContainer, from, to)));
        // View Container Visibility
        this._register(this.paneCompositeService.onDidPaneCompositeOpen(e => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: true, location: e.viewContainerLocation })));
        this._register(this.paneCompositeService.onDidPaneCompositeClose(e => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: false, location: e.viewContainerLocation })));
        this.focusedViewContextKey = FocusedViewContext.bindTo(contextKeyService);
    }
    onViewsAdded(added) {
        for (const view of added) {
            this.onViewsVisibilityChanged(view, view.isBodyVisible());
        }
    }
    onViewsVisibilityChanged(view, visible) {
        this.getOrCreateActiveViewContextKey(view).set(visible);
        this._onDidChangeViewVisibility.fire({ id: view.id, visible: visible });
    }
    onViewsRemoved(removed) {
        for (const view of removed) {
            this.onViewsVisibilityChanged(view, false);
        }
    }
    getOrCreateActiveViewContextKey(view) {
        const visibleContextKeyId = getVisbileViewContextKey(view.id);
        let contextKey = this.visibleViewContextKeys.get(visibleContextKeyId);
        if (!contextKey) {
            contextKey = new RawContextKey(visibleContextKeyId, false).bindTo(this.contextKeyService);
            this.visibleViewContextKeys.set(visibleContextKeyId, contextKey);
        }
        return contextKey;
    }
    onDidChangeContainers(added, removed) {
        for (const { container, location } of removed) {
            this.onDidDeregisterViewContainer(container, location);
        }
        for (const { container, location } of added) {
            this.onDidRegisterViewContainer(container, location);
        }
    }
    onDidRegisterViewContainer(viewContainer, viewContainerLocation) {
        this.registerPaneComposite(viewContainer, viewContainerLocation);
        const disposables = new DisposableStore();
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        this.onViewDescriptorsAdded(viewContainerModel.allViewDescriptors, viewContainer);
        disposables.add(viewContainerModel.onDidChangeAllViewDescriptors(({ added, removed }) => {
            this.onViewDescriptorsAdded(added, viewContainer);
            this.onViewDescriptorsRemoved(removed);
        }));
        this.updateViewContainerEnablementContextKey(viewContainer);
        disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.updateViewContainerEnablementContextKey(viewContainer)));
        disposables.add(this.registerOpenViewContainerAction(viewContainer));
        this.viewContainerDisposables.set(viewContainer.id, disposables);
    }
    onDidDeregisterViewContainer(viewContainer, viewContainerLocation) {
        this.deregisterPaneComposite(viewContainer, viewContainerLocation);
        this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
    }
    onDidChangeContainerLocation(viewContainer, from, to) {
        this.deregisterPaneComposite(viewContainer, from);
        this.registerPaneComposite(viewContainer, to);
        // Open view container if part is visible and there is only one view container in location
        if (this.layoutService.isVisible(this.paneCompositeService.getPartId(to)) &&
            this.viewDescriptorService.getViewContainersByLocation(to).filter(vc => this.isViewContainerActive(vc.id)).length === 1) {
            this.openViewContainer(viewContainer.id);
        }
    }
    onViewDescriptorsAdded(views, container) {
        const location = this.viewDescriptorService.getViewContainerLocation(container);
        if (location === null) {
            return;
        }
        for (const viewDescriptor of views) {
            const disposables = new DisposableStore();
            disposables.add(this.registerOpenViewAction(viewDescriptor));
            disposables.add(this.registerFocusViewAction(viewDescriptor, container.title));
            disposables.add(this.registerResetViewLocationAction(viewDescriptor));
            this.viewDisposable.set(viewDescriptor, disposables);
        }
    }
    onViewDescriptorsRemoved(views) {
        for (const view of views) {
            const disposable = this.viewDisposable.get(view);
            if (disposable) {
                disposable.dispose();
                this.viewDisposable.delete(view);
            }
        }
    }
    updateViewContainerEnablementContextKey(viewContainer) {
        let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
        if (!contextKey) {
            contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
            this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
        }
        contextKey.set(!(viewContainer.hideIfEmpty && this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length === 0));
    }
    async openComposite(compositeId, location, focus) {
        return this.paneCompositeService.openPaneComposite(compositeId, location, focus);
    }
    getComposite(compositeId, location) {
        return this.paneCompositeService.getPaneComposite(compositeId, location);
    }
    // One view container can be visible at a time in a location
    isViewContainerVisible(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(id);
        if (!viewContainer) {
            return false;
        }
        const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
        if (viewContainerLocation === null) {
            return false;
        }
        return this.paneCompositeService.getActivePaneComposite(viewContainerLocation)?.getId() === id;
    }
    // Multiple view containers can be active/inactive at a time in a location
    isViewContainerActive(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(id);
        if (!viewContainer) {
            return false;
        }
        if (!viewContainer.hideIfEmpty) {
            return true;
        }
        return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
    }
    getVisibleViewContainer(location) {
        const viewContainerId = this.paneCompositeService.getActivePaneComposite(location)?.getId();
        return viewContainerId ? this.viewDescriptorService.getViewContainerById(viewContainerId) : null;
    }
    getActiveViewPaneContainerWithId(viewContainerId) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
        return viewContainer ? this.getActiveViewPaneContainer(viewContainer) : null;
    }
    async openViewContainer(id, focus) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(id);
        if (viewContainer) {
            const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
            if (viewContainerLocation !== null) {
                const paneComposite = await this.paneCompositeService.openPaneComposite(id, viewContainerLocation, focus);
                return paneComposite || null;
            }
        }
        return null;
    }
    async closeViewContainer(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerById(id);
        if (viewContainer) {
            const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
            const isActive = viewContainerLocation !== null && this.paneCompositeService.getActivePaneComposite(viewContainerLocation);
            if (viewContainerLocation !== null) {
                return isActive ? this.layoutService.setPartHidden(true, this.paneCompositeService.getPartId(viewContainerLocation)) : undefined;
            }
        }
    }
    isViewVisible(id) {
        const activeView = this.getActiveViewWithId(id);
        return activeView?.isBodyVisible() || false;
    }
    getActiveViewWithId(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
        if (viewContainer) {
            const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
            if (activeViewPaneContainer) {
                return activeViewPaneContainer.getView(id);
            }
        }
        return null;
    }
    getViewWithId(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
        if (viewContainer) {
            const viewPaneContainer = this.viewPaneContainers.get(viewContainer.id);
            if (viewPaneContainer) {
                return viewPaneContainer.getView(id);
            }
        }
        return null;
    }
    getFocusedView() {
        const viewId = this.contextKeyService.getContextKeyValue(FocusedViewContext.key) ?? '';
        return this.viewDescriptorService.getViewDescriptorById(viewId.toString());
    }
    getFocusedViewName() {
        const textEditorFocused = this.editorService.activeTextEditorControl?.hasTextFocus() ? localize('editor', "Text Editor") : undefined;
        return this.getFocusedView()?.name?.value ?? textEditorFocused ?? '';
    }
    async openView(id, focus) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
        if (!viewContainer) {
            return null;
        }
        if (!this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.some(viewDescriptor => viewDescriptor.id === id)) {
            return null;
        }
        const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
        const compositeDescriptor = this.getComposite(viewContainer.id, location);
        if (compositeDescriptor) {
            const paneComposite = await this.openComposite(compositeDescriptor.id, location);
            if (paneComposite?.openView) {
                return paneComposite.openView(id, focus) || null;
            }
            else if (focus) {
                paneComposite?.focus();
            }
        }
        return null;
    }
    closeView(id) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
        if (viewContainer) {
            const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
            if (activeViewPaneContainer) {
                const view = activeViewPaneContainer.getView(id);
                if (view) {
                    if (activeViewPaneContainer.views.length === 1) {
                        const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
                        if (location === 0 /* ViewContainerLocation.Sidebar */) {
                            this.layoutService.setPartHidden(true, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
                        }
                        else if (location === 1 /* ViewContainerLocation.Panel */ || location === 2 /* ViewContainerLocation.AuxiliaryBar */) {
                            this.paneCompositeService.hideActivePaneComposite(location);
                        }
                        // The blur event doesn't fire on WebKit when the focused element is hidden,
                        // so the context key needs to be forced here too otherwise a view may still
                        // think it's showing, breaking toggle commands.
                        if (this.focusedViewContextKey.get() === id) {
                            this.focusedViewContextKey.reset();
                        }
                    }
                    else {
                        view.setExpanded(false);
                    }
                }
            }
        }
    }
    getActiveViewPaneContainer(viewContainer) {
        const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
        if (location === null) {
            return null;
        }
        const activePaneComposite = this.paneCompositeService.getActivePaneComposite(location);
        if (activePaneComposite?.getId() === viewContainer.id) {
            return activePaneComposite.getViewPaneContainer() || null;
        }
        return null;
    }
    getViewProgressIndicator(viewId) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(viewId);
        if (!viewContainer) {
            return undefined;
        }
        const viewPaneContainer = this.viewPaneContainers.get(viewContainer.id);
        if (!viewPaneContainer) {
            return undefined;
        }
        const view = viewPaneContainer.getView(viewId);
        if (!view) {
            return undefined;
        }
        if (viewPaneContainer.isViewMergedWithContainer()) {
            return this.getViewContainerProgressIndicator(viewContainer);
        }
        return view.getProgressIndicator();
    }
    getViewContainerProgressIndicator(viewContainer) {
        const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
        if (viewContainerLocation === null) {
            return undefined;
        }
        return this.paneCompositeService.getProgressIndicator(viewContainer.id, viewContainerLocation);
    }
    registerOpenViewContainerAction(viewContainer) {
        const disposables = new DisposableStore();
        if (viewContainer.openCommandActionDescriptor) {
            const { id, mnemonicTitle, keybindings, order } = viewContainer.openCommandActionDescriptor ?? { id: viewContainer.id };
            const title = viewContainer.openCommandActionDescriptor.title ?? viewContainer.title;
            const that = this;
            disposables.add(registerAction2(class OpenViewContainerAction extends Action2 {
                constructor() {
                    super({
                        id,
                        get title() {
                            const viewContainerLocation = that.viewDescriptorService.getViewContainerLocation(viewContainer);
                            const localizedTitle = typeof title === 'string' ? title : title.value;
                            const originalTitle = typeof title === 'string' ? title : title.original;
                            if (viewContainerLocation === 0 /* ViewContainerLocation.Sidebar */) {
                                return { value: localize('show view', "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
                            }
                            else {
                                return { value: localize('toggle view', "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
                            }
                        },
                        category: Categories.View,
                        precondition: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
                        keybinding: keybindings ? { ...keybindings, weight: 200 /* KeybindingWeight.WorkbenchContrib */ } : undefined,
                        f1: true
                    });
                }
                async run(serviceAccessor) {
                    const editorGroupService = serviceAccessor.get(IEditorGroupsService);
                    const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
                    const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
                    const viewsService = serviceAccessor.get(IViewsService);
                    const viewContainerLocation = viewDescriptorService.getViewContainerLocation(viewContainer);
                    switch (viewContainerLocation) {
                        case 2 /* ViewContainerLocation.AuxiliaryBar */:
                        case 0 /* ViewContainerLocation.Sidebar */: {
                            const part = viewContainerLocation === 0 /* ViewContainerLocation.Sidebar */ ? "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */ : "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */;
                            if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus(part)) {
                                await viewsService.openViewContainer(viewContainer.id, true);
                            }
                            else {
                                editorGroupService.activeGroup.focus();
                            }
                            break;
                        }
                        case 1 /* ViewContainerLocation.Panel */:
                            if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */)) {
                                await viewsService.openViewContainer(viewContainer.id, true);
                            }
                            else {
                                viewsService.closeViewContainer(viewContainer.id);
                            }
                            break;
                    }
                }
            }));
            if (mnemonicTitle) {
                const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer);
                disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
                    command: {
                        id,
                        title: mnemonicTitle,
                    },
                    group: defaultLocation === 0 /* ViewContainerLocation.Sidebar */ ? '3_sidebar' : defaultLocation === 2 /* ViewContainerLocation.AuxiliaryBar */ ? '4_auxbar' : '5_panel',
                    when: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
                    order: order ?? Number.MAX_VALUE
                }));
            }
        }
        return disposables;
    }
    registerOpenViewAction(viewDescriptor) {
        const disposables = new DisposableStore();
        const title = viewDescriptor.openCommandActionDescriptor?.title ?? viewDescriptor.name;
        const commandId = viewDescriptor.openCommandActionDescriptor?.id ?? `${viewDescriptor.id}.open`;
        const that = this;
        disposables.add(registerAction2(class OpenViewAction extends Action2 {
            constructor() {
                super({
                    id: commandId,
                    get title() {
                        const viewContainerLocation = that.viewDescriptorService.getViewLocationById(viewDescriptor.id);
                        const localizedTitle = typeof title === 'string' ? title : title.value;
                        const originalTitle = typeof title === 'string' ? title : title.original;
                        if (viewContainerLocation === 0 /* ViewContainerLocation.Sidebar */) {
                            return { value: localize('show view', "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
                        }
                        else {
                            return { value: localize('toggle view', "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
                        }
                    },
                    category: Categories.View,
                    precondition: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
                    keybinding: viewDescriptor.openCommandActionDescriptor?.keybindings ? { ...viewDescriptor.openCommandActionDescriptor.keybindings, weight: 200 /* KeybindingWeight.WorkbenchContrib */ } : undefined,
                    f1: viewDescriptor.openCommandActionDescriptor ? true : undefined,
                    metadata: {
                        description: localize('open view', "Opens view {0}", viewDescriptor.name.value),
                        args: [
                            {
                                name: 'options',
                                schema: {
                                    type: 'object',
                                    properties: {
                                        'preserveFocus': {
                                            type: 'boolean',
                                            default: false,
                                            description: localize('preserveFocus', "Whether to preserve the existing focus when opening the view.")
                                        }
                                    },
                                }
                            }
                        ]
                    }
                });
            }
            async run(serviceAccessor, options) {
                const editorGroupService = serviceAccessor.get(IEditorGroupsService);
                const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
                const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
                const viewsService = serviceAccessor.get(IViewsService);
                const contextKeyService = serviceAccessor.get(IContextKeyService);
                const focusedViewId = FocusedViewContext.getValue(contextKeyService);
                if (focusedViewId === viewDescriptor.id && !options?.preserveFocus) {
                    const viewLocation = viewDescriptorService.getViewLocationById(viewDescriptor.id);
                    if (viewDescriptorService.getViewLocationById(viewDescriptor.id) === 0 /* ViewContainerLocation.Sidebar */) {
                        // focus the editor if the view is focused and in the side bar
                        editorGroupService.activeGroup.focus();
                    }
                    else if (viewLocation !== null) {
                        // otherwise hide the part where the view lives if focused
                        layoutService.setPartHidden(true, that.paneCompositeService.getPartId(viewLocation));
                    }
                }
                else {
                    await viewsService.openView(viewDescriptor.id, !options?.preserveFocus);
                }
            }
        }));
        if (viewDescriptor.openCommandActionDescriptor?.mnemonicTitle) {
            const defaultViewContainer = this.viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
            if (defaultViewContainer) {
                const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(defaultViewContainer);
                disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
                    command: {
                        id: commandId,
                        title: viewDescriptor.openCommandActionDescriptor.mnemonicTitle,
                    },
                    group: defaultLocation === 0 /* ViewContainerLocation.Sidebar */ ? '3_sidebar' : defaultLocation === 2 /* ViewContainerLocation.AuxiliaryBar */ ? '4_auxbar' : '5_panel',
                    when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
                    order: viewDescriptor.openCommandActionDescriptor.order ?? Number.MAX_VALUE
                }));
            }
        }
        return disposables;
    }
    registerFocusViewAction(viewDescriptor, category) {
        return registerAction2(class FocusViewAction extends Action2 {
            constructor() {
                const title = localize2({ key: 'focus view', comment: ['{0} indicates the name of the view to be focused.'] }, "Focus on {0} View", viewDescriptor.name.value);
                super({
                    id: viewDescriptor.focusCommand ? viewDescriptor.focusCommand.id : `${viewDescriptor.id}.focus`,
                    title,
                    category,
                    menu: [{
                            id: MenuId.CommandPalette,
                            when: viewDescriptor.when,
                        }],
                    keybinding: {
                        when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                        primary: viewDescriptor.focusCommand?.keybindings?.primary,
                        secondary: viewDescriptor.focusCommand?.keybindings?.secondary,
                        linux: viewDescriptor.focusCommand?.keybindings?.linux,
                        mac: viewDescriptor.focusCommand?.keybindings?.mac,
                        win: viewDescriptor.focusCommand?.keybindings?.win
                    },
                    metadata: {
                        description: title.value,
                        args: [
                            {
                                name: 'focusOptions',
                                description: 'Focus Options',
                                schema: {
                                    type: 'object',
                                    properties: {
                                        'preserveFocus': {
                                            type: 'boolean',
                                            default: false
                                        }
                                    },
                                }
                            }
                        ]
                    }
                });
            }
            run(accessor, options) {
                accessor.get(IViewsService).openView(viewDescriptor.id, !options?.preserveFocus);
            }
        });
    }
    registerResetViewLocationAction(viewDescriptor) {
        return registerAction2(class ResetViewLocationAction extends Action2 {
            constructor() {
                super({
                    id: `${viewDescriptor.id}.resetViewLocation`,
                    title: localize2('resetViewLocation', "Reset Location"),
                    menu: [{
                            id: MenuId.ViewTitleContext,
                            when: ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals('view', viewDescriptor.id), ContextKeyExpr.equals(`${viewDescriptor.id}.defaultViewLocation`, false))),
                            group: '1_hide',
                            order: 2
                        }],
                });
            }
            run(accessor) {
                const viewDescriptorService = accessor.get(IViewDescriptorService);
                const defaultContainer = viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
                const containerModel = viewDescriptorService.getViewContainerModel(defaultContainer);
                // The default container is hidden so we should try to reset its location first
                if (defaultContainer.hideIfEmpty && containerModel.visibleViewDescriptors.length === 0) {
                    const defaultLocation = viewDescriptorService.getDefaultViewContainerLocation(defaultContainer);
                    viewDescriptorService.moveViewContainerToLocation(defaultContainer, defaultLocation, undefined, this.desc.id);
                }
                viewDescriptorService.moveViewsToContainer([viewDescriptor], defaultContainer, undefined, this.desc.id);
                accessor.get(IViewsService).openView(viewDescriptor.id, true);
            }
        });
    }
    registerPaneComposite(viewContainer, viewContainerLocation) {
        const that = this;
        let PaneContainer = class PaneContainer extends PaneComposite {
            constructor(telemetryService, contextService, storageService, instantiationService, themeService, contextMenuService, extensionService) {
                super(viewContainer.id, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
            }
            createViewPaneContainer(element) {
                const viewPaneContainerDisposables = this._register(new DisposableStore());
                // Use composite's instantiation service to get the editor progress service for any editors instantiated within the composite
                const viewPaneContainer = that.createViewPaneContainer(element, viewContainer, viewContainerLocation, viewPaneContainerDisposables, this.instantiationService);
                // Only updateTitleArea for non-filter views: microsoft/vscode-remote-release#3676
                if (!(viewPaneContainer instanceof FilterViewPaneContainer)) {
                    viewPaneContainerDisposables.add(Event.any(viewPaneContainer.onDidAddViews, viewPaneContainer.onDidRemoveViews, viewPaneContainer.onTitleAreaUpdate)(() => {
                        // Update title area since there is no better way to update secondary actions
                        this.updateTitleArea();
                    }));
                }
                return viewPaneContainer;
            }
        };
        PaneContainer = __decorate([
            __param(0, ITelemetryService),
            __param(1, IWorkspaceContextService),
            __param(2, IStorageService),
            __param(3, IInstantiationService),
            __param(4, IThemeService),
            __param(5, IContextMenuService),
            __param(6, IExtensionService)
        ], PaneContainer);
        Registry.as(this.paneCompositeService.getRegistryId(viewContainerLocation)).registerPaneComposite(PaneCompositeDescriptor.create(PaneContainer, viewContainer.id, typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value, isString(viewContainer.icon) ? viewContainer.icon : undefined, viewContainer.order, viewContainer.requestedIndex, viewContainer.icon instanceof URI ? viewContainer.icon : undefined));
    }
    deregisterPaneComposite(viewContainer, viewContainerLocation) {
        Registry.as(this.paneCompositeService.getRegistryId(viewContainerLocation)).deregisterPaneComposite(viewContainer.id);
    }
    createViewPaneContainer(element, viewContainer, viewContainerLocation, disposables, instantiationService) {
        const viewPaneContainer = instantiationService.createInstance(viewContainer.ctorDescriptor.ctor, ...(viewContainer.ctorDescriptor.staticArguments || []));
        this.viewPaneContainers.set(viewPaneContainer.getId(), viewPaneContainer);
        disposables.add(toDisposable(() => this.viewPaneContainers.delete(viewPaneContainer.getId())));
        disposables.add(viewPaneContainer.onDidAddViews(views => this.onViewsAdded(views)));
        disposables.add(viewPaneContainer.onDidChangeViewVisibility(view => this.onViewsVisibilityChanged(view, view.isBodyVisible())));
        disposables.add(viewPaneContainer.onDidRemoveViews(views => this.onViewsRemoved(views)));
        disposables.add(viewPaneContainer.onDidFocusView(view => {
            if (this.focusedViewContextKey.get() !== view.id) {
                this.focusedViewContextKey.set(view.id);
                this._onDidChangeFocusedView.fire();
            }
        }));
        disposables.add(viewPaneContainer.onDidBlurView(view => {
            if (this.focusedViewContextKey.get() === view.id) {
                this.focusedViewContextKey.reset();
                this._onDidChangeFocusedView.fire();
            }
        }));
        return viewPaneContainer;
    }
};
ViewsService = __decorate([
    __param(0, IViewDescriptorService),
    __param(1, IPaneCompositePartService),
    __param(2, IContextKeyService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IEditorService)
], ViewsService);
export { ViewsService };
function getEnabledViewContainerContextKey(viewContainerId) { return `viewContainer.${viewContainerId}.enabled`; }
registerSingleton(IViewsService, ViewsService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2Jyb3dzZXIvdmlld3NTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLGVBQWUsRUFBRSxhQUFhLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3SCxPQUFPLEVBQUUsc0JBQXNCLEVBQW9GLE1BQU0sMEJBQTBCLENBQUM7QUFDcEosT0FBTyxFQUFFLGtCQUFrQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDOUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsY0FBYyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoSCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXpELE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxPQUFPLEVBQW9CLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFckgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSx1QkFBdUIsRUFBeUIsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEgsT0FBTyxFQUFFLHVCQUF1QixFQUFTLE1BQU0sdUNBQXVDLENBQUM7QUFDdkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN2RixPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUV6RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRW5ELElBQU0sWUFBWSxHQUFsQixNQUFNLFlBQWEsU0FBUSxVQUFVO0lBcUIzQyxZQUN5QixxQkFBOEQsRUFDM0Qsb0JBQWdFLEVBQ3ZFLGlCQUFzRCxFQUNqRCxhQUF1RCxFQUNoRSxhQUE4QztRQUU5RCxLQUFLLEVBQUUsQ0FBQztRQU5pQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXdCO1FBQzFDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBMkI7UUFDdEQsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNoQyxrQkFBYSxHQUFiLGFBQWEsQ0FBeUI7UUFDL0Msa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBbkI5QywrQkFBMEIsR0FBOEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0MsQ0FBQyxDQUFDO1FBQ2hKLDhCQUF5QixHQUE0QyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDO1FBRW5HLHdDQUFtQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXFFLENBQUMsQ0FBQztRQUMvSSx1Q0FBa0MsR0FBRyxJQUFJLENBQUMsbUNBQW1DLENBQUMsS0FBSyxDQUFDO1FBRTVFLDRCQUF1QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ3RFLDJCQUFzQixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxLQUFLLENBQUM7UUFFcEQsNkJBQXdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFjL0UsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLEdBQUcsRUFBZ0MsQ0FBQztRQUM5RCxJQUFJLENBQUMsZ0NBQWdDLEdBQUcsSUFBSSxHQUFHLEVBQWdDLENBQUM7UUFDaEYsSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksR0FBRyxFQUFnQyxDQUFDO1FBQ3RFLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsRUFBNkIsQ0FBQztRQUUvRCxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDaEMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNoRSxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzdCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FBRSxDQUFDLENBQUMsQ0FBQztRQUN4TCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6SSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLDRCQUE0QixDQUFDLGFBQWEsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRXJLLDRCQUE0QjtRQUM1QixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwTSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV0TSxJQUFJLENBQUMscUJBQXFCLEdBQUcsa0JBQWtCLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDM0UsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUFjO1FBQ2xDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0YsQ0FBQztJQUVPLHdCQUF3QixDQUFDLElBQVcsRUFBRSxPQUFnQjtRQUM3RCxJQUFJLENBQUMsK0JBQStCLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBRU8sY0FBYyxDQUFDLE9BQWdCO1FBQ3RDLEtBQUssTUFBTSxJQUFJLElBQUksT0FBTyxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM1QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLCtCQUErQixDQUFDLElBQVc7UUFDbEQsTUFBTSxtQkFBbUIsR0FBRyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUQsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1FBQ3RFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNqQixVQUFVLEdBQUcsSUFBSSxhQUFhLENBQUMsbUJBQW1CLEVBQUUsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzFGLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDbEUsQ0FBQztRQUNELE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxLQUFtRixFQUFFLE9BQXFGO1FBQ3ZNLEtBQUssTUFBTSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUMvQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3hELENBQUM7UUFDRCxLQUFLLE1BQU0sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLElBQUksS0FBSyxFQUFFLENBQUM7WUFDN0MsSUFBSSxDQUFDLDBCQUEwQixDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN0RCxDQUFDO0lBQ0YsQ0FBQztJQUVPLDBCQUEwQixDQUFDLGFBQTRCLEVBQUUscUJBQTRDO1FBQzVHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxhQUFhLEVBQUUscUJBQXFCLENBQUMsQ0FBQztRQUNqRSxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRTFDLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHFCQUFxQixDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzNGLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNsRixXQUFXLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLDZCQUE2QixDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtZQUN2RixJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ2xELElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLHVDQUF1QyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzVELFdBQVcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsZ0NBQWdDLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHVDQUF1QyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4SSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBRXJFLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRU8sNEJBQTRCLENBQUMsYUFBNEIsRUFBRSxxQkFBNEM7UUFDOUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGFBQWEsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBQ25FLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVPLDRCQUE0QixDQUFDLGFBQTRCLEVBQUUsSUFBMkIsRUFBRSxFQUF5QjtRQUN4SCxJQUFJLENBQUMsdUJBQXVCLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2xELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFOUMsMEZBQTBGO1FBQzFGLElBQ0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNyRSxJQUFJLENBQUMscUJBQXFCLENBQUMsMkJBQTJCLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQ3RILENBQUM7WUFDRixJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDRixDQUFDO0lBRU8sc0JBQXNCLENBQUMsS0FBcUMsRUFBRSxTQUF3QjtRQUM3RixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDaEYsSUFBSSxRQUFRLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDdkIsT0FBTztRQUNSLENBQUM7UUFFRCxLQUFLLE1BQU0sY0FBYyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ3BDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7WUFDMUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUM3RCxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDL0UsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsK0JBQStCLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztZQUN0RSxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdEQsQ0FBQztJQUNGLENBQUM7SUFFTyx3QkFBd0IsQ0FBQyxLQUFxQztRQUNyRSxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzFCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2pELElBQUksVUFBVSxFQUFFLENBQUM7Z0JBQ2hCLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sdUNBQXVDLENBQUMsYUFBNEI7UUFDM0UsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0UsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLGlDQUFpQyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxRyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDekUsQ0FBQztRQUNELFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLHFCQUFxQixDQUFDLHFCQUFxQixDQUFDLGFBQWEsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3BKLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYSxDQUFDLFdBQW1CLEVBQUUsUUFBK0IsRUFBRSxLQUFlO1FBQ2hHLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDbEYsQ0FBQztJQUVPLFlBQVksQ0FBQyxXQUFtQixFQUFFLFFBQStCO1FBQ3hFLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRUQsNERBQTREO0lBQzVELHNCQUFzQixDQUFDLEVBQVU7UUFDaEMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNwQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRyxJQUFJLHFCQUFxQixLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3BDLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLHNCQUFzQixDQUFDLHFCQUFxQixDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ2hHLENBQUM7SUFFRCwwRUFBMEU7SUFDMUUscUJBQXFCLENBQUMsRUFBVTtRQUMvQixNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDaEMsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMscUJBQXFCLENBQUMscUJBQXFCLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUN6RyxDQUFDO0lBRUQsdUJBQXVCLENBQUMsUUFBK0I7UUFDdEQsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDO1FBQzVGLE9BQU8sZUFBZSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsb0JBQW9CLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNsRyxDQUFDO0lBRUQsZ0NBQWdDLENBQUMsZUFBdUI7UUFDdkQsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3ZGLE9BQU8sYUFBYSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUM5RSxDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQixDQUFDLEVBQVUsRUFBRSxLQUFlO1FBQ2xELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMxRSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ25CLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2pHLElBQUkscUJBQXFCLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDMUcsT0FBTyxhQUFhLElBQUksSUFBSSxDQUFDO1lBQzlCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsS0FBSyxDQUFDLGtCQUFrQixDQUFDLEVBQVU7UUFDbEMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFFLElBQUksYUFBYSxFQUFFLENBQUM7WUFDbkIsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDakcsTUFBTSxRQUFRLEdBQUcscUJBQXFCLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxzQkFBc0IsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQzNILElBQUkscUJBQXFCLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQ3BDLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUNsSSxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxhQUFhLENBQUMsRUFBVTtRQUN2QixNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDaEQsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLElBQUksS0FBSyxDQUFDO0lBQzdDLENBQUM7SUFFRCxtQkFBbUIsQ0FBa0IsRUFBVTtRQUM5QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUUsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQixNQUFNLHVCQUF1QixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMvRSxJQUFJLHVCQUF1QixFQUFFLENBQUM7Z0JBQzdCLE9BQU8sdUJBQXVCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBTSxDQUFDO1lBQ2pELENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsYUFBYSxDQUFrQixFQUFVO1FBQ3hDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5RSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ25CLE1BQU0saUJBQWlCLEdBQW1DLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3hHLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDdkIsT0FBTyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFNLENBQUM7WUFDM0MsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxjQUFjO1FBQ2IsTUFBTSxNQUFNLEdBQVcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMvRixPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRUQsa0JBQWtCO1FBQ2pCLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ3JJLE9BQU8sSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksaUJBQWlCLElBQUksRUFBRSxDQUFDO0lBQ3RFLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUSxDQUFrQixFQUFVLEVBQUUsS0FBZTtRQUMxRCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELElBQUksQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMscUJBQXFCLENBQUMsYUFBYSxDQUFDLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQzdJLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNwRixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxRQUFTLENBQUMsQ0FBQztRQUMzRSxJQUFJLG1CQUFtQixFQUFFLENBQUM7WUFDekIsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxRQUFTLENBQStCLENBQUM7WUFDaEgsSUFBSSxhQUFhLEVBQUUsUUFBUSxFQUFFLENBQUM7Z0JBQzdCLE9BQU8sYUFBYSxDQUFDLFFBQVEsQ0FBSSxFQUFFLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDO1lBQ3JELENBQUM7aUJBQU0sSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDbEIsYUFBYSxFQUFFLEtBQUssRUFBRSxDQUFDO1lBQ3hCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsU0FBUyxDQUFDLEVBQVU7UUFDbkIsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksYUFBYSxFQUFFLENBQUM7WUFDbkIsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDL0UsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO2dCQUM3QixNQUFNLElBQUksR0FBRyx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2pELElBQUksSUFBSSxFQUFFLENBQUM7b0JBQ1YsSUFBSSx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO3dCQUNoRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLENBQUM7d0JBQ3BGLElBQUksUUFBUSwwQ0FBa0MsRUFBRSxDQUFDOzRCQUNoRCxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxJQUFJLHFEQUFxQixDQUFDO3dCQUM1RCxDQUFDOzZCQUFNLElBQUksUUFBUSx3Q0FBZ0MsSUFBSSxRQUFRLCtDQUF1QyxFQUFFLENBQUM7NEJBQ3hHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsQ0FBQzt3QkFDN0QsQ0FBQzt3QkFFRCw0RUFBNEU7d0JBQzVFLDRFQUE0RTt3QkFDNUUsZ0RBQWdEO3dCQUNoRCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQzs0QkFDN0MsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxDQUFDO3dCQUNwQyxDQUFDO29CQUNGLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO29CQUN6QixDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFTywwQkFBMEIsQ0FBQyxhQUE0QjtRQUM5RCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDcEYsSUFBSSxRQUFRLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDdkIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsc0JBQXNCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdkYsSUFBSSxtQkFBbUIsRUFBRSxLQUFLLEVBQUUsS0FBSyxhQUFhLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkQsT0FBTyxtQkFBbUIsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLElBQUksQ0FBQztRQUMzRCxDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsd0JBQXdCLENBQUMsTUFBYztRQUN0QyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEYsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDL0MsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELElBQUksaUJBQWlCLENBQUMseUJBQXlCLEVBQUUsRUFBRSxDQUFDO1lBQ25ELE9BQU8sSUFBSSxDQUFDLGlDQUFpQyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQ3BDLENBQUM7SUFFTyxpQ0FBaUMsQ0FBQyxhQUE0QjtRQUNyRSxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRyxJQUFJLHFCQUFxQixLQUFLLElBQUksRUFBRSxDQUFDO1lBQ3BDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLHFCQUFxQixDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVPLCtCQUErQixDQUFDLGFBQTRCO1FBQ25FLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsSUFBSSxhQUFhLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztZQUMvQyxNQUFNLEVBQUUsRUFBRSxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEdBQUcsYUFBYSxDQUFDLDJCQUEyQixJQUFJLEVBQUUsRUFBRSxFQUFFLGFBQWEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN4SCxNQUFNLEtBQUssR0FBRyxhQUFhLENBQUMsMkJBQTJCLENBQUMsS0FBSyxJQUFJLGFBQWEsQ0FBQyxLQUFLLENBQUM7WUFDckYsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO1lBQ2xCLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLE1BQU0sdUJBQXdCLFNBQVEsT0FBTztnQkFDNUU7b0JBQ0MsS0FBSyxDQUFDO3dCQUNMLEVBQUU7d0JBQ0YsSUFBSSxLQUFLOzRCQUNSLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FBQyxDQUFDOzRCQUNqRyxNQUFNLGNBQWMsR0FBRyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQzs0QkFDdkUsTUFBTSxhQUFhLEdBQUcsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7NEJBQ3pFLElBQUkscUJBQXFCLDBDQUFrQyxFQUFFLENBQUM7Z0NBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLFdBQVcsRUFBRSxVQUFVLEVBQUUsY0FBYyxDQUFDLEVBQUUsUUFBUSxFQUFFLFFBQVEsYUFBYSxFQUFFLEVBQUUsQ0FBQzs0QkFDeEcsQ0FBQztpQ0FBTSxDQUFDO2dDQUNQLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLGFBQWEsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLEVBQUUsUUFBUSxFQUFFLFVBQVUsYUFBYSxFQUFFLEVBQUUsQ0FBQzs0QkFDOUcsQ0FBQzt3QkFDRixDQUFDO3dCQUNELFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSTt3QkFDekIsWUFBWSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO3dCQUNyRixVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsV0FBVyxFQUFFLE1BQU0sNkNBQW1DLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUzt3QkFDbkcsRUFBRSxFQUFFLElBQUk7cUJBQ1IsQ0FBQyxDQUFDO2dCQUNKLENBQUM7Z0JBQ00sS0FBSyxDQUFDLEdBQUcsQ0FBQyxlQUFpQztvQkFDakQsTUFBTSxrQkFBa0IsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLG9CQUFvQixDQUFDLENBQUM7b0JBQ3JFLE1BQU0scUJBQXFCLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO29CQUMxRSxNQUFNLGFBQWEsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7b0JBQ25FLE1BQU0sWUFBWSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7b0JBQ3hELE1BQU0scUJBQXFCLEdBQUcscUJBQXFCLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLENBQUM7b0JBQzVGLFFBQVEscUJBQXFCLEVBQUUsQ0FBQzt3QkFDL0IsZ0RBQXdDO3dCQUN4QywwQ0FBa0MsQ0FBQyxDQUFDLENBQUM7NEJBQ3BDLE1BQU0sSUFBSSxHQUFHLHFCQUFxQiwwQ0FBa0MsQ0FBQyxDQUFDLG9EQUFvQixDQUFDLDZEQUF3QixDQUFDOzRCQUNwSCxJQUFJLENBQUMsWUFBWSxDQUFDLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQ0FDN0YsTUFBTSxZQUFZLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQzs0QkFDOUQsQ0FBQztpQ0FBTSxDQUFDO2dDQUNQLGtCQUFrQixDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQzs0QkFDeEMsQ0FBQzs0QkFDRCxNQUFNO3dCQUNQLENBQUM7d0JBQ0Q7NEJBQ0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxzQkFBc0IsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxnREFBa0IsRUFBRSxDQUFDO2dDQUN6RyxNQUFNLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDOzRCQUM5RCxDQUFDO2lDQUFNLENBQUM7Z0NBQ1AsWUFBWSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQzs0QkFDbkQsQ0FBQzs0QkFDRCxNQUFNO29CQUNSLENBQUM7Z0JBQ0YsQ0FBQzthQUNELENBQUMsQ0FBQyxDQUFDO1lBRUosSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDbkIsTUFBTSxlQUFlLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLCtCQUErQixDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUNsRyxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRTtvQkFDbkUsT0FBTyxFQUFFO3dCQUNSLEVBQUU7d0JBQ0YsS0FBSyxFQUFFLGFBQWE7cUJBQ3BCO29CQUNELEtBQUssRUFBRSxlQUFlLDBDQUFrQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGVBQWUsK0NBQXVDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUztvQkFDeEosSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUM3RSxLQUFLLEVBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQyxTQUFTO2lCQUNoQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUVPLHNCQUFzQixDQUFDLGNBQStCO1FBQzdELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLDJCQUEyQixFQUFFLEtBQUssSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDO1FBQ3ZGLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQywyQkFBMkIsRUFBRSxFQUFFLElBQUksR0FBRyxjQUFjLENBQUMsRUFBRSxPQUFPLENBQUM7UUFDaEcsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLFdBQVcsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLE1BQU0sY0FBZSxTQUFRLE9BQU87WUFDbkU7Z0JBQ0MsS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSxTQUFTO29CQUNiLElBQUksS0FBSzt3QkFDUixNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQ2hHLE1BQU0sY0FBYyxHQUFHLE9BQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO3dCQUN2RSxNQUFNLGFBQWEsR0FBRyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQzt3QkFDekUsSUFBSSxxQkFBcUIsMENBQWtDLEVBQUUsQ0FBQzs0QkFDN0QsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsV0FBVyxFQUFFLFVBQVUsRUFBRSxjQUFjLENBQUMsRUFBRSxRQUFRLEVBQUUsUUFBUSxhQUFhLEVBQUUsRUFBRSxDQUFDO3dCQUN4RyxDQUFDOzZCQUFNLENBQUM7NEJBQ1AsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsYUFBYSxFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsRUFBRSxRQUFRLEVBQUUsVUFBVSxhQUFhLEVBQUUsRUFBRSxDQUFDO3dCQUM5RyxDQUFDO29CQUNGLENBQUM7b0JBQ0QsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO29CQUN6QixZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxHQUFHLGNBQWMsQ0FBQyxFQUFFLFNBQVMsQ0FBQztvQkFDL0QsVUFBVSxFQUFFLGNBQWMsQ0FBQywyQkFBMkIsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxjQUFjLENBQUMsMkJBQTJCLENBQUMsV0FBVyxFQUFFLE1BQU0sNkNBQW1DLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUztvQkFDMUwsRUFBRSxFQUFFLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTO29CQUNqRSxRQUFRLEVBQUU7d0JBQ1QsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7d0JBQy9FLElBQUksRUFBRTs0QkFDTDtnQ0FDQyxJQUFJLEVBQUUsU0FBUztnQ0FDZixNQUFNLEVBQUU7b0NBQ1AsSUFBSSxFQUFFLFFBQVE7b0NBQ2QsVUFBVSxFQUFFO3dDQUNYLGVBQWUsRUFBRTs0Q0FDaEIsSUFBSSxFQUFFLFNBQVM7NENBQ2YsT0FBTyxFQUFFLEtBQUs7NENBQ2QsV0FBVyxFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsK0RBQStELENBQUM7eUNBQ3ZHO3FDQUNEO2lDQUNEOzZCQUNEO3lCQUNEO3FCQUNEO2lCQUNELENBQUMsQ0FBQztZQUNKLENBQUM7WUFDTSxLQUFLLENBQUMsR0FBRyxDQUFDLGVBQWlDLEVBQUUsT0FBcUM7Z0JBQ3hGLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNyRSxNQUFNLHFCQUFxQixHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztnQkFDMUUsTUFBTSxhQUFhLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO2dCQUNuRSxNQUFNLFlBQVksR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUN4RCxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFFbEUsTUFBTSxhQUFhLEdBQUcsa0JBQWtCLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUM7Z0JBQ3JFLElBQUksYUFBYSxLQUFLLGNBQWMsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsYUFBYSxFQUFFLENBQUM7b0JBRXBFLE1BQU0sWUFBWSxHQUFHLHFCQUFxQixDQUFDLG1CQUFtQixDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDbEYsSUFBSSxxQkFBcUIsQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLDBDQUFrQyxFQUFFLENBQUM7d0JBQ3BHLDhEQUE4RDt3QkFDOUQsa0JBQWtCLENBQUMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO29CQUN4QyxDQUFDO3lCQUFNLElBQUksWUFBWSxLQUFLLElBQUksRUFBRSxDQUFDO3dCQUNsQywwREFBMEQ7d0JBQzFELGFBQWEsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztvQkFDdEYsQ0FBQztnQkFDRixDQUFDO3FCQUFNLENBQUM7b0JBQ1AsTUFBTSxZQUFZLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQ3pFLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLGNBQWMsQ0FBQywyQkFBMkIsRUFBRSxhQUFhLEVBQUUsQ0FBQztZQUMvRCxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkcsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO2dCQUMxQixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsK0JBQStCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztnQkFDekcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7b0JBQ25FLE9BQU8sRUFBRTt3QkFDUixFQUFFLEVBQUUsU0FBUzt3QkFDYixLQUFLLEVBQUUsY0FBYyxDQUFDLDJCQUEyQixDQUFDLGFBQWE7cUJBQy9EO29CQUNELEtBQUssRUFBRSxlQUFlLDBDQUFrQyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGVBQWUsK0NBQXVDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUztvQkFDeEosSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsR0FBRyxjQUFjLENBQUMsRUFBRSxTQUFTLENBQUM7b0JBQ3ZELEtBQUssRUFBRSxjQUFjLENBQUMsMkJBQTJCLENBQUMsS0FBSyxJQUFJLE1BQU0sQ0FBQyxTQUFTO2lCQUMzRSxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUVPLHVCQUF1QixDQUFDLGNBQStCLEVBQUUsUUFBb0M7UUFDcEcsT0FBTyxlQUFlLENBQUMsTUFBTSxlQUFnQixTQUFRLE9BQU87WUFDM0Q7Z0JBQ0MsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsQ0FBQyxtREFBbUQsQ0FBQyxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDL0osS0FBSyxDQUFDO29CQUNMLEVBQUUsRUFBRSxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxjQUFjLENBQUMsRUFBRSxRQUFRO29CQUMvRixLQUFLO29CQUNMLFFBQVE7b0JBQ1IsSUFBSSxFQUFFLENBQUM7NEJBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjOzRCQUN6QixJQUFJLEVBQUUsY0FBYyxDQUFDLElBQUk7eUJBQ3pCLENBQUM7b0JBQ0YsVUFBVSxFQUFFO3dCQUNYLElBQUksRUFBRSxjQUFjLENBQUMsR0FBRyxDQUFDLEdBQUcsY0FBYyxDQUFDLEVBQUUsU0FBUyxDQUFDO3dCQUN2RCxNQUFNLDZDQUFtQzt3QkFDekMsT0FBTyxFQUFFLGNBQWMsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLE9BQU87d0JBQzFELFNBQVMsRUFBRSxjQUFjLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSxTQUFTO3dCQUM5RCxLQUFLLEVBQUUsY0FBYyxDQUFDLFlBQVksRUFBRSxXQUFXLEVBQUUsS0FBSzt3QkFDdEQsR0FBRyxFQUFFLGNBQWMsQ0FBQyxZQUFZLEVBQUUsV0FBVyxFQUFFLEdBQUc7d0JBQ2xELEdBQUcsRUFBRSxjQUFjLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSxHQUFHO3FCQUNsRDtvQkFDRCxRQUFRLEVBQUU7d0JBQ1QsV0FBVyxFQUFFLEtBQUssQ0FBQyxLQUFLO3dCQUN4QixJQUFJLEVBQUU7NEJBQ0w7Z0NBQ0MsSUFBSSxFQUFFLGNBQWM7Z0NBQ3BCLFdBQVcsRUFBRSxlQUFlO2dDQUM1QixNQUFNLEVBQUU7b0NBQ1AsSUFBSSxFQUFFLFFBQVE7b0NBQ2QsVUFBVSxFQUFFO3dDQUNYLGVBQWUsRUFBRTs0Q0FDaEIsSUFBSSxFQUFFLFNBQVM7NENBQ2YsT0FBTyxFQUFFLEtBQUs7eUNBQ2Q7cUNBQ0Q7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0QsQ0FBQyxDQUFDO1lBQ0osQ0FBQztZQUNELEdBQUcsQ0FBQyxRQUEwQixFQUFFLE9BQXFDO2dCQUNwRSxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRSxFQUFFLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQ2xGLENBQUM7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sK0JBQStCLENBQUMsY0FBK0I7UUFDdEUsT0FBTyxlQUFlLENBQUMsTUFBTSx1QkFBd0IsU0FBUSxPQUFPO1lBQ25FO2dCQUNDLEtBQUssQ0FBQztvQkFDTCxFQUFFLEVBQUUsR0FBRyxjQUFjLENBQUMsRUFBRSxvQkFBb0I7b0JBQzVDLEtBQUssRUFBRSxTQUFTLENBQUMsbUJBQW1CLEVBQUUsZ0JBQWdCLENBQUM7b0JBQ3ZELElBQUksRUFBRSxDQUFDOzRCQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsZ0JBQWdCOzRCQUMzQixJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FDdEIsY0FBYyxDQUFDLEdBQUcsQ0FDakIsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxFQUNoRCxjQUFjLENBQUMsTUFBTSxDQUFDLEdBQUcsY0FBYyxDQUFDLEVBQUUsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQ3hFLENBQ0Q7NEJBQ0QsS0FBSyxFQUFFLFFBQVE7NEJBQ2YsS0FBSyxFQUFFLENBQUM7eUJBQ1IsQ0FBQztpQkFDRixDQUFDLENBQUM7WUFDSixDQUFDO1lBQ0QsR0FBRyxDQUFDLFFBQTBCO2dCQUM3QixNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztnQkFDbkUsTUFBTSxnQkFBZ0IsR0FBRyxxQkFBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFFLENBQUM7Z0JBQzNGLE1BQU0sY0FBYyxHQUFHLHFCQUFxQixDQUFDLHFCQUFxQixDQUFDLGdCQUFnQixDQUFFLENBQUM7Z0JBRXRGLCtFQUErRTtnQkFDL0UsSUFBSSxnQkFBZ0IsQ0FBQyxXQUFXLElBQUksY0FBYyxDQUFDLHNCQUFzQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDeEYsTUFBTSxlQUFlLEdBQUcscUJBQXFCLENBQUMsK0JBQStCLENBQUMsZ0JBQWdCLENBQUUsQ0FBQztvQkFDakcscUJBQXFCLENBQUMsMkJBQTJCLENBQUMsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUMvRyxDQUFDO2dCQUVELHFCQUFxQixDQUFDLG9CQUFvQixDQUFDLENBQUMsY0FBYyxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3hHLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDL0QsQ0FBQztTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxhQUE0QixFQUFFLHFCQUE0QztRQUN2RyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUM7UUFDbEIsSUFBTSxhQUFhLEdBQW5CLE1BQU0sYUFBYyxTQUFRLGFBQWE7WUFDeEMsWUFDb0IsZ0JBQW1DLEVBQzVCLGNBQXdDLEVBQ2pELGNBQStCLEVBQ3pCLG9CQUEyQyxFQUNuRCxZQUEyQixFQUNyQixrQkFBdUMsRUFDekMsZ0JBQW1DO2dCQUV0RCxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQUUsb0JBQW9CLEVBQUUsWUFBWSxFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGNBQWMsQ0FBQyxDQUFDO1lBQ3JKLENBQUM7WUFFUyx1QkFBdUIsQ0FBQyxPQUFvQjtnQkFDckQsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztnQkFFM0UsNkhBQTZIO2dCQUM3SCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxPQUFPLEVBQUUsYUFBYSxFQUFFLHFCQUFxQixFQUFFLDRCQUE0QixFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUUvSixrRkFBa0Y7Z0JBQ2xGLElBQUksQ0FBQyxDQUFDLGlCQUFpQixZQUFZLHVCQUF1QixDQUFDLEVBQUUsQ0FBQztvQkFDN0QsNEJBQTRCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsYUFBYSxFQUFFLGlCQUFpQixDQUFDLGdCQUFnQixFQUFFLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLENBQUMsR0FBRyxFQUFFO3dCQUN6Siw2RUFBNkU7d0JBQzdFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztvQkFDeEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDTCxDQUFDO2dCQUVELE9BQU8saUJBQWlCLENBQUM7WUFDMUIsQ0FBQztTQUNELENBQUE7UUE3QkssYUFBYTtZQUVoQixXQUFBLGlCQUFpQixDQUFBO1lBQ2pCLFdBQUEsd0JBQXdCLENBQUE7WUFDeEIsV0FBQSxlQUFlLENBQUE7WUFDZixXQUFBLHFCQUFxQixDQUFBO1lBQ3JCLFdBQUEsYUFBYSxDQUFBO1lBQ2IsV0FBQSxtQkFBbUIsQ0FBQTtZQUNuQixXQUFBLGlCQUFpQixDQUFBO1dBUmQsYUFBYSxDQTZCbEI7UUFFRCxRQUFRLENBQUMsRUFBRSxDQUF3QixJQUFJLENBQUMsb0JBQW9CLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLENBQ3RKLGFBQWEsRUFDYixhQUFhLENBQUMsRUFBRSxFQUNoQixPQUFPLGFBQWEsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEtBQUssRUFDekYsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUM3RCxhQUFhLENBQUMsS0FBSyxFQUNuQixhQUFhLENBQUMsY0FBYyxFQUM1QixhQUFhLENBQUMsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUNsRSxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sdUJBQXVCLENBQUMsYUFBNEIsRUFBRSxxQkFBNEM7UUFDekcsUUFBUSxDQUFDLEVBQUUsQ0FBd0IsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQzlJLENBQUM7SUFFTyx1QkFBdUIsQ0FBQyxPQUFvQixFQUFFLGFBQTRCLEVBQUUscUJBQTRDLEVBQUUsV0FBNEIsRUFBRSxvQkFBMkM7UUFDMU0sTUFBTSxpQkFBaUIsR0FBc0Isb0JBQW9CLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLGVBQWUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRTdLLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUMxRSxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9GLFdBQVcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEYsV0FBVyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hJLFdBQVcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6RixXQUFXLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUN2RCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLENBQUMsdUJBQXVCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDckMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixXQUFXLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUN0RCxJQUFJLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3JDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosT0FBTyxpQkFBaUIsQ0FBQztJQUMxQixDQUFDO0NBQ0QsQ0FBQTtBQWpxQlksWUFBWTtJQXNCdEIsV0FBQSxzQkFBc0IsQ0FBQTtJQUN0QixXQUFBLHlCQUF5QixDQUFBO0lBQ3pCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLGNBQWMsQ0FBQTtHQTFCSixZQUFZLENBaXFCeEI7O0FBRUQsU0FBUyxpQ0FBaUMsQ0FBQyxlQUF1QixJQUFZLE9BQU8saUJBQWlCLGVBQWUsVUFBVSxDQUFDLENBQUMsQ0FBQztBQUVsSSxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsWUFBWSxrQ0FBNkksQ0FBQyJ9