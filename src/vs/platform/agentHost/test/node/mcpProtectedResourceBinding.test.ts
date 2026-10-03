/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isProtectedResourceBoundToServer } from '../../node/copilot/copilotAgentSession.js';

suite('MCP protected-resource binding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('accepts a resource that identifies the server', () => {
		const bound: readonly (readonly [string, string])[] = [
			// The common shape: the server sits on a path under the resource.
			['https://mcp.slack.com', 'https://mcp.slack.com/mcp'],
			['https://mcp.slack.com/', 'https://mcp.slack.com/mcp'],
			['https://api.githubcopilot.com', 'https://api.githubcopilot.com/mcp/'],
			// Equal, with and without a trailing slash on either side.
			['https://example.com/mcp', 'https://example.com/mcp'],
			['https://example.com/mcp/', 'https://example.com/mcp'],
			['https://example.com/mcp', 'https://example.com/mcp/'],
			['https://example.com', 'https://example.com'],
			// Deeper path under the advertised resource.
			['https://example.com/a', 'https://example.com/a/b/c'],
			// Origin comparison normalises host case and the default port.
			['https://EXAMPLE.com', 'https://example.com/mcp'],
			['https://example.com:443', 'https://example.com/mcp'],
		];

		for (const [resource, serverUrl] of bound) {
			test(`${resource} identifies ${serverUrl}`, () => {
				assert.strictEqual(isProtectedResourceBoundToServer(resource, serverUrl), true);
			});
		}
	});

	suite('rejects a resource that does not identify the server', () => {
		const unbound: readonly (readonly [string, string])[] = [
			// A different host entirely: the case that would hand this server a
			// token approved for another one.
			['https://mcp.slack.com', 'https://attacker.example/mcp'],
			['https://api.githubcopilot.com/mcp/', 'https://attacker.example/mcp'],
			// Same registrable domain, different host.
			['https://mcp.example.com', 'https://evil.example.com/mcp'],
			// A prefix of the host name is not the host.
			['https://example.com', 'https://example.com.attacker.test/mcp'],
			// Scheme and port are part of the origin.
			['http://example.com', 'https://example.com/mcp'],
			['https://example.com:8443', 'https://example.com/mcp'],
			// The path prefix is compared by segment.
			['https://example.com/mcp', 'https://example.com/mcpx'],
			['https://example.com/mcp', 'https://example.com/other'],
			// The server is above the advertised resource, not under it.
			['https://example.com/a/b', 'https://example.com/a'],
			// Values that are not URLs at all.
			['not-a-url', 'https://example.com/mcp'],
			['https://example.com', 'not-a-url'],
			['', 'https://example.com/mcp'],
			// Opaque origins must not compare equal to each other.
			['data:text/plain,a', 'data:text/plain,b'],
		];

		for (const [resource, serverUrl] of unbound) {
			test(`${resource || '<empty>'} does not identify ${serverUrl}`, () => {
				assert.strictEqual(isProtectedResourceBoundToServer(resource, serverUrl), false);
			});
		}
	});
});
