/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isCustomizationEnabled } from '../../../../common/customizationEnablement.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../files/common/files.js';
import { createInMemoryFileService } from '../../../../../files/test/common/inMemoryFileService.js';
import { readMcpServerSource } from '../../../../common/meta/mcpCustomizationMeta.js';
import { CustomizationType, McpServerStatus } from '../../../../common/state/protocol/state.js';
import { scanClaudeMcpServers } from '../../../../node/claude/customizations/scan/claudeMcpScan.js';
import { claudeTestUserHome as userHome, claudeTestWorkspace as workspace, seedFile } from '../claudeCustomizationTestUtils.js';

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
			servers.map(s => ({ type: s.type, uri: s.uri, name: s.name, enabled: isCustomizationEnabled(s), state: s.state, source: readMcpServerSource(s) })),
			[{ type: CustomizationType.McpServer, uri: settings.toString(), name: 'srv', enabled: true, state: { kind: McpServerStatus.Stopped }, source: 'workspace' }],
		);
	});

	test('scans a flat .mcp.json server map', async () => {
		const mcp = await seed('/workspace/.mcp.json', JSON.stringify({ flatSrv: { command: 'x' } }));
		const servers = await scanClaudeMcpServers(workspace, userHome, fileService);
		assert.deepStrictEqual(servers.map(s => ({ uri: s.uri, name: s.name, source: readMcpServerSource(s) })), [{ uri: mcp.toString(), name: 'flatSrv', source: 'workspace' }]);
	});

	test('user settings.json servers carry the user source and lose to a same-named project server', async () => {
		const project = await seed('/workspace/.mcp.json', JSON.stringify({ shared: { command: 'project' } }));
		const user = await seed('/home/.claude/settings.json', JSON.stringify({ mcpServers: { shared: { command: 'user' }, personal: { command: 'user' } } }));
		const servers = await scanClaudeMcpServers(workspace, userHome, fileService);
		assert.deepStrictEqual(
			servers.map(s => ({ uri: s.uri, name: s.name, source: readMcpServerSource(s) })),
			[
				{ uri: user.toString(), name: 'personal', source: 'user' },
				{ uri: project.toString(), name: 'shared', source: 'workspace' },
			],
		);
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
