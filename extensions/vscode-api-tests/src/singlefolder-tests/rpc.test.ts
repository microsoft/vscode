/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('vscode', function () {

	test('rpc protocol, proxies not reachable', function () {

		const symProxy = Symbol.for('rpcProxy');
		const symProtocol = Symbol.for('rpcProtocol');

		const proxyPaths: string[] = [];
		const rpcPaths: string[] = [];

		function walk(obj: any, path: string, seen: Set<any>) {
			if (!obj) {
				return;
			}
			if (typeof obj !== 'object' && typeof obj !== 'function') {
				return;
			}
			if (seen.has(obj)) {
				return;
			}
			seen.add(obj);

			if (obj[symProtocol]) {
				rpcPaths.push(`PROTOCOL via ${path}`);
			}
			if (obj[symProxy]) {
				proxyPaths.push(`PROXY '${obj[symProxy]}' via ${path}`);
			}

			for (const key in obj) {
				walk(obj[key], `${path}.${String(key)}`, seen);
			}
		}

		try {
			walk(vscode, 'vscode', new Set());
		} catch (err) {
			assert.fail(err);
		}
		assert.strictEqual(rpcPaths.length, 0, rpcPaths.join('\n'));
		assert.strictEqual(proxyPaths.length, 0, proxyPaths.join('\n'));
	});

});
