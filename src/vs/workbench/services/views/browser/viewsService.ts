/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable, DisposableStore, DisposableMap } from '../../../../base/common/lifecycle.js';
import { IViewDescriptorService, ViewContainer, IViewDescriptor, IView, ViewContainerLocation, IViewPaneContainer } from '../../../common/views.js';
import { FocusedViewContext, getVisbileViewContextKey } from '../../../common/contextkeys.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { isString } from '../../../../base/common/types.js';
import { MenuId, registerAction2, Action2, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IPaneComposite } from '../../../common/panecomposite.js';
import { ServicesAccessor, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { PaneCompositeDescriptor, PaneCompositeRegistry, Extensions as PaneCompositeExtensions, PaneComposite } from '../../../browser/panecomposite.js';
import { IWorkbenchLayoutService, Parts } from '../../layout/browser/layoutService.js';
import { URI } from '../../../../base/common/uri.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IEditorGroupsService } from '../../editor/common/editorGroupsService.js';
import { FilterViewPaneContainer } from '../../../browser/parts/views/viewsViewlet.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
import { ICommandActionTitle, ILocalizedString } from '../../../../platform/action/common/action.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IViewsService } from '../common/viewsService.js';

export class ViewsService extends Disposable implements IViewsService {

	declare readonly _serviceBrand: undefined;

	private readonly viewDisposable: Map<IViewDescriptor, IDisposable>;
	private readonly viewPaneContainers: Map<string, ViewPaneContainer>;

	private readonly _onDidChangeViewVisibility: Emitter<{ id: string; visible: boolean }> = this._register(new Emitter<{ id: string; visible: boolean }>());
	readonly onDidChangeViewVisibility: Event<{ id: string; visible: boolean }> = this._onDidChangeViewVisibility.event;

	private readonly _onDidChangeViewContainerVisibility = this._register(new Emitter<{ id: string; visible: boolean; location: ViewContainerLocation }>());
	readonly onDidChangeViewContainerVisibility = this._onDidChangeViewContainerVisibility.event;

	private readonly _onDidChangeFocusedView = this._register(new Emitter<void>());
	readonly onDidChangeFocusedView = this._onDidChangeFocusedView.event;

	private readonly viewContainerDisposables = this._register(new DisposableMap());
	private readonly enabledViewContainersContextKeys: Map<string, IContextKey<boolean>>;
	private readonly visibleViewContextKeys: Map<string, IContextKey<boolean>>;
	private readonly focusedViewContextKey: IContextKey<string>;

	constructor(
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();

		this.viewDisposable = new Map<IViewDescriptor, IDisposable>();
		this.enabledViewContainersContextKeys = new Map<string, IContextKey<boolean>>();
		this.visibleViewContextKeys = new Map<string, IContextKey<boolean>>();
		this.viewPaneContainers = new Map<string, ViewPaneContainer>();

		this._register(toDisposable(() => {
			this.viewDisposable.forEach(disposable => disposable.dispose());
			this.viewDisposable.clear();
		}));

		this.viewDescriptorService.viewContainers.forEach(viewContainer => this.onDidRegisterViewContainer(viewContainer, this.viewDescriptorService.getViewContainerLocation(viewContainer)!));
		this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeContainers(added, removed)));
		this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeContainerLocation(viewContainer, from, to)));

		// View Container Visibility
		this._register(this.paneCompositeService.onDidPaneCompositeOpen(e => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: true, location: e.viewContainerLocation })));
		this._register(this.paneCompositeService.onDidPaneCompositeClose(e => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: false, location: e.viewContainerLocation })));

		this.focusedViewContextKey = FocusedViewContext.bindTo(contextKeyService);
	}

	private onViewsAdded(added: IView[]): void {
		for (const view of added) {
			this.onViewsVisibilityChanged(view, view.isBodyVisible());
		}
	}

	private onViewsVisibilityChanged(view: IView, visible: boolean): void {
		this.getOrCreateActiveViewContextKey(view).set(visible);
		this._onDidChangeViewVisibility.fire({ id: view.id, visible: visible });
	}

	private onViewsRemoved(removed: IView[]): void {
		for (const view of removed) {
			this.onViewsVisibilityChanged(view, false);
		}
	}

	private getOrCreateActiveViewContextKey(view: IView): IContextKey<boolean> {
		const visibleContextKeyId = getVisbileViewContextKey(view.id);
		let contextKey = this.visibleViewContextKeys.get(visibleContextKeyId);
		if (!contextKey) {
			contextKey = new RawContextKey(visibleContextKeyId, false).bindTo(this.contextKeyService);
			this.visibleViewContextKeys.set(visibleContextKeyId, contextKey);
		}
		return contextKey;
	}

	private onDidChangeContainers(added: ReadonlyArray<{ container: ViewContainer; location: ViewContainerLocation }>, removed: ReadonlyArray<{ container: ViewContainer; location: ViewContainerLocation }>): void {
		for (const { container, location } of removed) {
			this.onDidDeregisterViewContainer(container, location);
		}
		for (const { container, location } of added) {
			this.onDidRegisterViewContainer(container, location);
		}
	}

	private onDidRegisterViewContainer(viewContainer: ViewContainer, viewContainerLocation: ViewContainerLocation): void {
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

	private onDidDeregisterViewContainer(viewContainer: ViewContainer, viewContainerLocation: ViewContainerLocation): void {
		this.deregisterPaneComposite(viewContainer, viewContainerLocation);
		this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
	}

	private onDidChangeContainerLocation(viewContainer: ViewContainer, from: ViewContainerLocation, to: ViewContainerLocation): void {
		this.deregisterPaneComposite(viewContainer, from);
		this.registerPaneComposite(viewContainer, to);

		// Open view container if part is visible and there is only one view container in location
		if (
			this.layoutService.isVisible(getPartByLocation(to)) &&
			this.viewDescriptorService.getViewContainersByLocation(to).filter(vc => this.isViewContainerActive(vc.id)).length === 1
		) {
			this.openViewContainer(viewContainer.id);
		}
	}

	private onViewDescriptorsAdded(views: ReadonlyArray<IViewDescriptor>, container: ViewContainer): void {
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

	private onViewDescriptorsRemoved(views: ReadonlyArray<IViewDescriptor>): void {
		for (const view of views) {
			const disposable = this.viewDisposable.get(view);
			if (disposable) {
				disposable.dispose();
				this.viewDisposable.delete(view);
			}
		}
	}

	private updateViewContainerEnablementContextKey(viewContainer: ViewContainer): void {
		let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
		if (!contextKey) {
			contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
			this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
		}
		contextKey.set(!(viewContainer.hideIfEmpty && this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length === 0));
	}

	private async openComposite(compositeId: string, location: ViewContainerLocation, focus?: boolean): Promise<IPaneComposite | undefined> {
		return this.paneCompositeService.openPaneComposite(compositeId, location, focus);
	}

	private getComposite(compositeId: string, location: ViewContainerLocation): { id: string; name: string } | undefined {
		return this.paneCompositeService.getPaneComposite(compositeId, location);
	}

	// One view container can be visible at a time in a location
	isViewContainerVisible(id: string): boolean {
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
	isViewContainerActive(id: string): boolean {
		const viewContainer = this.viewDescriptorService.getViewContainerById(id);
		if (!viewContainer) {
			return false;
		}

		if (!viewContainer.hideIfEmpty) {
			return true;
		}

		return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
	}

	getVisibleViewContainer(location: ViewContainerLocation): ViewContainer | null {
		const viewContainerId = this.paneCompositeService.getActivePaneComposite(location)?.getId();
		return viewContainerId ? this.viewDescriptorService.getViewContainerById(viewContainerId) : null;
	}

	getActiveViewPaneContainerWithId(viewContainerId: string): IViewPaneContainer | null {
		const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
		return viewContainer ? this.getActiveViewPaneContainer(viewContainer) : null;
	}

	async openViewContainer(id: string, focus?: boolean): Promise<IPaneComposite | null> {
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

	async closeViewContainer(id: string): Promise<void> {
		const viewContainer = this.viewDescriptorService.getViewContainerById(id);
		if (viewContainer) {
			const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
			const isActive = viewContainerLocation !== null && this.paneCompositeService.getActivePaneComposite(viewContainerLocation);
			if (viewContainerLocation !== null) {
				return isActive ? this.layoutService.setPartHidden(true, getPartByLocation(viewContainerLocation)) : undefined;
			}
		}
	}

	isViewVisible(id: string): boolean {
		const activeView = this.getActiveViewWithId(id);
		return activeView?.isBodyVisible() || false;
	}

	getActiveViewWithId<T extends IView>(id: string): T | null {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
		if (viewContainer) {
			const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
			if (activeViewPaneContainer) {
				return activeViewPaneContainer.getView(id) as T;
			}
		}
		return null;
	}

	getViewWithId<T extends IView>(id: string): T | null {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
		if (viewContainer) {
			const viewPaneContainer: IViewPaneContainer | undefined = this.viewPaneContainers.get(viewContainer.id);
			if (viewPaneContainer) {
				return viewPaneContainer.getView(id) as T;
			}
		}
		return null;
	}

	getFocusedViewName(): string {
		const viewId: string = this.contextKeyService.getContextKeyValue(FocusedViewContext.key) ?? '';
		const textEditorFocused = this.editorService.activeTextEditorControl?.hasTextFocus() ? localize('editor', "Text Editor") : undefined;
		return this.viewDescriptorService.getViewDescriptorById(viewId.toString())?.name?.value ?? textEditorFocused ?? '';
	}

	async openView<T extends IView>(id: string, focus?: boolean): Promise<T | null> {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
		if (!viewContainer) {
			return null;
		}

		if (!this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.some(viewDescriptor => viewDescriptor.id === id)) {
			return null;
		}

		const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
		const compositeDescriptor = this.getComposite(viewContainer.id, location!);
		if (compositeDescriptor) {
			const paneComposite = await this.openComposite(compositeDescriptor.id, location!) as IPaneComposite | undefined;
			if (paneComposite && paneComposite.openView) {
				return paneComposite.openView<T>(id, focus) || null;
			} else if (focus) {
				paneComposite?.focus();
			}
		}

		return null;
	}

	closeView(id: string): void {
		const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
		if (viewContainer) {
			const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
			if (activeViewPaneContainer) {
				const view = activeViewPaneContainer.getView(id);
				if (view) {
					if (activeViewPaneContainer.views.length === 1) {
						const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
						if (location === ViewContainerLocation.Sidebar) {
							this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
						} else if (location === ViewContainerLocation.Panel || location === ViewContainerLocation.AuxiliaryBar) {
							this.paneCompositeService.hideActivePaneComposite(location);
						}

						// The blur event doesn't fire on WebKit when the focused element is hidden,
						// so the context key needs to be forced here too otherwise a view may still
						// think it's showing, breaking toggle commands.
						if (this.focusedViewContextKey.get() === id) {
							this.focusedViewContextKey.reset();
						}
					} else {
						view.setExpanded(false);
					}
				}
			}
		}
	}

	private getActiveViewPaneContainer(viewContainer: ViewContainer): IViewPaneContainer | null {
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

	getViewProgressIndicator(viewId: string): IProgressIndicator | undefined {
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

	private getViewContainerProgressIndicator(viewContainer: ViewContainer): IProgressIndicator | undefined {
		const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
		if (viewContainerLocation === null) {
			return undefined;
		}

		return this.paneCompositeService.getProgressIndicator(viewContainer.id, viewContainerLocation);
	}

	private registerOpenViewContainerAction(viewContainer: ViewContainer): IDisposable {
		const disposables = new DisposableStore();
		if (viewContainer.openCommandActionDescriptor) {
			const { id, mnemonicTitle, keybindings, order } = viewContainer.openCommandActionDescriptor ?? { id: viewContainer.id };
			const title = viewContainer.openCommandActionDescriptor.title ?? viewContainer.title;
			const that = this;
			disposables.add(registerAction2(class OpenViewContainerAction extends Action2 {
				constructor() {
					super({
						id,
						get title(): ICommandActionTitle {
							const viewContainerLocation = that.viewDescriptorService.getViewContainerLocation(viewContainer);
							const localizedTitle = typeof title === 'string' ? title : title.value;
							const originalTitle = typeof title === 'string' ? title : title.original;
							if (viewContainerLocation === ViewContainerLocation.Sidebar) {
								return { value: localize('show view', "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
							} else {
								return { value: localize('toggle view', "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
							}
						},
						category: Categories.View,
						precondition: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
						keybinding: keybindings ? { ...keybindings, weight: KeybindingWeight.WorkbenchContrib } : undefined,
						f1: true
					});
				}
				public async run(serviceAccessor: ServicesAccessor): Promise<any> {
					const editorGroupService = serviceAccessor.get(IEditorGroupsService);
					const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
					const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
					const viewsService = serviceAccessor.get(IViewsService);
					const viewContainerLocation = viewDescriptorService.getViewContainerLocation(viewContainer);
					switch (viewContainerLocation) {
						case ViewContainerLocation.AuxiliaryBar:
						case ViewContainerLocation.Sidebar: {
							const part = viewContainerLocation === ViewContainerLocation.Sidebar ? Parts.SIDEBAR_PART : Parts.AUXILIARYBAR_PART;
							if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus(part)) {
								await viewsService.openViewContainer(viewContainer.id, true);
							} else {
								editorGroupService.activeGroup.focus();
							}
							break;
						}
						case ViewContainerLocation.Panel:
							if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus(Parts.PANEL_PART)) {
								await viewsService.openViewContainer(viewContainer.id, true);
							} else {
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
					group: defaultLocation === ViewContainerLocation.Sidebar ? '3_views' : '4_panels',
					when: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
					order: order ?? Number.MAX_VALUE
				}));
			}
		}

		return disposables;
	}

	private registerOpenViewAction(viewDescriptor: IViewDescriptor): IDisposable {
		const disposables = new DisposableStore();
		if (viewDescriptor.openCommandActionDescriptor) {
			const title = viewDescriptor.openCommandActionDescriptor.title ?? viewDescriptor.name;
			const commandId = viewDescriptor.openCommandActionDescriptor.id;
			const that = this;
			disposables.add(registerAction2(class OpenViewAction extends Action2 {
				constructor() {
					super({
						id: commandId,
						get title(): ICommandActionTitle {
							const viewContainerLocation = that.viewDescriptorService.getViewLocationById(viewDescriptor.id);
							const localizedTitle = typeof title === 'string' ? title : title.value;
							const originalTitle = typeof title === 'string' ? title : title.original;
							if (viewContainerLocation === ViewContainerLocation.Sidebar) {
								return { value: localize('show view', "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
							} else {
								return { value: localize('toggle view', "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
							}
						},
						category: Categories.View,
						precondition: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
						keybinding: viewDescriptor.openCommandActionDescriptor!.keybindings ? { ...viewDescriptor.openCommandActionDescriptor!.keybindings, weight: KeybindingWeight.WorkbenchContrib } : undefined,
						f1: true
					});
				}
				public async run(serviceAccessor: ServicesAccessor): Promise<any> {
					const editorGroupService = serviceAccessor.get(IEditorGroupsService);
					const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
					const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
					const viewsService = serviceAccessor.get(IViewsService);
					const contextKeyService = serviceAccessor.get(IContextKeyService);

					const focusedViewId = FocusedViewContext.getValue(contextKeyService);
					if (focusedViewId === viewDescriptor.id) {

						const viewLocation = viewDescriptorService.getViewLocationById(viewDescriptor.id);
						if (viewDescriptorService.getViewLocationById(viewDescriptor.id) === ViewContainerLocation.Sidebar) {
							// focus the editor if the view is focused and in the side bar
							editorGroupService.activeGroup.focus();
						} else if (viewLocation !== null) {
							// otherwise hide the part where the view lives if focused
							layoutService.setPartHidden(true, getPartByLocation(viewLocation));
						}
					} else {
						viewsService.openView(viewDescriptor.id, true);
					}
				}
			}));

			if (viewDescriptor.openCommandActionDescriptor.mnemonicTitle) {
				const defaultViewContainer = this.viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
				if (defaultViewContainer) {
					const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(defaultViewContainer);
					disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
						command: {
							id: commandId,
							title: viewDescriptor.openCommandActionDescriptor.mnemonicTitle,
						},
						group: defaultLocation === ViewContainerLocation.Sidebar ? '3_views' : '4_panels',
						when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
						order: viewDescriptor.openCommandActionDescriptor.order ?? Number.MAX_VALUE
					}));
				}
			}
		}
		return disposables;
	}

	private registerFocusViewAction(viewDescriptor: IViewDescriptor, category?: string | ILocalizedString): IDisposable {
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
						weight: KeybindingWeight.WorkbenchContrib,
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
			run(accessor: ServicesAccessor, options?: { preserveFocus?: boolean }): void {
				accessor.get(IViewsService).openView(viewDescriptor.id, !options?.preserveFocus);
			}
		});
	}

	private registerResetViewLocationAction(viewDescriptor: IViewDescriptor): IDisposable {
		return registerAction2(class ResetViewLocationAction extends Action2 {
			constructor() {
				super({
					id: `${viewDescriptor.id}.resetViewLocation`,
					title: localize2('resetViewLocation', "Reset Location"),
					menu: [{
						id: MenuId.ViewTitleContext,
						when: ContextKeyExpr.or(
							ContextKeyExpr.and(
								ContextKeyExpr.equals('view', viewDescriptor.id),
								ContextKeyExpr.equals(`${viewDescriptor.id}.defaultViewLocation`, false)
							)
						),
						group: '1_hide',
						order: 2
					}],
				});
			}
			run(accessor: ServicesAccessor): void {
				const viewDescriptorService = accessor.get(IViewDescriptorService);
				const defaultContainer = viewDescriptorService.getDefaultContainerById(viewDescriptor.id)!;
				const containerModel = viewDescriptorService.getViewContainerModel(defaultContainer)!;

				// The default container is hidden so we should try to reset its location first
				if (defaultContainer.hideIfEmpty && containerModel.visibleViewDescriptors.length === 0) {
					const defaultLocation = viewDescriptorService.getDefaultViewContainerLocation(defaultContainer)!;
					viewDescriptorService.moveViewContainerToLocation(defaultContainer, defaultLocation, undefined, this.desc.id);
				}

				viewDescriptorService.moveViewsToContainer([viewDescriptor], viewDescriptorService.getDefaultContainerById(viewDescriptor.id)!, undefined, this.desc.id);
				accessor.get(IViewsService).openView(viewDescriptor.id, true);
			}
		});
	}

	private registerPaneComposite(viewContainer: ViewContainer, viewContainerLocation: ViewContainerLocation): void {
		const that = this;
		class PaneContainer extends PaneComposite {
			constructor(
				@ITelemetryService telemetryService: ITelemetryService,
				@IWorkspaceContextService contextService: IWorkspaceContextService,
				@IStorageService storageService: IStorageService,
				@IInstantiationService instantiationService: IInstantiationService,
				@IThemeService themeService: IThemeService,
				@IContextMenuService contextMenuService: IContextMenuService,
				@IExtensionService extensionService: IExtensionService,
			) {
				super(viewContainer.id, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
			}

			protected createViewPaneContainer(element: HTMLElement): ViewPaneContainer {
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
		}

		Registry.as<PaneCompositeRegistry>(getPaneCompositeExtension(viewContainerLocation)).registerPaneComposite(PaneCompositeDescriptor.create(
			PaneContainer,
			viewContainer.id,
			typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value,
			isString(viewContainer.icon) ? viewContainer.icon : undefined,
			viewContainer.order,
			viewContainer.requestedIndex,
			viewContainer.icon instanceof URI ? viewContainer.icon : undefined
		));
	}

	private deregisterPaneComposite(viewContainer: ViewContainer, viewContainerLocation: ViewContainerLocation): void {
		Registry.as<PaneCompositeRegistry>(getPaneCompositeExtension(viewContainerLocation)).deregisterPaneComposite(viewContainer.id);
	}

	private createViewPaneContainer(element: HTMLElement, viewContainer: ViewContainer, viewContainerLocation: ViewContainerLocation, disposables: DisposableStore, instantiationService: IInstantiationService): ViewPaneContainer {
		const viewPaneContainer: ViewPaneContainer = (instantiationService as any).createInstance(viewContainer.ctorDescriptor.ctor, ...(viewContainer.ctorDescriptor.staticArguments || []));

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
}

function getEnabledViewContainerContextKey(viewContainerId: string): string { return `viewContainer.${viewContainerId}.enabled`; }

function getPaneCompositeExtension(viewContainerLocation: ViewContainerLocation): string {
	switch (viewContainerLocation) {
		case ViewContainerLocation.AuxiliaryBar:
			return PaneCompositeExtensions.Auxiliary;
		case ViewContainerLocation.Panel:
			return PaneCompositeExtensions.Panels;
		case ViewContainerLocation.Sidebar:
		default:
			return PaneCompositeExtensions.Viewlets;
	}
}

export function getPartByLocation(viewContainerLocation: ViewContainerLocation): Parts.AUXILIARYBAR_PART | Parts.SIDEBAR_PART | Parts.PANEL_PART {
	switch (viewContainerLocation) {
		case ViewContainerLocation.AuxiliaryBar:
			return Parts.AUXILIARYBAR_PART;
		case ViewContainerLocation.Panel:
			return Parts.PANEL_PART;
		case ViewContainerLocation.Sidebar:
		default:
			return Parts.SIDEBAR_PART;
	}
}

registerSingleton(IViewsService, ViewsService, InstantiationType.Eager /* Eager because it registers viewlets and panels in the constructor which are required during workbench layout */);
