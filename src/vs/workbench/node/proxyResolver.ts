/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';
import * as nodeurl from 'url';

import { assign } from 'vs/base/common/objects';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ProxyAgent } from 'vscode-proxy-agent';
import { MainThreadTelemetryShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostLogService } from 'vs/workbench/api/node/extHostLogService';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { URI } from 'vs/base/common/uri';

export function connectProxyResolver(
	extHostWorkspace: ExtHostWorkspace,
	extHostConfiguration: ExtHostConfiguration,
	extensionService: ExtHostExtensionService,
	extHostLogService: ExtHostLogService,
	mainThreadTelemetry: MainThreadTelemetryShape
) {
	const agent = createProxyAgent(extHostWorkspace, extHostConfiguration, extHostLogService, mainThreadTelemetry);
	const lookup = createPatchedModules(extHostConfiguration, agent);
	return configureModuleLoading(extensionService, lookup);
}

const maxCacheEntries = 5000; // Cache can grow twice that much due to 'oldCache'.

function createProxyAgent(
	extHostWorkspace: ExtHostWorkspace,
	extHostConfiguration: ExtHostConfiguration,
	extHostLogService: ExtHostLogService,
	mainThreadTelemetry: MainThreadTelemetryShape
) {
	let settingsProxy = proxyFromConfigURL(extHostConfiguration.getConfiguration('http')
		.get<string>('proxy'));
	extHostConfiguration.onDidChangeConfiguration(e => {
		settingsProxy = proxyFromConfigURL(extHostConfiguration.getConfiguration('http')
			.get<string>('proxy'));
	});
	const env = process.env;
	let envProxy = proxyFromConfigURL(env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY); // Not standardized.

	let cacheRolls = 0;
	let oldCache = new Map<string, string>();
	let cache = new Map<string, string>();
	function getCacheKey(url: nodeurl.UrlWithStringQuery) {
		// Expecting proxies to usually be the same per scheme://host:port. Assuming that for performance.
		return nodeurl.format({ ...url, ...{ pathname: undefined, search: undefined, hash: undefined } });
	}
	function getCachedProxy(key: string) {
		let proxy = cache.get(key);
		if (proxy) {
			return proxy;
		}
		proxy = oldCache.get(key);
		if (proxy) {
			oldCache.delete(key);
			cacheProxy(key, proxy);
		}
		return proxy;
	}
	function cacheProxy(key: string, proxy: string) {
		cache.set(key, proxy);
		if (cache.size >= maxCacheEntries) {
			oldCache = cache;
			cache = new Map();
			cacheRolls++;
			extHostLogService.trace('ProxyResolver#cacheProxy cacheRolls', cacheRolls);
		}
	}

	let timeout: NodeJS.Timer | undefined;
	let count = 0;
	let duration = 0;
	let errorCount = 0;
	let cacheCount = 0;
	let envCount = 0;
	let settingsCount = 0;
	let localhostCount = 0;
	function logEvent() {
		timeout = undefined;
		/* __GDPR__
			"resolveProxy" : {
				"count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"errorCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"cacheCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"cacheSize": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"cacheRolls": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"envCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"settingsCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"localhostCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
		mainThreadTelemetry.$publicLog('resolveProxy', { count, duration, errorCount, cacheCount, cacheSize: cache.size, cacheRolls, envCount, settingsCount, localhostCount });
		count = duration = errorCount = cacheCount = envCount = settingsCount = localhostCount = 0;
	}

	function resolveProxy(url: string, callback: (proxy?: string) => void) {
		if (!timeout) {
			timeout = setTimeout(logEvent, 10 * 60 * 1000);
		}

		const parsedUrl = nodeurl.parse(url); // Coming from Node's URL, sticking with that.

		const hostname = parsedUrl.hostname;
		if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '::ffff:127.0.0.1') {
			localhostCount++;
			callback('DIRECT');
			extHostLogService.trace('ProxyResolver#resolveProxy localhost', url, 'DIRECT');
			return;
		}

		if (settingsProxy) {
			settingsCount++;
			callback(settingsProxy);
			extHostLogService.trace('ProxyResolver#resolveProxy settings', url, settingsProxy);
			return;
		}

		if (envProxy) {
			envCount++;
			callback(envProxy);
			extHostLogService.trace('ProxyResolver#resolveProxy env', url, envProxy);
			return;
		}

		const key = getCacheKey(parsedUrl);
		const proxy = getCachedProxy(key);
		if (proxy) {
			cacheCount++;
			callback(proxy);
			extHostLogService.trace('ProxyResolver#resolveProxy cached', url, proxy);
			return;
		}

		const start = Date.now();
		extHostWorkspace.resolveProxy(url) // Use full URL to ensure it is an actually used one.
			.then(proxy => {
				cacheProxy(key, proxy);
				callback(proxy);
				extHostLogService.debug('ProxyResolver#resolveProxy', url, proxy);
			}).then(() => {
				count++;
				duration = Date.now() - start + duration;
			}, err => {
				errorCount++;
				callback();
				extHostLogService.error('ProxyResolver#resolveProxy', toErrorMessage(err));
			});
	}

	return new ProxyAgent({ resolveProxy });
}

function proxyFromConfigURL(configURL: string) {
	const url = (configURL || '').trim();
	const i = url.indexOf('://');
	if (i === -1) {
		return undefined;
	}
	const scheme = url.substr(0, i).toLowerCase();
	const proxy = url.substr(i + 3);
	if (scheme === 'http') {
		return 'PROXY ' + proxy;
	} else if (scheme === 'https') {
		return 'HTTPS ' + proxy;
	} else if (scheme === 'socks') {
		return 'SOCKS ' + proxy;
	}
	return undefined;
}

function createPatchedModules(extHostConfiguration: ExtHostConfiguration, agent: http.Agent) {
	const setting = {
		config: extHostConfiguration.getConfiguration('http')
			.get<string>('proxySupport') || 'off'
	};
	extHostConfiguration.onDidChangeConfiguration(e => {
		setting.config = extHostConfiguration.getConfiguration('http')
			.get<string>('proxySupport') || 'off';
	});

	return {
		http: {
			off: assign({}, http, patches(http, agent, { config: 'off' }, true)),
			on: assign({}, http, patches(http, agent, { config: 'on' }, true)),
			override: assign({}, http, patches(http, agent, { config: 'override' }, true)),
			onRequest: assign({}, http, patches(http, agent, setting, true)),
			default: assign(http, patches(http, agent, setting, false)) // run last
		},
		https: {
			off: assign({}, https, patches(https, agent, { config: 'off' }, true)),
			on: assign({}, https, patches(https, agent, { config: 'on' }, true)),
			override: assign({}, https, patches(https, agent, { config: 'override' }, true)),
			onRequest: assign({}, https, patches(https, agent, setting, true)),
			default: assign(https, patches(https, agent, setting, false)) // run last
		}
	};
}

function patches(originals: typeof http | typeof https, agent: http.Agent, setting: { config: string; }, onRequest: boolean) {

	return {
		get: patch(originals.get),
		request: patch(originals.request)
	};

	function patch(original: typeof http.get) {
		function patched(url: string | URL, options?: http.RequestOptions, callback?: (res: http.IncomingMessage) => void): http.ClientRequest {
			if (typeof url !== 'string' && !(url && (<any>url).searchParams)) {
				callback = <any>options;
				options = url;
				url = null;
			}
			if (typeof options === 'function') {
				callback = options;
				options = null;
			}
			options = options || {};

			const config = onRequest && ((<any>options)._vscodeProxySupport || /* LS */ (<any>options)._vscodeSystemProxy) || setting.config;
			if (config === 'off') {
				return original.apply(null, arguments);
			}

			if (!options.socketPath && (config === 'override' || config === 'on' && !options.agent) && options.agent !== agent) {
				if (url) {
					const parsed = typeof url === 'string' ? nodeurl.parse(url) : url;
					options = {
						protocol: parsed.protocol,
						hostname: parsed.hostname,
						port: parsed.port,
						path: parsed.pathname,
						...options
					};
				} else {
					options = { ...options };
				}
				options.agent = agent;
				return original(options, callback);
			}

			return original.apply(null, arguments);
		}
		return patched;
	}
}

function configureModuleLoading(extensionService: ExtHostExtensionService, lookup: ReturnType<typeof createPatchedModules>): Promise<void> {
	return extensionService.getExtensionPathIndex()
		.then(extensionPaths => {
			const node_module = <any>require.__$__nodeRequire('module');
			const original = node_module._load;
			node_module._load = function load(request: string, parent: any, isMain: any) {
				if (request !== 'http' && request !== 'https') {
					return original.apply(this, arguments);
				}

				const modules = lookup[request];
				const ext = extensionPaths.findSubstr(URI.file(parent.filename).fsPath);
				if (ext && ext.enableProposedApi) {
					return modules[(<any>ext).proxySupport] || modules.onRequest;
				}
				return modules.default;
			};
		});
}