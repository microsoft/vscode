/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileHostPickerSheet.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IMobileContentSheetApi, isMobilePickerSheetTarget, showMobileContentSheet } from '../../../../../workbench/contrib/sessions/browser/mobile/mobilePickerSheet.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../workbench/contrib/sessions/common/agentHostFilter.js';
import { isImplicitlyConnectedHost } from './mobileAgentHostFilterService.js';
import { ShowConnectionDiagnosticsCommandId } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/connectionDiagnostics.js';
import { RemoteAgentHostCommandIds } from '../../../../../workbench/contrib/sessions/providers/remoteAgentHost/browser/remoteAgentHostCommandIds.js';

const $ = dom.$;

/**
 * Give focus back to whatever opened a sheet once it is gone, unless something
 * else (the next sheet, a quick pick) has taken focus in the meantime.
 */
function restoreFocus(opener: Element | null): void {
	const active = dom.getActiveElement();
	if ((!active || active === active.ownerDocument.body) && dom.isHTMLElement(opener) && opener.isConnected) {
		opener.focus();
	}
}

/** Status words for a computer the user connects to, as shown under its name. */
export function describeComputerStatus(status: AgentHostFilterConnectionStatus): string {
	switch (status) {
		case AgentHostFilterConnectionStatus.Connected:
			return localize('hostPicker.status.connected', "Connected");
		case AgentHostFilterConnectionStatus.Connecting:
			return localize('hostPicker.status.connecting', "Connecting…");
		case AgentHostFilterConnectionStatus.Disconnected:
		default:
			return localize('hostPicker.status.offline', "Offline");
	}
}

/**
 * Phone sheet for choosing where sessions are listed and started.
 *
 * Places that need no connection from the user (Cloud) come first and carry
 * no status. The user's own computers follow under their own heading with
 * their connection state in words, and the section always ends in a way to
 * add another computer, so self-hosting stays discoverable without being the
 * default. Opened from the drawer header row and from the title bar pill.
 */
export class MobileHostPickerSheet extends Disposable {

	private _api: IMobileContentSheetApi | undefined;
	/** What had focus when the sheet opened; focus returns there once every sheet is gone. */
	private _opener: Element | null = null;

	constructor(
		@IAgentHostFilterService private readonly _filterService: IAgentHostFilterService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILayoutService private readonly _layoutService: ILayoutService,
	) {
		super();
	}

	get isOpen(): boolean {
		return this._api !== undefined;
	}

	override dispose(): void {
		this._api?.close();
		super.dispose();
	}

	show(): void {
		if (this._api) {
			return;
		}
		// Remember what to hand focus back to, unless focus is still inside a
		// sheet that is on its way out (reopened within its close animation).
		const active = dom.getActiveElement();
		if (!(dom.isHTMLElement(active) && isMobilePickerSheetTarget(active))) {
			this._opener = active;
		}
		void showMobileContentSheet(this._layoutService.mainContainer, localize('hostPicker.title', "Where sessions run"), (body, api) => {
			this._api = api;
			const store = new DisposableStore();
			store.add({ dispose: () => { if (this._api === api) { this._api = undefined; } } });
			api.overlay.classList.add('host-picker-overlay');

			// Static frame: places above, the computers section header (with
			// its Refresh action) in the middle, computers below. Only the two
			// lists are rebuilt on updates, so focus on Refresh survives them.
			const placesList = dom.append(body, $('div.host-picker-places'));
			const section = dom.append(body, $('div.host-picker-section'));
			dom.append(section, $('span.host-picker-section-title')).textContent = localize('hostPicker.yourComputers', "Your computers");
			const refresh = this._renderRefreshAction(section, store);
			const computersList = dom.append(body, $('div.host-picker-computers'));

			const bodyStore = store.add(new DisposableStore());
			const rowsById = new Map<string, HTMLElement>();
			let focusTargets: HTMLElement[] = [];
			const render = () => {
				const focusedId = [...rowsById].find(([, row]) => row === dom.getActiveElement())?.[0];
				bodyStore.clear();
				dom.clearNode(placesList);
				dom.clearNode(computersList);
				rowsById.clear();
				const placeRows = this._renderPlaces(placesList, api, bodyStore, rowsById);
				const computerRows = this._renderComputers(computersList, api, bodyStore, rowsById);
				focusTargets = [...placeRows, refresh, ...computerRows];
				api.setBodyFocusTargets(focusTargets);
				if (focusedId !== undefined) {
					(rowsById.get(focusedId) ?? defaultFocus()).focus();
				}
			};
			// The selected place, else the first one, else Refresh.
			const defaultFocus = () => rowsById.get(this._filterService.selectedHostId ?? '') ?? rowsById.values().next().value ?? refresh;
			render();
			store.add(this._filterService.onDidChange(render));
			store.add(this._filterService.onDidChangeDiscovering(render));
			defaultFocus().focus();
			return store;
		}, {
			iconClose: true,
			trapFocus: true,
			headerActions: [{ id: 'information', label: localize('hostPicker.information', "Connection Information"), icon: Codicon.info }],
			onHeaderAction: () => {
				this._api?.close();
				void this._commandService.executeCommand(ShowConnectionDiagnosticsCommandId);
			},
		}).then(() => restoreFocus(this._opener));
	}

	private _renderPlaces(list: HTMLElement, api: IMobileContentSheetApi, store: DisposableStore, rowsById: Map<string, HTMLElement>): HTMLElement[] {
		const selectedId = this._filterService.selectedHostId;
		const rows: HTMLElement[] = [];
		for (const place of this._filterService.hosts.filter(isImplicitlyConnectedHost)) {
			const row = this._renderPlaceRow(list, store, place, place.id === selectedId, () => {
				this._filterService.setSelectedHostId(place.id);
				api.close();
			});
			rowsById.set(place.id, row);
			rows.push(row);
		}
		return rows;
	}

	private _renderComputers(list: HTMLElement, api: IMobileContentSheetApi, store: DisposableStore, rowsById: Map<string, HTMLElement>): HTMLElement[] {
		const selectedId = this._filterService.selectedHostId;
		const computers = this._filterService.hosts.filter(host => !isImplicitlyConnectedHost(host));
		const canAddComputers = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true;
		const rows: HTMLElement[] = [];

		if (computers.length === 0 && !canAddComputers) {
			dom.append(list, $('p.host-picker-empty')).textContent = this._filterService.isDiscovering
				? localize('hostPicker.searching', "Searching for your computers…")
				: localize('hostPicker.noComputersFound', "No computers found yet.");
		}

		for (const computer of computers) {
			const row = this._renderComputerRow(list, store, computer, computer.id === selectedId, () => {
				this._filterService.setSelectedHostId(computer.id);
				if (computer.status === AgentHostFilterConnectionStatus.Disconnected) {
					void this._filterService.reconnect(computer.id);
				}
				api.close();
			});
			rowsById.set(computer.id, row);
			rows.push(row);
		}

		if (canAddComputers) {
			rows.push(this._renderRow(list, store, {
				icon: Codicon.add,
				iconClass: 'add',
				label: localize('hostPicker.addComputer', "Add a computer…"),
				navigates: true,
			}, () => {
				api.close();
				this._showAddComputer();
			}));
		}
		return rows;
	}

	private _renderPlaceRow(body: HTMLElement, store: DisposableStore, place: IAgentHostFilterEntry, checked: boolean, select: () => void): HTMLElement {
		return this._renderRow(body, store, {
			icon: place.icon,
			iconClass: 'place',
			label: place.label,
			description: place.description,
			checked,
			ariaLabel: place.description
				? localize('hostPicker.place.aria', "{0}, {1}", place.label, place.description)
				: place.label,
		}, select);
	}

	private _renderComputerRow(body: HTMLElement, store: DisposableStore, computer: IAgentHostFilterEntry, checked: boolean, select: () => void): HTMLElement {
		const status = describeComputerStatus(computer.status);
		const offline = computer.status === AgentHostFilterConnectionStatus.Disconnected;
		return this._renderRow(body, store, {
			icon: Codicon.vm,
			iconClass: 'computer',
			label: computer.label,
			description: offline
				? localize('hostPicker.offlineReconnect', "{0} · Tap to reconnect", status)
				: status,
			statusClass: computer.status,
			checked,
			ariaLabel: offline
				? localize('hostPicker.computer.offline.aria', "{0}, offline. Select to reconnect.", computer.label)
				: localize('hostPicker.computer.aria', "{0}, {1}", computer.label, status),
		}, select);
	}

	private _renderRow(body: HTMLElement, store: DisposableStore, row: {
		readonly icon: ThemeIcon;
		readonly iconClass: string;
		readonly label: string;
		readonly description?: string;
		readonly statusClass?: string;
		readonly checked?: boolean;
		readonly navigates?: boolean;
		readonly ariaLabel?: string;
	}, select: () => void): HTMLElement {
		const button = dom.append(body, $('button.host-picker-row.agent-sessions-interactive.agent-sessions-interactive-list', { type: 'button' })) as HTMLButtonElement;
		button.classList.toggle('checked', row.checked === true);
		button.classList.toggle('navigates', row.navigates === true);
		// Rows with a `checked` state are one choice among several; the rest
		// (drill-downs, one-shot actions) are plain buttons.
		if (row.checked !== undefined) {
			button.setAttribute('role', 'menuitemradio');
			button.setAttribute('aria-checked', String(row.checked));
		}
		button.setAttribute('aria-label', row.ariaLabel ?? row.label);

		const icon = dom.append(button, $(`span.host-picker-row-icon.${row.iconClass}`));
		icon.append(...renderLabelWithIcons(`$(${row.icon.id})`));

		const text = dom.append(button, $('span.host-picker-row-text'));
		dom.append(text, $('span.host-picker-row-label')).textContent = row.label;
		if (row.description) {
			const description = dom.append(text, $('span.host-picker-row-description'));
			if (row.statusClass) {
				dom.append(description, $(`span.host-picker-status-dot.${row.statusClass}`));
			}
			dom.append(description, $('span')).textContent = row.description;
		}

		if (row.navigates) {
			dom.append(button, $('span.host-picker-row-chevron')).append(...renderLabelWithIcons(`$(${Codicon.chevronRight.id})`));
		} else if (row.checked) {
			dom.append(button, $('span.host-picker-row-check')).append(...renderLabelWithIcons(`$(${Codicon.check.id})`));
		}

		store.add(Gesture.addTarget(button));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			store.add(dom.addDisposableListener(button, eventType, e => {
				dom.EventHelper.stop(e, true);
				select();
			}));
		}
		return button;
	}

	private _renderRefreshAction(section: HTMLElement, store: DisposableStore): HTMLButtonElement {
		const action = dom.append(section, $('button.host-picker-section-action.agent-sessions-interactive', { type: 'button' })) as HTMLButtonElement;
		const icon = dom.append(action, $('span.host-picker-section-action-icon'));
		icon.append(...renderLabelWithIcons(`$(${Codicon.refresh.id})`));
		const label = dom.append(action, $('span'));
		const update = () => {
			const discovering = this._filterService.isDiscovering;
			action.classList.toggle('discovering', discovering);
			action.setAttribute('aria-disabled', String(discovering));
			label.textContent = discovering
				? localize('hostPicker.refreshing', "Searching…")
				: localize('hostPicker.refresh', "Refresh");
			action.setAttribute('aria-label', discovering
				? localize('hostPicker.refreshing.aria', "Searching for your computers")
				: localize('hostPicker.refresh.aria', "Look for your computers again"));
		};
		update();
		store.add(this._filterService.onDidChangeDiscovering(update));
		store.add(Gesture.addTarget(action));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			store.add(dom.addDisposableListener(action, eventType, e => {
				dom.EventHelper.stop(e, true);
				if (!this._filterService.isDiscovering) {
					void this._filterService.rediscover();
				}
			}));
		}
		return action;
	}

	private _showAddComputer(): void {
		void showMobileContentSheet(this._layoutService.mainContainer, localize('hostPicker.add.title', "Add a computer"), (body, api) => {
			const store = new DisposableStore();
			api.overlay.classList.add('host-picker-overlay');
			const hint = dom.append(body, $('p.host-picker-hint', { id: generateUuid() }, localize('hostPicker.add.sharingHint', "Share your computer from VS Code using a Dev Tunnel or GitHub Environment to see it here.")));
			api.sheet.setAttribute('aria-describedby', hint.id);
			const address = this._renderRow(body, store, {
				icon: Codicon.globe,
				iconClass: 'computer',
				label: localize('hostPicker.add.enterAddress', "Enter an address…"),
				navigates: true,
			}, () => {
				api.close();
				void this._commandService.executeCommand(RemoteAgentHostCommandIds.addRemoteAgentHost);
			});
			api.setBodyFocusTargets([address]);
			address.focus();
			return store;
		}, {
			iconClose: true,
			trapFocus: true,
		}).then(() => restoreFocus(this._opener));
	}
}
