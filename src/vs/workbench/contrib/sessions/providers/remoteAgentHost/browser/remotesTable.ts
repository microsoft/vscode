/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITableRenderer } from '../../../../../../base/browser/ui/table/table.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { getAgentHostConnectionStatusLabel } from '../../../common/agentHostSessionsProvider.js';
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

/** Groups remotes by whether they can be used now. */
export type RemoteStatusGroup = 'ready' | 'available' | 'offline';

export const remoteStatusGroups: readonly RemoteStatusGroup[] = ['ready', 'available', 'offline'];

const remoteStatusGroupInfo: Record<RemoteStatusGroup, { readonly label: string; readonly description: string }> = {
	ready: { label: localize('remotes.group.ready', "Ready to use"), description: localize('remotes.group.ready.description', "Connected from this computer.") },
	available: { label: localize('remotes.group.available', "Available"), description: localize('remotes.group.available.description', "Not connected. Connect when you need it.") },
	offline: { label: localize('remotes.group.offline', "Offline"), description: localize('remotes.group.offline.description', "Can't be reached right now.") },
};

export function getRemoteStatusGroupLabel(group: RemoteStatusGroup): string {
	return remoteStatusGroupInfo[group].label;
}

export function getRemoteStatusGroupDescription(group: RemoteStatusGroup): string {
	return remoteStatusGroupInfo[group].description;
}

const remoteTypes: Record<RemoteKind, { readonly label: string; readonly icon: ThemeIcon }> = {
	ssh: { label: localize('remotes.type.ssh', "SSH"), icon: Codicon.remote },
	wsl: { label: localize('remotes.type.wsl', "WSL"), icon: Codicon.terminalLinux },
	tunnel: { label: localize('remotes.type.tunnel', "Dev Tunnel"), icon: Codicon.globe },
	environment: { label: localize('remotes.type.environment', "GitHub Environment"), icon: Codicon.github },
};

/** The singular type name shown in the Type column, e.g. "Dev Tunnel". */
export function getRemoteTypeLabel(kind: RemoteKind): string {
	return remoteTypes[kind].label;
}

function isOffline(remote: ICustomizationRemote): boolean {
	return remote.kind === 'environment' && !!remote.unavailableReason && RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus);
}

/**
 * Remotes stay in their group while a connection is being made or dropped, so rows don't jump
 * between groups; a reconnecting remote keeps its sessions and stays ready.
 */
export function getRemoteStatusGroup(remote: ICustomizationRemote): RemoteStatusGroup {
	if (isOffline(remote)) {
		return 'offline';
	}
	return RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus) ? 'ready' : 'available';
}

export type RemoteTableEntry =
	| {
		readonly type: 'group';
		readonly id: string;
		readonly group: RemoteStatusGroup;
		readonly label: string;
		readonly count: number;
		readonly collapsed: boolean;
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

type RemoteColumn = 'gutter' | 'name' | 'type' | 'actions';
export type RemoteRowAction = 'toggleGroup' | 'toggleVisibility' | 'connect' | 'rename' | 'copyAddress' | 'locationPreference' | 'githubEnvironment' | 'updateServer' | 'delete' | 'signIn';

type RemoteCellTemplate = {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	row?: IRemoteTableRow;
} & (
		| { readonly column: 'name'; readonly label: HTMLElement; readonly connectionProgress: HTMLElement; readonly connectionWarning: HTMLElement; readonly gitHubEnvironment: HTMLElement; readonly count: HTMLElement; readonly description: HTMLElement; readonly links: HTMLElement; readonly actionContainer: HTMLElement; actionLink?: Link; actionProgress?: HTMLElement; link?: Link }
		| { readonly column: 'type'; readonly icon: HTMLElement; readonly label: HTMLElement }
		| { readonly column: 'gutter'; readonly action: Action; readonly toolbar: WorkbenchToolBar }
		| { readonly column: 'actions'; readonly action: Action; readonly rename: Action; readonly copyAddress: Action; readonly locationPreference: Action; readonly gitHubEnvironment: Action; readonly updateServer: Action; readonly delete: Action; readonly toolbar: WorkbenchToolBar; actionLayout: string }
	);

const connectionProgressIcon = ThemeIcon.modify(Codicon.loading, 'spin');

function getGitHubEnvironmentState(remote: ICustomizationRemote): { readonly label: string; readonly icon: ThemeIcon; readonly error: boolean } | undefined {
	const share = remote.gitHubEnvironment;
	switch (share?.state) {
		case undefined: return undefined;
		case 'connecting': return { label: localize('remotes.gitHubEnvironmentSharing', "Sharing {0} as a GitHub environment...", remote.name), icon: connectionProgressIcon, error: false };
		case 'error': return { label: localize('remotes.gitHubEnvironmentError', "{0} could not be shared as a GitHub environment: {1}", remote.name, share.error ?? ''), icon: Codicon.warning, error: true };
		case 'unavailable': return {
			label: share.unavailableReason === 'host'
				? localize('remotes.gitHubEnvironmentSharedByHost', "{0} is shared as a GitHub environment by the remote itself.", remote.name)
				: localize('remotes.gitHubEnvironmentSharedByAccount', "{0} is shared as a GitHub environment by another GitHub account.", remote.name),
			icon: Codicon.github,
			error: false,
		};
		default: return { label: localize('remotes.gitHubEnvironmentShared', "{0} is shared as a GitHub environment for other apps signed in with your GitHub account.", remote.name), icon: Codicon.github, error: false };
	}
}

/**
 * Describes whether a remote is shared as a GitHub environment, for its row's accessible label.
 */
export function getGitHubEnvironmentLabel(remote: ICustomizationRemote): string | undefined {
	return getGitHubEnvironmentState(remote)?.label;
}

function getConnectionState(remote: ICustomizationRemote, connecting?: boolean): { readonly label: string } {
	if (connecting !== undefined) {
		return { label: connecting ? getAgentHostConnectionStatusLabel(RemoteAgentHostConnectionStatus.connecting) : localize('remotes.disconnecting', "Disconnecting") };
	}
	if (isOffline(remote)) {
		return { label: localize('remotes.hostOffline', "Host offline") };
	}
	if (RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)) {
		return { label: localize('remotes.reconnecting', "Reconnecting") };
	}
	return { label: getAgentHostConnectionStatusLabel(remote.connectionStatus) };
}

export function getConnectionLabel(remote: ICustomizationRemote, connecting?: boolean): string {
	return getConnectionState(remote, connecting).label;
}

/** Describes a connection that is being made or dropped, shown as a spinner after the remote's name. */
function getConnectionProgress(remote: ICustomizationRemote, connecting?: boolean): string | undefined {
	if (connecting !== undefined) {
		return getConnectionLabel(remote, connecting);
	}
	return RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)
		? getStatusHover(remote.connectionStatus, undefined, remote.lastConnectionError)
		: undefined;
}

/** Describes a failed connection or an incompatible host, shown as a warning after the remote's name. */
export function getConnectionWarning(remote: ICustomizationRemote, connecting?: boolean): string | undefined {
	if (connecting !== undefined) {
		return undefined;
	}
	return remote.lastConnectionError
		?? (RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus) ? getStatusHover(remote.connectionStatus) : undefined);
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
					connectionProgress: dom.append(nameRow, dom.$('.remotes-connection-progress')),
					connectionWarning: dom.append(nameRow, dom.$('.remotes-connection-warning')),
					gitHubEnvironment: dom.append(nameRow, dom.$('.remotes-github-environment')),
					count: dom.append(nameRow, dom.$('.remotes-group-count')),
					description, actionContainer,
					links: dom.append(content, dom.$('.remotes-empty-actions')),
				};
				// The row's accessible label already includes the connection state.
				dom.append(template.connectionProgress, renderIcon(connectionProgressIcon)).setAttribute('aria-hidden', 'true');
				dom.append(template.connectionWarning, renderIcon(Codicon.warning)).setAttribute('aria-hidden', 'true');
				break;
			}
			case 'type': {
				template = {
					...base, column: this.column,
					icon: dom.append(container, dom.$('span.remotes-type-icon', { 'aria-hidden': 'true' })),
					label: dom.append(container, dom.$('span.remotes-type-label')),
				};
				break;
			}
			default: {
				const action = disposables.add(new Action(`remotes.${this.column}`, '', undefined, true, async () => {
					if (template.row && (template.column === 'gutter' || template.column === 'actions')) {
						if (template.column === 'gutter') {
							this.onAction(template.row.entry, template.row.entry.type === 'group' ? 'toggleGroup' : 'toggleVisibility');
						} else if (template.row.entry.type === 'remote') {
							this.onAction(template.row.entry, 'connect');
						}
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
					const gitHubEnvironment = disposables.add(new Action('remotes.githubEnvironment', '', ThemeIcon.asClassName(Codicon.github), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'githubEnvironment');
						}
					}));
					const updateServer = disposables.add(new Action('remotes.updateServer', '', ThemeIcon.asClassName(Codicon.cloudDownload), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'updateServer');
						}
					}));
					template = { ...base, column: this.column, action, rename, copyAddress, locationPreference, gitHubEnvironment, updateServer, delete: deleteAction, toolbar, actionLayout: '' };
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
				listRow.setAttribute('aria-busy', String(entry.type === 'remote' ? entry.busy : signingIn));
				template.label.textContent = entry.type === 'remote' ? entry.remote.name : entry.label;
				template.label.classList.toggle('remotes-empty-label', entry.type === 'empty');
				const progress = entry.type === 'remote' ? getConnectionProgress(entry.remote, entry.connecting) : undefined;
				template.connectionProgress.hidden = !progress;
				if (progress) {
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.connectionProgress, {
						content: progress, style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
				}
				const warning = entry.type === 'remote' ? getConnectionWarning(entry.remote, entry.connecting) : undefined;
				template.connectionWarning.hidden = !warning;
				if (warning) {
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.connectionWarning, {
						content: warning, style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
				}
				dom.clearNode(template.gitHubEnvironment);
				const gitHubEnvironment = entry.type === 'remote' ? getGitHubEnvironmentState(entry.remote) : undefined;
				template.gitHubEnvironment.hidden = !gitHubEnvironment;
				template.gitHubEnvironment.classList.toggle('remotes-github-environment-error', !!gitHubEnvironment?.error);
				if (gitHubEnvironment) {
					// The row's accessible label already includes this state.
					dom.append(template.gitHubEnvironment, renderIcon(gitHubEnvironment.icon)).setAttribute('aria-hidden', 'true');
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.gitHubEnvironment, {
						content: gitHubEnvironment.label, style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
				}
				template.count.textContent = entry.type === 'group' ? String(entry.count) : '';
				template.count.hidden = entry.type !== 'group';
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
					content: entry.type === 'group' ? getRemoteStatusGroupDescription(entry.group) : template.label.textContent,
					style: HoverStyle.Mouse,
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
			case 'type': {
				const type = entry.type === 'remote' ? remoteTypes[entry.remote.kind] : undefined;
				template.label.textContent = type?.label ?? '';
				template.icon.className = type ? `remotes-type-icon ${ThemeIcon.asClassName(type.icon)}` : 'remotes-type-icon';
				template.icon.hidden = !type;
				break;
			}
			case 'gutter':
			case 'actions': {
				const showCollapse = template.column === 'gutter' && entry.type === 'group';
				const showVisibility = template.column === 'gutter' && entry.type === 'remote';
				template.container.classList.toggle('remotes-visibility-column', showVisibility);
				const showConnection = template.column === 'actions' && entry.type === 'remote';
				const showDelete = showConnection && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh') && !!entry.remote.canDelete);
				const showLocationPreference = showConnection && (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh');
				const showGitHubEnvironment = showConnection && (entry.remote.kind === 'ssh' || entry.remote.kind === 'wsl' || entry.remote.kind === 'tunnel')
					&& (!!entry.remote.canShareAsGitHubEnvironment || !!entry.remote.gitHubEnvironment);
				const showUpdate = showConnection && RemoteAgentHostConnectionStatus.isIncompatible(entry.remote.connectionStatus) && !!entry.remote.connectionStatus.vscodeUpgradeMethod;
				const actionLayout = `${showConnection}:${showDelete}:${showLocationPreference}:${showGitHubEnvironment}:${showUpdate}`;
				if (template.column === 'actions' && template.actionLayout !== actionLayout) {
					template.actionLayout = actionLayout;
					template.toolbar.setActions(showConnection ? [
						template.action, template.rename, template.copyAddress,
						...(showLocationPreference ? [template.locationPreference] : []),
						...(showGitHubEnvironment ? [template.gitHubEnvironment] : []),
						...(showDelete ? [template.delete] : []),
						...(showUpdate ? [template.updateServer] : []),
					] : []);
				}
				template.container.classList.toggle('remotes-cell-action-hidden', !showCollapse && !showVisibility && !showConnection);
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
					const share = entry.remote.gitHubEnvironment;
					template.gitHubEnvironment.label = share?.state === 'connecting' || share?.state === 'unavailable'
						? getGitHubEnvironmentLabel(entry.remote) ?? ''
						: share
							? localize('remotes.stopSharingAsGitHubEnvironment', "Stop Sharing {0} as GitHub Environment", entry.remote.name)
							: localize('remotes.shareAsGitHubEnvironment', "Share {0} as GitHub Environment", entry.remote.name);
					template.gitHubEnvironment.enabled = showGitHubEnvironment && !entry.busy && share?.state !== 'connecting' && share?.state !== 'unavailable';
					template.gitHubEnvironment.class = ThemeIcon.asClassName(share?.state === 'connecting' ? connectionProgressIcon : Codicon.github);
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
