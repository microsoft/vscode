/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogLevel as ProxyLogLevel, ProxyAgentParams, createFetchPatch, createProxyAuthorizationLookup, createProxyResolver, createWebSocketPatch, loadSystemCertificates, resetCaches, type Log as ProxyLog } from '@vscode/proxy-agent';
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
 * Node-side registry of renderer {@link IAgentHostClientProxyConnection}s keyed
 * by client id. Populated by the agent host's connection lifecycle (one entry
 * per connected renderer) and consumed by {@link CopilotAgent} to resolve the
 * CAPI proxy through VS Code's Electron session before spawning the Copilot SDK.
 *
 * Proxy configuration is a property of the machine, not of a particular window,
 * so any connected renderer can serve the lookup; the resolver calls the first
 * available connection and falls through to the next on failure.
 */
export interface IAgentHostProxyResolver {
	readonly _serviceBrand: undefined;

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

	getConfigurationValue<T>(key: AgentHostProxyConfigurationKey): T | undefined;

	/**
	 * Resolve the proxy URL for `url` (e.g. `http://host:port`), or `undefined`
	 * for a direct connection. Reuses `@vscode/proxy-agent`'s `resolveProxyURL`
	 * so the same precedence as the rest of VS Code applies: `http.noProxy` →
	 * `http.proxy` setting → `HTTP(S)_PROXY` env vars → the host proxy resolution
	 * that runs in VS Code (Electron session) via the reverse channel.
	 */
	resolveProxy(url: string): Promise<string | undefined>;

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

	resolveProxy(url: string): Promise<string | undefined> {
		return this._getProxyResolver().resolver.resolveProxyURL(url);
	}

	async fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
		await this.loadClientCertificates();
		if (!this._fetch) {
			const { params, resolver } = this._getProxyResolver();
			this._fetch = createFetchPatch(params, globalThis.fetch, resolver.resolveProxyURL);
		}
		return this._fetch(input, init);
	}

	createWebSocket(url: string, protocol: string): InstanceType<typeof globalThis.WebSocket> {
		if (!this._webSocket) {
			const { params, resolver } = this._getProxyResolver();
			this._webSocket = createWebSocketPatch(params, globalThis.WebSocket, resolver.resolveProxyURL);
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
				lookupProxyAuthorization: createProxyAuthorizationLookup({
					log: proxyLog,
					lookupAuthorization: authInfo => this._hostLookupAuthorization(authInfo),
					lookupKerberosAuthorization: url => this._hostLookupKerberosAuthorization(url),
				}),
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
				// Only the local agent host wires the reverse proxy channel
				// and we want to look up the client's proxy settings only
				// when the agent host is local (i.e., on the same machine as
				// the client).
				isUseHostProxyEnabled: () => this._connections.size > 0,
				getNetworkInterfaceCheckInterval: () => 300 * 1000,
				env: process.env,
			};
			this._proxyResolver = { params, resolver: createProxyResolver(params) };
		}
		return this._proxyResolver;
	}

	private async _hostResolveProxy(url: string): Promise<string | undefined> {
		for (const connection of this._connections.values()) {
			try {
				return await connection.resolveProxy(url);
			} catch {
				// This renderer could not serve the lookup; try the next one.
			}
		}
		return undefined;
	}

	private async _hostLookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		for (const connection of this._connections.values()) {
			try {
				return await connection.lookupAuthorization(authInfo);
			} catch {
				// This renderer could not serve the lookup; try the next one.
			}
		}
		return undefined;
	}

	private async _hostLookupKerberosAuthorization(url: string): Promise<string | undefined> {
		for (const connection of this._connections.values()) {
			try {
				return await connection.lookupKerberosAuthorization(url);
			} catch {
				// This renderer could not serve the lookup; try the next one.
			}
		}
		try {
			const spn = this.getConfigurationValue<string>(AgentHostProxyConfigKey.ProxyKerberosServicePrincipal);
			return `Negotiate ${await this._lookupKerberosAuthorization(url, spn)}`;
		} catch (error) {
			this._logService.debug('AgentHostProxyResolver#lookupKerberosAuthorization Kerberos authentication failed', error);
			return undefined;
		}
	}

	protected _lookupKerberosAuthorization(url: string, spn: string | undefined): Promise<string> {
		return lookupKerberosAuthorization(url, spn, this._logService, 'AgentHostProxyResolver#lookupKerberosAuthorization');
	}
}
