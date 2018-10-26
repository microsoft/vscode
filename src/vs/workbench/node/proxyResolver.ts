/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import * as http from 'http';
import * as https from 'https';
import * as nodeurl from 'url';
import { ProxyAgent } from 'vscode-proxy-agent';
import { MainThreadTelemetryShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostLogService } from 'vs/workbench/api/node/extHostLogService';
import { toErrorMessage } from 'vs/base/common/errorMessage';

export function connectProxyResolver(extHostWorkspace: ExtHostWorkspace, extHostConfiguration: ExtHostConfiguration, extHostLogService: ExtHostLogService, mainThreadTelemetry: MainThreadTelemetryShape) {
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

	const agent = new ProxyAgent({ resolveProxy });

	let config = extHostConfiguration.getConfiguration('http').get('systemProxy') || 'off';
	extHostConfiguration.onDidChangeConfiguration(e => {
		config = extHostConfiguration.getConfiguration('http').get('systemProxy') || 'off';
	});

	function patch(original: typeof http.get) {
		function patched(url: string | URL, options?: http.RequestOptions, callback?: (res: http.IncomingMessage) => void): http.ClientRequest {
			if (config === 'off') {
				return original.apply(null, arguments);
			}

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

	(<any>http).get = patch(http.get);
	(<any>http).request = patch(http.request);
	(<any>https).get = patch(https.get);
	(<any>https).request = patch(https.request);
}