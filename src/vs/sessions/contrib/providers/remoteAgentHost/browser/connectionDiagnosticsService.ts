/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { normalizeRemoteAgentHostAddress } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { ConnectionDiagnosticBuffer, formatConnectionDiagnosticError, getConnectionDiagnosticError, type ConnectionDiagnosticObserver, type IRemoteConnectionDiagnosticEvent } from '../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ITunnelAgentHostService, ITunnelInfo, TUNNEL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ConnectionHostManagementAction, IConnectionDiagnosticsSection, IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot, IConnectionHostManagementEntry, IConnectionHostManagementState } from './connectionDiagnostics.js';
import { collectConnectionLogs } from './connectionDiagnosticsLogs.js';

interface IDiscoveryAttempt {
	readonly id: number;
	readonly trigger: string;
	readonly startedAt: number;
	finishedAt?: number;
	result: 'pending' | 'succeeded' | 'failed';
	error?: string;
}

interface IActivity {
	readonly time: number;
	readonly detail: string;
}

/** Captures local evidence, not remote probes or raw protocol/log payloads. */
export class ConnectionDiagnosticsService extends Disposable implements IConnectionDiagnosticsService {
	declare readonly _serviceBrand: undefined;
	protected get isWebPlatform(): boolean { return isWeb; }

	private readonly _onDidChangeHostManagement = this._register(new Emitter<void>());
	readonly onDidChangeHostManagement = this._onDidChangeHostManagement.event;

	private readonly _startedAt = Date.now();
	private readonly _activity: IActivity[] = [];
	private readonly _discoveryDiagnostics = new ConnectionDiagnosticBuffer();
	private readonly _connectionStates = new Map<string, string>();
	private _nextDiscoveryId = 1;
	private _lastDiscovery: IDiscoveryAttempt | undefined;
	private _lastSuccessfulDiscovery = 0;
	private _lastSuccessfulDiscoveryAt: number | undefined;
	private _discoveredTunnels: readonly ITunnelInfo[] = [];

	constructor(
		@IRemoteAgentHostService private readonly _remoteService: IRemoteAgentHostService,
		@ITunnelAgentHostService private readonly _tunnelService: ITunnelAgentHostService,
		@IAgentHostFilterService private readonly _filterService: IAgentHostFilterService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IProductService private readonly _productService: IProductService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._captureConnections();
		this._register(this._remoteService.onDidChangeConnections(() => {
			this._captureConnections();
			this._onDidChangeHostManagement.fire();
		}));
		if (this.isWebPlatform) {
			this._register(this._remoteService.onDidChangePendingConnections(() => this._onDidChangeHostManagement.fire()));
		}
		this._register(this._filterService.onDidChange(() => this._onDidChangeHostManagement.fire()));
		this._register(this._filterService.onDidChangeDiscovering(() => this._onDidChangeHostManagement.fire()));
		this._register(this._tunnelService.onDidChangeTunnels(() => this._onDidChangeHostManagement.fire()));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || event.affectsConfiguration(RemoteAgentHostAutoConnectSettingId)) {
				this._record(localize('diagnostics.settingsChanged', "Remote host connection settings changed."));
			}
		}));
		if (isWeb) {
			for (const event of ['online', 'offline']) {
				this._register(addDisposableListener(mainWindow, event, () => this._record(localize('diagnostics.networkChanged', "Browser network signal: {0}.", mainWindow.navigator.onLine ? 'online' : 'offline'))));
			}
			this._register(addDisposableListener(mainWindow.document, 'visibilitychange', () => this._record(localize('diagnostics.visibilityChanged', "Page visibility: {0}.", mainWindow.document.visibilityState))));
		}
	}

	async trackDiscovery(trigger: string, discover: (onDiagnostic: ConnectionDiagnosticObserver) => Promise<ITunnelInfo[]>): Promise<ITunnelInfo[]> {
		const attempt: IDiscoveryAttempt = { id: this._nextDiscoveryId++, trigger, startedAt: Date.now(), result: 'pending' };
		this._lastDiscovery = attempt;
		this._record(localize('diagnostics.discoveryStarted', "Discovery #{0} started ({1}).", attempt.id, trigger));
		try {
			const tunnels = await discover(event => this._discoveryDiagnostics.record(`discovery:${attempt.id}`, event));
			attempt.finishedAt = Date.now();
			attempt.result = 'succeeded';
			if (attempt.id > this._lastSuccessfulDiscovery) {
				this._lastSuccessfulDiscovery = attempt.id;
				this._lastSuccessfulDiscoveryAt = attempt.finishedAt;
				this._discoveredTunnels = tunnels.map(tunnel => ({ ...tunnel, tags: [] }));
			}
			const dismissed = tunnels.filter(tunnel => this._tunnelService.isTunnelDismissed(tunnel.tunnelId)).length;
			this._record(localize('diagnostics.discoveryFinished', "Discovery #{0} succeeded in {1} ms: {2} found, {3} with an active host, {4} dismissed.", attempt.id, attempt.finishedAt - attempt.startedAt, tunnels.length, tunnels.filter(tunnel => tunnel.hostConnectionCount > 0).length, dismissed));
			return tunnels;
		} catch (error) {
			attempt.finishedAt = Date.now();
			attempt.result = 'failed';
			attempt.error = formatConnectionDiagnosticError(getConnectionDiagnosticError(error));
			this._record(localize('diagnostics.discoveryFailed', "Discovery #{0} failed after {1} ms. {2}", attempt.id, attempt.finishedAt - attempt.startedAt, attempt.error));
			throw error;
		}
	}

	recordHostAction(address: string, action: 'connect' | 'disconnect', userInitiated: boolean): void {
		this._record(action === 'disconnect'
			? localize('diagnostics.disconnectedByUser', "{0}: disconnect requested by the user; automatic reconnect suppressed.", safeAddress(address))
			: localize('diagnostics.connectRequested', "{0}: connection requested ({1}).", safeAddress(address), userInitiated ? localize('diagnostics.user', "user") : localize('diagnostics.automatic', "automatic")));
	}

	getHostManagementState(): IConnectionHostManagementState {
		const connections = new Map(this._remoteService.connections.map(connection => [normalizeRemoteAgentHostAddress(connection.address), connection]));
		const pending = new Set(this.isWebPlatform ? this._remoteService.pendingConnections.map(attempt => attempt.address) : []);
		const visibility = this._tunnelService.getTunnelVisibility();
		const cached = new Map(this._tunnelService.getCachedTunnels().map(tunnel => [tunnel.tunnelId, tunnel]));
		const discovered = new Map(this._discoveredTunnels.map(tunnel => [tunnel.tunnelId, tunnel]));
		const selectableAddresses = new Set<string>();
		const hosts: IConnectionHostManagementEntry[] = this._filterService.hosts.map(host => {
			const address = host.address === undefined ? undefined : normalizeRemoteAgentHostAddress(host.address);
			if (address) {
				selectableAddresses.add(address);
			}
			const connectionStatus = address ? connections.get(address)?.status.kind : undefined;
			const status = address && pending.has(address) && (!connectionStatus || connectionStatus === 'disconnected') ? 'connecting'
				: connectionStatus ?? (host.status === 'connected' ? 'connected' : host.status === 'connecting' ? 'connecting' : 'disconnected');
			const tunnelId = address?.startsWith(TUNNEL_ADDRESS_PREFIX) ? address.slice(TUNNEL_ADDRESS_PREFIX.length) : undefined;
			return {
				id: host.id,
				label: host.label,
				address,
				status,
				selectable: true,
				selected: this._filterService.selectedHostId === host.id,
				hidden: false,
				autoConnectSuppressed: tunnelId !== undefined && visibility.autoConnectSuppressed.includes(tunnelId),
				connectable: host.connectable,
			};
		});
		for (const tunnelId of visibility.dismissed) {
			const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
			if (selectableAddresses.has(address)) {
				continue;
			}
			hosts.push({
				id: address,
				label: cached.get(tunnelId)?.name ?? discovered.get(tunnelId)?.name ?? tunnelId,
				address,
				status: connections.get(address)?.status.kind ?? 'disconnected',
				selectable: false,
				selected: false,
				hidden: true,
				autoConnectSuppressed: visibility.autoConnectSuppressed.includes(tunnelId),
				connectable: false,
			});
		}
		return { hosts, isDiscovering: this._filterService.isDiscovering };
	}

	async runHostAction(hostId: string, action: ConnectionHostManagementAction): Promise<void> {
		const current = this.getHostManagementState().hosts.find(host => host.id === hostId);
		if (!current) {
			throw new Error(localize('connectionDiagnostics.hostNoLongerAvailable', "The host is no longer available."));
		}
		if (action === 'restore') {
			if (!current.hidden || !current.address?.startsWith(TUNNEL_ADDRESS_PREFIX)) {
				throw new Error(localize('connectionDiagnostics.hostNotHidden', "The host is not hidden."));
			}
			this._tunnelService.clearTunnelDismissal(current.address.slice(TUNNEL_ADDRESS_PREFIX.length));
			if (!await this._filterService.rediscover()) {
				throw new Error(localize('connectionDiagnostics.restoreDiscoveryFailed', "Host is no longer hidden, but discovery failed. Use Refresh to try again."));
			}
			return;
		}
		if (!current.selectable || !current.connectable) {
			throw new Error(localize('connectionDiagnostics.hostNotManageable', "The host does not have manual connection controls."));
		}
		if (action === 'disconnect') {
			await this._filterService.disconnect(current.id);
			return;
		}
		await this._filterService.reconnect(current.id);
	}

	rediscover(): Promise<boolean> {
		return this._filterService.rediscover();
	}

	private _record(detail: string): void {
		this._activity.push({ time: Date.now(), detail });
		if (this._activity.length > 100) {
			this._activity.shift();
		}
	}

	private _captureConnections(): void {
		const present = new Set<string>();
		for (const connection of this._remoteService.connections) {
			present.add(connection.address);
			const state = connection.status;
			const key = JSON.stringify(state);
			if (this._connectionStates.get(connection.address) === key) {
				continue;
			}
			this._connectionStates.set(connection.address, key);
			const detail = state.kind === 'reconnecting' && state.nextAttemptAt
				? localize('diagnostics.retryScheduled', "reconnecting; next attempt at {0}", new Date(state.nextAttemptAt).toISOString())
				: state.kind;
			this._record(localize('diagnostics.connectionState', "{0}: {1}.", safeAddress(connection.address), detail));
		}
		for (const address of this._connectionStates.keys()) {
			if (!present.has(address)) {
				this._connectionStates.delete(address);
				this._record(localize('diagnostics.connectionRemoved', "{0}: connection entry removed.", safeAddress(address)));
			}
		}
	}

	async getSnapshot(): Promise<IConnectionDiagnosticsSnapshot> {
		const capturedAtMs = Date.now();
		const capturedAt = new Date(capturedAtMs).toISOString();
		const sections: IConnectionDiagnosticsSection[] = [];
		const enabled = this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
		const autoConnect = this._configurationService.getValue<boolean>(RemoteAgentHostAutoConnectSettingId);
		const yesNo = (value: boolean) => value ? localize('diagnostics.yes', "Yes") : localize('diagnostics.no', "No");
		const cached = this._tunnelService.getCachedTunnels();
		const visibility = this._tunnelService.getTunnelVisibility();
		const configured = new Map(this._remoteService.configuredEntries.map(entry => [normalizeRemoteAgentHostAddress(getEntryAddress(entry)), entry]));
		const connections = new Map(this._remoteService.connections.map(connection => [normalizeRemoteAgentHostAddress(connection.address), connection]));
		const connectionDiagnostics = this._remoteService.getConnectionDiagnostics();
		const lastStages = new Map<string, IRemoteConnectionDiagnosticEvent>();
		for (const event of connectionDiagnostics) {
			lastStages.set(normalizeRemoteAgentHostAddress(event.address), event);
		}
		const pending = new Map((this.isWebPlatform ? this._remoteService.pendingConnections : []).map(attempt => [attempt.address, attempt]));
		const discovered = new Map(this._discoveredTunnels.map(tunnel => [`${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`, tunnel]));
		const cachedByAddress = new Map(cached.map(tunnel => [`${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`, tunnel]));
		const addresses = new Set([...discovered.keys(), ...cachedByAddress.keys(), ...configured.keys(), ...connections.keys()]);
		for (const id of [...visibility.dismissed, ...visibility.autoConnectSuppressed]) {
			addresses.add(`${TUNNEL_ADDRESS_PREFIX}${id}`);
		}
		const visible = new Map(this._filterService.hosts.flatMap(host => host.address === undefined ? [] : [[normalizeRemoteAgentHostAddress(host.address), host] as const]));
		for (const address of visible.keys()) {
			addresses.add(address);
		}

		const hostSections: IConnectionDiagnosticsSection[] = [];
		for (const address of addresses) {
			const tunnel = discovered.get(address);
			const cache = cachedByAddress.get(address);
			const entry = configured.get(address);
			const connection = connections.get(address);
			const attempt = pending.get(address);
			const connectionStatus = attempt && (!connection || connection.status.kind === 'disconnected') ? 'connecting' : connection?.status.kind;
			const pickerHost = visible.get(address);
			const tunnelId = address.startsWith(TUNNEL_ADDRESS_PREFIX) ? address.slice(TUNNEL_ADDRESS_PREFIX.length) : undefined;
			const dismissed = tunnelId !== undefined && this._tunnelService.isTunnelDismissed(tunnelId);
			const suppressed = tunnelId !== undefined && this._tunnelService.isAutoConnectSuppressed(tunnelId);
			const name = safeAddress(tunnel?.name ?? cache?.name ?? entry?.name ?? connection?.name ?? pickerHost?.label ?? address);
			const entries = [
				{ label: localize('diagnostics.address', "Address"), value: safeAddress(address) },
				{ label: localize('diagnostics.transport', "Connection type"), value: entry?.connection.type ?? (tunnelId !== undefined ? 'tunnel' : localize('diagnostics.unknown', "Unknown")) },
				{ label: localize('diagnostics.status', "Connection status"), value: connectionStatus ?? localize('diagnostics.notObserved', "No connection entry") },
				{ label: localize('diagnostics.selectableLabel', "Selectable"), value: yesNo(!!pickerHost) },
				{ label: localize('diagnostics.configured', "Configured"), value: yesNo(!!entry) },
				{ label: localize('diagnostics.cached', "Cached"), value: yesNo(!!cache) },
				{ label: localize('diagnostics.discovered', "In last successful discovery"), value: yesNo(!!tunnel) },
			];
			if (attempt) {
				entries.push(
					{ label: localize('diagnostics.pendingAttempt', "Connection attempt"), value: localize('diagnostics.pending', "Pending") },
					{ label: localize('diagnostics.attemptPhase', "Attempt phase"), value: connection?.clientId ? localize('diagnostics.protocolPending', "Protocol connection") : localize('diagnostics.setupPending', "Connection setup (before protocol client)") },
					{ label: localize('diagnostics.attemptStarted', "Attempt started at"), value: new Date(attempt.startedAt).toISOString() },
					{ label: localize('diagnostics.attemptElapsed', "Attempt elapsed at capture (ms)"), value: String(Math.max(0, capturedAtMs - attempt.startedAt)) },
					{ label: localize('diagnostics.attemptTrigger', "Attempt trigger"), value: attempt.userInitiated ? localize('diagnostics.user', "user") : localize('diagnostics.automatic', "automatic") },
					{ label: localize('diagnostics.connectionEntryPresent', "Connection entry present"), value: yesNo(!!connection) },
				);
			}
			if (tunnelId !== undefined) {
				entries.push(
					{ label: localize('diagnostics.dismissedLabel', "Persistently dismissed"), value: yesNo(dismissed) },
					{ label: localize('diagnostics.suppressedLabel', "Auto-connect suppressed"), value: yesNo(suppressed) },
				);
			}
			if (tunnel) {
				entries.push(
					{ label: localize('diagnostics.cluster', "Tunnel cluster"), value: safeAddress(tunnel.clusterId) },
					{ label: localize('diagnostics.activeHostCount', "Active tunnel hosts"), value: String(tunnel.hostConnectionCount) },
					{ label: localize('diagnostics.tunnelProtocol', "Tunnel protocol version"), value: String(tunnel.protocolVersion) },
				);
			}
			if (connection?.clientId) {
				entries.push({ label: localize('diagnostics.clientId', "Protocol client ID"), value: connection.clientId });
			}
			const stage = lastStages.get(address);
			if (stage) {
				entries.push(
					{ label: localize('diagnostics.lastStage', "Last observed connection stage"), value: `${stage.phase}: ${stage.outcome}` },
					{ label: localize('diagnostics.stageTime', "Stage observed at"), value: new Date(stage.timestamp).toISOString() },
				);
				if (stage.error) {
					entries.push({ label: localize('diagnostics.stageError', "Stage error"), value: formatConnectionDiagnosticError(stage.error) });
				}
			}
			if (connection?.status.kind === 'disconnected') {
				entries.push({ label: localize('diagnostics.disconnectReason', "Disconnect reason"), value: connection.status.reason });
			}
			if (connection?.status.kind === 'incompatible') {
				entries.push(
					{ label: localize('diagnostics.clientProtocols', "Client protocol versions"), value: connection.status.supportedByClient.join(', ') },
					{ label: localize('diagnostics.serverProtocols', "Server protocol versions"), value: connection.status.offeredByServer?.join(', ') ?? localize('diagnostics.unknown', "Unknown") },
				);
			}
			if (connection?.status.kind === 'reconnecting' && connection.status.nextAttemptAt) {
				entries.push({ label: localize('diagnostics.nextRetry', "Next reconnect attempt"), value: new Date(connection.status.nextAttemptAt).toISOString() });
			}
			const root = this._remoteService.getConnection(address)?.rootState.value;
			if (root && !(root instanceof Error)) {
				entries.push({ label: localize('diagnostics.agents', "Advertised agents"), value: root.agents.map(agent => agent.provider).join(', ') });
			}
			hostSections.push({
				title: localize('diagnostics.hostSummary', "{0} - {1}, {2}", name, connectionStatus ?? localize('diagnostics.noConnection', "no connection"), pickerHost ? localize('diagnostics.selectable', "selectable") : localize('diagnostics.notSelectable', "not selectable")),
				hostAddress: address,
				collapsed: true,
				entries,
			});
		}

		const clientSection: IConnectionDiagnosticsSection = {
			title: localize('diagnostics.environment', "This client"),
			collapsed: true,
			entries: [
				{ label: localize('diagnostics.captured', "Captured at"), value: capturedAt },
				{ label: localize('diagnostics.version', "Version"), value: this._productService.version },
				{ label: localize('diagnostics.commit', "Commit"), value: this._productService.commit ?? localize('diagnostics.unknown', "Unknown") },
				{ label: localize('diagnostics.clientKind', "Client"), value: isWeb ? localize('diagnostics.web', "Web") : localize('diagnostics.desktop', "Desktop") },
				{ label: localize('diagnostics.online', "Browser online signal"), value: yesNo(mainWindow.navigator.onLine) },
				{ label: localize('diagnostics.visibility', "Page visibility"), value: mainWindow.document.visibilityState },
				{ label: localize('diagnostics.secureContext', "Secure browser context"), value: yesNo(mainWindow.isSecureContext) },
				{ label: localize('diagnostics.standalone', "Standalone display mode"), value: yesNo(mainWindow.matchMedia('(display-mode: standalone)').matches) },
				{ label: localize('diagnostics.enabled', "Remote hosts enabled"), value: yesNo(enabled) },
				{ label: localize('diagnostics.autoConnect', "Automatic connections enabled"), value: yesNo(autoConnect) },
				{ label: localize('diagnostics.visibleCount', "Host picker entries"), value: String(this._filterService.hosts.length) },
				{ label: localize('diagnostics.selected', "Selected host"), value: safeAddress(this._filterService.selectedHost?.label ?? localize('diagnostics.none', "None")) },
			],
		};
		const attempt = this._lastDiscovery;
		sections.push({
			title: this.discoveryTitle(),
			collapsed: true,
			description: localize('diagnostics.discoveryScope', "Host details use the last successful discovery in this window; they may be stale. No network requests are made when viewing or copying diagnostics."),
			entries: attempt ? [
				{ label: localize('diagnostics.attempt', "Attempt"), value: `#${attempt.id}` },
				{ label: localize('diagnostics.trigger', "Trigger"), value: attempt.trigger },
				{ label: localize('diagnostics.result', "Result"), value: attempt.result },
				...(attempt.error ? [{ label: localize('diagnostics.error', "Error"), value: attempt.error }] : []),
				{ label: localize('diagnostics.started', "Started at"), value: new Date(attempt.startedAt).toISOString() },
				{ label: localize('diagnostics.duration', "Duration (ms)"), value: String((attempt.finishedAt ?? Date.now()) - attempt.startedAt) },
				{ label: localize('diagnostics.discoveredCount', "Hosts in last successful discovery"), value: String(discovered.size) },
				{ label: localize('diagnostics.lastSuccess', "Last successful discovery"), value: this._lastSuccessfulDiscoveryAt === undefined ? localize('diagnostics.none', "None") : new Date(this._lastSuccessfulDiscoveryAt).toISOString() },
				{ label: localize('diagnostics.cachedCount', "Cached tunnels"), value: String(cached.length) },
			] : [{ label: localize('diagnostics.result', "Result"), value: localize('diagnostics.noDiscovery', "No discovery observed in this window.") }],
		});
		sections.push(...hostSections, {
			title: localize('diagnostics.activity', "Recent activity logs"),
			collapsed: true,
			description: localize('diagnostics.activityScope', "Up to 100 local events since {0}. Earlier history is not captured. Host names and addresses are included; review before sharing.", new Date(this._startedAt).toISOString()),
			entries: this._activity.map(event => ({ label: new Date(event.time).toISOString(), value: event.detail })),
		}, {
			title: localize('diagnostics.phases', "Connection and discovery stages"),
			collapsed: true,
			description: localize('diagnostics.phaseScope', "Up to 200 connection and 200 discovery events from this window. A start without a completion may still be pending, or its completion may not have been captured. Error descriptions are redacted and bounded. These are client observations, not server logs."),
			entries: [...connectionDiagnostics, ...this._discoveryDiagnostics.getEvents()]
				.sort((a, b) => a.timestamp - b.timestamp)
				.map(event => ({
					label: `${new Date(event.timestamp).toISOString()} ${safeAddress(event.address)}`,
					value: [
						`${event.phase}: ${event.outcome} (operation ${event.operationId})`,
						event.attemptId ? `attempt=${event.attemptId}` : undefined,
						event.durationMs === undefined ? undefined : `${event.durationMs} ms`,
						event.detail,
						event.error ? formatConnectionDiagnosticError(event.error) : undefined,
					].filter(value => value !== undefined).join('; '),
				})),
		}, await collectConnectionLogs(this._fileService, this._environmentService.logFile), clientSection);
		const text = [
			localize('diagnostics.title', "Connection diagnostics"),
			...sections.flatMap(section => ['', section.title, ...(section.description ? [section.description] : []), ...section.entries.map(entry => `${entry.label}: ${entry.value}`)]),
		].join('\n');
		return { capturedAt, sections, text };
	}

	private discoveryTitle(): string {
		switch (this._lastDiscovery?.result) {
			case 'succeeded':
				return this._discoveredTunnels.length === 1
					? localize('diagnostics.discoveryOne', "Tunnel discovery successful with 1 tunnel")
					: localize('diagnostics.discoveryMany', "Tunnel discovery successful with {0} tunnels", this._discoveredTunnels.length);
			case 'failed': return localize('diagnostics.discoveryFailedTitle', "Tunnel discovery failed");
			case 'pending': return localize('diagnostics.discoveryPendingTitle', "Tunnel discovery in progress");
			default: return localize('diagnostics.discoveryNotObserved', "Tunnel discovery not yet observed");
		}
	}
}

/** Excludes URL credentials, query strings and fragments, including normalized WebSocket addresses. */
function safeAddress(value: string): string {
	return value.replace(/[\r\n\t]/g, ' ').split(/[?#]/, 1)[0].replace(/(^|\/\/)[^/]*@/, '$1').slice(0, 512);
}

registerSingleton(IConnectionDiagnosticsService, ConnectionDiagnosticsService, InstantiationType.Delayed);
