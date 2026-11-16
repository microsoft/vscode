/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel as ProxyLogLevel, ProxyAgentParams, createFetchPatch, createProxyAuthorizationLookup, createProxyResolver, createWebSocketPatch, loadSystemCertificates, resetCaches, type Log as ProxyLog, type LookupProxyAuthorization, type ResolvedProxyInfo } from '@vscode/proxy-agent';
import { AsyncLocalStorage } from 'async_hooks';
import { getCACertificates } from 'tls';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { equals } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService, LogLevel } from '../../log/common/log.js';
import { AuthInfo, Credentials, systemCertificatesNodeDefault } from '../../request/common/request.js';
import { lookupKerberosAuthorization } from '../../request/node/requestService.js';
import { normalizeCertificates } from '../../request/node/certificates.js';
import { IAgentHostClientProxyConnection } from '../common/agentHostClientProxyChannel.js';
import { AgentHostProxyConfigKey, agentHostProxyConfigSchema } from '../common/agentHostSchema.js';
import { originsOnlyForLog } from '../common/logRedaction.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';

export const IAgentHostProxyResolver = createDecorator<IAgentHostProxyResolver>('agentHostProxyResolver');

type AgentHostProxyConfigurationKey = keyof typeof agentHostProxyConfigSchema.definition & string;

interface IClientCertificateProvider extends IDisposable {
	readonly load: () => Promise<readonly string[]>;
	readonly token: CancellationToken;
	promise?: Promise<void>;
}

/** Load system and process-supplied CA certificates for Agent Host networking. */
export async function loadAgentHostCertificates(
	logService: ILogService,
	extraCertificates: readonly string[] = getCACertificates('extra'),
	systemCertificateLoader: typeof loadSystemCertificates = loadSystemCertificates,
): Promise<string[]> {
	const systemCertificates = await systemCertificateLoader({
		loadSystemCertificatesFromNode: () => systemCertificatesNodeDefault,
		log: logService,
	});
	return [...systemCertificates, ...extraCertificates];
}

/**
 * An HTTP(S) proxy URL without the credentials in its user info. undici sends those in a `Proxy-Authorization` header
 * ahead of the one the proxy authorization lookup adds, and proxies such as Squid check only the first, so stale
 * credentials in the `http.proxy` setting or a proxy environment variable would fail every request even after a client
 * supplied valid ones. The lookup answers the URL's credentials instead, until the proxy rejects them.
 */
export function withoutProxyCredentials(proxyURL: string | undefined): string | undefined {
	try {
		const url = proxyURL ? new URL(proxyURL) : undefined;
		if (url && (url.protocol === 'http:' || url.protocol === 'https:') && (url.username || url.password)) {
			return `${url.protocol}//${url.host}`;
		}
	} catch {
		// Not a URL, keep it.
	}
	return proxyURL;
}

/** The Basic credentials in the user info of the HTTP(S) proxy URL `configuredProxy` when it names the same proxy as `proxy`. */
export function getProxyUrlCredentials(configuredProxy: string | undefined, proxy: string): Credentials | undefined {
	try {
		const configured = configuredProxy ? new URL(configuredProxy) : undefined;
		if (!configured || configured.protocol !== 'http:' && configured.protocol !== 'https:' || !configured.username && !configured.password || configured.origin !== new URL(proxy).origin) {
			return undefined;
		}
		const username = decodeURIComponent(configured.username);
		// Basic credentials cannot carry a user name with a colon, but can carry an empty one, as with `http://:token@proxy`.
		return !username.includes(':') ? { username, password: decodeURIComponent(configured.password) } : undefined;
	} catch {
		return undefined;
	}
}

/** The log `@vscode/proxy-agent` writes to, with URLs reduced to their origins: a model download URL's path and query must never be logged. */
function createUrlRedactingProxyLog(logService: ILogService): ProxyLog {
	const redactArg = (value: unknown) => typeof value === 'string' ? originsOnlyForLog(value) : value instanceof Error ? originsOnlyForLog(value.message) : value;
	return {
		trace: (message: string, ...args: unknown[]) => logService.trace(originsOnlyForLog(message), ...args.map(redactArg)),
		debug: (message: string, ...args: unknown[]) => logService.debug(originsOnlyForLog(message), ...args.map(redactArg)),
		info: (message: string, ...args: unknown[]) => logService.info(originsOnlyForLog(message), ...args.map(redactArg)),
		warn: (message: string, ...args: unknown[]) => logService.warn(originsOnlyForLog(message), ...args.map(redactArg)),
		error: (message: string | Error, ...args: unknown[]) => logService.error(originsOnlyForLog(typeof message === 'string' ? message : message.message), ...args.map(redactArg)),
	};
}

/**
 * A client reached over the protocol that shares this agent host's network, such as the Windows client of an agent
 * host in WSL or a local container. Like a remote extension host with `useHostProxy`, the agent host may resolve
 * proxies through it and fall back to its Kerberos tickets and proxy credentials.
 */
export interface IAgentHostSharedNetworkClient {
	/** The client's raw proxy resolution for `url`, such as `PROXY proxy:8080; DIRECT`. */
	resolveProxy(url: string): Promise<string | undefined>;
	/** A `Negotiate` `Proxy-Authorization` value for `proxyUrl` from the client's Kerberos tickets. */
	lookupKerberosAuthorization(proxyUrl: string): Promise<string | undefined>;
	/** Basic credentials for `proxyUrl`; `attempt` is 1 for the first credentials a request asks for. */
	lookupBasicAuthorization(proxyUrl: string, realm: string | undefined, attempt: number): Promise<Credentials | undefined>;
}

/**
 * Node-side registry of renderer {@link IAgentHostClientProxyConnection}s keyed
 * by client id. Populated by the agent host's connection lifecycle (one entry
 * per connected renderer) and consumed by {@link CopilotAgent} to resolve the
 * CAPI proxy through VS Code's Electron session before spawning the Copilot SDK.
 *
 * Proxy configuration is a property of the machine, not of a particular window,
 * so any connected renderer can serve the lookup; the resolver calls the first
 * available connection and falls through to the next on failure. Kerberos
 * tickets come from this machine directly, as renderers share it. Clients that
 * share the network of a remote agent host serve the same lookups over the
 * protocol (see {@link IAgentHostSharedNetworkClient}).
 */
export interface IAgentHostProxyResolver {
	readonly _serviceBrand: undefined;

	/** Fires when the first renderer connection or the first client sharing this agent host's network registers. */
	readonly onDidRegisterConnection: Event<void>;
	readonly onDidChangeConfiguration: Event<void>;
	readonly clientCertificates: readonly string[];

	setClientCertificates(clientId: string, certificates: readonly string[]): void;
	registerCertificateProvider(clientId: string, load: (() => Promise<readonly string[]>) | undefined): IDisposable;
	loadClientCertificates(): Promise<readonly string[]>;
	/** Loads native roots, including this process's `NODE_EXTRA_CA_CERTS` bundle, once and combines them with cached client roots. */
	loadCertificates(): Promise<string[]>;

	/** Register a renderer connection. Disposing the result removes it. */
	register(clientId: string, connection: IAgentHostClientProxyConnection): IDisposable;

	/** Register a client that shares this agent host's network. Disposing the result removes it. */
	registerSharedNetworkClient(clientId: string, client: IAgentHostSharedNetworkClient): IDisposable;

	/** A registered client sharing this agent host's network reports that its proxy resolution may have changed. */
	notifySharedNetworkClientChanged(clientId: string): void;

	/**
	 * A `Negotiate` `Proxy-Authorization` value for `proxyUrl` from a client that shares this agent host's network, for
	 * callers that already tried this machine's Kerberos tickets. `undefined` when no such client supplies one.
	 */
	lookupClientKerberosAuthorization(proxyUrl: string): Promise<string | undefined>;

	/**
	 * A `Negotiate` `Proxy-Authorization` value for `proxyUrl` from this machine's Kerberos ticket for `spn`, falling back
	 * to a client that shares this agent host's network, which derives the principal for `proxyUrl` itself. `undefined`
	 * when none supplies one.
	 */
	lookupKerberosAuthorization(proxyUrl: string, spn: string): Promise<string | undefined>;

	/**
	 * Credentials for a Basic challenge of the proxy `proxyUrl` (`http(s)://host:port`) from a renderer connection, else
	 * a client that shares this agent host's network. `attempt` is 1 for the first challenge and higher after the proxy
	 * rejected earlier credentials. `undefined` when none supplies them.
	 */
	lookupBasicAuthorization(proxyUrl: string, realm: string | undefined, attempt: number): Promise<Credentials | undefined>;

	getConfigurationValue<T>(key: AgentHostProxyConfigurationKey): T | undefined;

	/**
	 * Resolve the proxy URL for `url` (e.g. `http://host:port`), or `undefined`
	 * for a direct connection. Reuses `@vscode/proxy-agent`'s `resolveProxyURL`
	 * so the same precedence as the rest of VS Code applies: `http.noProxy` →
	 * `http.proxy` setting → `HTTP(S)_PROXY` env vars → the host proxy resolution
	 * that runs in VS Code (Electron session) via the reverse channel.
	 */
	resolveProxy(url: string): Promise<string | undefined>;

	/**
	 * Like {@link resolveProxy}, with the type of the result and the configuration that determined it, such as `remote`
	 * when no client was connected to resolve the system proxy with.
	 */
	resolveProxyByURL(url: string): Promise<ResolvedProxyInfo>;

	/** Fetch using the same proxy, certificate, and host/PAC resolution as {@link resolveProxy}. */
	fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;

	/** Open a WebSocket using the same proxy, certificate, and host/PAC resolution as {@link fetch}. */
	createWebSocket(url: string, protocol: string): InstanceType<typeof globalThis.WebSocket>;
}

export class AgentHostProxyResolver extends Disposable implements IAgentHostProxyResolver {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidRegisterConnection = this._register(new Emitter<void>());
	readonly onDidRegisterConnection = this._onDidRegisterConnection.event;
	private readonly _onDidChangeConfiguration = this._register(new Emitter<void>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;
	private readonly _configurationListener = this._register(new MutableDisposable());

	private readonly _connections = new Map<string, IAgentHostClientProxyConnection>();
	private readonly _sharedNetworkClients = new Map<string, IAgentHostSharedNetworkClient>();
	/** Per proxy origin, the configured credentials answered for this agent host's own requests and whether the proxy rejected them. */
	private readonly _configuredCredentialsStates = new Map<string, { readonly key: string; rejected: boolean }>();
	/** The `@vscode/proxy-agent` state of the request whose proxy authorization is looked up, which its `lookupAuthorization` callback does not receive. */
	private readonly _proxyAuthorizationExchange = new AsyncLocalStorage<object>();
	/** The requests that answered the configured credentials. */
	private readonly _configuredCredentialsExchanges = new WeakSet<object>();
	private readonly _certificatesByClient = new Map<string, readonly string[]>();
	private readonly _certificateProviders = this._register(new DisposableMap<string, IClientCertificateProvider>());
	private _certificateProviderGeneration = 0;
	private _clientCertificates: readonly string[] = [];
	private _nativeCertificates: Promise<string[]> | undefined;
	private _configurationValues: Record<string, unknown> = {};
	private _proxyResolver: { readonly params: ProxyAgentParams; readonly resolver: ReturnType<typeof createProxyResolver> } | undefined;
	private _fetch: typeof globalThis.fetch | undefined;
	private _webSocket: typeof globalThis.WebSocket | undefined;

	constructor(
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._configurationValues = this._readConfigurationValues();
		this._configurationListener.value = this._configurationService.onDidRootConfigChange(() => {
			const values = this._readConfigurationValues();
			if (!equals(this._configurationValues, values)) {
				this._configurationValues = values;
				this._onDidChangeConfiguration.fire();
			}
		});
	}

	getConfigurationValue<T>(key: AgentHostProxyConfigurationKey): T | undefined {
		return this._configurationService.getRootValue(agentHostProxyConfigSchema, key) as T | undefined;
	}

	get clientCertificates(): readonly string[] {
		return this._clientCertificates;
	}

	registerCertificateProvider(clientId: string, load: (() => Promise<readonly string[]>) | undefined): IDisposable {
		this._certificateProviderGeneration++;
		if (!load) {
			this._certificateProviders.deleteAndDispose(clientId);
			this.setClientCertificates(clientId, []);
			return Disposable.None;
		}
		const cancellation = new CancellationTokenSource();
		const provider: IClientCertificateProvider = { load, token: cancellation.token, dispose: () => cancellation.dispose(true) };
		this._certificateProviders.set(clientId, provider);
		this._resetNetworking();
		this._onDidChangeConfiguration.fire();
		return toDisposable(() => {
			if (this._certificateProviders.get(clientId) === provider) {
				this._certificateProviders.deleteAndDispose(clientId);
				this._certificateProviderGeneration++;
			}
		});
	}

	async loadClientCertificates(): Promise<readonly string[]> {
		let generation: number;
		do {
			generation = this._certificateProviderGeneration;
			await Promise.all([...this._certificateProviders].map(([clientId, provider]) => {
				return provider.promise ??= Promise.resolve().then(async () => {
					try {
						const certificates = await raceCancellationError(provider.load(), provider.token);
						if (this._certificateProviders.get(clientId) === provider) {
							this.setClientCertificates(clientId, certificates);
						}
					} catch {
						if (this._certificateProviders.get(clientId) === provider) {
							this._logService.warn('[AgentHost] Failed to load client CA certificates; retaining previously loaded trust until the client reconnects.');
						}
					}
				});
			}));
		} while (generation !== this._certificateProviderGeneration);
		return this._clientCertificates;
	}

	setClientCertificates(clientId: string, certificates: readonly string[]): void {
		const validated = normalizeCertificates(certificates, this._logService);
		if (validated.length) {
			this._certificatesByClient.set(clientId, validated);
		} else {
			this._certificatesByClient.delete(clientId);
		}
		const combined = [...new Set([...this._certificatesByClient.values()].flat())].sort();
		if (equals(combined, this._clientCertificates)) {
			return;
		}
		this._clientCertificates = Object.freeze(combined);
		this._resetNetworking();
		this._onDidChangeConfiguration.fire();
	}

	private _resetNetworking(): void {
		resetCaches();
		this._proxyResolver = undefined;
		this._fetch = undefined;
		this._webSocket = undefined;
	}

	async loadCertificates(): Promise<string[]> {
		if (!this._nativeCertificates) {
			const nativeCertificates = this._nativeCertificates = this._loadNativeCertificates();
			nativeCertificates.catch(() => {
				if (this._nativeCertificates === nativeCertificates) {
					this._nativeCertificates = undefined;
				}
			});
		}
		const [nativeCertificates, clientCertificates] = await Promise.all([
			this._nativeCertificates,
			this.loadClientCertificates(),
		]);
		return [...nativeCertificates, ...clientCertificates];
	}

	protected _loadNativeCertificates(): Promise<string[]> {
		return loadAgentHostCertificates(this._logService);
	}

	private _readConfigurationValues(): Record<string, unknown> {
		return Object.fromEntries(Object.values(AgentHostProxyConfigKey).map(key => [key, this.getConfigurationValue(key)]));
	}

	register(clientId: string, connection: IAgentHostClientProxyConnection): IDisposable {
		const hadConnections = this._connections.size > 0;
		this._connections.set(clientId, connection);
		if (!hadConnections) {
			this._onDidRegisterConnection.fire();
		}
		return toDisposable(() => {
			if (this._connections.get(clientId) === connection) {
				this._connections.delete(clientId);
			}
		});
	}

	registerSharedNetworkClient(clientId: string, client: IAgentHostSharedNetworkClient): IDisposable {
		const hadClients = this._sharedNetworkClients.size > 0;
		this._sharedNetworkClients.set(clientId, client);
		if (!hadClients) {
			this._onDidRegisterConnection.fire();
		}
		return toDisposable(() => {
			if (this._sharedNetworkClients.get(clientId) === client) {
				this._sharedNetworkClients.delete(clientId);
			}
		});
	}

	notifySharedNetworkClientChanged(clientId: string): void {
		if (!this._sharedNetworkClients.has(clientId)) {
			return;
		}
		// Drop proxies cached from the client's earlier resolution and let consumers re-resolve.
		this._resetNetworking();
		this._onDidChangeConfiguration.fire();
	}

	async lookupClientKerberosAuthorization(proxyUrl: string): Promise<string | undefined> {
		for (const client of this._sharedNetworkClients.values()) {
			try {
				const authorization = await client.lookupKerberosAuthorization(proxyUrl);
				if (authorization) {
					return authorization;
				}
			} catch {
				// This client could not serve the lookup; try the next one.
			}
		}
		return undefined;
	}

	lookupKerberosAuthorization(proxyUrl: string, spn: string): Promise<string | undefined> {
		return this._lookupMachineOrClientKerberosAuthorization(proxyUrl, spn);
	}

	lookupBasicAuthorization(proxyUrl: string, realm: string | undefined, attempt: number): Promise<Credentials | undefined> {
		let url: URL;
		try {
			url = new URL(proxyUrl);
		} catch {
			return Promise.resolve(undefined);
		}
		return this._hostLookupAuthorization({
			scheme: 'basic',
			host: url.hostname,
			// Like Electron, with the default port, which keys the credentials its login dialog stores.
			port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
			realm: realm ?? '',
			isProxy: true,
			attempt,
		}, proxyUrl);
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return this._getProxyResolver().resolver.resolveProxyURL(url);
	}

	resolveProxyByURL(url: string): Promise<ResolvedProxyInfo> {
		return this._getProxyResolver().resolver.resolveProxyByURL(url);
	}

	async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		await this.loadClientCertificates();
		if (!this._fetch) {
			const { params, resolver } = this._getProxyResolver();
			this._fetch = createFetchPatch(params, this._getFetch(), async url => withoutProxyCredentials(await resolver.resolveProxyURL(url)));
		}
		return this._fetch(input, init);
	}

	createWebSocket(url: string, protocol: string): InstanceType<typeof globalThis.WebSocket> {
		if (!this._webSocket) {
			const { params, resolver } = this._getProxyResolver();
			this._webSocket = createWebSocketPatch(params, globalThis.WebSocket, async url => withoutProxyCredentials(await resolver.resolveProxyURL(url)));
		}
		return new this._webSocket(url, protocol);
	}

	private _getProxyResolver(): { readonly params: ProxyAgentParams; readonly resolver: ReturnType<typeof createProxyResolver> } {
		if (!this._proxyResolver) {
			const proxyLog = createUrlRedactingProxyLog(this._logService);
			// Mirror `workbench/api/node/proxyResolver.ts`.
			const params: ProxyAgentParams = {
				// The host proxy resolution runs in VS Code: reverse-call a connected
				// renderer, whose IRequestService.resolveProxy hits the Electron
				// session (system settings / PAC scripts).
				resolveProxy: (url) => this._hostResolveProxy(url),
				lookupProxyAuthorization: this._createProxyAuthorizationLookup(proxyLog),
				getProxyURL: () => this.getConfigurationValue<string>(AgentHostProxyConfigKey.Proxy),
				getProxySupport: () => 'override',
				getNoProxyConfig: () => this.getConfigurationValue<string[]>(AgentHostProxyConfigKey.NoProxy) || [],
				isAdditionalFetchSupportEnabled: () => true,
				isWebSocketPatchEnabled: () => true,
				addCertificatesV1: () => true,
				addCertificatesV2: () => false,
				loadSystemCertificatesFromNode: () => systemCertificatesNodeDefault,
				loadAdditionalCertificates: () => this.loadCertificates(),
				log: proxyLog,
				getLogLevel: () => {
					switch (this._logService.getLevel()) {
						case LogLevel.Trace: return ProxyLogLevel.Trace;
						case LogLevel.Debug: return ProxyLogLevel.Debug;
						case LogLevel.Info: return ProxyLogLevel.Info;
						case LogLevel.Warning: return ProxyLogLevel.Warning;
						case LogLevel.Error: return ProxyLogLevel.Error;
						case LogLevel.Off: return ProxyLogLevel.Off;
						default: return ProxyLogLevel.Info;
					}
				},
				proxyResolveTelemetry: () => { },
				// Look up the client's proxy settings only when the agent host
				// shares the client's network: the local agent host wires the
				// reverse proxy channel, and an agent host in WSL or a local
				// container has a client advertising `vscode.clientProxy`.
				isUseHostProxyEnabled: () => this._connections.size > 0 || this._sharedNetworkClients.size > 0,
				getNetworkInterfaceCheckInterval: () => 300 * 1000,
				env: this._getProxyEnvironment(),
			};
			this._proxyResolver = { params, resolver: createProxyResolver(params) };
		}
		return this._proxyResolver;
	}

	/** The environment whose proxy variables apply before the proxies of clients. */
	protected _getProxyEnvironment(): NodeJS.ProcessEnv {
		return process.env;
	}

	/** The undici fetch that {@link fetch} routes through the proxy. */
	protected _getFetch(): typeof globalThis.fetch {
		return globalThis.fetch;
	}

	private async _hostResolveProxy(url: string): Promise<string | undefined> {
		for (const connection of [...this._connections.values(), ...this._sharedNetworkClients.values()]) {
			try {
				return await connection.resolveProxy(url);
			} catch {
				// This client could not serve the lookup; try the next one.
			}
		}
		return undefined;
	}

	/**
	 * `@vscode/proxy-agent` passes `lookupAuthorization` the proxy's hostname and explicit port only, so a lookup per
	 * proxy URL keeps its scheme, which decides the default port, for the clients sharing this network. Its caches are
	 * keyed by proxy URL already.
	 */
	private _createProxyAuthorizationLookup(log: ProxyLog): LookupProxyAuthorization {
		const lookups = new Map<string, LookupProxyAuthorization>();
		return (proxyURL, proxyAuthenticate, state) => {
			let lookup = lookups.get(proxyURL);
			if (!lookup) {
				lookup = createProxyAuthorizationLookup({
					log,
					lookupAuthorization: authInfo => this._lookupProxyAuthorization(authInfo, proxyURL),
					lookupKerberosAuthorization: url => this._lookupMachineOrClientKerberosAuthorization(url, this.getConfigurationValue<string>(AgentHostProxyConfigKey.ProxyKerberosServicePrincipal)),
				});
				lookups.set(proxyURL, lookup);
			}
			return this._proxyAuthorizationExchange.run(state, () => lookup(proxyURL, proxyAuthenticate, state));
		};
	}

	/**
	 * Credentials for a proxy of this agent host's own requests, whose proxy URLs carry none (see
	 * {@link withoutProxyCredentials}): like Electron's login handler, the credentials of the `http.proxy` setting, else
	 * of a proxy environment variable, when they name this proxy, until the proxy rejects them, then a client's.
	 */
	private async _lookupProxyAuthorization(authInfo: AuthInfo, proxyURL: string): Promise<Credentials | undefined> {
		const configured = authInfo.scheme.toLowerCase() === 'basic' ? getProxyUrlCredentials(this._getConfiguredProxy(), proxyURL) : undefined;
		if (!configured) {
			return this._hostLookupAuthorization(authInfo, proxyURL);
		}
		const origin = new URL(proxyURL).origin;
		const key = JSON.stringify([configured.username, configured.password]);
		const state = this._configuredCredentialsStates.get(origin);
		const exchange = this._proxyAuthorizationExchange.getStore();
		const answerConfigured = () => {
			if (exchange) {
				this._configuredCredentialsExchanges.add(exchange);
			}
			return configured;
		};
		if (state?.key !== key) {
			this._configuredCredentialsStates.set(origin, { key, rejected: false });
			return answerConfigured();
		}
		if (!state.rejected) {
			if (authInfo.attempt === 1) {
				return answerConfigured();
			}
			state.rejected = true;
			this._logService.info(`[AgentHostProxyResolver] The proxy ${originsOnlyForLog(origin)} rejected the configured proxy credentials, asking a client for credentials`);
		}
		// A request that answered the configured credentials takes one attempt more to reach a client's.
		const attempt = exchange && this._configuredCredentialsExchanges.has(exchange) ? Math.max(1, authInfo.attempt - 1) : authInfo.attempt;
		const credentials = await this._hostLookupAuthorization({ ...authInfo, attempt }, proxyURL);
		if (attempt === 1 && credentials?.username === configured.username && credentials.password === configured.password) {
			// The client answered the rejected credentials of its own `http.proxy` setting, a second attempt tells it they were rejected.
			return this._hostLookupAuthorization({ ...authInfo, attempt: 2 }, proxyURL);
		}
		return credentials;
	}

	/** The proxy URL of the `http.proxy` setting, else of a proxy environment variable, as `@vscode/proxy-agent` uses them. */
	private _getConfiguredProxy(): string | undefined {
		const env = this._getProxyEnvironment();
		return this.getConfigurationValue<string>(AgentHostProxyConfigKey.Proxy)?.trim()
			|| (env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY)?.trim()
			|| undefined;
	}

	private async _hostLookupAuthorization(authInfo: AuthInfo, proxyUrl: string): Promise<Credentials | undefined> {
		for (const connection of this._connections.values()) {
			try {
				return await connection.lookupAuthorization(authInfo);
			} catch {
				// This renderer could not serve the lookup; try the next one.
			}
		}
		if (authInfo.scheme.toLowerCase() !== 'basic') {
			return undefined;
		}
		let proxyOrigin: string;
		try {
			// Without any credentials in the proxy URL.
			proxyOrigin = new URL(proxyUrl).origin;
		} catch {
			return undefined;
		}
		for (const client of this._sharedNetworkClients.values()) {
			try {
				const credentials = await client.lookupBasicAuthorization(proxyOrigin, authInfo.realm || undefined, authInfo.attempt);
				if (credentials) {
					return credentials;
				}
			} catch {
				// This client could not serve the lookup; try the next one.
			}
		}
		return undefined;
	}

	/**
	 * This machine's ticket for `spn`, or the one derived from `url`, else a ticket from a client sharing its network,
	 * like a remote extension host with `useHostProxy`.
	 */
	private async _lookupMachineOrClientKerberosAuthorization(url: string, spn: string | undefined): Promise<string | undefined> {
		try {
			return `Negotiate ${await this._lookupKerberosAuthorization(url, spn)}`;
		} catch (error) {
			this._logService.debug('AgentHostProxyResolver#lookupKerberosAuthorization Kerberos authentication failed', error);
		}
		return this.lookupClientKerberosAuthorization(url);
	}

	protected _lookupKerberosAuthorization(url: string, spn: string | undefined): Promise<string> {
		return lookupKerberosAuthorization(url, spn, this._logService, 'AgentHostProxyResolver#lookupKerberosAuthorization');
	}
}
