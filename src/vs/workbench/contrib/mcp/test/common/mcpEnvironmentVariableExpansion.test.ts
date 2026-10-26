/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { expandEnvironmentVariablesInLaunch, IMcpEnvironmentVariableExpansionContext, launchHasEnvironmentVariableReferences } from '../../common/mcpEnvironmentVariableExpansion.js';
import { McpServerLaunch, McpServerTransportHTTP, McpServerTransportStdio, McpServerTransportType } from '../../common/mcpTypes.js';

suite('MCP - expandEnvironmentVariablesInLaunch', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function context(env: Record<string, string | undefined>, caseInsensitive = false): IMcpEnvironmentVariableExpansionContext {
		return { env, caseInsensitive };
	}

	function stdio(overrides: Partial<McpServerTransportStdio>): McpServerTransportStdio {
		return { type: McpServerTransportType.Stdio, command: 'node', args: [], env: {}, envFile: undefined, cwd: undefined, sandbox: undefined, ...overrides };
	}

	function http(url: string, headers: [string, string][] = []): McpServerTransportHTTP {
		return { type: McpServerTransportType.HTTP, uri: URI.parse(url), headers };
	}

	function expandStdio(launch: McpServerTransportStdio, ctx: IMcpEnvironmentVariableExpansionContext) {
		const result = expandEnvironmentVariablesInLaunch(launch, {}, ctx);
		if (result.type !== McpServerTransportType.Stdio) {
			assert.fail('Expected a stdio launch');
		}
		return { command: result.command, args: result.args, cwd: result.cwd, env: result.env };
	}

	function expandHttp(url: string, headers: [string, string][], ctx: IMcpEnvironmentVariableExpansionContext) {
		const result = expandEnvironmentVariablesInLaunch(http(url, headers), { url }, ctx);
		if (result.type !== McpServerTransportType.HTTP) {
			assert.fail('Expected an HTTP launch');
		}
		return { isUri: URI.isUri(result.uri), url: result.uri.toString(true), headers: result.headers };
	}

	test('stdio: expands command, args and env values but never env keys or cwd', () => {
		assert.deepStrictEqual(expandStdio(stdio({
			command: '${TOOLS}/bin/server',
			args: ['--token=${API_KEY}', '--region', '${REGION:-us-east-1}'],
			cwd: '${PROJECT}',
			env: { API_KEY: '${API_KEY}', '${KEY_NAME}': 'v', NUMBER: 3, REMOVED: null },
		}), context({ TOOLS: '/opt/tools', API_KEY: 'secret', PROJECT: '/work', KEY_NAME: 'nope' })), {
			command: '/opt/tools/bin/server',
			args: ['--token=secret', '--region', 'us-east-1'],
			cwd: '${PROJECT}',
			env: { API_KEY: 'secret', '${KEY_NAME}': 'v', NUMBER: 3, REMOVED: null },
		});
	});

	test('stdio: unset variables are left verbatim and empty values are used', () => {
		assert.deepStrictEqual(expandStdio(stdio({
			command: '${MISSING}/server',
			args: ['${MISSING}', '[${EMPTY:-default}]'],
			env: { API_KEY: '${API_KEY}' },
		}), context({ EMPTY: '' })), {
			command: '${MISSING}/server',
			args: ['${MISSING}', '[]'],
			cwd: undefined,
			env: { API_KEY: '${API_KEY}' },
		});
	});

	test('stdio: leaves bare references and VS Code variables with an argument literal', () => {
		assert.deepStrictEqual(expandStdio(stdio({
			args: ['$API_KEY', 'echo \'$HOME\'', '$5.00', '${/}', '${env:API_KEY}', '${input:key}'],
		}), context({ API_KEY: 'secret', HOME: '/home/user' })).args, [
			'$API_KEY', 'echo \'$HOME\'', '$5.00', '${/}', '${env:API_KEY}', '${input:key}',
		]);
	});

	test('matches names case-insensitively only when requested', () => {
		const launch = stdio({ command: '${PATH}', args: ['${path}'], env: { VALUE: '${Path}' } });
		const env = { Path: '/windows/path' };
		assert.deepStrictEqual([
			expandStdio(launch, context(env)),
			expandStdio(launch, context(env, true)),
			expandHttp('https://${host}/mcp', [['A', '${Token}']], context({ HOST: 'example.com', TOKEN: 'tok' }, true)),
		], [
			{ command: '${PATH}', args: ['${path}'], cwd: undefined, env: { VALUE: '/windows/path' } },
			{ command: '/windows/path', args: ['/windows/path'], cwd: undefined, env: { VALUE: '/windows/path' } },
			{ isUri: true, url: 'https://example.com/mcp', headers: [['A', 'tok']] },
		]);
	});

	test('remote: expands URL host, path and query and header values but never header names', () => {
		assert.deepStrictEqual(expandHttp(
			'https://${HOST}/${PATH_PART:-mcp}?key=${API_KEY}&region=${REGION}',
			[['Authorization', 'Bearer ${TOKEN}'], ['X-${HEADER_NAME}', '${MISSING}'], ['X-Input', '${input:x}']],
			context({ HOST: 'mcp.example.com', API_KEY: 'a b&c', REGION: 'eu', TOKEN: 'tok', HEADER_NAME: 'nope' }),
		), {
			isUri: true,
			url: 'https://mcp.example.com/mcp?key=a b&c&region=eu',
			headers: [['Authorization', 'Bearer tok'], ['X-${HEADER_NAME}', '${MISSING}'], ['X-Input', '${input:x}']],
		});
	});

	test('remote: expands from the raw URL rather than the normalized URI', () => {
		const url = 'https://${HOST}/mcp';
		assert.deepStrictEqual({
			normalized: URI.parse(url).toString(),
			expanded: expandHttp(url, [], context({ HOST: 'example.com' })).url,
		}, {
			normalized: 'https://%24%7Bhost%7D/mcp',
			expanded: 'https://example.com/mcp',
		});
	});

	test('remote: leaves URLs that the Copilot runtime rejects unexpanded, but still expands header values', () => {
		const env = { HOST: 'mcp.example.com', PORT: '8443', BASE: 'https://base.example.com', SCHEME: 'https', TOKEN: 'tok' };
		const urls = [
			'https://${HOST:-example.com}/mcp',
			'http://localhost:${PORT}/mcp',
			'${BASE}/mcp',
			'${SCHEME}://example.com/mcp',
		];
		assert.deepStrictEqual(urls.map(url => {
			const launch = http('https://placeholder.example/mcp', [['Authorization', 'Bearer ${TOKEN}']]);
			const result = expandEnvironmentVariablesInLaunch(launch, { url }, context(env));
			return {
				url,
				uriUnchanged: result.type === McpServerTransportType.HTTP && result.uri === launch.uri,
				headers: result.type === McpServerTransportType.HTTP ? result.headers : undefined,
				hasReferences: launchHasEnvironmentVariableReferences({ ...launch, headers: [] }, { url }),
			};
		}), urls.map(url => ({ url, uriUnchanged: true, headers: [['Authorization', 'Bearer tok']], hasReferences: false })));
	});

	test('reports whether a launch has expandable references', () => {
		const cases: [McpServerLaunch, string | undefined][] = [
			[stdio({ args: ['$API_KEY', '${/}', '${input:x}'], env: { KEY: '${env:KEY}', '${NAME}': 'v' }, cwd: '${DIR}' }), undefined],
			[stdio({ env: { KEY: '${KEY}' } }), undefined],
			[stdio({ args: ['--key=${KEY:-x}'] }), undefined],
			[http('https://example.com/mcp', [['${NAME}', 'value']]), 'https://example.com/mcp'],
			[http('https://example.com/mcp'), 'https://${HOST}/mcp'],
			[http('https://example.com/mcp', [['Authorization', 'Bearer ${TOKEN}']]), 'https://example.com/mcp'],
		];
		assert.deepStrictEqual(cases.map(([launch, url]) => launchHasEnvironmentVariableReferences(launch, { url })), [false, true, true, false, true, true]);
	});
});
