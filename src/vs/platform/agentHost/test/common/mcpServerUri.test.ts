/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildMcpServerUri, MCP_SERVER_SCHEME, parseMcpServerUri } from '../../common/state/mcpServerUri.js';

suite('mcpServerUri', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a simple session/server pair', () => {
		const session = URI.parse('copilot:/abcd-1234');
		const built = buildMcpServerUri(session, 'github-mcp');
		assert.deepStrictEqual({
			scheme: built.scheme,
			path: built.path,
			parsed: parseMcpServerUri(built),
		}, {
			scheme: MCP_SERVER_SCHEME,
			path: '/abcd-1234/github-mcp',
			parsed: { sessionPath: 'abcd-1234', serverId: 'github-mcp' },
		});
	});

	test('rejects URIs with a non-mcp scheme', () => {
		const other = URI.parse('copilot:/abcd-1234/some-server');
		assert.strictEqual(parseMcpServerUri(other), undefined);
	});

	test('encodes and decodes server names with special characters', () => {
		const session = URI.parse('copilot:/sess-1');
		const serverId = 'a/b c@github.com';
		const built = buildMcpServerUri(session, serverId);
		const parsed = parseMcpServerUri(built);
		assert.deepStrictEqual({
			containsRawSlash: built.path.lastIndexOf('/') === '/sess-1'.length,
			parsed,
		}, {
			containsRawSlash: true,
			parsed: { sessionPath: 'sess-1', serverId },
		});
	});

	test('rejects malformed mcp URIs', () => {
		const noServer = URI.from({ scheme: MCP_SERVER_SCHEME, path: '/sess-only' });
		assert.strictEqual(parseMcpServerUri(noServer), undefined);
	});
});
