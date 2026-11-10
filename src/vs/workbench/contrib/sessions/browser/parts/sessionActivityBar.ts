/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionActivityBar.css';
import { $, addDisposableListener, append, EventHelper, EventLike, EventType, getActiveElement, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment } from '../../../../../base/browser/ui/contextview/contextview.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { IManagedHoverContent } from '../../../../../base/browser/ui/hover/hover.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { autorun, constObservable, derived, IObservable, IReader, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Action, IAction, toAction } from '../../../../../base/common/actions.js';
import { localize } from '../../../../../nls.js';
import { IMenuEntryActionViewItemOptions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { isIMenuItem, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TogglePanelAction } from '../../../../browser/parts/panel/panelActions.js';
import { ISessionActivityBarActivityService } from '../../common/sessionActivityBarActivityService.js';
import { MenuActivityBar, MenuActivityBarActionViewItem, MenuActivityBarSize } from '../../../../browser/parts/activitybar/menuActivityBar.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { Menus, SessionActivityBarGroup } from '../menus.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../../services/sessions/browser/sessionsHostLayoutService.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../common/sessionConfig.js';
import { TOGGLE_SIDE_PANEL_COMMAND_ID } from '../../common/sessionCommands.js';
import { sessionActivityBarChatActionContext } from '../../common/contextkeys.js';
import { LayoutModeContext } from '../../../../common/contextkeys.js';
import { IWindowCommandContext } from '../../../../common/windowCommandContext.js';
import { isPhoneLayout } from '../../../../browser/parts/sessions/mobileLayout.js';
import { findSessionActivityBarExternalHost, ISessionActivityBarExternalHost, observeSessionActivityBarSize, SESSION_ACTIVITY_BAR_COLUMN_WIDTH } from '../../../../browser/parts/sessions/sessionActivityBarHost.js';
import { SubmenuFlyout } from '../../../../browser/parts/sessions/submenuFlyout.js';

/**
 * A vertical activity bar of icon-only actions that open session tabs and toggle the panel and side panel, docked by {@link ChatViewSessionActivityBar}:
 * a {@link MenuActivityBar} of {@link Menus.SessionActivityBar} and the actions of its chat.
 * Each entry opens or activates its side pane tab, revealing the side pane
 * through the regular reveal-on-open path when it is closed. Users can turn the
 * strip off with the `sessions.showSessionActivityBar` setting.
 */
export class SessionActivityBar extends Disposable {

	readonly element: HTMLElement;

	/** Whether the strip is enabled and has entries. */
	readonly visible: IObservable<boolean>;

	/** Signals that the strip's entries changed, and so may its height. */
	readonly onDidChangeEntries: IObservable<void>;

	private readonly chatActions = observableValue<IObservable<readonly IAction[]> | undefined>(this, undefined);

	/** Whether the strip floats beside a chat, where it is always compact, rather than filling a column of its own. */
	private readonly floating = observableValue(this, true);

	constructor(
		container: HTMLElement,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionActivityBarActivityService activityService: ISessionActivityBarActivityService,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const chosenSize = observeSessionActivityBarSize(this, storageService, this._register(new DisposableStore()));
		const size = derived(this, reader => this.floating.read(reader) ? MenuActivityBarSize.Compact : chosenSize.read(reader));

		let actionsById = new Map<string, IAction>();
		const renderedChatActions = this._register(new DisposableMap<string, Action>());
		const enabled = observableFromEvent(this, configurationService.onDidChangeConfiguration, () => !!configurationService.getValue<boolean>(SESSION_ACTIVITY_BAR_SETTING));
		const activityBar = this._register(instantiationService.createInstance(MenuActivityBar, container, {
			menuId: Menus.SessionActivityBar,
			contextMenuId: Menus.SessionActivityBarContext,
			ariaLabel: localize('sessionActivityBar', "Session Activity Bar"),
			telemetrySource: 'sessionActivityBar',
			enabled,
			size,
			// The strip sits at the right edge.
			hoverPosition: HoverPosition.LEFT,
			// The entries act on the window the strip is in, which the window that has focus is not yet as a click activates it:
			// a chat window, or the main window, such as for an entry that would otherwise act on a chat window that has focus.
			// Read as an entry runs: the strip is created before it is in its window.
			getActionsContext: () => ({ windowId: getWindow(this.element).vscodeWindowId } satisfies IWindowCommandContext),
			activities: activityService,
			actionViewItemProvider: (action, options, scopedInstantiationService) => {
				const chatAction = renderedChatActions.get(action.id);
				if (chatAction) {
					return new ActionViewItem(undefined, chatAction, { ...options, icon: true, label: false });
				}
				if (action instanceof SubmenuItemAction) {
					return scopedInstantiationService.createInstance(SessionActivityBarSubmenuViewItem, action, { ...options, icon: true, label: false });
				}
				if (action instanceof MenuItemAction) {
					return scopedInstantiationService.createInstance(SessionActivityBarActionViewItem, action, options);
				}
				return undefined;
			},
		}));
		const scopedContextKeyService = activityBar.contextKeyService;
		this.element = activityBar.element;
		this.element.classList.add('session-activity-bar');
		this.visible = activityBar.visible;
		this.onDidChangeEntries = activityBar.onDidChangeEntries;

		const keys = new Map<string, IContextKey<boolean>>();
		this._register(autorun(reader => {
			const actions = enabled.read(reader) ? this.chatActions.read(reader)?.read(reader) ?? [] : [];
			actionsById = new Map(actions.map(action => [action.id, action]));
			const changed = actions.length !== renderedChatActions.size || actions.some(action => !renderedChatActions.has(action.id));
			for (const [id] of renderedChatActions) {
				if (!actionsById.has(id)) {
					renderedChatActions.deleteAndDispose(id);
				}
			}
			for (const action of actions) {
				let rendered = renderedChatActions.get(action.id);
				if (!rendered) {
					const id = action.id;
					rendered = new Action(id, action.label, action.class, action.enabled, context => actionsById.get(id)?.run(context));
					renderedChatActions.set(action.id, rendered);
				}
				rendered.label = action.label;
				rendered.class = action.class ?? '';
				rendered.enabled = action.enabled;
				rendered.tooltip = action.tooltip;
				rendered.checked = action.checked;
			}
			scopedContextKeyService.bufferChangeEvents(() => {
				for (const [id, key] of keys) {
					if (!actionsById.has(id)) {
						key.reset();
						keys.delete(id);
					}
				}
				for (const action of actions) {
					if (!keys.has(action.id)) {
						keys.set(action.id, sessionActivityBarChatActionContext(action.id).bindTo(scopedContextKeyService));
					}
				}
				for (const [id, key] of keys) {
					key.set(actionsById.has(id));
				}
			});
			if (changed) {
				activityBar.refresh();
			}
		}));
	}

	setChatActions(actions: IObservable<readonly IAction[]> | undefined): void {
		this.chatActions.set(actions, undefined);
	}

	/** Sets whether the strip floats beside a chat, or fills a column of its own at the size chosen for it. */
	setFloating(floating: boolean): void {
		this.element.classList.toggle('floating', floating);
		this.floating.set(floating, undefined);
	}
}

/** Distance from the top of the chat area to the strip. In a host outside the chat, its top is level with the top of the host, and so of the cards beside it. */
const TOP_OFFSET = 4;

/** Shows or hides the editor parts of a window with layout modes: `workbench.action.chatWindow.toggleEditor` of the chat window feature. */
const TOGGLE_WINDOW_EDITOR_COMMAND_ID = 'workbench.action.chatWindow.toggleEditor';

/** How many frames the active strip of a chat that is not attached yet looks for its host; see `probeExternalHost`. */
const MAX_PROBE_RETRIES = 3;

/** Keeps a floating strip's bottom level with the chat input's: the composer's 22px footer controls, 4px gap, and 4px bottom padding. */
const BOTTOM_CLEARANCE = 30;

/** Where a floating strip sits: a distance from the top or bottom of the chat area, whichever it was dragged nearer. */
interface IFloatingPosition {
	readonly edge: 'top' | 'bottom';
	readonly distance: number;
}

const DEFAULT_FLOATING_POSITION: IFloatingPosition = { edge: 'top', distance: TOP_OFFSET };

/** Whether the strip of an active chat shows in `host`, which then keeps the column for it. */
function isHosting(host: ISessionActivityBarExternalHost | undefined, reader: IReader): boolean {
	return !!host && host.active.read(reader) && (host.enabled?.read(reader) ?? true);
}

/**
 * Docks the {@link SessionActivityBar} strip at the right edge of a chat area in the
 * desktop layout, in a column of its own: hosts lay the chat out to the left of the
 * {@link reservedWidth} they keep at the right edge, so that the strip never covers the
 * chat or its scrollbar, call {@link setActive} so that only the active chat
 * view shows it, and call {@link layout} with the area's top offset and height.
 * Floating beside the chat, users can drag the strip up and down by its grip within
 * that area; double-clicking the grip restores the default position. In a host outside
 * the chat, it is level with the top of the host and has no grip.
 */
export class ChatViewSessionActivityBar extends Disposable {

	/**
	 * The width of the column hosts keep at the right of the chat for the strip, the chat laid out to its left:
	 * {@link SESSION_ACTIVITY_BAR_COLUMN_WIDTH}. Reserved in every chat view while the strip is enabled, not only the
	 * active one, so focusing another chat does not shift its content; not while the strip shows in a host outside the
	 * chat, which keeps the column for it.
	 */
	readonly reservedWidth: IObservable<number>;

	private readonly activityBar: SessionActivityBar | undefined;
	private area = { top: 0, height: 0 };
	/** Where the strip sits while it floats beside the chat. */
	private position = DEFAULT_FLOATING_POSITION;
	/** The measured height of the strip, cached so layout passes do not force a reflow. */
	private height: number | undefined;
	private active = false;
	/** Whether the chat is hidden while it is active, such as while its window shows only its editor. */
	private surfaceHidden = false;
	/** The host outside the chat that the strip can show in, found among the ancestors of the chat. */
	private readonly externalHost = observableValue<ISessionActivityBarExternalHost | undefined>(this, undefined);
	/** The host the strip shows in now, if any. */
	private readonly hostedIn = observableValue<ISessionActivityBarExternalHost | undefined>(this, undefined);
	private readonly probeScheduler = this._register(new MutableDisposable());
	/** The frames left to look for the host while the chat is not attached; see {@link probeExternalHost}. */
	private probeRetries = 0;

	/** The strip, or `undefined` outside the desktop layout. */
	get element(): HTMLElement | undefined {
		return this.activityBar?.element;
	}

	constructor(
		private readonly container: HTMLElement,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ISessionsHostLayoutService hostLayoutService: ISessionsHostLayoutService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		if (hostLayoutService.agentWorkbenchLayout !== AgentWorkbenchLayout.Desktop) {
			this.reservedWidth = constObservable(0);
			return;
		}

		container.classList.add('session-activity-bar-host');
		const activityBar = this.activityBar = this._register(instantiationService.createInstance(SessionActivityBar, container));
		activityBar.element.classList.add('docked', 'inactive');

		// Shown only while the strip floats beside the chat; see `sessionActivityBar.css`.
		const dragHandle = $('.session-activity-bar-drag-handle');
		// A pointer-only affordance; the strip's entries carry its accessible semantics.
		dragHandle.setAttribute('aria-hidden', 'true');
		append(dragHandle, $('span.session-activity-bar-drag-handle-icon')).classList.add(...ThemeIcon.asClassNameArray(Codicon.gripper));
		activityBar.element.prepend(dragHandle);
		this._register(this.registerDragListeners(dragHandle));

		const phoneLayout = observableFromEvent(this, layoutService.onDidLayoutMainContainer, () => isPhoneLayout(layoutService));
		// While the strip shows in a host outside the chat, the host keeps the column for it.
		this.reservedWidth = derived(this, reader => activityBar.visible.read(reader) && !phoneLayout.read(reader) && !isHosting(this.externalHost.read(reader), reader) ? SESSION_ACTIVITY_BAR_COLUMN_WIDTH : 0);

		this._register(autorun(reader => {
			activityBar.onDidChangeEntries.read(reader);
			activityBar.visible.read(reader);
			const host = this.externalHost.read(reader);
			host?.active.read(reader);
			host?.enabled?.read(reader);
			this.height = undefined;
			this.relocate();
		}));
		this._register(toDisposable(() => {
			this.hostedIn.get()?.setOccupied(this, false);
			this.hostedIn.set(undefined, undefined);
			activityBar.element.remove();
		}));
	}

	/**
	 * Finds the host outside the chat among the chat's ancestors. A chat created before it is attached looks again once
	 * it is attached, or for a few frames while it is the active one.
	 */
	private probeExternalHost(retry = false): void {
		if (!this.container.isConnected) {
			if (!retry) {
				this.probeRetries = MAX_PROBE_RETRIES;
			}
			if (this.active && this.probeRetries > 0 && !this.probeScheduler.value) {
				this.probeRetries--;
				this.probeScheduler.value = scheduleAtNextAnimationFrame(getWindow(this.container), () => {
					this.probeScheduler.clear();
					this.probeExternalHost(true);
				});
			}
			return;
		}
		const host = findSessionActivityBarExternalHost(this.container);
		if (host !== this.externalHost.get()) {
			this.externalHost.set(host, undefined);
		}
	}

	/** Shows the strip of the active chat in the host outside it while the host is active, and beside the chat otherwise. */
	private relocate(): void {
		const activityBar = this.activityBar;
		if (!activityBar) {
			return;
		}
		const host = this.externalHost.get();
		const available = host && this.active && host.active.get() ? host : undefined;
		if (available && activityBar.visible.get()) {
			available.offer?.();
		}
		const hostedIn = available && (available.enabled?.get() ?? true) ? available : undefined;
		this.element?.classList.toggle('inactive', !this.isShown(hostedIn));
		// Beside a chat, and in hosts that keep a narrow column for it, the strip floats at the compact size.
		this.activityBar?.setFloating(!hostedIn?.fullSize);
		const parent = hostedIn?.element ?? this.container;
		const element = activityBar.element;
		if (element.parentElement !== parent) {
			// Moving the element drops its focus: the entry that had it gets it back.
			const focused = getActiveElement();
			const hadFocus = isHTMLElement(focused) && element.contains(focused) ? focused : undefined;
			parent.appendChild(element);
			hadFocus?.focus();
		}
		const previous = this.hostedIn.get();
		if (previous !== hostedIn) {
			previous?.setOccupied(this, false);
		}
		hostedIn?.setOccupied(this, activityBar.visible.get());
		this.hostedIn.set(hostedIn, undefined);
		this.applyPosition();
	}

	/**
	 * Whether the chat is the active one, whose strip shows. `surfaceHidden` is set while the chat is active but hidden,
	 * such as while its window shows only its editor: its strip then shows only in a host outside it.
	 */
	setActive(active: boolean, surfaceHidden = false): void {
		this.probeExternalHost();
		if (this.active === active && this.surfaceHidden === surfaceHidden) {
			return;
		}
		this.active = active;
		this.surfaceHidden = surfaceHidden;
		this.probeExternalHost();
		this.relocate();
	}

	/** Whether the strip shows: for the active chat, beside it, or only in `hostedIn` while the chat is hidden. */
	private isShown(hostedIn: ISessionActivityBarExternalHost | undefined): boolean {
		return this.active && (!this.surfaceHidden || !!hostedIn);
	}

	setChatActions(actions: IObservable<readonly IAction[]> | undefined): void {
		this.activityBar?.setChatActions(actions);
	}

	/** Positions the strip within the chat area at `top` with the given `height` in the host. */
	layout(top: number, height: number): void {
		this.area = { top, height };
		this.probeExternalHost();
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

	/** The largest offset from the top of the chat area that keeps the floating strip inside it. */
	private getMaximumOffset(): number {
		return Math.max(0, this.area.height - this.getHeight() - BOTTOM_CLEARANCE);
	}

	private getOffset(): number {
		const maximum = this.getMaximumOffset();
		const offset = this.position.edge === 'top' ? this.position.distance : maximum - this.position.distance;
		return Math.round(Math.max(0, Math.min(offset, maximum)));
	}

	private applyPosition(): void {
		if (this.element?.isConnected && this.isShown(this.hostedIn.get()) && this.activityBar?.visible.get()) {
			const host = this.hostedIn.get();
			this.element.style.top = host?.fullSize ? '' : `${host ? 0 : this.area.top + this.getOffset()}px`;
		}
	}

	private registerDragListeners(dragHandle: HTMLElement): IDisposable {
		const store = new DisposableStore();
		const monitor = store.add(new GlobalPointerMoveMonitor());
		store.add(this.hoverService.setupDelayedHover(dragHandle, {
			content: localize('sessionActivityBar.dragHandle', "Drag to move. Double-click to reset the position."),
			appearance: { showPointer: true },
			position: { hoverPosition: HoverPosition.LEFT },
		}));
		store.add(addDisposableListener(dragHandle, EventType.DBLCLICK, () => {
			this.position = DEFAULT_FLOATING_POSITION;
			this.applyPosition();
		}));
		store.add(addDisposableListener(dragHandle, EventType.POINTER_DOWN, (e: PointerEvent) => {
			if (e.button !== 0 || this.hostedIn.get()) {
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
 * An entry of the strip, which shows the activity reported for its command through
 * {@link ISessionActivityBarActivityService} like any {@link MenuActivityBarActionViewItem}, and whose checked entries
 * hide what they show when clicked, like the workbench activity bar's.
 * Contributions that customize an entry with `IActionViewItemService` can extend
 * this to keep its activity.
 */
export class SessionActivityBarActionViewItem extends MenuActivityBarActionViewItem {

	/** The entry's group in the menu, which its action does not carry. */
	private readonly group: string | undefined;

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ISessionActivityBarActivityService activityService: ISessionActivityBarActivityService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(action, options, activityService, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);

		this.group = MenuRegistry.getMenuItems(Menus.SessionActivityBar).find(item => isIMenuItem(item) && item.command.id === action.id)?.group;
	}

	/**
	 * The command that hides what a checked entry shows, like the workbench activity bar: the side pane for the
	 * entries that open its tabs, and the panel for the terminal. `undefined` for unchecked entries and the toggles.
	 */
	private getHideCommand(): string | undefined {
		if (!this._menuItemAction.enabled || !this._menuItemAction.checked) {
			return undefined;
		}
		// In a window with layout modes, such as a chat window, its editor parts: the strip acts on the window it is in.
		// Its entries of the panel's group, the terminals and the layout, are toggles themselves.
		const withLayoutModes = !!LayoutModeContext.getValue(this._contextKeyService);
		const command = this.group === SessionActivityBarGroup.SidePanel ? (withLayoutModes ? TOGGLE_WINDOW_EDITOR_COMMAND_ID : TOGGLE_SIDE_PANEL_COMMAND_ID)
			: this.group === SessionActivityBarGroup.Panel && !withLayoutModes ? TogglePanelAction.ID
				: undefined;
		// The toggles are entries of these groups themselves.
		return command !== this._menuItemAction.id ? command : undefined;
	}

	override getActionToRun(event: EventLike & { readonly altKey?: boolean; readonly shiftKey?: boolean }): IAction {
		const command = this.getHideCommand();
		if (command) {
			// With the context the strip runs its entries with, such as the window it is in.
			return toAction({ id: command, label: this._menuItemAction.label, run: (context?: unknown) => context === undefined ? this.commandService.executeCommand(command) : this.commandService.executeCommand(command, context) });
		}
		return super.getActionToRun(event);
	}

	override async onClick(event: MouseEvent): Promise<void> {
		if (!this.getHideCommand()) {
			return super.onClick(event);
		}
		EventHelper.stop(event, true);
		try {
			await this.actionRunner.run(this.getActionToRun(event), this._context);
		} catch (error) {
			this._notificationService.error(error);
		}
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
			// The strip's context, such as the handle of its chat window, as its other entries run with.
			getActionsContext: () => this._context,
			lookupKeybinding: commandId => this.keybindingService.lookupKeybinding(commandId),
			openKeys: [KeyCode.Enter, KeyCode.Space, KeyCode.LeftArrow],
			closeKeys: [KeyCode.RightArrow],
			// Opens toward the chat, matching the arrow keys, even when there is room to the right.
			anchorAlignment: AnchorAlignment.RIGHT,
		}));
		this._register(this.submenuFlyout.onDidChangeOpen(() => {
			this.hideHover();
			this.updateTooltip();
		}));
	}

	protected override getHoverContents(): IManagedHoverContent | undefined {
		return this.submenuFlyout?.isOpen ? undefined : super.getHoverContents();
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
