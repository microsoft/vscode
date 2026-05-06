/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../common/agentHostFilter.js';
import { HostFilterActionViewItem } from './hostFilterActionViewItem.js';
import './media/hostPickerSheet.css';

const $ = dom.$;

/**
 * Mobile variant of {@link HostFilterActionViewItem}.
 *
 * On phone-sized layouts the host picker is rendered as a bottom sheet
 * that slides up from the bottom of the viewport. The sheet is always
 * tappable (even when no hosts are known) and always exposes a
 * "Re-discover hosts" action so the user can retry discovery without
 * leaving the home screen.
 */
export class MobileHostFilterActionViewItem extends HostFilterActionViewItem {

	private readonly _sheet = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: IAction,
		@IAgentHostFilterService filterService: IAgentHostFilterService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
	) {
		super(action, 'titlebar', filterService, contextMenuService, hoverService);
	}

	/**
	 * Always interactive on mobile — even with zero hosts the sheet
	 * shows an empty state and the always-visible "Re-discover hosts"
	 * action. This is the primary entry point for retrying discovery
	 * when no hosts have been found yet.
	 */
	protected override _isInteractive(): boolean {
		return true;
	}

	protected override _showMenu(_e: Event): void {
		if (!this.element) {
			return;
		}

		this._showSheet();
	}

	private _showSheet(): void {
		this._sheet.clear();

		const disposables = new DisposableStore();
		this._sheet.value = disposables;

		const targetWindow = dom.getWindow(this.element);
		const targetDocument = targetWindow.document;

		// Append inside the workbench container so CSS theme variables are
		// inherited. The workbench element sets all --vscode-* custom
		// properties; rendering outside it leaves them undefined.
		const workbenchContainer = dom.findParentWithClass(this.element!, 'monaco-workbench')
			?? targetDocument.body;

		// --- Overlay shell ----------------------------------------------------
		const overlay = dom.append(workbenchContainer, $('div.host-picker-sheet-overlay'));
		const backdrop = dom.append(overlay, $('div.host-picker-sheet-backdrop'));
		const sheet = dom.append(overlay, $('div.host-picker-sheet'));
		sheet.setAttribute('role', 'dialog');
		sheet.setAttribute('aria-modal', 'true');
		sheet.setAttribute('aria-label', localize('agentHostFilter.sheet.aria', "Hosts"));

		let dismissing = false;
		const finish = () => {
			if (dismissing) {
				return;
			}
			dismissing = true;
			sheet.classList.add('closing');
			backdrop.classList.add('closing');
			const close = () => {
				if (this._sheet.value === disposables) {
					this._sheet.clear();
				}
			};
			sheet.addEventListener('animationend', close, { once: true });
			const fallback = setTimeout(close, 220);
			disposables.add({ dispose: () => clearTimeout(fallback) });
		};

		disposables.add({ dispose: () => overlay.remove() });

		// --- Header (drag-handle + title + close) ----------------------------
		dom.append(sheet, $('div.host-picker-sheet-handle'));
		const header = dom.append(sheet, $('div.host-picker-sheet-header'));
		dom.append(header, $('div.host-picker-sheet-title')).textContent = localize('agentHostFilter.sheet.title', "Hosts");
		const closeBtn = dom.append(header, $('button.host-picker-sheet-close', { type: 'button' })) as HTMLButtonElement;
		closeBtn.setAttribute('aria-label', localize('agentHostFilter.sheet.close', "Close"));
		dom.append(closeBtn, $('span.codicon.codicon-close'));
		disposables.add(Gesture.addTarget(closeBtn));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			disposables.add(dom.addDisposableListener(closeBtn, eventType, e => {
				dom.EventHelper.stop(e, true);
				finish();
			}));
		}

		// --- Subtitle --------------------------------------------------------
		dom.append(sheet, $('div.host-picker-sheet-subtitle')).textContent =
			localize('agentHostFilter.sheet.subtitle',
				"Sessions are scoped to a host. Switching hosts shows that machine's sessions and runs new sessions there.");

		// --- Body (host list or empty state) --------------------------------
		const body = dom.append(sheet, $('div.host-picker-sheet-body'));
		// Sub-store for the host list rows so we can rebuild the list
		// in-place when discovery surfaces new hosts without leaking the
		// original rows' gesture/click listeners.
		const bodyDisposables = disposables.add(new DisposableStore());
		// Mutable focus targets: populated as rows are rendered so that the
		// initial focus pass can pick the most relevant element without
		// querying the DOM by selector.
		const focusRefs: { firstHost?: HTMLButtonElement; firstCheckedHost?: HTMLButtonElement; rediscover?: HTMLButtonElement } = {};
		const renderBody = () => {
			bodyDisposables.clear();
			dom.clearNode(body);
			focusRefs.firstHost = undefined;
			focusRefs.firstCheckedHost = undefined;
			this._renderHostList(bodyDisposables, body, finish, focusRefs);
		};
		renderBody();
		disposables.add(this._filterService.onDidChange(renderBody));
		// Also re-render when discovery starts/stops so the empty-state copy
		// transitions between "Searching..." and "No hosts found yet." in
		// response to the always-visible re-discover footer action.
		disposables.add(this._filterService.onDidChangeDiscovering(renderBody));

		// --- Footer (always-visible re-discover action) ---------------------
		const footer = dom.append(sheet, $('div.host-picker-sheet-footer'));
		focusRefs.rediscover = this._renderRediscoverAction(disposables, footer);

		// Block taps on the sheet body itself from dismissing.
		disposables.add(dom.addDisposableListener(sheet, dom.EventType.CLICK, e => e.stopPropagation()));
		disposables.add(Gesture.addTarget(sheet));
		disposables.add(dom.addDisposableListener(sheet, TouchEventType.Tap, e => dom.EventHelper.stop(e, true)));

		// --- Dismissal: backdrop tap + Escape -------------------------------
		disposables.add(Gesture.addTarget(backdrop));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			disposables.add(dom.addDisposableListener(backdrop, eventType, e => {
				dom.EventHelper.stop(e, true);
				finish();
			}));
		}
		disposables.add(dom.addDisposableListener(targetDocument, dom.EventType.KEY_DOWN, e => {
			if (new StandardKeyboardEvent(e).equals(KeyCode.Escape)) {
				dom.EventHelper.stop(e, true);
				finish();
			}
		}));

		// Focus the currently selected host when the sheet opens.
		focusRefs.firstCheckedHost?.focus();
	}

	private _renderHostList(disposables: DisposableStore, body: HTMLElement, finish: () => void, focusRefs: { firstHost?: HTMLButtonElement; firstCheckedHost?: HTMLButtonElement }): void {
		const hosts = this._filterService.hosts;
		const selectedId = this._filterService.selectedProviderId;

		if (hosts.length === 0) {
			const empty = dom.append(body, $('div.host-picker-sheet-empty'));
			empty.textContent = this._filterService.isDiscovering
				? localize('agentHostFilter.sheet.searching', "Searching for hosts…")
				: localize('agentHostFilter.sheet.empty', "No hosts found yet.");
			return;
		}

		dom.append(body, $('div.host-picker-sheet-section-title')).textContent =
			localize('agentHostFilter.sheet.available', "Available");

		for (const host of hosts) {
			const row = this._renderHostItem(disposables, body, host, selectedId === host.providerId, finish);
			focusRefs.firstHost ??= row;
			if (selectedId === host.providerId) {
				focusRefs.firstCheckedHost ??= row;
			}
		}
	}

	private _renderHostItem(disposables: DisposableStore, body: HTMLElement, host: IAgentHostFilterEntry, checked: boolean, finish: () => void): HTMLButtonElement {
		const row = dom.append(body, $('button.host-picker-sheet-item', { type: 'button' })) as HTMLButtonElement;
		row.setAttribute('role', 'menuitemradio');
		row.setAttribute('aria-checked', String(checked));
		if (checked) {
			row.classList.add('checked');
		}

		// Icon + small status dot in the bottom-right.
		const iconWrap = dom.append(row, $('span.host-picker-sheet-item-icon'));
		iconWrap.append(...renderLabelWithIcons(`$(${Codicon.remote.id})`));
		const status = dom.append(iconWrap, $('span.host-picker-sheet-item-status'));
		switch (host.status) {
			case AgentHostFilterConnectionStatus.Connected:
				status.classList.add('connected');
				break;
			case AgentHostFilterConnectionStatus.Connecting:
				status.classList.add('connecting');
				break;
		}

		// Name + status sub-line.
		const text = dom.append(row, $('span.host-picker-sheet-item-text'));
		dom.append(text, $('span.host-picker-sheet-item-name')).textContent = host.label;
		dom.append(text, $('span.host-picker-sheet-item-sub')).textContent = this._statusLabel(host.status);

		if (checked) {
			const check = dom.append(row, $('span.host-picker-sheet-item-check'));
			check.append(...renderLabelWithIcons(`$(${Codicon.check.id})`));
		}

		const select = (e?: Event) => {
			if (e) {
				dom.EventHelper.stop(e, true);
			}
			this._filterService.setSelectedProviderId(host.providerId);
			finish();
		};

		disposables.add(Gesture.addTarget(row));
		disposables.add(dom.addDisposableListener(row, dom.EventType.CLICK, e => select(e)));
		disposables.add(dom.addDisposableListener(row, TouchEventType.Tap, e => select(e)));
		return row;
	}

	private _statusLabel(status: AgentHostFilterConnectionStatus): string {
		switch (status) {
			case AgentHostFilterConnectionStatus.Connected:
				return localize('agentHostFilter.sheet.status.connected', "Connected");
			case AgentHostFilterConnectionStatus.Connecting:
				return localize('agentHostFilter.sheet.status.connecting', "Connecting…");
			case AgentHostFilterConnectionStatus.Disconnected:
			default:
				return localize('agentHostFilter.sheet.status.disconnected', "Disconnected");
		}
	}

	private _renderRediscoverAction(disposables: DisposableStore, footer: HTMLElement): HTMLButtonElement {
		const action = dom.append(footer, $('button.host-picker-sheet-action', { type: 'button' })) as HTMLButtonElement;
		action.setAttribute('role', 'menuitem');
		action.setAttribute('aria-label', localize('agentHostFilter.sheet.rediscover.aria', "Re-discover hosts"));

		const iconSpan = dom.append(action, $('span.host-picker-sheet-action-icon'));
		iconSpan.append(...renderLabelWithIcons(`$(${Codicon.refresh.id})`));

		const labelSpan = dom.append(action, $('span'));

		const update = () => {
			const discovering = this._filterService.isDiscovering;
			action.classList.toggle('discovering', discovering);
			action.setAttribute('aria-disabled', String(discovering));
			labelSpan.textContent = discovering
				? localize('agentHostFilter.sheet.rediscovering', "Searching…")
				: localize('agentHostFilter.sheet.rediscover', "Re-discover hosts");
		};
		update();
		disposables.add(this._filterService.onDidChangeDiscovering(update));

		const trigger = (e?: Event) => {
			if (e) {
				dom.EventHelper.stop(e, true);
			}
			if (this._filterService.isDiscovering) {
				return;
			}
			this._filterService.rediscover();
		};

		disposables.add(Gesture.addTarget(action));
		disposables.add(dom.addDisposableListener(action, dom.EventType.CLICK, e => trigger(e)));
		disposables.add(dom.addDisposableListener(action, TouchEventType.Tap, e => trigger(e)));
		return action;
	}
}
