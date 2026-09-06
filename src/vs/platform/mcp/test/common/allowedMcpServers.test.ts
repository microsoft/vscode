/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
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

		test('HTTP(S) patterns match default ports and origin-only spellings', () => {
			const originOnly: IMcpServerMatcher[] = [{ serverUrl: 'https://mcp.example.com' }];
			const defaultPort: IMcpServerMatcher[] = [{ serverUrl: 'https://mcp.example.com:443/*' }];
			const anyPort: IMcpServerMatcher[] = [{ serverUrl: 'http://127.0.0.2:*/*' }];
			const denyDefaultPort: IMcpServerMatcher[] = [{ serverUrl: 'https://blocked.example:443/*' }];
			assert.deepStrictEqual([
				isMcpServerMatched(originOnly, { name: 's', url: 'https://mcp.example.com' }),
				isMcpServerMatched(originOnly, { name: 's', url: 'https://mcp.example.com/' }),
				isMcpServerMatched(originOnly, { name: 's', url: 'https://mcp.example.com/extra' }),
				isMcpServerMatched(defaultPort, { name: 's', url: 'https://mcp.example.com/mcp' }),
				isMcpServerMatched(defaultPort, { name: 's', url: 'https://mcp.example.com:443/mcp' }),
				isMcpServerMatched(anyPort, { name: 's', url: 'http://127.0.0.2/mcp' }),
				isMcpServerMatched(anyPort, { name: 's', url: 'http://127.0.0.2:80/mcp' }),
				isMcpServerMatched(anyPort, { name: 's', url: 'http://127.0.0.2:63366/mcp' }),
				checkMcpServerAllowed(undefined, denyDefaultPort, { name: 's', url: 'https://blocked.example:443/mcp' }),
				checkMcpServerAllowed(undefined, denyDefaultPort, { name: 's', url: 'https://blocked.example/mcp' }),
			], [
				true,
				true,
				false,
				true,
				true,
				true,
				true,
				true,
				McpServerAllowResult.Denied,
				McpServerAllowResult.Denied,
			]);
		});

		test('URL patterns match the fetch destination rather than the raw spelling', () => {
			const matchers: IMcpServerMatcher[] = [{ serverUrl: 'http://*127.0.0.2:*/*' }];
			const cases: { url: string; allowed: boolean }[] = [
				{ url: 'http://127.0.0.2:63366/mcp', allowed: true },
				{ url: 'http://127.0.0.1:63365/mcp', allowed: false },
				{ url: 'http://127.0.0.1:63365/@127.0.0.2:63366/mcp', allowed: false },
				{ url: 'http://127.0.0.1:63365\\@127.0.0.2:63366/mcp', allowed: false },
				{ url: 'http://127.0.0.1:63365\\@127.0.0.2:63366\\mcp', allowed: false },
				{ url: 'http://127.0.0.2%5C@127.0.0.1:63365/mcp', allowed: false },
				{ url: 'http://127.0.0.2:80@127.0.0.1:63365/mcp', allowed: false },
				{ url: 'http://127.0.0.2:63366\\extra/mcp', allowed: true },
				{ url: 'http://127.0.0.1:63365%5C@127.0.0.2:63366/mcp', allowed: true },
				{ url: URI.parse('http://127.0.0.1:63365\\@127.0.0.2:63366/mcp').toString(true), allowed: false },
				{ url: 'not a url', allowed: false },
			];
			assert.deepStrictEqual(
				cases.map(({ url }) => isMcpServerMatched(matchers, { name: 's', url })),
				cases.map(({ allowed }) => allowed),
			);
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
