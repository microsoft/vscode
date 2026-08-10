/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { checkMcpServerAllowed, getMcpServerMatchers, IMcpServerMatcher, isMcpServerMatched, McpServerAllowResult } from '../../common/allowedMcpServers.js';

suite('AllowedMcpServers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getMcpServerMatchers', () => {

		test('coerces non-arrays to undefined', () => {
			assert.strictEqual(getMcpServerMatchers(null), undefined);
			assert.strictEqual(getMcpServerMatchers(undefined), undefined);
			assert.strictEqual(getMcpServerMatchers(true), undefined);
			assert.strictEqual(getMcpServerMatchers('[]'), undefined);
			assert.strictEqual(getMcpServerMatchers({ allowed: [] }), undefined);
		});

		test('empty array is preserved', () => {
			assert.deepStrictEqual(getMcpServerMatchers([]), []);
		});

		test('drops malformed and multi-field matcher entries', () => {
			const value = [
				{ serverName: 'github' },
				{ serverUrl: 'https://mcp.example.com/*' },
				{ serverCommand: ['npx', '-y', 'server'] },
				{ serverName: '' }, // empty string dropped
				{ serverCommand: [] }, // empty array dropped
				{ serverCommand: ['ok', 5] }, // non-string element dropped
				{ serverName: 'a', serverUrl: 'b' }, // more than one field dropped
				{}, // no field dropped
				'string-entry', // non-object dropped
			];
			assert.deepStrictEqual(getMcpServerMatchers(value), [
				{ serverName: 'github' },
				{ serverUrl: 'https://mcp.example.com/*' },
				{ serverCommand: ['npx', '-y', 'server'] },
			]);
		});
	});

	suite('isMcpServerMatched', () => {

		test('undefined and empty match nothing', () => {
			assert.strictEqual(isMcpServerMatched(undefined, { name: 'x' }), false);
			assert.strictEqual(isMcpServerMatched([], { name: 'x' }), false);
		});

		test('matches by server name', () => {
			const matchers: IMcpServerMatcher[] = [{ serverName: 'github' }];
			assert.strictEqual(isMcpServerMatched(matchers, { name: 'github' }), true);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 'gitlab' }), false);
		});

		test('matches by remote URL with wildcards, case-insensitively', () => {
			const matchers: IMcpServerMatcher[] = [{ serverUrl: 'https://*.example.com/*' }];
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://mcp.example.com/api' }), true);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://MCP.EXAMPLE.COM/api' }), true);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://example.com/api' }), false);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://mcp.evil.com/api' }), false);
			// An authority wildcard must not swallow the path separator and let an untrusted host through.
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://evil.test/.example.com/tool' }), false);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', command: ['node', 'x.js'] }), false);
		});

		test('exact URL pattern matches only that URL', () => {
			const matchers: IMcpServerMatcher[] = [{ serverUrl: 'https://mcp.example.com/mcp' }];
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://mcp.example.com/mcp' }), true);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://mcp.example.com/mcp/extra' }), false);
		});

		test('matches by local command as an ordered argument list', () => {
			const matchers: IMcpServerMatcher[] = [{ serverCommand: ['npx', '-y', 'server'] }];
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', command: ['npx', '-y', 'server'] }), true);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', command: ['npx', 'server'] }), false);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', command: ['npx', '-y', 'server', '--flag'] }), false);
			assert.strictEqual(isMcpServerMatched(matchers, { name: 's', url: 'https://mcp.example.com' }), false);
		});
	});

	suite('checkMcpServerAllowed', () => {

		test('no lists configured allows everything', () => {
			assert.strictEqual(checkMcpServerAllowed(undefined, undefined, { name: 'x' }), McpServerAllowResult.Allowed);
		});

		test('empty allowlist blocks everything as NotAllowed', () => {
			assert.strictEqual(checkMcpServerAllowed([], undefined, { name: 'x' }), McpServerAllowResult.NotAllowed);
		});

		test('allowlist permits only matching servers', () => {
			const allow: IMcpServerMatcher[] = [{ serverName: 'github' }];
			assert.strictEqual(checkMcpServerAllowed(allow, undefined, { name: 'github' }), McpServerAllowResult.Allowed);
			assert.strictEqual(checkMcpServerAllowed(allow, undefined, { name: 'other' }), McpServerAllowResult.NotAllowed);
		});

		test('deny takes precedence over allow', () => {
			const allow: IMcpServerMatcher[] = [{ serverName: 'github' }];
			const deny: IMcpServerMatcher[] = [{ serverName: 'github' }];
			assert.strictEqual(checkMcpServerAllowed(allow, deny, { name: 'github' }), McpServerAllowResult.Denied);
		});

		test('deny blocks even when no allowlist is configured', () => {
			const deny: IMcpServerMatcher[] = [{ serverUrl: 'https://*.untrusted.example.com/*' }];
			assert.strictEqual(checkMcpServerAllowed(undefined, deny, { name: 's', url: 'https://api.untrusted.example.com/mcp' }), McpServerAllowResult.Denied);
			assert.strictEqual(checkMcpServerAllowed(undefined, deny, { name: 's', url: 'https://api.trusted.example.com/mcp' }), McpServerAllowResult.Allowed);
		});
	});
});
