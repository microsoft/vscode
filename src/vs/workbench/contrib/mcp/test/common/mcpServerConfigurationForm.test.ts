/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { McpResourceFormat } from '../../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { formatMcpServerArgs, getMcpServerFormatError, McpServerFormKind, parseMcpServerArgs, toMcpServerConfiguration, toMcpServerFormState, validateMcpServerFormState } from '../../common/mcpServerConfigurationForm.js';

suite('MCP Server Configuration Form', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('args round trip between text and arrays', () => {
		assert.deepStrictEqual({
			simple: formatMcpServerArgs(['-y', '@scope/server', '/tmp']),
			withSpaces: formatMcpServerArgs(['--path', 'My Documents', '']),
			parsedSimple: parseMcpServerArgs('  -y   @scope/server /tmp '),
			parsedJson: parseMcpServerArgs('["--path", "My Documents", ""]'),
			parsedEmpty: parseMcpServerArgs('   '),
			invalidJson: parseMcpServerArgs('[1, 2]').error !== undefined,
		}, {
			simple: '-y @scope/server /tmp',
			withSpaces: '["--path","My Documents",""]',
			parsedSimple: { args: ['-y', '@scope/server', '/tmp'] },
			parsedJson: { args: ['--path', 'My Documents', ''] },
			parsedEmpty: { args: [] },
			invalidJson: true,
		});
	});

	test('local server edits preserve fields the form does not manage', () => {
		const original: IMcpServerConfiguration = {
			type: McpServerType.LOCAL,
			command: 'npx',
			args: ['-y', 'server'],
			env: { PORT: 3000, UNSET: null, TOKEN: '${input:token}' },
			sandboxEnabled: true,
			gallery: 'https://gallery/server',
		};
		const state = toMcpServerFormState(original);
		state.args = '-y server --verbose';
		state.env.push({ name: 'DEBUG', value: '1' }, { name: '', value: '' });
		state.cwd = '${workspaceFolder}';

		assert.deepStrictEqual(toMcpServerConfiguration(state, original), {
			type: McpServerType.LOCAL,
			command: 'npx',
			args: ['-y', 'server', '--verbose'],
			cwd: '${workspaceFolder}',
			env: { PORT: 3000, UNSET: null, TOKEN: '${input:token}', DEBUG: '1' },
			sandboxEnabled: true,
			gallery: 'https://gallery/server',
		});
	});

	test('switching to SSE keeps common fields and drops local ones', () => {
		const original: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'node', args: ['server.js'], sandboxEnabled: true, version: '1.0.0' };
		const state = toMcpServerFormState(original);
		state.kind = McpServerFormKind.Sse;
		state.url = 'https://example.com/sse';
		state.headers = [{ name: 'Authorization', value: 'Bearer ${input:token}' }];

		assert.deepStrictEqual(toMcpServerConfiguration(state, original), {
			type: McpServerType.REMOTE,
			version: '1.0.0',
			url: 'https://example.com/sse',
			transport: 'sse',
			headers: { Authorization: 'Bearer ${input:token}' },
		});
	});

	test('file format checks only consider the edit', () => {
		const previous: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'node', cwd: '/work' };
		assert.deepStrictEqual({
			unchangedCwd: getMcpServerFormatError('server', previous, { ...previous, env: { A: '1' } }, McpResourceFormat.WorkspaceRoot),
			changedCwd: getMcpServerFormatError('server', previous, { ...previous, cwd: '/other' }, McpResourceFormat.WorkspaceRoot) !== undefined,
			emptyCommand: getMcpServerFormatError('server', previous, { ...previous, command: ' ' }, McpResourceFormat.CopilotGlobal) !== undefined,
			inputVariable: getMcpServerFormatError('server', previous, { ...previous, env: { A: '${input:a}' } }, McpResourceFormat.CopilotGlobal) !== undefined,
		}, {
			unchangedCwd: undefined,
			changedCwd: true,
			emptyCommand: true,
			inputVariable: true,
		});
	});

	test('validation reports missing and duplicate values', () => {
		const local = toMcpServerFormState({ type: McpServerType.LOCAL, command: '' });
		local.args = '[oops';
		local.env = [{ name: 'A', value: '1' }, { name: 'A', value: '2' }];

		const remote = toMcpServerFormState({ type: McpServerType.REMOTE, url: 'ftp://example.com' });
		remote.headers = [{ name: '', value: 'x' }];

		assert.deepStrictEqual({
			local: Object.keys(validateMcpServerFormState(local)),
			remote: Object.keys(validateMcpServerFormState(remote)),
			valid: validateMcpServerFormState(toMcpServerFormState({ type: McpServerType.REMOTE, url: 'https://example.com/mcp' })),
		}, {
			local: ['command', 'args', 'env'],
			remote: ['url', 'headers'],
			valid: {},
		});
	});
});
