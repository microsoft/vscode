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
	const agent = createProxyAgent(extHostWorkspace, extHostLogService, mainThreadTelemetry);
	const lookup = createPatchedModules(extHostConfiguration, agent);
	return configureModuleLoading(extensionService, lookup);
}

function createProxyAgent(
	extHostWorkspace: ExtHostWorkspace,
	extHostLogService: ExtHostLogService,
	mainThreadTelemetry: MainThreadTelemetryShape
) {
	let timeout: NodeJS.Timer | undefined;
	let count = 0;
	let duration = 0;
	let errorCount = 0;
	function logEvent() {
		timeout = undefined;
		/* __GDPR__
			"resolveProxy" : {
				"count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
				"errorCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
		mainThreadTelemetry.$publicLog('resolveProxy', { count, duration, errorCount });
		count = duration = errorCount = 0;
	}

	function resolveProxy(url: string, callback: (proxy?: string) => void) {
		if (!timeout) {
			timeout = setTimeout(logEvent, 10 * 60 * 1000);
		}

		const start = Date.now();
		extHostWorkspace.resolveProxy(url)
			.then(proxy => {
				callback(proxy);
			}).then(() => {
				count++;
				duration = Date.now() - start + duration;
			}, err => {
				errorCount++;
				extHostLogService.error('resolveProxy', toErrorMessage(err));
				callback();
			});
	}

	return new ProxyAgent({ resolveProxy });
}

function createPatchedModules(extHostConfiguration: ExtHostConfiguration, agent: http.Agent) {
	const setting = {
		config: extHostConfiguration.getConfiguration('http')
			.get<string>('systemProxy') || 'off'
	};
	extHostConfiguration.onDidChangeConfiguration(e => {
		setting.config = extHostConfiguration.getConfiguration('http')
			.get<string>('systemProxy') || 'off';
	});

	return {
		http: {
			off: assign({}, http, patches(http, agent, { config: 'off' }, true)),
			on: assign({}, http, patches(http, agent, { config: 'on' }, true)),
			force: assign({}, http, patches(http, agent, { config: 'force' }, true)),
			onRequest: assign({}, http, patches(http, agent, setting, true)),
			default: assign(http, patches(http, agent, setting, false)) // run last
		},
		https: {
			off: assign({}, https, patches(https, agent, { config: 'off' }, true)),
			on: assign({}, https, patches(https, agent, { config: 'on' }, true)),
			force: assign({}, https, patches(https, agent, { config: 'force' }, true)),
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

			const config = onRequest && (<any>options)._vscodeSystemProxy || setting.config;
			if (config === 'off') {
				return original.apply(null, arguments);
			}

			if (!options.socketPath && (config === 'force' || config === 'on' && !options.agent)) {
				if (url) {
					const parsed = typeof url === 'string' ? nodeurl.parse(url) : url;
					options = {
						protocol: parsed.protocol,
						hostname: parsed.hostname,
						port: parsed.port,
						path: parsed.pathname,
						...options
					};
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
					return modules[(<any>ext).systemProxy] || modules.onRequest;
				}
				return modules.default;
			};
		});
}