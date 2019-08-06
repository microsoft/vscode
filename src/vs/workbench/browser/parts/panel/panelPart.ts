/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import { IAction } from 'vs/base/common/actions';
import { Event, Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IPanel, ActivePanelContext, PanelFocusContext } from 'vs/workbench/common/panel';
import { CompositePart, ICompositeTitleLabel } from 'vs/workbench/browser/parts/compositePart';
import { Panel, PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { IPanelService, IPanelIdentifier } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService, StorageScope, IWorkspaceStorageChangeEvent } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ClosePanelAction, TogglePanelPositionAction, PanelActivityAction, ToggleMaximizedPanelAction, TogglePanelAction } from 'vs/workbench/browser/parts/panel/panelActions';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { PANEL_BACKGROUND, PANEL_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_DRAG_AND_DROP_BACKGROUND, PANEL_INPUT_BORDER } from 'vs/workbench/common/theme';
import { activeContrastBorder, focusBorder, contrastBorder, editorBackground, badgeBackground, badgeForeground } from 'vs/platform/theme/common/colorRegistry';
import { CompositeBar, ICompositeBarItem } from 'vs/workbench/browser/parts/compositeBar';
import { ToggleCompositePinnedAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, trackFocus } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { isUndefinedOrNull, withUndefinedAsNull, withNullAsUndefined } from 'vs/base/common/types';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

interface ICachedPanel {
	id: string;
	pinned: boolean;
	order?: number;
	visible: boolean;
}

export class PanelPart extends CompositePart<Panel> implements IPanelService {

	static readonly activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	private static readonly PINNED_PANELS = 'workbench.panel.pinnedPanels';
	private static readonly MIN_COMPOSITE_BAR_WIDTH = 50;

	_serviceBrand!: ServiceIdentifier<any>;

	//#region IView

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 77;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	readonly snap = true;

	get preferredHeight(): number | undefined {
		const sidebarDimension = this.layoutService.getDimension(Parts.SIDEBAR_PART);
		return sidebarDimension.height * 0.4;
	}

	get preferredWidth(): number | undefined {
		const statusbarPart = this.layoutService.getDimension(Parts.STATUSBAR_PART);
		return statusbarPart.width * 0.4;
	}

	//#endregion

	get onDidPanelOpen(): Event<{ panel: IPanel, focus: boolean }> { return Event.map(this.onDidCompositeOpen.event, compositeOpen => ({ panel: compositeOpen.composite, focus: compositeOpen.focus })); }
	readonly onDidPanelClose: Event<IPanel> = this.onDidCompositeClose.event;

	private _onDidVisibilityChange = this._register(new Emitter<boolean>());
	readonly onDidVisibilityChange: Event<boolean> = this._onDidVisibilityChange.event;

	private activePanelContextKey: IContextKey<string>;
	private panelFocusContextKey: IContextKey<boolean>;

	private compositeBar: CompositeBar;
	private compositeActions: Map<string, { activityAction: PanelActivityAction, pinnedAction: ToggleCompositePinnedAction }> = new Map();

	private blockOpeningPanel = false;
	private _contentDimension: Dimension | undefined;

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService
	) {
		super(
			notificationService,
			storageService,
			telemetryService,
			contextMenuService,
			layoutService,
			keybindingService,
			instantiationService,
			themeService,
			Registry.as<PanelRegistry>(PanelExtensions.Panels),
			PanelPart.activePanelSettingsKey,
			Registry.as<PanelRegistry>(PanelExtensions.Panels).getDefaultPanelId(),
			'panel',
			'panel',
			undefined,
			Parts.PANEL_PART,
			{ hasTitle: true }
		);

		this.compositeBar = this._register(this.instantiationService.createInstance(CompositeBar, this.getCachedPanels(), {
			icon: false,
			orientation: ActionsOrientation.HORIZONTAL,
			openComposite: (compositeId: string) => Promise.resolve(this.openPanel(compositeId, true)),
			getActivityAction: (compositeId: string) => this.getCompositeActions(compositeId).activityAction,
			getCompositePinnedAction: (compositeId: string) => this.getCompositeActions(compositeId).pinnedAction,
			getOnCompositeClickAction: (compositeId: string) => this.instantiationService.createInstance(PanelActivityAction, this.getPanel(compositeId)),
			getContextMenuActions: () => [
				this.instantiationService.createInstance(TogglePanelPositionAction, TogglePanelPositionAction.ID, TogglePanelPositionAction.LABEL),
				this.instantiationService.createInstance(TogglePanelAction, TogglePanelAction.ID, localize('hidePanel', "Hide Panel"))
			],
			getDefaultCompositeId: () => Registry.as<PanelRegistry>(PanelExtensions.Panels).getDefaultPanelId(),
			hidePart: () => this.layoutService.setPanelHidden(true),
			compositeSize: 0,
			overflowActionSize: 44,
			colors: (theme: ITheme) => ({
				activeBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
				inactiveBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
				activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
				activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
				inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
				badgeBackground: theme.getColor(badgeBackground),
				badgeForeground: theme.getColor(badgeForeground),
				dragAndDropBackground: theme.getColor(PANEL_DRAG_AND_DROP_BACKGROUND)
			})
		}));

		for (const panel of this.getPanels()) {
			this.compositeBar.addComposite(panel);
		}

		this.activePanelContextKey = ActivePanelContext.bindTo(contextKeyService);
		this.panelFocusContextKey = PanelFocusContext.bindTo(contextKeyService);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Panel open/close
		this._register(this.onDidPanelOpen(({ panel }) => this.onPanelOpen(panel)));
		this._register(this.onDidPanelClose(this.onPanelClose, this));

		// Panel register/deregister
		this._register(this.registry.onDidRegister(panelDescriptor => this.compositeBar.addComposite(panelDescriptor)));
		this._register(this.registry.onDidDeregister(panelDescriptor => {
			this.compositeBar.hideComposite(panelDescriptor.id);
			this.removeComposite(panelDescriptor.id);
		}));

		// Activate panel action on opening of a panel
		this._register(this.onDidPanelOpen(({ panel }) => {
			this.compositeBar.activateComposite(panel.getId());
			this.layoutCompositeBar(); // Need to relayout composite bar since different panels have different action bar width
		}));

		// Deactivate panel action on close
		this._register(this.onDidPanelClose(panel => this.compositeBar.deactivateComposite(panel.getId())));

		// State
		this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
			this._register(this.compositeBar.onDidChange(() => this.saveCachedPanels()));
			this._register(this.storageService.onDidChangeStorage(e => this.onDidStorageChange(e)));
		});
	}

	private onPanelOpen(panel: IPanel): void {
		this.activePanelContextKey.set(panel.getId());
	}

	private onPanelClose(panel: IPanel): void {
		const id = panel.getId();

		if (this.activePanelContextKey.get() === id) {
			this.activePanelContextKey.reset();
		}
	}

	create(parent: HTMLElement): void {
		this.element = parent;

		super.create(parent);

		const focusTracker = this._register(trackFocus(parent));
		this._register(focusTracker.onDidFocus(() => this.panelFocusContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.panelFocusContextKey.set(false)));
	}

	updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();
		container.style.backgroundColor = this.getColor(PANEL_BACKGROUND);
		container.style.borderLeftColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder);

		const title = this.getTitleArea();
		if (title) {
			title.style.borderTopColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder);
		}
	}

	openPanel(id: string, focus?: boolean): Panel | null {
		if (this.blockOpeningPanel) {
			return null; // Workaround against a potential race condition
		}

		// First check if panel is hidden and show if so
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			try {
				this.blockOpeningPanel = true;
				this.layoutService.setPanelHidden(false);
			} finally {
				this.blockOpeningPanel = false;
			}
		}

		return withUndefinedAsNull(this.openComposite(id, focus));
	}

	showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable {
		return this.compositeBar.showActivity(panelId, badge, clazz);
	}

	getPanel(panelId: string): IPanelIdentifier | undefined {
		return withNullAsUndefined(Registry.as<PanelRegistry>(PanelExtensions.Panels).getPanel(panelId));
	}

	getPanels(): PanelDescriptor[] {
		return Registry.as<PanelRegistry>(PanelExtensions.Panels).getPanels()
			.sort((v1, v2) => typeof v1.order === 'number' && typeof v2.order === 'number' ? v1.order - v2.order : NaN);
	}

	getPinnedPanels(): PanelDescriptor[] {
		const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(c => c.id);
		return this.getPanels()
			.filter(p => pinnedCompositeIds.indexOf(p.id) !== -1)
			.sort((p1, p2) => pinnedCompositeIds.indexOf(p1.id) - pinnedCompositeIds.indexOf(p2.id));
	}

	protected getActions(): ReadonlyArray<IAction> {
		return [
			this.instantiationService.createInstance(ToggleMaximizedPanelAction, ToggleMaximizedPanelAction.ID, ToggleMaximizedPanelAction.LABEL),
			this.instantiationService.createInstance(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL)
		];
	}

	getActivePanel(): IPanel | null {
		return this.getActiveComposite();
	}

	getLastActivePanelId(): string {
		return this.getLastActiveCompositetId();
	}

	hideActivePanel(): void {
		// First check if panel is visible and hide if so
		if (this.layoutService.isVisible(Parts.PANEL_PART)) {
			this.layoutService.setPanelHidden(true);
		}

		this.hideActiveComposite();
	}

	protected createTitleLabel(parent: HTMLElement): ICompositeTitleLabel {
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

	layout(width: number, height: number): void {
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			return;
		}

		if (this.layoutService.getPanelPosition() === Position.RIGHT) {
			this._contentDimension = new Dimension(width - 1, height!); // Take into account the 1px border when layouting
		} else {
			this._contentDimension = new Dimension(width, height!);
		}

		// Layout contents
		super.layout(this._contentDimension.width, this._contentDimension.height);

		// Layout composite bar
		this.layoutCompositeBar();
	}

	private layoutCompositeBar(): void {
		if (this._contentDimension) {
			let availableWidth = this._contentDimension.width - 40; // take padding into account
			if (this.toolBar) {
				availableWidth = Math.max(PanelPart.MIN_COMPOSITE_BAR_WIDTH, availableWidth - this.getToolbarWidth()); // adjust height for global actions showing
			}

			this.compositeBar.layout(new Dimension(availableWidth, this.dimension.height));
		}
	}

	private getCompositeActions(compositeId: string): { activityAction: PanelActivityAction, pinnedAction: ToggleCompositePinnedAction } {
		let compositeActions = this.compositeActions.get(compositeId);
		if (!compositeActions) {
			compositeActions = {
				activityAction: this.instantiationService.createInstance(PanelActivityAction, this.getPanel(compositeId)),
				pinnedAction: new ToggleCompositePinnedAction(this.getPanel(compositeId), this.compositeBar)
			};

			this.compositeActions.set(compositeId, compositeActions);
		}

		return compositeActions;
	}

	protected removeComposite(compositeId: string): boolean {
		if (super.removeComposite(compositeId)) {
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

	private getToolbarWidth(): number {
		const activePanel = this.getActivePanel();
		if (!activePanel) {
			return 0;
		}

		return this.toolBar.getItemsWidth();
	}

	private onDidStorageChange(e: IWorkspaceStorageChangeEvent): void {
		if (e.key === PanelPart.PINNED_PANELS && e.scope === StorageScope.GLOBAL
			&& this.cachedPanelsValue !== this.getStoredCachedPanelsValue() /* This checks if current window changed the value or not */) {
			this._cachedPanelsValue = undefined;
			const newCompositeItems: ICompositeBarItem[] = [];
			const compositeItems = this.compositeBar.getCompositeBarItems();
			const cachedPanels = this.getCachedPanels();

			for (const cachedPanel of cachedPanels) {
				// Add and update existing items
				const existingItem = compositeItems.filter(({ id }) => id === cachedPanel.id)[0];
				if (existingItem) {
					newCompositeItems.push({
						id: existingItem.id,
						name: existingItem.name,
						order: existingItem.order,
						pinned: cachedPanel.pinned,
						visible: existingItem.visible
					});
				}
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

		const compositeItems = this.compositeBar.getCompositeBarItems();
		for (const compositeItem of compositeItems) {
			state.push({ id: compositeItem.id, pinned: compositeItem.pinned, order: compositeItem.order, visible: compositeItem.visible });
		}

		this.cachedPanelsValue = JSON.stringify(state);
	}

	private getCachedPanels(): ICachedPanel[] {
		const registeredPanels = this.getPanels();

		const storedStates: Array<string | ICachedPanel> = JSON.parse(this.cachedPanelsValue);
		const cachedPanels = storedStates.map(c => {
			const serialized: ICachedPanel = typeof c === 'string' /* migration from pinned states to composites states */ ? { id: c, pinned: true, order: undefined, visible: true } : c;
			const registered = registeredPanels.some(p => p.id === serialized.id);
			serialized.visible = registered ? isUndefinedOrNull(serialized.visible) ? true : serialized.visible : false;
			return serialized;
		});

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
		return this.storageService.get(PanelPart.PINNED_PANELS, StorageScope.GLOBAL, '[]');
	}

	private setStoredCachedViewletsValue(value: string): void {
		this.storageService.store(PanelPart.PINNED_PANELS, value, StorageScope.GLOBAL);
	}

	setVisible(visible: boolean): void {
		this._onDidVisibilityChange.fire(visible);
	}

	toJSON(): object {
		return {
			type: Parts.PANEL_PART
		};
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// Panel Background: since panels can host editors, we apply a background rule if the panel background
	// color is different from the editor background color. This is a bit of a hack though. The better way
	// would be to have a way to push the background color onto each editor widget itself somehow.
	const panelBackground = theme.getColor(PANEL_BACKGROUND);
	if (panelBackground && panelBackground !== theme.getColor(editorBackground)) {
		collector.addRule(`
			.monaco-workbench .part.panel > .content .monaco-editor,
			.monaco-workbench .part.panel > .content .monaco-editor .margin,
			.monaco-workbench .part.panel > .content .monaco-editor .monaco-editor-background {
				background-color: ${panelBackground};
			}
		`);
	}

	// Title Active
	const titleActive = theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND);
	const titleActiveBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);
	if (titleActive || titleActiveBorder) {
		collector.addRule(`
			.monaco-workbench .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:hover .action-label {
				color: ${titleActive} !important;
				border-bottom-color: ${titleActiveBorder} !important;
			}
		`);
	}

	// Title focus
	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`
			.monaco-workbench .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:focus .action-label {
				color: ${titleActive} !important;
				border-bottom-color: ${focusBorderColor} !important;
				border-bottom: 1px solid;
			}
			`);
		collector.addRule(`
			.monaco-workbench .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:focus {
				outline: none;
			}
			`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`
			.monaco-workbench .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item.checked .action-label,
			.monaco-workbench .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label:hover {
				outline-color: ${outline};
				outline-width: 1px;
				outline-style: solid;
				border-bottom: none;
				padding-bottom: 0;
				outline-offset: 1px;
			}

			.monaco-workbench .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:not(.checked) .action-label:hover {
				outline-style: dashed;
			}
		`);
	}

	const inputBorder = theme.getColor(PANEL_INPUT_BORDER);
	if (inputBorder) {
		collector.addRule(`
			.monaco-workbench .part.panel .monaco-inputbox {
				border-color: ${inputBorder}
			}
		`);
	}
});

registerSingleton(IPanelService, PanelPart);
