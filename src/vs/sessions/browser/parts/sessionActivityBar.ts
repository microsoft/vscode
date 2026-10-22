/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionActivityBar.css';
import { $, addDisposableListener, AnimationFrameScheduler, append, EventHelper, EventLike, EventType, getWindow } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { GlobalPointerMoveMonitor } from '../../../base/browser/globalPointerMoveMonitor.js';
import { ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment } from '../../../base/browser/ui/contextview/contextview.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { Codicon } from '../../../base/common/codicons.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { clamp } from '../../../base/common/numbers.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent, observableValue, transaction } from '../../../base/common/observable.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IBadge, NumberBadge } from '../../../workbench/services/activity/common/activity.js';
import { ISessionActivityBarActivityService } from '../../services/activity/common/sessionActivityBarActivityService.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { Menus } from '../menus.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../workbench.js';
import { AGENTS_CONTENT_HORIZONTAL_PADDING } from '../../common/layoutConstants.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../common/sessionConfig.js';
import { isPhoneLayout } from './mobile/mobileLayout.js';
import { SubmenuFlyout } from './submenuFlyout.js';

/**
 * A vertical activity bar of icon-only actions that open session tabs and toggle the panel and side panel, docked by {@link ChatViewSessionActivityBar}.
 * Each entry opens or activates its side pane tab, revealing the side pane
 * through the regular reveal-on-open path when it is closed. Users can turn the
 * strip off with the `sessions.showSessionActivityBar` setting.
 */
export class SessionActivityBar extends Disposable {

	readonly element: HTMLElement;

	private readonly _visible = observableValue(this, false);
	/** Whether the strip is enabled and has entries. */
	readonly visible: IObservable<boolean> = this._visible;

	private readonly _itemCount = observableValue(this, 0);
	/** The number of entries, which determines the strip's height. */
	readonly itemCount: IObservable<number> = this._itemCount;

	constructor(
		container: HTMLElement,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.element = append(container, $('.session-activity-bar'));

		const hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'element', undefined, { position: { hoverPosition: HoverPosition.LEFT } }));
		const toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this.element, Menus.SessionActivityBar, {
			orientation: ActionsOrientation.VERTICAL,
			ariaLabel: localize('sessionActivityBar', "Session Activity Bar"),
			telemetrySource: 'sessionActivityBar',
			hoverDelegate,
			// Entries hidden from the context menu leave the strip; a vertical strip has no overflow menu.
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
			contextMenu: Menus.SessionActivityBarContext,
			menuOptions: { shouldForwardArgs: true },
			// Every group shows in the strip: the side panel toggle and tab entries, then the terminal and panel toggle.
			toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
			actionViewItemProvider: (action, options) => {
				if (action instanceof SubmenuItemAction) {
					return instantiationService.createInstance(SessionActivityBarSubmenuViewItem, action, { ...options, icon: true, label: false });
				}
				if (action instanceof MenuItemAction) {
					return instantiationService.createInstance(SessionActivityBarActionViewItem, action, options);
				}
				return undefined;
			},
		}));

		const update = () => {
			const itemCount = toolbar.getItemsLength();
			const visible = !!this.configurationService.getValue<boolean>(SESSION_ACTIVITY_BAR_SETTING) && itemCount > 0;
			this.element.classList.toggle('hidden', !visible);
			transaction(tx => {
				this._itemCount.set(itemCount, tx);
				this._visible.set(visible, tx);
			});
		};
		update();
		this._register(toolbar.onDidChangeMenuItems(update));
		// Entries show the toolbar's own context menu, which appends these actions; this covers the rest of the strip.
		this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, (e: MouseEvent) => {
			EventHelper.stop(e, true);
			contextMenuService.showContextMenu({
				getAnchor: () => new StandardMouseEvent(getWindow(this.element), e),
				menuId: Menus.SessionActivityBarContext,
				contextKeyService,
			});
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(SESSION_ACTIVITY_BAR_SETTING)) {
				update();
			}
		}));
	}
}

/** Default distance from the top of the chat area to the strip. */
const DEFAULT_TOP_OFFSET = 4;

/** Keeps the strip's bottom level with the chat input's: the composer's 22px footer controls, 4px gap, and 4px bottom padding. */
const BOTTOM_CLEARANCE = 30;

/** Width the strip occupies at the chat's right edge: the 30px strip (24px buttons, 2px padding, 1px border) and its 12px scrollbar clearance in `sessionActivityBar.css`. */
const COLUMN_WIDTH = 42;

/** Minimum space between the chat content and the strip. */
const CONTENT_GAP = 12;

/** Where the strip sits: a distance from the top or bottom of the chat area, whichever it was dragged nearer. */
interface IActivityBarPosition {
	readonly edge: 'top' | 'bottom';
	readonly distance: number;
}

const DEFAULT_POSITION: IActivityBarPosition = { edge: 'top', distance: DEFAULT_TOP_OFFSET };

/**
 * Docks the {@link SessionActivityBar} strip at the right edge of a chat area in the
 * desktop layout. Hosts inset the chat's content by {@link reservedWidth} on each side so
 * the strip never covers it, call {@link setActive} so that only the active chat
 * view shows it, and call {@link layout} with the area's top offset and height.
 * Users can drag the strip up and down by its grip within that area;
 * double-clicking the grip restores the default position. Each host keeps its own
 * position.
 */
export class ChatViewSessionActivityBar extends Disposable {

	/**
	 * The inset kept on each side of the chat's content, beyond its own content padding, so the content stays
	 * {@link CONTENT_GAP} clear of the strip and evenly spaced on both sides.
	 */
	static readonly RESERVED_WIDTH = COLUMN_WIDTH + CONTENT_GAP - AGENTS_CONTENT_HORIZONTAL_PADDING;

	static readonly SCROLL_DOWN_BUTTON_GAP = 8;

	/**
	 * The width hosts keep free at the right of the chat for the strip. Reserved in every
	 * chat view while the strip is enabled, not only the active one, so focusing another
	 * chat does not shift its content.
	 */
	readonly reservedWidth: IObservable<number>;

	private readonly activityBar: SessionActivityBar | undefined;
	private position = DEFAULT_POSITION;
	private area = { top: 0, height: 0 };
	private active = false;
	/** The measured height of the strip, cached so layout passes do not force a reflow. */
	private height: number | undefined;
	private scrollDownButton: HTMLElement | undefined;
	private scrollDownButtonOffset = { x: 0, y: 0 };
	private scrollDownButtonScheduler: AnimationFrameScheduler | undefined;
	private readonly scrollDownButtonObserver = this._register(new MutableDisposable<IDisposable>());

	/** The strip, or `undefined` outside the desktop layout. */
	get element(): HTMLElement | undefined {
		return this.activityBar?.element;
	}

	constructor(
		container: HTMLElement,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		if (layoutService.agentWorkbenchLayout !== AgentWorkbenchLayout.Desktop) {
			this.reservedWidth = constObservable(0);
			return;
		}

		container.classList.add('session-activity-bar-host');
		// Lets chat surfaces that sit beside the strip, such as the ruler prompt timeline, clear it.
		container.style.setProperty('--session-activity-bar-column-width', `${COLUMN_WIDTH}px`);
		const activityBar = this.activityBar = this._register(instantiationService.createInstance(SessionActivityBar, container));
		activityBar.element.classList.add('docked', 'inactive');

		const dragHandle = $('.session-activity-bar-drag-handle');
		// A pointer-only affordance; the strip's entries carry its accessible semantics.
		dragHandle.setAttribute('aria-hidden', 'true');
		append(dragHandle, $('span.session-activity-bar-drag-handle-icon')).classList.add(...ThemeIcon.asClassNameArray(Codicon.gripper));
		activityBar.element.prepend(dragHandle);
		this._register(this.registerDragListeners(dragHandle));

		const phoneLayout = observableFromEvent(this, layoutService.onDidLayoutMainContainer, () => isPhoneLayout(layoutService));
		this.reservedWidth = derived(this, reader => activityBar.visible.read(reader) && !phoneLayout.read(reader) ? ChatViewSessionActivityBar.RESERVED_WIDTH : 0);

		this._register(autorun(reader => {
			activityBar.itemCount.read(reader);
			activityBar.visible.read(reader);
			this.height = undefined;
			this.applyPosition();
		}));
	}

	setScrollDownButton(button: HTMLElement | undefined): void {
		if (this.scrollDownButton === button) {
			return;
		}
		this.scrollDownButtonObserver.clear();
		this.scrollDownButtonScheduler = undefined;
		this.scrollDownButton = button;
		this.scrollDownButtonOffset = { x: 0, y: 0 };
		if (!button) {
			return;
		}

		const targetWindow = getWindow(button);
		const store = new DisposableStore();
		this.scrollDownButtonObserver.value = store;
		const scheduler = this.scrollDownButtonScheduler = store.add(new AnimationFrameScheduler(button, () => this.updateScrollDownButtonPosition()));
		const resizeObserver = new targetWindow.ResizeObserver(() => scheduler.schedule());
		const mutationObserver = new targetWindow.MutationObserver(() => scheduler.schedule());
		store.add(toDisposable(() => {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
			button.style.removeProperty('translate');
		}));
		resizeObserver.observe(button);
		if (button.parentElement) {
			resizeObserver.observe(button.parentElement);
			if (button.parentElement.parentElement) {
				mutationObserver.observe(button.parentElement.parentElement, { attributes: true, attributeFilter: ['style', 'class'] });
			}
		}
		scheduler.schedule();
	}

	setActive(active: boolean): void {
		if (this.active === active) {
			return;
		}
		this.active = active;
		this.element?.classList.toggle('inactive', !active);
		this.applyPosition();
	}

	/** Positions the strip within the chat area at `top` with the given `height` in the host. */
	layout(top: number, height: number): void {
		this.area = { top, height };
		this.applyPosition();
	}

	private getHeight(): number {
		if (this.height === undefined) {
			const height = this.element?.offsetHeight ?? 0;
			// A hidden strip measures 0; measure again once it is shown.
			if (height === 0) {
				return 0;
			}
			this.height = height;
		}
		return this.height;
	}

	/** The largest offset from the top of the chat area that keeps the strip inside it. */
	private getMaximumOffset(): number {
		return Math.max(0, this.area.height - this.getHeight() - BOTTOM_CLEARANCE);
	}

	private getOffset(): number {
		const maximum = this.getMaximumOffset();
		const offset = this.position.edge === 'top' ? this.position.distance : maximum - this.position.distance;
		return Math.round(Math.max(0, Math.min(offset, maximum)));
	}

	private applyPosition(): void {
		if (this.element?.isConnected && this.active && this.activityBar?.visible.get()) {
			this.element.style.top = `${this.area.top + this.getOffset()}px`;
		}
		this.scrollDownButtonScheduler?.schedule();
	}

	private updateScrollDownButtonPosition(): void {
		const button = this.scrollDownButton;
		if (!button?.parentElement) {
			return;
		}
		if (!button.isConnected || !this.active || !this.activityBar?.visible.get() || this.reservedWidth.get() === 0 || button.style.display === 'none') {
			this.scrollDownButtonOffset = { x: 0, y: 0 };
			button.style.removeProperty('translate');
			return;
		}
		const buttonBounds = button.getBoundingClientRect();
		const viewportBounds = button.parentElement.getBoundingClientRect();
		const barBounds = this.element?.getBoundingClientRect();
		const originalLeft = buttonBounds.left - this.scrollDownButtonOffset.x;
		const originalTop = buttonBounds.top - this.scrollDownButtonOffset.y;
		let left = originalLeft;
		let top = clamp(originalTop, viewportBounds.top, Math.max(viewportBounds.top, viewportBounds.bottom - buttonBounds.height));
		const gap = ChatViewSessionActivityBar.SCROLL_DOWN_BUTTON_GAP;
		const overlaps = this.active && barBounds && barBounds.height > 0 && buttonBounds.height > 0
			&& left < barBounds.right && left + buttonBounds.width > barBounds.left
			&& top < barBounds.bottom + gap && top + buttonBounds.height > barBounds.top - gap;
		if (overlaps) {
			const above = barBounds.top - gap - buttonBounds.height;
			const below = barBounds.bottom + gap;
			if (above >= viewportBounds.top) {
				top = above;
			} else if (below + buttonBounds.height <= viewportBounds.bottom) {
				top = below;
			} else {
				left = Math.max(viewportBounds.left, barBounds.left - gap - buttonBounds.width);
			}
		}
		const x = left - originalLeft;
		const y = buttonBounds.height > 0 ? top - originalTop : 0;
		if (x !== this.scrollDownButtonOffset.x || y !== this.scrollDownButtonOffset.y) {
			this.scrollDownButtonOffset = { x, y };
			button.style.translate = x !== 0 || y !== 0 ? `${x}px ${y}px` : '';
		}
	}

	private registerDragListeners(dragHandle: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const monitor = store.add(new GlobalPointerMoveMonitor());
		store.add(this.hoverService.setupDelayedHover(dragHandle, {
			content: localize('sessionActivityBar.dragHandle', "Drag to move. Double-click to reset the position."),
			position: { hoverPosition: HoverPosition.LEFT },
		}));
		store.add(addDisposableListener(dragHandle, EventType.DBLCLICK, () => {
			this.position = DEFAULT_POSITION;
			this.applyPosition();
		}));
		store.add(addDisposableListener(dragHandle, EventType.POINTER_DOWN, (e: PointerEvent) => {
			if (e.button !== 0) {
				return;
			}
			EventHelper.stop(e, true);
			// Measure afresh so the drag uses the strip's current height.
			this.height = undefined;
			const origin = { y: e.clientY, offset: this.getOffset() };
			dragHandle.classList.add('dragging');
			monitor.startMonitoring(dragHandle, e.pointerId, e.buttons, e => {
				this.position = { edge: 'top', distance: origin.offset + e.clientY - origin.y };
				this.applyPosition();
			}, () => {
				dragHandle.classList.remove('dragging');
				// Anchor to the nearer edge, so a strip parked by the input stays there as the area grows.
				const offset = this.getOffset();
				const maximum = this.getMaximumOffset();
				this.position = offset > maximum / 2 ? { edge: 'bottom', distance: maximum - offset } : { edge: 'top', distance: offset };
			});
		}));
		return store;
	}
}

/**
 * An entry of the strip that shows the activity reported for its command through
 * {@link ISessionActivityBarActivityService}, using the most recent activity: a count
 * for a number badge, and a dot for other badges since the strip's entries are too
 * small to carry an icon. The badge description is appended to the entry's hover and
 * accessible label.
 * Contributions that customize an entry with `IActionViewItemService` can extend
 * this to keep its activity.
 */
export class SessionActivityBarActionViewItem extends MenuEntryActionViewItem {

	private badgeElement: HTMLElement | undefined;

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ISessionActivityBarActivityService private readonly activityService: ISessionActivityBarActivityService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);

		this._register(activityService.onDidChangeActivity(commandId => {
			if (commandId === this._menuItemAction.id) {
				this.updateActivity();
			}
		}));
		this._register(themeService.onDidColorThemeChange(() => this.updateActivity()));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		// The entry's label and tooltip announce the activity.
		this.badgeElement = append(container, $('.session-activity-bar-badge', { 'aria-hidden': 'true' }));
		this.updateActivity();
	}

	/** The badge of the most recent activity reported for the entry's command, which the entry shows. */
	protected getBadge(): IBadge | undefined {
		return this.activityService.getActivity(this._menuItemAction.id).at(-1)?.badge;
	}

	protected override getTooltip(): string {
		const title = super.getTooltip();
		const description = this.getBadge()?.getDescription();
		return description ? localize('sessionActivityBar.titleWithActivity', "{0} - {1}", title, description) : title;
	}

	private updateActivity(): void {
		const badgeElement = this.badgeElement;
		if (!badgeElement) {
			return;
		}

		const badge = this.getBadge();
		const count = badge instanceof NumberBadge ? badge.number : 0;
		badgeElement.classList.toggle('visible', !!badge && (!(badge instanceof NumberBadge) || count > 0));
		badgeElement.classList.toggle('count', count > 0);
		badgeElement.textContent = count > 99 ? '99+' : count > 0 ? `${count}` : '';

		const colors = badge?.getColors(this._themeService.getColorTheme());
		badgeElement.style.backgroundColor = colors?.badgeBackground?.toString() ?? '';
		badgeElement.style.color = colors?.badgeForeground?.toString() ?? '';
		badgeElement.style.borderColor = colors?.badgeBorder?.toString() ?? '';

		this.updateTooltip();
	}
}

/** An icon-only entry that opens its submenu beside the strip, to the left since the strip sits at the right edge. */
class SessionActivityBarSubmenuViewItem extends ActionViewItem {

	private submenuFlyout: SubmenuFlyout | undefined;

	constructor(
		private readonly submenuAction: SubmenuItemAction,
		options: IActionViewItemOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, submenuAction, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (!this.label) {
			return;
		}
		this.submenuFlyout = this._register(this.instantiationService.createInstance(SubmenuFlyout, {
			anchor: this.label,
			getActions: () => this.submenuAction.actions,
			getActionRunner: () => this.actionRunner,
			lookupKeybinding: commandId => this.keybindingService.lookupKeybinding(commandId),
			openKeys: [KeyCode.Enter, KeyCode.Space, KeyCode.LeftArrow],
			closeKeys: [KeyCode.RightArrow],
			// Opens toward the chat, matching the arrow keys, even when there is room to the right.
			anchorAlignment: AnchorAlignment.RIGHT,
		}));
	}

	override onClick(event: EventLike): void {
		if (this.submenuFlyout) {
			EventHelper.stop(event, true);
			this.submenuFlyout.show(true);
			return;
		}
		super.onClick(event);
	}

	protected override getClass(): string | undefined {
		const icon = this.submenuAction.item.icon;
		return ThemeIcon.isThemeIcon(icon) ? ThemeIcon.asClassName(icon) : super.getClass();
	}
}
