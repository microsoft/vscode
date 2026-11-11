/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { decodeHex } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { waitForState } from '../../../../../base/common/observable.js';
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
import { IAgentHostSessionsProvider, isAgentHostProvider } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { IRemoteWorkspaceFolder, IRemoteWorkspaceHandoffService, RemoteAgentHostHandoffResult, RemoteWorkspaceHandoffResult } from '../../../../common/remoteWorkspaceHandoff.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';

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

/** Awaits a step of a handoff, failing once the handoff is cancelled, even if the step completed, so that no later step acts for it. */
async function whileCurrent<T>(promise: Promise<T>, token: CancellationToken): Promise<T> {
	const result = await raceCancellationError(promise, token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	return result;
}

function matchesTunnel(tunnel: { readonly name: string; readonly tunnelId: string; readonly clusterId: string }, name: string): boolean {
	return equalsIgnoreCase(tunnel.name, name) || equalsIgnoreCase(`${tunnel.tunnelId}.${tunnel.clusterId}`, name);
}

function getTunnelConnectSignInReason(name: string): string {
	return localize('remoteWorkspaceHandoff.tunnelConnectSignIn', "Sign in to connect to tunnel '{0}'.", name);
}

/**
 * Whether the entry connects to the machine. An SSH machine without a config alias carries the
 * user and port that SSH config supplies when its authority omits them, and an entry without a
 * port connects on the port of that same configuration.
 */
function matchesMachine(entry: IRemoteAgentHostEntry, machine: RemoteMachine, sshConfigPort = 22): boolean {
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
				&& connection.user === machine.user
				&& (connection.port ?? sshConfigPort) === (machine.port ?? sshConfigPort);
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
		const host = await this.resolveHost(folder.remoteAuthority, token);
		if (host.unavailableReason !== undefined) {
			return { unavailableReason: host.unavailableReason };
		}
		// eslint-disable-next-line local/code-agent-host-uri-mapping -- names a folder of a remote agent host that may not be connected yet, as its provider does
		return { folderUri: toAgentHostUri(URI.from({ scheme: Schemas.file, path: folder.path }), host.connectionAuthority) };
	}

	async resolveHost(remoteAuthority: string, token: CancellationToken): Promise<RemoteAgentHostHandoffResult> {
		const parsed = parseRemoteMachine(remoteAuthority);
		if (!parsed) {
			return { unavailableReason: localize('remoteWorkspaceHandoff.unsupported', "The Agents Window cannot connect to this kind of remote.") };
		}
		if (this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) !== true) {
			return { unavailableReason: localize('remoteWorkspaceHandoff.disabled', "Remote agent hosts are disabled.") };
		}
		let machine: RemoteMachine | undefined;
		let entry: IRemoteAgentHostEntry | undefined;
		try {
			machine = isDefaultDistro(parsed) ? await whileCurrent(this._getDefaultDistro(), token) : parsed;
			if (!machine) {
				return { unavailableReason: localize('remoteWorkspaceHandoff.wslNoDefaultDistro', "No default WSL distribution was found. Remote agent hosts require WSL 2.") };
			}
			let sshConfigPort: number | undefined;
			if (machine.kind === 'ssh' && machine.sshConfigHost === undefined) {
				// Like Remote - SSH, use the user and port of SSH config where the authority omits them.
				const resolved = await whileCurrent(this._sshService.resolveSSHConfig(machine.hostName), token);
				sshConfigPort = resolved.port;
				machine = { ...machine, user: machine.user ?? resolved.user, port: machine.port ?? resolved.port };
			}
			const known = machine;
			entry = this._remoteAgentHostService.configuredEntries.find(entry => matchesMachine(entry, known, sshConfigPort));
			if (!entry) {
				const added = await whileCurrent(this._addEntry(known, token), token);
				if (typeof added === 'string') {
					return { unavailableReason: added };
				}
				entry = added;
			} else if (entry.connection.type === RemoteAgentHostEntryType.Tunnel) {
				const tunnelName = entry.connection.label ?? entry.name;
				if (!await this._ensureTunnelSignIn(tunnelName, entry.connection.authProvider, token)) {
					return { unavailableReason: getTunnelConnectSignInReason(tunnelName) };
				}
				if (this._tunnelService.isTunnelDismissed(entry.connection.tunnelId)) {
					this._tunnelService.clearTunnelDismissal(entry.connection.tunnelId);
				}
			}
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			this._logService.error(`[RemoteWorkspaceHandoff] Failed to add ${parsed.kind} host`, error);
			return { unavailableReason: localize('remoteWorkspaceHandoff.addFailed', "'{0}' could not be added as a remote agent host: {1}", machine ? getMachineLabel(machine) : remoteAuthority, toErrorMessage(error)) };
		}
		const address = getEntryAddress(entry);
		const isTunnel = entry.connection.type === RemoteAgentHostEntryType.Tunnel;
		return {
			connectionAuthority: agentHostAuthority(address),
			connected: this._connect(address, machine),
			// A tunnel's editor windows reach its standalone agent host, which its gateway may not have selected.
			sharesEditorWindowAgentHost: () => isTunnel && this._tunnelService.getSelectedServerType(address) !== 'editor',
		};
	}

	private async _getDefaultDistro(): Promise<RemoteMachine | undefined> {
		const distro = (await this._wslService.listDistros()).find(distro => distro.isDefault);
		return distro && { kind: 'wsl', distro: distro.name };
	}

	/**
	 * Adds the machine's remote agent host, returning its entry or a user-facing reason why it is unavailable.
	 * Stops once the handoff is cancelled, before storing or caching anything or asking the user to sign in.
	 */
	private async _addEntry(machine: RemoteMachine, token: CancellationToken): Promise<IRemoteAgentHostEntry | string> {
		switch (machine.kind) {
			case 'ssh': {
				let entry: IRemoteAgentHostEntry;
				if (machine.sshConfigHost !== undefined) {
					const resolved = await whileCurrent(this._sshService.resolveSSHConfig(machine.sshConfigHost), token);
					entry = {
						name: machine.sshConfigHost,
						connection: {
							type: RemoteAgentHostEntryType.SSH,
							address: computeSSHConnectionKey({ sshConfigHost: machine.sshConfigHost }),
							sshConfigHost: machine.sshConfigHost,
							hostName: resolved.hostname,
							user: resolved.user,
							port: resolved.port,
						},
					};
				} else {
					// The user and port already include those of SSH config, so the key names the endpoint the connection uses.
					entry = {
						name: getMachineLabel(machine),
						connection: {
							type: RemoteAgentHostEntryType.SSH,
							address: computeSSHConnectionKey({ username: machine.user, host: machine.hostName, port: machine.port }),
							hostName: machine.hostName,
							user: machine.user,
							port: machine.port,
						},
					};
				}
				addSSHRemoteAgentHostEntry(this._storageService, entry);
				return entry;
			}
			case 'wsl': {
				const distro = (await whileCurrent(this._wslService.listDistros(), token)).find(distro => equalsIgnoreCase(distro.name, machine.distro));
				if (!distro) {
					return localize('remoteWorkspaceHandoff.wslDistroNotFound', "WSL distribution '{0}' was not found. Remote agent hosts require WSL 2.", machine.distro);
				}
				this._wslService.cacheDistro({ distro: distro.name, name: distro.name });
				return { name: distro.name, connection: { type: RemoteAgentHostEntryType.WSL, address: `${WSL_ADDRESS_PREFIX}${distro.name}`, distro: distro.name } };
			}
			case 'tunnel': {
				const cached = this._tunnelService.getCachedTunnels().find(tunnel => matchesTunnel(tunnel, machine.name));
				if (cached) {
					if (!await this._ensureTunnelSignIn(cached.name, cached.authProvider, token)) {
						return getTunnelConnectSignInReason(cached.name);
					}
					this._tunnelService.clearTunnelDismissal(cached.tunnelId);
					return { name: cached.name, connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: cached.tunnelId, clusterId: cached.clusterId, label: cached.name, authProvider: cached.authProvider } };
				}
				const findTunnel = async (authProvider: 'github' | 'microsoft'): Promise<IRemoteAgentHostEntry | undefined> => {
					const tunnel = (await whileCurrent(this._tunnelService.listTunnels({ silent: true, authProvider }), token)).find(tunnel => matchesTunnel(tunnel, machine.name));
					if (!tunnel) {
						return undefined;
					}
					this._tunnelService.clearTunnelDismissal(tunnel.tunnelId);
					this._tunnelService.cacheTunnel(tunnel, authProvider);
					return { name: tunnel.name, connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: tunnel.tunnelId, clusterId: tunnel.clusterId, label: tunnel.name, authProvider } };
				};
				// Like Remote - Tunnels, look for the tunnel with each signed-in account, the most recent one first.
				const preferred = await whileCurrent(this._tunnelService.getAuthProvider({ silent: true }), token);
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
						if (isCancellationError(error)) {
							throw error;
						}
						if (error instanceof TunnelAuthenticationRequiredError) {
							signInProvider ??= error.authProvider;
						} else {
							failure ??= error;
						}
					}
				}
				const signInReason = localize('remoteWorkspaceHandoff.tunnelSignIn', "Sign in to find tunnel '{0}'.", machine.name);
				// The tunnel may belong to an account that is not signed in yet; offer to sign in, explaining why first.
				if (signInProvider && this._tunnelService.signIn) {
					if (!await this._signInToTunnel(machine.name, signInProvider, token)) {
						return signInReason;
					}
					const entry = await findTunnel(signInProvider);
					if (entry) {
						return entry;
					}
					listed = true;
				}
				// Another account failing for an unrelated reason, such as having no tunnel configuration, must not hide the sign-in.
				if (!listed && signInProvider) {
					return signInReason;
				}
				if (!listed && failure) {
					throw failure;
				}
				return localize('remoteWorkspaceHandoff.tunnelNotFound', "Tunnel '{0}' was not found for the signed-in accounts.", machine.name);
			}
		}
	}

	/**
	 * Whether a known tunnel's account can authenticate its connection, offering to sign in first when it cannot.
	 * Connecting would otherwise fail without a token, or start a sign-in that does not explain why.
	 */
	private async _ensureTunnelSignIn(name: string, authProvider: 'github' | 'microsoft' | undefined, token: CancellationToken): Promise<boolean> {
		const signedIn = await whileCurrent(this._tunnelService.getAuthProvider({ silent: true }), token);
		if (signedIn !== undefined && (authProvider === undefined || signedIn === authProvider)) {
			return true;
		}
		// Another account may be the most recent one, so ask the tunnel's own account.
		try {
			await whileCurrent(this._tunnelService.listTunnels({ silent: true, authProvider }), token);
			return true;
		} catch (error) {
			if (error instanceof TunnelAuthenticationRequiredError) {
				return this._signInToTunnel(name, error.authProvider, token);
			}
			if (isCancellationError(error)) {
				throw error;
			}
			// Connecting reports any other failure itself.
			return true;
		}
	}

	/** Explains why the account is needed and signs in once the user confirms, returning whether they signed in. */
	private async _signInToTunnel(name: string, authProvider: 'github' | 'microsoft', token: CancellationToken): Promise<boolean> {
		if (!this._tunnelService.signIn) {
			return false;
		}
		const { confirmed } = await whileCurrent(this._dialogService.confirm({
			type: 'info',
			message: localize('remoteWorkspaceHandoff.tunnelSignInConfirmation', "Sign in to open your folder from tunnel '{0}'?", name),
			detail: localize('remoteWorkspaceHandoff.tunnelSignInDetail', "Your editor window is connected to tunnel '{0}'. To open the same folder here, the Agents Window needs to sign in with your {1} account to find the tunnel and connect to its agent host.", name, authProvider === 'github' ? 'GitHub' : 'Microsoft'),
			primaryButton: localize('remoteWorkspaceHandoff.tunnelSignInButton', "&&Sign In"),
		}), token);
		if (!confirmed) {
			return false;
		}
		try {
			await whileCurrent(this._tunnelService.signIn(authProvider), token);
			return true;
		} catch (error) {
			// Cancelling the sign-in leaves the handoff without the tunnel, but cancelling the handoff ends it.
			if (isCancellationError(error) && !token.isCancellationRequested) {
				return false;
			}
			throw error;
		}
	}

	/** Connects the host once its provider registers, resolving to whether it is connected. Never rejects. */
	private async _connect(address: string, machine: RemoteMachine): Promise<boolean> {
		const token = this._connections.token;
		const provider = await this._waitForProvider(address, token);
		if (!provider || token.isCancellationRequested) {
			if (!provider) {
				this._logService.warn(`[RemoteWorkspaceHandoff] No provider was registered for ${machine.kind} host '${getMachineLabel(machine)}'`);
			}
			return false;
		}
		// Opening the remote's folder or session is an explicit choice of this host.
		provider.showInEnvironmentPicker?.();
		const status = provider.connectionStatus?.get();
		// A background dial cannot prompt for credentials, so connect on the user's behalf unless the host is usable or recovering.
		if (!provider.connect || RemoteAgentHostConnectionStatus.isConnected(status) || RemoteAgentHostConnectionStatus.isReconnecting(status) || RemoteAgentHostConnectionStatus.isIncompatible(status)) {
			return this._whenSettled(provider, token);
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
		if (token.isCancellationRequested || isCancellationError(failure)) {
			return false;
		}
		if (!this._hasFailed(provider)) {
			return this._whenSettled(provider, token);
		}
		this._logService.warn(`[RemoteWorkspaceHandoff] Failed to connect to ${machine.kind} host '${getMachineLabel(machine)}'`, failure);
		this._notificationService.error(failure
			? localize('remoteWorkspaceHandoff.connectFailedWithReason', "Failed to connect to {0}: {1}", provider.label, toErrorMessage(failure))
			: localize('remoteWorkspaceHandoff.connectFailed', "Failed to connect to {0}.", provider.label));
		return false;
	}

	/** Whether the host is connected once it is no longer connecting or reconnecting. */
	private async _whenSettled(provider: IAgentHostSessionsProvider, token: CancellationToken): Promise<boolean> {
		if (!provider.connectionStatus) {
			return true;
		}
		try {
			const status = await waitForState(provider.connectionStatus, status => !RemoteAgentHostConnectionStatus.isConnecting(status) && !RemoteAgentHostConnectionStatus.isReconnecting(status), undefined, token);
			return RemoteAgentHostConnectionStatus.isConnected(status);
		} catch {
			// Only cancellation rejects, when the service is disposed.
			return false;
		}
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
