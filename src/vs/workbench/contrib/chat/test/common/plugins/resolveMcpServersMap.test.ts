/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { resolveMcpServersMap } from '../../../common/plugins/agentPluginServiceImpl.js';

suite('resolveMcpServersMap', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns undefined for null', () => {
		assert.strictEqual(resolveMcpServersMap(null), undefined);
	});

	test('returns undefined for undefined', () => {
		assert.strictEqual(resolveMcpServersMap(undefined), undefined);
	});

	test('returns undefined for non-object primitives', () => {
		assert.strictEqual(resolveMcpServersMap('string'), undefined);
		assert.strictEqual(resolveMcpServersMap(42), undefined);
		assert.strictEqual(resolveMcpServersMap(true), undefined);
	});

	test('unwraps mcpServers property when present', () => {
		const servers = { myServer: { command: 'node' } };
		const result = resolveMcpServersMap({ mcpServers: servers });
		assert.deepStrictEqual(result, servers);
	});

	test('returns the object directly when mcpServers is absent', () => {
		const servers = { myServer: { command: 'node' }, otherServer: { url: 'http://localhost' } };
		const result = resolveMcpServersMap(servers);
		assert.deepStrictEqual(result, servers);
	});

	test('returns empty object for empty wrapped format', () => {
		assert.deepStrictEqual(resolveMcpServersMap({ mcpServers: {} }), {});
	});

	test('returns empty object for empty flat format', () => {
		assert.deepStrictEqual(resolveMcpServersMap({}), {});
	});

	test('prefers mcpServers property over other top-level keys', () => {
		const inner = { realServer: { command: 'python' } };
		const result = resolveMcpServersMap({ mcpServers: inner, someOtherKey: 'ignored' });
		assert.deepStrictEqual(result, inner);
	});
});
