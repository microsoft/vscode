/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/panelpart.css';
import { localize } from '../../../../nls.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActivePanelContext, PanelFocusContext } from '../../../common/contextkeys.js';
import { IWorkbenchLayoutService, Parts, Position } from '../../../services/layout/browser/layoutService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { TogglePanelAction } from './panelActions.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { PANEL_BACKGROUND, PANEL_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_DRAG_AND_DROP_BORDER } from '../../../common/theme.js';
import { contrastBorder, badgeBackground, badgeForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

export class PanelPart extends AbstractPaneCompositePart {

	//#region IView

	readonly minimumWidth: number = 300;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 77;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	get preferredHeight(): number | undefined {
		// Don't worry about titlebar or statusbar visibility
		// The difference is minimal and keeps this function clean
		return this.layoutService.mainContainerDimension.height * 0.4;
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

	static readonly activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@ICommandService private commandService: ICommandService,
		@IMenuService menuService: IMenuService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(
			Parts.PANEL_PART,
			{ hasTitle: true },
			PanelPart.activePanelSettingsKey,
			ActivePanelContext.bindTo(contextKeyService),
			PanelFocusContext.bindTo(contextKeyService),
			'panel',
			'panel',
			undefined,
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			hoverService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			menuService,
		);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.panel.showLabel')) {
				this.updateCompositeBar(true);
			}
		}));
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		container.style.backgroundColor = this.getColor(PANEL_BACKGROUND) || '';
		const borderColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
		container.style.borderLeftColor = borderColor;
		container.style.borderRightColor = borderColor;
		container.style.borderBottomColor = borderColor;

		const title = this.getTitleArea();
		if (title) {
			title.style.borderTopColor = this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || '';
		}
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'panel',
			pinnedViewContainersKey: 'workbench.panel.pinnedPanels',
			placeholderViewContainersKey: 'workbench.panel.placeholderPanels',
			viewContainersWorkspaceStateKey: 'workbench.panel.viewContainersWorkspaceState',
			icon: !this.configurationService.getValue('workbench.panel.showLabel'),
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => this.layoutService.getPanelPosition() === Position.BOTTOM && !this.layoutService.isPanelMaximized() ? HoverPosition.ABOVE : HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 44,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
				inactiveBackgroundColor: theme.getColor(PANEL_BACKGROUND), // Background color for overflow action
				activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
				activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
				inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
				badgeBackground: theme.getColor(badgeBackground),
				badgeForeground: theme.getColor(badgeForeground),
				dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
			})
		};
	}

	private fillExtraContextMenuActions(actions: IAction[]): void {
		const panelPositionMenu = this.menuService.getMenuActions(MenuId.PanelPositionMenu, this.contextKeyService, { shouldForwardArgs: true });
		const panelAlignMenu = this.menuService.getMenuActions(MenuId.PanelAlignmentMenu, this.contextKeyService, { shouldForwardArgs: true });
		const positionActions: IAction[] = [];
		const alignActions: IAction[] = [];
		createAndFillInContextMenuActions(panelPositionMenu, { primary: [], secondary: positionActions });
		createAndFillInContextMenuActions(panelAlignMenu, { primary: [], secondary: alignActions });

		actions.push(...[
			new Separator(),
			new SubmenuAction('workbench.action.panel.position', localize('panel position', "Panel Position"), positionActions),
			new SubmenuAction('workbench.action.panel.align', localize('align panel', "Align Panel"), alignActions),
			toAction({ id: TogglePanelAction.ID, label: localize('hidePanel', "Hide Panel"), run: () => this.commandService.executeCommand(TogglePanelAction.ID) })
		]);
	}

	override layout(width: number, height: number, top: number, left: number): void {
		let dimensions: Dimension;
		switch (this.layoutService.getPanelPosition()) {
			case Position.RIGHT:
				dimensions = new Dimension(width - 1, height); // Take into account the 1px border when layouting
				break;
			case Position.TOP:
				dimensions = new Dimension(width, height - 1); // Take into account the 1px border when layouting
				break;
			default:
				dimensions = new Dimension(width, height);
				break;
		}

		// Layout contents
		super.layout(dimensions.width, dimensions.height, top, left);
	}

	protected override shouldShowCompositeBar(): boolean {
		return true;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		return CompositeBarPosition.TITLE;
	}

	toJSON(): object {
		return {
			type: Parts.PANEL_PART
		};
	}
}
