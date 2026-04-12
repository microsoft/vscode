/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IStorageService, InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { AgentPluginRepositoryService } from '../../../browser/agentPluginRepositoryService.js';
import { parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';
suite('AgentPluginRepositoryService', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    function createPlugin(marketplace, source) {
        const marketplaceReference = parseMarketplaceReference(marketplace);
        assert.ok(marketplaceReference);
        if (!marketplaceReference) {
            throw new Error('Expected marketplace reference to parse.');
        }
        return {
            name: 'test-plugin',
            description: '',
            version: '',
            source,
            sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: source },
            marketplace: marketplaceReference.displayLabel,
            marketplaceReference,
            marketplaceType: "copilot" /* MarketplaceType.Copilot */,
        };
    }
    function createService(onExists, onExecuteCommand) {
        const instantiationService = store.add(new TestInstantiationService());
        const fileService = {
            exists: async (resource) => onExists ? onExists(resource) : true,
        };
        const progressService = {
            withProgress: async (_options, callback) => callback(),
        };
        instantiationService.stub(ICommandService, {
            executeCommand: async (id, ...args) => {
                onExecuteCommand?.(id, ...args);
                return undefined;
            },
        });
        instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache'), agentPluginsHome: URI.file('/cache/agentPlugins') });
        instantiationService.stub(IFileService, fileService);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(INotificationService, { notify: () => undefined });
        instantiationService.stub(IProgressService, progressService);
        instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
        return instantiationService.createInstance(AgentPluginRepositoryService);
    }
    test('uses cacheSegments path for GitHub shorthand plugin references', () => {
        const service = createService();
        const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
        const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
        assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
    });
    test('uses marketplaces cache path for direct git URI plugin references', () => {
        const service = createService();
        const plugin = createPlugin('https://example.com/org/repo.git', 'plugins/myPlugin');
        const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
        assert.strictEqual(uri.path, '/cache/agentPlugins/example.com/org/repo');
    });
    test('uses same cache path for equivalent GitHub shorthand and URI references', () => {
        const service = createService();
        const shorthandPlugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
        const uriPlugin = createPlugin('https://github.com/microsoft/vscode.git', 'plugins/myPlugin');
        const shorthandUri = service.getRepositoryUri(shorthandPlugin.marketplaceReference, shorthandPlugin.marketplaceType);
        const uriRefUri = service.getRepositoryUri(uriPlugin.marketplaceReference, uriPlugin.marketplaceType);
        assert.strictEqual(shorthandUri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
        assert.strictEqual(uriRefUri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
    });
    test('ensures plugin repositories via cacheSegments path', async () => {
        let checkedPath;
        const service = createService(async (resource) => {
            checkedPath = resource.path;
            return true;
        });
        const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
        const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
        assert.strictEqual(checkedPath, '/cache/agentPlugins/github.com/microsoft/vscode');
        assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode');
    });
    test('concurrent ensureRepository calls for the same marketplace clone only once', async () => {
        let cloneCount = 0;
        const instantiationService = store.add(new TestInstantiationService());
        // Track whether the repo exists (set to true after the first clone completes)
        let repoExists = false;
        const fileService = {
            exists: async (_resource) => repoExists,
            createFolder: async () => undefined,
        };
        const progressService = {
            withProgress: async (_options, callback) => callback(),
        };
        instantiationService.stub(ICommandService, {
            executeCommand: async (id) => {
                if (id === '_git.cloneRepository') {
                    cloneCount++;
                    // Simulate async clone by yielding, then mark repo as existing
                    await new Promise(r => setTimeout(r, 0));
                    repoExists = true;
                }
                return undefined;
            },
        });
        instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache'), agentPluginsHome: URI.file('/cache/agentPlugins') });
        instantiationService.stub(IFileService, fileService);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(INotificationService, { notify: () => undefined });
        instantiationService.stub(IProgressService, progressService);
        instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
        const service = instantiationService.createInstance(AgentPluginRepositoryService);
        const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
        // Fire two concurrent ensureRepository calls for the same marketplace
        const [uri1, uri2] = await Promise.all([
            service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType }),
            service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType }),
        ]);
        assert.strictEqual(cloneCount, 1);
        assert.strictEqual(uri1.path, '/cache/agentPlugins/github.com/microsoft/vscode');
        assert.strictEqual(uri2.path, '/cache/agentPlugins/github.com/microsoft/vscode');
    });
    test('builds install URI from source inside repository root', () => {
        const service = createService();
        const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
        const uri = service.getPluginInstallUri(plugin);
        assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin');
    });
    test('uses indexed repository URI when available', () => {
        const storage = store.add(new InMemoryStorageService());
        storage.store('chat.plugins.marketplaces.index.v1', JSON.stringify({
            'github:microsoft/vscode': {
                repositoryUri: URI.file('/cache/agentPlugins/indexed/microsoft/vscode'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            },
        }), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const instantiationService = store.add(new TestInstantiationService());
        instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
        instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache'), agentPluginsHome: URI.file('/cache/agentPlugins') });
        instantiationService.stub(IFileService, { exists: async () => true });
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(INotificationService, { notify: () => undefined });
        instantiationService.stub(IProgressService, { withProgress: async (_options, callback) => callback() });
        instantiationService.stub(IStorageService, storage);
        const service = instantiationService.createInstance(AgentPluginRepositoryService);
        const plugin = createPlugin('microsoft/vscode', 'plugins/myPlugin');
        const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
        assert.strictEqual(uri.path, '/cache/agentPlugins/indexed/microsoft/vscode');
    });
    test('rejects plugin source paths that escape repository root', () => {
        const service = createService();
        const plugin = createPlugin('microsoft/vscode', '../outside');
        assert.throws(() => service.getPluginInstallUri(plugin));
    });
    test('uses local repository URI for file marketplace references', () => {
        const service = createService();
        const plugin = createPlugin('file:///tmp/marketplace-repo', 'plugins/myPlugin');
        const uri = service.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
        assert.strictEqual(uri.scheme, 'file');
        assert.strictEqual(uri.path, '/tmp/marketplace-repo');
    });
    test('does not invoke clone command when ensuring existing local file repository', async () => {
        let commandInvocationCount = 0;
        const service = createService(async () => true, () => {
            commandInvocationCount++;
        });
        const plugin = createPlugin('file:///tmp/marketplace-repo', 'plugins/myPlugin');
        const uri = await service.ensureRepository(plugin.marketplaceReference, { marketplaceType: plugin.marketplaceType });
        assert.strictEqual(uri.path, '/tmp/marketplace-repo');
        assert.strictEqual(commandInvocationCount, 0);
    });
    test('builds revision-aware install URI for github plugin sources', () => {
        const service = createService();
        const uri = service.getPluginSourceInstallUri({
            kind: "github" /* PluginSourceKind.GitHub */,
            repo: 'owner/repo',
            ref: 'release/v1',
        });
        assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/owner/repo/ref_release_v1');
    });
    test('updates git plugin source by pulling and checking out requested revision', async () => {
        const commands = [];
        const service = createService(async () => true, (id) => {
            commands.push(id);
        });
        await service.updatePluginSource({
            name: 'my-plugin',
            description: '',
            version: '',
            source: '',
            sourceDescriptor: {
                kind: "github" /* PluginSourceKind.GitHub */,
                repo: 'owner/repo',
                sha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
            },
            marketplace: 'owner/repo',
            marketplaceReference: parseMarketplaceReference('owner/repo'),
            marketplaceType: "copilot" /* MarketplaceType.Copilot */,
        }, {
            pluginName: 'my-plugin',
            failureLabel: 'my-plugin',
            marketplaceType: "copilot" /* MarketplaceType.Copilot */,
        });
        assert.deepStrictEqual(commands, ['git.openRepository', '_git.revParse', 'git.fetch', '_git.checkout', '_git.revParse']);
    });
    // =========================================================================
    // cleanupPluginSource — issue #297251 regression
    // =========================================================================
    suite('cleanupPluginSource', () => {
        function createServiceWithDel(onDel, options) {
            const instantiationService = store.add(new TestInstantiationService());
            instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
            instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache'), agentPluginsHome: URI.file('/cache/agentPlugins') });
            instantiationService.stub(IFileService, {
                exists: async () => true,
                del: async (resource) => { onDel(resource); },
                createFolder: async () => undefined,
                resolve: async (resource) => options?.resolve?.(resource) ?? { children: [] },
            });
            instantiationService.stub(ILogService, new NullLogService());
            instantiationService.stub(INotificationService, { notify: () => undefined });
            instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
            instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
            return instantiationService.createInstance(AgentPluginRepositoryService);
        }
        test('does not delete files for relative-path (marketplace) plugin', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path));
            await service.cleanupPluginSource({
                name: 'marketplace-plugin',
                description: '',
                version: '',
                source: 'plugins/foo',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/foo' },
                marketplace: 'microsoft/vscode',
                marketplaceReference: parseMarketplaceReference('microsoft/vscode'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            });
            assert.strictEqual(deleted.length, 0);
        });
        test('deletes cache for github plugin source', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path));
            await service.cleanupPluginSource({
                name: 'gh-plugin',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            });
            assert.ok(deleted.length >= 1);
            assert.ok(deleted[0].includes('github.com/owner/repo'));
        });
        test('deletes parent cache dir for npm plugin source', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path));
            await service.cleanupPluginSource({
                name: 'npm-plugin',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "npm" /* PluginSourceKind.Npm */, package: '@acme/plugin' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            });
            assert.ok(deleted.length >= 1);
            // First delete should be the npm/<sanitized-package> cache dir
            assert.ok(deleted[0].includes('/npm/'), `Expected npm path, got: ${deleted[0]}`);
        });
        test('deletes cache for pip plugin source', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path));
            await service.cleanupPluginSource({
                name: 'pip-plugin',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "pip" /* PluginSourceKind.Pip */, package: 'my-pip-pkg' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            });
            assert.ok(deleted.length >= 1);
            assert.ok(deleted[0].includes('pip/my-pip-pkg'));
        });
        test('does not throw when delete fails', async () => {
            const instantiationService = store.add(new TestInstantiationService());
            instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
            instantiationService.stub(IEnvironmentService, { cacheHome: URI.file('/cache'), agentPluginsHome: URI.file('/cache/agentPlugins') });
            instantiationService.stub(IFileService, {
                exists: async () => true,
                del: async () => { throw new Error('permission denied'); },
                createFolder: async () => undefined,
                resolve: async () => ({ children: [] }),
            });
            instantiationService.stub(ILogService, new NullLogService());
            instantiationService.stub(INotificationService, { notify: () => undefined });
            instantiationService.stub(IProgressService, { withProgress: async (_o, cb) => cb() });
            instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
            const service = instantiationService.createInstance(AgentPluginRepositoryService);
            // Should not throw — cleanup is best-effort
            await service.cleanupPluginSource({
                name: 'gh-plugin',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            });
        });
        test('prunes empty parent directories up to cache root', async () => {
            // After deleting github.com/owner/repo, the "owner" dir is empty
            // and should also be removed.
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path), { resolve: () => ({ children: [] }) });
            await service.cleanupPluginSource({
                name: 'gh-plugin',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            });
            // Should have deleted the repo dir + empty parents (owner, github.com)
            assert.ok(deleted.length >= 2, `Expected at least 2 deletions (repo + parent), got ${deleted.length}: ${deleted.join(', ')}`);
            assert.ok(deleted[0].includes('github.com/owner/repo'), 'First delete should be the repo dir');
            assert.ok(deleted.some(p => p.endsWith('/owner')), 'Should prune empty owner directory');
        });
        test('stops pruning at non-empty parent', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path), {
                resolve: (resource) => {
                    // owner dir still has another repo
                    if (resource.path.endsWith('/owner')) {
                        return { children: [{ name: 'other-repo' }] };
                    }
                    return { children: [] };
                },
            });
            await service.cleanupPluginSource({
                name: 'gh-plugin',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            });
            // Should only delete the repo dir, stop at non-empty owner dir
            assert.strictEqual(deleted.length, 1);
            assert.ok(deleted[0].includes('github.com/owner/repo'));
        });
        test('skips deletion when another installed plugin shares the same cleanup target', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path));
            await service.cleanupPluginSource({
                name: 'plugin-a',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo', path: 'plugins/a' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            }, 
            // Another plugin from the same repo still installed
            [{ kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo', path: 'plugins/b' }]);
            assert.strictEqual(deleted.length, 0);
        });
        test('proceeds with deletion when no other plugin shares the cleanup target', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path));
            await service.cleanupPluginSource({
                name: 'plugin-a',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo', path: 'plugins/a' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            }, 
            // Only unrelated plugins remain
            [{ kind: "github" /* PluginSourceKind.GitHub */, repo: 'other-owner/other-repo' }]);
            assert.ok(deleted.length >= 1);
            assert.ok(deleted[0].includes('github.com/owner/repo'));
        });
        test('proceeds with deletion when otherInstalledDescriptors is empty', async () => {
            const deleted = [];
            const service = createServiceWithDel(r => deleted.push(r.path));
            await service.cleanupPluginSource({
                name: 'plugin-a',
                description: '',
                version: '',
                source: '',
                sourceDescriptor: { kind: "github" /* PluginSourceKind.GitHub */, repo: 'owner/repo' },
                marketplace: 'owner/marketplace',
                marketplaceReference: parseMarketplaceReference('owner/marketplace'),
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            }, []);
            assert.ok(deleted.length >= 1);
            assert.ok(deleted[0].includes('github.com/owner/repo'));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvcGx1Z2lucy9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDekYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGtGQUFrRixDQUFDO0FBQzVILE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0YsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDdEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxzQkFBc0IsRUFBK0IsTUFBTSxzREFBc0QsQ0FBQztBQUM1SSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNoRyxPQUFPLEVBQXVDLHlCQUF5QixFQUFvQixNQUFNLHFEQUFxRCxDQUFDO0FBRXZKLEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7SUFDMUMsTUFBTSxLQUFLLEdBQUcsdUNBQXVD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