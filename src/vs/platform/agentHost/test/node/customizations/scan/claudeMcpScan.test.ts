/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../files/common/files.js';
import { CustomizationType, McpServerStatus } from '../../../../common/state/protocol/state.js';
import { scanClaudeMcpServers } from '../../../../node/claude/customizations/scan/claudeMcpScan.js';
import { claudeTestUserHome as userHome, claudeTestWorkspace as workspace, createInMemoryFileService, seedFile } from '../claudeCustomizationTestUtils.js';

suite('claudeMcpScan', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
	const seed = (path: string, content = '') => seedFile(fileService, path, content);

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('scans MCP servers from settings.json with real URIs, ignoring unrelated settings keys', async () => {
		const settings = await seed('/workspace/.claude/settings.json', JSON.stringify({
			model: 'claude-x',
			permissions: { allow: [] },
			mcpServers: { srv: { command: 'node', args: ['s.js'] } },
		}));

		const servers = await scanClaudeMcpServers(workspace, userHome, fileService);

		assert.deepStrictEqual(
			servers.map(s => ({ type: s.type, uri: s.uri, name: s.name, enabled: s.enabled, state: s.state })),
			[{ type: CustomizationType.McpServer, uri: settings.toString(), name: 'srv', enabled: true, state: { kind: McpServerStatus.Stopped } }],
		);
	});

	test('scans a flat .mcp.json server map', async () => {
		const mcp = await seed('/workspace/.mcp.json', JSON.stringify({ flatSrv: { command: 'x' } }));
		const servers = await scanClaudeMcpServers(workspace, userHome, fileService);
		assert.deepStrictEqual(servers.map(s => ({ uri: s.uri, name: s.name })), [{ uri: mcp.toString(), name: 'flatSrv' }]);
	});

	test('settings.json without an mcpServers block yields no servers', async () => {
		await seed('/workspace/.claude/settings.json', JSON.stringify({ model: 'x', permissions: { allow: [] } }));
		const servers = await scanClaudeMcpServers(workspace, userHome, fileService);
		assert.deepStrictEqual(servers, []);
	});

	test('ignores array-valued MCP entries', async () => {
		await seed('/workspace/.mcp.json', JSON.stringify({ bad: [1, 2], good: { command: 'x' } }));
		const servers = await scanClaudeMcpServers(workspace, userHome, fileService);
		assert.deepStrictEqual(servers.map(s => s.name), ['good']);
	});
});
