/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITableRenderer } from '../../../../../base/browser/ui/table/table.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
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
	readonly action?: { readonly label: string; readonly enabled: boolean };
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
		readonly refreshing: boolean;
		readonly warning?: string;
		readonly documentation?: IRemoteEmptyEntry['documentation'];
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

type RemoteColumn = 'gutter' | 'name' | 'connection' | 'actions';
export type RemoteRowAction = 'toggleGroup' | 'toggleVisibility' | 'configure' | 'documentation' | 'connect' | 'rename' | 'copyAddress' | 'locationPreference' | 'updateServer' | 'delete' | 'signIn';

type RemoteCellTemplate = {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	row?: IRemoteTableRow;
} & (
		| { readonly column: 'name'; readonly label: HTMLElement; readonly count: HTMLElement; readonly progress: HTMLElement; readonly warning: HTMLElement; readonly description: HTMLElement; readonly links: HTMLElement; readonly actionContainer: HTMLElement; actionLink?: Link; actionProgress?: HTMLElement; link?: Link }
		| { readonly column: 'connection'; readonly label: HTMLElement; readonly warning: HTMLElement }
		| { readonly column: 'gutter'; readonly action: Action; readonly toolbar: WorkbenchToolBar }
		| { readonly column: 'actions'; readonly action: Action; readonly rename: Action; readonly copyAddress: Action; readonly locationPreference: Action; readonly updateServer: Action; readonly delete: Action; readonly documentation: Action; readonly toolbar: WorkbenchToolBar; actionLayout: string }
	);

export function getConnectionLabel(remote: ICustomizationRemote, connecting?: boolean): string {
	return connecting === undefined ? remote.kind === 'environment' && remote.unavailableReason && RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus)
		? localize('remotes.offline', "Offline") : getAgentHostConnectionStatusLabel(remote.connectionStatus)
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
		private readonly actionHoverDelegate: IHoverDelegate,
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
			case 'name': {
				const content = dom.append(container, dom.$('.remotes-name-content'));
				const nameRow = dom.append(content, dom.$('.remotes-name-row'));
				const description = dom.append(content, dom.$('.remotes-empty-description'));
				const actionContainer = dom.append(content, dom.$('.remotes-empty-signin'));
				template = {
					...base, column: this.column,
					label: dom.append(nameRow, dom.$('.remotes-name')),
					count: dom.append(nameRow, dom.$('.remotes-group-count')),
					progress: dom.append(nameRow, dom.$('.remotes-group-progress', { 'aria-hidden': 'true' })),
					warning: dom.append(nameRow, dom.$('.remotes-refresh-warning')),
					description, actionContainer,
					links: dom.append(content, dom.$('.remotes-empty-actions')),
				};
				dom.append(template.progress, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
				break;
			}
			case 'connection': {
				const label = dom.append(container, dom.$('.remotes-connection-state'));
				const warning = dom.append(container, dom.$('.remotes-connection-warning'));
				dom.append(warning, renderIcon(Codicon.warning)).setAttribute('aria-hidden', 'true');
				template = { ...base, column: this.column, label, warning };
				break;
			}
			default: {
				const action = disposables.add(new Action(`remotes.${this.column}`, '', undefined, true, async () => {
					if (template.row && (template.column === 'gutter' || template.column === 'actions')) {
						this.onAction(template.row.entry, template.column === 'gutter'
							? template.row.entry.type === 'group' ? 'toggleGroup' : 'toggleVisibility'
							: template.row.entry.type === 'group' ? 'configure' : 'connect');
					}
				}));
				const toolbar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, {
					ariaLabel: localize('remotes.rowActions', "Remote actions"), hoverDelegate: this.actionHoverDelegate,
				}));
				toolbar.setActions([action]);
				if (this.column === 'gutter') {
					template = { ...base, column: this.column, action, toolbar };
				} else {
					const rename = disposables.add(new Action('remotes.rename', '', ThemeIcon.asClassName(Codicon.edit), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'rename');
						}
					}));
					const documentation = disposables.add(new Action('remotes.documentation', '', ThemeIcon.asClassName(Codicon.info), true, async () => {
						if (template.row?.entry.type === 'group') {
							this.onAction(template.row.entry, 'documentation');
						}
					}));
					const deleteAction = disposables.add(new Action('remotes.delete', '', ThemeIcon.asClassName(Codicon.trash), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'delete');
						}
					}));
					const copyAddress = disposables.add(new Action('remotes.copyAddress', '', ThemeIcon.asClassName(Codicon.copy), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'copyAddress');
						}
					}));
					const locationPreference = disposables.add(new Action('remotes.locationPreference', '', ThemeIcon.asClassName(Codicon.serverProcess), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'locationPreference');
						}
					}));
					const updateServer = disposables.add(new Action('remotes.updateServer', '', ThemeIcon.asClassName(Codicon.cloudDownload), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'updateServer');
						}
					}));
					template = { ...base, column: this.column, action, rename, copyAddress, locationPreference, updateServer, delete: deleteAction, documentation, toolbar, actionLayout: '' };
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
				rowElement.classList.toggle('remotes-row-hidden', entry.type === 'remote' && entry.remote.hidden === true);
				rowElement.classList.toggle('remotes-row-picker-unavailable', entry.type === 'remote' && !!entry.remote.pickerUnavailableReason);
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
				const signingIn = entry.type === 'empty' && entry.action?.enabled === false;
				listRow.setAttribute('aria-busy', String(entry.type === 'group' ? entry.refreshing : entry.type === 'remote' ? entry.busy : signingIn));
				template.label.textContent = entry.type === 'remote' ? entry.remote.name : entry.label;
				template.label.classList.toggle('remotes-empty-label', entry.type === 'empty');
				template.count.textContent = entry.type === 'group' ? String(entry.count) : '';
				template.count.hidden = entry.type !== 'group';
				template.progress.hidden = entry.type !== 'group' || !entry.refreshing;
				dom.clearNode(template.warning);
				if (entry.type === 'group' && entry.warning) {
					const icon = dom.append(template.warning, renderIcon(Codicon.warning));
					icon.setAttribute('aria-hidden', 'true');
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.warning, { content: entry.warning, style: HoverStyle.Pointer }));
				}
				template.warning.hidden = !template.warning.hasChildNodes();
				template.actionContainer.hidden = entry.type !== 'empty' || !entry.action;
				if (entry.type === 'empty' && entry.action) {
					if (!template.actionLink) {
						template.actionLink = template.disposables.add(new Link(template.actionContainer, { label: entry.action.label, href: '#' }, {
							opener: () => {
								if (template.row?.entry.type === 'empty' && template.row.entry.action?.enabled) {
									this.onAction(template.row.entry, 'signIn');
								}
							},
						}, this.hoverService, this.openerService));
						template.actionProgress = dom.append(template.actionContainer, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
						template.actionProgress.classList.add('remotes-signin-progress');
						template.actionProgress.setAttribute('aria-hidden', 'true');
					}
					template.actionLink.link = { label: entry.action.label, href: '#' };
					template.actionLink.enabled = entry.action.enabled;
				}
				if (template.actionProgress) {
					template.actionProgress.hidden = !signingIn;
				}
				template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.label, {
					content: template.label.textContent, style: HoverStyle.Mouse,
				}, { groupId: this.hoverGroupId }));
				template.description.textContent = entry.type === 'empty' ? entry.description ?? '' : '';
				template.description.hidden = !template.description.textContent;
				if (template.description.textContent) {
					template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.description, {
						content: template.description.textContent, style: HoverStyle.Mouse,
					}, { groupId: this.hoverGroupId }));
				}
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
				const error = entry.type === 'remote' && entry.connecting === undefined
					? entry.remote.lastConnectionError : undefined;
				template.warning.hidden = !error;
				if (error) {
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.warning, {
						content: error, style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
				}
				if (entry.type === 'remote') {
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.label, {
						content: entry.connecting === undefined ? error ?? entry.remote.unavailableReason ?? getStatusHover(entry.remote.connectionStatus) : template.label.textContent,
						style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
				}
				break;
			}
			case 'gutter':
			case 'actions': {
				const showCollapse = template.column === 'gutter' && entry.type === 'group';
				const showVisibility = template.column === 'gutter' && entry.type === 'remote';
				template.container.classList.toggle('remotes-visibility-column', showVisibility);
				const showConfig = template.column === 'actions' && entry.type === 'group' && (entry.kind === 'ssh' || entry.kind === 'tunnel' || entry.kind === 'environment');
				const showDocumentation = template.column === 'actions' && entry.type === 'group' && !!entry.documentation;
				const showConnection = template.column === 'actions' && entry.type === 'remote';
				const showDelete = showConnection && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh') && !!entry.remote.canDelete);
				const showLocationPreference = showConnection && (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh');
				const showUpdate = showConnection && RemoteAgentHostConnectionStatus.isIncompatible(entry.remote.connectionStatus) && !!entry.remote.connectionStatus.vscodeUpgradeMethod;
				const actionLayout = `${showConfig}:${showDocumentation}:${showConnection}:${showDelete}:${showLocationPreference}:${showUpdate}`;
				if (template.column === 'actions' && template.actionLayout !== actionLayout) {
					template.actionLayout = actionLayout;
					template.toolbar.setActions(showConnection ? [
						template.action, template.rename, template.copyAddress,
						...(showLocationPreference ? [template.locationPreference] : []),
						...(showDelete ? [template.delete] : []),
						...(showUpdate ? [template.updateServer] : []),
					] : [
						...(showDocumentation ? [template.documentation] : []),
						...(showConfig ? [template.action] : []),
					]);
				}
				template.container.classList.toggle('remotes-cell-action-hidden', !showCollapse && !showVisibility && !showConfig && !showDocumentation && !showConnection);
				if (template.column === 'actions' && entry.type === 'group' && entry.documentation) {
					template.documentation.label = entry.documentation.label;
				}
				template.action.enabled = true;
				template.action.tooltip = '';
				if (showCollapse) {
					template.action.label = entry.collapsed ? localize('remotes.expandGroup', "Expand {0}", entry.label) : localize('remotes.collapseGroup', "Collapse {0}", entry.label);
					template.action.class = ThemeIcon.asClassName(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown);
				} else if (showVisibility) {
					template.action.enabled = !entry.remote.pickerUnavailableReason;
					template.action.label = entry.remote.pickerUnavailableReason
						? localize('remotes.notInPicker', "{0} is not shown in the Environment picker. {1}", entry.remote.name, entry.remote.pickerUnavailableReason)
						: entry.remote.hidden
							? localize('remotes.showInPicker', "Show {0} in Environment Picker", entry.remote.name)
							: localize('remotes.hideFromPicker', "Hide {0} from Environment Picker", entry.remote.name);
					template.action.class = ThemeIcon.asClassName(entry.remote.pickerUnavailableReason || entry.remote.hidden ? Codicon.eyeClosed : Codicon.eye);
				} else if (showConfig) {
					template.action.label = entry.kind === 'ssh' ? localize('remotes.openSSHConfig', "Open SSH Configuration")
						: entry.kind === 'environment' ? localize('remotes.openEnvironmentSettings', "Open GitHub Environments Settings")
							: localize('remotes.openTunnelSettings', "Open Dev Tunnels Settings");
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
					template.copyAddress.label = localize('remotes.copyAddress', "Copy Address of {0}", entry.remote.name);
					template.locationPreference.label = localize('remotes.locationPreference', "Change Preferred Agent Location for {0}", entry.remote.name);
					template.locationPreference.enabled = !entry.busy
						&& !RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
						&& !RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus);
					template.delete.label = localize('remotes.delete', "Delete {0}", entry.remote.name);
					template.delete.enabled = showDelete && !entry.busy;
					template.updateServer.label = localize('remotes.updateServer', "Update Server for {0}", entry.remote.name);
					template.updateServer.enabled = showUpdate && !entry.busy;
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
		} else if (template.column === 'name' && template.row?.entry.type === 'empty') {
			if (template.link && template.row.entry.documentation) {
				template.link.link = { ...template.row.entry.documentation, title: template.row.entry.documentation.label, tabIndex: focused && !template.links.hidden ? 0 : -1 };
			}
			if (template.actionLink && template.row.entry.action) {
				template.actionLink.link = { label: template.row.entry.action.label, href: '#', tabIndex: focused && template.row.entry.action.enabled ? 0 : -1 };
			}
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
