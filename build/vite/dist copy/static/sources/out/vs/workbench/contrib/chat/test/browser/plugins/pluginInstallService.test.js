/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { PluginInstallService } from '../../../browser/pluginInstallService.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IPluginMarketplaceService, parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';
suite('PluginInstallService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    // --- Factory helpers -------------------------------------------------------
    function makeMarketplaceRef(marketplace) {
        const ref = parseMarketplaceReference(marketplace);
        assert.ok(ref);
        return ref;
    }
    function createPlugin(overrides) {
        return {
            name: overrides.name ?? 'test-plugin',
            description: overrides.description ?? '',
            version: overrides.version ?? '',
            source: overrides.source ?? '',
            sourceDescriptor: overrides.sourceDescriptor,
            marketplace: overrides.marketplace ?? 'microsoft/vscode',
            marketplaceReference: overrides.marketplaceReference ?? makeMarketplaceRef('microsoft/vscode'),
            marketplaceType: overrides.marketplaceType ?? "copilot" /* MarketplaceType.Copilot */,
            readmeUri: overrides.readmeUri,
        };
    }
    function createDefaults() {
        return {
            notifications: [],
            addedPlugins: [],
            dialogConfirmResult: true,
            fileExistsResult: true,
            ensureRepositoryResult: URI.file('/cache/agentPlugins/github.com/microsoft/vscode'),
            ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-package'),
            pluginSourceInstallUris: new Map(),
            terminalCommands: [],
            terminalExitCode: 0,
            terminalCompletes: true,
            pullRepositoryCalls: [],
            updatePluginSourceCalls: [],
            marketplaceTrusted: true,
            trustedMarketplaces: [],
            readPluginsResult: [],
            quickPickResult: undefined,
            quickInputResult: undefined,
            configuredMarketplaces: [],
            updatedMarketplaces: undefined,
        };
    }
    function createService(stateOverrides) {
        const state = { ...createDefaults(), ...stateOverrides };
        const instantiationService = store.add(new TestInstantiationService());
        // IFileService
        instantiationService.stub(IFileService, {
            exists: async (resource) => {
                if (typeof state.fileExistsResult === 'function') {
                    return state.fileExistsResult(resource);
                }
                return state.fileExistsResult;
            },
        });
        // INotificationService
        instantiationService.stub(INotificationService, {
            notify: (notification) => {
                state.notifications.push({ severity: notification.severity, message: notification.message });
                return undefined;
            },
        });
        // IDialogService
        instantiationService.stub(IDialogService, {
            confirm: async () => ({ confirmed: state.dialogConfirmResult }),
        });
        // ITerminalService — the mock coordinates runCommand and onCommandFinished
        // so the command ID matches, just like a real terminal would.
        instantiationService.stub(ITerminalService, {
            createTerminal: async () => {
                let finishedCallback;
                return {
                    processReady: Promise.resolve(),
                    dispose: () => { },
                    runCommand: (command, _addNewLine) => {
                        state.terminalCommands.push(command);
                        // Simulate command completing after runCommand is called
                        if (finishedCallback) {
                            finishedCallback({ id: 'command', exitCode: state.terminalExitCode });
                        }
                    },
                    capabilities: {
                        get: () => state.terminalCompletes ? {
                            onCommandFinished: (callback) => {
                                finishedCallback = callback;
                                return { dispose() { } };
                            },
                        } : undefined,
                        onDidAddCommandDetectionCapability: () => ({ dispose() { } }),
                    },
                };
            },
            setActiveInstance: () => { },
        });
        // IProgressService
        instantiationService.stub(IProgressService, {
            withProgress: async (_options, callback) => callback(),
        });
        // ILogService
        instantiationService.stub(ILogService, new NullLogService());
        // IAgentPluginRepositoryService
        // Build mock source repositories for npm/pip that simulate terminal-based install
        const makeMockPackageRepo = (kind) => ({
            kind,
            getCleanupTarget: () => URI.file('/mock-cleanup'),
            getInstallUri: () => URI.file('/mock'),
            ensure: async () => state.ensurePluginSourceResult,
            update: async () => true,
            getLabel: (d) => kind === "npm" /* PluginSourceKind.Npm */ ? d.package : d.package,
            runInstall: async (_installDir, pluginDir, plugin) => {
                // Simulate confirmation dialog
                if (!state.dialogConfirmResult) {
                    return undefined;
                }
                // Simulate building and running the command
                const descriptor = plugin.sourceDescriptor;
                let args;
                if (kind === "npm" /* PluginSourceKind.Npm */) {
                    const npm = descriptor;
                    const packageSpec = npm.version ? `${npm.package}@${npm.version}` : npm.package;
                    args = ['npm', 'install', '--prefix', _installDir.fsPath, packageSpec];
                    if (npm.registry) {
                        args.push('--registry', npm.registry);
                    }
                }
                else {
                    const pip = descriptor;
                    const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
                    args = ['pip', 'install', '--target', _installDir.fsPath, packageSpec];
                    if (pip.registry) {
                        args.push('--index-url', pip.registry);
                    }
                }
                const command = args.join(' ');
                state.terminalCommands.push(command);
                if (state.terminalExitCode !== 0) {
                    state.notifications.push({ severity: 3, message: `Plugin installation command failed: Command exited with code ${state.terminalExitCode}` });
                    return undefined;
                }
                // Check if plugin dir exists
                const exists = typeof state.fileExistsResult === 'function'
                    ? await state.fileExistsResult(pluginDir)
                    : state.fileExistsResult;
                if (!exists) {
                    const label = kind === "npm" /* PluginSourceKind.Npm */ ? 'npm' : 'pip';
                    const pkg = descriptor.package;
                    state.notifications.push({ severity: 3, message: `${label} package '${pkg}' was not found after installation.` });
                    return undefined;
                }
                return { pluginDir };
            },
        });
        const mockSourceRepos = new Map([
            ["relativePath" /* PluginSourceKind.RelativePath */, { kind: "relativePath" /* PluginSourceKind.RelativePath */, getCleanupTarget: () => undefined, getInstallUri: () => { throw new Error(); }, ensure: async () => { throw new Error(); }, update: async () => { throw new Error(); }, getLabel: (d) => d.path || '.' }],
            ["github" /* PluginSourceKind.GitHub */, { kind: "github" /* PluginSourceKind.GitHub */, getCleanupTarget: () => URI.file('/mock'), getInstallUri: () => URI.file('/mock'), ensure: async () => URI.file('/mock'), update: async () => true, getLabel: (d) => d.repo }],
            ["url" /* PluginSourceKind.GitUrl */, { kind: "url" /* PluginSourceKind.GitUrl */, getCleanupTarget: () => URI.file('/mock'), getInstallUri: () => URI.file('/mock'), ensure: async () => URI.file('/mock'), update: async () => true, getLabel: (d) => d.url }],
            ["npm" /* PluginSourceKind.Npm */, makeMockPackageRepo("npm" /* PluginSourceKind.Npm */)],
            ["pip" /* PluginSourceKind.Pip */, makeMockPackageRepo("pip" /* PluginSourceKind.Pip */)],
        ]);
        instantiationService.stub(IAgentPluginRepositoryService, {
            getPluginInstallUri: (plugin) => {
                return URI.joinPath(state.ensureRepositoryResult, plugin.source);
            },
            getRepositoryUri: () => state.ensureRepositoryResult,
            ensureRepository: async (_marketplace, _options) => {
                return state.ensureRepositoryResult;
            },
            pullRepository: async (marketplace, options) => {
                state.pullRepositoryCalls.push({ marketplace, options });
            },
            getPluginSourceInstallUri: (descriptor) => {
                const key = descriptor.kind;
                return state.pluginSourceInstallUris.get(key) ?? URI.file(`/cache/agentPlugins/${key}/default`);
            },
            ensurePluginSource: async () => state.ensurePluginSourceResult,
            updatePluginSource: async (plugin, options) => {
                state.updatePluginSourceCalls.push({ plugin, options });
            },
            getPluginSource: (kind) => mockSourceRepos.get(kind),
            cleanupPluginSource: async () => { },
        });
        // IPluginMarketplaceService
        instantiationService.stub(IPluginMarketplaceService, {
            addInstalledPlugin: (uri, plugin) => {
                state.addedPlugins.push({ uri: uri.toString(), plugin });
            },
            isMarketplaceTrusted: () => state.marketplaceTrusted,
            trustMarketplace: (ref) => {
                state.trustedMarketplaces.push(ref.canonicalId);
            },
            readPluginsFromDirectory: async () => state.readPluginsResult,
        });
        // IConfigurationService
        instantiationService.stub(IConfigurationService, {
            getValue: (key) => {
                if (key === ChatConfiguration.PluginMarketplaces) {
                    return state.configuredMarketplaces;
                }
                return undefined;
            },
            updateValue: async (key, value) => {
                if (key === ChatConfiguration.PluginMarketplaces) {
                    state.updatedMarketplaces = value;
                }
            },
        });
        // IQuickInputService
        instantiationService.stub(IQuickInputService, {
            input: async () => state.quickInputResult,
            pick: async (picks) => {
                if (!state.quickPickResult) {
                    return undefined;
                }
                return picks.find(p => p.label === state.quickPickResult.label);
            },
        });
        const service = instantiationService.createInstance(PluginInstallService);
        return { service, state };
    }
    // =========================================================================
    // getPluginInstallUri
    // =========================================================================
    suite('getPluginInstallUri', () => {
        test('delegates to getPluginInstallUri for relative-path plugins', () => {
            const { service } = createService();
            const plugin = createPlugin({
                source: 'plugins/myPlugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/myPlugin' },
            });
            const uri = service.getPluginInstallUri(plugin);
            assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin');
        });
        test('delegates to getPluginSourceInstallUri for npm plugins', () => {
            const npmUri = URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg');
            const { service } = createService({
                pluginSourceInstallUris: new Map([['npm', npmUri]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
            });
            const uri = service.getPluginInstallUri(plugin);
            assert.strictEqual(uri.path, npmUri.path);
        });
        test('delegates to getPluginSourceInstallUri for pip plugins', () => {
            const pipUri = URI.file('/cache/agentPlugins/pip/my-pkg');
            const { service } = createService({
                pluginSourceInstallUris: new Map([['pip', pipUri]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg' },
            });
            const uri = service.getPluginInstallUri(plugin);
            assert.strictEqual(uri.path, pipUri.path);
        });
        test('delegates to getPluginSourceInstallUri for github plugins', () => {
            const ghUri = URI.file('/cache/agentPlugins/github.com/owner/repo');
            const { service } = createService({
                pluginSourceInstallUris: new Map([['github', ghUri]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
            });
            const uri = service.getPluginInstallUri(plugin);
            assert.strictEqual(uri.path, ghUri.path);
        });
    });
    // =========================================================================
    // installPlugin — relative path
    // =========================================================================
    suite('installPlugin — relative path', () => {
        test('installs a relative-path plugin when directory exists', async () => {
            const { service, state } = createService();
            const plugin = createPlugin({
                source: 'plugins/myPlugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/myPlugin' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.ok(state.addedPlugins[0].uri.includes('plugins/myPlugin'));
            assert.strictEqual(state.notifications.length, 0);
        });
        test('notifies error when plugin directory does not exist', async () => {
            const { service, state } = createService({ fileExistsResult: false });
            const plugin = createPlugin({
                source: 'plugins/missing',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/missing' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
            assert.ok(state.notifications[0].message.includes('not found'));
        });
        test('does not install when ensureRepository throws', async () => {
            const { state } = createService();
            // Override ensureRepository to throw
            const instantiationService = store.add(new TestInstantiationService());
            const repoService = {
                ensureRepository: async () => { throw new Error('clone failed'); },
                getPluginInstallUri: () => URI.file('/x'),
                getPluginSourceInstallUri: () => URI.file('/x'),
            };
            instantiationService.stub(IAgentPluginRepositoryService, repoService);
            instantiationService.stub(IFileService, { exists: async () => true });
            instantiationService.stub(INotificationService, { notify: (n) => { state.notifications.push(n); } });
            instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });
            instantiationService.stub(ITerminalService, {});
            instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
            instantiationService.stub(ILogService, new NullLogService());
            instantiationService.stub(IPluginMarketplaceService, { addInstalledPlugin: () => { } });
            instantiationService.stub(IPluginMarketplaceService, 'isMarketplaceTrusted', () => true);
            instantiationService.stub(IPluginMarketplaceService, 'trustMarketplace', () => { });
            const svc = instantiationService.createInstance(PluginInstallService);
            const plugin = createPlugin({
                source: 'plugins/myPlugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/myPlugin' },
            });
            await svc.installPlugin(plugin);
            // Should return without installing or crashing
            assert.strictEqual(state.addedPlugins.length, 0);
        });
    });
    // =========================================================================
    // installPlugin — GitHub / GitUrl
    // =========================================================================
    suite('installPlugin — git sources', () => {
        test('installs a GitHub plugin when source exists after clone', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/repo'),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.strictEqual(state.notifications.length, 0);
        });
        test('installs a GitUrl plugin when source exists after clone', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/example.com/repo'),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "url" /* PluginSourceKind.GitUrl */, url: 'https://example.com/repo.git' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.strictEqual(state.notifications.length, 0);
        });
        test('notifies error when cloned directory does not exist', async () => {
            const { service, state } = createService({
                fileExistsResult: false,
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/repo'),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
            assert.ok(state.notifications[0].message.includes('not found'));
        });
    });
    // =========================================================================
    // installPlugin — npm
    // =========================================================================
    suite('installPlugin — npm', () => {
        test('runs npm install and registers plugin on success', async () => {
            const npmInstallUri = URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg');
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
                pluginSourceInstallUris: new Map([['npm', npmInstallUri]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('npm'));
            assert.ok(state.terminalCommands[0].includes('install'));
            assert.ok(state.terminalCommands[0].includes('my-pkg'));
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.strictEqual(state.notifications.length, 0);
        });
        test('includes version in npm install command', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
                pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg', version: '1.2.3' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('my-pkg@1.2.3'));
        });
        test('includes registry in npm install command', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
                pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg', registry: 'https://custom.registry.com' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('--registry'));
            assert.ok(state.terminalCommands[0].includes('https://custom.registry.com'));
        });
        test('does not install when user declines confirmation', async () => {
            const { service, state } = createService({ dialogConfirmResult: false });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 0);
            assert.strictEqual(state.addedPlugins.length, 0);
        });
        test('notifies error when npm package directory not found after install', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
                // exists returns true for ensurePluginSource but false for the final check
                fileExistsResult: false,
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
            assert.ok(state.notifications[0].message.includes('not found'));
        });
        test('notifies error when terminal command fails with non-zero exit code', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
                terminalExitCode: 1,
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
            assert.ok(state.notifications[0].message.includes('failed'));
        });
    });
    // =========================================================================
    // installPlugin — pip
    // =========================================================================
    suite('installPlugin — pip', () => {
        test('runs pip install and registers plugin on success', async () => {
            const pipInstallUri = URI.file('/cache/agentPlugins/pip/my-pkg');
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
                pluginSourceInstallUris: new Map([['pip', pipInstallUri]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('pip'));
            assert.ok(state.terminalCommands[0].includes('install'));
            assert.ok(state.terminalCommands[0].includes('my-pkg'));
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.strictEqual(state.notifications.length, 0);
        });
        test('includes version with == syntax in pip install command', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
                pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg', version: '2.0.0' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('my-pkg==2.0.0'));
        });
        test('includes registry with --index-url in pip install command', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
                pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg', registry: 'https://pypi.custom.com/simple' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('--index-url'));
            assert.ok(state.terminalCommands[0].includes('https://pypi.custom.com/simple'));
        });
        test('does not install when user declines confirmation', async () => {
            const { service, state } = createService({ dialogConfirmResult: false });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 0);
            assert.strictEqual(state.addedPlugins.length, 0);
        });
        test('notifies error when pip package directory not found after install', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
                fileExistsResult: false,
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
            assert.ok(state.notifications[0].message.includes('not found'));
        });
    });
    // =========================================================================
    // updatePlugin
    // =========================================================================
    suite('updatePlugin', () => {
        test('calls updatePluginSource for relative-path plugins', async () => {
            const { service, state } = createService();
            const plugin = createPlugin({
                source: 'plugins/myPlugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/myPlugin' },
            });
            await service.updatePlugin(plugin);
            assert.strictEqual(state.updatePluginSourceCalls.length, 1);
        });
        test('calls updatePluginSource for GitHub plugins', async () => {
            const { service, state } = createService();
            const plugin = createPlugin({
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
            });
            await service.updatePlugin(plugin);
            assert.strictEqual(state.updatePluginSourceCalls.length, 1);
        });
        test('calls updatePluginSource for GitUrl plugins', async () => {
            const { service, state } = createService();
            const plugin = createPlugin({
                sourceDescriptor: { kind: "url" /* PluginSourceKind.GitUrl */, url: 'https://example.com/repo.git' },
            });
            await service.updatePlugin(plugin);
            assert.strictEqual(state.updatePluginSourceCalls.length, 1);
        });
        test('re-installs for npm plugin updates', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
                pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
            });
            await service.updatePlugin(plugin);
            // npm update goes through the same install flow
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('npm'));
        });
        test('does not report npm plugin as updated when install is declined', async () => {
            const { service, state } = createService({
                dialogConfirmResult: false,
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
                pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
            });
            const updated = await service.updatePlugin(plugin);
            assert.strictEqual(updated, false);
            assert.strictEqual(state.terminalCommands.length, 0);
            assert.strictEqual(state.addedPlugins.length, 0);
        });
        test('re-installs for pip plugin updates', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
                pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg' },
            });
            await service.updatePlugin(plugin);
            assert.strictEqual(state.terminalCommands.length, 1);
            assert.ok(state.terminalCommands[0].includes('pip'));
        });
        test('does not report pip plugin as updated when install is declined', async () => {
            const { service, state } = createService({
                dialogConfirmResult: false,
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
                pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
            });
            const plugin = createPlugin({
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg' },
            });
            const updated = await service.updatePlugin(plugin);
            assert.strictEqual(updated, false);
            assert.strictEqual(state.terminalCommands.length, 0);
            assert.strictEqual(state.addedPlugins.length, 0);
        });
    });
    // =========================================================================
    // installPlugin — marketplace trust
    // =========================================================================
    suite('installPlugin — marketplace trust', () => {
        test('skips trust prompt when marketplace is already trusted', async () => {
            const { service, state } = createService({ marketplaceTrusted: true });
            const plugin = createPlugin({
                source: 'plugins/myPlugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/myPlugin' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.strictEqual(state.trustedMarketplaces.length, 0, 'should not re-trust');
        });
        test('shows trust prompt and installs when user confirms', async () => {
            const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: true });
            const plugin = createPlugin({
                source: 'plugins/myPlugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/myPlugin' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.trustedMarketplaces.length, 1);
            assert.strictEqual(state.addedPlugins.length, 1);
        });
        test('does not install when user declines trust', async () => {
            const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });
            const plugin = createPlugin({
                source: 'plugins/myPlugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/myPlugin' },
            });
            await service.installPlugin(plugin);
            assert.strictEqual(state.trustedMarketplaces.length, 0);
            assert.strictEqual(state.addedPlugins.length, 0);
        });
        test('trust prompt applies to all source kinds', async () => {
            const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });
            const kinds = [
                { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'p' },
                { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
                { kind: "url" /* PluginSourceKind.GitUrl */, url: 'https://example.com/repo.git' },
                { kind: "npm" /* PluginSourceKind.Npm */, package: 'my-pkg' },
                { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pkg' },
            ];
            for (const sourceDescriptor of kinds) {
                await service.installPlugin(createPlugin({ sourceDescriptor }));
            }
            assert.strictEqual(state.addedPlugins.length, 0, 'no plugins should be installed when trust is declined');
        });
    });
    // =========================================================================
    // installPluginFromSource
    // =========================================================================
    suite('installPluginFromSource', () => {
        test('rejects invalid source strings', async () => {
            const { service, state } = createService();
            await service.installPluginFromSource('not a valid source');
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
        });
        test('rejects local file URIs', async () => {
            const { service, state } = createService();
            await service.installPluginFromSource('file:///some/local/path');
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
        });
        test('installs single plugin from GitHub shorthand with marketplace.json', async () => {
            const ref = makeMarketplaceRef('owner/my-plugin');
            const discoveredPlugin = createPlugin({
                name: 'my-discovered-plugin',
                description: 'A discovered plugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: '' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
                marketplaceType: "openPlugin" /* MarketplaceType.OpenPlugin */,
            });
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-plugin'),
                readPluginsResult: [discoveredPlugin],
            });
            await service.installPluginFromSource('owner/my-plugin');
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.strictEqual(state.addedPlugins[0].plugin.name, 'my-discovered-plugin');
        });
        test('shows error when no marketplace.json found', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/cool-tool'),
                readPluginsResult: [],
            });
            await service.installPluginFromSource('owner/cool-tool');
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
            assert.ok(state.notifications[0].message.includes('No plugins found'));
        });
        test('shows quick pick for multi-plugin repos', async () => {
            const ref = makeMarketplaceRef('owner/multi-repo');
            const pluginA = createPlugin({
                name: 'plugin-a',
                source: 'plugins/a',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/a' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
            });
            const pluginB = createPlugin({
                name: 'plugin-b',
                source: 'plugins/b',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/b' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
            });
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/multi-repo'),
                readPluginsResult: [pluginA, pluginB],
                quickPickResult: { label: 'plugin-b' },
            });
            await service.installPluginFromSource('owner/multi-repo');
            assert.strictEqual(state.addedPlugins.length, 1);
            assert.strictEqual(state.addedPlugins[0].plugin.name, 'plugin-b');
            assert.ok(state.addedPlugins[0].uri.includes('plugins/b'));
        });
        test('does not install when quick pick is cancelled', async () => {
            const ref = makeMarketplaceRef('owner/multi-repo');
            const pluginA = createPlugin({
                name: 'plugin-a',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/a' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
            });
            const pluginB = createPlugin({
                name: 'plugin-b',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/b' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
            });
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/multi-repo'),
                readPluginsResult: [pluginA, pluginB],
                quickPickResult: undefined,
            });
            await service.installPluginFromSource('owner/multi-repo');
            assert.strictEqual(state.addedPlugins.length, 0);
        });
        test('does not install when trust is declined', async () => {
            const { service, state } = createService({
                marketplaceTrusted: false,
                dialogConfirmResult: false,
                readPluginsResult: [],
            });
            await service.installPluginFromSource('owner/repo');
            assert.strictEqual(state.addedPlugins.length, 0);
        });
        test('shows error when no plugins found in git URL', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-tool'),
                readPluginsResult: [],
            });
            await service.installPluginFromSource('https://github.com/owner/my-tool.git');
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
            assert.ok(state.notifications[0].message.includes('No plugins found'));
        });
        test('shows error when clone directory does not exist', async () => {
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/missing'),
                fileExistsResult: false,
            });
            await service.installPluginFromSource('owner/missing');
            assert.strictEqual(state.addedPlugins.length, 0);
            assert.strictEqual(state.notifications.length, 1);
        });
        test('adds marketplace to config after installing single plugin', async () => {
            const ref = makeMarketplaceRef('owner/my-plugin');
            const discoveredPlugin = createPlugin({
                name: 'my-discovered-plugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: '' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
                marketplaceType: "openPlugin" /* MarketplaceType.OpenPlugin */,
            });
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-plugin'),
                readPluginsResult: [discoveredPlugin],
            });
            await service.installPluginFromSource('owner/my-plugin');
            assert.deepStrictEqual(state.updatedMarketplaces, ['owner/my-plugin']);
        });
        test('adds marketplace to config after picking from multi-plugin repo', async () => {
            const ref = makeMarketplaceRef('owner/multi-repo');
            const pluginA = createPlugin({
                name: 'plugin-a',
                source: 'plugins/a',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/a' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
            });
            const pluginB = createPlugin({
                name: 'plugin-b',
                source: 'plugins/b',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/b' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
            });
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/multi-repo'),
                readPluginsResult: [pluginA, pluginB],
                quickPickResult: { label: 'plugin-a' },
            });
            await service.installPluginFromSource('owner/multi-repo');
            assert.deepStrictEqual(state.updatedMarketplaces, ['owner/multi-repo']);
        });
        test('does not duplicate marketplace in config', async () => {
            const ref = makeMarketplaceRef('owner/my-plugin');
            const discoveredPlugin = createPlugin({
                name: 'my-discovered-plugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: '' },
                marketplace: ref.displayLabel,
                marketplaceReference: ref,
                marketplaceType: "openPlugin" /* MarketplaceType.OpenPlugin */,
            });
            const { service, state } = createService({
                ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-plugin'),
                readPluginsResult: [discoveredPlugin],
                configuredMarketplaces: ['owner/my-plugin'],
            });
            await service.installPluginFromSource('owner/my-plugin');
            assert.strictEqual(state.updatedMarketplaces, undefined);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luSW5zdGFsbFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDaEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsNkJBQTZCLEVBQW9ELE1BQU0seURBQXlELENBQUM7QUFDMUosT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFD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