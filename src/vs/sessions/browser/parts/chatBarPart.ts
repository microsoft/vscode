/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatBarPart.css';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_DRAG_AND_DROP_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER } from '../../../workbench/common/theme.js';
import { agentsPanelBackground, agentsPanelBorder, agentsPanelForeground, agentsBadgeBackground, agentsBadgeForeground } from '../../common/theme.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../workbench/common/views.js';
import { IExtensionService } from '../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { LayoutPriority } from '../../../base/browser/ui/splitview/splitview.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Part } from '../../../workbench/browser/part.js';
import { ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { IPaneCompositeBarOptions } from '../../../workbench/browser/parts/paneCompositeBar.js';
import { IMenuService } from '../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { Extensions } from '../../../workbench/browser/panecomposite.js';
import { Menus } from '../menus.js';
import { ActiveChatBarContext, ChatBarFocusContext } from '../../common/contextkeys.js';
import { ChatCompositeBar } from './chatCompositeBar.js';
import { prepend } from '../../../base/browser/dom.js';

export class ChatBarPart extends AbstractPaneCompositePart { // TODO: should not be a AbstractPaneCompositePart but instead a custom Part with a CompositeBar

	static readonly activeViewSettingsKey = 'workbench.chatbar.activepanelid';
	static readonly pinnedViewsKey = 'workbench.chatbar.pinnedPanels';
	static readonly placeholderViewContainersKey = 'workbench.chatbar.placeholderPanels';
	static readonly viewContainersWorkspaceStateKey = 'workbench.chatbar.viewContainersWorkspaceState';

	override readonly minimumWidth: number = 300;
	override readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	override readonly minimumHeight: number = 0;
	override readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	/** Visual margin values for the card-like appearance */
	static readonly MARGIN_TOP = 10;
	static readonly MARGIN_LEFT = 10;
	static readonly MARGIN_RIGHT = 10;
	static readonly MARGIN_BOTTOM = 0;

	/** Border width on the card (1px each side) */
	static readonly BORDER_WIDTH = 1;

	/** Height of the session composite bar when visible */
	private static readonly SESSION_BAR_HEIGHT = 35;

	private _sessionCompositeBar: ChatCompositeBar | undefined;

	private _lastLayout: { readonly width: number; readonly height: number; readonly top: number; readonly left: number } | undefined;

	get preferredHeight(): number | undefined {
		return this.layoutService.mainContainerDimension.height * 0.4;
	}

	readonly priority = LayoutPriority.High;

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
		@IMenuService menuService: IMenuService
	) {
		super(
			Parts.CHATBAR_PART,
			{
				hasTitle: false,
				trailingSeparator: true,
				borderWidth: () => 0,
			},
			ChatBarPart.activeViewSettingsKey,
			ActiveChatBarContext.bindTo(contextKeyService),
			ChatBarFocusContext.bindTo(contextKeyService),
			'chatbar',
			'chatbar',
			undefined,
			SIDE_BAR_TITLE_BORDER,
			ViewContainerLocation.ChatBar,
			Extensions.ChatBar,
			Menus.ChatBarTitle,
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
	}

	override create(parent: HTMLElement): void {
		super.create(parent);

		// Create the session composite bar and prepend it before the content area
		this._sessionCompositeBar = this._register(this.instantiationService.createInstance(ChatCompositeBar));
		prepend(parent, this._sessionCompositeBar.element);

		// Relayout when session bar visibility changes
		this._register(this._sessionCompositeBar.onDidChangeVisibility(() => {
			if (this._lastLayout) {
				this.layout(this._lastLayout.width, this._lastLayout.height, this._lastLayout.top, this._lastLayout.left);
			}
		}));
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		// Store background and border as CSS variables for the card styling on .part
		container.style.setProperty('--part-background', this.getColor(agentsPanelBackground) || '');
		container.style.setProperty('--part-border-color', this.getColor(agentsPanelBorder) || 'transparent');
		container.style.setProperty('--part-foreground', this.getColor(agentsPanelForeground) || '');
		container.style.backgroundColor = this.getColor(agentsPanelBackground) || '';
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.CHATBAR_PART)) {
			return;
		}

		this._lastLayout = { width, height, top, left };

		// Account for the session composite bar height when visible
		const sessionBarHeight = this._sessionCompositeBar?.visible ? ChatBarPart.SESSION_BAR_HEIGHT : 0;

		// Layout content with reduced dimensions to account for visual margins and border
		const borderTotal = ChatBarPart.BORDER_WIDTH * 2;
		const marginLeft = this.layoutService.isVisible(Parts.SIDEBAR_PART) ? 0 : ChatBarPart.MARGIN_LEFT;
		super.layout(
			width - marginLeft - ChatBarPart.MARGIN_RIGHT - borderTotal,
			height - ChatBarPart.MARGIN_TOP - ChatBarPart.MARGIN_BOTTOM - borderTotal - sessionBarHeight,
			top, left
		);

		// Restore the full grid-allocated dimensions so that Part.relayout() works correctly.
		Part.prototype.layout.call(this, width, height, top, left);
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'chatbar',
			pinnedViewContainersKey: ChatBarPart.pinnedViewsKey,
			placeholderViewContainersKey: ChatBarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: ChatBarPart.viewContainersWorkspaceStateKey,
			icon: false,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => HoverPosition.BELOW,
			},
			fillExtraContextMenuActions: () => { },
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 30,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(agentsPanelBackground),
				inactiveBackgroundColor: theme.getColor(agentsPanelBackground),
				activeBorderBottomColor: theme.getColor(PANEL_ACTIVE_TITLE_BORDER),
				activeForegroundColor: theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND),
				inactiveForegroundColor: theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND),
				badgeBackground: theme.getColor(agentsBadgeBackground),
				badgeForeground: theme.getColor(agentsBadgeForeground),
				dragAndDropBorder: theme.getColor(PANEL_DRAG_AND_DROP_BORDER)
			}),
			compact: true
		};
	}

	protected shouldShowCompositeBar(): boolean {
		return false;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		return CompositeBarPosition.TITLE;
	}

	override toJSON(): object {
		return {
			type: Parts.CHATBAR_PART
		};
	}
}
