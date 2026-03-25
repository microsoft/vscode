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
		remove: () => { },
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

	test('reads root-level SKILL.md as a fallback skill', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/root-skill');
		await writeFile('/plugins/root-skill/.plugin/plugin.json', JSON.stringify({ name: 'root-skill' }));
		await writeFile('/plugins/root-skill/SKILL.md', '# Visual Explainer');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].skills, s => s.length > 0);
		assert.deepStrictEqual(
			plugins[0].skills.get().map(s => s.name),
			['root-skill'],
		);
	}));

	test('root-level SKILL.md is ignored when skills/ has content', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/root-skill-ignored');
		await writeFile('/plugins/root-skill-ignored/.plugin/plugin.json', JSON.stringify({ name: 'root-skill-ignored' }));
		await writeFile('/plugins/root-skill-ignored/SKILL.md', '# Root skill');
		await writeFile('/plugins/root-skill-ignored/skills/real/SKILL.md', '# Real skill');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].skills, s => s.length > 0);
		assert.deepStrictEqual(
			plugins[0].skills.get().map(s => s.name),
			['real'],
		);
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

	test('manifest skills field adds supplemental skill directories', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/custom-skills');
		await writeFile('/plugins/custom-skills/.plugin/plugin.json', JSON.stringify({
			name: 'custom-skills',
			skills: './extra-skills/',
		}));
		await writeFile('/plugins/custom-skills/skills/default-skill/SKILL.md', '# Default skill');
		await writeFile('/plugins/custom-skills/extra-skills/bonus-skill/SKILL.md', '# Bonus skill');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].skills, s => s.length >= 2);
		assert.deepStrictEqual(
			plugins[0].skills.get().map(s => s.name).sort(),
			['bonus-skill', 'default-skill'],
		);
	}));

	test('manifest skills field with exclusive mode skips default directory', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/exclusive-skills');
		await writeFile('/plugins/exclusive-skills/.plugin/plugin.json', JSON.stringify({
			name: 'exclusive-skills',
			skills: { paths: ['./only-here/'], exclusive: true },
		}));
		await writeFile('/plugins/exclusive-skills/skills/ignored/SKILL.md', '# Should be ignored');
		await writeFile('/plugins/exclusive-skills/only-here/visible/SKILL.md', '# Should be visible');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].skills, s => s.length > 0);
		assert.deepStrictEqual(
			plugins[0].skills.get().map(s => s.name),
			['visible'],
		);
	}));

	test('manifest commands field with string array scans multiple directories', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/multi-commands');
		await writeFile('/plugins/multi-commands/.plugin/plugin.json', JSON.stringify({
			name: 'multi-commands',
			commands: ['./cmd1/', './cmd2/'],
		}));
		await writeFile('/plugins/multi-commands/commands/default.md', '# Default');
		await writeFile('/plugins/multi-commands/cmd1/alpha.md', '# Alpha');
		await writeFile('/plugins/multi-commands/cmd2/beta.md', '# Beta');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].commands, c => c.length >= 3);
		assert.deepStrictEqual(
			plugins[0].commands.get().map(c => c.name).sort(),
			['alpha', 'beta', 'default'],
		);
	}));

	test('manifest agents field adds supplemental agent directories', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/custom-agents');
		await writeFile('/plugins/custom-agents/.plugin/plugin.json', JSON.stringify({
			name: 'custom-agents',
			agents: './extra-agents/',
		}));
		await writeFile('/plugins/custom-agents/agents/default-agent.md', '# Default');
		await writeFile('/plugins/custom-agents/extra-agents/bonus-agent.md', '# Bonus');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].agents, a => a.length >= 2);
		assert.deepStrictEqual(
			plugins[0].agents.get().map(a => a.name).sort(),
			['bonus-agent', 'default-agent'],
		);
	}));

	test('path traversal in manifest is rejected', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/traversal');
		await writeFile('/plugins/traversal/.plugin/plugin.json', JSON.stringify({
			name: 'traversal',
			skills: '../outside/',
		}));
		await writeFile('/plugins/outside/evil/SKILL.md', '# Evil skill');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		// Only default skills/ directory should be scanned; the traversal path is rejected.
		// Since there are no skills in skills/, result should be empty.
		await waitForState(plugins[0].skills, () => true);
		assert.deepStrictEqual(plugins[0].skills.get(), []);
	}));

	test('duplicate names across directories deduplicate (first wins)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/dedup');
		await writeFile('/plugins/dedup/.plugin/plugin.json', JSON.stringify({
			name: 'dedup',
			commands: './extra-commands/',
		}));
		await writeFile('/plugins/dedup/commands/shared.md', '# Default version');
		await writeFile('/plugins/dedup/extra-commands/shared.md', '# Custom version');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].commands, c => c.length > 0);
		const cmds = plugins[0].commands.get();
		assert.strictEqual(cmds.length, 1);
		assert.strictEqual(cmds[0].name, 'shared');
		// The default directory is scanned first, so the URI should come from commands/
		assert.ok(cmds[0].uri.path.includes('/commands/shared.md'));
	}));

	test('discovers components without a manifest', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/no-manifest');
		await writeFile('/plugins/no-manifest/commands/hello.md', '# Hello');
		await writeFile('/plugins/no-manifest/skills/my-skill/SKILL.md', '# My skill');
		await writeFile('/plugins/no-manifest/agents/helper.md', '# Helper');
		await writeFile('/plugins/no-manifest/rules/prefer-const.mdc', '---\ndescription: Prefer const\n---\nUse const.');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		assert.strictEqual(plugins[0].label, 'no-manifest');

		await waitForState(plugins[0].commands, c => c.length > 0);
		assert.strictEqual(plugins[0].commands.get()[0].name, 'hello');

		await waitForState(plugins[0].skills, s => s.length > 0);
		assert.strictEqual(plugins[0].skills.get()[0].name, 'my-skill');

		await waitForState(plugins[0].agents, a => a.length > 0);
		assert.strictEqual(plugins[0].agents.get()[0].name, 'helper');

		await waitForState(plugins[0].instructions, i => i.length > 0);
		assert.strictEqual(plugins[0].instructions.get()[0].name, 'prefer-const');
	}));

	test('reads hooks from default hooks/hooks.json', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/hooks-default');
		await writeFile('/plugins/hooks-default/.plugin/plugin.json', JSON.stringify({ name: 'hooks-default' }));
		await writeFile('/plugins/hooks-default/hooks/hooks.json', JSON.stringify({
			hooks: {
				PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo done' }] }],
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].hooks, h => h.length > 0);
		assert.strictEqual(plugins[0].hooks.get().length, 1);
	}));

	test('reads inline hooks from manifest', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/hooks-inline');
		await writeFile('/plugins/hooks-inline/.plugin/plugin.json', JSON.stringify({
			name: 'hooks-inline',
			hooks: {
				hooks: {
					SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }],
				},
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].hooks, h => h.length > 0);
		assert.strictEqual(plugins[0].hooks.get().length, 1);
	}));

	test('reads hooks from custom path in manifest', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/hooks-custom');
		await writeFile('/plugins/hooks-custom/.plugin/plugin.json', JSON.stringify({
			name: 'hooks-custom',
			hooks: './config/my-hooks.json',
		}));
		await writeFile('/plugins/hooks-custom/config/my-hooks.json', JSON.stringify({
			hooks: {
				PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo edited' }] }],
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].hooks, h => h.length > 0);
		assert.strictEqual(plugins[0].hooks.get().length, 1);
	}));

	test('reads MCP from custom path in manifest', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/mcp-custom');
		await writeFile('/plugins/mcp-custom/.plugin/plugin.json', JSON.stringify({
			name: 'mcp-custom',
			mcpServers: './config/servers.json',
		}));
		await writeFile('/plugins/mcp-custom/config/servers.json', JSON.stringify({
			mcpServers: {
				'custom-server': { command: 'node', args: ['custom.js'] },
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].mcpServerDefinitions, d => d.length > 0);
		assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, 'custom-server');
	}));

	test('inline MCP in manifest takes priority over standalone .mcp.json', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/mcp-merged');
		await writeFile('/plugins/mcp-merged/.plugin/plugin.json', JSON.stringify({
			name: 'mcp-merged',
			mcpServers: {
				'inline-server': { command: 'echo', args: ['inline'] },
			},
		}));
		await writeFile('/plugins/mcp-merged/.mcp.json', JSON.stringify({
			mcpServers: {
				'file-server': { command: 'echo', args: ['file'] },
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		// When inline mcpServers is an object in the manifest, it is treated as
		// embedded configuration and the default .mcp.json file is not read.
		// Wait for the inline server to appear (manifest loads asynchronously).
		await waitForState(plugins[0].mcpServerDefinitions, d =>
			[...d].some(s => s.name === 'inline-server'));
		assert.deepStrictEqual(
			plugins[0].mcpServerDefinitions.get().map(d => d.name),
			['inline-server'],
		);
	}));

	test('PLUGIN_ROOT expansion in hook commands', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/root-expansion');
		await writeFile('/plugins/root-expansion/.plugin/plugin.json', JSON.stringify({
			name: 'root-expansion',
			hooks: {
				hooks: {
					PostToolUse: [{
						hooks: [{
							type: 'command',
							command: '${PLUGIN_ROOT}/scripts/format.sh',
						}],
					}],
				},
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].hooks, h => h.length > 0);

		const hookCommands = plugins[0].hooks.get()[0].hooks;
		assert.ok(hookCommands.length > 0);
		// ${PLUGIN_ROOT} should be expanded to the plugin's fsPath
		const command = hookCommands[0].command;
		assert.ok(command && !command.includes('${PLUGIN_ROOT}'), `Expected PLUGIN_ROOT to be expanded, got: ${command}`);
	}));

	test('manifest commands field pointing to a specific file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/cmd-file');
		await writeFile('/plugins/cmd-file/.plugin/plugin.json', JSON.stringify({
			name: 'cmd-file',
			commands: './special/deploy.md',
		}));
		await writeFile('/plugins/cmd-file/commands/default.md', '# Default');
		await writeFile('/plugins/cmd-file/special/deploy.md', '# Deploy');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].commands, c => c.length >= 2);
		assert.deepStrictEqual(
			plugins[0].commands.get().map(c => c.name).sort(),
			['default', 'deploy'],
		);
	}));

	test('manifest commands field with array of specific files', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/cmd-files');
		await writeFile('/plugins/cmd-files/.plugin/plugin.json', JSON.stringify({
			name: 'cmd-files',
			commands: ['./extras/alpha.md', './extras/beta.md'],
		}));
		await writeFile('/plugins/cmd-files/extras/alpha.md', '# Alpha');
		await writeFile('/plugins/cmd-files/extras/beta.md', '# Beta');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].commands, c => c.length >= 2);
		assert.deepStrictEqual(
			plugins[0].commands.get().map(c => c.name).sort(),
			['alpha', 'beta'],
		);
	}));

	test('manifest agents field pointing to a specific file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/agent-file');
		await writeFile('/plugins/agent-file/.plugin/plugin.json', JSON.stringify({
			name: 'agent-file',
			agents: './custom/specialist.md',
		}));
		await writeFile('/plugins/agent-file/agents/default.md', '# Default');
		await writeFile('/plugins/agent-file/custom/specialist.md', '# Specialist');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].agents, a => a.length >= 2);
		assert.deepStrictEqual(
			plugins[0].agents.get().map(a => a.name).sort(),
			['default', 'specialist'],
		);
	}));

	test('manifest skills field pointing to a specific skill directory', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/skill-dir');
		await writeFile('/plugins/skill-dir/.plugin/plugin.json', JSON.stringify({
			name: 'skill-dir',
			skills: './custom/my-skill',
		}));
		await writeFile('/plugins/skill-dir/custom/my-skill/SKILL.md', '# My Skill');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].skills, s => s.length > 0);
		assert.deepStrictEqual(
			plugins[0].skills.get().map(s => s.name),
			['my-skill'],
		);
	}));

	test('manifest hooks field pointing to a specific file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/hook-file');
		await writeFile('/plugins/hook-file/.plugin/plugin.json', JSON.stringify({
			name: 'hook-file',
			hooks: './config/custom-hooks.json',
		}));
		await writeFile('/plugins/hook-file/config/custom-hooks.json', JSON.stringify({
			hooks: {
				SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].hooks, h => h.length > 0);
		assert.strictEqual(plugins[0].hooks.get().length, 1);
	}));

	test('manifest mcpServers field pointing to a specific file', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/mcp-file');
		await writeFile('/plugins/mcp-file/.plugin/plugin.json', JSON.stringify({
			name: 'mcp-file',
			mcpServers: './config/servers.json',
		}));
		await writeFile('/plugins/mcp-file/config/servers.json', JSON.stringify({
			mcpServers: {
				'custom-server': { command: 'node', args: ['serve.js'] },
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);
		await waitForState(plugins[0].mcpServerDefinitions, d => d.length > 0);
		assert.strictEqual(plugins[0].mcpServerDefinitions.get()[0].name, 'custom-server');
	}));

	test('reads rules from rules/ directory with .mdc extension', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/rules-plugin');
		await writeFile('/plugins/rules-plugin/.plugin/plugin.json', JSON.stringify({ name: 'rules-plugin' }));
		await writeFile('/plugins/rules-plugin/rules/prefer-const.mdc', '---\ndescription: Prefer const\n---\nUse const.');
		await writeFile('/plugins/rules-plugin/rules/error-handling.mdc', '---\ndescription: Error handling\n---\nAlways handle errors.');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].instructions, i => i.length >= 2);
		assert.deepStrictEqual(
			plugins[0].instructions.get().map(i => i.name).sort(),
			['error-handling', 'prefer-const'],
		);
	}));

	test('reads rules with .md and .instructions.md extensions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/rules-mixed');
		await writeFile('/plugins/rules-mixed/.plugin/plugin.json', JSON.stringify({ name: 'rules-mixed' }));
		await writeFile('/plugins/rules-mixed/rules/rule-a.mdc', 'Rule A');
		await writeFile('/plugins/rules-mixed/rules/rule-b.md', 'Rule B');
		await writeFile('/plugins/rules-mixed/rules/rule-c.instructions.md', 'Rule C');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].instructions, i => i.length >= 3);
		assert.deepStrictEqual(
			plugins[0].instructions.get().map(i => i.name).sort(),
			['rule-a', 'rule-b', 'rule-c'],
		);
	}));

	test('manifest rules field adds supplemental rule directories', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/custom-rules');
		await writeFile('/plugins/custom-rules/.plugin/plugin.json', JSON.stringify({
			name: 'custom-rules',
			rules: './extra-rules/',
		}));
		await writeFile('/plugins/custom-rules/rules/default-rule.mdc', 'Default rule');
		await writeFile('/plugins/custom-rules/extra-rules/bonus-rule.mdc', 'Bonus rule');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].instructions, i => i.length >= 2);
		assert.deepStrictEqual(
			plugins[0].instructions.get().map(i => i.name).sort(),
			['bonus-rule', 'default-rule'],
		);
	}));

	test('manifest rules field with exclusive mode skips default directory', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/exclusive-rules');
		await writeFile('/plugins/exclusive-rules/.plugin/plugin.json', JSON.stringify({
			name: 'exclusive-rules',
			rules: { paths: ['./only-here/'], exclusive: true },
		}));
		await writeFile('/plugins/exclusive-rules/rules/ignored.mdc', 'Should be ignored');
		await writeFile('/plugins/exclusive-rules/only-here/visible.mdc', 'Should be visible');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].instructions, i => i.length === 1 && i[0].name === 'visible');
		assert.deepStrictEqual(
			plugins[0].instructions.get().map(i => i.name),
			['visible'],
		);
	}));

	test('rule name strips longest matching suffix first', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/suffix-rules');
		await writeFile('/plugins/suffix-rules/.plugin/plugin.json', JSON.stringify({ name: 'suffix-rules' }));
		await writeFile('/plugins/suffix-rules/rules/coding-standards.instructions.md', 'Standards');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].instructions, i => i.length > 0);
		// Should strip '.instructions.md' (longest match), not just '.md'
		assert.strictEqual(plugins[0].instructions.get()[0].name, 'coding-standards');
	}));

	test('deduplicates rules with the same base name', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/dup-rules');
		await writeFile('/plugins/dup-rules/.plugin/plugin.json', JSON.stringify({
			name: 'dup-rules',
			rules: './extra/',
		}));
		// Default directory has 'my-rule.mdc', supplemental has 'my-rule.md' — first wins
		await writeFile('/plugins/dup-rules/rules/my-rule.mdc', 'From default');
		await writeFile('/plugins/dup-rules/extra/my-rule.md', 'From extra');

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].instructions, i => i.length > 0);
		assert.strictEqual(plugins[0].instructions.get().length, 1);
		const instruction = plugins[0].instructions.get()[0];
		assert.strictEqual(instruction.name, 'my-rule');
		assert.ok(instruction.uri.path.endsWith('/rules/my-rule.mdc'));
	}));

	test('PLUGIN_ROOT expansion in inline MCP server definitions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/mcp-root');
		await writeFile('/plugins/mcp-root/.plugin/plugin.json', JSON.stringify({
			name: 'mcp-root',
			mcpServers: {
				'my-server': {
					command: '${PLUGIN_ROOT}/bin/server',
					args: ['--config', '${PLUGIN_ROOT}/config.json'],
					cwd: '${PLUGIN_ROOT}',
					env: { 'CONFIG_DIR': '${PLUGIN_ROOT}/etc' },
				},
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].mcpServerDefinitions, d => d.length > 0);
		const server = plugins[0].mcpServerDefinitions.get()[0];
		assert.strictEqual(server.name, 'my-server');
		const config: any = server.configuration;
		assert.ok(!config.command.includes('${PLUGIN_ROOT}'), `Expected PLUGIN_ROOT to be expanded in command, got: ${config.command}`);
		assert.ok(!config.args[1].includes('${PLUGIN_ROOT}'), `Expected PLUGIN_ROOT to be expanded in args, got: ${config.args[1]}`);
		assert.ok(!config.cwd.includes('${PLUGIN_ROOT}'), `Expected PLUGIN_ROOT to be expanded in cwd, got: ${config.cwd}`);
		assert.ok(!config.env['CONFIG_DIR'].includes('${PLUGIN_ROOT}'), `Expected PLUGIN_ROOT to be expanded in env, got: ${config.env['CONFIG_DIR']}`);
		assert.strictEqual(config.env['PLUGIN_ROOT'], uri.fsPath, 'Expected PLUGIN_ROOT env var to be set');
	}));

	test('CLAUDE_PLUGIN_ROOT expansion in MCP server definitions from .mcp.json', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = pluginUri('/plugins/claude-mcp-root');
		await writeFile('/plugins/claude-mcp-root/.claude-plugin/plugin.json', JSON.stringify({ name: 'claude-mcp-root' }));
		await writeFile('/plugins/claude-mcp-root/.mcp.json', JSON.stringify({
			mcpServers: {
				'claude-server': {
					command: '${CLAUDE_PLUGIN_ROOT}/run.sh',
					args: ['--dir', '${CLAUDE_PLUGIN_ROOT}/data'],
				},
			},
		}));

		const discovery = createDiscovery();
		discovery.start(mockEnablementModel);
		await discovery.setSourcesAndRefresh([uri]);

		const plugins = discovery.plugins.get();
		assert.strictEqual(plugins.length, 1);

		await waitForState(plugins[0].mcpServerDefinitions, d => d.length > 0);
		const server = plugins[0].mcpServerDefinitions.get()[0];
		const config: any = server.configuration;
		assert.ok(!config.command.includes('${CLAUDE_PLUGIN_ROOT}'), `Expected CLAUDE_PLUGIN_ROOT to be expanded in command, got: ${config.command}`);
		assert.ok(!config.args[1].includes('${CLAUDE_PLUGIN_ROOT}'), `Expected CLAUDE_PLUGIN_ROOT to be expanded in args, got: ${config.args[1]}`);
		assert.strictEqual(config.env['CLAUDE_PLUGIN_ROOT'], uri.fsPath, 'Expected CLAUDE_PLUGIN_ROOT env var to be set');
	}));
});
