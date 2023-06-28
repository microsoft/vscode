/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/basepanelpart';
import 'vs/css!./media/panelpart';
import { localize } from 'vs/nls';
import { IAction, Separator, SubmenuAction, toAction } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { ActionsOrientation, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { ActivePanelContext, PanelFocusContext, getEnabledViewContainerContextKey } from 'vs/workbench/common/contextkeys';
import { CompositePart, ICompositeTitleLabel } from 'vs/workbench/browser/parts/compositePart';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService, StorageScope, IStorageValueChangeEvent, StorageTarget } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { PanelActivityAction, TogglePanelAction, PlaceHolderPanelActivityAction, PlaceHolderToggleCompositePinnedAction } from 'vs/workbench/browser/parts/panel/panelActions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { PANEL_BACKGROUND, PANEL_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, EDITOR_DRAG_AND_DROP_BACKGROUND, PANEL_DRAG_AND_DROP_BORDER } from 'vs/workbench/common/theme';
import { contrastBorder, badgeBackground, badgeForeground } from 'vs/platform/theme/common/colorRegistry';
import { CompositeBar, ICompositeBarItem, CompositeDragAndDrop } from 'vs/workbench/browser/parts/compositeBar';
import { IActivityHoverOptions, ToggleCompositeBadgeAction, ToggleCompositePinnedAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, trackFocus, EventHelper, $, asCSSUrl, createCSSRule } from 'vs/base/browser/dom';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { isUndefinedOrNull, assertIsDefined } from 'vs/base/common/types';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ViewContainer, IViewDescriptorService, IViewContainerModel, ViewContainerLocation } from 'vs/workbench/common/views';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { Before2D, CompositeDragAndDropObserver, ICompositeDragAndDrop, toggleDropEffect } from 'vs/workbench/browser/dnd';
import { IActivity } from 'vs/workbench/common/activity';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { Extensions as PaneCompositeExtensions, PaneComposite, PaneCompositeDescriptor, PaneCompositeRegistry } from 'vs/workbench/browser/panecomposite';
import { CompositeMenuActions } from 'vs/workbench/browser/actions';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IComposite } from 'vs/workbench/common/composite';
import { IPaneCompositePart, IPaneCompositeSelectorPart } from 'vs/workbench/browser/parts/paneCompositePart';
import { IPartOptions } from 'vs/workbench/browser/part';
import { StringSHA1 } from 'vs/base/common/hash';
import { URI } from 'vs/base/common/uri';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { PlaceHolderToggleCompositeBadgeAction } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';

interface ICachedPanel {
	id: string;
	name?: string;
	pinned: boolean;
	order?: number;
	visible: boolean;
	views?: { when?: string }[];
}

interface IPlaceholderViewContainer {
	id: string;
	name?: string;
}

interface IPanelPartOptions extends IPartOptions {
	hasTitle: true;
	borderWidth?: (() => number);
	useIcons?: boolean;
}

export abstract class BasePanelPart extends CompositePart<PaneComposite> implements IPaneCompositePart, IPaneCompositeSelectorPart {
	private static readonly MIN_COMPOSITE_BAR_WIDTH = 50;

	declare readonly _serviceBrand: undefined;

	//#region IView

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 77;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	readonly snap = true;

	get preferredHeight(): number | undefined {
		// Don't worry about titlebar or statusbar visibility
		// The difference is minimal and keeps this function clean
		return this.layoutService.dimension.height * 0.4;
	}

	get preferredWidth(): number | undefined {
		const activeComposite = this.getActivePaneComposite();

		if (!activeComposite) {
			return;
		}

		const width = activeComposite.getOptimalWidth();
		if (typeof width !== 'number') {
			return;
		}

		return Math.max(width, 300);
	}

	//#endregion

	get onDidPaneCompositeOpen(): Event<IPaneComposite> { return Event.map(this.onDidCompositeOpen.event, compositeEvent => <IPaneComposite>compositeEvent.composite); }
	readonly onDidPaneCompositeClose = this.onDidCompositeClose.event as Event<IPaneComposite>;

	private compositeBar: CompositeBar;
	private readonly compositeActions = new Map<string, { activityAction: PanelActivityAction; pinnedAction: ToggleCompositePinnedAction; badgeAction: ToggleCompositeBadgeAction }>();

	private globalToolBar: ToolBar | undefined;
	private globalActions: CompositeMenuActions;

	private readonly panelDisposables: Map<string, IDisposable> = new Map<string, IDisposable>();

	private blockOpeningPanel = false;
	protected contentDimension: Dimension | undefined;

	private extensionsRegistered = false;

	private panelRegistry: PaneCompositeRegistry;

	private dndHandler: ICompositeDragAndDrop;

	private readonly enabledViewContainersContextKeys: Map<string, IContextKey<boolean>> = new Map<string, IContextKey<boolean>>();

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@IExtensionService private readonly extensionService: IExtensionService,
		private readonly partId: Parts.PANEL_PART | Parts.AUXILIARYBAR_PART,
		activePanelSettingsKey: string,
		private readonly pinnedPanelsKey: string,
		private readonly placeholdeViewContainersKey: string,
		panelRegistryId: string,
		private readonly backgroundColor: string,
		private readonly viewContainerLocation: ViewContainerLocation,
		private readonly activePanelContextKey: IContextKey<string>,
		private panelFocusContextKey: IContextKey<boolean>,
		private readonly panelOptions: IPanelPartOptions,
	) {
		super(
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			instantiationService,
			themeService,
			Registry.as<PaneCompositeRegistry>(panelRegistryId),
			activePanelSettingsKey,
			viewDescriptorService.getDefaultViewContainer(viewContainerLocation)?.id || '',
			'panel',
			'panel',
			undefined,
			partId,
			panelOptions
		);

		this.panelRegistry = Registry.as<PaneCompositeRegistry>(panelRegistryId);

		this.dndHandler = new CompositeDragAndDrop(this.viewDescriptorService, this.viewContainerLocation,
			(id: string, focus?: boolean) => (this.openPaneComposite(id, focus) as Promise<IPaneComposite | undefined>).then(panel => panel || null),
			(from: string, to: string, before?: Before2D) => this.compositeBar.move(from, to, before?.horizontallyBefore),
			() => this.compositeBar.getCompositeBarItems()
		);

		this.compositeBar = this._register(this.instantiationService.createInstance(CompositeBar, this.getCachedPanels(), {
			icon: !!this.panelOptions.useIcons,
			orientation: ActionsOrientation.HORIZONTAL,
			activityHoverOptions: this.getActivityHoverOptions(),
			openComposite: (compositeId, preserveFocus) => this.openPaneComposite(compositeId, !preserveFocus).then(panel => panel || null),
			getActivityAction: compositeId => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: compositeId => this.getCompositeActions(compositeId).pinnedAction,
			getCompositeBadgeAction: compositeId => this.getCompositeActions(compositeId).badgeAction,
			getOnCompositeClickAction: compositeId => this.instantiationService.createInstance(PanelActivityAction, assertIsDefined(this.getPaneComposite(compositeId)), this.viewContainerLocation),
			fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
			getContextMenuActionsForComposite: compositeId => this.getContextMenuActionsForComposite(compositeId),
			getDefaultCompositeId: () => viewDescriptorService.getDefaultViewContainer(this.viewContainerLocation)?.id,
			hidePart: () => this.layoutService.setPartHidden(true, this.partId),
			dndHandler: this.dndHandler,
			compositeSize: 0,
			overflowActionSize: 44,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(this.backgroundColor), // Background color for overflow action
				inactiveBackgroundColor: theme.getColor(this.backgroundColor), // Background color for overflow action
				activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
				activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
				inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
				badgeBackground: theme.getColor(badgeBackground),
				badgeForeground: theme.getColor(badgeForeground),
				dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
			})
		}));

		this.registerListeners();
		this.onDidRegisterPanels([...this.getPaneComposites()]);

		// Global Panel Actions
		this.globalActions = this._register(this.instantiationService.createInstance(CompositeMenuActions, partId === Parts.PANEL_PART ? MenuId.PanelTitle : MenuId.AuxiliaryBarTitle, undefined, undefined));
		this._register(this.globalActions.onDidChange(() => this.updateGlobalToolbarActions()));
	}

	protected abstract getActivityHoverOptions(): IActivityHoverOptions;
	protected abstract fillExtraContextMenuActions(actions: IAction[]): void;

	private getContextMenuActionsForComposite(compositeId: string): IAction[] {
		const result: IAction[] = [];
		const viewContainer = this.viewDescriptorService.getViewContainerById(compositeId)!;
		const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer)!;
		if (defaultLocation !== this.viewDescriptorService.getViewContainerLocation(viewContainer)) {
			result.push(toAction({ id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => this.viewDescriptorService.moveViewContainerToLocation(viewContainer, defaultLocation) }));
		} else {
			const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			if (viewContainerModel.allViewDescriptors.length === 1) {
				const viewToReset = viewContainerModel.allViewDescriptors[0];
				const defaultContainer = this.viewDescriptorService.getDefaultContainerById(viewToReset.id)!;
				if (defaultContainer !== viewContainer) {
					result.push(toAction({ id: 'resetLocationAction', label: localize('resetLocation', "Reset Location"), run: () => this.viewDescriptorService.moveViewsToContainer([viewToReset], defaultContainer) }));
				}
			}
		}
		return result;
	}

	private onDidRegisterPanels(panels: PaneCompositeDescriptor[]): void {
		const cachedPanels = this.getCachedPanels();
		for (const panel of panels) {
			const cachedPanel = cachedPanels.filter(({ id }) => id === panel.id)[0];
			const activePanel = this.getActivePaneComposite();
			const isActive =
				activePanel?.getId() === panel.id ||
				(this.extensionsRegistered && this.compositeBar.getVisibleComposites().length === 0);

			if (isActive || !this.shouldBeHidden(panel.id, cachedPanel)) {

				// Override order
				const newPanel = {
					id: panel.id,
					name: panel.name,
					order: panel.order,
					requestedIndex: panel.requestedIndex
				};

				this.compositeBar.addComposite(newPanel);

				// Pin it by default if it is new
				if (!cachedPanel) {
					this.compositeBar.pin(panel.id);
				}

				if (isActive) {
					this.compositeBar.activateComposite(panel.id);

					// Only try to open the panel if it has been created and visible
					if (!activePanel && this.element && this.layoutService.isVisible(this.partId)) {
						this.doOpenPanel(panel.id);
					}
				}
			}
		}

		for (const panel of panels) {
			const viewContainer = this.getViewContainer(panel.id)!;
			const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
			this.updateActivity(viewContainer, viewContainerModel);
			this.showOrHideViewContainer(viewContainer, viewContainerModel);

			const disposables = new DisposableStore();
			disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.showOrHideViewContainer(viewContainer, viewContainerModel)));
			disposables.add(viewContainerModel.onDidChangeContainerInfo(() => this.updateActivity(viewContainer, viewContainerModel)));

			this.panelDisposables.set(panel.id, disposables);
		}
	}

	private async onDidDeregisterPanel(panelId: string): Promise<void> {
		const disposable = this.panelDisposables.get(panelId);
		disposable?.dispose();
		this.panelDisposables.delete(panelId);

		const activeContainers = this.viewDescriptorService.getViewContainersByLocation(this.viewContainerLocation)
			.filter(container => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0);

		if (activeContainers.length) {
			if (this.getActivePaneComposite()?.getId() === panelId) {
				const defaultPanelId = this.viewDescriptorService.getDefaultViewContainer(this.viewContainerLocation)?.id;
				const containerToOpen = activeContainers.filter(c => c.id === defaultPanelId)[0] || activeContainers[0];
				await this.openPaneComposite(containerToOpen.id);
			}
		} else {
			this.layoutService.setPartHidden(true, this.partId);
		}

		this.removeComposite(panelId);
	}

	private updateActivity(viewContainer: ViewContainer, viewContainerModel: IViewContainerModel): void {
		const cachedTitle = this.getPlaceholderViewContainers().filter(panel => panel.id === viewContainer.id)[0]?.name;

		const activity: IActivity = {
			id: viewContainer.id,
			name: this.extensionsRegistered || cachedTitle === undefined ? viewContainerModel.title : cachedTitle,
			keybindingId: viewContainerModel.keybindingId
		};

		const { activityAction, pinnedAction } = this.getCompositeActions(viewContainer.id);
		activityAction.setActivity(this.toActivity(viewContainerModel));

		if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
			pinnedAction.setActivity(activity);
		}

		// Composite Bar Swither needs to refresh tabs sizes and overflow action
		this.compositeBar.recomputeSizes();
		this.layoutCompositeBar();

		// only update our cached panel info after extensions are done registering
		if (this.extensionsRegistered) {
			this.saveCachedPanels();
		}
	}

	private toActivity(viewContainerModel: IViewContainerModel): IActivity {
		return BasePanelPart.toActivity(viewContainerModel.viewContainer.id, viewContainerModel.title, this.panelOptions.useIcons ? viewContainerModel.icon : undefined, viewContainerModel.keybindingId);
	}

	private static toActivity(id: string, name: string, icon: URI | ThemeIcon | undefined, keybindingId: string | undefined): IActivity {
		let classNames: string[] | undefined = undefined;
		let iconUrl: URI | undefined = undefined;
		if (URI.isUri(icon)) {
			iconUrl = icon;
			const cssUrl = asCSSUrl(icon);
			const hash = new StringSHA1();
			hash.update(cssUrl);
			const iconId = `activity-${id.replace(/\./g, '-')}-${hash.digest()}`;
			classNames = [iconId, 'uri-icon'];
			const iconClass = `.monaco-workbench .basepanel .monaco-action-bar .action-label.${iconId}`;
			createCSSRule(iconClass, `
				mask: ${cssUrl} no-repeat 50% 50%;
				mask-size: 16px;
				-webkit-mask: ${cssUrl} no-repeat 50% 50%;
				-webkit-mask-size: 16px;
				mask-origin: padding;
				-webkit-mask-origin: padding;
			`);
		} else if (ThemeIcon.isThemeIcon(icon)) {
			classNames = ThemeIcon.asClassNameArray(icon);
		}

		return { id, name, classNames, iconUrl, keybindingId };
	}

	private showOrHideViewContainer(viewContainer: ViewContainer, viewContainerModel: IViewContainerModel): void {
		let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
		if (!contextKey) {
			contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
			this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
		}
		if (viewContainerModel.activeViewDescriptors.length) {
			contextKey.set(true);
			this.compositeBar.addComposite({ id: viewContainer.id, name: typeof viewContainer.title === 'string' ? viewContainer.title : viewContainer.title.value, order: viewContainer.order, requestedIndex: viewContainer.requestedIndex });

			if (this.layoutService.isRestored() && this.layoutService.isVisible(this.partId)) {
				const activeComposite = this.getActiveComposite();
				if (activeComposite === undefined || activeComposite.getId() === viewContainer.id) {
					this.compositeBar.activateComposite(viewContainer.id);
				}
			}

			this.layoutCompositeBar();
			this.layoutEmptyMessage();
		} else if (viewContainer.hideIfEmpty) {
			contextKey.set(false);
			this.hideComposite(viewContainer.id);
		}
	}

	private shouldBeHidden(panelId: string, cachedPanel?: ICachedPanel): boolean {
		const viewContainer = this.getViewContainer(panelId);
		if (!viewContainer || !viewContainer.hideIfEmpty) {
			return false;
		}

		return cachedPanel?.views && cachedPanel.views.length
			? cachedPanel.views.every(({ when }) => !!when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)))
			: false;
	}

	private registerListeners(): void {

		// Panel registration
		this._register(this.registry.onDidRegister(panel => this.onDidRegisterPanels([panel])));
		this._register(this.registry.onDidDeregister(panel => this.onDidDeregisterPanel(panel.id)));

		// Activate on panel open
		this._register(this.onDidPaneCompositeOpen(panel => this.onPanelOpen(panel)));

		// Deactivate on panel close
		this._register(this.onDidPaneCompositeClose(this.onPanelClose, this));

		// Extension registration
		const disposables = this._register(new DisposableStore());
		this._register(this.extensionService.onDidRegisterExtensions(() => {
			disposables.clear();
			this.onDidRegisterExtensions();
			this.compositeBar.onDidChange(() => this.saveCachedPanels(), this, disposables);
			this.storageService.onDidChangeValue(e => this.onDidStorageValueChange(e), this, disposables);
		}));

	}

	private onDidRegisterExtensions(): void {
		this.extensionsRegistered = true;

		// hide/remove composites
		const panels = this.getPaneComposites();
		for (const { id } of this.getCachedPanels()) {
			if (panels.every(panel => panel.id !== id)) {
				if (this.viewDescriptorService.isViewContainerRemovedPermanently(id)) {
					this.removeComposite(id);
				} else {
					this.hideComposite(id);
				}
			}
		}

		this.saveCachedPanels();
	}

	private hideComposite(compositeId: string): void {
		this.compositeBar.hideComposite(compositeId);

		const compositeActions = this.compositeActions.get(compositeId);
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			this.compositeActions.delete(compositeId);
		}
	}

	private onPanelOpen(panel: IComposite): void {
		this.activePanelContextKey.set(panel.getId());

		const foundPanel = this.panelRegistry.getPaneComposite(panel.getId());
		if (foundPanel) {
			this.compositeBar.addComposite(foundPanel);
		}

		// Activate composite when opened
		this.compositeBar.activateComposite(panel.getId());

		const panelDescriptor = this.panelRegistry.getPaneComposite(panel.getId());
		if (panelDescriptor) {
			const viewContainer = this.getViewContainer(panelDescriptor.id);
			if (viewContainer?.hideIfEmpty) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				if (viewContainerModel.activeViewDescriptors.length === 0) {
					this.hideComposite(panelDescriptor.id); // Update the composite bar by hiding
				}
			}
		}

		this.layoutCompositeBar(); // Need to relayout composite bar since different panels have different action bar width
		this.layoutEmptyMessage();
	}

	private onPanelClose(panel: IComposite): void {
		const id = panel.getId();

		if (this.activePanelContextKey.get() === id) {
			this.activePanelContextKey.reset();
		}

		this.compositeBar.deactivateComposite(panel.getId());
		this.layoutEmptyMessage();
	}

	override create(parent: HTMLElement): void {
		this.element = parent;

		super.create(parent);

		this.createEmptyPanelMessage();

		const focusTracker = this._register(trackFocus(parent));
		this._register(focusTracker.onDidFocus(() => this.panelFocusContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.panelFocusContextKey.set(false)));
	}

	private createEmptyPanelMessage(): void {
		const contentArea = this.getContentArea()!;
		this.emptyPanelMessageElement = document.createElement('div');
		this.emptyPanelMessageElement.classList.add('empty-panel-message-area');

		const messageElement = document.createElement('div');
		messageElement.classList.add('empty-panel-message');
		messageElement.innerText = localize('panel.emptyMessage', "Drag a view here to display.");

		this.emptyPanelMessageElement.appendChild(messageElement);
		contentArea.appendChild(this.emptyPanelMessageElement);

		this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.emptyPanelMessageElement, {
			onDragOver: (e) => {
				EventHelper.stop(e.eventData, true);
				const validDropTarget = this.dndHandler.onDragEnter(e.dragAndDropData, undefined, e.eventData);
				toggleDropEffect(e.eventData.dataTransfer, 'move', validDropTarget);
			},
			onDragEnter: (e) => {
				EventHelper.stop(e.eventData, true);

				const validDropTarget = this.dndHandler.onDragEnter(e.dragAndDropData, undefined, e.eventData);
				this.emptyPanelMessageElement!.style.backgroundColor = validDropTarget ? this.theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND)?.toString() || '' : '';
			},
			onDragLeave: (e) => {
				EventHelper.stop(e.eventData, true);
				this.emptyPanelMessageElement!.style.backgroundColor = '';
			},
			onDragEnd: (e) => {
				EventHelper.stop(e.eventData, true);
				this.emptyPanelMessageElement!.style.backgroundColor = '';
			},
			onDrop: (e) => {
				EventHelper.stop(e.eventData, true);
				this.emptyPanelMessageElement!.style.backgroundColor = '';

				this.dndHandler.drop(e.dragAndDropData, undefined, e.eventData);
			},
		}));
	}

	protected override  createTitleArea(parent: HTMLElement): HTMLElement {
		const element = super.createTitleArea(parent);
		const globalTitleActionsContainer = element.appendChild($('.global-actions'));

		// Global Actions Toolbar
		this.globalToolBar = this._register(new ToolBar(globalTitleActionsContainer, this.contextMenuService, {
			actionViewItemProvider: action => this.actionViewItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
			toggleMenuTitle: localize('moreActions', "More Actions...")
		}));

		this.updateGlobalToolbarActions();

		return element;
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		container.style.backgroundColor = this.getColor(this.backgroundColor) || '';
		const borderColor = this.getColor(contrastBorder) || '';
		container.style.borderLeftColor = borderColor;
		container.style.borderRightColor = borderColor;

		const title = this.getTitleArea();
		if (title) {
			title.style.borderTopColor = this.getColor(contrastBorder) || '';
		}
	}

	doOpenPanel(id: string, focus?: boolean): PaneComposite | undefined {
		if (this.blockOpeningPanel) {
			return undefined; // Workaround against a potential race condition
		}

		// First check if panel is hidden and show if so
		if (!this.layoutService.isVisible(this.partId)) {
			try {
				this.blockOpeningPanel = true;
				this.layoutService.setPartHidden(false, this.partId);
			} finally {
				this.blockOpeningPanel = false;
			}
		}

		return this.openComposite(id, focus) as PaneComposite;
	}

	async openPaneComposite(id?: string, focus?: boolean): Promise<PaneComposite | undefined> {
		if (typeof id === 'string' && this.getPaneComposite(id)) {
			return this.doOpenPanel(id, focus);
		}

		await this.extensionService.whenInstalledExtensionsRegistered();

		if (typeof id === 'string' && this.getPaneComposite(id)) {
			return this.doOpenPanel(id, focus);
		}

		return undefined;
	}

	showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable {
		return this.compositeBar.showActivity(panelId, badge, clazz);
	}

	getPaneComposite(panelId: string): PaneCompositeDescriptor | undefined {
		return this.panelRegistry.getPaneComposite(panelId);
	}

	getPaneComposites(): PaneCompositeDescriptor[] {
		return this.panelRegistry.getPaneComposites()
			.sort((v1, v2) => {
				if (typeof v1.order !== 'number') {
					return 1;
				}

				if (typeof v2.order !== 'number') {
					return -1;
				}

				return v1.order - v2.order;
			});
	}

	getPinnedPaneCompositeIds(): string[] {
		const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(c => c.id);
		return this.getPaneComposites()
			.filter(p => pinnedCompositeIds.includes(p.id))
			.sort((p1, p2) => pinnedCompositeIds.indexOf(p1.id) - pinnedCompositeIds.indexOf(p2.id))
			.map(p => p.id);
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.compositeBar.getVisibleComposites()
			.filter(v => this.getActivePaneComposite()?.getId() === v.id || this.compositeBar.isPinned(v.id))
			.map(v => v.id);
	}

	getActivePaneComposite(): IPaneComposite | undefined {
		return <IPaneComposite>this.getActiveComposite();
	}

	getLastActivePaneCompositeId(): string {
		return this.getLastActiveCompositeId();
	}

	hideActivePaneComposite(): void {
		// First check if panel is visible and hide if so
		if (this.layoutService.isVisible(this.partId)) {
			this.layoutService.setPartHidden(true, this.partId);
		}

		this.hideActiveComposite();
	}

	protected override createTitleLabel(parent: HTMLElement): ICompositeTitleLabel {
		const titleArea = this.compositeBar.create(parent);
		titleArea.classList.add('panel-switcher-container');

		return {
			updateTitle: (id, title, keybinding) => {
				const action = this.compositeBar.getAction(id);
				if (action) {
					action.label = title;
				}
			},
			updateStyles: () => {
				// Handled via theming participant
			}
		};
	}

	protected override onTitleAreaUpdate(compositeId: string): void {
		super.onTitleAreaUpdate(compositeId);

		// If title actions change, relayout the composite bar
		this.layoutCompositeBar();
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(this.partId)) {
			return;
		}

		this.contentDimension = new Dimension(width, height);

		// Layout contents
		super.layout(this.contentDimension.width, this.contentDimension.height, top, left);

		// Layout composite bar
		this.layoutCompositeBar();

		// Add empty panel message
		this.layoutEmptyMessage();
	}

	private layoutCompositeBar(): void {
		if (this.contentDimension && this.dimension) {
			let availableWidth = this.contentDimension.width - 40; // take padding into account
			if (this.toolBar) {
				availableWidth = Math.max(BasePanelPart.MIN_COMPOSITE_BAR_WIDTH, availableWidth - this.getToolbarWidth()); // adjust height for global actions showing
			}

			this.compositeBar.layout(new Dimension(availableWidth, this.dimension.height));
		}
	}

	private emptyPanelMessageElement: HTMLElement | undefined;
	private layoutEmptyMessage(): void {
		this.emptyPanelMessageElement?.classList.toggle('visible', this.compositeBar.getVisibleComposites().length === 0);
	}

	private getViewContainer(id: string): ViewContainer | undefined {
		const viewContainer = this.viewDescriptorService.getViewContainerById(id);
		return viewContainer && this.viewDescriptorService.getViewContainerLocation(viewContainer) === this.viewContainerLocation ? viewContainer : undefined;
	}

	private updateGlobalToolbarActions(): void {
		const primaryActions = this.globalActions.getPrimaryActions();
		const secondaryActions = this.globalActions.getSecondaryActions();

		this.globalToolBar?.setActions(prepareActions(primaryActions), prepareActions(secondaryActions));
	}

	private getCompositeActions(compositeId: string): { activityAction: PanelActivityAction; pinnedAction: ToggleCompositePinnedAction; badgeAction: ToggleCompositeBadgeAction } {
		let compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			// const panel = this.getPaneComposite(compositeId);
			const viewContainer = this.getViewContainer(compositeId);

			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				compositeActions = {
					activityAction: this.instantiationService.createInstance(PanelActivityAction, this.toActivity(viewContainerModel), this.viewContainerLocation),
					pinnedAction: new ToggleCompositePinnedAction(this.toActivity(viewContainerModel), this.compositeBar),
					badgeAction: new ToggleCompositeBadgeAction(this.toActivity(viewContainerModel), this.compositeBar)
				};
			} else {
				compositeActions = {
					activityAction: this.instantiationService.createInstance(PlaceHolderPanelActivityAction, compositeId, this.viewContainerLocation),
					pinnedAction: new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar),
					badgeAction: new PlaceHolderToggleCompositeBadgeAction(compositeId, this.compositeBar)
				};
			}

			this.compositeActions.set(compositeId, compositeActions);
		}

		return compositeActions;
	}

	protected override removeComposite(compositeId: string): boolean {
		if (super.removeComposite(compositeId)) {
			this.compositeBar.removeComposite(compositeId);
			const compositeActions = this.compositeActions.get(compositeId);
			if (compositeActions) {
				compositeActions.activityAction.dispose();
				compositeActions.pinnedAction.dispose();
				this.compositeActions.delete(compositeId);
			}

			return true;
		}

		return false;
	}

	protected getToolbarWidth(): number {
		const activePanel = this.getActivePaneComposite();
		if (!activePanel || !this.toolBar) {
			return 0;
		}

		return this.toolBar.getItemsWidth() + (this.globalToolBar?.getItemsWidth() ?? 0);
	}

	private onDidStorageValueChange(e: IStorageValueChangeEvent): void {
		if (e.key === this.pinnedPanelsKey && e.scope === StorageScope.PROFILE
			&& this.cachedPanelsValue !== this.getStoredCachedPanelsValue() /* This checks if current window changed the value or not */) {
			this._cachedPanelsValue = undefined;
			const newCompositeItems: ICompositeBarItem[] = [];
			const compositeItems = this.compositeBar.getCompositeBarItems();
			const cachedPanels = this.getCachedPanels();

			for (const cachedPanel of cachedPanels) {
				// copy behavior from activity bar
				newCompositeItems.push({
					id: cachedPanel.id,
					name: cachedPanel.name,
					order: cachedPanel.order,
					pinned: cachedPanel.pinned,
					visible: !!compositeItems.find(({ id }) => id === cachedPanel.id)
				});
			}

			for (let index = 0; index < compositeItems.length; index++) {
				// Add items currently exists but does not exist in new.
				if (!newCompositeItems.some(({ id }) => id === compositeItems[index].id)) {
					newCompositeItems.splice(index, 0, compositeItems[index]);
				}
			}

			this.compositeBar.setCompositeBarItems(newCompositeItems);
		}
	}

	private saveCachedPanels(): void {
		const state: ICachedPanel[] = [];
		const placeholders: IPlaceholderViewContainer[] = [];

		const compositeItems = this.compositeBar.getCompositeBarItems();
		for (const compositeItem of compositeItems) {
			const viewContainer = this.getViewContainer(compositeItem.id);
			if (viewContainer) {
				const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
				state.push({ id: compositeItem.id, name: viewContainerModel.title, pinned: compositeItem.pinned, order: compositeItem.order, visible: compositeItem.visible });
				placeholders.push({ id: compositeItem.id, name: this.getCompositeActions(compositeItem.id).activityAction.label });
			} else {
				state.push({ id: compositeItem.id, name: compositeItem.name, pinned: compositeItem.pinned, order: compositeItem.order, visible: compositeItem.visible });
			}
		}

		this.cachedPanelsValue = JSON.stringify(state);
		this.setPlaceholderViewContainers(placeholders);
	}

	private getCachedPanels(): ICachedPanel[] {
		const registeredPanels = this.getPaneComposites();

		const storedStates: Array<string | ICachedPanel> = JSON.parse(this.cachedPanelsValue);
		const cachedPanels = storedStates.map(c => {
			const serialized: ICachedPanel = typeof c === 'string' /* migration from pinned states to composites states */ ? { id: c, pinned: true, order: undefined, visible: true } : c;
			const registered = registeredPanels.some(p => p.id === serialized.id);
			serialized.visible = registered ? isUndefinedOrNull(serialized.visible) ? true : serialized.visible : false;
			return serialized;
		});

		for (const placeholderViewContainer of this.getPlaceholderViewContainers()) {
			const cachedViewContainer = cachedPanels.filter(cached => cached.id === placeholderViewContainer.id)[0];
			if (cachedViewContainer) {
				cachedViewContainer.name = placeholderViewContainer.name;
			}
		}

		return cachedPanels;
	}

	private _cachedPanelsValue: string | undefined;
	private get cachedPanelsValue(): string {
		if (!this._cachedPanelsValue) {
			this._cachedPanelsValue = this.getStoredCachedPanelsValue();
		}

		return this._cachedPanelsValue;
	}

	private set cachedPanelsValue(cachedViewletsValue: string) {
		if (this.cachedPanelsValue !== cachedViewletsValue) {
			this._cachedPanelsValue = cachedViewletsValue;
			this.setStoredCachedViewletsValue(cachedViewletsValue);
		}
	}

	private getStoredCachedPanelsValue(): string {
		return this.storageService.get(this.pinnedPanelsKey, StorageScope.PROFILE, '[]');
	}

	private setStoredCachedViewletsValue(value: string): void {
		this.storageService.store(this.pinnedPanelsKey, value, StorageScope.PROFILE, StorageTarget.USER);
	}

	private getPlaceholderViewContainers(): IPlaceholderViewContainer[] {
		return JSON.parse(this.placeholderViewContainersValue);
	}

	private setPlaceholderViewContainers(placeholderViewContainers: IPlaceholderViewContainer[]): void {
		this.placeholderViewContainersValue = JSON.stringify(placeholderViewContainers);
	}

	private _placeholderViewContainersValue: string | undefined;
	private get placeholderViewContainersValue(): string {
		if (!this._placeholderViewContainersValue) {
			this._placeholderViewContainersValue = this.getStoredPlaceholderViewContainersValue();
		}

		return this._placeholderViewContainersValue;
	}

	private set placeholderViewContainersValue(placeholderViewContainesValue: string) {
		if (this.placeholderViewContainersValue !== placeholderViewContainesValue) {
			this._placeholderViewContainersValue = placeholderViewContainesValue;
			this.setStoredPlaceholderViewContainersValue(placeholderViewContainesValue);
		}
	}

	private getStoredPlaceholderViewContainersValue(): string {
		return this.storageService.get(this.placeholdeViewContainersKey, StorageScope.WORKSPACE, '[]');
	}

	private setStoredPlaceholderViewContainersValue(value: string): void {
		this.storageService.store(this.placeholdeViewContainersKey, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

export class PanelPart extends BasePanelPart {
	static readonly activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@ICommandService private commandService: ICommandService,
		@IMenuService private menuService: IMenuService,
	) {
		super(
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			Parts.PANEL_PART,
			PanelPart.activePanelSettingsKey,
			'workbench.panel.pinnedPanels',
			'workbench.panel.placeholderPanels',
			PaneCompositeExtensions.Panels,
			PANEL_BACKGROUND,
			ViewContainerLocation.Panel,
			ActivePanelContext.bindTo(contextKeyService),
			PanelFocusContext.bindTo(contextKeyService),
			{
				useIcons: false,
				hasTitle: true
			},
		);
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		const borderColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
		container.style.borderLeftColor = borderColor;
		container.style.borderRightColor = borderColor;

		const title = this.getTitleArea();
		if (title) {
			title.style.borderTopColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
		}
	}

	protected getActivityHoverOptions(): IActivityHoverOptions {
		return {
			position: () => this.layoutService.getPanelPosition() === Position.BOTTOM && !this.layoutService.isPanelMaximized() ? HoverPosition.ABOVE : HoverPosition.BELOW,
		};
	}

	protected fillExtraContextMenuActions(actions: IAction[]): void {

		const panelPositionMenu = this.menuService.createMenu(MenuId.PanelPositionMenu, this.contextKeyService);
		const panelAlignMenu = this.menuService.createMenu(MenuId.PanelAlignmentMenu, this.contextKeyService);
		const positionActions: IAction[] = [];
		const alignActions: IAction[] = [];
		createAndFillInContextMenuActions(panelPositionMenu, { shouldForwardArgs: true }, { primary: [], secondary: positionActions });
		createAndFillInContextMenuActions(panelAlignMenu, { shouldForwardArgs: true }, { primary: [], secondary: alignActions });
		panelAlignMenu.dispose();
		panelPositionMenu.dispose();

		actions.push(...[
			new Separator(),
			new SubmenuAction('workbench.action.panel.position', localize('panel position', "Panel Position"), positionActions),
			new SubmenuAction('workbench.action.panel.align', localize('align panel', "Align Panel"), alignActions),
			toAction({ id: TogglePanelAction.ID, label: localize('hidePanel', "Hide Panel"), run: () => this.commandService.executeCommand(TogglePanelAction.ID) })
		]);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		let dimensions: Dimension;
		if (this.layoutService.getPanelPosition() === Position.RIGHT) {
			dimensions = new Dimension(width - 1, height); // Take into account the 1px border when layouting
		} else {
			dimensions = new Dimension(width, height);
		}

		// Layout contents
		super.layout(dimensions.width, dimensions.height, top, left);
	}

	toJSON(): object {
		return {
			type: Parts.PANEL_PART
		};
	}
}
