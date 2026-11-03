/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';

export interface IResolvedServerUrls {
	readonly local: readonly string[];
	readonly network: readonly string[];
}

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '0000:0000:0000:0000:0000:0000:0000:0001']);
const wildcardHosts = new Set(['0.0.0.0', '::', '0000:0000:0000:0000:0000:0000:0000:0000']);

export function resolveServerUrls(host: string | undefined, port: number, networkInterfaces: ReturnType<typeof os.networkInterfaces> = os.networkInterfaces()): IResolvedServerUrls {
	if (host === undefined) {
		return { local: [formatWebSocketUrl('localhost', port)], network: [] };
	}

	if (!wildcardHosts.has(host)) {
		const url = formatWebSocketUrl(host, port);
		return loopbackHosts.has(host)
			? { local: [url], network: [] }
			: { local: [], network: [url] };
	}

	const network = new Set<string>();
	for (const netInterface of Object.values(networkInterfaces)) {
		for (const detail of netInterface ?? []) {
			if (detail.family !== 'IPv4' || detail.internal) {
				continue;
			}

			network.add(formatWebSocketUrl(detail.address, port));
		}
	}

	return {
		local: [formatWebSocketUrl('localhost', port)],
		network: [...network],
	};
}

export function formatWebSocketUrl(host: string, port: number): string {
	const normalizedHost = host.includes(':') ? `[${host}]` : host;
	return `ws://${normalizedHost}:${port}`;
}
