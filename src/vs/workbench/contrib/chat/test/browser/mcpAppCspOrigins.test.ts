/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { toNetworkOrigins } from '../../browser/widget/chatContentParts/toolInvocationParts/chatMcpAppModel.js';

suite('MCP App CSP origins', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps host sources, with or without a port or wildcard', () => {
		const sources = ['example.com', '*.example.com', 'example.com:443', 'example.com:*', '*'];

		assert.deepStrictEqual(toNetworkOrigins(sources), sources);
	});

	test('a port is not mistaken for a scheme', () => {
		// `example.com` is a valid scheme spelling, so a naive scheme match would
		// read `example.com:443` as a scheme source and drop it.
		assert.deepStrictEqual(toNetworkOrigins(['example.com:443']), ['example.com:443']);
	});

	test('keeps network schemes', () => {
		const sources = [
			'https://example.com',
			'http://example.com:8080',
			'wss://example.com/socket',
			'ws://localhost:3000',
			'https://*.example.com',
			'data:',
			'blob:',
			'HTTPS://EXAMPLE.COM',
		];

		assert.deepStrictEqual(toNetworkOrigins(sources), sources);
	});

	test('drops sources naming a scheme that is not a network origin', () => {
		const dropped = [
			'vscode-managed-remote-resource:',
			'vscode-managed-remote-resource://window:1',
			'vscode-resource:',
			'vscode-webview://something',
			'vscode-file://vscode-app',
			'file:',
			'file:///etc',
			'javascript:',
			'VSCODE-MANAGED-REMOTE-RESOURCE:',
		];

		assert.deepStrictEqual(toNetworkOrigins(dropped), []);
	});

	test('drops only the offending entry, so an app keeps the rest of its policy', () => {
		assert.deepStrictEqual(
			toNetworkOrigins(['https://example.com', 'vscode-managed-remote-resource:', 'https://cdn.example.com']),
			['https://example.com', 'https://cdn.example.com']
		);
	});

	test('drops empty and whitespace-only entries', () => {
		assert.deepStrictEqual(toNetworkOrigins(['', '   ', 'https://example.com']), ['https://example.com']);
	});

	test('passes undefined through', () => {
		assert.strictEqual(toNetworkOrigins(undefined), undefined);
	});

	test('an empty list stays empty', () => {
		assert.deepStrictEqual(toNetworkOrigins([]), []);
	});
});
