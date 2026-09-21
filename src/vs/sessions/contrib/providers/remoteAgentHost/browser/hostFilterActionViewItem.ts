/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/hostFilter.css';
import '../../../../browser/media/sidebarActionButton.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ShowConnectionDiagnosticsCommandId } from './connectionDiagnostics.js';

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
	private _diagnosticsElement: HTMLElement | undefined;
	private _sidebarButton: Button | undefined;
	private _sidebarLeadingIcon: HTMLElement | undefined;
	private _titlebarLeadingIcon: HTMLElement | undefined;
	private _sidebarTrailingIcon: HTMLElement | undefined;

	private readonly _dropdownHover = this._register(new MutableDisposable());
	private readonly _diagnosticsHover = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		private readonly _appearance: HostFilterAppearance = 'titlebar',
		@IAgentHostFilterService protected readonly _filterService: IAgentHostFilterService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ICommandService private readonly _commandService: ICommandService,
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

		const iconWrap = dom.append(this._dropdownElement, dom.$('span.agent-host-filter-icon'));
		// Keep the codicon child stable: it carries a looping "discovering"
		// animation, and rebuilding the node would restart it mid-pass.
		this._titlebarLeadingIcon = dom.append(iconWrap, renderIcon(Codicon.remote));

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

		// --- Passive connection status + information button --------------------
		this._connectElement = dom.append(this.element, dom.$('div.agent-host-filter-connect'));
		this._connectElement.setAttribute('aria-hidden', 'true');
		this._renderDiagnosticsButton(this.element);
	}

	/** Renders the full-width sidebar variant with a separate connection indicator. */
	private _renderSidebar(): void {
		if (!this.element) {
			return;
		}

		this.element.classList.add('sidebar-action');

		// Drive the button content manually (rather than via `Button.label`)
		// so the host name span can `flex: 1` and push the chevron all
		// the way to the trailing edge.
		const buttonContainer = dom.append(this.element, dom.$('.agent-host-filter-button-container'));
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

		// Connection state is passive; the adjacent information control opens management.
		this._connectElement = dom.append(this.element, dom.$('div.agent-host-filter-connect'));
		this._connectElement.setAttribute('aria-hidden', 'true');
		this._renderDiagnosticsButton(this.element);
	}

	protected _renderDiagnosticsButton(container: HTMLElement): void {
		const element = this._diagnosticsElement = dom.append(container, dom.$('div.agent-host-filter-diagnostics'));
		const label = localize('agentHostFilter.connectionInformation', "Open Connection Information");
		element.setAttribute('role', 'button');
		element.setAttribute('aria-label', label);
		element.tabIndex = 0;
		element.append(...renderLabelWithIcons(`$(${Codicon.info.id})`));
		this._diagnosticsHover.value = this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), element, () => label);
		const show = () => this._showConnectionInformation();
		this._register(Gesture.addTarget(element));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._register(dom.addDisposableListener(element, eventType, event => {
				dom.EventHelper.stop(event, true);
				show();
			}));
		}
		this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				dom.EventHelper.stop(event, true);
				show();
			}
		}));
	}

	protected _showConnectionInformation(): void {
		void this._commandService.executeCommand(ShowConnectionDiagnosticsCommandId);
	}

	private _renderSidebarButtonAffordances(interactive: boolean, retryOnClick: boolean): void {
		if (!this._sidebarButton || !this._sidebarTrailingIcon) {
			return;
		}

		// Trailing chevron — only attached when this is a real picker
		// (i.e. there are 2+ hosts to choose from). When clicking re-runs
		// discovery, or for single-host, the button is *not* a dropdown —
		// the refresh action lives in the trailing connect slot instead,
		// mirroring the disconnect button shape.
		const showChevron = interactive && !retryOnClick;
		if (showChevron) {
			if (!this._sidebarTrailingIcon.isConnected) {
				this._sidebarButton.element.appendChild(this._sidebarTrailingIcon);
			}
		} else {
			this._sidebarTrailingIcon.remove();
		}
	}

	protected _isInteractive(): boolean {
		// Interactive when there is something to do: pick from a menu (2+
		// entries) or trigger re-discovery (no host to connect to). A lone
		// connectable host is a static label.
		return this._filterService.hosts.length > 1 || this._canRetry();
	}

	/**
	 * Whether re-discovery is the useful action, i.e. there is no host the
	 * user can connect to. True with no hosts at all, and with only
	 * non-connectable entries such as a sandbox group.
	 */
	protected _canRetry(): boolean {
		return !this._filterService.hosts.some(h => h.connectable);
	}

	/**
	 * Whether clicking the pill re-runs discovery rather than opening the
	 * picker. Only when there is nothing to switch between — with 2+ entries
	 * the click opens the menu, so the affordances must read as a menu.
	 */
	protected _retriesOnClick(): boolean {
		return this._filterService.hosts.length <= 1 && this._canRetry();
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
		const selected = this._filterService.selectedHost;

		const hasMenu = hosts.length > 1;
		// What clicking actually does. The affordances below follow this, not
		// host connectability: with 2+ entries the click opens the menu even when none
		// of them is connectable.
		const retryOnClick = this._retriesOnClick();
		// Ask the same predicate the click handlers gate on, so the pill never
		// renders as a static label while remaining clickable (mobile always
		// opens its sheet) or vice versa.
		const interactive = this._isInteractive();
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
			// around it. The chevron is dropped when clicking re-runs
			// discovery, and for the non-interactive single-host case.
			this._labelElement.textContent = text;
			this._renderSidebarButtonAffordances(interactive, retryOnClick);
		} else {
			this._labelElement.textContent = text;
		}

		// Leading icon follows the selection, so a grouped entry can carry its
		// own identity (GitHub Sandboxes shows a package, not a remote plug).
		this._renderLeadingIcon(selected?.icon ?? Codicon.remote);

		this.element.classList.toggle('single-host', !interactive);
		// While discovery is running, suppress the label so the pill collapses
		// to a small pulsing icon (a la "checking…"). Once discovery finishes,
		// the label re-appears.
		this._dropdownElement.classList.toggle('discovering', discovering);
		this._dropdownElement.classList.toggle('no-hosts', hosts.length === 0);

		// Swap the chevron content based on the click affordance: a chevron
		// when the pill opens a menu, a refresh icon when it triggers re-
		// discovery. Clearing first avoids stacking icon nodes. Sidebar
		// mode has no chevron — the button label is the whole interactive
		// surface.
		if (this._chevronElement) {
			dom.clearNode(this._chevronElement);
			const chevronIconId = retryOnClick ? Codicon.refresh.id : Codicon.chevronDown.id;
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
			const ariaLabel = !selected
				? (retryOnClick
					? localize('agentHostFilter.aria.retry', "No hosts found. Click to re-discover hosts.")
					: localize('agentHostFilter.aria.none', "No agent host selected."))
				: retryOnClick
					? localize('agentHostFilter.aria.selectedRetry', "Sessions scoped to host {0}. Click to re-discover hosts.", selected.label)
					: localize('agentHostFilter.aria.selected', "Sessions scoped to host {0}. Click to change host.", selected.label);
			this._dropdownElement.setAttribute('aria-label', ariaLabel);
			const hoverText = retryOnClick
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

		this._updateConnectButton(selected);
	}

	/**
	 * Point the leading icon at `icon`. Both appearances keep a stable element
	 * for it and only swap its codicon class — the titlebar icon carries a
	 * looping "discovering" animation that a rebuilt node would restart.
	 */
	private _renderLeadingIcon(icon: ThemeIcon): void {
		for (const element of [this._sidebarLeadingIcon, this._titlebarLeadingIcon]) {
			if (!element) {
				continue;
			}
			const classes = ThemeIcon.asClassNameArray(icon);
			if (classes.every(c => element.classList.contains(c))) {
				continue;
			}
			// Codicon classes are the only ones these nodes carry beyond their
			// own layout class, so dropping every `codicon-*` is safe.
			element.classList.remove(...[...element.classList].filter(c => c.startsWith('codicon')));
			element.classList.add(...classes);
		}
	}

	private _updateConnectButton(selected: IAgentHostFilterEntry | undefined): void {
		if (!this._connectElement) {
			return;
		}

		dom.clearNode(this._connectElement);
		this._connectElement.classList.remove('connected', 'connecting', 'disconnected', 'rediscover', 'hidden');

		let iconId: string;
		let status: string;
		switch (selected?.status) {
			case AgentHostFilterConnectionStatus.Connected:
				iconId = Codicon.debugConnected.id;
				status = localize('agentHostFilter.status.connected', "Connected");
				this._connectElement.classList.add('connected');
				break;
			case AgentHostFilterConnectionStatus.Connecting:
				iconId = Codicon.debugConnected.id;
				status = localize('agentHostFilter.status.connecting', "Connecting");
				this._connectElement.classList.add('connecting');
				break;
			case AgentHostFilterConnectionStatus.Disconnected:
				iconId = Codicon.debugDisconnect.id;
				status = localize('agentHostFilter.status.disconnected', "Disconnected");
				this._connectElement.classList.add('disconnected');
				break;
			default:
				this._connectElement.classList.add('hidden');
				this._updateDiagnosticsLabel();
				return;
		}
		this._connectElement.append(...renderLabelWithIcons(`$(${iconId})`));
		this._updateDiagnosticsLabel(status);
	}

	private _updateDiagnosticsLabel(status?: string): void {
		if (!this._diagnosticsElement) {
			if (status && this._dropdownElement) {
				this._dropdownElement.setAttribute('aria-label', localize('agentHostFilter.aria.withStatus', "{0} Current host status: {1}.", this._dropdownElement.getAttribute('aria-label') ?? '', status));
			}
			return;
		}
		const label = status
			? localize('agentHostFilter.connectionInformationWithStatus', "Open Connection Information. Current host status: {0}.", status)
			: localize('agentHostFilter.connectionInformation', "Open Connection Information");
		this._diagnosticsElement.setAttribute('aria-label', label);
		this._diagnosticsHover.value = this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this._diagnosticsElement, () => label);
	}

	protected _showMenu(e: Event): void {
		if (!this._dropdownElement) {
			return;
		}

		// Nothing to switch between: the pill re-runs discovery rather than
		// opening a menu. Fire rediscover() unless one is already in flight.
		if (this._retriesOnClick()) {
			if (!this._filterService.isDiscovering) {
				this._filterService.rediscover();
			}
			return;
		}
		const hosts = this._filterService.hosts;
		if (hosts.length <= 1) {
			return;
		}

		const selectedId = this._filterService.selectedHostId;

		const actions: IAction[] = [];
		for (const host of hosts) {
			// Connection state is only meaningful where the user drives it.
			const label = !host.connectable || host.status === AgentHostFilterConnectionStatus.Connected
				? host.label
				: host.status === AgentHostFilterConnectionStatus.Connecting
					? localize('agentHostFilter.hostConnecting', "{0} (connecting…)", host.label)
					: localize('agentHostFilter.hostDisconnected', "{0} (disconnected)", host.label);
			actions.push(new Action(
				`agentHostFilter.host.${host.id}`,
				label,
				selectedId === host.id ? 'codicon codicon-check' : undefined,
				true,
				async () => this._filterService.setSelectedHostId(host.id),
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
