/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { waitForState } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { AbstractAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';

/**
 * Concrete discovery subclass that returns a fixed list of plugin URIs,
 * allowing format detection and content reading to be tested in isolation.
 */
class TestPluginDiscovery extends AbstractAgentPluginDiscovery {
	private _sources: URI[] = [];

	constructor(
		fileService: IFileService,
		pathService: IPathService,
		logService: ILogService,
		instantiationService: IInstantiationService,
	) {
		super(fileService, pathService, logService, instantiationService);
	}

	start(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
	}

	/** Set plugin sources and trigger a refresh. */
	async setSourcesAndRefresh(uris: URI[]): Promise<void> {
		this._sources = uris;
		await this._refreshPlugins();
	}

	protected override async _discoverPluginSources() {
		return this._sources.map(uri => ({
			uri,
			fromMarketplace: undefined,
			remove: () => { },
		}));
	}
}

suite('AgentPlugin format detection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();

	let fileService: FileService;
	let instantiationService: TestInstantiationService;
	const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });

	setup(() => {
		const contextService = new TestContextService(testWorkspace(workspaceRoot));

		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IWorkspaceContextService, contextService);
		instantiationService.stub(IPathService, {
			userHome: async () => URI.file('/home/testuser'),
		} as Partial<IPathService> as IPathService);
		instantiationService.stub(IInstantiationService, instantiationService);
	});

	const mockEnablementModel: IEnablementModel = {
		readEnabled: () => ContributionEnablementState.EnabledProfile,
		setEnabled: () => { },
	};

	function createDiscovery(): TestPluginDiscovery {
		return store.add(new TestPluginDiscovery(
			fileService,
			instantiationService.get(IPathService),
			logService,
			instantiationService,
		));
	}

	async function writeFile(path: string, content: string): Promise<void> {
		const uri = URI.from({ scheme: Schemas.inMemory, path });
		await fileService.writeFile(uri, VSBuffer.fromString(content));
	}

	function pluginUri(path: string): URI {
		return URI.from({ scheme: Schemas.inMemory, path });
	}

	test('detects Open Plugin format when .plugin/plugin.json exists', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/my-open-plugin');
		await writeFile('/plugins/my-open-plugin/.plugin/plugin.json', JSON.stringify({ name: 'my-open-plugin' }));
		await writeFile('/plugins/my-open-plugin/commands/hello.md', '# Hello');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		// Verify the plugin read commands from the standard commands/ directory
		await waitForState(plugins[0].commands, cmds => cmds.length > 0);
		assert.strictEqual(plugins[0].commands.get()[0].name, 'hello');
	}));

	test('detects Claude format when .claude-plugin/plugin.json exists', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/my-claude-plugin');
		await writeFile('/plugins/my-claude-plugin/.claude-plugin/plugin.json', JSON.stringify({ name: 'my-claude-plugin' }));
		await writeFile('/plugins/my-claude-plugin/commands/greet.md', '# Greet');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].commands, cmds => cmds.length > 0);
		assert.strictEqual(plugins[0].commands.get()[0].name, 'greet');
	}));

	test('falls back to Copilot format when no vendor manifest exists', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/my-copilot-plugin');
		await writeFile('/plugins/my-copilot-plugin/plugin.json', JSON.stringify({ name: 'my-copilot-plugin' }));
		await writeFile('/plugins/my-copilot-plugin/commands/run.md', '# Run');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].commands, cmds => cmds.length > 0);
		assert.strictEqual(plugins[0].commands.get()[0].name, 'run');
	}));

	test('Open Plugin format takes priority over Claude format', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		// Plugin has both .plugin/plugin.json and .claude-plugin/plugin.json —
		// the open plugin manifest should be detected first.
		const uri = pluginUri('/plugins/dual-plugin');
		await writeFile('/plugins/dual-plugin/.plugin/plugin.json', JSON.stringify({ name: 'dual-plugin' }));
		await writeFile('/plugins/dual-plugin/.claude-plugin/plugin.json', JSON.stringify({ name: 'dual-plugin' }));

		// Write inline MCP into the open-plugin manifest to verify it's used.
		await writeFile('/plugins/dual-plugin/.plugin/plugin.json', JSON.stringify({
			name: 'dual-plugin',
			mcpServers: { 'open-server': { command: 'echo', args: ['open'] } },
		}));
		// Claude manifest defines a different server to prove it's NOT read.
		await writeFile('/plugins/dual-plugin/.claude-plugin/plugin.json', JSON.stringify({
			name: 'dual-plugin',
			mcpServers: { 'claude-server': { command: 'echo', args: ['claude'] } },
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].mcpServerDefinitions, defs => defs.length > 0);
		const mcpDefs = plugins[0].mcpServerDefinitions.get();
		assert.strictEqual(mcpDefs.length, 1);
		assert.strictEqual(mcpDefs[0].name, 'open-server');
	}));

	test('Open Plugin reads MCP definitions from .plugin/plugin.json inline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/mcp-plugin');
		await writeFile('/plugins/mcp-plugin/.plugin/plugin.json', JSON.stringify({
			name: 'mcp-plugin',
			mcpServers: {
				'my-server': { command: 'node', args: ['server.js'] },
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].mcpServerDefinitions, defs => defs.length > 0);
		const mcpDefs = plugins[0].mcpServerDefinitions.get();
		assert.deepStrictEqual(mcpDefs.map(d => d.name), ['my-server']);
	}));

	test('Open Plugin reads MCP definitions from standalone .mcp.json', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/mcp-standalone');
		await writeFile('/plugins/mcp-standalone/.plugin/plugin.json', JSON.stringify({ name: 'mcp-standalone' }));
		await writeFile('/plugins/mcp-standalone/.mcp.json', JSON.stringify({
			mcpServers: {
				'standalone-server': { command: 'python', args: ['serve.py'] },
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].mcpServerDefinitions, defs => defs.length > 0);
		assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, 'standalone-server');
	}));

	test('reads skills from skills/ subdirectories', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/skills-plugin');
		await writeFile('/plugins/skills-plugin/.plugin/plugin.json', JSON.stringify({ name: 'skills-plugin' }));
		await writeFile('/plugins/skills-plugin/skills/deploy/SKILL.md', '# Deploy skill');
		await writeFile('/plugins/skills-plugin/skills/lint/SKILL.md', '# Lint skill');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].skills, s => s.length > 0);
		const skillNames = plugins[0].skills.get().map(s => s.name).sort();
		assert.deepStrictEqual(skillNames, ['deploy', 'lint']);
	}));

	test('reads agents from agents/ directory', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/agents-plugin');
		await writeFile('/plugins/agents-plugin/.plugin/plugin.json', JSON.stringify({ name: 'agents-plugin' }));
		await writeFile('/plugins/agents-plugin/agents/reviewer.md', '---\nname: reviewer\n---\nYou review code.');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].agents, a => a.length > 0);
		assert.strictEqual(plugins[0].agents.get()[0].name, 'reviewer');
	}));
});
