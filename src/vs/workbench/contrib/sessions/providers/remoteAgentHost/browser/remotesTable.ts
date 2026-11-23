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
import { ISelectOptionItem, SelectBox, SeparatorSelectOption } from '../../../../../../base/browser/ui/selectBox/selectBox.js';
import { ITableRenderer } from '../../../../../../base/browser/ui/table/table.js';
import { Action, Separator, toAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../../base/common/date.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
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
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { assignHostSandboxProfile, fromHostSandboxProfile, readHostSandboxProfile, readKnownHostSandboxProfile, rememberSandboxProfileAssignment, watchHostSandboxProfile, watchSandboxProfileAssignments } from '../../../../../../platform/agentHost/common/sandboxProfiles.js';
import type { ISandboxProfileAssignment } from '../../../../../../platform/agentHost/common/sandboxConfigSchema.js';
import { ISandboxProfile, readSandboxProfiles, watchSandboxProfiles, writeSandboxProfiles } from '../../../../../../platform/sandbox/common/sandboxProfiles.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { defaultButtonStyles, defaultCountBadgeStyles, defaultSelectBoxStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { getAgentHostConnectionStatusLabel } from '../../../common/agentHostSessionsProvider.js';
import { canConnectToRemote, ICustomizationRemote, RemoteKind, remoteKindLabels } from './remotesModel.js';

export interface IRemoteEmptyEntry {
	readonly type: 'empty';
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly action?: { readonly id: Extract<RemoteRowAction, 'signIn' | 'createDevContainer'>; readonly label: string; readonly enabled: boolean };
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
		/** Whether a remote of this group's kind can be created from its header. */
		readonly canCreate?: boolean;
	}
	| {
		readonly type: 'remote';
		readonly remote: ICustomizationRemote;
		readonly busy: boolean;
		readonly connecting?: boolean;
		readonly ungrouped?: boolean;
	}
	| IRemoteEmptyEntry;

export interface IRemoteTableRow {
	readonly id: string;
	readonly entry: RemoteTableEntry;
}

type RemoteColumn = 'name' | 'type' | 'system' | 'status' | 'sessions' | 'activity' | 'sandboxProfile' | 'actions';
export type RemoteRowAction = 'toggleGroup' | 'toggleVisibility' | 'configure' | 'documentation' | 'connect' | 'newSession' | 'createDevContainer' | 'rename' | 'copyAddress' | 'locationPreference' | 'troubleshoot' | 'githubEnvironment' | 'showExtension' | 'updateServer' | 'delete' | 'signIn';

type RemoteCellTemplate = {
	readonly container: HTMLElement;
	readonly disposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
	row?: IRemoteTableRow;
} & (
		| { readonly column: 'name'; readonly content: HTMLElement; readonly chevron: HTMLElement; readonly nameRow: HTMLElement; readonly icon: HTMLElement; readonly label: HTMLElement; readonly detail: HTMLElement; readonly gitHubEnvironment: HTMLElement; readonly serverUpdate: HTMLElement; readonly count: HTMLElement; readonly countBadge: CountBadge; readonly warning: HTMLElement; readonly description: HTMLElement; readonly links: HTMLElement; readonly actionContainer: HTMLElement; actionLink?: Link; actionProgress?: HTMLElement; link?: Link }
		| { readonly column: 'type' | 'system' | 'status' | 'sessions' | 'activity'; readonly label: HTMLElement }
		| { readonly column: 'sandboxProfile'; readonly select: SelectBox; readonly picker: HTMLElement; options: readonly SandboxProfileOption[] }
		| { readonly column: 'actions'; readonly action: Action; readonly connect: ButtonWithIcon; readonly newSession: ButtonWithIcon; readonly newSessionAction: Action; readonly visibility: Action; readonly createDevContainer: Action; readonly rename: Action; readonly copyAddress: Action; readonly locationPreference: Action; readonly troubleshoot: Action; readonly gitHubEnvironment: Action; readonly showExtension: Action; readonly updateServer: Action; readonly delete: Action; readonly documentation: Action; readonly toolbar: WorkbenchToolBar; actionLayout: string }
	);

const remoteKindIcons: Record<RemoteKind, ThemeIcon> = {
	ssh: Codicon.remote,
	wsl: Codicon.terminalLinux,
	tunnel: Codicon.globe,
	environment: Codicon.github,
	extension: Codicon.extensions,
	devContainer: Codicon.vm,
};

const connectionProgressIcon = ThemeIcon.modify(Codicon.loading, 'spin');

/** An entry of a host's Sandbox Profile dropdown. */
type SandboxProfileOption =
	| { readonly kind: 'default' }
	| { readonly kind: 'assign'; readonly profile: ISandboxProfile }
	| { readonly kind: 'separator' }
	/** The host's profile, assigned from another device; choosing it changes nothing. */
	| { readonly kind: 'host' }
	| { readonly kind: 'save'; readonly assignment: ISandboxProfileAssignment };

/** Keys a closed select box handles natively; they must not also move focus in the table. */
const selectNavigationKeys = new Set([KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End, KeyCode.PageUp, KeyCode.PageDown]);

export const remoteStatusGroups = [
	{ key: 'ready', label: localize('remotes.ready', "Connected"), icon: Codicon.circleFilled, description: localize('remotes.ready.detail', "Connected from this window and ready to start or continue sessions.") },
	{ key: 'available', label: localize('remotes.available', "Available"), icon: Codicon.circle, description: localize('remotes.available.detail', "Select Connect to use this environment.") },
	{ key: 'offline', label: localize('remotes.offline', "Offline"), icon: Codicon.circleSlashCompact, description: localize('remotes.offline.detail', "No reachable endpoint was found at the last check. Bring the environment online, then refresh.") },
] as const;

function getGitHubEnvironmentState(remote: ICustomizationRemote): { readonly label: string; readonly icon: ThemeIcon; readonly error: boolean } | undefined {
	const share = remote.gitHubEnvironment;
	switch (share?.state) {
		case undefined: return undefined;
		case 'connecting': return { label: localize('remotes.gitHubEnvironmentSharing', "Sharing as a GitHub environment..."), icon: connectionProgressIcon, error: false };
		case 'error': return { label: localize('remotes.gitHubEnvironmentError', "Couldn't share as a GitHub environment: {0}", share.error ?? ''), icon: Codicon.warning, error: true };
		case 'unavailable': return {
			label: share.unavailableReason === 'host'
				? localize('remotes.gitHubEnvironmentSharedByHost', "Shared as a GitHub environment by the remote itself.")
				: localize('remotes.gitHubEnvironmentSharedByAccount', "Shared as a GitHub environment by another GitHub account."),
			icon: Codicon.github,
			error: false,
		};
		default: return { label: localize('remotes.gitHubEnvironmentShared', "Shared as a GitHub environment for other apps signed in with your GitHub account."), icon: Codicon.github, error: false };
	}
}

/** Describes GitHub environment sharing for the row's accessible label. */
export function getGitHubEnvironmentLabel(remote: ICustomizationRemote): string | undefined {
	return getGitHubEnvironmentState(remote)?.label;
}

/** Describes an available server update for a connected remote, shown next to its name and in the row's accessible label. */
export function getServerUpdateLabel(remote: ICustomizationRemote): string | undefined {
	return RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) && remote.canUpdateServer
		? localize('remotes.serverUpdateAvailable', "A server update is available. Select Update Server in More Actions to install it.")
		: undefined;
}

export const remoteAgentRunBehaviorDescription = localize('remotes.runBehaviorDescription', "Choose how agents run on this remote computer. Keep it awake and online while they work.");

export function getRemoteTypeLabel(kind: RemoteKind): string {
	return kind === 'environment' ? localize('remotes.githubType', "GitHub Environment (Preview)")
		: kind === 'tunnel' ? localize('remotes.tunnelType', "Dev Tunnel") : remoteKindLabels[kind];
}

export function getRemoteAddressLabel(remote: ICustomizationRemote): string {
	return remote.kind === 'ssh' ? remote.detail : '';
}

export function getRemoteMetadataLabel(remote: ICustomizationRemote, column: 'system' | 'sessions' | 'activity'): string {
	if (column === 'system') {
		return getRemoteOperatingSystemLabel(remote);
	}
	if (column === 'sessions') {
		return remote.metadata?.activeSessionCount === undefined ? '' : String(remote.metadata.activeSessionCount);
	}
	const timestamp = getRemoteActivityTime(remote);
	if (timestamp === undefined) {
		return '';
	}
	const age = Date.now() - timestamp;
	const day = 24 * 60 * 60 * 1000;
	if (!RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) && remote.availability !== 'online' && !remote.startsOnConnect && age > 7 * day) {
		return localize('remotes.activityOverSevenDays', ">7 days ago");
	}
	return age >= day && age <= 7 * day
		? Math.floor(age / day) === 1 ? localize('remotes.activityOneDay', "1 day ago") : localize('remotes.activityDays', "{0} days ago", Math.floor(age / day))
		: fromNow(timestamp, true);
}

function getRemoteOperatingSystemLabel(remote: ICustomizationRemote): string {
	const operatingSystem = remote.metadata?.operatingSystem;
	return operatingSystem === OperatingSystem.Windows ? localize('remotes.system.windows', "Windows")
		: operatingSystem === OperatingSystem.Macintosh ? localize('remotes.system.mac', "macOS")
			: operatingSystem === OperatingSystem.Linux ? localize('remotes.system.linux', "Linux") : '';
}

function getRemoteSessionCountLabel(count: number): string {
	return count === 1 ? localize('remotes.oneSession', "1 session") : localize('remotes.sessionCount', "{0} sessions", count);
}

export function getRemoteMetadataDetails(remote: ICustomizationRemote, column: 'system' | 'sessions' | 'activity'): string {
	if (column === 'activity' && !RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) && remote.lastHeartbeatAt !== undefined) {
		return [
			remote.reportedSessionCount === undefined ? undefined : getRemoteSessionCountLabel(remote.reportedSessionCount),
			localize('remotes.lastSeen', "Last seen: {0}", fromNow(remote.lastHeartbeatAt, true)),
		].filter(Boolean).join('\n');
	}
	const metadata = remote.metadata;
	if (!metadata) {
		return '';
	}
	switch (column) {
		case 'system': {
			const platform = [
				getRemoteOperatingSystemLabel(remote), metadata.architecture,
			].filter(Boolean).join(' \u00b7 ');
			return [
				platform,
				metadata.cpuCount === undefined ? undefined : localize('remotes.system.cpus', "CPUs: {0}", metadata.cpuCount),
				metadata.memoryBytes === undefined ? undefined : localize('remotes.system.memory', "Memory: {0} GiB", Math.round(metadata.memoryBytes / 1024 ** 3 * 10) / 10),
			].filter(Boolean).join('\n');
		}
		case 'sessions': return metadata.activeSessionCount === undefined ? '' : String(metadata.activeSessionCount);
		case 'activity': {
			const parts: string[] = [];
			if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)) {
				const count = !remote.metadataIsStale ? metadata.observedSessionCount : undefined;
				if (count !== undefined) {
					parts.push(getRemoteSessionCountLabel(count));
				}
				if (!remote.metadataIsStale && metadata.lastActivityAt !== undefined) {
					parts.push(localize('remotes.activityTime', "Last activity: {0}", fromNow(metadata.lastActivityAt, true)));
				} else if (metadata.lastConnectedAt !== undefined) {
					parts.push(localize('remotes.connectionTime', "Last connected: {0}", fromNow(metadata.lastConnectedAt, true)));
				}
			} else {
				if (metadata.lastActivityAt !== undefined) {
					parts.push(localize('remotes.activityTime', "Last activity: {0}", fromNow(metadata.lastActivityAt, true)));
				}
				if (metadata.lastConnectedAt !== undefined) {
					parts.push(localize('remotes.connectionTime', "Last connected: {0}", fromNow(metadata.lastConnectedAt, true)));
				} else if (metadata.lastOnlineAt !== undefined) {
					parts.push(localize('remotes.lastSeenTime', "Last online: {0}", fromNow(metadata.lastOnlineAt, true)));
				}
			}
			return parts.join('\n');
		}
	}
}

export function getRemoteActivityTime(remote: ICustomizationRemote): number | undefined {
	const { lastActivityAt, lastConnectedAt, lastOnlineAt } = remote.metadata ?? {};
	return RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)
		? (remote.metadataIsStale ? undefined : lastActivityAt) ?? lastConnectedAt : remote.lastHeartbeatAt ?? lastActivityAt ?? lastConnectedAt ?? lastOnlineAt;
}

/**
 * Groups disconnected hosts by connection eligibility; unchecked hosts remain available to try.
 */
export function getRemoteStatusGroup(remote: ICustomizationRemote): 'ready' | 'available' | 'offline' | undefined {
	if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)) {
		return 'ready';
	}
	if (remote.requiresTunnelSignIn) {
		return undefined;
	}
	return canConnectToRemote(remote)
		|| RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus)
		|| RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus) ? 'available' : 'offline';
}

export function getRemoteAvailabilityLabel(remote: ICustomizationRemote): string {
	return remoteStatusGroups.find(group => group.key === getRemoteStatusGroup(remote))?.label
		?? '';
}

function isRemoteOffline(remote: ICustomizationRemote): boolean {
	return RemoteAgentHostConnectionStatus.isDisconnected(remote.connectionStatus) && !remote.requiresTunnelSignIn && !canConnectToRemote(remote);
}

function isConnectionPending(entry: RemoteTableEntry): boolean {
	return entry.type === 'remote' && (entry.connecting !== undefined
		|| RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
		|| RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus));
}

/** The reason the last connection to a disconnected remote failed, shown with its Connect action. */
export function getConnectionProblem(remote: ICustomizationRemote): string | undefined {
	if (remote.requiresTunnelSignIn || RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)
		|| RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)) {
		return undefined;
	}
	if (RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus)) {
		return localize('remotes.updateRequiredProblem', "Update required: {0}", remote.connectionStatus.message);
	}
	return remote.lastConnectionError ? localize('remotes.connectionFailedProblem', "Connection failed: {0}", remote.lastConnectionError) : undefined;
}

function getConnectionPresentation(remote: ICustomizationRemote, connecting?: boolean): { readonly label: string; readonly icon: ThemeIcon | undefined; readonly state: 'connected' | 'available' | 'offline' | 'failed' | 'pending' | 'unverified' } {
	if (connecting !== undefined) {
		return { label: connecting ? getAgentHostConnectionStatusLabel(RemoteAgentHostConnectionStatus.connecting) : localize('remotes.disconnecting', "Disconnecting"), icon: ThemeIcon.modify(Codicon.loadingCompact, 'spin'), state: 'pending' };
	}
	if (RemoteAgentHostConnectionStatus.isConnecting(remote.connectionStatus) || RemoteAgentHostConnectionStatus.isReconnecting(remote.connectionStatus)) {
		return { label: getAgentHostConnectionStatusLabel(remote.connectionStatus), icon: ThemeIcon.modify(Codicon.loadingCompact, 'spin'), state: 'pending' };
	}
	if (RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus)) {
		return { label: remoteStatusGroups[0].label, icon: remoteStatusGroups[0].icon, state: 'connected' };
	}
	if (remote.requiresTunnelSignIn) {
		return { label: '', icon: undefined, state: 'unverified' };
	}
	if (RemoteAgentHostConnectionStatus.isIncompatible(remote.connectionStatus)) {
		return { label: localize('remotes.updateRequired', "Update required"), icon: Codicon.warning, state: 'failed' };
	}
	if (remote.lastConnectionError) {
		return { label: localize('remotes.connectionFailed', "Connection failed"), icon: Codicon.warning, state: 'failed' };
	}
	const group = getRemoteStatusGroup(remote);
	if (group === 'offline') {
		return { label: remoteStatusGroups[2].label, icon: remoteStatusGroups[2].icon, state: 'offline' };
	}
	if (group === 'available') {
		return { label: remoteStatusGroups[1].label, icon: remoteStatusGroups[1].icon, state: 'available' };
	}
	return { label: '', icon: undefined, state: 'unverified' };
}

export function getConnectionLabel(remote: ICustomizationRemote, connecting?: boolean): string {
	return getConnectionPresentation(remote, connecting).label;
}

export function renderConnectionStatus(container: HTMLElement, remote: ICustomizationRemote, connecting?: boolean): void {
	const presentation = getConnectionPresentation(remote, connecting);
	renderStatusIndicator(container, presentation.icon, presentation.state);
}

function renderStatusIndicator(container: HTMLElement, icon: ThemeIcon | undefined, state: ReturnType<typeof getConnectionPresentation>['state']): void {
	dom.clearNode(container);
	container.classList.add('remotes-connection-indicator');
	for (const candidate of ['connected', 'available', 'offline', 'failed', 'pending', 'unverified']) {
		container.classList.toggle(candidate, candidate === state);
	}
	container.setAttribute('aria-hidden', 'true');
	container.hidden = !icon;
	if (icon) {
		dom.append(container, renderIcon(icon));
	}
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
		private readonly connections: IAgentHostConnectionsService,
		private readonly storage: IStorageService,
		private readonly contextViewService: IContextViewService,
		private readonly emptyContentWidth?: () => number,
	) {
		this.templateId = `remotes.${column}`;
	}

	renderTemplate(container: HTMLElement): RemoteCellTemplate {
		container.classList.add(`remotes-${this.column}-column`);
		const disposables = new DisposableStore();
		const base = { container, disposables, elementDisposables: disposables.add(new DisposableStore()) };
		let template: RemoteCellTemplate;
		switch (this.column) {
			case 'sandboxProfile': {
				const select = disposables.add(new SelectBox([], 0, this.contextViewService, defaultSelectBoxStyles, { useCustomDrawn: true, hideSelectedOptionHover: true }));
				// The select box draws its chevron at the right edge of the element it renders into, so give it its own sized container.
				const picker = dom.append(container, dom.$('.remotes-sandbox-profile-picker'));
				select.render(picker);
				template = { ...base, column: 'sandboxProfile', select, picker, options: [] };
				disposables.add(select.onDidSelect(({ index }) => {
					if (template.row?.entry.type === 'remote' && template.column === 'sandboxProfile') {
						this.onDidSelectSandboxProfile(template.row.entry.remote.id, template.options[index]);
					}
				}));
				disposables.add(dom.addDisposableGenericMouseDownListener(container, event => dom.EventHelper.stop(event, true)));
				break;
			}
			case 'type':
			case 'system':
			case 'status':
			case 'sessions':
			case 'activity':
				template = { ...base, column: this.column, label: dom.append(container, dom.$('.remotes-metadata')) };
				break;
			case 'name': {
				const content = dom.append(container, dom.$('.remotes-name-content'));
				const nameRow = dom.append(content, dom.$('.remotes-name-row'));
				const chevron = dom.append(nameRow, dom.$('span.remotes-group-chevron', { 'aria-hidden': 'true' }));
				const description = dom.append(content, dom.$('.remotes-empty-description'));
				const actionContainer = dom.append(content, dom.$('.remotes-empty-signin'));
				const icon = dom.append(nameRow, dom.$('.remotes-name-icon', { 'aria-hidden': 'true' }));
				const label = dom.append(nameRow, dom.$('.remotes-name'));
				const count = dom.append(nameRow, dom.$('.remotes-group-count', { 'aria-hidden': 'true' }));
				template = {
					...base, column: this.column, content, chevron, nameRow,
					icon, label, count,
					detail: dom.append(nameRow, dom.$('.remotes-name-detail')),
					gitHubEnvironment: dom.append(nameRow, dom.$('.remotes-github-environment')),
					serverUpdate: dom.append(nameRow, dom.$('.remotes-server-update')),
					countBadge: disposables.add(new CountBadge(count, {}, {
						...defaultCountBadgeStyles, badgeBackground: undefined, badgeForeground: undefined,
					})),
					warning: dom.append(nameRow, dom.$('.remotes-refresh-warning')),
					description, actionContainer,
					links: dom.append(content, dom.$('.remotes-empty-actions')),
				};
				break;
			}
			default: {
				const action = disposables.add(new Action(`remotes.${this.column}`, '', undefined, true, async () => {
					if (template.row && template.column === 'actions') {
						const entry = template.row.entry;
						this.onAction(entry, entry.type === 'group' ? 'configure' : entry.type === 'remote' && entry.remote.requiresTunnelSignIn ? 'signIn' : 'connect');
					}
				}));
				const connect = disposables.add(new ButtonWithIcon(container, {
					...defaultButtonStyles, secondary: true, hoverDelegate: this.actionHoverDelegate, title: false,
				}));
				connect.element.classList.add('remotes-connect-action');
				disposables.add(connect.onDidClick(event => {
					event?.stopPropagation();
					if (template.column === 'actions' && template.row) {
						const primary = template.row.entry.type === 'group' && template.row.entry.canCreate ? template.createDevContainer : action;
						if (primary.enabled) {
							void primary.run();
						}
					}
				}));
				const toolbar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar, container, {
					ariaLabel: localize('remotes.rowActions', "Remote actions"), hoverDelegate: this.actionHoverDelegate,
				}));
				toolbar.setActions([action]);
				const newSession = disposables.add(new ButtonWithIcon(container, {
					...defaultButtonStyles, hoverDelegate: this.actionHoverDelegate, title: false,
				}));
				newSession.element.classList.add('remotes-new-session');
				container.insertBefore(newSession.element, connect.element);
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
				const troubleshoot = disposables.add(new Action('remotes.troubleshoot', '', ThemeIcon.asClassName(Codicon.tools), true, async () => {
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
				const showExtension = disposables.add(new Action('remotes.showExtension', '', ThemeIcon.asClassName(Codicon.extensions), true, async () => {
					if (template.row?.entry.type === 'remote') {
						this.onAction(template.row.entry, 'showExtension');
					}
				}));
				const createDevContainer = disposables.add(new Action('remotes.createDevContainer', '', ThemeIcon.asClassName(Codicon.add), true, async () => {
					if (template.row?.entry.type === 'remote' || template.row?.entry.type === 'group') {
						this.onAction(template.row.entry, 'createDevContainer');
					}
				}));
				template = { ...base, column: this.column, action, connect, newSession, newSessionAction, visibility, createDevContainer, rename, copyAddress, locationPreference, troubleshoot, gitHubEnvironment, showExtension, updateServer, delete: deleteAction, documentation, toolbar, actionLayout: '' };
				disposables.add(dom.addDisposableGenericMouseDownListener(container, event => dom.EventHelper.stop(event, true)));
				break;
			}
		}
		disposables.add(dom.addDisposableListener(container, dom.EventType.KEY_DOWN, event => {
			if (event.target !== container) {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter || this.column === 'sandboxProfile' && selectNavigationKeys.has(keyboardEvent.keyCode)) {
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
			case 'sandboxProfile': {
				template.container.classList.toggle('remotes-cell-action-hidden', entry.type !== 'remote');
				if (entry.type === 'remote') {
					const { id, name } = entry.remote;
					const hostWatch = template.elementDisposables.add(new MutableDisposable<DisposableStore>());
					let connection: IAgentConnection | undefined;
					let tooltip = '';
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.picker, () => ({ content: tooltip, style: HoverStyle.Pointer }), { groupId: this.hoverGroupId }));
					const refresh = () => {
						const current = this.connections.getConnectionByAddress(id);
						if (current !== connection) {
							connection = current;
							const store = new DisposableStore();
							if (current) {
								watchHostSandboxProfile(current, store, refresh);
							}
							hostWatch.value = store;
						}
						const live = connection && readHostSandboxProfile(connection);
						const supported = live !== undefined;
						if (supported) {
							rememberSandboxProfileAssignment(this.storage, id, name, live);
						}
						// While the host is disconnected, show the assignment this machine last saw on it.
						const assigned = supported ? live : connection ? undefined : readKnownHostSandboxProfile(this.storage, id);
						const library = supported || assigned ? readSandboxProfiles(this.storage) : [];
						const options: SandboxProfileOption[] = [{ kind: 'default' }, ...library.map(profile => ({ kind: 'assign' as const, profile }))];
						const items: ISelectOptionItem[] = [{ text: localize('remotes.defaultSandboxProfile', "Default") }, ...library.map(profile => ({ text: profile.name }))];
						let selected = assigned ? options.findIndex(option => option.kind === 'assign' && option.profile.id === assigned.id) : 0;
						if (assigned && selected === -1) {
							// Assigned from another device: keep showing it, and offer to save it to this machine's profiles.
							options.push({ kind: 'separator' }, { kind: 'host' });
							items.push(SeparatorSelectOption, { text: localize('remotes.hostSandboxProfile', "{0} (on host)", assigned.name) });
							selected = options.length - 1;
							if (supported) {
								options.push({ kind: 'save', assignment: assigned });
								items.push({ text: localize('remotes.saveHostSandboxProfile', "Save \"{0}\" to My Profiles", assigned.name) });
							}
						}
						template.options = options;
						template.select.setOptions(items, selected);
						template.select.setEnabled(supported);
						template.picker.classList.toggle('disabled', !supported);
						tooltip = supported
							? localize('remotes.sandboxProfileTooltip', "Sandbox profile for new sessions on {0}: {1}", name, items[selected]?.text ?? '')
							: connection
								? localize('remotes.sandboxProfileUnsupportedTooltip', "The server on {0} doesn't support sandbox profiles yet. It needs a newer server version.", name)
								: assigned
									? localize('remotes.sandboxProfileLastKnownTooltip', "Last known sandbox profile on {0}: {1}. Connect to {0} to refresh or change it.", name, assigned.name)
									: localize('remotes.sandboxProfileUnavailableTooltip', "Connect to {0} to see or choose its sandbox profile.", name);
						template.select.setAriaLabel(supported
							? localize('remotes.selectSandboxProfile', "Sandbox profile for {0}", name)
							: connection
								? localize('remotes.sandboxProfileUnsupported', "Sandbox profile for {0}. This host doesn't support sandbox profiles.", name)
								: assigned
									? localize('remotes.sandboxProfileLastKnown', "Sandbox profile for {0}: {1}, last known. Connect to {0} to refresh or change it.", name, assigned.name)
									: localize('remotes.sandboxProfileUnavailable', "Sandbox profile for {0}. Connect to {0} to see or choose one.", name));
					};
					watchSandboxProfiles(this.storage, template.elementDisposables, refresh);
					watchSandboxProfileAssignments(this.storage, template.elementDisposables, () => {
						if (!this.connections.getConnectionByAddress(id)) {
							refresh();
						}
					});
					template.elementDisposables.add(this.connections.onDidChangeConnections(refresh));
					refresh();
				}
				break;
			}
			case 'status': {
				const remote = entry.type === 'remote' ? entry.remote : undefined;
				const group = remote ? remoteStatusGroups.find(group => group.key === getRemoteStatusGroup(remote)) : undefined;
				dom.clearNode(template.label);
				if (remote && group) {
					const label = getRemoteAvailabilityLabel(remote);
					const indicator = dom.append(template.label, dom.$('span'));
					renderStatusIndicator(indicator, group.icon, group.key === 'ready' ? 'connected' : group.key);
					dom.append(template.label, dom.$('span', undefined, label));
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.label, {
						content: remote.unavailableReason ? `${label}\n${remote.unavailableReason}` : label, style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
				}
				break;
			}
			case 'system':
			case 'sessions':
			case 'activity': {
				const remote = entry.type === 'remote' ? entry.remote : undefined;
				let label = remote ? getRemoteMetadataLabel(remote, template.column) : '';
				if (template.column === 'sessions') {
					const count = remote?.metadata?.activeSessionCount;
					label = count === undefined || remote?.metadataIsStale || !RemoteAgentHostConnectionStatus.isConnected(remote?.connectionStatus) ? ''
						: count === 1 ? localize('remotes.oneActiveSession', "1 active session") : localize('remotes.activeSessions', "{0} active sessions", count);
				}
				dom.clearNode(template.label);
				if (label) {
					if (template.column === 'activity' && !template.container.classList.contains('monaco-table-td')) {
						dom.append(template.label, renderIcon(Codicon.history)).setAttribute('aria-hidden', 'true');
					}
					dom.append(template.label, dom.$('span', undefined, label));
				}
				const details = remote ? getRemoteMetadataDetails(remote, template.column) : '';
				const hasActivityDetails = template.column === 'activity' && !!details;
				template.container.hidden = !label && !hasActivityDetails;
				if ((label || hasActivityDetails) && remote) {
					template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(label ? template.label : template.container, {
						content: details, style: HoverStyle.Mouse,
					}, { groupId: this.hoverGroupId }));
				}
				break;
			}
			case 'type': {
				dom.clearNode(template.label);
				if (entry.type === 'remote') {
					if (template.column === 'type') {
						dom.append(template.label, renderIcon(remoteKindIcons[entry.remote.kind])).setAttribute('aria-hidden', 'true');
					}
					const label = getRemoteTypeLabel(entry.remote.kind);
					dom.append(template.label, dom.$('span', undefined, label));
					if (label) {
						template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.label, { content: label, style: HoverStyle.Mouse }, { groupId: this.hoverGroupId }));
					}
				}
				break;
			}
			case 'name': {
				const offline = entry.type === 'remote' && isRemoteOffline(entry.remote);
				const rowElement = template.container.parentElement!;
				rowElement.classList.toggle('remotes-group-row', entry.type === 'group');
				rowElement.classList.toggle('remotes-ready-group', entry.type === 'group' && entry.id === 'remote-status-ready');
				rowElement.classList.toggle('remotes-available-group', entry.type === 'group' && entry.id === 'remote-status-available');
				rowElement.classList.toggle('remotes-offline-row', offline);
				dom.clearNode(template.icon);
				if (entry.type === 'group' && !entry.kind) {
					const group = remoteStatusGroups.find(group => entry.id === `remote-status-${group.key}`);
					dom.append(template.icon, renderIcon(group?.icon ?? Codicon.question));
				}
				template.icon.hidden = !template.icon.hasChildNodes();
				rowElement.classList.toggle('remotes-empty-row', entry.type === 'empty');
				template.content.style.maxWidth = entry.type === 'empty' && this.emptyContentWidth ? `${this.emptyContentWidth()}px` : '';
				rowElement.classList.toggle('remotes-row-hidden', entry.type === 'remote' && entry.remote.hidden === true);
				rowElement.classList.toggle('remotes-row-picker-unavailable', entry.type === 'remote' && !!entry.remote.pickerUnavailableReason);
				if (entry.type === 'remote') {
					rowElement.dataset.remoteId = entry.remote.id;
				} else {
					delete rowElement.dataset.remoteId;
				}
				const listRow = rowElement.parentElement!;
				listRow.classList.toggle('remotes-group-list-row', entry.type === 'group');
				template.chevron.hidden = entry.type !== 'group';
				if (entry.type === 'group') {
					if (listRow.tagName !== 'SUMMARY') {
						listRow.setAttribute('aria-expanded', String(!entry.collapsed));
					}
					dom.clearNode(template.chevron);
					dom.append(template.chevron, renderIcon(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown));
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
				dom.clearNode(template.serverUpdate);
				const serverUpdate = entry.type === 'remote' ? getServerUpdateLabel(entry.remote) : undefined;
				template.serverUpdate.hidden = !serverUpdate;
				if (serverUpdate) {
					// The row's accessible label already includes this state.
					dom.append(template.serverUpdate, renderIcon(Codicon.cloudDownload)).setAttribute('aria-hidden', 'true');
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.serverUpdate, {
						content: serverUpdate, style: HoverStyle.Pointer,
					}, { groupId: this.hoverGroupId }));
				}
				template.count.hidden = entry.type !== 'group';
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
									this.onAction(template.row.entry, template.row.entry.action.id);
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
							entry.type === 'remote' ? getRemoteAddressLabel(entry.remote) : undefined,
							pickerDetail,
						].filter(Boolean).join('\n\n'),
					style: HoverStyle.Mouse,
				}, { groupId: this.hoverGroupId }));
				// Users remove an extension's remote through its extension, so the row names it.
				const contributedBy = entry.type === 'remote' ? entry.remote.contributedBy : undefined;
				template.detail.textContent = contributedBy ? localize('remotes.contributedByDetail', "Registered by the {0} extension", contributedBy.displayName)
					: entry.type === 'remote' ? entry.remote.description ?? '' : '';
				template.detail.hidden = !template.detail.textContent;
				if (template.detail.textContent) {
					template.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(template.detail, {
						content: template.detail.textContent, style: HoverStyle.Mouse,
					}, { groupId: this.hoverGroupId }));
				}
				template.description.textContent = entry.type === 'empty' || entry.type === 'group' && !!entry.kind ? entry.description ?? '' : '';
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
			case 'actions': {
				const showConfig = template.column === 'actions' && entry.type === 'group' && (entry.kind === 'ssh' || entry.kind === 'tunnel' || entry.kind === 'environment');
				const showDocumentation = template.column === 'actions' && entry.type === 'group' && !!entry.documentation;
				const showGroupCreate = template.column === 'actions' && entry.type === 'group' && !!entry.canCreate;
				const showConnection = template.column === 'actions' && entry.type === 'remote';
				const showConnect = showConnection && !entry.remote.connectsWithHost;
				// Remotes that connect with their host have no Connect action, but can still start sessions once connected.
				// Those the environment picker can't select, such as GitHub Environments, can't start sessions from here.
				const showNewSession = showConnection && RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus) && !entry.remote.pickerUnavailableReason;
				const pending = isConnectionPending(entry);
				const problem = showConnection && !pending ? getConnectionProblem(entry.remote) : undefined;
				const canConnect = showConnect && canConnectToRemote(entry.remote);
				const signIn = showConnection && entry.remote.requiresTunnelSignIn;
				template.container.classList.toggle('remotes-connection-pending', showConnection && pending);
				template.container.classList.toggle('remotes-connection-failed', !!problem);
				template.container.classList.toggle('remotes-sign-in-required', !!signIn);
				const showDelete = showConnection && (entry.remote.kind === 'environment' && entry.remote.canRemove || (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh' || entry.remote.kind === 'devContainer') && !!entry.remote.canDelete);
				const showCreateDevContainer = showConnection && !!entry.remote.canCreateDevContainer;
				const showLocationPreference = showConnection && (entry.remote.kind === 'tunnel' || entry.remote.kind === 'ssh');
				const showGitHubEnvironment = showConnection && (entry.remote.kind === 'ssh' || entry.remote.kind === 'wsl' || entry.remote.kind === 'tunnel')
					&& (!!entry.remote.canShareAsGitHubEnvironment || !!entry.remote.gitHubEnvironment);
				const showExtension = showConnection && !!entry.remote.contributedBy;
				const showUpdate = showConnection && !!entry.remote.canUpdateServer;
				const showCopyAddress = showConnection && !!entry.remote.copyableAddress;
				template.container.classList.toggle('remotes-cell-action-hidden', !showConfig && !showDocumentation && !showGroupCreate && !showConnection);
				if (template.column === 'actions') {
					const hideConnect = entry.type === 'group' ? !showGroupCreate && !showConfig : !showConnect || !canConnect && !pending && !problem && !signIn;
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
					template.documentation.label = localize('remotes.openSetupGuide', "Open Setup Guide");
					template.documentation.tooltip = entry.documentation.label;
				}
				if (showGroupCreate) {
					// Stays enabled while a Dev Container starts, so more can be created in parallel.
					template.createDevContainer.label = localize('remotes.createDevContainerInGroup', "Create Dev Container");
					template.createDevContainer.enabled = true;
				}
				template.action.enabled = true;
				template.action.tooltip = '';
				if (showConfig) {
					template.action.label = entry.kind === 'ssh' ? localize('remotes.openSSHConfig', "Open SSH Configuration")
						: entry.kind === 'environment' ? localize('remotes.openEnvironmentSettings', "Open GitHub Environments Settings")
							: localize('remotes.openTunnelSettings', "Open Dev Tunnels Settings");
					template.action.class = ThemeIcon.asClassName(Codicon.settingsGear);
				} else if (showConnection) {
					const connected = RemoteAgentHostConnectionStatus.isConnected(entry.remote.connectionStatus);
					template.action.label = pending ? getConnectionLabel(entry.remote, entry.connecting)
						: signIn ? localize('remotes.signIn', "Sign In") : connected ? localize('remotes.disconnectAction', "Disconnect") : localize('remotes.connectAction', "Connect");
					template.action.class = ThemeIcon.asClassName(signIn ? Codicon.signIn : connected ? Codicon.debugDisconnect : Codicon.debugConnected);
					template.action.enabled = !entry.busy && (canConnect || !!signIn)
						&& !RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
						&& !RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus);
					template.action.tooltip = pending ? localize('remotes.connectionProgress', "{0}: {1}", template.action.label, entry.remote.name)
						: signIn ? localize('remotes.signInForRemote', "Sign in to connect to {0}", entry.remote.name)
							: !connected && entry.remote.unavailableReason
								? localize('remotes.connectUnavailable', "Connect to {0}: {1}", entry.remote.name, entry.remote.unavailableReason)
								: connected ? localize('remotes.disconnectDetail', "Disconnect from {0}. Sessions may continue running on the remote computer.", entry.remote.name)
									: localize('remotes.connect', "Connect to {0}", entry.remote.name);
					template.connect.label = template.action.label;
					template.connect.iconElement.hidden = !pending && !problem;
					if (pending || problem) {
						template.connect.icon = problem ? Codicon.warning : ThemeIcon.modify(Codicon.loading, 'spin');
					}
					template.connect.enabled = template.action.enabled;
					template.connect.element.setAttribute('aria-label', problem ? localize('remotes.connectWithProblem', "Connect to {0}. {1}", entry.remote.name, problem) : pending
						? localize('remotes.connectionProgress', "{0}: {1}", template.action.label, entry.remote.name)
						: signIn || !connected && entry.remote.unavailableReason ? template.action.tooltip
							: connected ? localize('remotes.disconnect', "Disconnect {0}", entry.remote.name) : localize('remotes.connect', "Connect to {0}", entry.remote.name));
					template.elementDisposables.add(this.hoverService.setupDelayedHover(template.connect.element, {
						content: problem ?? template.action.tooltip,
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
					template.createDevContainer.label = localize('remotes.createDevContainer', "Create Dev Container");
					template.createDevContainer.enabled = showCreateDevContainer && !entry.busy;
					template.copyAddress.label = localize('remotes.copyAddress', "Copy Address");
					template.locationPreference.label = localize('remotes.locationPreference', "Configure Agent Run Behavior...");
					template.locationPreference.tooltip = remoteAgentRunBehaviorDescription;
					template.locationPreference.enabled = !entry.busy
						&& !RemoteAgentHostConnectionStatus.isConnecting(entry.remote.connectionStatus)
						&& !RemoteAgentHostConnectionStatus.isReconnecting(entry.remote.connectionStatus);
					template.troubleshoot.label = localize('remotes.troubleshootConnection', "Troubleshoot Connection...");
					template.troubleshoot.tooltip = localize('remotes.troubleshootConnectionDetail', "See what's known about this connection and what to try next");
					template.troubleshoot.enabled = !entry.busy;
					const share = entry.remote.gitHubEnvironment;
					template.gitHubEnvironment.label = share?.state === 'connecting' || share?.state === 'unavailable'
						? getGitHubEnvironmentLabel(entry.remote) ?? ''
						: share
							? localize('remotes.stopSharingAsGitHubEnvironment', "Stop Sharing as GitHub Environment")
							: localize('remotes.shareAsGitHubEnvironment', "Share as GitHub Environment");
					template.gitHubEnvironment.enabled = showGitHubEnvironment && !entry.busy && share?.state !== 'connecting' && share?.state !== 'unavailable';
					template.gitHubEnvironment.class = ThemeIcon.asClassName(share?.state === 'connecting' ? connectionProgressIcon : Codicon.github);
					template.showExtension.label = entry.remote.contributedBy ? localize('remotes.showExtension', "Show {0} Extension", entry.remote.contributedBy.displayName) : '';
					template.delete.label = entry.remote.kind === 'tunnel' ? localize('remotes.deleteTunnel', "Delete Dev Tunnel...")
						: entry.remote.kind === 'ssh' ? localize('remotes.forgetSSH', "Forget SSH Connection...")
							: entry.remote.kind === 'devContainer' ? localize('remotes.deleteDevContainer', "Delete Dev Container...")
								: localize('remotes.removeEnvironment', "Remove Environment...");
					template.delete.enabled = showDelete && !entry.busy;
					template.updateServer.label = localize('remotes.updateServer', "Update Server");
					template.updateServer.enabled = showUpdate && !entry.busy;
				}
				const groupPrimary = template.column === 'actions' && entry.type === 'group'
					? showGroupCreate ? { action: template.createDevContainer, kind: 'createDevContainer' as const } : showConfig ? { action: template.action, kind: 'configure' as const } : undefined
					: undefined;
				if (template.column === 'actions' && groupPrimary) {
					// The group heading names the type, so its settings button can stay short enough for the fixed actions column.
					template.connect.label = groupPrimary.kind === 'configure' && entry.type === 'group' && entry.kind !== 'ssh'
						? localize('remotes.openGroupSettings', "Open Settings") : groupPrimary.action.label;
					template.connect.iconElement.hidden = true;
					template.connect.enabled = groupPrimary.action.enabled;
					template.connect.element.setAttribute('aria-label', groupPrimary.action.label);
				}
				if (template.column === 'actions') {
					// An open overflow menu must retain its environment and labels when the row template is recycled.
					const menuAction = (action: Action, kind: RemoteRowAction) => toAction({
						id: action.id, label: action.label, tooltip: action.tooltip, class: action.class, enabled: action.enabled,
						run: () => this.onAction(entry, kind),
					});
					const secondary = showConnection ? Separator.join(
						[...(showNewSession ? [menuAction(template.newSessionAction, 'newSession')] : []),
						...(signIn ? [menuAction(template.action, 'signIn')] : showConnect && canConnect ? [menuAction(template.action, 'connect')] : []),
						...(showCreateDevContainer ? [menuAction(template.createDevContainer, 'createDevContainer')] : [])],
						showGitHubEnvironment ? [menuAction(template.gitHubEnvironment, 'githubEnvironment')] : [],
						[menuAction(template.visibility, 'toggleVisibility')],
						showCopyAddress ? [menuAction(template.copyAddress, 'copyAddress')] : [],
						[
							menuAction(template.rename, 'rename'),
							...(showLocationPreference ? [menuAction(template.locationPreference, 'locationPreference')] : []),
							menuAction(template.troubleshoot, 'troubleshoot'),
							...(showExtension ? [menuAction(template.showExtension, 'showExtension')] : []),
							...(showUpdate ? [menuAction(template.updateServer, 'updateServer')] : []),
							...(showDelete ? [menuAction(template.delete, 'delete')] : []),
						],
					) : Separator.join(
						groupPrimary ? [menuAction(groupPrimary.action, groupPrimary.kind)] : [],
						showDocumentation ? [menuAction(template.documentation, 'documentation')] : [],
					);
					const actionLayout = JSON.stringify([row.id, showConfig, showDocumentation, showGroupCreate, secondary.map(action => [action.id, action.label, action.tooltip, action.class, action.enabled])]);
					if (template.actionLayout !== actionLayout) {
						template.actionLayout = actionLayout;
						const activeElement = dom.getActiveElement();
						const focusedAction = dom.isHTMLElement(activeElement) && template.container.contains(activeElement) ? template.toolbar.getItemAction(activeElement) : undefined;
						template.toolbar.setActions([], secondary);
						if (focusedAction) {
							template.container.closest<HTMLElement>('.monaco-list')?.focus();
						}
					}
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

	private onDidSelectSandboxProfile(address: string, option: SandboxProfileOption | undefined): void {
		const connection = this.connections.getConnectionByAddress(address);
		if (!connection || readHostSandboxProfile(connection) === undefined || !option) {
			return;
		}
		switch (option.kind) {
			case 'default':
				assignHostSandboxProfile(connection, undefined);
				break;
			case 'assign':
				assignHostSandboxProfile(connection, option.profile);
				break;
			case 'save': {
				// Keeps the assignment; the dropdown then lists the profile with this machine's profiles.
				const library = readSandboxProfiles(this.storage);
				const profile = fromHostSandboxProfile(option.assignment);
				const names = new Set(library.map(existing => existing.name.toLowerCase()));
				let name = profile.name;
				for (let index = 2; names.has(name.toLowerCase()); index++) {
					name = `${profile.name} (${index})`;
				}
				writeSandboxProfiles(this.storage, [...library, { ...profile, name }]);
				break;
			}
		}
	}

	private updateFocus(template: RemoteCellTemplate): void {
		const focused = template.row?.id === this.focusedId;
		if (template.column === 'sandboxProfile') {
			template.select.setFocusable(focused && !template.container.classList.contains('remotes-cell-action-hidden'));
		} else if (template.column === 'actions') {
			template.toolbar.setFocusable(focused && !template.container.classList.contains('remotes-cell-action-hidden'));
			if (template.column === 'actions') {
				template.connect.element.tabIndex = focused && !template.connect.element.hidden ? 0 : -1;
				template.newSession.element.tabIndex = focused && !template.newSession.element.hidden ? 0 : -1;
			}
		} else if (template.column === 'name') {
			if (template.row?.entry.type !== 'empty') {
				return;
			}
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
