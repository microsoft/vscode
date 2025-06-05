/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customPanelPart.css';
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position as SideBarPosition } from '../../../services/layout/browser/layoutService.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { AnchorAlignment } from '../../../../base/browser/ui/contextview/contextview.js';
import { LayoutPriority } from '../../../../base/browser/ui/grid/grid.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, SIDE_BAR_DRAG_AND_DROP_BACKGROUND } from '../../../common/theme.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { $, append, trackFocus } from '../../../../base/browser/dom.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ScrollableBarFocusContext, ScrollableBarViewletContext } from '../../../common/contextkeys.js';
import { IPartOptions } from '../../part.js';



interface IScrollablePanelPartConfiguration {
	position: ActivityBarPosition;

	canShowLabels: boolean;
	showLabels: boolean;
}

export class ScrollablePanelPart extends AbstractPaneCompositePart {

	static readonly activeViewletSettingsKey = 'workbench.parts.scrollViewletid';

	//#region IView

	readonly minimumWidth: number = 170;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	override get snap(): boolean { return true; }
	private content: HTMLElement | undefined;

	protected readonly container = $('.content');
	readonly priority: LayoutPriority = LayoutPriority.Low;
	// @ts-ignore
	private configuration: IScrollablePanelPartConfiguration;

	//#endregion

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
		@IMenuService menuService: IMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		// Define required parameters for super call
		const partId = Parts.SCROLLABLE_PANEL_PART;
		const partOptions: IPartOptions = {
			hasTitle: true,
			borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0,
		};

		super(
			partId,
			partOptions,
			ScrollablePanelPart.activeViewletSettingsKey,
			ScrollableBarViewletContext.bindTo(contextKeyService),
			ScrollableBarFocusContext.bindTo(contextKeyService),
			'scrollablePanel',
			'scrollablePanel',
			undefined,
			'#efefef',
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
			menuService
		);

		this.configuration = this.resolveConfiguration();

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
				this.configuration = this.resolveConfiguration();
			}
		}));
	}

	override create(parent: HTMLElement): void {
		this.element = parent;
		this.element.classList.add('pane-composite-part');

		// Create title area
		this.createTitleArea(parent);

		// Create content area
		const contentArea = this.createContentArea(parent);
		if (contentArea) {
			parent.appendChild(contentArea);
		}

		// Track focus
		const focusTracker = this._register(trackFocus(parent));
		this._register(focusTracker.onDidFocus(() => this.contextKeyService.getContextKeyValue('scrollableBarFocus') === true));
		this._register(focusTracker.onDidBlur(() => this.contextKeyService.getContextKeyValue('scrollableBarFocus') === false));
	}

	private resolveConfiguration(): IScrollablePanelPartConfiguration {
		const position = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		const canShowLabels = position !== ActivityBarPosition.TOP;
		const showLabels = canShowLabels && this.configurationService.getValue('workbench.scrollablePanel.showLabels') !== false;
		return { position, canShowLabels, showLabels };
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());

		const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
		const isPositionLeft = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : '';
		container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : '';
		container.style.borderRightColor = isPositionLeft ? borderColor || '' : '';
		container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : '';
		container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : '';
		container.style.borderLeftColor = !isPositionLeft ? borderColor || '' : '';
		container.style.outlineColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? '';
	}

	override layout(width: number, height: number): void {
		super.layout(width, height, 0, 200);
	}

	protected override getTitleAreaDropDownAnchorAlignment(): AnchorAlignment {
		return AnchorAlignment.RIGHT;
	}

	protected override createHeaderArea() {
		const headerArea = super.createHeaderArea();
		const globalHeaderContainer = $('.auxiliary-bar-global-header');
		headerArea.appendChild(globalHeaderContainer);
		return headerArea;
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.content = append(this.element, $('.content'));

		// Remove any existing view container
		const existingViewContainer = this.element.querySelector('.view-container');
		if (existingViewContainer) {
			existingViewContainer.remove();
		}

		// Add content container
		const contentContainer = append(this.content, $('.content-container'));

		// Add lorem ipsum text
		const loremText = append(contentContainer, $('.lorem-text'));
		loremText.textContent = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.

Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.

Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.

Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur? Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae consequatur, vel illum qui dolorem eum fugiat quo voluptas nulla pariatur?`;

		// Add styling
		this.content.style.overflow = 'auto';
		this.content.style.height = '100%';
		this.content.style.color = '#fff';
		this.content.style.width = '100%';
		this.content.style.padding = '20px';
		this.content.style.boxSizing = 'border-box';
		this.content.style.position = 'absolute';
		this.content.style.top = '0';
		this.content.style.left = '0';
		this.content.style.right = '0';
		this.content.style.bottom = '0';

		contentContainer.style.display = 'flex';
		contentContainer.style.flexDirection = 'column';
		contentContainer.style.gap = '20px';

		loremText.style.fontSize = '14px';
		loremText.style.lineHeight = '1.6';
		loremText.style.color = '#fff';
		loremText.style.whiteSpace = 'pre-wrap';
		loremText.style.wordBreak = 'break-word';

		return this.content;
	}

	show(focus?: boolean): void {
		if (!this.content) {
			return;
		}

		// Remove any existing view container
		const existingViewContainer = this.element.querySelector('.view-container');
		if (existingViewContainer) {
			existingViewContainer.remove();
		}

		// Ensure content is visible
		this.content.style.display = 'block';
		this.content.style.visibility = 'visible';

		if (focus) {
			this.focus();
		}
	}

	focus(): void {
		// No composite bar to focus
	}

	protected shouldShowCompositeBar(): boolean {
		return false; // Never show composite bar
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'scrollablePanel',
			pinnedViewContainersKey: '',
			placeholderViewContainersKey: '',
			viewContainersWorkspaceStateKey: '',
			icon: false,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: {
				position: () => HoverPosition.BELOW
			},
			fillExtraContextMenuActions: () => { /* No extra actions */ },
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 30,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				activeBorderBottomColor: theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER),
				activeForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND),
				inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND),
				badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
				badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
				dragAndDropBorder: theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER)
			}),
			compact: true
		};
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		return CompositeBarPosition.TITLE;
	}

	toJSON(): object {
		return {
			type: Parts.SCROLLABLE_PANEL_PART
		};
	}
}
