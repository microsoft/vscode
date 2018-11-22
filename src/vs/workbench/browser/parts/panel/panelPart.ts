/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import { IAction } from 'vs/base/common/actions';
import { Event, mapEvent } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IPanel } from 'vs/workbench/common/panel';
import { CompositePart, ICompositeTitleLabel } from 'vs/workbench/browser/parts/compositePart';
import { Panel, PanelRegistry, Extensions as PanelExtensions, PanelDescriptor } from 'vs/workbench/browser/panel';
import { IPanelService, IPanelIdentifier } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts, Position } from 'vs/workbench/services/part/common/partService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ClosePanelAction, TogglePanelPositionAction, PanelActivityAction, ToggleMaximizedPanelAction, TogglePanelAction } from 'vs/workbench/browser/parts/panel/panelActions';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { PANEL_BACKGROUND, PANEL_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_DRAG_AND_DROP_BACKGROUND } from 'vs/workbench/common/theme';
import { activeContrastBorder, focusBorder, contrastBorder, editorBackground, badgeBackground, badgeForeground } from 'vs/platform/theme/common/colorRegistry';
import { CompositeBar } from 'vs/workbench/browser/parts/compositeBar';
import { ToggleCompositePinnedAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, trackFocus } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export const ActivePanelContext = new RawContextKey<string>('activePanel', '');
export const PanelFocusContext = new RawContextKey<boolean>('panelFocus', false);

export class PanelPart extends CompositePart<Panel> implements IPanelService {

	static readonly activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	private static readonly PINNED_PANELS = 'workbench.panel.pinnedPanels';
	private static readonly MIN_COMPOSITE_BAR_WIDTH = 50;

	_serviceBrand: any;

	private activePanelContextKey: IContextKey<string>;
	private panelFocusContextKey: IContextKey<boolean>;
	private blockOpeningPanel: boolean;
	private compositeBar: CompositeBar;
	private compositeActions: { [compositeId: string]: { activityAction: PanelActivityAction, pinnedAction: ToggleCompositePinnedAction } } = Object.create(null);
	private dimension: Dimension;

	constructor(
		id: string,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPartService partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(
			notificationService,
			storageService,
			telemetryService,
			contextMenuService,
			partService,
			keybindingService,
			instantiationService,
			themeService,
			Registry.as<PanelRegistry>(PanelExtensions.Panels),
			PanelPart.activePanelSettingsKey,
			Registry.as<PanelRegistry>(PanelExtensions.Panels).getDefaultPanelId(),
			'panel',
			'panel',
			null,
			id,
			{ hasTitle: true }
		);

		this.compositeBar = this._register(this.instantiationService.createInstance(CompositeBar, {
			icon: false,
			storageId: PanelPart.PINNED_PANELS,
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
			hidePart: () => this.partService.setPanelHidden(true),
			compositeSize: 0,
			overflowActionSize: 44,
			colors: theme => ({
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

	create(parent: HTMLElement): void {
		super.create(parent);

		const focusTracker = trackFocus(parent);

		focusTracker.onDidFocus(() => {
			this.panelFocusContextKey.set(true);
		});
		focusTracker.onDidBlur(() => {
			this.panelFocusContextKey.set(false);
		});
	}

	private registerListeners(): void {
		this._register(this.onDidPanelOpen(({ panel }) => this._onDidPanelOpen(panel)));
		this._register(this.onDidPanelClose(this._onDidPanelClose, this));

		this._register(this.registry.onDidRegister(panelDescriptor => this.compositeBar.addComposite(panelDescriptor)));

		// Activate panel action on opening of a panel
		this._register(this.onDidPanelOpen(({ panel }) => {
			this.compositeBar.activateComposite(panel.getId());
			this.layoutCompositeBar(); // Need to relayout composite bar since different panels have different action bar width
		}));

		// Deactivate panel action on close
		this._register(this.onDidPanelClose(panel => this.compositeBar.deactivateComposite(panel.getId())));
	}

	private _onDidPanelOpen(panel: IPanel): void {
		this.activePanelContextKey.set(panel.getId());
	}

	private _onDidPanelClose(panel: IPanel): void {
		const id = panel.getId();

		if (this.activePanelContextKey.get() === id) {
			this.activePanelContextKey.reset();
		}
	}

	get onDidPanelOpen(): Event<{ panel: IPanel, focus: boolean }> {
		return mapEvent(this._onDidCompositeOpen.event, compositeOpen => ({ panel: compositeOpen.composite, focus: compositeOpen.focus }));
	}

	get onDidPanelClose(): Event<IPanel> {
		return this._onDidCompositeClose.event;
	}

	updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();
		container.style.backgroundColor = this.getColor(PANEL_BACKGROUND);
		container.style.borderLeftColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder);

		const title = this.getTitleArea();
		title.style.borderTopColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder);
	}

	openPanel(id: string, focus?: boolean): Panel {
		if (this.blockOpeningPanel) {
			return null; // Workaround against a potential race condition
		}

		// First check if panel is hidden and show if so
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			try {
				this.blockOpeningPanel = true;
				this.partService.setPanelHidden(false);
			} finally {
				this.blockOpeningPanel = false;
			}
		}

		return this.openComposite(id, focus);
	}

	showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable {
		return this.compositeBar.showActivity(panelId, badge, clazz);
	}

	private getPanel(panelId: string): IPanelIdentifier {
		return this.getPanels().filter(p => p.id === panelId).pop();
	}

	getPanels(): PanelDescriptor[] {
		return Registry.as<PanelRegistry>(PanelExtensions.Panels).getPanels()
			.filter(p => p.enabled)
			.sort((v1, v2) => v1.order - v2.order);
	}

	getPinnedPanels(): PanelDescriptor[] {
		const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map(c => c.id);
		return this.getPanels()
			.filter(p => pinnedCompositeIds.indexOf(p.id) !== -1)
			.sort((p1, p2) => pinnedCompositeIds.indexOf(p1.id) - pinnedCompositeIds.indexOf(p2.id));
	}

	setPanelEnablement(id: string, enabled: boolean): void {
		const descriptor = Registry.as<PanelRegistry>(PanelExtensions.Panels).getPanels().filter(p => p.id === id).pop();
		if (descriptor && descriptor.enabled !== enabled) {
			descriptor.enabled = enabled;
			if (enabled) {
				this.compositeBar.addComposite(descriptor);
			} else {
				this.removeComposite(id);
			}
		}
	}

	protected getActions(): IAction[] {
		return [
			this.instantiationService.createInstance(ToggleMaximizedPanelAction, ToggleMaximizedPanelAction.ID, ToggleMaximizedPanelAction.LABEL),
			this.instantiationService.createInstance(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL)
		];
	}

	getActivePanel(): IPanel {
		return this.getActiveComposite();
	}

	getLastActivePanelId(): string {
		return this.getLastActiveCompositetId();
	}

	hideActivePanel(): void {
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

	layout(dimension: Dimension): Dimension[] {
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			return [dimension];
		}

		if (this.partService.getPanelPosition() === Position.RIGHT) {
			// Take into account the 1px border when layouting
			this.dimension = new Dimension(dimension.width - 1, dimension.height);
		} else {
			this.dimension = dimension;
		}
		const sizes = super.layout(this.dimension);
		this.layoutCompositeBar();

		return sizes;
	}

	private layoutCompositeBar(): void {
		if (this.dimension) {
			let availableWidth = this.dimension.width - 40; // take padding into account
			if (this.toolBar) {
				// adjust height for global actions showing
				availableWidth = Math.max(PanelPart.MIN_COMPOSITE_BAR_WIDTH, availableWidth - this.getToolbarWidth());
			}
			this.compositeBar.layout(new Dimension(availableWidth, this.dimension.height));
		}
	}

	private getCompositeActions(compositeId: string): { activityAction: PanelActivityAction, pinnedAction: ToggleCompositePinnedAction } {
		let compositeActions = this.compositeActions[compositeId];
		if (!compositeActions) {
			compositeActions = {
				activityAction: this.instantiationService.createInstance(PanelActivityAction, this.getPanel(compositeId)),
				pinnedAction: new ToggleCompositePinnedAction(this.getPanel(compositeId), this.compositeBar)
			};
			this.compositeActions[compositeId] = compositeActions;
		}
		return compositeActions;
	}

	private removeComposite(compositeId: string): void {
		this.compositeBar.hideComposite(compositeId);
		const compositeActions = this.compositeActions[compositeId];
		if (compositeActions) {
			compositeActions.activityAction.dispose();
			compositeActions.pinnedAction.dispose();
			delete this.compositeActions[compositeId];
		}
	}

	private getToolbarWidth(): number {
		const activePanel = this.getActivePanel();
		if (!activePanel) {
			return 0;
		}
		return this.toolBar.getItemsWidth();
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// Panel Background: since panels can host editors, we apply a background rule if the panel background
	// color is different from the editor background color. This is a bit of a hack though. The better way
	// would be to have a way to push the background color onto each editor widget itself somehow.
	const panelBackground = theme.getColor(PANEL_BACKGROUND);
	if (panelBackground && panelBackground !== theme.getColor(editorBackground)) {
		collector.addRule(`
			.monaco-workbench > .part.panel > .content .monaco-editor,
			.monaco-workbench > .part.panel > .content .monaco-editor .margin,
			.monaco-workbench > .part.panel > .content .monaco-editor .monaco-editor-background {
				background-color: ${panelBackground};
			}
		`);
	}

	// Title Active
	const titleActive = theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND);
	const titleActiveBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);
	if (titleActive || titleActiveBorder) {
		collector.addRule(`
			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:hover .action-label {
				color: ${titleActive} !important;
				border-bottom-color: ${titleActiveBorder} !important;
			}
		`);
	}

	// Title focus
	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`
			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:focus .action-label {
				color: ${titleActive} !important;
				border-bottom-color: ${focusBorderColor} !important;
				border-bottom: 1px solid;
			}
			`);
		collector.addRule(`
			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:focus {
				outline: none;
			}
			`);
	}

	// Styling with Outline color (e.g. high contrast theme)
	const outline = theme.getColor(activeContrastBorder);
	if (outline) {
		const outline = theme.getColor(activeContrastBorder);

		collector.addRule(`
			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item.checked .action-label,
			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label:hover {
				outline-color: ${outline};
				outline-width: 1px;
				outline-style: solid;
				border-bottom: none;
				padding-bottom: 0;
				outline-offset: 1px;
			}

			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:not(.checked) .action-label:hover {
				outline-style: dashed;
			}
		`);
	}
});
