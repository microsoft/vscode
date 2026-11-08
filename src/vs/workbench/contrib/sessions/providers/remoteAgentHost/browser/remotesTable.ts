/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { CountBadge } from '../../../../../../base/browser/ui/countBadge/countBadge.js';
import { Button, ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITableRenderer } from '../../../../../../base/browser/ui/table/table.js';
import { Action, Separator } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../../base/common/date.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles, defaultCountBadgeStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { getAgentHostConnectionStatusLabel } from '../../../common/agentHostSessionsProvider.js';
import { ICustomizationRemote, RemoteKind, remoteKindLabels } from './remotesModel.js';
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
		readonly kind?: RemoteKind;
		readonly label: string;
		readonly description?: string;
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
		readonly showConnectionStatus?: boolean;
	}
	| IRemoteEmptyEntry;

export interface IRemoteTableRow {
	readonly id: string;
	readonly entry: RemoteTableEntry;
}

type RemoteColumn = 'gutter' | 'name' | 'type' | 'system' | 'sessions' | 'activity' | 'actions';
export type RemoteRowAction = 'toggleGroup' | 'toggleVisibility' | 'configure' | 'documentation' | 'connect' | 'rename' | 'copyAddress' | 'locationPreference' | 'troubleshoot' | 'updateServer' | 'delete' | 'signIn';

interface RemoteConnectionTemplate {
	readonly container: HTMLElement;
	readonly indicator: HTMLElement;
	readonly label: HTMLElement;
	readonly warning: Button;
}

type RemoteCellTemplate = {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	row?: IRemoteTableRow;
} & (
		| { readonly column: 'name'; readonly content: HTMLElement; readonly icon: HTMLElement; readonly label: HTMLElement; readonly count: HTMLElement; readonly countBadge: CountBadge; readonly progress: HTMLElement; readonly warning: HTMLElement; readonly description: HTMLElement; readonly links: HTMLElement; readonly actionContainer: HTMLElement; readonly connection: RemoteConnectionTemplate; actionLink?: Link; actionProgress?: HTMLElement; link?: Link }
		| { readonly column: 'type' | 'system' | 'sessions' | 'activity'; readonly label: HTMLElement }
		| { readonly column: 'gutter'; readonly action: Action; readonly toolbar: WorkbenchToolBar }
		| { readonly column: 'actions'; readonly action: Action; readonly connect: ButtonWithIcon; readonly visibility: Action; readonly rename: Action; readonly copyAddress: Action; readonly locationPreference: Action; readonly troubleshoot: Action; readonly updateServer: Action; readonly delete: Action; readonly documentation: Action; readonly toolbar: WorkbenchToolBar; actionLayout: string }
	);

const remoteKindIcons: Record<RemoteKind, ThemeIcon> = {
	ssh: Codicon.remote,
	wsl: Codicon.terminalLinux,
	tunnel: Codicon.globe,
	environment: Codicon.github,
};

export function getRemoteTypeLabel(kind: RemoteKind): string {
	return kind === 'environment' ? localize('remotes.githubType', "GitHub Environment (Preview)")
		: kind === 'tunnel' ? localize('remotes.tunnelType', "Dev Tunnel") : remoteKindLabels[kind];
}

export function getRemoteMetadataLabel(remote: ICustomizationRemote, column: 'system' | 'sessions' | 'activity'): string {
	const metadata = remote.metadata;
	if (!metadata) {
		return '';
	}
	switch (column) {
		case 'system': return metadata.operatingSystem === OperatingSystem.Windows ? localize('remotes.system.windows', "Windows")
			: metadata.operatingSystem === OperatingSystem.Macintosh ? localize('remotes.system.mac', "macOS")
				: metadata.operatingSystem === OperatingSystem.Linux ? remote.kind === 'wsl' ? localize('remotes.system.wsl', "WSL 2") : localize('remotes.system.linux', "Linux") : '';
		case 'sessions': {
			const count = metadata.activeSessionCount === undefined ? '' : localize('remotes.activeSessions', "{0} active", metadata.activeSessionCount);
			return count && remote.metadataIsStale ? localize('remotes.lastKnownCount', "{0} (last known)", count) : count;
		}
		case 'activity': return metadata.lastConnectedAt === undefined ? '' : fromNow(metadata.lastConnectedAt, true);
	}
}

export function getRemoteStatusGroup(remote: ICustomizationRemote): 'ready' | 'available' | 'offline' {
	if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)) {
		return 'ready';
	}
	if (RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus) && remote.kind === 'environment' && remote.unavailableReason) {
		return 'offline';
	}
	return 'available';
}

function isConnectionPending(entry: RemoteTableEntry): boolean {
	return entry.type === 'remote' && (entry.connecting !== undefined
		|| RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
		|| RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus));
}

export function getConnectionLabel(remote: ICustomizationRemote, connecting?: boolean): string {
	if (connecting !== undefined) {
		return connecting ? getAgentHostConnectionStatusLabel(RemoteAgentHostConnectionStatus.connecting) : localize('remotes.disconnecting', "Disconnecting");
	}
	if (RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)) {
		return localize('remotes.reconnecting', "Reconnecting");
	}
	if (RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus) && remote.unavailableReason) {
		return remote.kind === 'environment' ? localize('remotes.offline', "Host offline") : localize('remotes.unavailable', "Unavailable");
	}
	return getAgentHostConnectionStatusLabel(remote.connectionStatus);
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
			case 'type':
			case 'system':
			case 'sessions':
			case 'activity':
				template = { ...base, column: this.column, label: dom.append(container, dom.$('.remotes-metadata')) };
				break;
			case 'name': {
				const content = dom.append(container, dom.$('.remotes-name-content'));
				const nameRow = dom.append(content, dom.$('.remotes-name-row'));
				const description = dom.append(content, dom.$('.remotes-empty-description'));
				const connectionContainer = dom.append(content, dom.$('.remotes-connection-column'));
				const connection: RemoteConnectionTemplate = {
					container: connectionContainer,
					indicator: dom.append(connectionContainer, dom.$('.remotes-connection-indicator', { 'aria-hidden': 'true' })),
					label: dom.append(connectionContainer, dom.$('.remotes-connection-state')),
					warning: disposables.add(new ButtonWithIcon(nameRow, {
						...defaultButtonStyles, secondary: true, hoverDelegate: this.actionHoverDelegate,
						title: false, ariaLabel: localize('remotes.troubleshoot', "Troubleshoot Connection"),
					})),
				};
				connection.warning.label = localize('remotes.troubleshootShort', "Troubleshoot");
				connection.warning.icon = Codicon.warning;
				connection.warning.element.classList.add('remotes-connection-warning');
				disposables.add(connection.warning.onDidClick(event => {
					event?.stopPropagation();
					if (template.row?.entry.type === 'remote') {
						this.onAction(template.row.entry, 'troubleshoot');
					}
				}));
				const actionContainer = dom.append(content, dom.$('.remotes-empty-signin'));
				const icon = dom.append(nameRow, dom.$('.remotes-name-icon', { 'aria-hidden': 'true' }));
				const label = dom.append(nameRow, dom.$('.remotes-name'));
				nameRow.appendChild(connection.warning.element);
				const count = dom.append(nameRow, dom.$('.remotes-group-count', { 'aria-hidden': 'true' }));
				template = {
					...base, column: this.column, content,
					icon, label, count,
					countBadge: disposables.add(new CountBadge(count, {}, {
						...defaultCountBadgeStyles, badgeBackground: undefined, badgeForeground: undefined,
					})),
					progress: dom.append(nameRow, dom.$('.remotes-group-progress', { 'aria-hidden': 'true' })),
					warning: dom.append(nameRow, dom.$('.remotes-refresh-warning')),
					description, actionContainer, connection,
					links: dom.append(content, dom.$('.remotes-empty-actions')),
				};
				dom.append(template.progress, renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')));
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
				const connect = this.column === 'actions' ? disposables.add(new ButtonWithIcon(container, {
					...defaultButtonStyles, hoverDelegate: this.actionHoverDelegate,
				})) : undefined;
				if (connect) {
					disposables.add(connect.onDidClick(event => {
						event?.stopPropagation();
						if (action.enabled) {
							void action.run();
						}
					}));
				}
				const toolbar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, {
					ariaLabel: localize('remotes.rowActions', "Remote actions"), hoverDelegate: this.actionHoverDelegate,
				}));
				toolbar.setActions([action]);
				if (this.column === 'gutter') {
					template = { ...base, column: this.column, action, toolbar };
				} else {
					const visibility = disposables.add(new Action('remotes.visibility', '', undefined, true, async () => {
						if (template.row?.entry.type === 'remote' && !template.row.entry.remote.pickerUnavailableReason) {
							this.onAction(template.row.entry, 'toggleVisibility');
						}
					}));
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
					const troubleshoot = disposables.add(new Action('remotes.troubleshoot', localize('remotes.troubleshoot', "Troubleshoot Connection"), ThemeIcon.asClassName(Codicon.tools), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'troubleshoot');
						}
					}));
					const updateServer = disposables.add(new Action('remotes.updateServer', '', ThemeIcon.asClassName(Codicon.cloudDownload), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'updateServer');
						}
					}));
					template = { ...base, column: this.column, action, connect: connect!, visibility, rename, copyAddress, locationPreference, troubleshoot, updateServer, delete: deleteAction, documentation, toolbar, actionLayout: '' };
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
			case 'type':
			case 'system':
			case 'sessions':
			case 'activity': {
				dom.clearNode(template.label);
				if (entry.type === 'remote') {
					if (template.column === 'type') {
						dom.append(template.label, renderIcon(remoteKindIcons[entry.remote.kind])).setAttribute('aria-hidden', 'true');
					}
					const label = template.column === 'type' ? getRemoteTypeLabel(entry.remote.kind) : getRemoteMetadataLabel(entry.remote, template.column);
					dom.append(template.label, dom.$('span', undefined, label));
					if (label) {
						const metadata = entry.remote.metadata;
						const detail = template.column === 'type' || !metadata ? label
							: template.column === 'activity' && metadata.lastConnectedAt !== undefined
								? localize('remotes.activityDetail', "Last successful connection from this device: {0}", new Date(metadata.lastConnectedAt).toLocaleString())
								: localize('remotes.metadataDetail', "{0}\nLast recorded {1}", label, new Date(metadata.observedAt).toLocaleString());
						template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.label, { content: detail, style: HoverStyle.Mouse }, { groupId: this.hoverGroupId }));
					}
				}
				break;
			}
			case 'name': {
				this.renderConnection(entry, template.connection, template.elementDisposables);
				const rowElement = template.container.parentElement!;
				rowElement.classList.toggle('remotes-group-row', entry.type === 'group');
				rowElement.classList.toggle('remotes-ready-group', entry.type === 'group' && entry.id === 'remote-status-ready');
				rowElement.classList.toggle('remotes-available-group', entry.type === 'group' && entry.id === 'remote-status-available');
				rowElement.classList.toggle('remotes-offline-row', entry.type === 'remote' && getRemoteStatusGroup(entry.remote) === 'offline');
				dom.clearNode(template.icon);
				if (entry.type === 'group' && !entry.kind) {
					dom.append(template.icon, renderIcon(entry.id === 'remote-status-ready' ? Codicon.circleFilledCompact
						: entry.id === 'remote-status-available' ? Codicon.circleOutline : Codicon.circleSlashCompact));
				}
				template.icon.hidden = !template.icon.hasChildNodes();
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
				template.countBadge.setCount(entry.type === 'group' ? entry.count : 0);
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
					content: entry.type === 'group' && entry.description ? entry.description : template.label.textContent, style: HoverStyle.Mouse,
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
			case 'gutter':
			case 'actions': {
				const showCollapse = template.column === 'gutter' && entry.type === 'group';
				const showConfig = template.column === 'actions' && entry.type === 'group' && (entry.kind === 'ssh' || entry.kind === 'tunnel' || entry.kind === 'environment');
				const showDocumentation = template.column === 'actions' && entry.type === 'group' && !!entry.documentation;
				const showConnection = template.column === 'actions' && entry.type === 'remote';
				const pending = isConnectionPending(entry);
				template.container.classList.toggle('remotes-connection-pending', showConnection && pending);
				const showDelete = showConnection && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh') && !!entry.remote.canDelete);
				const showLocationPreference = showConnection && (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh');
				const showUpdate = showConnection && RemoteAgentHostConnectionStatus.isIncompatible(entry.remote.connectionStatus) && !!entry.remote.connectionStatus.vscodeUpgradeMethod;
				const actionLayout = `${showConfig}:${showDocumentation}:${showConnection}:${showDelete}:${showLocationPreference}:${showUpdate}`;
				if (template.column === 'actions' && template.actionLayout !== actionLayout) {
					template.actionLayout = actionLayout;
					const activeElement = dom.getActiveElement();
					const focusedAction = dom.isHTMLElement(activeElement) && template.container.contains(activeElement) ? template.toolbar.getItemAction(activeElement) : undefined;
					const actions = showConnection ? [] : [
						...(showDocumentation ? [template.documentation] : []),
						...(showConfig ? [template.action] : []),
					];
					const secondary = showConnection ? Separator.join(
						[template.action],
						[template.visibility],
						[template.copyAddress],
						[
							template.rename,
							...(showLocationPreference ? [template.locationPreference] : []),
							...(showUpdate ? [template.updateServer] : []),
							template.troubleshoot,
							...(showDelete ? [template.delete] : []),
						],
					) : [];
					template.toolbar.setActions(actions, secondary);
					if (focusedAction) {
						const index = actions.findIndex(action => action === focusedAction);
						if (index >= 0) {
							template.toolbar.focus(index);
						} else {
							template.container.closest<HTMLElement>('.monaco-list')?.focus();
						}
					}
				}
				template.container.classList.toggle('remotes-cell-action-hidden', !showCollapse && !showConfig && !showDocumentation && !showConnection);
				if (template.column === 'actions') {
					template.connect.element.hidden = !showConnection;
				}
				if (template.column === 'actions' && entry.type === 'group' && entry.documentation) {
					template.documentation.label = entry.documentation.label;
				}
				template.action.enabled = true;
				template.action.tooltip = '';
				if (showCollapse) {
					template.action.label = entry.collapsed ? localize('remotes.expandGroup', "Expand {0}", entry.label) : localize('remotes.collapseGroup', "Collapse {0}", entry.label);
					template.action.class = ThemeIcon.asClassName(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown);
				} else if (showConfig) {
					template.action.label = entry.kind === 'ssh' ? localize('remotes.openSSHConfig', "Open SSH Configuration")
						: entry.kind === 'environment' ? localize('remotes.openEnvironmentSettings', "Open GitHub Environments Settings")
							: localize('remotes.openTunnelSettings', "Open Dev Tunnels Settings");
					template.action.class = ThemeIcon.asClassName(Codicon.settingsGear);
				} else if (showConnection) {
					const connected = RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus);
					template.action.label = pending ? getConnectionLabel(entry.remote, entry.connecting)
						: connected ? localize('remotes.disconnectAction', "Disconnect") : localize('remotes.connectAction', "Connect");
					template.action.class = ThemeIcon.asClassName(connected ? Codicon.debugDisconnect : Codicon.debugConnected);
					template.action.enabled = !entry.busy && (connected || !entry.remote.unavailableReason)
						&& !RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
						&& !RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus);
					template.action.tooltip = !connected && entry.remote.unavailableReason
						? localize('remotes.connectUnavailable', "Connect to {0}: {1}", entry.remote.name, entry.remote.unavailableReason)
						: connected ? localize('remotes.disconnect', "Disconnect {0}", entry.remote.name) : localize('remotes.connect', "Connect to {0}", entry.remote.name);
					template.connect.label = template.action.label;
					template.connect.iconElement.hidden = !pending;
					if (pending) {
						template.connect.icon = ThemeIcon.modify(Codicon.loading, 'spin');
					}
					template.connect.enabled = template.action.enabled;
					template.connect.element.setAttribute('aria-label', pending
						? localize('remotes.connectionProgress', "{0}: {1}", template.action.label, entry.remote.name) : template.action.tooltip);
					template.visibility.enabled = !entry.remote.pickerUnavailableReason;
					template.visibility.label = entry.remote.pickerUnavailableReason || entry.remote.hidden
						? localize('remotes.showInPicker', "Show in Environment Picker")
						: localize('remotes.hideFromPicker', "Hide from Environment Picker");
					template.visibility.tooltip = entry.remote.pickerUnavailableReason ?? template.visibility.label;
					template.visibility.class = ThemeIcon.asClassName(entry.remote.pickerUnavailableReason || entry.remote.hidden ? Codicon.eyeClosed : Codicon.eye);
					template.rename.label = localize('remotes.rename', "Rename...");
					template.rename.enabled = !entry.busy;
					template.copyAddress.label = localize('remotes.copyAddress', "Copy Address");
					template.locationPreference.label = localize('remotes.locationPreference', "Agent Run Behavior");
					template.locationPreference.enabled = !entry.busy
						&& !RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
						&& !RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus);
					template.delete.label = localize('remotes.forget', "Forget...");
					template.delete.enabled = showDelete && !entry.busy;
					template.updateServer.label = localize('remotes.updateServer', "Update Server");
					template.updateServer.enabled = showUpdate && !entry.busy;
				}
				break;
			}
		}
		this.updateFocus(template);
	}

	private renderConnection(entry: RemoteTableEntry, template: RemoteConnectionTemplate, store: DisposableStore): void {
		const pending = isConnectionPending(entry);
		const error = entry.type === 'remote' && entry.connecting === undefined ? entry.remote.lastConnectionError : undefined;
		template.container.hidden = entry.type !== 'remote' || entry.showConnectionStatus === false;
		template.indicator.hidden = entry.type !== 'remote' || entry.showConnectionStatus === false;
		template.label.textContent = entry.type === 'remote' && entry.showConnectionStatus !== false ? getConnectionLabel(entry.remote, entry.connecting) : '';
		template.indicator.classList.toggle('connected', entry.type === 'remote' && entry.connecting === undefined
			&& RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus));
		dom.clearNode(template.indicator);
		if (entry.type === 'remote') {
			const connectionStatus = entry.remote.connectionStatus;
			const icon = pending ? ThemeIcon.modify(Codicon.loadingCompact, 'spin')
				: RemoteAgentHostConnectionStatus.isConnected(connectionStatus) ? Codicon.circleFilledCompact
					: RemoteAgentHostConnectionStatus.isDisconnected(connectionStatus) && entry.remote.unavailableReason ? Codicon.circleSlashCompact
						: Codicon.debugDisconnectCompact;
			dom.append(template.indicator, renderIcon(icon));
		}
		template.warning.element.hidden = !error;
		if (error) {
			store.add(this.hoverService.setupDelayedHover(template.warning.element, {
				content: localize('remotes.connectionFailedHelp', "Connection failed. Select Troubleshoot for recovery steps.\n\n{0}", error), style: HoverStyle.Pointer,
			}, { groupId: this.hoverGroupId }));
		}
		if (entry.type === 'remote') {
			store.add(this.hoverService.setupDelayedHover(template.label, {
				content: entry.connecting === undefined
					? error ?? (RemoteAgentHostConnectionStatus.isDisconnected(entry.remote.connectionStatus) ? entry.remote.unavailableReason : undefined) ?? getStatusHover(entry.remote.connectionStatus)
					: template.label.textContent,
				style: HoverStyle.Pointer,
			}, { groupId: this.hoverGroupId }));
		}
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
			if (template.column === 'actions') {
				template.connect.element.tabIndex = focused && !template.connect.element.hidden ? 0 : -1;
			}
		} else if (template.column === 'name' && template.row?.entry.type === 'empty') {
			if (template.link && template.row.entry.documentation) {
				template.link.link = { ...template.row.entry.documentation, title: template.row.entry.documentation.label, tabIndex: focused && !template.links.hidden ? 0 : -1 };
			}
			if (template.actionLink && template.row.entry.action) {
				template.actionLink.link = { label: template.row.entry.action.label, href: '#', tabIndex: focused && template.row.entry.action.enabled ? 0 : -1 };
			}
		} else if (template.column === 'name') {
			template.connection.warning.element.tabIndex = focused ? 0 : -1;
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
