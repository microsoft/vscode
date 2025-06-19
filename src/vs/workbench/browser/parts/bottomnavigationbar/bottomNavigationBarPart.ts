/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/bottomnavigationbarpart'; // Ensure CSS is imported
import { Part } from 'vs/workbench/browser/part';
import { IThemeService, IColorTheme } from 'vs/platform/theme/common/themeService';
import { IStorageService } from 'vs/platform/storage/common/storage.js';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { Dimension, $, addDisposableListener, EventType, toggleClass } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Action } from 'vs/base/common/actions';
import { ActionBar, ActionsOrientation, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IsWebContext } from 'vs/workbench/common/contextkeys';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { BOTTOM_NAVIGATION_BAR_BACKGROUND, BOTTOM_NAVIGATION_BAR_FOREGROUND, BOTTOM_NAVIGATION_BAR_BORDER, BOTTOM_NAVIGATION_BAR_ACTIVE_ITEM_FOREGROUND, BOTTOM_NAVIGATION_BAR_INACTIVE_ITEM_FOREGROUND, BOTTOM_NAVIGATION_BAR_ITEM_HOVER_BACKGROUND } from 'vs/workbench/common/theme';
import { localize } from 'vs/nls';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation, IViewDescriptorService } from 'vs/workbench/common/views';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';


export class BottomNavigationBarPart extends Part {

	static readonly ID = Parts.BOTTOM_NAVIGATION_BAR_PART;
	static readonly HEIGHT = 56;

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = BottomNavigationBarPart.HEIGHT;
	readonly maximumHeight: number = BottomNavigationBarPart.HEIGHT;

	private actionBar: ActionBar | undefined;
	private actions: NavigationAction[] = [];
	private actionBarContainer: HTMLElement | undefined;
	private actionViewItems: NavigationActionViewItem[] = [];

	private readonly isMobileContextKey: IContextKey<boolean>;
	private readonly partDisposables = this._register(new DisposableStore());


	constructor(
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(Parts.BOTTOM_NAVIGATION_BAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
		this.isMobileContextKey = IsWebContext.bindTo(this.contextKeyService); // TODO: Replace with a proper mobile context key
		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([IsWebContext]))) {
				this.handleVisibilityChange();
			}
		}));
		this.createActions();
	}

	private createActions(): void {
		this.actions = [
			this.instantiationService.createInstance(NavigationAction, 'workbench.action.explorer', localize('explorer', "Explorer"), Codicon.files.classNames, 'workbench.view.explorer', Parts.SIDEBAR_PART),
			this.instantiationService.createInstance(NavigationAction, 'workbench.action.search', localize('search', "Search"), Codicon.search.classNames, 'workbench.view.search', Parts.SIDEBAR_PART),
			this.instantiationService.createInstance(NavigationAction, 'workbench.action.scm', localize('scm', "Source Control"), Codicon.sourceControl.classNames, 'workbench.view.scm', Parts.SIDEBAR_PART),
			this.instantiationService.createInstance(NavigationAction, 'workbench.action.debug', localize('debug', "Run and Debug"), Codicon.debugAlt2.classNames, 'workbench.view.debug', Parts.SIDEBAR_PART),
			this.instantiationService.createInstance(NavigationAction, 'workbench.action.extensions', localize('extensions', "Extensions"), Codicon.extensions.classNames, 'workbench.view.extensions', Parts.SIDEBAR_PART)
		];
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.element.setAttribute('role', 'navigation');
		this.element.setAttribute('aria-label', localize('bottomNavigationBar', "Bottom Navigation Bar"));

		this.actionBarContainer = $('div.bottom-nav-actionbar-container');
		parent.appendChild(this.actionBarContainer);

		this.actionViewItems = [];
		const actionViewItemProvider = (action: Action): ActionViewItem | undefined => {
			if (action instanceof NavigationAction) {
				const item = this.instantiationService.createInstance(NavigationActionViewItem, action);
				this.actionViewItems.push(item);
				return item;
			}
			return undefined;
		};

		this.actionBar = this._register(new ActionBar(this.actionBarContainer, {
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('bottomNavigationBarActions', "Bottom Navigation Bar Actions"),
			actionViewItemProvider: actionViewItemProvider as IActionViewItemProvider,
			overflowAction: undefined,
			triggerKeys: { keyDown: false, tab: false }
		}));

		this.actionBar.push(this.actions, { icon: true, label: false });

		this.registerListeners();
		this.updateStyles();
		this.handleVisibilityChange();

		return parent;
	}

	private registerListeners(): void {
		this._register(this.themeService.onDidColorThemeChange(() => this.updateStyles()));

		this._register(addDisposableListener(this.element, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			let eventHandled = true;
			if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
				this.actionBar?.focusPrevious();
			} else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
				this.actionBar?.focusNext();
			} else if (event.equals(KeyCode.Home)) {
				this.actionBar?.focusFirst();
			} else if (event.equals(KeyCode.End)) {
				this.actionBar?.focusLast();
			} else {
				eventHandled = false;
			}
			if (eventHandled) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		this._register(this.paneCompositeService.onDidPaneCompositeOpen(e => this.updateActiveStates()));
		this._register(this.paneCompositeService.onDidPaneCompositeClose(e => this.updateActiveStates()));
	}

	private updateActiveStates(): void {
		this.actionViewItems.forEach(item => item.updateActiveState());
	}

	private updateStyles(): void {
		const theme = this.themeService.getColorTheme();
		if (this.element && this.actionBarContainer) {
			this.element.style.backgroundColor = theme.getColor(BOTTOM_NAVIGATION_BAR_BACKGROUND)?.toString() || '';
			this.element.style.color = theme.getColor(BOTTOM_NAVIGATION_BAR_FOREGROUND)?.toString() || '';
			const border = theme.getColor(BOTTOM_NAVIGATION_BAR_BORDER);
			if (border) {
				this.element.style.borderTop = `1px solid ${border.toString()}`;
			} else {
				this.element.style.borderTop = '';
			}
			this.actionViewItems.forEach(item => item.updateStyle());
		}
	}

	override layout(width: number, height: number): void {
		super.layout(width, height);
		if (this.actionBar && this.actionBarContainer) {
			this.actionBarContainer.style.width = `${width}px`;
			this.actionBar.layout(new Dimension(width, height));

			const showLabels = width > (this.actions.length * 80);
			toggleClass(this.element, 'show-labels', showLabels);
			this.actionViewItems.forEach(item => item.updateLabelVisibility(showLabels));
		}
	}

	private handleVisibilityChange(): void {
		const isMobile = !!this.isMobileContextKey.get();
		if (this.element) {
			this.element.style.display = isMobile ? '' : 'none';
		}
		// If the part becomes visible programmatically (not through direct setVisible by layout service),
		// we might need to inform layout service to update overall layout.
		if (isMobile && this.layoutService) {
			this.layoutService.layout();
		}
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		if (this.element) {
			this.element.style.display = visible ? '' : 'none';
		}
	}

	override dispose(): void {
		super.dispose();
	}
}

class NavigationAction extends Action {
	constructor(
		id: string,
		label: string,
		public iconClass: string,
		public viewContainerId: string,
		public targetPartToOpen: Parts,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(id, label, iconClass);
	}

	override async run(): Promise<void> {
		if (this.targetPartToOpen === Parts.SIDEBAR_PART) {
			const sidebarPart = this.layoutService.getPart(Parts.SIDEBAR_PART) as SidebarPart; // Cast to SidebarPart
			if (sidebarPart && typeof sidebarPart.toggleMobileDrawer === 'function' && sidebarPart.isMobileDrawerMode) {
				if (!sidebarPart.mobileDrawerOpen) { // Only open if closed
					sidebarPart.toggleMobileDrawer(true);
				}
			} else if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) { // Fallback for non-drawer sidebar
				this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
			}
		} else if (!this.layoutService.isVisible(this.targetPartToOpen)) {
			this.layoutService.setPartHidden(false, this.targetPartToOpen);
		}

		const location = this.targetPartToOpen === Parts.SIDEBAR_PART ? ViewContainerLocation.Sidebar : ViewContainerLocation.Panel;
		try {
			const paneComposite = await this.paneCompositeService.openPaneComposite(this.viewContainerId, location, true);
			if (!paneComposite) {
				console.warn(`Could not open pane composite for view container: ${this.viewContainerId} in location: ${location}`);
			}
		} catch (error) {
			console.error(`Error opening pane composite: ${this.viewContainerId}`, error);
		}
	}
}

class NavigationActionViewItem extends ActionViewItem {
	private _labelElement: HTMLElement | undefined;
	private _iconElement: HTMLElement | undefined;

	constructor(
		action: NavigationAction,
		@IThemeService private readonly themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
	) {
		super(null, action, { icon: true, label: false, hoverDelegate: hoverService.createHoverDelegate() });
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (this.element) {
			this.element.classList.add('bottom-nav-action-item');
			this._iconElement = this.label;

			this._labelElement = $('span.action-item-label');
			this._labelElement.textContent = this.action.label;
			this.element.appendChild(this._labelElement);
		}
		this.updateActiveState();
		this.updateStyle();
	}

	updateActiveState() {
		const navAction = this.action as NavigationAction;
		let isActive = false;
		const targetLocation = navAction.targetPartToOpen === Parts.SIDEBAR_PART ? ViewContainerLocation.Sidebar : ViewContainerLocation.Panel;
		const activePaneComposite = this.paneCompositeService.getActivePaneComposite(targetLocation);

		if (activePaneComposite && activePaneComposite.getId() === navAction.viewContainerId) {
			// Additionally, ensure the hosting part (sidebar/panel) is visible
			if (this.paneCompositeService.isPaneCompositeVisible(navAction.viewContainerId)) {
				isActive = true;
			}
		}

		if (this.element) {
			toggleClass(this.element, 'active', isActive);
		}
		this.updateStyle();
	}

	updateLabelVisibility(show: boolean): void {
		if (this._labelElement) {
			this._labelElement.style.display = show ? '' : 'none';
		}
		if (this._iconElement) {
			this._iconElement.style.marginBottom = show ? '0px' : '4px';
		}
	}

	protected override updateStyle(): void {
		super.updateStyle();
		if (this.element) {
			const isActive = this.element.classList.contains('active');
			const theme = this.themeService.getColorTheme();
			const itemColor = theme.getColor(isActive ? BOTTOM_NAVIGATION_BAR_ACTIVE_ITEM_FOREGROUND : BOTTOM_NAVIGATION_BAR_INACTIVE_ITEM_FOREGROUND);
			const hoverBackgroundColor = theme.getColor(BOTTOM_NAVIGATION_BAR_ITEM_HOVER_BACKGROUND);

			if (itemColor) {
				this.element.style.color = itemColor.toString();
			} else {
				this.element.style.removeProperty('color');
			}

			const iconContainer = this.element.querySelector<HTMLElement>('.action-label');
			if (iconContainer) {
				if (isActive && hoverBackgroundColor) {
					iconContainer.style.backgroundColor = hoverBackgroundColor.toString();
				} else {
					iconContainer.style.removeProperty('background-color');
				}
			}
		}
	}
}
