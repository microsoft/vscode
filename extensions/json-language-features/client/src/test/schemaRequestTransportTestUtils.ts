/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';
import { createRequire } from 'module';
import { compileFunction, createContext } from 'vm';
import type { XHROptions } from 'request-light';

type RequestLight = typeof import('request-light');
type Protocol = 'http:' | 'https:';

export const connectionBlocked = 'Schema test stopped before creating a socket';

export function createNativeSchemaTransport() {
	const calls: XHROptions[] = [];
	const requests: {
		protocol: Protocol;
		hostname: https.RequestOptions['hostname'];
		port: https.RequestOptions['port'];
		path: https.RequestOptions['path'];
		method: string | undefined;
		rejectUnauthorized: boolean | undefined;
	}[] = [];
	const destinations: {
		protocol: Protocol;
		hostname: https.RequestOptions['hostname'];
		host: https.RequestOptions['host'];
		port: https.RequestOptions['port'];
		servername: string | undefined;
	}[] = [];

	const stopConnection = (protocol: Protocol, options: https.RequestOptions): never => {
		destinations.push({
			protocol,
			hostname: options.hostname,
			host: options.host,
			port: options.port,
			servername: options.servername
		});
		throw new Error(connectionBlocked);
	};

	class NonConnectingHttpAgent extends http.Agent {
		override createConnection(options: http.ClientRequestArgs): never {
			return stopConnection('http:', options);
		}
	}

	class NonConnectingHttpsAgent extends https.Agent {
		override createConnection(options: https.RequestOptions): never {
			return stopConnection('https:', options);
		}
	}

	const httpAgent = new NonConnectingHttpAgent();
	const httpsAgent = new NonConnectingHttpsAgent();
	const request = (protocol: Protocol, options: https.RequestOptions, callback?: (response: http.IncomingMessage) => void) => {
		requests.push({
			protocol,
			hostname: options.hostname,
			port: options.port,
			path: options.path,
			method: options.method,
			rejectUnauthorized: options.rejectUnauthorized
		});
		// Keep native option validation and destination selection, but never create a socket.
		return protocol === 'https:'
			? https.request({ ...options, agent: httpsAgent }, callback)
			: http.request({ ...options, agent: httpAgent }, callback);
	};

	const requireDependency = createRequire(__filename);
	const filename = requireDependency.resolve('request-light');
	const module: { exports: Partial<RequestLight> } = { exports: {} };
	const context = createContext({ Buffer, URL, process: { env: {} }, console });
	const run = compileFunction(readFileSync(filename, 'utf8'), ['require', 'module', 'exports'], { filename, parsingContext: context });
	// Run the installed library unchanged, with isolated HTTP boundaries and no ambient proxy settings.
	run((id: string) => {
		switch (id) {
			case 'http': return { ...http, request: (options: https.RequestOptions, callback?: (response: http.IncomingMessage) => void) => request('http:', options, callback) };
			case 'https': return { ...https, request: (options: https.RequestOptions, callback?: (response: http.IncomingMessage) => void) => request('https:', options, callback) };
			default: return requireDependency(id);
		}
	}, module, module.exports);
	const { xhr, configure, getErrorStatusDescription } = module.exports;
	assert.ok(xhr && configure && getErrorStatusDescription, 'Load the installed request-light exports');
	const requestLight: RequestLight = {
		xhr: options => {
			calls.push(options);
			return xhr(options);
		},
		configure,
		getErrorStatusDescription
	};

	return {
		requestLight,
		calls,
		requests,
		destinations,
		request,
		dispose() {
			httpAgent.destroy();
			httpsAgent.destroy();
		}
	};
}
