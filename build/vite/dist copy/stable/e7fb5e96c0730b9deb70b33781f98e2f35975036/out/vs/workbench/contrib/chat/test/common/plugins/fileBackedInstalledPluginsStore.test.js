/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { FileBackedInstalledPluginsStore } from '../../../common/plugins/fileBackedInstalledPluginsStore.js';
import { parseMarketplaceReference } from '../../../common/plugins/pluginMarketplaceService.js';
const LEGACY_INSTALLED_PLUGINS_STORAGE_KEY = 'chat.plugins.installed.v1';
const LEGACY_MARKETPLACE_INDEX_STORAGE_KEY = 'chat.plugins.marketplaces.index.v1';
class TestFileService {
    constructor(_failWrites = false) {
        this._failWrites = _failWrites;
        this._files = new Map();
        this._folders = new Set();
    }
    async exists(resource) {
        const key = resource.toString();
        return this._files.has(key) || this._folders.has(key);
    }
    async readFile(resource) {
        const key = resource.toString();
        const value = this._files.get(key);
        if (value === undefined) {
            throw new Error(`Missing file: ${key}`);
        }
        return { value: VSBuffer.fromString(value) };
    }
    async writeFile(resource, content) {
        if (this._failWrites) {
            throw new Error('write failed');
        }
        this._files.set(resource.toString(), content.toString());
        return {};
    }
    async createFolder(resource) {
        this._folders.add(resource.toString());
        return {};
    }
    createWatcher() {
        return {
            onDidChange: Event.None,
            dispose: () => { },
        };
    }
    setFile(resource, content) {
        this._files.set(resource.toString(), content);
    }
    getFile(resource) {
        return this._files.get(resource.toString());
    }
}
suite('FileBackedInstalledPluginsStore', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    function createLegacyEntry(pluginPath) {
        const reference = parseMarketplaceReference('microsoft/plugins');
        assert.ok(reference);
        return {
            pluginUri: URI.file(pluginPath),
            plugin: {
                name: 'my-plugin',
                description: 'A plugin',
                version: '1.0.0',
                source: 'plugins/my-plugin',
                sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: 'plugins/my-plugin' },
                marketplace: reference.displayLabel,
                marketplaceReference: reference,
                marketplaceType: "copilot" /* MarketplaceType.Copilot */,
            },
            enabled: true,
        };
    }
    async function waitFor(predicate) {
        for (let i = 0; i < 40; i++) {
            if (predicate()) {
                return;
            }
            await timeout(10);
        }
        assert.fail('Condition not met in time');
    }
    test('migrates legacy storage to installed.json and removes legacy keys', async () => {
        const storageService = store.add(new InMemoryStorageService());
        const fileService = new TestFileService();
        const legacyEntry = createLegacyEntry('/cache/agentPlugins/github.com/microsoft/plugins/plugins/my-plugin');
        storageService.store(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, JSON.stringify([legacyEntry]), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const agentPluginsHome = URI.file('/home/user/.vscode/agent-plugins');
        const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
        const pluginsStore = store.add(new FileBackedInstalledPluginsStore(agentPluginsHome, URI.file('/cache/agentPlugins'), fileService, new NullLogService(), storageService));
        await waitFor(() => !!fileService.getFile(installedJson));
        const serialized = fileService.getFile(installedJson);
        assert.ok(serialized);
        const parsed = JSON.parse(serialized);
        assert.strictEqual(parsed.version, 1);
        assert.strictEqual(parsed.installed.length, 1);
        assert.ok(parsed.installed[0].pluginUri.includes('/home/user/.vscode/agent-plugins/github.com/microsoft/plugins/plugins/my-plugin'));
        // plugin metadata is NOT stored in the file
        assert.strictEqual(parsed.installed[0].plugin, undefined);
        assert.strictEqual(pluginsStore.get().length, 1);
        assert.strictEqual(storageService.get(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, -1 /* StorageScope.APPLICATION */), undefined);
        assert.strictEqual(storageService.get(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, -1 /* StorageScope.APPLICATION */), undefined);
    });
    test('keeps legacy keys when migration write fails', async () => {
        const storageService = store.add(new InMemoryStorageService());
        const fileService = new TestFileService(true);
        const legacyEntry = createLegacyEntry('/cache/agentPlugins/github.com/microsoft/plugins/plugins/my-plugin');
        storageService.store(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, JSON.stringify([legacyEntry]), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        storageService.store(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, JSON.stringify({ any: 'value' }), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const agentPluginsHome = URI.file('/home/user/.vscode/agent-plugins');
        const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
        store.add(new FileBackedInstalledPluginsStore(agentPluginsHome, URI.file('/cache/agentPlugins'), fileService, new NullLogService(), storageService));
        await timeout(30);
        assert.strictEqual(fileService.getFile(installedJson), undefined);
        assert.ok(storageService.get(LEGACY_INSTALLED_PLUGINS_STORAGE_KEY, -1 /* StorageScope.APPLICATION */));
        assert.ok(storageService.get(LEGACY_MARKETPLACE_INDEX_STORAGE_KEY, -1 /* StorageScope.APPLICATION */));
    });
    test('loads existing installed.json on startup', async () => {
        const storageService = store.add(new InMemoryStorageService());
        const fileService = new TestFileService();
        const agentPluginsHome = URI.file('/home/user/.vscode/agent-plugins');
        const installedJson = URI.joinPath(agentPluginsHome, 'installed.json');
        const existingData = {
            version: 1,
            installed: [{
                    pluginUri: URI.file('/home/user/.vscode/agent-plugins/github.com/microsoft/plugins/plugins/my-plugin').toString(),
                    marketplace: 'microsoft/plugins',
                }],
        };
        fileService.setFile(installedJson, JSON.stringify(existingData));
        const pluginsStore = store.add(new FileBackedInstalledPluginsStore(agentPluginsHome, URI.file('/cache/agentPlugins'), fileService, new NullLogService(), storageService));
        await waitFor(() => pluginsStore.get().length === 1);
        assert.strictEqual(pluginsStore.get()[0].pluginUri.path, '/home/user/.vscode/agent-plugins/github.com/microsoft/plugins/plugins/my-plugin');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUJhY2tlZEluc3RhbGxlZFBsdWdpbnNTdG9yZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wbHVnaW5zL2ZpbGVCYWNrZWRJbnN0YWxsZWRQbHVnaW5zU3RvcmUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXRHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsc0JBQXNCLEVBQWdELE1BQU0sc0RBQXNELENBQUM7QUFDNUksT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0csT0FBTyxFQUFxQyx5QkFBeUIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRW5JLE1BQU0sb0NBQW9DLEdBQUcsMkJBQTJCLENBQUM7QUFDekUsTUFBTSxvQ0FBb0MsR0FBRyxvQ0FBb0MsQ0FBQztBQUVsRixNQUFNLGVBQWU7SUFJcEIsWUFBNkIsY0FBYyxLQUFLO1FBQW5CLGdCQUFXLEdBQVgsV0FBVyxDQUFRO1FBSC9CLFdBQU0sR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUNuQyxhQUFRLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztJQUVNLENBQUM7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