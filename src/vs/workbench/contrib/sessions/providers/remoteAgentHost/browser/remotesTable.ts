/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { CountBadge } from '../../../../../../base/browser/ui/countBadge/countBadge.js';
import { ButtonWithIcon } from '../../../../../../base/browser/ui/button/button.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { HoverStyle } from '../../../../../../base/browser/ui/hover/hover.js';
import { IHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ITableRenderer } from '../../../../../../base/browser/ui/table/table.js';
import { Action, Separator, toAction } from '../../../../../../base/common/actions.js';
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
import { canConnectToRemote, ICustomizationRemote, RemoteKind, remoteKindLabels } from './remotesModel.js';
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

type RemoteColumn = 'gutter' | 'name' | 'type' | 'actions';
export type RemoteRowAction = 'toggleGroup' | 'toggleVisibility' | 'configure' | 'documentation' | 'connect' | 'newSession' | 'rename' | 'copyAddress' | 'locationPreference' | 'githubEnvironment' | 'troubleshoot' | 'updateServer' | 'delete' | 'signIn';

interface RemoteConnectionTemplate {
	readonly container: HTMLElement;
	readonly indicator: HTMLElement;
	readonly label: HTMLElement;
}

type RemoteCellTemplate = {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	row?: IRemoteTableRow;
} & (
		| { readonly column: 'name'; readonly content: HTMLElement; readonly icon: HTMLElement; readonly label: HTMLElement; readonly gitHubEnvironment: HTMLElement; readonly count: HTMLElement; readonly countBadge: CountBadge; readonly progress: HTMLElement; readonly warning: HTMLElement; readonly description: HTMLElement; readonly links: HTMLElement; readonly actionContainer: HTMLElement; readonly connection: RemoteConnectionTemplate; actionLink?: Link; actionProgress?: HTMLElement; link?: Link }
		| { readonly column: 'type'; readonly label: HTMLElement }
		| { readonly column: 'gutter'; readonly action: Action; readonly toolbar: WorkbenchToolBar }
		| { readonly column: 'actions'; readonly action: Action; readonly connect: ButtonWithIcon; readonly newSession: ButtonWithIcon; readonly newSessionAction: Action; readonly visibility: Action; readonly rename: Action; readonly copyAddress: Action; readonly locationPreference: Action; readonly gitHubEnvironment: Action; readonly troubleshoot: Action; readonly updateServer: Action; readonly delete: Action; readonly documentation: Action; readonly toolbar: WorkbenchToolBar; actionLayout: string }
	);

const remoteKindIcons: Record<RemoteKind, ThemeIcon> = {
	ssh: Codicon.remote,
	wsl: Codicon.terminalLinux,
	tunnel: Codicon.globe,
	environment: Codicon.github,
};

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

/** Describes GitHub environment sharing for the row's accessible label. */
export function getGitHubEnvironmentLabel(remote: ICustomizationRemote): string | undefined {
	return getGitHubEnvironmentState(remote)?.label;
}

export const remoteConnectionMethodLabel = localize('remotes.connectionMethod', "Connection method");
export const remoteAgentRunBehaviorDescription = localize('remotes.runBehaviorDescription', "Choose how agents run on this remote computer. Keep it awake and online while they work.");

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
		case 'sessions': return metadata.activeSessionCount === undefined ? '' : String(metadata.activeSessionCount);
		case 'activity': return metadata.lastConnectedAt === undefined ? '' : fromNow(metadata.lastConnectedAt, true);
	}
}

export function getRemoteSummary(remote: ICustomizationRemote): string {
	if (getRemoteStatusGroup(remote) === 'offline') {
		return '';
	}
	const parts = [getRemoteMetadataLabel(remote, 'system')];
	const count = remote.metadata?.activeSessionCount;
	if (count !== undefined && !remote.metadataIsStale && RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)) {
		parts.push(count === 1 ? localize('remotes.oneActiveSession', "1 active session") : localize('remotes.activeSessions', "{0} active sessions", count));
	}
	const activity = getRemoteMetadataLabel(remote, 'activity');
	if (activity) {
		parts.push(localize('remotes.lastConnectedSummary', "Connected {0}", activity));
	}
	return parts.filter(Boolean).join(' \u00b7 ');
}

/**
 * Availability is independent of this client's connection state; unchecked hosts are not offline.
 */
export function getRemoteStatusGroup(remote: ICustomizationRemote): 'ready' | 'available' | 'offline' | undefined {
	if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)) {
		return 'ready';
	}
	if (remote.availability !== 'online' && (RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus))) {
		return 'available';
	}
	switch (remote.availability) {
		case 'online': return 'available';
		case 'offline': return remote.startsOnConnect ? 'available' : 'offline';
		case 'unknown': return 'available';
		case 'pending': return undefined;
	}
}

/** Explains a row's availability, with when it was last seen online if it isn't online now. */
export function getAvailabilityHover(remote: ICustomizationRemote): string | undefined {
	const explanation = remote.availability === 'pending'
		? localize('remotes.checkingDetail', "Checking whether this environment is online...")
		: remote.availability === 'online' ? undefined : remote.unavailableReason;
	const lastOnlineAt = remote.availability !== 'online' ? remote.metadata?.lastOnlineAt : undefined;
	if (lastOnlineAt === undefined) {
		return explanation;
	}
	const lastSeen = localize('remotes.lastSeenOnline', "Last seen online {0}.", fromNow(lastOnlineAt, true, true));
	return explanation ? `${explanation}\n\n${lastSeen}` : lastSeen;
}

function isConnectionPending(entry: RemoteTableEntry): boolean {
	return entry.type === 'remote' && (entry.connecting !== undefined
		|| RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
		|| RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus));
}

/** Explains a failed or incompatible connection; such rows keep Troubleshoot visible at rest. */
function getConnectionProblem(entry: RemoteTableEntry): string | undefined {
	if (entry.type !== 'remote' || isConnectionPending(entry) || RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus)) {
		return undefined;
	}
	const status = entry.remote.connectionStatus;
	if (RemoteAgentHostConnectionStatus.isIncompatible(status)) {
		return status.message ? localize('remotes.updateRequiredHelp', "Update required.\n\n{0}", status.message) : localize('remotes.updateRequiredShortHelp', "Update required.");
	}
	return entry.remote.lastConnectionError ? localize('remotes.connectionFailedHelp', "Connection failed.\n\n{0}", entry.remote.lastConnectionError) : undefined;
}

export function getConnectionLabel(remote: ICustomizationRemote, connecting?: boolean): string {
	if (connecting !== undefined) {
		return connecting ? getAgentHostConnectionStatusLabel(RemoteAgentHostConnectionStatus.connecting) : localize('remotes.disconnecting', "Disconnecting");
	}
	if (RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)) {
		return localize('remotes.reconnecting', "Reconnecting");
	}
	if (RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus)) {
		return localize('remotes.updateRequired', "Update required");
	}
	if (RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus)) {
		if (remote.lastConnectionError) {
			return localize('remotes.connectionFailed', "Connection failed");
		}
		switch (remote.availability) {
			case 'offline': return remote.startsOnConnect ? localize('remotes.notRunning', "Not running") : localize('remotes.offline', "Offline");
			case 'pending': return localize('remotes.checking', "Checking...");
			case 'unknown': return localize('remotes.couldNotCheck', "Couldn't check");
		}
	}
	return getAgentHostConnectionStatusLabel(remote.connectionStatus);
}

export function getConnectionIcon(remote: ICustomizationRemote, connecting?: boolean): ThemeIcon {
	if (connecting !== undefined || RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)) {
		return ThemeIcon.modify(Codicon.loadingCompact, 'spin');
	}
	if (RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus)) {
		if (remote.lastConnectionError) {
			return Codicon.warning;
		}
		switch (remote.availability) {
			case 'offline': return Codicon.circleSlashCompact;
			case 'pending': return ThemeIcon.modify(Codicon.loadingCompact, 'spin');
			case 'unknown': return Codicon.question;
		}
	}
	return RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) ? Codicon.debugConnectedCompact
		: RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus) ? Codicon.warning
			: Codicon.debugDisconnectCompact;
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
				};
				const actionContainer = dom.append(content, dom.$('.remotes-empty-signin'));
				const icon = dom.append(nameRow, dom.$('.remotes-name-icon', { 'aria-hidden': 'true' }));
				const label = dom.append(nameRow, dom.$('.remotes-name'));
				const count = dom.append(nameRow, dom.$('.remotes-group-count', { 'aria-hidden': 'true' }));
				template = {
					...base, column: this.column, content,
					icon, label, count,
					gitHubEnvironment: dom.append(nameRow, dom.$('.remotes-github-environment')),
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
					...defaultButtonStyles, secondary: true, hoverDelegate: this.actionHoverDelegate, title: false,
				})) : undefined;
				if (connect) {
					connect.element.classList.add('remotes-connect-action');
					disposables.add(connect.onDidClick(event => {
						event?.stopPropagation();
						if (template.column === 'actions' && template.row) {
							const primary = getConnectionProblem(template.row.entry) ? template.troubleshoot : action;
							if (primary.enabled) {
								void primary.run();
							}
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
					const newSession = disposables.add(new ButtonWithIcon(container, {
						...defaultButtonStyles, hoverDelegate: this.actionHoverDelegate, title: false,
					}));
					newSession.element.classList.add('remotes-new-session');
					container.insertBefore(newSession.element, connect!.element);
					const newSessionAction = disposables.add(new Action('remotes.newSession', localize('remotes.newSession', "New Session"), undefined, false, async () => {
						if (template.row?.entry.type === 'remote' && newSession.enabled) {
							this.onAction(template.row.entry, 'newSession');
						}
					}));
					newSession.label = newSessionAction.label;
					disposables.add(newSession.onDidClick(event => {
						event?.stopPropagation();
						if (template.column === 'actions' && template.row?.entry.type === 'remote' && newSession.enabled) {
							void newSessionAction.run();
						}
					}));
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
					const troubleshoot = disposables.add(new Action('remotes.troubleshoot', localize('remotes.troubleshootAction', "Troubleshoot Connection"), ThemeIcon.asClassName(Codicon.tools), true, async () => {
						if (template.row?.entry.type === 'remote') {
							this.onAction(template.row.entry, 'troubleshoot');
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
					template = { ...base, column: this.column, action, connect: connect!, newSession, newSessionAction, visibility, rename, copyAddress, locationPreference, gitHubEnvironment, troubleshoot, updateServer, delete: deleteAction, documentation, toolbar, actionLayout: '' };
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
			case 'type': {
				dom.clearNode(template.label);
				if (entry.type === 'remote') {
					dom.append(template.label, renderIcon(remoteKindIcons[entry.remote.kind])).setAttribute('aria-hidden', 'true');
					const label = getRemoteTypeLabel(entry.remote.kind);
					dom.append(template.label, dom.$('span', undefined, label));
					if (label) {
						template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.label, { content: label, style: HoverStyle.Mouse }, { groupId: this.hoverGroupId }));
					}
				}
				break;
			}
			case 'name': {
				const offline = entry.type === 'remote' && getRemoteStatusGroup(entry.remote) === 'offline';
				const connectionHover = entry.type !== 'remote' ? undefined : entry.connecting === undefined
					? entry.remote.lastConnectionError ?? (RemoteAgentHostConnectionStatus.isDisconnected(entry.remote.connectionStatus)
						? getAvailabilityHover(entry.remote)
						: RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus) || RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
							? undefined : getStatusHover(entry.remote.connectionStatus))
					: undefined;
				this.renderConnection(entry, template.connection, connectionHover, template.elementDisposables);
				const rowElement = template.container.parentElement!;
				rowElement.classList.toggle('remotes-group-row', entry.type === 'group');
				rowElement.classList.toggle('remotes-ready-group', entry.type === 'group' && entry.id === 'remote-status-ready');
				rowElement.classList.toggle('remotes-available-group', entry.type === 'group' && entry.id === 'remote-status-available');
				rowElement.classList.toggle('remotes-offline-row', offline);
				dom.clearNode(template.icon);
				if (entry.type === 'group' && !entry.kind) {
					dom.append(template.icon, renderIcon(entry.id === 'remote-status-ready' ? Codicon.debugConnectedCompact
						: entry.id === 'remote-status-available' ? Codicon.debugDisconnectCompact : Codicon.circleSlashCompact));
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
						template.actionProgress = dom.append(template.actionContainer, renderIcon(ThemeIcon.modify(Codicon.loadingCompact, 'spin')));
						template.actionProgress.classList.add('remotes-signin-progress');
						template.actionProgress.setAttribute('aria-hidden', 'true');
					}
					template.actionLink.link = { label: entry.action.label, href: '#' };
					template.actionLink.enabled = entry.action.enabled;
				}
				if (template.actionProgress) {
					template.actionProgress.hidden = !signingIn;
				}
				const pickerDetail = entry.type !== 'remote' ? undefined
					: entry.remote.pickerUnavailableReason
						? localize('remotes.pickerUnavailableDetail', "Not shown in the environment picker: {0}", entry.remote.pickerUnavailableReason)
						: entry.remote.hidden ? localize('remotes.hiddenDetail', "Hidden from the environment picker. Use More Actions to show it again.") : undefined;
				template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.label, {
					content: entry.type === 'group' && entry.description ? entry.description
						: [
							template.label.textContent,
							entry.type === 'remote' && entry.showConnectionStatus === false ? connectionHover : undefined,
							pickerDetail,
						].filter(Boolean).join('\n\n'),
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
			case 'gutter':
			case 'actions': {
				const showCollapse = template.column === 'gutter' && entry.type === 'group';
				const showConfig = template.column === 'actions' && entry.type === 'group' && (entry.kind === 'ssh' || entry.kind === 'tunnel' || entry.kind === 'environment');
				const showDocumentation = template.column === 'actions' && entry.type === 'group' && !!entry.documentation;
				const showConnection = template.column === 'actions' && entry.type === 'remote';
				const showNewSession = showConnection && RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus);
				const pending = isConnectionPending(entry);
				const error = getConnectionProblem(entry);
				const canConnect = showConnection && canConnectToRemote(entry.remote);
				template.container.classList.toggle('remotes-connection-pending', showConnection && pending);
				template.container.classList.toggle('remotes-connection-failed', showConnection && !!error);
				const showDelete = showConnection && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh') && !!entry.remote.canDelete);
				const showLocationPreference = showConnection && (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh');
				const showGitHubEnvironment = showConnection && (entry.remote.kind === 'ssh' || entry.remote.kind === 'wsl' || entry.remote.kind === 'tunnel')
					&& (!!entry.remote.canShareAsGitHubEnvironment || !!entry.remote.gitHubEnvironment);
				const showUpdate = showConnection && RemoteAgentHostConnectionStatus.isIncompatible(entry.remote.connectionStatus) && !!entry.remote.connectionStatus.vscodeUpgradeMethod;
				const showCopyAddress = showConnection && !!entry.remote.copyableAddress;
				template.container.classList.toggle('remotes-cell-action-hidden', !showCollapse && !showConfig && !showDocumentation && !showConnection);
				if (template.column === 'actions') {
					const hideConnect = !showConnection || !canConnect && !pending && !error;
					if (hideConnect && template.connect.element.contains(dom.getActiveElement())) {
						template.container.closest<HTMLElement>('.monaco-list')?.focus();
					}
					template.connect.element.hidden = hideConnect;
					template.newSession.element.hidden = !showNewSession;
					template.newSession.enabled = template.newSessionAction.enabled = showNewSession && !entry.busy;
					if (showConnection) {
						const label = localize('remotes.newSessionIn', "New Session on {0}", entry.remote.name);
						template.newSession.element.setAttribute('aria-label', label);
					}
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
					template.action.enabled = !entry.busy && canConnect
						&& !RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
						&& !RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus);
					template.action.tooltip = pending ? localize('remotes.connectionProgress', "{0}: {1}", template.action.label, entry.remote.name)
						: !connected && entry.remote.unavailableReason
							? localize('remotes.connectUnavailable', "Connect to {0}: {1}", entry.remote.name, entry.remote.unavailableReason)
							: connected ? localize('remotes.disconnectDetail', "Disconnect from {0}. Its agent tasks keep running.", entry.remote.name)
								: localize('remotes.connect', "Connect to {0}", entry.remote.name);
					template.connect.label = error ? localize('remotes.troubleshootShort', "Troubleshoot") : template.action.label;
					template.connect.iconElement.hidden = !pending && !error;
					if (pending || error) {
						template.connect.icon = error ? Codicon.warning : ThemeIcon.modify(Codicon.loading, 'spin');
					}
					template.connect.enabled = error ? template.troubleshoot.enabled : template.action.enabled;
					template.connect.element.setAttribute('aria-label', error ? template.troubleshoot.label : pending
						? localize('remotes.connectionProgress', "{0}: {1}", template.action.label, entry.remote.name)
						: !connected && entry.remote.unavailableReason ? template.action.tooltip
							: connected ? localize('remotes.disconnect', "Disconnect {0}", entry.remote.name) : localize('remotes.connect', "Connect to {0}", entry.remote.name));
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.connect.element, {
						content: error ?? template.action.tooltip,
						style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
					template.visibility.enabled = !entry.remote.pickerUnavailableReason;
					template.visibility.label = entry.remote.pickerUnavailableReason || entry.remote.hidden
						? localize('remotes.showInPicker', "Show in Environment Picker")
						: localize('remotes.hideFromPicker', "Hide from Environment Picker");
					template.visibility.tooltip = entry.remote.pickerUnavailableReason ?? (entry.remote.hidden
						? localize('remotes.showInPickerDetail', "Show this environment when choosing where to run a session")
						: localize('remotes.hideFromPickerDetail', "Hide this environment from the environment picker. It stays in Remote Environments."));
					template.visibility.class = ThemeIcon.asClassName(entry.remote.pickerUnavailableReason || entry.remote.hidden ? Codicon.eyeClosed : Codicon.eye);
					template.rename.label = localize('remotes.rename', "Rename...");
					template.rename.enabled = !entry.busy;
					template.copyAddress.label = localize('remotes.copyAddress', "Copy Address");
					template.locationPreference.label = localize('remotes.locationPreference', "Configure Agent Run Behavior...");
					template.locationPreference.tooltip = remoteAgentRunBehaviorDescription;
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
					template.delete.label = entry.remote.kind === 'tunnel' ? localize('remotes.deleteTunnel', "Delete Dev Tunnel...")
						: entry.remote.kind === 'ssh' ? localize('remotes.forgetSSH', "Forget SSH Connection...")
							: localize('remotes.removeEnvironment', "Remove Environment...");
					template.delete.enabled = showDelete && !entry.busy;
					template.updateServer.label = localize('remotes.updateServer', "Update Server");
					template.updateServer.enabled = showUpdate && !entry.busy;
				}
				if (template.column === 'actions') {
					const actions = showConnection ? [] : [
						...(showDocumentation ? [template.documentation] : []),
						...(showConfig ? [template.action] : []),
					];
					// An open overflow menu must retain its environment and labels when the row template is recycled.
					const menuAction = (action: Action, kind: RemoteRowAction) => toAction({
						id: action.id, label: action.label, tooltip: action.tooltip, class: action.class, enabled: action.enabled,
						run: () => this.onAction(entry, kind),
					});
					const secondary = showConnection ? Separator.join(
						[...(showNewSession ? [menuAction(template.newSessionAction, 'newSession')] : []), ...(canConnect ? [menuAction(template.action, 'connect')] : []), menuAction(template.troubleshoot, 'troubleshoot')],
						showGitHubEnvironment ? [menuAction(template.gitHubEnvironment, 'githubEnvironment')] : [],
						[menuAction(template.visibility, 'toggleVisibility')],
						showCopyAddress ? [menuAction(template.copyAddress, 'copyAddress')] : [],
						[
							menuAction(template.rename, 'rename'),
							...(showLocationPreference ? [menuAction(template.locationPreference, 'locationPreference')] : []),
							...(showUpdate ? [menuAction(template.updateServer, 'updateServer')] : []),
							...(showDelete ? [menuAction(template.delete, 'delete')] : []),
						],
					) : [];
					const actionLayout = JSON.stringify([row.id, showConfig, showDocumentation, secondary.map(action => [action.id, action.label, action.tooltip, action.class, action.enabled])]);
					if (template.actionLayout !== actionLayout) {
						template.actionLayout = actionLayout;
						const activeElement = dom.getActiveElement();
						const focusedAction = dom.isHTMLElement(activeElement) && template.container.contains(activeElement) ? template.toolbar.getItemAction(activeElement) : undefined;
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
				}
				break;
			}
		}
		this.updateFocus(template);
	}

	private renderConnection(entry: RemoteTableEntry, template: RemoteConnectionTemplate, hover: string | undefined, store: DisposableStore): void {
		const summary = entry.type === 'remote' && getRemoteStatusGroup(entry.remote) !== 'offline'
			? getRemoteSummary(entry.remote) : '';
		const connection = entry.type === 'remote' && entry.showConnectionStatus !== false ? getConnectionLabel(entry.remote, entry.connecting) : '';
		template.container.hidden = !summary && !connection;
		template.indicator.hidden = entry.type !== 'remote' || entry.showConnectionStatus === false;
		template.label.textContent = [connection, summary].filter(Boolean).join(' \u00b7 ');
		template.indicator.classList.toggle('connected', entry.type === 'remote' && entry.connecting === undefined
			&& RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus));
		dom.clearNode(template.indicator);
		if (entry.type === 'remote') {
			dom.append(template.indicator, renderIcon(getConnectionIcon(entry.remote, entry.connecting)));
		}
		if (entry.type === 'remote') {
			const metadata = entry.remote.metadata;
			const details = [
				hover,
				summary,
				metadata?.lastConnectedAt !== undefined ? localize('remotes.activityDetail', "Last successful connection from this computer: {0}", new Date(metadata.lastConnectedAt).toLocaleString()) : undefined,
				metadata?.activeSessionCount !== undefined ? localize('remotes.sessionCountDetail', "Active sessions: {0}, including sessions waiting for input\nLast recorded {1}", metadata.activeSessionCount, new Date(metadata.observedAt).toLocaleString()) : undefined,
			].filter(Boolean).join('\n\n');
			if (details) {
				store.add(this.hoverService.setupDelayedHover(template.label, {
					content: details,
					style: HoverStyle.Pointer,
				}, { groupId: this.hoverGroupId }));
			}
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
				template.newSession.element.tabIndex = focused && !template.newSession.element.hidden ? 0 : -1;
			}
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
