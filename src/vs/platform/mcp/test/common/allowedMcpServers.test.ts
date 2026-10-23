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

		test('matches remote URL authorities case-insensitively with bounded wildcards', () => {
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
				true,
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

		test('URL paths and query values are case-sensitive for exact and wildcard patterns', () => {
			assert.deepStrictEqual(
				['https://MCP.EXAMPLE.COM/API?key=Value', 'HTTPS://*.EXAMPLE.COM/API?key=*'].map(serverUrl =>
					['https://mcp.example.com/API?key=Value', 'https://mcp.example.com/api?key=Value', 'https://mcp.example.com/API?key=value'].map(url =>
						isMcpServerMatched([{ serverUrl }], { name: 's', url }))),
				[[true, false, false], [true, false, true]]
			);
		});

		test('preserves non-HTTP scheme and authority casing without folding paths or socket fragments', () => {
			assert.deepStrictEqual(
				['UNIX://HOST/tmp/Socket#API', 'UNIX://HOST/tmp/S*#API'].map(serverUrl =>
					['unix://host/tmp/Socket#API', 'unix://HOST/tmp/socket#API', 'unix://host/tmp/Socket#api'].map(url =>
						isMcpServerMatched([{ serverUrl }], { name: 's', url }))),
				[[true, false, false], [true, false, false]]
			);
		});

		test('matches policy commands and URLs using host-resolved strings but leaves names literal', () => {
			const policyValues = {
				'${EXECUTABLE}': 'node',
				'${MISSING:-approved.js}': 'approved.js',
				'${SCRIPT:-approved.js}': '',
				'${MISSING}': '${MISSING}',
				'${PATH}/node': '/host/node',
				'https://${HOST}/API': 'https://mcp.example.com/API',
				'${HOST}': 'mcp.example.com',
			};
			assert.deepStrictEqual([
				isMcpServerMatched([{ serverCommand: ['${EXECUTABLE}', '${MISSING:-approved.js}'] }], { name: 's', command: ['node', 'approved.js'], policyValues }),
				isMcpServerMatched([{ serverCommand: ['node', '${SCRIPT:-approved.js}'] }], { name: 's', command: ['node', ''], policyValues }),
				isMcpServerMatched([{ serverCommand: ['node', '${MISSING}'] }], { name: 's', command: ['node', '${MISSING}'], policyValues }),
				isMcpServerMatched([{ serverCommand: ['node', '${MISSING}'] }], { name: 's', command: ['node', ''], policyValues }),
				isMcpServerMatched([{ serverCommand: ['${PATH}/node'] }], { name: 's', command: ['/host/node'], policyValues }),
				isMcpServerMatched([{ serverCommand: ['${PATH}/node'] }], { name: 's', command: ['/host/node'] }),
				isMcpServerMatched([{ serverUrl: 'https://${HOST}/API' }], { name: 's', url: 'https://mcp.example.com/API', policyValues }),
				isMcpServerMatched([{ serverUrl: 'https://${HOST}/API' }], { name: 's', url: 'https://other.example.com/API', policyValues }),
				isMcpServerMatched([{ serverName: '${HOST}' }], { name: 'mcp.example.com', policyValues }),
				isMcpServerMatched([{ serverName: '${HOST}' }], { name: '${HOST}', policyValues }),
			], [true, true, true, false, true, false, true, false, false, true]);
		});
	});

	suite('checkMcpServerAllowed', () => {

		test('transport-specific allow entries take precedence over names, but not over deny entries', () => {
			const allow: IMcpServerMatcher[] = [
				{ serverName: 'approved' },
				{ serverCommand: ['node', 'approved.js', '--flag'] },
				{ serverUrl: 'https://approved.example/API' },
			];
			const stdio = { name: 'approved', command: ['node', 'other.js'] };
			const remote = { name: 'approved', url: 'https://other.example/API' };
			assert.deepStrictEqual([
				checkMcpServerAllowed(allow, undefined, stdio),
				checkMcpServerAllowed(allow, undefined, remote),
				checkMcpServerAllowed(allow, undefined, { name: 'other', command: ['node', 'approved.js', '--flag'] }),
				checkMcpServerAllowed(allow, undefined, { name: 'other', command: ['node', '--flag', 'approved.js'] }),
				checkMcpServerAllowed(allow, undefined, { name: 'other', url: 'https://approved.example/API' }),
				checkMcpServerAllowed(allow.filter(m => !m.serverCommand), undefined, stdio),
				checkMcpServerAllowed(allow.filter(m => !m.serverUrl), undefined, remote),
				checkMcpServerAllowed(allow, [{ serverName: 'approved' }, { serverCommand: ['node', 'different.js'] }], stdio),
				checkMcpServerAllowed(allow, [{ serverName: 'approved' }, { serverUrl: 'https://different.example' }], remote),
			], [
				McpServerAllowResult.NotAllowed, McpServerAllowResult.NotAllowed,
				McpServerAllowResult.Allowed, McpServerAllowResult.NotAllowed,
				McpServerAllowResult.Allowed, McpServerAllowResult.Allowed, McpServerAllowResult.Allowed,
				McpServerAllowResult.Denied, McpServerAllowResult.Denied,
			]);
		});

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
