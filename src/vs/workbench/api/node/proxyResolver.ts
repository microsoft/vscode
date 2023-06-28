/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import * as net from 'net';

import { IExtHostWorkspaceProvider } from 'vs/workbench/api/common/extHostWorkspace';
import { ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';
import { MainThreadTelemetryShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtensionHostInitData } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { ExtHostExtensionService } from 'vs/workbench/api/node/extHostExtensionService';
import { URI } from 'vs/base/common/uri';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { LogLevel, createHttpPatch, createProxyResolver, createTlsPatch, ProxySupportSetting, ProxyAgentParams, createNetPatch } from '@vscode/proxy-agent';

export function connectProxyResolver(
	extHostWorkspace: IExtHostWorkspaceProvider,
	configProvider: ExtHostConfigProvider,
	extensionService: ExtHostExtensionService,
	extHostLogService: ILogService,
	mainThreadTelemetry: MainThreadTelemetryShape,
	initData: IExtensionHostInitData,
) {
	const useHostProxy = initData.environment.useHostProxy;
	const doUseHostProxy = typeof useHostProxy === 'boolean' ? useHostProxy : !initData.remote.isRemote;
	const params: ProxyAgentParams = {
		resolveProxy: url => extHostWorkspace.resolveProxy(url),
		getHttpProxySetting: () => configProvider.getConfiguration('http').get('proxy'),
		log: (level, message, ...args) => {
			switch (level) {
				case LogLevel.Trace: extHostLogService.trace(message, ...args); break;
				case LogLevel.Debug: extHostLogService.debug(message, ...args); break;
				case LogLevel.Info: extHostLogService.info(message, ...args); break;
				case LogLevel.Warning: extHostLogService.warn(message, ...args); break;
				case LogLevel.Error: extHostLogService.error(message, ...args); break;
				case LogLevel.Critical: extHostLogService.error(message, ...args); break;
				case LogLevel.Off: break;
				default: never(level, message, args); break;
			}
			function never(level: never, message: string, ...args: any[]) {
				extHostLogService.error('Unknown log level', level);
				extHostLogService.error(message, ...args);
			}
		},
		getLogLevel: () => extHostLogService.getLevel(),
		// TODO @chrmarti Remove this from proxy agent
		proxyResolveTelemetry: () => { },
		useHostProxy: doUseHostProxy,
		useSystemCertificatesV2: certSettingV2(configProvider),
		addCertificates: [],
		env: process.env,
	};
	configProvider.onDidChangeConfiguration(e => {
		params.useSystemCertificatesV2 = certSettingV2(configProvider);
	});
	const resolveProxy = createProxyResolver(params);
	const lookup = createPatchedModules(params, configProvider, resolveProxy);
	return configureModuleLoading(extensionService, lookup);
}

function createPatchedModules(params: ProxyAgentParams, configProvider: ExtHostConfigProvider, resolveProxy: ReturnType<typeof createProxyResolver>) {
	const proxySetting = {
		config: configProvider.getConfiguration('http')
			.get<ProxySupportSetting>('proxySupport') || 'off'
	};
	configProvider.onDidChangeConfiguration(e => {
		proxySetting.config = configProvider.getConfiguration('http')
			.get<ProxySupportSetting>('proxySupport') || 'off';
	});
	const certSetting = {
		config: certSettingV1(configProvider)
	};
	configProvider.onDidChangeConfiguration(e => {
		certSetting.config = certSettingV1(configProvider);
	});

	return {
		http: {
			off: Object.assign({}, http, createHttpPatch(http, resolveProxy, { config: 'off' }, certSetting, true)),
			on: Object.assign({}, http, createHttpPatch(http, resolveProxy, { config: 'on' }, certSetting, true)),
			override: Object.assign({}, http, createHttpPatch(http, resolveProxy, { config: 'override' }, certSetting, true)),
			onRequest: Object.assign({}, http, createHttpPatch(http, resolveProxy, proxySetting, certSetting, true)),
			default: Object.assign(http, createHttpPatch(http, resolveProxy, proxySetting, certSetting, false)) // run last
		} as Record<string, typeof http>,
		https: {
			off: Object.assign({}, https, createHttpPatch(https, resolveProxy, { config: 'off' }, certSetting, true)),
			on: Object.assign({}, https, createHttpPatch(https, resolveProxy, { config: 'on' }, certSetting, true)),
			override: Object.assign({}, https, createHttpPatch(https, resolveProxy, { config: 'override' }, certSetting, true)),
			onRequest: Object.assign({}, https, createHttpPatch(https, resolveProxy, proxySetting, certSetting, true)),
			default: Object.assign(https, createHttpPatch(https, resolveProxy, proxySetting, certSetting, false)) // run last
		} as Record<string, typeof https>,
		net: Object.assign(net, createNetPatch(params, net)),
		tls: Object.assign(tls, createTlsPatch(params, tls))
	};
}

function certSettingV1(configProvider: ExtHostConfigProvider) {
	const http = configProvider.getConfiguration('http');
	return !http.get<boolean>('experimental.systemCertificatesV2') && !!http.get<boolean>('systemCertificates');
}

function certSettingV2(configProvider: ExtHostConfigProvider) {
	const http = configProvider.getConfiguration('http');
	return !!http.get<boolean>('experimental.systemCertificatesV2') && !!http.get<boolean>('systemCertificates');
}

const modulesCache = new Map<IExtensionDescription | undefined, { http?: typeof http; https?: typeof https }>();
function configureModuleLoading(extensionService: ExtHostExtensionService, lookup: ReturnType<typeof createPatchedModules>): Promise<void> {
	return extensionService.getExtensionPathIndex()
		.then(extensionPaths => {
			const node_module = <any>globalThis._VSCODE_NODE_MODULES.module;
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

				const modules = lookup[request];
				const ext = extensionPaths.findSubstr(URI.file(parent.filename));
				let cache = modulesCache.get(ext);
				if (!cache) {
					modulesCache.set(ext, cache = {});
				}
				if (!cache[request]) {
					const mod = modules.default;
					cache[request] = <any>{ ...mod }; // Copy to work around #93167.
				}
				return cache[request];
			};
		});
}
