/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tunnel, TunnelPort } from '@microsoft/dev-tunnels-contracts';
import type { TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { connect } from 'net';
import { hostname } from 'os';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogger, ILoggerService } from '../../log/common/log.js';
import { localize } from '../../../nls.js';
import { CONFIGURATION_KEY_HOST_NAME, normalizeTunnelName, tunnelNameFromHostname } from '../../remoteTunnel/common/remoteTunnel.js';
import {
	ITunnelAgentHostHostingService,
	PROTOCOL_VERSION_TAG_PREFIX,
	TUNNEL_AGENT_HOST_PORT,
	TUNNEL_HOST_LOG_ID,
	TUNNEL_LAUNCHER_LABEL,
	TUNNEL_MIN_PROTOCOL_VERSION,
	type ITunnelHostInfo,
	type TunnelHostStatus,
} from '../common/tunnelAgentHost.js';
import type { IAgentHostSocketInfo } from '../common/agentService.js';

/** State of a currently hosted tunnel. */
interface IActiveTunnel {
	readonly info: ITunnelHostInfo;
	readonly tunnel: Tunnel;
	readonly host: { dispose(): void };
	readonly client: TunnelManagementHttpClient;
	readonly created: boolean;
}

export class TunnelHostMainService extends Disposable implements ITunnelAgentHostHostingService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<TunnelHostStatus>());
	readonly onDidChangeStatus: Event<TunnelHostStatus> = this._onDidChangeStatus.event;

	private readonly _activeTunnel = this._register(new MutableDisposable());
	private _active: IActiveTunnel | undefined;

	private readonly _logger: ILogger;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILoggerService loggerService: ILoggerService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
	) {
		super();

		this._logger = this._register(loggerService.createLogger(
			joinPath(environmentService.logsHome, `${TUNNEL_HOST_LOG_ID}.log`),
			{ id: TUNNEL_HOST_LOG_ID, name: localize('tunnelHost.log', "Remote Connections") },
		));
	}

	async startHosting(token: string, authProvider: 'github' | 'microsoft', socketInfo: IAgentHostSocketInfo): Promise<ITunnelHostInfo> {
		// Stop any existing tunnel first
		if (this._active) {
			await this.stopHosting();
		}

		const tunnelName = this._getTunnelName();
		this._logger.info(`Starting tunnel hosting as '${tunnelName}'...`);

		const client = await this._createManagementClient(token, authProvider);

		// Create tunnel with agent host port and appropriate labels
		const protocolVersionTag = `${PROTOCOL_VERSION_TAG_PREFIX}${TUNNEL_MIN_PROTOCOL_VERSION}`;

		const agentHostPort: TunnelPort = {
			portNumber: TUNNEL_AGENT_HOST_PORT,
			protocol: 'https',
		};
		const labels = [TUNNEL_LAUNCHER_LABEL, tunnelName, protocolVersionTag];

		const newTunnel: Tunnel = {
			ports: [agentHostPort],
			labels,
		};

		// The SDK mutates the request options it is handed — `updateTunnel`
		// injects an `If-Match: *` header, `createTunnel` an `If-Not-Match: *`
		// — so every call gets its own object. Sharing one leaks a stale
		// precondition onto the next request, which makes the service reject
		// the agent host port with a 404 when that port does not exist yet.
		const tunnelRequestOptions = () => ({
			tokenScopes: ['host', 'connect'],
			includePorts: true,
		});

		const [existingTunnel] = await client.listTunnels(undefined, undefined, {
			labels: [TUNNEL_LAUNCHER_LABEL, tunnelName],
			requireAllLabels: true,
			includePorts: true,
			tokenScopes: ['host', 'connect'],
			limit: 1,
		});
		const rawHostConnectionCount = existingTunnel?.status?.hostConnectionCount;
		const hostConnectionCount = typeof rawHostConnectionCount === 'number' ? rawHostConnectionCount : (rawHostConnectionCount?.current ?? 0);

		let tunnel: Tunnel | undefined;
		let created = false;
		if (existingTunnel && hostConnectionCount === 0) {
			try {
				const existingLabels = existingTunnel.labels ?? [];
				const hasCurrentLabels = labels.every(l => existingLabels.includes(l))
					&& !existingLabels.some(l => l.startsWith(PROTOCOL_VERSION_TAG_PREFIX) && l !== protocolVersionTag);
				const hasAgentHostPort = existingTunnel.ports?.some(p => p.portNumber === TUNNEL_AGENT_HOST_PORT) ?? false;

				if (hasCurrentLabels && hasAgentHostPort) {
					tunnel = existingTunnel;
				} else {
					let adopted = existingTunnel;
					if (!hasCurrentLabels) {
						adopted = await client.updateTunnel({
							tunnelId: existingTunnel.tunnelId,
							clusterId: existingTunnel.clusterId,
							labels,
						}, tunnelRequestOptions());
					}
					if (!hasAgentHostPort) {
						await client.createOrUpdateTunnelPort(adopted, agentHostPort, tunnelRequestOptions());
					}
					tunnel = await client.getTunnel(adopted, tunnelRequestOptions()) ?? adopted;
				}
				this._logger.info(`Adopted existing inactive tunnel: ${tunnel.tunnelId} in cluster ${tunnel.clusterId}`);
			} catch (err) {
				// Falling back to creating a tunnel costs us the de-duplication
				// but still gets the user connected.
				this._logger.warn(`Failed to adopt existing tunnel ${existingTunnel.tunnelId}, creating a new one instead`, err);
			}
		} else if (existingTunnel) {
			this._logger.warn(`Tunnel name '${tunnelName}' is already in use by another active host; creating a new tunnel`);
		}

		if (!tunnel) {
			tunnel = await client.createOrUpdateTunnel(newTunnel, tunnelRequestOptions());
			created = true;
			this._logger.info(`Tunnel created: ${tunnel.tunnelId} in cluster ${tunnel.clusterId}`);
		}

		// Host the tunnel using TunnelRelayTunnelHost.
		// We disable automatic local port forwarding so that we can capture
		// the raw data stream and pipe it into the agent host process
		// directly, without needing a physical TCP listener on port 31546.
		const { TunnelRelayTunnelHost } = await import('@microsoft/dev-tunnels-connections');
		const host = new TunnelRelayTunnelHost(client);
		host.forwardConnectionsToLocalPorts = false;
		host.trace = (_level: unknown, _eventId: unknown, msg: string) => {
			this._logger.debug(`relay: ${msg}`);
		};

		// When a remote client connects to the tunnel port, the SDK fires
		// the forwardedPortConnecting event with the port number and an
		// SshStream for the connection. We pipe that stream into a
		// connection to the local agent host process.
		const { socketPath } = socketInfo;

		host.forwardedPortConnecting((e: { port: number; stream: NodeJS.ReadWriteStream }) => {
			if (e.port === TUNNEL_AGENT_HOST_PORT) {
				this._logger.info(`Incoming connection on port ${TUNNEL_AGENT_HOST_PORT}, piping to local agent host`);
				this._pipeToLocalAgentHost(e.stream, socketPath);
			} else {
				this._logger.warn(`Unexpected port ${e.port}, closing stream`);
				e.stream.end?.();
			}
		});

		await host.connect(tunnel);
		this._logger.info(`Tunnel relay host connected`);

		// An adopted tunnel may carry additional forwarded ports, so look the
		// agent host port up by number rather than assuming it comes first.
		const domain = tunnel.ports?.find(p => p.portNumber === TUNNEL_AGENT_HOST_PORT)?.portForwardingUris?.[0] ?? `${tunnel.tunnelId}.${tunnel.clusterId}.devtunnels.ms`;
		const info: ITunnelHostInfo = {
			tunnelName,
			tunnelId: tunnel.tunnelId!,
			clusterId: tunnel.clusterId!,
			domain: typeof domain === 'string' ? domain : `${tunnel.tunnelId}.${tunnel.clusterId}.devtunnels.ms`,
		};

		this._active = { info, tunnel, host, client, created };
		this._activeTunnel.value = {
			dispose: () => {
				host.dispose();
				this._active = undefined;
			}
		};

		this._onDidChangeStatus.fire({ active: true, info });
		return info;
	}

	async stopHosting(): Promise<void> {
		if (!this._active) {
			return;
		}

		const { tunnel, client, created } = this._active;
		this._logger.info(`Stopping tunnel hosting...`);

		if (created) {
			// Delete the tunnel from the management service before
			// tearing down the local relay so we can retry on failure
			try {
				await client.deleteTunnel(tunnel);
				this._logger.info(`Tunnel deleted`);
			} catch (err) {
				this._logger.warn(`Failed to delete tunnel`, err);
			}
		} else {
			this._logger.info(`Leaving adopted tunnel ${tunnel.tunnelId} in place`);
		}

		this._activeTunnel.clear();

		this._onDidChangeStatus.fire({ active: false });
	}

	async getStatus(): Promise<TunnelHostStatus> {
		if (this._active) {
			return { active: true, info: this._active.info };
		}
		return { active: false };
	}

	/**
	 * Get the sanitized tunnel name from configuration or OS hostname.
	 */
	private _getTunnelName(): string {
		const configured = this._configurationService.getValue<string>(CONFIGURATION_KEY_HOST_NAME);
		return (configured ? normalizeTunnelName(configured) : tunnelNameFromHostname(hostname())) || 'vscode';
	}

	private async _createManagementClient(token: string, authProvider: 'github' | 'microsoft'): Promise<TunnelManagementHttpClient> {
		const mgmt = await import('@microsoft/dev-tunnels-management');
		const authHeader = authProvider === 'github' ? `github ${token}` : `Bearer ${token}`;

		return new mgmt.TunnelManagementHttpClient(
			'vscode-sessions',
			mgmt.ManagementApiVersions.Version20230927preview,
			async () => authHeader,
		);
	}

	/**
	 * Pipe an incoming tunnel stream to the local agent host.
	 * The SshStream from the dev tunnels SDK is a Node.js duplex stream — we
	 * connect to the agent host's local socket and bidirectionally pipe data.
	 */
	private _pipeToLocalAgentHost(incomingStream: NodeJS.ReadWriteStream, socketPath: string): void {
		const socket = connect(socketPath);

		socket.on('connect', () => {
			this._logger.debug(`Connected to local agent host socket`);
			incomingStream.pipe(socket);
			socket.pipe(incomingStream);
		});

		socket.on('error', (err) => {
			this._logger.error(`Socket error`, err);
			incomingStream.end?.();
		});

		incomingStream.on('error', () => {
			socket.destroy();
		});
	}

	override dispose(): void {
		if (this._active) {
			// Best-effort cleanup on dispose — don't await
			this.stopHosting().catch(() => { /* ignore */ });
		}
		super.dispose();
	}
}
