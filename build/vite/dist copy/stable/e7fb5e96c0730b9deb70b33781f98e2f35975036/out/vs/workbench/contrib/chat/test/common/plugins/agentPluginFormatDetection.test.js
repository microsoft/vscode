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
/**
 * Concrete discovery subclass that returns a fixed list of plugin URIs,
 * allowing format detection and content reading to be tested in isolation.
 */
class TestPluginDiscovery extends AbstractAgentPluginDiscovery {
    constructor(fileService, pathService, logService, workspaceContextService) {
        super(fileService, pathService, logService, workspaceContextService);
        this._sources = [];
    }
    start(enablementModel) {
        this._enablementModel = enablementModel;
    }
    /** Set plugin sources and trigger a refresh. */
    async setSourcesAndRefresh(uris) {
        this._sources = uris;
        await this._refreshPlugins();
    }
    async _discoverPluginSources() {
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
    let fileService;
    let instantiationService;
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
        });
        instantiationService.stub(IInstantiationService, instantiationService);
    });
    const mockEnablementModel = {
        readEnabled: () => 2 /* ContributionEnablementState.EnabledProfile */,
        setEnabled: () => { },
        remove: () => { },
    };
    function createDiscovery() {
        return store.add(new TestPluginDiscovery(fileService, instantiationService.get(IPathService), logService, instantiationService.get(IWorkspaceContextService)));
    }
    async function writeFile(path, content) {
        const uri = URI.from({ scheme: Schemas.inMemory, path });
        await fileService.writeFile(uri, VSBuffer.fromString(content));
    }
    function pluginUri(path) {
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
        assert.deepStrictEqual(plugins[0].skills.get().map(s => s.name), ['root-skill']);
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
        assert.deepStrictEqual(plugins[0].skills.get().map(s => s.name), ['real']);
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
        assert.deepStrictEqual(plugins[0].skills.get().map(s => s.name).sort(), ['bonus-skill', 'default-skill']);
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
        assert.deepStrictEqual(plugins[0].skills.get().map(s => s.name), ['visible']);
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
        assert.deepStrictEqual(plugins[0].commands.get().map(c => c.name).sort(), ['alpha', 'beta', 'default']);
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
        assert.deepStrictEqual(plugins[0].agents.get().map(a => a.name).sort(), ['bonus-agent', 'default-agent']);
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
        await waitForState(plugins[0].mcpServerDefinitions, d => [...d].some(s => s.name === 'inline-server'));
        assert.deepStrictEqual(plugins[0].mcpServerDefinitions.get().map(d => d.name), ['inline-server']);
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
        assert.deepStrictEqual(plugins[0].commands.get().map(c => c.name).sort(), ['default', 'deploy']);
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
        assert.deepStrictEqual(plugins[0].commands.get().map(c => c.name).sort(), ['alpha', 'beta']);
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
        assert.deepStrictEqual(plugins[0].agents.get().map(a => a.name).sort(), ['default', 'specialist']);
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
        assert.deepStrictEqual(plugins[0].skills.get().map(s => s.name), ['my-skill']);
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
        assert.deepStrictEqual(plugins[0].instructions.get().map(i => i.name).sort(), ['error-handling', 'prefer-const']);
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
        assert.deepStrictEqual(plugins[0].instructions.get().map(i => i.name).sort(), ['rule-a', 'rule-b', 'rule-c']);
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
        assert.deepStrictEqual(plugins[0].instructions.get().map(i => i.name).sort(), ['bonus-rule', 'default-rule']);
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
        assert.deepStrictEqual(plugins[0].instructions.get().map(i => i.name), ['visible']);
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
        const config = server.configuration;
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
        const config = server.configuration;
        assert.ok(!config.command.includes('${CLAUDE_PLUGIN_ROOT}'), `Expected CLAUDE_PLUGIN_ROOT to be expanded in command, got: ${config.command}`);
        assert.ok(!config.args[1].includes('${CLAUDE_PLUGIN_ROOT}'), `Expected CLAUDE_PLUGIN_ROOT to be expanded in args, got: ${config.args[1]}`);
        assert.strictEqual(config.env['CLAUDE_PLUGIN_ROOT'], uri.fsPath, 'Expected CLAUDE_PLUGIN_ROOT env var to be set');
    }));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5Gb3JtYXREZXRlY3Rpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpbkZvcm1hdERldGVjdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNuSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztB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