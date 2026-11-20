/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { connect } from 'net';
import { ISocket } from '../../../../base/parts/ipc/common/ipc.net.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createRendererDebugBridge, hasRequestOrigin, isAllowedRendererDebugHost, rendererDebugSocketPathMatches } from '../../node/rendererDebugBridge.js';

suite('RendererDebugBridge', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const ident = '97b81373-9364-4380-b5c1-67344067e4df';

	test('host allowlist rejects rebound names', () => {
		assert.deepStrictEqual({
			loopback: isAllowedRendererDebugHost('127.0.0.1:9229', 9229),
			localhost: isAllowedRendererDebugHost('localhost', 9229),
			localhostPort: isAllowedRendererDebugHost('LocalHost:9229', 9229),
			ipv6: isAllowedRendererDebugHost('[::1]:9229', 9229),
			rebind: isAllowedRendererDebugHost('attacker.example:9229', 9229),
			suffix: isAllowedRendererDebugHost('127.0.0.1.attacker.example', 9229),
			wrongPort: isAllowedRendererDebugHost('127.0.0.1:80', 9229),
			missing: isAllowedRendererDebugHost(undefined, 9229),
		}, {
			loopback: true,
			localhost: true,
			localhostPort: true,
			ipv6: true,
			rebind: false,
			suffix: false,
			wrongPort: false,
			missing: false,
		});
	});

	test('socket path must be the exact ident segment', () => {
		assert.deepStrictEqual({
			exact: rendererDebugSocketPathMatches(`/${ident}`, ident),
			query: rendererDebugSocketPathMatches(`/${ident}?x=1`, ident),
			substring: rendererDebugSocketPathMatches(`/json/${ident}/list`, ident),
			prefix: rendererDebugSocketPathMatches(`/${ident.slice(0, 8)}`, ident),
			suffix: rendererDebugSocketPathMatches(`/${ident}-extra`, ident),
			empty: rendererDebugSocketPathMatches(`/${ident}`, ''),
			origin: hasRequestOrigin('https://attacker.example'),
			noOrigin: hasRequestOrigin(undefined),
		}, {
			exact: true,
			query: true,
			substring: false,
			prefix: false,
			suffix: false,
			empty: false,
			origin: true,
			noOrigin: false,
		});
	});

	test('discovery and upgrade require a loopback host and the exact path', async () => {
		const accepted: ISocket[] = [];
		const bridge = await createRendererDebugBridge(ident, socket => {
			accepted.push(socket);
		});
		store.add({ dispose: () => { bridge.server.close(); } });

		try {
			const list = await httpGet(bridge.port, '/json/list', { host: `127.0.0.1:${bridge.port}` });
			const version = await httpGet(bridge.port, '/json/version', { host: 'localhost' });
			const rebound = await httpGet(bridge.port, '/json/list', { host: `attacker.example:${bridge.port}` });
			const origin = await httpGet(bridge.port, '/json/version', { host: `127.0.0.1:${bridge.port}`, origin: 'https://attacker.example' });
			const placeholder = new URL(JSON.parse(list.body)[0].webSocketDebuggerUrl as string);
			const upgradeOk = await upgrade(bridge.port, `/${ident}`, { host: 'localhost' });
			const upgradeLoopbackHost = await upgrade(bridge.port, `/${ident}`, { host: `127.0.0.1:${bridge.port}` });
			const upgradeOrigin = await upgrade(bridge.port, `/${ident}`, { host: 'localhost', origin: 'https://attacker.example' });
			const upgradeSubstring = await upgrade(bridge.port, `/json/${ident}/list`, { host: 'localhost' });
			const upgradePlaceholder = await upgrade(bridge.port, placeholder.pathname, { host: 'localhost' });

			assert.deepStrictEqual({
				listStatus: list.status,
				listContainsIdent: list.body.includes(ident),
				listId: JSON.parse(list.body)[0].id,
				listPath: placeholder.pathname,
				versionStatus: version.status,
				versionContainsIdent: version.body.includes(ident),
				versionPath: new URL(JSON.parse(version.body).webSocketDebuggerUrl).pathname,
				reboundStatus: rebound.status,
				reboundContainsIdent: rebound.body.includes(ident),
				originStatus: origin.status,
				originContainsIdent: origin.body.includes(ident),
				upgradeOk: upgradeOk.status,
				upgradeLoopbackHost: upgradeLoopbackHost.status,
				upgradeOrigin: upgradeOrigin.status,
				upgradeSubstring: upgradeSubstring.status,
				upgradePlaceholder: upgradePlaceholder.status,
				accepted: accepted.length,
			}, {
				listStatus: 200,
				listContainsIdent: false,
				listId: 'renderer',
				listPath: '/devtools',
				versionStatus: 200,
				versionContainsIdent: false,
				versionPath: '/devtools',
				reboundStatus: 403,
				reboundContainsIdent: false,
				originStatus: 403,
				originContainsIdent: false,
				upgradeOk: 101,
				upgradeLoopbackHost: 101,
				upgradeOrigin: 403,
				upgradeSubstring: 403,
				upgradePlaceholder: 403,
				accepted: 2,
			});
		} finally {
			for (const socket of accepted) {
				socket.dispose();
			}
			await new Promise<void>(resolve => bridge.server.close(() => resolve()));
		}
	});
});

async function httpGet(port: number, path: string, headers: { host: string; origin?: string }): Promise<{ status: number; body: string }> {
	const { get } = await import('http');
	return new Promise((resolve, reject) => {
		const request = get({
			host: '127.0.0.1',
			port,
			path,
			headers: {
				Host: headers.host,
				...(headers.origin ? { Origin: headers.origin } : {}),
			},
		}, response => {
			const chunks: Buffer[] = [];
			response.on('data', chunk => chunks.push(chunk));
			response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
		});
		request.on('error', reject);
	});
}

function upgrade(port: number, path: string, headers: { host: string; origin?: string }): Promise<{ status: number }> {
	return new Promise((resolve, reject) => {
		const socket = connect(port, '127.0.0.1');
		const lines = [
			`GET ${path} HTTP/1.1`,
			`Host: ${headers.host}`,
			'Upgrade: websocket',
			'Connection: Upgrade',
			'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
			'Sec-WebSocket-Version: 13',
		];
		if (headers.origin) {
			lines.push(`Origin: ${headers.origin}`);
		}

		let data = '';
		const finish = (status: number) => {
			socket.removeAllListeners();
			socket.end();
			resolve({ status });
		};
		socket.setTimeout(2000, () => finish(0));
		socket.on('error', reject);
		socket.on('data', chunk => {
			data += chunk.toString();
			const status = Number(/^HTTP\/1\.[01] (\d+)/.exec(data)?.[1] ?? 0);
			if (status > 0) {
				finish(status);
			}
		});
		socket.on('connect', () => {
			socket.write(lines.join('\r\n') + '\r\n\r\n');
		});
	});
}
