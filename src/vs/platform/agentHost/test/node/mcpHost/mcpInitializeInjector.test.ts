/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { IJsonRpcRequest } from '../../../../../base/common/jsonRpcProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpAppsInitializeInjector } from '../../../node/mcpHost/mcpInitializeInjector.js';

suite('McpAppsInitializeInjector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const baseRequest = (params: unknown): IJsonRpcRequest => ({
		jsonrpc: '2.0',
		id: 1,
		method: 'initialize',
		params,
	});

	const expectedExtension = {
		'io.modelcontextprotocol/ui': {
			mimeTypes: ['text/html;profile=mcp-app'],
		},
	};

	test('injects extensions into empty capabilities', () => {
		const injector = new McpAppsInitializeInjector();
		const result = injector.inject(baseRequest({ capabilities: {} }));

		assert.deepStrictEqual(result, {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				capabilities: {
					extensions: expectedExtension,
				},
			},
		});
	});

	test('preserves caller-provided capabilities while merging extensions', () => {
		const injector = new McpAppsInitializeInjector();
		const result = injector.inject(baseRequest({
			protocolVersion: '2025-11-25',
			capabilities: {
				sampling: {},
				roots: { listChanged: true },
				extensions: {
					foo: { bar: 1 },
				},
			},
			clientInfo: { name: 'sdk', version: '1.0.0' },
		}));

		assert.deepStrictEqual(result, {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: '2025-11-25',
				capabilities: {
					sampling: {},
					roots: { listChanged: true },
					extensions: {
						foo: { bar: 1 },
						...expectedExtension,
					},
				},
				clientInfo: { name: 'sdk', version: '1.0.0' },
			},
		});
	});

	test('is idempotent', () => {
		const injector = new McpAppsInitializeInjector();
		const first = injector.inject(baseRequest({ capabilities: { sampling: {} } }));
		const second = injector.inject(first);
		assert.deepStrictEqual(second, first);
	});

	test('does not mutate the original request or its params', () => {
		const injector = new McpAppsInitializeInjector();
		const originalParams = { capabilities: { sampling: {}, extensions: { foo: 1 } } };
		const original = baseRequest(originalParams);
		const snapshot = JSON.parse(JSON.stringify(original));

		injector.inject(original);

		assert.deepStrictEqual(original, snapshot);
		assert.strictEqual(original.params, originalParams);
	});
});
