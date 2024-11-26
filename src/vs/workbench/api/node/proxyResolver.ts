/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtHostWorkspaceProvider } from '../common/extHostWorkspace.js';
import { ExtHostConfigProvider } from '../common/extHostConfiguration.js';
import { MainThreadTelemetryShape } from '../common/extHost.protocol.js';
import { IExtensionHostInitData } from '../../services/extensions/common/extensionHostProtocol.js';
import { ExtHostExtensionService } from './extHostExtensionService.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService, LogLevel as LogServiceLevel } from '../../../platform/log/common/log.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { LogLevel, createHttpPatch, createProxyResolver, createTlsPatch, ProxySupportSetting, ProxyAgentParams, createNetPatch, loadSystemCertificates, ResolveProxyWithRequest, getOrLoadAdditionalCertificates, LookupProxyAuthorization } from '@vscode/proxy-agent';
import { AuthInfo } from '../../../platform/request/common/request.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { createRequire } from 'node:module';
import type * as undiciType from 'undici-types';
import type * as tlsType from 'tls';
import type * as streamType from 'stream';

const require = createRequire(import.meta.url);
const http = require('http');
const https = require('https');
const tls: typeof tlsType = require('tls');
const net = require('net');
const undici: typeof undiciType = require('undici');

const systemCertificatesV2Default = false;
const useElectronFetchDefault = false;

export function connectProxyResolver(
	extHostWorkspace: IExtHostWorkspaceProvider,
	configProvider: ExtHostConfigProvider,
	extensionService: ExtHostExtensionService,
	extHostLogService: ILogService,
	mainThreadTelemetry: MainThreadTelemetryShape,
	initData: IExtensionHostInitData,
	disposables: DisposableStore,
) {

	const useHostProxy = initData.environment.useHostProxy;
	const doUseHostProxy = typeof useHostProxy === 'boolean' ? useHostProxy : !initData.remote.isRemote;
	const params: ProxyAgentParams = {
		resolveProxy: url => extHostWorkspace.resolveProxy(url),
		lookupProxyAuthorization: lookupProxyAuthorization.bind(undefined, extHostWorkspace, extHostLogService, mainThreadTelemetry, configProvider, {}, {}, initData.remote.isRemote, doUseHostProxy),
		getProxyURL: () => configProvider.getConfiguration('http').get('proxy'),
		getProxySupport: () => configProvider.getConfiguration('http').get<ProxySupportSetting>('proxySupport') || 'off',
		getNoProxyConfig: () => configProvider.getConfiguration('http').get<string[]>('noProxy') || [],
		addCertificatesV1: () => certSettingV1(configProvider),
		addCertificatesV2: () => certSettingV2(configProvider),
		log: extHostLogService,
		getLogLevel: () => {
			const level = extHostLogService.getLevel();
			switch (level) {
				case LogServiceLevel.Trace: return LogLevel.Trace;
				case LogServiceLevel.Debug: return LogLevel.Debug;
				case LogServiceLevel.Info: return LogLevel.Info;
				case LogServiceLevel.Warning: return LogLevel.Warning;
				case LogServiceLevel.Error: return LogLevel.Error;
				case LogServiceLevel.Off: return LogLevel.Off;
				default: return never(level);
			}
			function never(level: never) {
				extHostLogService.error('Unknown log level', level);
				return LogLevel.Debug;
			}
		},
		proxyResolveTelemetry: () => { },
		useHostProxy: doUseHostProxy,
		loadAdditionalCertificates: async () => {
			const promises: Promise<string[]>[] = [];
			if (initData.remote.isRemote) {
				promises.push(loadSystemCertificates({ log: extHostLogService }));
			}
			if (doUseHostProxy) {
				extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loading certificates from main process');
				const certs = extHostWorkspace.loadCertificates(); // Loading from main process to share cache.
				certs.then(certs => extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loaded certificates from main process', certs.length));
				promises.push(certs);
			}
			// Using https.globalAgent because it is shared with proxy.test.ts and mutable.
			if (initData.environment.extensionTestsLocationURI && (https.globalAgent as any).testCertificates?.length) {
				extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loading test certificates');
				promises.push(Promise.resolve((https.globalAgent as any).testCertificates as string[]));
			}
			return (await Promise.all(promises)).flat();
		},
		env: process.env,
	};
	const { resolveProxyWithRequest, resolveProxyURL } = createProxyResolver(params);

	patchGlobalFetch(configProvider, mainThreadTelemetry, initData, resolveProxyURL, params.lookupProxyAuthorization!, getOrLoadAdditionalCertificates.bind(undefined, params), disposables);

	const lookup = createPatchedModules(params, resolveProxyWithRequest);
	return configureModuleLoading(extensionService, lookup);
}

const unsafeHeaders = [
	'content-length',
	'host',
	'trailer',
	'te',
	'upgrade',
	'cookie2',
	'keep-alive',
	'transfer-encoding',
	'set-cookie',
];

function patchGlobalFetch(configProvider: ExtHostConfigProvider, mainThreadTelemetry: MainThreadTelemetryShape, initData: IExtensionHostInitData, resolveProxyURL: (url: string) => Promise<string | undefined>, lookupProxyAuthorization: LookupProxyAuthorization, loadAdditionalCertificates: () => Promise<string[]>, disposables: DisposableStore) {
	if (!(globalThis as any).__vscodeOriginalFetch) {
		const originalFetch = globalThis.fetch;
		(globalThis as any).__vscodeOriginalFetch = originalFetch;
		const patchedFetch = patchFetch(originalFetch, configProvider, resolveProxyURL, lookupProxyAuthorization, loadAdditionalCertificates);
		(globalThis as any).__vscodePatchedFetch = patchedFetch;
		let useElectronFetch = false;
		if (!initData.remote.isRemote) {
			useElectronFetch = configProvider.getConfiguration('http').get<boolean>('electronFetch', useElectronFetchDefault);
			disposables.add(configProvider.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('http.electronFetch')) {
					useElectronFetch = configProvider.getConfiguration('http').get<boolean>('electronFetch', useElectronFetchDefault);
				}
			}));
		}
		// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
		globalThis.fetch = async function fetch(input: string | URL | Request, init?: RequestInit) {
			function getRequestProperty(name: keyof Request & keyof RequestInit) {
				return init && name in init ? init[name] : typeof input === 'object' && 'cache' in input ? input[name] : undefined;
			}
			// Limitations: https://github.com/electron/electron/pull/36733#issuecomment-1405615494
			// net.fetch fails on manual redirect: https://github.com/electron/electron/issues/43715
			const urlString = typeof input === 'string' ? input : 'cache' in input ? input.url : input.toString();
			const isDataUrl = urlString.startsWith('data:');
			if (isDataUrl) {
				recordFetchFeatureUse(mainThreadTelemetry, 'data');
			}
			const isBlobUrl = urlString.startsWith('blob:');
			if (isBlobUrl) {
				recordFetchFeatureUse(mainThreadTelemetry, 'blob');
			}
			const isManualRedirect = getRequestProperty('redirect') === 'manual';
			if (isManualRedirect) {
				recordFetchFeatureUse(mainThreadTelemetry, 'manualRedirect');
			}
			const integrity = getRequestProperty('integrity');
			if (integrity) {
				recordFetchFeatureUse(mainThreadTelemetry, 'integrity');
			}
			if (!useElectronFetch || isDataUrl || isBlobUrl || isManualRedirect || integrity) {
				const response = await patchedFetch(input, init, urlString);
				monitorResponseProperties(mainThreadTelemetry, response, urlString);
				return response;
			}
			// Unsupported headers: https://source.chromium.org/chromium/chromium/src/+/main:services/network/public/cpp/header_util.cc;l=32;drc=ee7299f8961a1b05a3554efcc496b6daa0d7f6e1
			if (init?.headers) {
				const headers = new Headers(init.headers);
				for (const header of unsafeHeaders) {
					headers.delete(header);
				}
				init = { ...init, headers };
			}
			// Support for URL: https://github.com/electron/electron/issues/43712
			const electronInput = input instanceof URL ? input.toString() : input;
			const electron = require('electron');
			const response = await electron.net.fetch(electronInput, init);
			monitorResponseProperties(mainThreadTelemetry, response, urlString);
			return response;
		};
	}
}

function patchFetch(originalFetch: typeof globalThis.fetch, configProvider: ExtHostConfigProvider, resolveProxyURL: (url: string) => Promise<string | undefined>, lookupProxyAuthorization: LookupProxyAuthorization, loadAdditionalCertificates: () => Promise<string[]>) {
	return async function patchedFetch(input: string | URL | Request, init?: RequestInit, urlString?: string) {
		const config = configProvider.getConfiguration('http');
		const enabled = config.get<boolean>('fetchAdditionalSupport');
		if (!enabled) {
			return originalFetch(input, init);
		}
		const proxySupport = config.get<ProxySupportSetting>('proxySupport') || 'off';
		const doResolveProxy = proxySupport === 'override' || proxySupport === 'fallback' || (proxySupport === 'on' && ((init as any)?.dispatcher) === undefined);
		const addCerts = config.get<boolean>('systemCertificates');
		if (!doResolveProxy && !addCerts) {
			return originalFetch(input, init);
		}
		if (!urlString) { // for testing
			urlString = typeof input === 'string' ? input : 'cache' in input ? input.url : input.toString();
		}
		const proxyURL = doResolveProxy ? await resolveProxyURL(urlString) : undefined;
		if (!proxyURL && !addCerts) {
			return originalFetch(input, init);
		}
		const ca = addCerts ? [...tls.rootCertificates, ...await loadAdditionalCertificates()] : undefined;
		const { allowH2, requestCA, proxyCA } = getAgentOptions(ca, init);
		if (!proxyURL) {
			const modifiedInit = {
				...init,
				dispatcher: new undici.Agent({
					allowH2,
					connect: { ca: requestCA },
				})
			};
			return originalFetch(input, modifiedInit);
		}

		const state: Record<string, any> = {};
		const proxyAuthorization = await lookupProxyAuthorization(proxyURL, undefined, state);
		const modifiedInit = {
			...init,
			dispatcher: new undici.ProxyAgent({
				uri: proxyURL,
				allowH2,
				headers: proxyAuthorization ? { 'Proxy-Authorization': proxyAuthorization } : undefined,
				...(requestCA ? { requestTls: { ca: requestCA } } : {}),
				...(proxyCA ? { proxyTls: { ca: proxyCA } } : {}),
				clientFactory: (origin: URL, opts: object): undiciType.Dispatcher => (new undici.Pool(origin, opts) as any).compose((dispatch: undiciType.Dispatcher['dispatch']) => {
					class ProxyAuthHandler extends undici.DecoratorHandler {
						private abort: ((err?: Error) => void) | undefined;
						constructor(private dispatch: undiciType.Dispatcher['dispatch'], private options: undiciType.Dispatcher.DispatchOptions, private handler: undiciType.Dispatcher.DispatchHandlers) {
							super(handler);
						}
						onConnect(abort: (err?: Error) => void): void {
							this.abort = abort;
							this.handler.onConnect?.(abort);
						}
						onError(err: Error): void {
							if (!(err instanceof ProxyAuthError)) {
								return this.handler.onError?.(err);
							}
							(async () => {
								try {
									const proxyAuthorization = await lookupProxyAuthorization(proxyURL!, err.proxyAuthenticate, state);
									if (proxyAuthorization) {
										if (!this.options.headers) {
											this.options.headers = ['Proxy-Authorization', proxyAuthorization];
										} else if (Array.isArray(this.options.headers)) {
											const i = this.options.headers.findIndex((value, index) => index % 2 === 0 && value.toLowerCase() === 'proxy-authorization');
											if (i === -1) {
												this.options.headers.push('Proxy-Authorization', proxyAuthorization);
											} else {
												this.options.headers[i + 1] = proxyAuthorization;
											}
										} else {
											this.options.headers['Proxy-Authorization'] = proxyAuthorization;
										}
										this.dispatch(this.options, this);
									} else {
										this.handler.onError?.(new undici.errors.RequestAbortedError(`Proxy response (407) ?.== 200 when HTTP Tunneling`)); // Mimick undici's behavior
									}
								} catch (err) {
									this.handler.onError?.(err);
								}
							})();
						}
						onUpgrade(statusCode: number, headers: Buffer[] | string[] | null, socket: streamType.Duplex): void {
							if (statusCode === 407 && headers) {
								const proxyAuthenticate: string[] = [];
								for (let i = 0; i < headers.length; i += 2) {
									if (headers[i].toString().toLowerCase() === 'proxy-authenticate') {
										proxyAuthenticate.push(headers[i + 1].toString());
									}
								}
								if (proxyAuthenticate.length) {
									this.abort?.(new ProxyAuthError(proxyAuthenticate));
									return;
								}
							}
							this.handler.onUpgrade?.(statusCode, headers, socket);
						}
					}
					return function proxyAuthDispatch(options: undiciType.Dispatcher.DispatchOptions, handler: undiciType.Dispatcher.DispatchHandlers) {
						return dispatch(options, new ProxyAuthHandler(dispatch, options, handler));
					};
				}),
			})
		};
		return originalFetch(input, modifiedInit);
	};
}

class ProxyAuthError extends Error {
	constructor(public proxyAuthenticate: string[]) {
		super('Proxy authentication required');
	}
}

function monitorResponseProperties(mainThreadTelemetry: MainThreadTelemetryShape, response: Response, urlString: string) {
	const originalUrl = response.url;
	Object.defineProperty(response, 'url', {
		get() {
			recordFetchFeatureUse(mainThreadTelemetry, 'url');
			return originalUrl || urlString;
		}
	});
	const originalType = response.type;
	Object.defineProperty(response, 'type', {
		get() {
			recordFetchFeatureUse(mainThreadTelemetry, 'typeProperty');
			return originalType !== 'default' ? originalType : 'basic';
		}
	});
}

type FetchFeatureUseClassification = {
	owner: 'chrmarti';
	comment: 'Data about fetch API use';
	url: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the url property was used.' };
	typeProperty: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the type property was used.' };
	data: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a data URL was used.' };
	blob: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a blob URL was used.' };
	integrity: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the integrity property was used.' };
	manualRedirect: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a manual redirect was used.' };
};

type FetchFeatureUseEvent = {
	url: number;
	typeProperty: number;
	data: number;
	blob: number;
	integrity: number;
	manualRedirect: number;
};

const fetchFeatureUse: FetchFeatureUseEvent = {
	url: 0,
	typeProperty: 0,
	data: 0,
	blob: 0,
	integrity: 0,
	manualRedirect: 0,
};

let timer: NodeJS.Timeout | undefined;

function recordFetchFeatureUse(mainThreadTelemetry: MainThreadTelemetryShape, feature: keyof typeof fetchFeatureUse) {
	if (!fetchFeatureUse[feature]++) {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			mainThreadTelemetry.$publicLog2<FetchFeatureUseEvent, FetchFeatureUseClassification>('fetchFeatureUse', fetchFeatureUse);
		}, 10000); // collect additional features for 10 seconds
		timer.unref();
	}
}

function createPatchedModules(params: ProxyAgentParams, resolveProxy: ResolveProxyWithRequest) {

	function mergeModules(module: any, patch: any) {
		return Object.assign(module.default || module, patch);
	}

	return {
		http: mergeModules(http, createHttpPatch(params, http, resolveProxy)),
		https: mergeModules(https, createHttpPatch(params, https, resolveProxy)),
		net: mergeModules(net, createNetPatch(params, net)),
		tls: mergeModules(tls, createTlsPatch(params, tls))
	};
}

function certSettingV1(configProvider: ExtHostConfigProvider) {
	const http = configProvider.getConfiguration('http');
	return !http.get<boolean>('experimental.systemCertificatesV2', systemCertificatesV2Default) && !!http.get<boolean>('systemCertificates');
}

function certSettingV2(configProvider: ExtHostConfigProvider) {
	const http = configProvider.getConfiguration('http');
	return !!http.get<boolean>('experimental.systemCertificatesV2', systemCertificatesV2Default) && !!http.get<boolean>('systemCertificates');
}

const modulesCache = new Map<IExtensionDescription | undefined, { http?: typeof http; https?: typeof https; undici?: typeof undiciType }>();
function configureModuleLoading(extensionService: ExtHostExtensionService, lookup: ReturnType<typeof createPatchedModules>): Promise<void> {
	return extensionService.getExtensionPathIndex()
		.then(extensionPaths => {
			const node_module = require('module');
			const original = node_module._load;
			node_module._load = function load(request: string, parent: { filename: string }, isMain: boolean) {
				if (request === 'net') {
					return lookup.net;
				}

				if (request === 'tls') {
					return lookup.tls;
				}

				if (request !== 'http' && request !== 'https' && request !== 'undici') {
					return original.apply(this, arguments);
				}

				const ext = extensionPaths.findSubstr(URI.file(parent.filename));
				let cache = modulesCache.get(ext);
				if (!cache) {
					modulesCache.set(ext, cache = {});
				}
				if (!cache[request]) {
					if (request === 'undici') {
						const undici = original.apply(this, arguments);
						patchUndici(undici);
						cache[request] = undici;
					} else {
						const mod = lookup[request];
						cache[request] = <any>{ ...mod }; // Copy to work around #93167.
					}
				}
				return cache[request];
			};
		});
}

const agentOptions = Symbol('agentOptions');
const proxyAgentOptions = Symbol('proxyAgentOptions');

function patchUndici(undici: typeof undiciType) {
	const originalAgent = undici.Agent;
	const patchedAgent = function PatchedAgent(opts?: undiciType.Agent.Options): undiciType.Agent {
		const agent = new originalAgent(opts);
		(agent as any)[agentOptions] = {
			...opts,
			...(opts?.connect && typeof opts?.connect === 'object' ? { connect: { ...opts.connect } } : undefined),
		};
		return agent;
	};
	patchedAgent.prototype = originalAgent.prototype;
	(undici as any).Agent = patchedAgent;

	const originalProxyAgent = undici.ProxyAgent;
	const patchedProxyAgent = function PatchedProxyAgent(opts: undiciType.ProxyAgent.Options | string): undiciType.ProxyAgent {
		const proxyAgent = new originalProxyAgent(opts);
		(proxyAgent as any)[proxyAgentOptions] = typeof opts === 'string' ? opts : {
			...opts,
			...(opts?.connect && typeof opts?.connect === 'object' ? { connect: { ...opts.connect } } : undefined),
		};
		return proxyAgent;
	};
	patchedProxyAgent.prototype = originalProxyAgent.prototype;
	(undici as any).ProxyAgent = patchedProxyAgent;
}

function getAgentOptions(systemCA: string[] | undefined, requestInit: RequestInit | undefined) {
	let allowH2: boolean | undefined;
	let requestCA: string | Buffer | Array<string | Buffer> | undefined = systemCA;
	let proxyCA: string | Buffer | Array<string | Buffer> | undefined = systemCA;
	const dispatcher: undiciType.Dispatcher = (requestInit as any)?.dispatcher;
	const originalAgentOptions: undiciType.Agent.Options | undefined = dispatcher && (dispatcher as any)[agentOptions];
	if (originalAgentOptions) {
		allowH2 = originalAgentOptions.allowH2;
		requestCA = originalAgentOptions.connect && typeof originalAgentOptions.connect === 'object' && 'ca' in originalAgentOptions.connect && originalAgentOptions.connect.ca || systemCA;
	}
	const originalProxyAgentOptions: undiciType.ProxyAgent.Options | string | undefined = dispatcher && (dispatcher as any)[proxyAgentOptions];
	if (originalProxyAgentOptions && typeof originalProxyAgentOptions === 'object') {
		allowH2 = originalProxyAgentOptions.allowH2;
		requestCA = originalProxyAgentOptions.requestTls && 'ca' in originalProxyAgentOptions.requestTls && originalProxyAgentOptions.requestTls.ca || systemCA;
		proxyCA = originalProxyAgentOptions.proxyTls && 'ca' in originalProxyAgentOptions.proxyTls && originalProxyAgentOptions.proxyTls.ca || systemCA;
	}
	return { allowH2, requestCA, proxyCA };
}

async function lookupProxyAuthorization(
	extHostWorkspace: IExtHostWorkspaceProvider,
	extHostLogService: ILogService,
	mainThreadTelemetry: MainThreadTelemetryShape,
	configProvider: ExtHostConfigProvider,
	proxyAuthenticateCache: Record<string, string | string[] | undefined>,
	basicAuthCache: Record<string, string | undefined>,
	isRemote: boolean,
	useHostProxy: boolean,
	proxyURL: string,
	proxyAuthenticate: string | string[] | undefined,
	state: { kerberosRequested?: boolean; basicAuthCacheUsed?: boolean; basicAuthAttempt?: number }
): Promise<string | undefined> {
	const cached = proxyAuthenticateCache[proxyURL];
	if (proxyAuthenticate) {
		proxyAuthenticateCache[proxyURL] = proxyAuthenticate;
	}
	extHostLogService.trace('ProxyResolver#lookupProxyAuthorization callback', `proxyURL:${proxyURL}`, `proxyAuthenticate:${proxyAuthenticate}`, `proxyAuthenticateCache:${cached}`);
	const header = proxyAuthenticate || cached;
	const authenticate = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
	sendTelemetry(mainThreadTelemetry, authenticate, isRemote);
	if (authenticate.some(a => /^(Negotiate|Kerberos)( |$)/i.test(a)) && !state.kerberosRequested) {
		state.kerberosRequested = true;

		try {
			const importKerberos = await import('kerberos');
			const kerberos = importKerberos.default || importKerberos;
			const url = new URL(proxyURL);
			const spn = configProvider.getConfiguration('http').get<string>('proxyKerberosServicePrincipal')
				|| (process.platform === 'win32' ? `HTTP/${url.hostname}` : `HTTP@${url.hostname}`);
			extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Kerberos authentication lookup', `proxyURL:${proxyURL}`, `spn:${spn}`);
			const client = await kerberos.initializeClient(spn);
			const response = await client.step('');
			return 'Negotiate ' + response;
		} catch (err) {
			extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Kerberos authentication failed', err);
		}

		if (isRemote && useHostProxy) {
			extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Kerberos authentication lookup on host', `proxyURL:${proxyURL}`);
			const auth = await extHostWorkspace.lookupKerberosAuthorization(proxyURL);
			if (auth) {
				return 'Negotiate ' + auth;
			}
		}
	}
	const basicAuthHeader = authenticate.find(a => /^Basic( |$)/i.test(a));
	if (basicAuthHeader) {
		try {
			const cachedAuth = basicAuthCache[proxyURL];
			if (cachedAuth) {
				if (state.basicAuthCacheUsed) {
					extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication deleting cached credentials', `proxyURL:${proxyURL}`);
					delete basicAuthCache[proxyURL];
				} else {
					extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication using cached credentials', `proxyURL:${proxyURL}`);
					state.basicAuthCacheUsed = true;
					return cachedAuth;
				}
			}
			state.basicAuthAttempt = (state.basicAuthAttempt || 0) + 1;
			const realm = / realm="([^"]+)"/i.exec(basicAuthHeader)?.[1];
			extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication lookup', `proxyURL:${proxyURL}`, `realm:${realm}`);
			const url = new URL(proxyURL);
			const authInfo: AuthInfo = {
				scheme: 'basic',
				host: url.hostname,
				port: Number(url.port),
				realm: realm || '',
				isProxy: true,
				attempt: state.basicAuthAttempt,
			};
			const credentials = await extHostWorkspace.lookupAuthorization(authInfo);
			if (credentials) {
				extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication received credentials', `proxyURL:${proxyURL}`, `realm:${realm}`);
				const auth = 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
				basicAuthCache[proxyURL] = auth;
				return auth;
			} else {
				extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication received no credentials', `proxyURL:${proxyURL}`, `realm:${realm}`);
			}
		} catch (err) {
			extHostLogService.error('ProxyResolver#lookupProxyAuthorization Basic authentication failed', err);
		}
	}
	return undefined;
}

type ProxyAuthenticationClassification = {
	owner: 'chrmarti';
	comment: 'Data about proxy authentication requests';
	authenticationType: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'Type of the authentication requested' };
	extensionHostType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Type of the extension host' };
};

type ProxyAuthenticationEvent = {
	authenticationType: string;
	extensionHostType: string;
};

let telemetrySent = false;

function sendTelemetry(mainThreadTelemetry: MainThreadTelemetryShape, authenticate: string[], isRemote: boolean) {
	if (telemetrySent || !authenticate.length) {
		return;
	}
	telemetrySent = true;

	mainThreadTelemetry.$publicLog2<ProxyAuthenticationEvent, ProxyAuthenticationClassification>('proxyAuthenticationRequest', {
		authenticationType: authenticate.map(a => a.split(' ')[0]).join(','),
		extensionHostType: isRemote ? 'remote' : 'local',
	});
}
