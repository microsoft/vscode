/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/activitybarpart';
import { localize } from 'vs/nls';
import { ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { Part } from 'vs/workbench/browser/part';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ToggleActivityBarVisibilityAction, ToggleSidebarPositionAction } from 'vs/workbench/browser/actions/layoutActions';
import { IThemeService, IColorTheme } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER } from 'vs/workbench/common/theme';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { addDisposableListener, EventType, isAncestor } from 'vs/base/browser/dom';
import { ICompositeBarColors, IActivityHoverOptions } from 'vs/workbench/browser/parts/compositeBarActions';
import { assertIsDefined } from 'vs/base/common/types';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getMenuBarVisibility } from 'vs/platform/window/common/window';
import { Separator, toAction } from 'vs/base/common/actions';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { GestureEvent } from 'vs/base/browser/touch';
import { IPaneCompositePart } from 'vs/workbench/browser/parts/paneCompositePart';
import { PaneCompositeBar } from 'vs/workbench/browser/parts/paneCompositeBar';
import { GlobalCompositeBar } from 'vs/workbench/browser/parts/globalCompositeBar';
import { IStorageService } from 'vs/platform/storage/common/storage';

export class ActivitybarPart extends Part {

	private static readonly ACTION_HEIGHT = 48;

	static readonly pinnedViewContainersKey = 'workbench.activity.pinnedViewlets2';
	static readonly placeholderViewContainersKey = 'workbench.activity.placeholderViewlets';

	//#region IView

	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 48;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;

	//#endregion

	private content: HTMLElement | undefined;

	private menuBar: CustomMenubarControl | undefined;
	private menuBarContainer: HTMLElement | undefined;

	private compositeBarContainer: HTMLElement | undefined;
	private readonly compositeBar: PaneCompositeBar;
	private readonly globalCompositeBar: GlobalCompositeBar;

	private readonly keyboardNavigationDisposables = this._register(new DisposableStore());

	constructor(
		private readonly paneCompositePart: IPaneCompositePart,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
		this.compositeBar = this.createCompositeBar();
		this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.compositeBar.getContextMenuActions(), (theme: IColorTheme) => this.getActivitybarItemColors(theme), this.getActivityHoverOptions()));
		this.registerListeners();
	}

	private createCompositeBar(): PaneCompositeBar {
		return this._register(this.instantiationService.createInstance(PaneCompositeBar, {
			partContainerClass: 'activitybar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			orientation: ActionsOrientation.VERTICAL,
			icon: true,
			activityHoverOptions: this.getActivityHoverOptions(),
			preventLoopNavigation: true,
			recomputeSizes: false,
			fillExtraContextMenuActions: (actions, e?: MouseEvent | GestureEvent) => {
				// Menu
				const menuBarVisibility = getMenuBarVisibility(this.configurationService);
				if (menuBarVisibility === 'compact' || menuBarVisibility === 'hidden' || menuBarVisibility === 'toggle') {
					actions.unshift(...[toAction({ id: 'toggleMenuVisibility', label: localize('menu', "Menu"), checked: menuBarVisibility === 'compact', run: () => this.configurationService.updateValue('window.menuBarVisibility', menuBarVisibility === 'compact' ? 'toggle' : 'compact') }), new Separator()]);
				}

				if (menuBarVisibility === 'compact' && this.menuBarContainer && e?.target) {
					if (isAncestor(e.target as Node, this.menuBarContainer)) {
						actions.unshift(...[toAction({ id: 'hideCompactMenu', label: localize('hideMenu', "Hide Menu"), run: () => this.configurationService.updateValue('window.menuBarVisibility', 'toggle') }), new Separator()]);
					}
				}

				// Global Composite Bar
				actions.push(new Separator());
				actions.push(...this.globalCompositeBar.getContextMenuActions());
				actions.push(new Separator());

				// Toggle Sidebar
				actions.push(toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction(accessor => new ToggleSidebarPositionAction().run(accessor)) }));

				// Toggle Activity Bar
				actions.push(toAction({ id: ToggleActivityBarVisibilityAction.ID, label: localize('hideActivitBar', "Hide Activity Bar"), run: () => this.instantiationService.invokeFunction(accessor => new ToggleActivityBarVisibilityAction().run(accessor)) }));
			},
			compositeSize: 52,
			colors: (theme: IColorTheme) => this.getActivitybarItemColors(theme),
			overflowActionSize: ActivitybarPart.ACTION_HEIGHT,
		}, Parts.ACTIVITYBAR_PART, this.paneCompositePart));
	}

	private getActivityHoverOptions(): IActivityHoverOptions {
		return {
			position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT,
		};
	}

	private registerListeners(): void {
		// Register for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('window.menuBarVisibility')) {
				if (getMenuBarVisibility(this.configurationService) === 'compact') {
					this.installMenubar();
				} else {
					this.uninstallMenubar();
				}
			}
		}));
	}

	showActivity(viewContainerOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable {
		const disposable = this.globalCompositeBar.showActivity(viewContainerOrActionId, badge, clazz, priority);
		if (disposable) {
			return disposable;
		}
		return this.compositeBar.showActivity(viewContainerOrActionId, badge, clazz, priority);
	}

	private uninstallMenubar() {
		if (this.menuBar) {
			this.menuBar.dispose();
			this.menuBar = undefined;
		}

		if (this.menuBarContainer) {
			this.menuBarContainer.remove();
			this.menuBarContainer = undefined;
			this.registerKeyboardNavigationListeners();
		}
	}

	private installMenubar() {
		if (this.menuBar) {
			return; // prevent menu bar from installing twice #110720
		}

		this.menuBarContainer = document.createElement('div');
		this.menuBarContainer.classList.add('menubar');

		const content = assertIsDefined(this.content);
		content.prepend(this.menuBarContainer);

		// Menubar: install a custom menu bar depending on configuration
		this.menuBar = this._register(this.instantiationService.createInstance(CustomMenubarControl));
		this.menuBar.create(this.menuBarContainer);

		this.registerKeyboardNavigationListeners();
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		this.content = document.createElement('div');
		this.content.classList.add('content');
		parent.appendChild(this.content);

		// Install menubar if compact
		if (getMenuBarVisibility(this.configurationService) === 'compact') {
			this.installMenubar();
		}

		// View Containers action bar
		this.compositeBarContainer = this.compositeBar.create(this.content);

		// Global action bar
		this.globalCompositeBar.create(this.content);

		// Keyboard Navigation
		this.registerKeyboardNavigationListeners();

		return this.content;
	}

	private registerKeyboardNavigationListeners(): void {
		this.keyboardNavigationDisposables.clear();

		// Up/Down arrow on compact menu
		if (this.menuBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.compositeBar?.focus();
				}
			}));
		}

		// Up/Down on Activity Icons
		if (this.compositeBarContainer) {
			this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, e => {
				const kbEvent = new StandardKeyboardEvent(e);
				if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
					this.globalCompositeBar.focus();
				} else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
					this.menuBar?.toggleFocus();
				}
			}));
		}

		// Up arrow on global icons
		this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, e => {
			const kbEvent = new StandardKeyboardEvent(e);
			if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
				this.compositeBar?.focus(this.getVisiblePaneCompositeIds().length - 1);
			}
		}));
	}

	getPinnedPaneCompositeIds(): string[] {
		return this.compositeBar.getPinnedPaneCompositeIds();
	}

	getVisiblePaneCompositeIds(): string[] {
		return this.compositeBar.getVisiblePaneCompositeIds();
	}

	focus(): void {
		this.compositeBar.focus();
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertIsDefined(this.getContainer());
		const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || '';
		container.style.backgroundColor = background;

		const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || '';
		container.classList.toggle('bordered', !!borderColor);
		container.style.borderColor = borderColor ? borderColor : '';
	}

	private getActivitybarItemColors(theme: IColorTheme): ICompositeBarColors {
		return {
			activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
			inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
			activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
			activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
			badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
			badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
			dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
			activeBackgroundColor: undefined, inactiveBackgroundColor: undefined, activeBorderBottomColor: undefined,
		};
	}

	override layout(width: number, height: number): void {
		if (!this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
			return;
		}

		// Layout contents
		const contentAreaSize = super.layoutContents(width, height).contentSize;

		// Layout composite bar
		let availableHeight = contentAreaSize.height;
		if (this.menuBarContainer) {
			availableHeight -= this.menuBarContainer.clientHeight;
		}
		availableHeight -= (this.globalCompositeBar.size() * ActivitybarPart.ACTION_HEIGHT); // adjust height for global actions showing
		this.compositeBar.layout(width, availableHeight);
	}

	toJSON(): object {
		return {
			type: Parts.ACTIVITYBAR_PART
		};
	}
}
