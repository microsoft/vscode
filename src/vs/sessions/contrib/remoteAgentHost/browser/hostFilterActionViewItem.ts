/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/hostFilter.css';
import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
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
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../common/agentHostFilter.js';

/**
 * Compound titlebar widget shown next to the toggle sidebar button in the
 * Agent Sessions window. It fills the remaining left-toolbar width (which
 * matches the sidebar width) and renders two controls side-by-side:
 *
 *  - Left: a dropdown pill indicating the currently selected host; clicking
 *    opens a context menu to pick a different host. When only a single
 *    host is available the pill renders as a static label (no chevron,
 *    no click target).
 *  - Right: a connection-status button for the selected host:
 *      • Connected    → green `debug-connected` (non-interactive)
 *      • Connecting   → `debug-connected` pulsing, non-interactive
 *      • Connected   → clickable `debug-disconnect`; click tears down the connection\n *      • Connecting  → pulsing `debug-disconnect`; click cancels the attempt\n *      • Disconnected → clickable `debug-connected`; click triggers a fresh connect
 */
export class HostFilterActionViewItem extends BaseActionViewItem {

	private _dropdownElement: HTMLElement | undefined;
	private _labelElement: HTMLElement | undefined;
	private _chevronElement: HTMLElement | undefined;
	private _connectElement: HTMLElement | undefined;

	private readonly _dropdownHover = this._register(new MutableDisposable());
	private readonly _connectHover = this._register(new MutableDisposable());

	constructor(
		action: IAction,
		@IAgentHostFilterService protected readonly _filterService: IAgentHostFilterService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super(undefined, action);

		this._register(this._filterService.onDidChange(() => this._update()));
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		this.element.classList.add('agent-host-filter-combo');

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

		this._register(Gesture.addTarget(this._connectElement));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._register(dom.addDisposableListener(this._connectElement, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._onConnectClick();
			}));
		}
		this._register(dom.addDisposableListener(this._connectElement, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
				dom.EventHelper.stop(e, true);
				this._onConnectClick();
			}
		}));

		this._update();
	}

	private _isInteractive(): boolean {
		return this._filterService.hosts.length > 1;
	}

	private _update(): void {
		if (!this.element || !this._dropdownElement || !this._labelElement || !this._chevronElement || !this._connectElement) {
			return;
		}

		const hosts = this._filterService.hosts;
		const selectedId = this._filterService.selectedProviderId;
		const selected = selectedId === undefined
			? undefined
			: hosts.find(h => h.providerId === selectedId);

		const interactive = hosts.length > 1;

		// Dropdown label + aria
		const text = selected ? selected.label : localize('agentHostFilter.none', "No Host");
		this._labelElement.textContent = text;

		this.element.classList.toggle('single-host', !interactive);

		if (interactive) {
			this._dropdownElement.tabIndex = 0;
			this._dropdownElement.role = 'button';
			this._dropdownElement.setAttribute('aria-haspopup', 'menu');
			this._dropdownElement.setAttribute('aria-label', selected
				? localize('agentHostFilter.aria.selected', "Sessions scoped to host {0}. Click to change host.", selected.label)
				: localize('agentHostFilter.aria.none', "No agent host selected."));
			this._dropdownHover.value = this._hoverService.setupManagedHover(
				getDefaultHoverDelegate('element'),
				this._dropdownElement,
				() => localize('agentHostFilter.hover', "Change the host the sessions list is scoped to"),
			);
		} else {
			this._dropdownElement.removeAttribute('tabindex');
			this._dropdownElement.removeAttribute('role');
			this._dropdownElement.removeAttribute('aria-haspopup');
			this._dropdownElement.setAttribute('aria-label', selected
				? localize('agentHostFilter.aria.singleSelected', "Sessions scoped to host {0}", selected.label)
				: localize('agentHostFilter.aria.none', "No agent host selected."));
			this._dropdownHover.clear();
		}

		this._updateConnectButton(selected);
	}

	private _updateConnectButton(selected: IAgentHostFilterEntry | undefined): void {
		if (!this._connectElement) {
			return;
		}

		dom.clearNode(this._connectElement);
		this._connectElement.classList.remove('connected', 'connecting', 'disconnected', 'hidden');
		this._connectHover.clear();

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

	protected _showMenu(e: MouseEvent | KeyboardEvent): void {
		if (!this._dropdownElement) {
			return;
		}

		const hosts = this._filterService.hosts;
		if (hosts.length <= 1) {
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
