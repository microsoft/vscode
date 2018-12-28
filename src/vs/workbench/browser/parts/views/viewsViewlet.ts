/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { dispose, IDisposable, combinedDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { firstIndex } from 'vs/base/common/arrays';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IViewDescriptor, IViewsViewlet, IViewContainersRegistry, Extensions as ViewContainerExtensions, IView } from 'vs/workbench/common/views';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { PanelViewlet, ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { DefaultPanelDndController } from 'vs/base/browser/ui/splitview/panelview';
import { WorkbenchTree, IListService } from 'vs/platform/list/browser/listService';
import { IWorkbenchThemeService, IFileIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ITreeConfiguration, ITreeOptions } from 'vs/base/parts/tree/browser/tree';
import { Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { localize } from 'vs/nls';
import { IAddedViewDescriptorRef, IViewDescriptorRef, PersistentContributableViewsModel } from 'vs/workbench/browser/parts/views/views';
import { Registry } from 'vs/platform/registry/common/platform';

export abstract class TreeViewsViewletPanel extends ViewletPanel {

	protected tree: WorkbenchTree;

	setExpanded(expanded: boolean): boolean {
		const changed = super.setExpanded(expanded);
		if (changed) {
			this.updateTreeVisibility(this.tree, expanded);
		}

		return changed;
	}

	setVisible(visible: boolean): void {
		if (this.isVisible() !== visible) {
			super.setVisible(visible);
			this.updateTreeVisibility(this.tree, visible && this.isExpanded());
		}
	}

	focus(): void {
		super.focus();
		this.focusTree();
	}

	layoutBody(size: number): void {
		if (this.tree) {
			this.tree.layout(size);
		}
	}

	protected updateTreeVisibility(tree: WorkbenchTree, isVisible: boolean): void {
		if (!tree) {
			return;
		}

		if (isVisible) {
			DOM.show(tree.getHTMLElement());
		} else {
			DOM.hide(tree.getHTMLElement()); // make sure the tree goes out of the tabindex world by hiding it
		}

		if (isVisible) {
			tree.onVisible();
		} else {
			tree.onHidden();
		}
	}

	private focusTree(): void {
		if (!this.tree) {
			return; // return early if viewlet has not yet been created
		}

		// Make sure the current selected element is revealed
		const selectedElement = this.tree.getSelection()[0];
		if (selectedElement) {
			this.tree.reveal(selectedElement);
		}

		// Pass Focus to Viewer
		this.tree.domFocus();
	}

	dispose(): void {
		if (this.tree) {
			this.tree.dispose();
		}
		super.dispose();
	}
}

export interface IViewletViewOptions extends IViewletPanelOptions {
	viewletState: object;
}

export abstract class ViewContainerViewlet extends PanelViewlet implements IViewsViewlet {

	private readonly viewletState: object;
	private didLayout = false;
	private dimension: DOM.Dimension;
	private areExtensionsReady: boolean = false;

	private readonly visibleViewsCountFromCache: number;
	private readonly visibleViewsStorageId: string;
	private readonly viewsModel: PersistentContributableViewsModel;
	private viewDisposables: IDisposable[] = [];

	constructor(
		id: string,
		viewletStateStorageId: string,
		showHeaderInTitleWhenSingleView: boolean,
		@IConfigurationService configurationService: IConfigurationService,
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService protected storageService: IStorageService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IExtensionService protected extensionService: IExtensionService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService
	) {
		super(id, { showHeaderInTitleWhenSingleView, dnd: new DefaultPanelDndController() }, configurationService, partService, contextMenuService, telemetryService, themeService, storageService);

		const container = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).get(id);
		this.viewsModel = this._register(this.instantiationService.createInstance(PersistentContributableViewsModel, container, viewletStateStorageId));
		this.viewletState = this.getMemento(StorageScope.WORKSPACE);

		this.visibleViewsStorageId = `${id}.numberOfVisibleViews`;
		this.visibleViewsCountFromCache = this.storageService.getInteger(this.visibleViewsStorageId, StorageScope.WORKSPACE, 1);
		this._register(toDisposable(() => this.viewDisposables = dispose(this.viewDisposables)));
	}

	create(parent: HTMLElement): void {
		super.create(parent);
		this._register(this.onDidSashChange(() => this.saveViewSizes()));
		this.viewsModel.onDidAdd(added => this.onDidAddViews(added));
		this.viewsModel.onDidRemove(removed => this.onDidRemoveViews(removed));
		const addedViews: IAddedViewDescriptorRef[] = this.viewsModel.visibleViewDescriptors.map((viewDescriptor, index) => {
			const size = this.viewsModel.getSize(viewDescriptor.id);
			const collapsed = this.viewsModel.isCollapsed(viewDescriptor.id);
			return ({ viewDescriptor, index, size, collapsed });
		});
		if (addedViews.length) {
			this.onDidAddViews(addedViews);
		}

		// Update headers after and title contributed views after available, since we read from cache in the beginning to know if the viewlet has single view or not. Ref #29609
		this.extensionService.whenInstalledExtensionsRegistered().then(() => {
			this.areExtensionsReady = true;
			if (this.panels.length) {
				this.updateTitleArea();
				this.updateViewHeaders();
			}
		});

		this.focus();
	}

	getContextMenuActions(): IAction[] {
		const result: IAction[] = [];
		const viewToggleActions = this.viewsModel.viewDescriptors.map(viewDescriptor => (<IAction>{
			id: `${viewDescriptor.id}.toggleVisibility`,
			label: viewDescriptor.name,
			checked: this.viewsModel.isVisible(viewDescriptor.id),
			enabled: viewDescriptor.canToggleVisibility,
			run: () => this.toggleViewVisibility(viewDescriptor.id)
		}));

		result.push(...viewToggleActions);
		const parentActions = super.getContextMenuActions();
		if (viewToggleActions.length && parentActions.length) {
			result.push(new Separator());
		}

		result.push(...parentActions);
		return result;
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.panels.filter(view => view.isVisible() !== visible)
			.map((view) => view.setVisible(visible));
	}

	openView(id: string, focus?: boolean): IView {
		if (focus) {
			this.focus();
		}
		let view = this.getView(id);
		if (!view) {
			this.toggleViewVisibility(id);
		}
		view = this.getView(id);
		view.setExpanded(true);
		if (focus) {
			view.focus();
		}
		return view;
	}

	movePanel(from: ViewletPanel, to: ViewletPanel): void {
		const fromIndex = firstIndex(this.panels, panel => panel === from);
		const toIndex = firstIndex(this.panels, panel => panel === to);
		const fromViewDescriptor = this.viewsModel.visibleViewDescriptors[fromIndex];
		const toViewDescriptor = this.viewsModel.visibleViewDescriptors[toIndex];

		super.movePanel(from, to);
		this.viewsModel.move(fromViewDescriptor.id, toViewDescriptor.id);
	}

	layout(dimension: DOM.Dimension): void {
		super.layout(dimension);
		this.dimension = dimension;
		if (this.didLayout) {
			this.saveViewSizes();
		} else {
			this.didLayout = true;
			this.restoreViewSizes();
		}
	}

	getOptimalWidth(): number {
		const additionalMargin = 16;
		const optimalWidth = Math.max(...this.panels.map(view => view.getOptimalWidth() || 0));
		return optimalWidth + additionalMargin;
	}

	protected isSingleView(): boolean {
		if (!super.isSingleView()) {
			return false;
		}
		if (!this.areExtensionsReady) {
			// Check in cache so that view do not jump. See #29609
			return this.visibleViewsCountFromCache === 1;
		}
		return true;
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewletPanel {
		return this.instantiationService.createInstance(viewDescriptor.ctor, options) as ViewletPanel;
	}

	protected getView(id: string): ViewletPanel {
		return this.panels.filter(view => view.id === id)[0];
	}

	protected onDidAddViews(added: IAddedViewDescriptorRef[]): ViewletPanel[] {
		const panelsToAdd: { panel: ViewletPanel, size: number, index: number }[] = [];
		for (const { viewDescriptor, collapsed, index, size } of added) {
			const panel = this.createView(viewDescriptor,
				{
					id: viewDescriptor.id,
					title: viewDescriptor.name,
					actionRunner: this.getActionRunner(),
					expanded: !collapsed,
					viewletState: this.viewletState
				});
			panel.render();
			panel.setVisible(true);
			const contextMenuDisposable = DOM.addDisposableListener(panel.draggableElement, 'contextmenu', e => {
				e.stopPropagation();
				e.preventDefault();
				this.onContextMenu(new StandardMouseEvent(e), viewDescriptor);
			});

			const collapseDisposable = Event.latch(Event.map(panel.onDidChange, () => !panel.isExpanded()))(collapsed => {
				this.viewsModel.setCollapsed(viewDescriptor.id, collapsed);
			});

			this.viewDisposables.splice(index, 0, combinedDisposable([contextMenuDisposable, collapseDisposable]));
			panelsToAdd.push({ panel, size: size || panel.minimumSize, index });
		}

		this.addPanels(panelsToAdd);
		this.restoreViewSizes();
		return panelsToAdd.map(({ panel }) => panel);
	}

	private onDidRemoveViews(removed: IViewDescriptorRef[]): void {
		removed = removed.sort((a, b) => b.index - a.index);
		const panelsToRemove: ViewletPanel[] = [];
		for (const { index } of removed) {
			const [disposable] = this.viewDisposables.splice(index, 1);
			disposable.dispose();
			panelsToRemove.push(this.panels[index]);
		}
		this.removePanels(panelsToRemove);
		dispose(panelsToRemove);
	}

	private onContextMenu(event: StandardMouseEvent, viewDescriptor: IViewDescriptor): void {
		event.stopPropagation();
		event.preventDefault();

		const actions: IAction[] = [];
		actions.push(<IAction>{
			id: `${viewDescriptor.id}.removeView`,
			label: localize('hideView', "Hide"),
			enabled: viewDescriptor.canToggleVisibility,
			run: () => this.toggleViewVisibility(viewDescriptor.id)
		});
		const otherActions = this.getContextMenuActions();
		if (otherActions.length) {
			actions.push(...[new Separator(), ...otherActions]);
		}

		let anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions
		});
	}

	private toggleViewVisibility(viewId: string): void {
		const visible = !this.viewsModel.isVisible(viewId);
		/* __GDPR__
			"views.toggleVisibility" : {
				"viewId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"visible": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog('views.toggledVisibility', { viewId, visible });
		this.viewsModel.setVisible(viewId, visible);
	}

	private saveViewSizes(): void {
		// Save size only when the layout has happened
		if (this.didLayout) {
			for (const view of this.panels) {
				this.viewsModel.setSize(view.id, this.getPanelSize(view));
			}
		}
	}

	private restoreViewSizes(): void {
		// Restore sizes only when the layout has happened
		if (this.didLayout) {
			let initialSizes;
			for (let i = 0; i < this.viewsModel.visibleViewDescriptors.length; i++) {
				const panel = this.panels[i];
				const viewDescriptor = this.viewsModel.visibleViewDescriptors[i];
				const size = this.viewsModel.getSize(viewDescriptor.id);

				if (typeof size === 'number') {
					this.resizePanel(panel, size);
				} else {
					initialSizes = initialSizes ? initialSizes : this.computeInitialSizes();
					this.resizePanel(panel, initialSizes[panel.id] || 200);
				}
			}
		}
	}

	private computeInitialSizes(): { [id: string]: number } {
		let sizes = {};
		if (this.dimension) {
			const totalWeight = this.viewsModel.visibleViewDescriptors.reduce((totalWeight, { weight }) => totalWeight + (weight || 20), 0);
			for (const viewDescriptor of this.viewsModel.visibleViewDescriptors) {
				sizes[viewDescriptor.id] = this.dimension.height * (viewDescriptor.weight || 20) / totalWeight;
			}
		}
		return sizes;
	}

	protected saveState(): void {
		this.panels.forEach((view) => view.saveState());
		this.storageService.store(this.visibleViewsStorageId, this.length, StorageScope.WORKSPACE);

		super.saveState();
	}
}

export class FileIconThemableWorkbenchTree extends WorkbenchTree {

	constructor(
		container: HTMLElement,
		configuration: ITreeConfiguration,
		options: ITreeOptions,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IListService listService: IListService,
		@IThemeService themeService: IWorkbenchThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(container, configuration, { ...options, ...{ showTwistie: false, twistiePixels: 12 } }, contextKeyService, listService, themeService, instantiationService, configurationService);

		DOM.addClass(container, 'file-icon-themable-tree');
		DOM.addClass(container, 'show-file-icons');

		const onFileIconThemeChange = (fileIconTheme: IFileIconTheme) => {
			DOM.toggleClass(container, 'align-icons-and-twisties', fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons);
			DOM.toggleClass(container, 'hide-arrows', fileIconTheme.hidesExplorerArrows === true);
		};

		this.disposables.push(themeService.onDidFileIconThemeChange(onFileIconThemeChange));
		onFileIconThemeChange(themeService.getFileIconTheme());
	}
}
