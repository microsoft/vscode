/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionActivityBar.css';
import { $, addDisposableListener, append, EventHelper, EventLike, EventType, getActiveElement, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { GlobalPointerMoveMonitor } from '../../../base/browser/globalPointerMoveMonitor.js';
import { ActionsOrientation } from '../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem, IActionViewItemOptions } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment } from '../../../base/browser/ui/contextview/contextview.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { Codicon } from '../../../base/common/codicons.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent, observableValue, transaction } from '../../../base/common/observable.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { Action, IAction, toAction } from '../../../base/common/actions.js';
import { localize } from '../../../nls.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { isIMenuItem, MenuItemAction, MenuRegistry, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { IBadge, NumberBadge } from '../../../workbench/services/activity/common/activity.js';
import { TogglePanelAction } from '../../../workbench/browser/parts/panel/panelActions.js';
import { ISessionActivityBarActivityService } from '../../services/activity/common/sessionActivityBarActivityService.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { Menus, SessionActivityBarGroup } from '../menus.js';
import { AgentWorkbenchLayout, IAgentWorkbenchLayoutService } from '../workbench.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../common/sessionConfig.js';
import { TOGGLE_SIDE_PANEL_COMMAND_ID } from '../../common/sessionCommands.js';
import { sessionActivityBarChatActionContext } from '../../common/contextkeys.js';
import { isPhoneLayout } from './mobile/mobileLayout.js';
import { ChatWindowIdContext } from '../../services/chatWindow/browser/chatWindowService.js';
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

	private readonly chatActions = observableValue<IObservable<readonly IAction[]> | undefined>(this, undefined);

	constructor(
		container: HTMLElement,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.element = append(container, $('.session-activity-bar'));
		const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
		const scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
		let actionsById = new Map<string, IAction>();
		const renderedChatActions = this._register(new DisposableMap<string, Action>());

		// Like the workbench activity bar, once an entry's hover has shown, moving to another entry shows its hover instantly.
		const hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'element', { instantHover: true }, { position: { hoverPosition: HoverPosition.LEFT } }));
		const toolbar = this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.element, Menus.SessionActivityBar, {
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
				const chatAction = renderedChatActions.get(action.id);
				if (chatAction) {
					return new ActionViewItem(undefined, chatAction, { ...options, icon: true, label: false });
				}
				if (action instanceof SubmenuItemAction) {
					return scopedInstantiationService.createInstance(SessionActivityBarSubmenuViewItem, action, { ...options, icon: true, label: false });
				}
				if (action instanceof MenuItemAction) {
					return instantiationService.createInstance(SessionActivityBarActionViewItem, action, options);
				}
				return undefined;
			},
		}));

		// In a chat window, its entries act on the chat window of this strip, not on the one that happens to be active.
		const updateContext = () => {
			const chatWindowId = ChatWindowIdContext.getValue(scopedContextKeyService);
			toolbar.context = typeof chatWindowId === 'number' && chatWindowId >= 0 ? { chatWindowId } : undefined;
		};
		updateContext();
		this._register(scopedContextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([ChatWindowIdContext.key]))) {
				updateContext();
			}
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
		const keys = new Map<string, IContextKey<boolean>>();
		const enabled = observableFromEvent(this, this.configurationService.onDidChangeConfiguration, () => !!this.configurationService.getValue<boolean>(SESSION_ACTIVITY_BAR_SETTING));
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
				toolbar.refresh();
			}
			update();
		}));
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

	setChatActions(actions: IObservable<readonly IAction[]> | undefined): void {
		this.chatActions.set(actions, undefined);
	}
}

/** Default distance from the top of the chat area to the strip. */
const DEFAULT_TOP_OFFSET = 4;

/** Keeps the strip's bottom level with the chat input's: the composer's 22px footer controls, 4px gap, and 4px bottom padding. */
const BOTTOM_CLEARANCE = 30;

/** Width of the strip itself: 24px buttons, 2px padding and a 1px border on each side, in `sessionActivityBar.css`. */
const STRIP_WIDTH = 30;

/** Space kept on either side of the strip in its column, matching `sessionActivityBar.css`. */
const COLUMN_GAP = 2;

/**
 * The width of the column the strip takes at the right edge of the chat area, which the chat is laid out to the left of:
 * the strip with an equal gap on either side, between it and the chat and between it and the edge. See
 * {@link ChatViewSessionActivityBar.reservedWidth}.
 */
export const SESSION_ACTIVITY_BAR_COLUMN_WIDTH = COLUMN_GAP + STRIP_WIDTH + COLUMN_GAP;

/** How many frames the active strip of a chat that is not attached yet looks for its host; see `probeExternalHost`. */
const MAX_PROBE_RETRIES = 3;

/**
 * A place outside the chat where the active strip shows instead, such as a column of its own beside the editor while the
 * chat is below the editor or hidden. See {@link registerSessionActivityBarExternalHost}.
 */
export interface ISessionActivityBarExternalHost {
	/** The element the strip moves into: {@link SESSION_ACTIVITY_BAR_COLUMN_WIDTH} wide. */
	readonly element: HTMLElement;
	/** Whether the active strip shows in the host rather than beside its chat. */
	readonly active: IObservable<boolean>;
	/** The height of the area the strip moves up and down in, from the top of {@link element}. */
	readonly height: IObservable<number>;
	/**
	 * Whether `occupant`, a shown strip, is in the host, for the host to keep room for it while any strip is. A strip can
	 * enter before another leaves; see {@link SessionActivityBarHostOccupancy}.
	 */
	setOccupied(occupant: object, occupied: boolean): void;
}

/** Whether any strip is in an {@link ISessionActivityBarExternalHost}, whatever order they enter and leave it in. */
export class SessionActivityBarHostOccupancy {

	private readonly occupants = new Set<object>();
	private readonly _occupied = observableValue<boolean>(this, false);
	readonly occupied: IObservable<boolean> = this._occupied;

	set(occupant: object, occupied: boolean): void {
		if (occupied) {
			this.occupants.add(occupant);
		} else {
			this.occupants.delete(occupant);
		}
		this._occupied.set(this.occupants.size > 0, undefined);
	}
}

const externalHosts = new Map<HTMLElement, ISessionActivityBarExternalHost>();

/** Registers `host` for the strips of the chat views within `scope`, such as a window. The host of the nearest registered scope applies. */
export function registerSessionActivityBarExternalHost(scope: HTMLElement, host: ISessionActivityBarExternalHost): IDisposable {
	externalHosts.set(scope, host);
	return toDisposable(() => {
		if (externalHosts.get(scope) === host) {
			externalHosts.delete(scope);
		}
	});
}

/** The host registered for the nearest scope among `element` and its ancestors, which the strip of a chat in it shows in. */
export function findSessionActivityBarExternalHost(element: HTMLElement): ISessionActivityBarExternalHost | undefined {
	for (let candidate: HTMLElement | null = element; candidate; candidate = candidate.parentElement) {
		const host = externalHosts.get(candidate);
		if (host) {
			return host;
		}
	}
	return undefined;
}

/** Where the strip sits: a distance from the top or bottom of the chat area, whichever it was dragged nearer. */
interface IActivityBarPosition {
	readonly edge: 'top' | 'bottom';
	readonly distance: number;
}

const DEFAULT_POSITION: IActivityBarPosition = { edge: 'top', distance: DEFAULT_TOP_OFFSET };

/**
 * Docks the {@link SessionActivityBar} strip at the right edge of a chat area in the
 * desktop layout, in a column of its own: hosts lay the chat out to the left of the
 * {@link reservedWidth} they keep at the right edge, so that the strip never covers the
 * chat or its scrollbar, call {@link setActive} so that only the active chat
 * view shows it, and call {@link layout} with the area's top offset and height.
 * Users can drag the strip up and down by its grip within that area;
 * double-clicking the grip restores the default position. Each host keeps its own
 * position.
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
	private position = DEFAULT_POSITION;
	private area = { top: 0, height: 0 };
	private active = false;
	/** The measured height of the strip, cached so layout passes do not force a reflow. */
	private height: number | undefined;
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
		const activityBar = this.activityBar = this._register(instantiationService.createInstance(SessionActivityBar, container));
		activityBar.element.classList.add('docked', 'inactive');

		const dragHandle = $('.session-activity-bar-drag-handle');
		// A pointer-only affordance; the strip's entries carry its accessible semantics.
		dragHandle.setAttribute('aria-hidden', 'true');
		append(dragHandle, $('span.session-activity-bar-drag-handle-icon')).classList.add(...ThemeIcon.asClassNameArray(Codicon.gripper));
		activityBar.element.prepend(dragHandle);
		this._register(this.registerDragListeners(dragHandle));

		const phoneLayout = observableFromEvent(this, layoutService.onDidLayoutMainContainer, () => isPhoneLayout(layoutService));
		// While the strip shows in a host outside the chat, the host keeps the column for it.
		this.reservedWidth = derived(this, reader => activityBar.visible.read(reader) && !phoneLayout.read(reader) && !this.externalHost.read(reader)?.active.read(reader) ? SESSION_ACTIVITY_BAR_COLUMN_WIDTH : 0);

		this._register(autorun(reader => {
			activityBar.itemCount.read(reader);
			activityBar.visible.read(reader);
			this.externalHost.read(reader)?.active.read(reader);
			this.height = undefined;
			this.relocate();
		}));
		// Only the strip in a host moves within the host's height, which does not change the strip's own height.
		this._register(autorun(reader => {
			const hostedIn = this.hostedIn.read(reader);
			if (hostedIn) {
				hostedIn.height.read(reader);
				this.applyPosition();
			}
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
		const hostedIn = host && this.active && host.active.get() ? host : undefined;
		this.element?.classList.toggle('inactive', !this.isShown(hostedIn));
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

	/** The area the strip moves up and down in: beside the chat, or in the host it shows in. */
	private getArea(): { readonly top: number; readonly height: number } {
		const hostedIn = this.hostedIn.get();
		return hostedIn ? { top: 0, height: hostedIn.height.get() } : this.area;
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
		return Math.max(0, this.getArea().height - this.getHeight() - BOTTOM_CLEARANCE);
	}

	private getOffset(): number {
		const maximum = this.getMaximumOffset();
		const offset = this.position.edge === 'top' ? this.position.distance : maximum - this.position.distance;
		return Math.round(Math.max(0, Math.min(offset, maximum)));
	}

	private applyPosition(): void {
		if (this.element?.isConnected && this.isShown(this.hostedIn.get()) && this.activityBar?.visible.get()) {
			this.element.style.top = `${this.getArea().top + this.getOffset()}px`;
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

	/** The command that hides what the entry shows when checked, resolved from the entry's group in the menu, which its action does not carry. */
	private readonly hideCommand: string | undefined;

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
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);

		const group = MenuRegistry.getMenuItems(Menus.SessionActivityBar).find(item => isIMenuItem(item) && item.command.id === action.id)?.group;
		const hideCommand = group === SessionActivityBarGroup.SidePanel ? TOGGLE_SIDE_PANEL_COMMAND_ID : group === SessionActivityBarGroup.Panel ? TogglePanelAction.ID : undefined;
		// The side panel and panel toggles are entries of these groups themselves.
		this.hideCommand = hideCommand !== action.id ? hideCommand : undefined;

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

	/**
	 * The command that hides what a checked entry shows, like the workbench activity bar: the side pane for the
	 * entries that open its tabs, and the panel for the terminal. `undefined` for unchecked entries and the toggles.
	 */
	private getHideCommand(): string | undefined {
		return this._menuItemAction.enabled && this._menuItemAction.checked ? this.hideCommand : undefined;
	}

	override getActionToRun(event: EventLike & { readonly altKey?: boolean; readonly shiftKey?: boolean }): IAction {
		const command = this.getHideCommand();
		if (command) {
			return toAction({ id: command, label: this._menuItemAction.label, run: () => this.commandService.executeCommand(command) });
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
			// The strip's context, such as the handle of its chat window, as its other entries run with.
			getActionsContext: () => this._context,
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
