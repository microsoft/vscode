/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { HoverStyle, IHoverOptions, IHoverWidget } from '../../../../../base/browser/ui/hover/hover.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITableRenderer } from '../../../../../base/browser/ui/table/table.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { getAgentHostConnectionStatusLabel } from '../../../../common/agentHostSessionsProvider.js';
import { ICustomizationRemote, RemoteKind } from './remotesModel.js';
import { getStatusHover } from './remoteHostOptions.js';

export interface IRemoteEmptyEntry {
	readonly type: 'empty';
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly documentation?: { readonly label: string; readonly href: string };
}

export type RemoteTableEntry =
	| {
		readonly type: 'group';
		readonly id: string;
		readonly kind: RemoteKind;
		readonly label: string;
		readonly count: number;
		readonly collapsed: boolean;
		readonly warning?: string;
	}
	| {
		readonly type: 'remote';
		readonly remote: ICustomizationRemote;
		readonly busy: boolean;
		readonly connecting?: boolean;
	}
	| IRemoteEmptyEntry;

export interface IRemoteTableRow {
	readonly id: string;
	readonly entry: RemoteTableEntry;
}

type RemoteColumn = 'gutter' | 'name' | 'address' | 'connection' | 'actions';
export type RemoteRowAction = 'toggleGroup' | 'configure' | 'connect' | 'rename';

type RemoteCellTemplate = {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	row?: IRemoteTableRow;
} & (
		| { readonly column: 'name'; readonly label: HTMLElement; readonly count: HTMLElement; readonly warning: HTMLElement }
		| { readonly column: 'address'; readonly label: HTMLElement; readonly links: HTMLElement; link?: Link }
		| { readonly column: 'connection'; readonly label: HTMLElement; readonly info: HTMLElement }
		| { readonly column: 'gutter'; readonly action: Action; readonly toolbar: WorkbenchToolBar }
		| { readonly column: 'actions'; readonly action: Action; readonly rename: Action; readonly toolbar: WorkbenchToolBar; hasManagementActions: boolean }
	);

export function getConnectionLabel(remote: ICustomizationRemote, connecting?: boolean): string {
	return connecting === undefined ? getAgentHostConnectionStatusLabel(remote.connectionStatus)
		: connecting ? getAgentHostConnectionStatusLabel(RemoteAgentHostConnectionStatus.connecting) : localize('remotes.disconnecting', "Disconnecting");
}

export class RemotesTableRenderer implements ITableRenderer<IRemoteTableRow, RemoteCellTemplate> {
	readonly templateId: string;
	private readonly templates = new Set<RemoteCellTemplate>();
	private readonly hoverGroupId = generateUuid();
	private focusedId: string | undefined;

	constructor(
		private readonly column: RemoteColumn,
		private readonly onAction: (entry: RemoteTableEntry, action: RemoteRowAction) => void,
		private readonly focusTable: () => void,
		private readonly instantiationService: IInstantiationService,
		private readonly hoverService: IHoverService,
		private readonly openerService: IOpenerService,
	) {
		this.templateId = `remotes.${column}`;
	}

	renderTemplate(container: HTMLElement): RemoteCellTemplate {
		container.classList.add(`remotes-${this.column}-column`);
		const disposables = new DisposableStore();
		const base = { container, disposables, elementDisposables: disposables.add(new DisposableStore()) };
		let template: RemoteCellTemplate;
		switch (this.column) {
			case 'name':
				template = {
					...base, column: this.column,
					label: dom.append(container, dom.$('.remotes-name')),
					count: dom.append(container, dom.$('.remotes-group-count')),
					warning: dom.append(container, dom.$('.remotes-refresh-warning')),
				};
				break;
			case 'address':
				template = {
					...base, column: this.column,
					label: dom.append(container, dom.$('.remotes-detail')),
					links: dom.append(container, dom.$('.remotes-empty-actions')),
				};
				break;
			case 'connection': {
				const label = dom.append(container, dom.$('.remotes-connection-state'));
				const info = dom.append(container, dom.$('.remotes-connection-info', { role: 'img', tabindex: -1 }));
				dom.append(info, renderIcon(Codicon.info)).setAttribute('aria-hidden', 'true');
				template = { ...base, column: this.column, label, info };
				break;
			}
			default: {
				const action = disposables.add(new Action(`remotes.${this.column}`, '', undefined, true, async () => {
					if (template.row && (template.column === 'gutter' || template.column === 'actions')) {
						this.onAction(template.row.entry, template.column === 'gutter' ? 'toggleGroup' : template.row.entry.type === 'group' ? 'configure' : 'connect');
					}
				}));
				const toolbar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, { ariaLabel: localize('remotes.rowActions', "Remote actions") }));
				toolbar.setActions([action]);
				if (this.column === 'gutter') {
					template = { ...base, column: this.column, action, toolbar };
				} else {
					const rename = disposables.add(new Action('remotes.rename', '', ThemeIcon.asClassName(Codicon.edit), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'rename');
						}
					}));
					template = { ...base, column: this.column, action, rename, toolbar, hasManagementActions: false };
				}
				disposables.add(dom.addDisposableGenericMouseDownListener(container, event => dom.EventHelper.stop(event, true)));
				break;
			}
		}
		disposables.add(dom.addDisposableListener(container, dom.EventType.KEY_DOWN, event => {
			if (event.target !== container) {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
					keyboardEvent.stopPropagation();
				}
			}
		}));
		this.templates.add(template);
		return template;
	}

	renderElement(row: IRemoteTableRow, _index: number, template: RemoteCellTemplate): void {
		template.elementDisposables.clear();
		template.row = row;
		const entry = row.entry;
		switch (template.column) {
			case 'name': {
				const rowElement = template.container.parentElement!;
				rowElement.classList.toggle('remotes-group-row', entry.type === 'group');
				rowElement.classList.toggle('remotes-empty-row', entry.type === 'empty');
				if (entry.type === 'remote') {
					rowElement.dataset.remoteId = entry.remote.id;
				} else {
					delete rowElement.dataset.remoteId;
				}
				const listRow = rowElement.parentElement!;
				if (entry.type === 'group') {
					listRow.setAttribute('aria-expanded', String(!entry.collapsed));
				} else {
					listRow.removeAttribute('aria-expanded');
				}
				listRow.setAttribute('aria-busy', String(entry.type === 'remote' && entry.busy));
				template.label.textContent = entry.type === 'remote' ? entry.remote.name : entry.label;
				template.label.classList.toggle('remotes-empty-label', entry.type === 'empty');
				template.count.textContent = entry.type === 'group' ? String(entry.count) : '';
				template.count.hidden = entry.type !== 'group';
				dom.clearNode(template.warning);
				if (entry.type === 'group' && entry.warning) {
					const icon = dom.append(template.warning, renderIcon(Codicon.warning));
					icon.setAttribute('aria-hidden', 'true');
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.warning, { content: entry.warning }));
				}
				template.warning.hidden = !template.warning.hasChildNodes();
				template.elementDisposables.add(this.hoverService.setupDelayedHover(template.label, { content: template.label.textContent }));
				break;
			}
			case 'address': {
				template.label.textContent = entry.type === 'remote' ? entry.remote.detail : entry.type === 'empty' ? entry.description ?? '' : '';
				template.label.classList.toggle('remotes-empty-description', entry.type === 'empty');
				template.elementDisposables.add(this.hoverService.setupDelayedHover(template.label, { content: template.label.textContent }));
				if (entry.type === 'empty' && entry.documentation) {
					if (!template.link) {
						template.link = template.disposables.add(new Link(template.links, { ...entry.documentation, title: entry.documentation.label }, {}, this.hoverService, this.openerService));
					}
					template.link.link = { ...entry.documentation, title: entry.documentation.label };
					template.links.hidden = false;
				} else {
					template.links.hidden = true;
				}
				break;
			}
			case 'connection': {
				template.label.textContent = entry.type === 'remote' ? getConnectionLabel(entry.remote, entry.connecting) : '';
				const explanation = entry.type === 'remote' && entry.connecting === undefined && RemoteAgentHostConnectionStatus.isDisconnected(entry.remote.connectionStatus)
					? entry.remote.unavailableReason : undefined;
				template.info.hidden = !explanation;
				if (explanation) {
					template.info.setAttribute('aria-label', explanation);
					const hover = template.elementDisposables.add(new MutableDisposable<IHoverWidget>());
					// Disposing the hover first restores its keyboard focus to the info icon.
					template.elementDisposables.add(toDisposable(() => {
						if (dom.isAncestorOfActiveElement(template.info)) {
							this.focusTable();
						}
					}));
					const options: IHoverOptions = {
						id: generateUuid(), target: template.info,
						content: explanation, style: HoverStyle.Pointer, trapFocus: true,
					};
					template.elementDisposables.add(dom.addDisposableListener(template.info, dom.EventType.MOUSE_OVER, () => {
						const widget = this.hoverService.showDelayedHover(options, { groupId: this.hoverGroupId });
						if (widget) {
							hover.value = widget;
						}
					}));
					template.elementDisposables.add(dom.addDisposableListener(template.info, dom.EventType.KEY_DOWN, event => {
						const keyboardEvent = new StandardKeyboardEvent(event);
						if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
							keyboardEvent.preventDefault();
							keyboardEvent.stopPropagation();
							hover.clear();
							hover.value = this.hoverService.showInstantHover(options, true);
						}
					}));
				} else {
					template.info.removeAttribute('aria-label');
				}
				if (entry.type === 'remote') {
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.label, {
						content: entry.connecting === undefined ? entry.remote.unavailableReason ?? getStatusHover(entry.remote.connectionStatus) : template.label.textContent,
					}, { groupId: this.hoverGroupId }));
				}
				break;
			}
			case 'gutter':
			case 'actions': {
				const showCollapse = template.column === 'gutter' && entry.type === 'group';
				const showConfig = template.column === 'actions' && entry.type === 'group' && (entry.kind === 'ssh' || entry.kind === 'tunnel' || entry.kind === 'environment');
				const showConnection = template.column === 'actions' && entry.type === 'remote';
				if (template.column === 'actions' && template.hasManagementActions !== showConnection) {
					template.hasManagementActions = showConnection;
					template.toolbar.setActions(showConnection ? [template.action, template.rename] : [template.action]);
				}
				template.container.classList.toggle('remotes-cell-action-hidden', !showCollapse && !showConfig && !showConnection);
				template.action.enabled = true;
				template.action.tooltip = '';
				if (showCollapse) {
					template.action.label = entry.collapsed ? localize('remotes.expandGroup', "Expand {0}", entry.label) : localize('remotes.collapseGroup', "Collapse {0}", entry.label);
					template.action.class = ThemeIcon.asClassName(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown);
				} else if (showConfig) {
					template.action.label = entry.kind === 'ssh' ? localize('remotes.openSSHConfig', "Open SSH Configuration")
						: entry.kind === 'environment' ? localize('remotes.openEnvironmentSettings', "Open Environment Settings")
							: localize('remotes.openTunnelSettings', "Open Tunnel Settings");
					template.action.class = ThemeIcon.asClassName(Codicon.settingsGear);
				} else if (showConnection) {
					const connected = RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus);
					template.action.label = connected ? localize('remotes.disconnect', "Disconnect {0}", entry.remote.name) : localize('remotes.connect', "Connect to {0}", entry.remote.name);
					template.action.class = ThemeIcon.asClassName(connected ? Codicon.debugDisconnect : Codicon.debugConnected);
					template.action.enabled = !entry.busy && (connected || !entry.remote.unavailableReason)
						&& !RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
						&& !RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus);
					template.action.tooltip = !connected && entry.remote.unavailableReason
						? localize('remotes.connectUnavailable', "Connect to {0}: {1}", entry.remote.name, entry.remote.unavailableReason) : template.action.label;
					template.rename.label = localize('remotes.rename', "Rename {0}...", entry.remote.name);
					template.rename.enabled = !entry.busy;
				}
				break;
			}
		}
		this.updateFocus(template);
	}

	setFocusedId(id: string | undefined): void {
		this.focusedId = id;
		for (const template of this.templates) {
			this.updateFocus(template);
		}
	}

	private updateFocus(template: RemoteCellTemplate): void {
		const focused = template.row?.id === this.focusedId;
		if (template.column === 'gutter' || template.column === 'actions') {
			template.toolbar.setFocusable(focused && !template.container.classList.contains('remotes-cell-action-hidden'));
		} else if (template.column === 'address' && template.link && template.row?.entry.type === 'empty' && template.row.entry.documentation) {
			template.link.link = { ...template.row.entry.documentation, title: template.row.entry.documentation.label, tabIndex: focused && !template.links.hidden ? 0 : -1 };
		} else if (template.column === 'connection') {
			template.info.tabIndex = focused && !template.info.hidden ? 0 : -1;
		}
	}

	disposeElement(_row: IRemoteTableRow, _index: number, template: RemoteCellTemplate): void {
		template.elementDisposables.clear();
		template.row = undefined;
	}

	disposeTemplate(template: RemoteCellTemplate): void {
		this.templates.delete(template);
		template.disposables.dispose();
	}
}
