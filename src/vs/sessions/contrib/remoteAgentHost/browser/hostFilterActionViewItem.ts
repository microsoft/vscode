/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/hostFilter.css';
import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../common/agentHostFilter.js';

/**
 * Visual appearance of {@link HostFilterActionViewItem}.
 *
 * - `titlebar` — the original compact pill designed for the desktop
 *   titlebar's left toolbar. Fixed-height pill with `--vscode-titleBar-…`
 *   text colors and a `max-width` so it never grows too wide.
 * - `sidebar` — full-width row aligned with the rest of the agents
 *   sidebar (matches `.sidebar-action-button`'s rhythm), used by the
 *   {@link AgentHostShortcutsWidget} on web desktop.
 */
export type HostFilterAppearance = 'titlebar' | 'sidebar';

/**
 * Compound widget showing the agent host picker plus a connection-state
 * button. Originally lived in the desktop titlebar, now also rendered as a
 * sidebar row via {@link HostFilterAppearance}.
 */
export class HostFilterActionViewItem extends BaseActionViewItem {

	private _dropdownElement: HTMLElement | undefined;
	private _labelElement: HTMLElement | undefined;
	private _chevronElement: HTMLElement | undefined;
	private _connectElement: HTMLElement | undefined;
	private _sidebarButton: Button | undefined;
	private _sidebarLeadingIcon: HTMLElement | undefined;
	private _sidebarTrailingIcon: HTMLElement | undefined;

	private readonly _dropdownHover = this._register(new MutableDisposable());
	private readonly _connectHover = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		private readonly _appearance: HostFilterAppearance = 'titlebar',
		@IAgentHostFilterService protected readonly _filterService: IAgentHostFilterService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(undefined, action);

		this._register(this._filterService.onDidChange(() => this._update()));
		this._register(this._filterService.onDidChangeDiscovering(() => this._update()));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		this.element.classList.add('agent-host-filter-combo');
		if (this._appearance === 'sidebar') {
			this.element.classList.add('sidebar');
			this._renderSidebar();
		} else {
			this._renderTitlebar();
		}

		this._update();
	}

	/**
	 * Original compact pill rendered in the desktop titlebar's left toolbar.
	 * Custom DOM driven directly by click handlers + context menu service.
	 */
	private _renderTitlebar(): void {
		if (!this.element) {
			return;
		}

		// --- Dropdown pill (left) -----------------------------------------------
		this._dropdownElement = dom.append(this.element, dom.$('div.agent-host-filter-dropdown'));

		const iconEl = dom.append(this._dropdownElement, dom.$('span.agent-host-filter-icon'));
		iconEl.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));

		this._labelElement = dom.append(this._dropdownElement, dom.$('span.agent-host-filter-label'));

		this._chevronElement = dom.append(this._dropdownElement, dom.$('span.agent-host-filter-chevron'));
		this._chevronElement.append(...renderLabelWithIcons(`$(${Codicon.chevronDown.id})`));

		this._register(Gesture.addTarget(this._dropdownElement));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._register(dom.addDisposableListener(this._dropdownElement, eventType, e => {
				if (!this._isInteractive()) {
					return;
				}
				dom.EventHelper.stop(e, true);
				this._showMenu(e);
			}));
		}
		this._register(dom.addDisposableListener(this._dropdownElement, dom.EventType.KEY_DOWN, e => {
			if (!this._isInteractive()) {
				return;
			}
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				this._showMenu(e);
			}
		}));

		// --- Connection button (right) ------------------------------------------
		this._connectElement = dom.append(this.element, dom.$('div.agent-host-filter-connect'));
		this._wireConnectButton(this._connectElement);
	}

	/**
	 * Sidebar appearance — full-width row matching the Customizations links
	 * (`CustomizationLinkViewItem`). Same Monaco `Button` shell, same
	 * `.sidebar-action-button` styling, same `supportIcons` label rendering.
	 * The trailing connect indicator is rendered alongside the picker
	 * button as a sibling control, so the row visually mirrors the
	 * Customizations rows in the toolbar above without making the
	 * indicator part of the picker label.
	 */
	private _renderSidebar(): void {
		if (!this.element) {
			return;
		}

		this.element.classList.add('sidebar-action');

		// Picker button — same shell as `CustomizationLinkViewItem`. We
		// drive the button content manually (rather than via `Button.label`)
		// so the host name span can `flex: 1` and push the chevron all
		// the way to the trailing edge.
		const buttonContainer = dom.append(this.element, dom.$('.customization-link-button-container'));
		this._sidebarButton = this._register(new Button(buttonContainer, {
			...defaultButtonStyles,
			secondary: true,
			title: false,
			supportIcons: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryHoverBackground: undefined,
			buttonSecondaryForeground: undefined,
			buttonSecondaryBorder: undefined,
		}));
		this._sidebarButton.element.classList.add('customization-link-button', 'sidebar-action-button', 'agent-host-filter-button', 'monaco-text-button');

		this._dropdownElement = this._sidebarButton.element;
		// Build the button content manually as three direct children so
		// we can keep stable references to each element (icon · label ·
		// chevron) without DOM querying. The label takes `flex: 1` so
		// the trailing chevron is pushed to the right edge.
		this._sidebarLeadingIcon = dom.append(this._sidebarButton.element, dom.$('span.agent-host-filter-leading-icon'));
		this._sidebarLeadingIcon.classList.add('codicon', `codicon-${Codicon.remote.id}`);
		this._labelElement = dom.append(this._sidebarButton.element, dom.$('span.agent-host-filter-label'));
		// Trailing chevron is created up-front but only attached to the
		// button when this is a real picker (2+ hosts). See
		// `_renderSidebarButtonAffordances`.
		this._sidebarTrailingIcon = dom.$('span.agent-host-filter-trailing-icon.codicon');
		this._sidebarTrailingIcon.classList.add(`codicon-${Codicon.chevronDown.id}`);

		this._register(this._sidebarButton.onDidClick(e => {
			if (!this._isInteractive()) {
				return;
			}
			// Pass the original event through to `_showMenu`. It will
			// anchor on the mouse position when `e` is a real
			// `MouseEvent` and otherwise fall back to anchoring on the
			// dropdown element (the right behavior for keyboard /
			// touch / gesture activations). When there are no hosts,
			// `_showMenu` triggers re-discovery instead of opening the
			// menu — same as the dedicated refresh button next to it.
			this._showMenu(e);
		}));

		// Connect indicator — sibling of the picker button so it reads as
		// an independent control (not part of the picker label).
		this._connectElement = dom.append(this.element, dom.$('div.agent-host-filter-connect'));
		this._wireConnectButton(this._connectElement);
	}

	private _wireConnectButton(connectElement: HTMLElement): void {
		this._register(Gesture.addTarget(connectElement));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._register(dom.addDisposableListener(connectElement, eventType, e => {
				// Stop propagation so the host menu (parent button click)
				// doesn't open when toggling the connection.
				dom.EventHelper.stop(e, true);
				this._onConnectClick();
			}));
		}
		this._register(dom.addDisposableListener(connectElement, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				this._onConnectClick();
			}
		}));
	}

	private _renderSidebarButtonAffordances(interactive: boolean, canRetry: boolean): void {
		if (!this._sidebarButton || !this._sidebarTrailingIcon) {
			return;
		}

		// Trailing chevron — only attached when this is a real picker
		// (i.e. there are 2+ hosts to choose from). For canRetry /
		// single-host the button is *not* a dropdown — in canRetry the
		// refresh action lives in the trailing connect slot instead,
		// mirroring the disconnect button shape.
		const showChevron = interactive && !canRetry;
		if (showChevron) {
			if (!this._sidebarTrailingIcon.isConnected) {
				this._sidebarButton.element.appendChild(this._sidebarTrailingIcon);
			}
		} else {
			this._sidebarTrailingIcon.remove();
		}
	}

	protected _isInteractive(): boolean {
		const hosts = this._filterService.hosts;
		// Interactive when there is something to do: pick from a menu (>1
		// hosts) or trigger re-discovery (0 hosts). With exactly 1 host the
		// pill is a static label.
		return hosts.length === 0 || hosts.length > 1;
	}

	private _update(): void {
		if (!this.element || !this._dropdownElement || !this._labelElement || !this._connectElement) {
			return;
		}

		// Titlebar appearance has a chevron element; sidebar does not. Bail
		// only when a required element for the active appearance is missing.
		if (!this._sidebarButton && !this._chevronElement) {
			return;
		}

		const hosts = this._filterService.hosts;
		const selectedId = this._filterService.selectedProviderId;
		const selected = selectedId === undefined
			? undefined
			: hosts.find(h => h.providerId === selectedId);

		const hasMenu = hosts.length > 1;
		const canRetry = hosts.length === 0;
		const interactive = hasMenu || canRetry;
		const discovering = this._filterService.isDiscovering;

		// Dropdown label + aria
		const text = selected
			? selected.label
			: discovering
				? localize('agentHostFilter.searching', "Searching…")
				: localize('agentHostFilter.none', "No Host");

		if (this._sidebarButton) {
			// Sidebar appearance: write the host name into our own label
			// span (which is `flex: 1` so it consumes remaining space) and
			// (re)position the leading host icon + trailing chevron
			// around it. The chevron uses `$(refresh)` when there are no
			// hosts (clicking re-runs discovery) and is omitted entirely
			// for the non-interactive single-host case.
			this._labelElement.textContent = text;
			this._renderSidebarButtonAffordances(interactive, canRetry);
		} else {
			this._labelElement.textContent = text;
		}

		this.element.classList.toggle('single-host', !interactive);
		// While discovery is running, suppress the label so the pill collapses
		// to a small pulsing icon (a la "checking…"). Once discovery finishes,
		// the label re-appears.
		this._dropdownElement.classList.toggle('discovering', discovering);
		this._dropdownElement.classList.toggle('no-hosts', canRetry);

		// Swap the chevron content based on the click affordance: a chevron
		// when the pill opens a menu, a refresh icon when it triggers re-
		// discovery. Clearing first avoids stacking icon nodes. Sidebar
		// mode has no chevron — the button label is the whole interactive
		// surface.
		if (this._chevronElement) {
			dom.clearNode(this._chevronElement);
			const chevronIconId = canRetry ? Codicon.refresh.id : Codicon.chevronDown.id;
			this._chevronElement.append(...renderLabelWithIcons(`$(${chevronIconId})`));
		}

		if (interactive) {
			if (!this._sidebarButton) {
				// Titlebar: drive tabIndex / role on the dropdown DIV manually.
				// The Button used in the sidebar appearance already provides
				// its own focusability, role, and keyboard activation.
				this._dropdownElement.tabIndex = 0;
				this._dropdownElement.role = 'button';
				if (hasMenu) {
					this._dropdownElement.setAttribute('aria-haspopup', 'menu');
				} else {
					this._dropdownElement.removeAttribute('aria-haspopup');
				}
			} else if (hasMenu) {
				this._dropdownElement.setAttribute('aria-haspopup', 'menu');
			} else {
				this._dropdownElement.removeAttribute('aria-haspopup');
			}
			const ariaLabel = selected
				? localize('agentHostFilter.aria.selected', "Sessions scoped to host {0}. Click to change host.", selected.label)
				: canRetry
					? localize('agentHostFilter.aria.retry', "No hosts found. Click to re-discover hosts.")
					: localize('agentHostFilter.aria.none', "No agent host selected.");
			this._dropdownElement.setAttribute('aria-label', ariaLabel);
			const hoverText = canRetry
				? (discovering
					? localize('agentHostFilter.hover.searching', "Searching for hosts…")
					: localize('agentHostFilter.hover.retry', "Re-discover hosts"))
				: localize('agentHostFilter.hover', "Change the host the sessions list is scoped to");
			this._dropdownHover.value = this._hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'),
				this._dropdownElement,
				() => hoverText,
			);
		} else {
			if (!this._sidebarButton) {
				this._dropdownElement.removeAttribute('tabindex');
				this._dropdownElement.removeAttribute('role');
			}
			this._dropdownElement.removeAttribute('aria-haspopup');
			this._dropdownElement.setAttribute('aria-label', selected
				? localize('agentHostFilter.aria.singleSelected', "Sessions scoped to host {0}", selected.label)
				: localize('agentHostFilter.aria.none', "No agent host selected."));
			this._dropdownHover.clear();
		}

		this._updateConnectButton(selected, canRetry, discovering);
	}

	private _updateConnectButton(selected: IAgentHostFilterEntry | undefined, canRetry: boolean, discovering: boolean): void {
		if (!this._connectElement) {
			return;
		}

		dom.clearNode(this._connectElement);
		this._connectElement.classList.remove('connected', 'connecting', 'disconnected', 'rediscover', 'hidden');
		this._connectHover.clear();

		// Sidebar appearance: when there are no known hosts, repurpose
		// this trailing slot as a "Re-discover hosts" button so the
		// user has an independent control next to the "No Host" picker
		// — same shape as disconnect/connect on a real host.
		if (!selected && this._sidebarButton && canRetry) {
			this._connectElement.setAttribute('role', 'button');
			this._connectElement.tabIndex = 0;
			this._connectElement.classList.add('rediscover');
			this._connectElement.append(...renderLabelWithIcons(`$(${Codicon.refresh.id})`));
			const hoverText = discovering
				? localize('agentHostFilter.hover.searching', "Searching for hosts…")
				: localize('agentHostFilter.hover.retry', "Re-discover hosts");
			this._connectElement.setAttribute('aria-label', hoverText);
			this._connectHover.value = this._hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'),
				this._connectElement,
				() => hoverText,
			);
			return;
		}

		if (!selected) {
			this._connectElement.classList.add('hidden');
			this._connectElement.removeAttribute('role');
			this._connectElement.removeAttribute('tabindex');
			return;
		}

		// Always render as a button; clicking forces a fresh connect attempt
		// regardless of current state (the platform service tears down any
		// existing connection before reconnecting).
		this._connectElement.setAttribute('role', 'button');
		this._connectElement.tabIndex = 0;

		let iconId: string;
		let hoverText: string;
		switch (selected.status) {
			case AgentHostFilterConnectionStatus.Connected:
				iconId = Codicon.debugConnected.id;
				this._connectElement.classList.add('connected');
				hoverText = localize('agentHostFilter.status.connected', "Connected to {0}. Click to disconnect.", selected.label);
				break;
			case AgentHostFilterConnectionStatus.Connecting:
				iconId = Codicon.debugConnected.id;
				this._connectElement.classList.add('connecting');
				hoverText = localize('agentHostFilter.status.connecting', "Connecting to {0}… Click to cancel.", selected.label);
				break;
			case AgentHostFilterConnectionStatus.Disconnected:
			default:
				iconId = Codicon.debugDisconnect.id;
				this._connectElement.classList.add('disconnected');
				hoverText = localize('agentHostFilter.status.disconnected', "Disconnected from {0}. Click to connect.", selected.label);
				break;
		}
		this._connectElement.append(...renderLabelWithIcons(`$(${iconId})`));
		this._connectElement.setAttribute('aria-label', hoverText);

		const connectHoverDelegate = getDefaultHoverDelegate('element');
		this._connectHover.value = this._hoverService.setupManagedHover(
			connectHoverDelegate,
			this._connectElement,
			() => hoverText,
		);
	}

	private _onConnectClick(): void {
		// Sidebar "no hosts" state: the connect slot doubles as a
		// re-discovery affordance (refresh icon). Trigger discovery when
		// we recognise that mode.
		if (this._connectElement?.classList.contains('rediscover')) {
			if (!this._filterService.isDiscovering) {
				this._filterService.rediscover();
			}
			return;
		}

		const selectedId = this._filterService.selectedProviderId;
		if (selectedId === undefined) {
			return;
		}
		const selected = this._filterService.hosts.find(h => h.providerId === selectedId);
		if (!selected) {
			return;
		}
		if (selected.status === AgentHostFilterConnectionStatus.Disconnected) {
			this._filterService.reconnect(selectedId);
		} else {
			// Connected or Connecting — clicking tears down the current
			// connection / cancels the in-flight attempt.
			this._filterService.disconnect(selectedId);
		}
	}

	protected _showMenu(e: Event): void {
		if (!this._dropdownElement) {
			return;
		}

		const hosts = this._filterService.hosts;
		// Zero hosts: the pill is a re-discovery trigger, not a menu. Fire
		// rediscover() unless one is already in flight.
		if (hosts.length === 0) {
			if (!this._filterService.isDiscovering) {
				this._filterService.rediscover();
			}
			return;
		}
		if (hosts.length === 1) {
			return;
		}

		const selectedId = this._filterService.selectedProviderId;

		const actions: IAction[] = [];
		for (const host of hosts) {
			const label = host.status === AgentHostFilterConnectionStatus.Connected
				? host.label
				: host.status === AgentHostFilterConnectionStatus.Connecting
					? localize('agentHostFilter.hostConnecting', "{0} (connecting…)", host.label)
					: localize('agentHostFilter.hostDisconnected', "{0} (disconnected)", host.label);
			actions.push(new Action(
				`agentHostFilter.host.${host.providerId}`,
				label,
				selectedId === host.providerId ? 'codicon codicon-check' : undefined,
				true,
				async () => this._filterService.setSelectedProviderId(host.providerId),
			));
		}

		const anchor = dom.isMouseEvent(e)
			? new StandardMouseEvent(dom.getWindow(this._dropdownElement), e)
			: this._dropdownElement;

		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			domForShadowRoot: this._dropdownElement,
		});
	}
}
