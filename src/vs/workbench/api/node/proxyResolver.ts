/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
// import * as http from 'http';
// import * as https from 'https';
// import * as tls from 'tls';
// import * as net from 'net';
// ESM-comment-end

import { IExtHostWorkspaceProvider } from '../common/extHostWorkspace.js';
import { ExtHostConfigProvider } from '../common/extHostConfiguration.js';
import { MainThreadTelemetryShape } from '../common/extHost.protocol.js';
import { IExtensionHostInitData } from '../../services/extensions/common/extensionHostProtocol.js';
import { ExtHostExtensionService } from './extHostExtensionService.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService, LogLevel as LogServiceLevel } from '../../../platform/log/common/log.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { LogLevel, createHttpPatch, createProxyResolver, createTlsPatch, ProxySupportSetting, ProxyAgentParams, createNetPatch, loadSystemCertificates } from '@vscode/proxy-agent';
import { AuthInfo } from '../../../platform/request/common/request.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';

// ESM-uncomment-begin
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
// ESM-uncomment-end

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

	patchGlobalFetch(configProvider, mainThreadTelemetry, initData, disposables);

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
	const resolveProxy = createProxyResolver(params);
	const lookup = createPatchedModules(params, resolveProxy);
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

function patchGlobalFetch(configProvider: ExtHostConfigProvider, mainThreadTelemetry: MainThreadTelemetryShape, initData: IExtensionHostInitData, disposables: DisposableStore) {
	if (!initData.remote.isRemote && !(globalThis as any).__originalFetch) {
		const originalFetch = globalThis.fetch;
		(globalThis as any).__originalFetch = originalFetch;
		let useElectronFetch = configProvider.getConfiguration('http').get<boolean>('electronFetch', useElectronFetchDefault);
		disposables.add(configProvider.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('http.electronFetch')) {
				useElectronFetch = configProvider.getConfiguration('http').get<boolean>('electronFetch', useElectronFetchDefault);
			}
		}));
		const electron = require('electron');
		// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
		globalThis.fetch = async function fetch(input: any /* RequestInfo */ | URL, init?: RequestInit) {
			function getRequestProperty(name: keyof any /* Request */ & keyof RequestInit) {
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
				const response = await originalFetch(input, init);
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
			const response = await electron.net.fetch(electronInput, init);
			monitorResponseProperties(mainThreadTelemetry, response, urlString);
			return response;
		};
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

function createPatchedModules(params: ProxyAgentParams, resolveProxy: ReturnType<typeof createProxyResolver>) {

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

const modulesCache = new Map<IExtensionDescription | undefined, { http?: typeof http; https?: typeof https }>();
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

				if (request !== 'http' && request !== 'https') {
					return original.apply(this, arguments);
				}

				const ext = extensionPaths.findSubstr(URI.file(parent.filename));
				let cache = modulesCache.get(ext);
				if (!cache) {
					modulesCache.set(ext, cache = {});
				}
				if (!cache[request]) {
					const mod = lookup[request];
					cache[request] = <any>{ ...mod }; // Copy to work around #93167.
				}
				return cache[request];
			};
		});
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
			const kerberos = await import('kerberos');
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
