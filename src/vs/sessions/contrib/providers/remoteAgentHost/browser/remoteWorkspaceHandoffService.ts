/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { decodeHex } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equalsIgnoreCase } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { addSSHRemoteAgentHostEntry, getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { computeSSHConnectionKey, ISSHRemoteAgentHostService } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService, TunnelAuthenticationRequiredError } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { getRemoteName } from '../../../../../platform/remote/common/remoteHosts.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { IRemoteWorkspaceFolder, IRemoteWorkspaceHandoffService, RemoteWorkspaceHandoffResult } from '../../../../common/remoteWorkspaceHandoff.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';

/** How long to wait for a host's provider after adding the host. */
const PROVIDER_REGISTRATION_TIMEOUT_MS = 15_000;

/** The machine named by a VS Code remote authority that a remote agent host can run on. */
type RemoteMachine =
	| { readonly kind: 'ssh'; readonly sshConfigHost: string }
	| { readonly kind: 'ssh'; readonly sshConfigHost?: undefined; readonly hostName: string; readonly user: string | undefined; readonly port: number | undefined }
	| { readonly kind: 'wsl'; readonly distro: string }
	| { readonly kind: 'tunnel'; readonly name: string };

/** A parsed machine; an undefined WSL distribution is the default one. */
type ParsedRemoteMachine = RemoteMachine | { readonly kind: 'wsl'; readonly distro: undefined };

interface ISSHHost {
	readonly hostName: string;
	readonly user?: string;
	readonly port?: number;
}

/**
 * Parses SSH, WSL and Tunnel remote authorities as their extensions do:
 * - Remote - SSH (`HostInfo.parse`): hex-encoded JSON or a plain `[user@]host[:port]`. Its host name doubles as an
 *   SSH config alias even with an explicit user or port, which the agent host's SSH connection also resolves.
 * - Remote - WSL (`getDistroFromAuthority`): `default` names the default distribution, and `@` (or `%40`) a WSL
 *   on another machine, which this machine cannot reach.
 * - Remote - Tunnels: the tunnel name, or `<tunnel id>.<cluster>`.
 */
export function parseRemoteMachine(remoteAuthority: string): ParsedRemoteMachine | undefined {
	const remoteName = getRemoteName(remoteAuthority);
	const host = remoteAuthority.slice(remoteName.length + 1);
	if (!host) {
		return undefined;
	}
	switch (remoteName) {
		case 'ssh-remote': {
			const parsed = readSSHAuthorityObject(host) ?? parseSSHHostString(host);
			return parsed.user === undefined && parsed.port === undefined
				? { kind: 'ssh', sshConfigHost: parsed.hostName }
				: { kind: 'ssh', hostName: parsed.hostName, user: parsed.user, port: parsed.port };
		}
		case 'wsl':
			if (/@|%40/i.test(host)) {
				return undefined;
			}
			return { kind: 'wsl', distro: host === 'default' ? undefined : host };
		case 'tunnel':
			return { kind: 'tunnel', name: host };
		default:
			return undefined;
	}
}

function readSSHAuthorityObject(host: string): ISSHHost | undefined {
	try {
		const value: { hostName?: unknown; user?: unknown; port?: unknown } = JSON.parse(decodeHex(host).toString());
		if (typeof value?.hostName !== 'string' || !value.hostName) {
			return undefined;
		}
		return {
			hostName: value.hostName,
			user: typeof value.user === 'string' && value.user ? value.user : undefined,
			port: typeof value.port === 'number' ? value.port : undefined,
		};
	} catch {
		// Plain host names are not hex-encoded JSON.
		return undefined;
	}
}

/** Mirrors `HostInfo.fromString` of Remote - SSH. An address with more than one colon is an IPv6 address. */
function parseSSHHostString(host: string): ISSHHost {
	const { user, address = host } = /^(?:(?<user>.*)@)?(?<address>.+?)$/.exec(host)?.groups ?? {};
	const toPort = (port: string | undefined) => port ? parseInt(port, 10) : undefined;
	const bracketed = /^\[(?<hostName>.+?)\](?::(?<port>\d+))?$/.exec(address)?.groups;
	if (bracketed) {
		return { hostName: bracketed.hostName, user: user || undefined, port: toPort(bracketed.port) };
	}
	if (address.indexOf(':') !== address.lastIndexOf(':')) {
		return { hostName: address, user: user || undefined };
	}
	const withPort = /^(?<hostName>.+?)(?::(?<port>\d+))?$/.exec(address)?.groups;
	return { hostName: withPort?.hostName ?? address, user: user || undefined, port: toPort(withPort?.port) };
}

function isDefaultDistro(machine: ParsedRemoteMachine): machine is { readonly kind: 'wsl'; readonly distro: undefined } {
	return machine.kind === 'wsl' && machine.distro === undefined;
}

function matchesTunnel(tunnel: { readonly name: string; readonly tunnelId: string; readonly clusterId: string }, name: string): boolean {
	return equalsIgnoreCase(tunnel.name, name) || equalsIgnoreCase(`${tunnel.tunnelId}.${tunnel.clusterId}`, name);
}

function matchesMachine(entry: IRemoteAgentHostEntry, machine: RemoteMachine): boolean {
	const connection = entry.connection;
	switch (machine.kind) {
		case 'ssh':
			if (connection.type !== RemoteAgentHostEntryType.SSH) {
				return false;
			}
			if (machine.sshConfigHost !== undefined) {
				return connection.sshConfigHost !== undefined && equalsIgnoreCase(connection.sshConfigHost, machine.sshConfigHost);
			}
			return connection.sshConfigHost === undefined
				&& equalsIgnoreCase(connection.hostName, machine.hostName)
				&& (machine.user === undefined || connection.user === machine.user)
				&& (connection.port ?? 22) === (machine.port ?? 22);
		case 'wsl':
			return connection.type === RemoteAgentHostEntryType.WSL && equalsIgnoreCase(connection.distro, machine.distro);
		case 'tunnel':
			return connection.type === RemoteAgentHostEntryType.Tunnel
				&& matchesTunnel({ name: connection.label ?? connection.tunnelId, tunnelId: connection.tunnelId, clusterId: connection.clusterId }, machine.name);
	}
}

function getMachineLabel(machine: RemoteMachine): string {
	switch (machine.kind) {
		case 'ssh': return machine.sshConfigHost ?? (machine.user ? `${machine.user}@${machine.hostName}` : machine.hostName);
		case 'wsl': return machine.distro;
		case 'tunnel': return machine.name;
	}
}

export class RemoteWorkspaceHandoffService extends Disposable implements IRemoteWorkspaceHandoffService {
	declare readonly _serviceBrand: undefined;

	private readonly _connections = new CancellationTokenSource();

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@ISSHRemoteAgentHostService private readonly _sshService: ISSHRemoteAgentHostService,
		@IWSLRemoteAgentHostService private readonly _wslService: IWSLRemoteAgentHostService,
		@ITunnelAgentHostService private readonly _tunnelService: ITunnelAgentHostService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IStorageService private readonly _storageService: IStorageService,
		@IProgressService private readonly _progressService: IProgressService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this._connections.dispose(true)));
	}

	async resolveFolder(folder: IRemoteWorkspaceFolder, token: CancellationToken): Promise<RemoteWorkspaceHandoffResult> {
		const parsed = parseRemoteMachine(folder.remoteAuthority);
		if (!parsed) {
			return { unavailableReason: localize('remoteWorkspaceHandoff.unsupported', "The Agents Window cannot connect to this kind of remote.") };
		}
		if (this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) !== true) {
			return { unavailableReason: localize('remoteWorkspaceHandoff.disabled', "Remote agent hosts are disabled.") };
		}
		let machine: RemoteMachine | undefined;
		let entry: IRemoteAgentHostEntry | undefined;
		try {
			machine = isDefaultDistro(parsed) ? await raceCancellationError(this._getDefaultDistro(), token) : parsed;
			if (!machine) {
				return { unavailableReason: localize('remoteWorkspaceHandoff.wslNoDefaultDistro', "No default WSL distribution was found. Remote agent hosts require WSL 2.") };
			}
			const known = machine;
			entry = this._remoteAgentHostService.configuredEntries.find(entry => matchesMachine(entry, known));
			if (!entry) {
				const added = await raceCancellationError(this._addEntry(known), token);
				if (typeof added === 'string') {
					return { unavailableReason: added };
				}
				entry = added;
			} else if (entry.connection.type === RemoteAgentHostEntryType.Tunnel && this._tunnelService.isTunnelDismissed(entry.connection.tunnelId)) {
				this._tunnelService.clearTunnelDismissal(entry.connection.tunnelId);
			}
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			this._logService.error(`[RemoteWorkspaceHandoff] Failed to add ${parsed.kind} host`, error);
			return { unavailableReason: localize('remoteWorkspaceHandoff.addFailed', "'{0}' could not be added as a remote agent host: {1}", machine ? getMachineLabel(machine) : folder.remoteAuthority, toErrorMessage(error)) };
		}
		const address = getEntryAddress(entry);
		void this._connect(address, machine);
		// eslint-disable-next-line local/code-agent-host-uri-mapping -- names a folder of a remote agent host that may not be connected yet, as its provider does
		return { folderUri: toAgentHostUri(URI.from({ scheme: Schemas.file, path: folder.path }), agentHostAuthority(address)) };
	}

	private async _getDefaultDistro(): Promise<RemoteMachine | undefined> {
		const distro = (await this._wslService.listDistros()).find(distro => distro.isDefault);
		return distro && { kind: 'wsl', distro: distro.name };
	}

	/** Adds the machine's remote agent host, returning its entry or a user-facing reason why it is unavailable. */
	private async _addEntry(machine: RemoteMachine): Promise<IRemoteAgentHostEntry | string> {
		switch (machine.kind) {
			case 'ssh': {
				const resolved = await this._sshService.resolveSSHConfig(machine.sshConfigHost ?? machine.hostName);
				const entry: IRemoteAgentHostEntry = machine.sshConfigHost !== undefined ? {
					name: machine.sshConfigHost,
					connection: {
						type: RemoteAgentHostEntryType.SSH,
						address: computeSSHConnectionKey({ sshConfigHost: machine.sshConfigHost }),
						sshConfigHost: machine.sshConfigHost,
						hostName: resolved.hostname,
						user: resolved.user,
						port: resolved.port,
					},
				} : {
					name: getMachineLabel(machine),
					connection: {
						type: RemoteAgentHostEntryType.SSH,
						address: computeSSHConnectionKey({ username: machine.user ?? resolved.user, host: machine.hostName, port: machine.port }),
						hostName: machine.hostName,
						user: machine.user ?? resolved.user,
						port: machine.port,
					},
				};
				addSSHRemoteAgentHostEntry(this._storageService, entry);
				return entry;
			}
			case 'wsl': {
				const distro = (await this._wslService.listDistros()).find(distro => equalsIgnoreCase(distro.name, machine.distro));
				if (!distro) {
					return localize('remoteWorkspaceHandoff.wslDistroNotFound', "WSL distribution '{0}' was not found. Remote agent hosts require WSL 2.", machine.distro);
				}
				this._wslService.cacheDistro({ distro: distro.name, name: distro.name });
				return { name: distro.name, connection: { type: RemoteAgentHostEntryType.WSL, address: `${WSL_ADDRESS_PREFIX}${distro.name}`, distro: distro.name } };
			}
			case 'tunnel': {
				const cached = this._tunnelService.getCachedTunnels().find(tunnel => matchesTunnel(tunnel, machine.name));
				if (cached) {
					this._tunnelService.clearTunnelDismissal(cached.tunnelId);
					return { name: cached.name, connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: cached.tunnelId, clusterId: cached.clusterId, label: cached.name, authProvider: cached.authProvider } };
				}
				const findTunnel = async (authProvider: 'github' | 'microsoft'): Promise<IRemoteAgentHostEntry | undefined> => {
					const tunnel = (await this._tunnelService.listTunnels({ silent: true, authProvider })).find(tunnel => matchesTunnel(tunnel, machine.name));
					if (!tunnel) {
						return undefined;
					}
					this._tunnelService.clearTunnelDismissal(tunnel.tunnelId);
					this._tunnelService.cacheTunnel(tunnel, authProvider);
					return { name: tunnel.name, connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: tunnel.tunnelId, clusterId: tunnel.clusterId, label: tunnel.name, authProvider } };
				};
				// Like Remote - Tunnels, look for the tunnel with each signed-in account, the most recent one first.
				const preferred = await this._tunnelService.getAuthProvider({ silent: true });
				const authProviders = [...new Set([preferred, 'github', 'microsoft'] as const)].filter(provider => provider !== undefined);
				let listed = false;
				let signInProvider: 'github' | 'microsoft' | undefined;
				let failure: unknown;
				for (const authProvider of authProviders) {
					try {
						const entry = await findTunnel(authProvider);
						listed = true;
						if (entry) {
							return entry;
						}
					} catch (error) {
						if (error instanceof TunnelAuthenticationRequiredError) {
							signInProvider ??= error.authProvider;
						} else {
							failure ??= error;
						}
					}
				}
				const signInMessage = localize('remoteWorkspaceHandoff.tunnelSignIn', "Sign in to find tunnel '{0}'.", machine.name);
				// The tunnel may belong to an account that is not signed in yet; offer to sign in, explaining why first.
				if (signInProvider && this._tunnelService.signIn) {
					const { confirmed } = await this._dialogService.confirm({
						type: 'info',
						message: localize('remoteWorkspaceHandoff.tunnelSignInConfirmation', "Sign in to open your folder from tunnel '{0}'?", machine.name),
						detail: localize('remoteWorkspaceHandoff.tunnelSignInDetail', "Your editor window is connected to tunnel '{0}'. To open the same folder here, the Agents Window needs to sign in with your {1} account to find the tunnel and connect to its agent host.", machine.name, signInProvider === 'github' ? 'GitHub' : 'Microsoft'),
						primaryButton: localize('remoteWorkspaceHandoff.tunnelSignInButton', "&&Sign In"),
					});
					if (!confirmed) {
						return signInMessage;
					}
					try {
						await this._tunnelService.signIn(signInProvider);
					} catch (error) {
						if (isCancellationError(error)) {
							return signInMessage;
						}
						throw error;
					}
					const entry = await findTunnel(signInProvider);
					if (entry) {
						return entry;
					}
					listed = true;
				}
				// Another account failing for an unrelated reason, such as having no tunnel configuration, must not hide the sign-in.
				if (!listed && signInProvider) {
					return signInMessage;
				}
				if (!listed && failure) {
					throw failure;
				}
				return localize('remoteWorkspaceHandoff.tunnelNotFound', "Tunnel '{0}' was not found for the signed-in accounts.", machine.name);
			}
		}
	}

	private async _connect(address: string, machine: RemoteMachine): Promise<void> {
		const token = this._connections.token;
		const provider = await this._waitForProvider(address, token);
		if (!provider || token.isCancellationRequested) {
			if (!provider) {
				this._logService.warn(`[RemoteWorkspaceHandoff] No provider was registered for ${machine.kind} host '${getMachineLabel(machine)}'`);
			}
			return;
		}
		// Opening the remote's folder is an explicit choice of this host.
		provider.showInEnvironmentPicker?.();
		const status = provider.connectionStatus?.get();
		// A background dial cannot prompt for credentials, so connect on the user's behalf unless the host is usable or recovering.
		if (!provider.connect || RemoteAgentHostConnectionStatus.isConnected(status) || RemoteAgentHostConnectionStatus.isReconnecting(status) || RemoteAgentHostConnectionStatus.isIncompatible(status)) {
			return;
		}
		let failure: unknown;
		try {
			const connecting = provider.connect();
			// Tunnel providers report their own connection progress.
			await (machine.kind === 'tunnel' ? connecting : this._progressService.withProgress({
				location: ProgressLocation.Notification,
				title: localize('remoteWorkspaceHandoff.connecting', "Connecting to {0}...", provider.label),
				delay: 500,
			}, () => connecting));
		} catch (error) {
			failure = error;
		}
		if (token.isCancellationRequested || isCancellationError(failure) || !this._hasFailed(provider)) {
			return;
		}
		this._logService.warn(`[RemoteWorkspaceHandoff] Failed to connect to ${machine.kind} host '${getMachineLabel(machine)}'`, failure);
		this._notificationService.error(failure
			? localize('remoteWorkspaceHandoff.connectFailedWithReason', "Failed to connect to {0}: {1}", provider.label, toErrorMessage(failure))
			: localize('remoteWorkspaceHandoff.connectFailed', "Failed to connect to {0}.", provider.label));
	}

	/** Whether the host is neither usable nor still connecting; incompatible hosts surface their own upgrade notification. */
	private _hasFailed(provider: IAgentHostSessionsProvider): boolean {
		const status = provider.connectionStatus?.get();
		return !RemoteAgentHostConnectionStatus.isConnected(status)
			&& !RemoteAgentHostConnectionStatus.isConnecting(status)
			&& !RemoteAgentHostConnectionStatus.isReconnecting(status)
			&& !RemoteAgentHostConnectionStatus.isIncompatible(status);
	}

	private _waitForProvider(address: string, token: CancellationToken): Promise<IAgentHostSessionsProvider | undefined> {
		const find = () => this._sessionsProvidersService.getProviders()
			.find((provider): provider is IAgentHostSessionsProvider => isAgentHostProvider(provider) && provider.remoteAddress === address);
		const existing = find();
		if (existing || token.isCancellationRequested) {
			return Promise.resolve(existing);
		}
		return new Promise(resolve => {
			const store = new DisposableStore();
			const done = (provider: IAgentHostSessionsProvider | undefined) => {
				store.dispose();
				resolve(provider);
			};
			const timer = setTimeout(() => done(find()), PROVIDER_REGISTRATION_TIMEOUT_MS);
			store.add(toDisposable(() => clearTimeout(timer)));
			store.add(this._sessionsProvidersService.onDidChangeProviders(() => {
				const provider = find();
				if (provider) {
					done(provider);
				}
			}));
			store.add(token.onCancellationRequested(() => done(undefined)));
		});
	}
}

registerSingleton(IRemoteWorkspaceHandoffService, RemoteWorkspaceHandoffService, InstantiationType.Delayed);
