/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { PluginUrlHandler } from '../../../browser/pluginUrlHandler.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
function toBase64(value) {
    return encodeBase64(VSBuffer.fromString(value));
}
suite('PluginUrlHandler', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    function createHandler(stateOverrides) {
        const state = {
            dialogConfirmResult: true,
            installedSources: [],
            configUpdates: [],
            openedEditorInputs: [],
            openSearchQueries: [],
            installFromValidatedSourceResult: { success: false },
            ...stateOverrides,
        };
        const instantiationService = store.add(new TestInstantiationService());
        instantiationService.stub(IURLService, {
            registerHandler: () => ({ dispose() { } }),
        });
        instantiationService.stub(IPluginInstallService, {
            installPluginFromSource: async (source) => { state.installedSources.push(source); },
            installPluginFromValidatedSource: async (_source, _options) => state.installFromValidatedSourceResult,
        });
        instantiationService.stub(IDialogService, {
            confirm: async () => ({ confirmed: state.dialogConfirmResult }),
        });
        const configService = new TestConfigurationService({
            [ChatConfiguration.PluginMarketplaces]: ['existing/marketplace'],
        });
        // Track updateValue calls
        const origUpdate = configService.updateValue.bind(configService);
        configService.updateValue = async (key, value, target) => {
            state.configUpdates.push({ key, value, target: target ?? 2 /* ConfigurationTarget.USER */ });
            return origUpdate(key, value);
        };
        instantiationService.stub(IConfigurationService, configService);
        instantiationService.stub(IHostService, {
            focus: async () => { },
        });
        instantiationService.stub(IExtensionsWorkbenchService, {
            openSearch: (query) => { state.openSearchQueries.push(query); },
        });
        instantiationService.stub(IEditorService, {
            openEditor: async (input) => {
                state.openedEditorInputs.push(input);
                store.add(input);
                return undefined;
            },
        });
        // IInstantiationService: delegate createInstance to the TestInstantiationService itself
        instantiationService.stub(IInstantiationService, instantiationService);
        instantiationService.stub(ILogService, new NullLogService());
        const handler = store.add(instantiationService.createInstance(PluginUrlHandler));
        return { handler, state };
    }
    function uri(path, query) {
        return URI.from({ scheme: 'vscode', authority: 'chat-plugin', path, query });
    }
    // --- routing ---
    test('ignores unrelated authority', async () => {
        const { handler } = createHandler();
        assert.strictEqual(await handler.handleURL(URI.parse('vscode://other/install?source=foo/bar')), false);
    });
    test('ignores unknown path', async () => {
        const { handler } = createHandler();
        assert.strictEqual(await handler.handleURL(uri('/unknown', 'source=foo/bar')), false);
    });
    // --- install: plain text ---
    test('install with plain-text owner/repo source', async () => {
        const { handler, state } = createHandler();
        const result = await handler.handleURL(uri('/install', 'source=anthropics/claude-code'));
        assert.strictEqual(result, true);
        assert.deepStrictEqual(state.installedSources, ['anthropics/claude-code']);
    });
    // --- install: base64 ---
    test('install with base64-encoded source', async () => {
        const { handler, state } = createHandler();
        const encoded = toBase64('anthropics/claude-code');
        const result = await handler.handleURL(uri('/install', `source=${encoded}`));
        assert.strictEqual(result, true);
        assert.deepStrictEqual(state.installedSources, ['anthropics/claude-code']);
    });
    // --- install: dialog declined ---
    test('install does nothing when dialog is declined', async () => {
        const { handler, state } = createHandler({ dialogConfirmResult: false });
        const result = await handler.handleURL(uri('/install', 'source=anthropics/claude-code'));
        assert.strictEqual(result, true);
        assert.deepStrictEqual(state.installedSources, []);
    });
    // --- install: missing/invalid source ---
    test('install handles missing source param', async () => {
        const { handler, state } = createHandler();
        const result = await handler.handleURL(uri('/install', ''));
        assert.strictEqual(result, true);
        assert.deepStrictEqual(state.installedSources, []);
    });
    test('install handles invalid source', async () => {
        const { handler, state } = createHandler();
        const result = await handler.handleURL(uri('/install', 'source=not-a-valid-ref'));
        assert.strictEqual(result, true);
        assert.deepStrictEqual(state.installedSources, []);
    });
    test('install rejects local file URI sources', async () => {
        const { handler, state } = createHandler();
        const encoded = toBase64('file:///home/user/my-plugin');
        const result = await handler.handleURL(uri('/install', `source=${encodeURIComponent(encoded)}`));
        assert.strictEqual(result, true);
        assert.deepStrictEqual(state.installedSources, []);
    });
    // --- add-marketplace: plain text ---
    test('add-marketplace with plain-text ref', async () => {
        const { handler, state } = createHandler();
        const result = await handler.handleURL(uri('/add-marketplace', 'ref=anthropics/claude-code'));
        assert.strictEqual(result, true);
        assert.strictEqual(state.configUpdates.length, 1);
        assert.deepStrictEqual(state.configUpdates[0].value, ['existing/marketplace', 'anthropics/claude-code']);
    });
    // --- add-marketplace: base64 ---
    test('add-marketplace with base64-encoded ref', async () => {
        const { handler, state } = createHandler();
        const encoded = toBase64('anthropics/claude-code');
        const result = await handler.handleURL(uri('/add-marketplace', `ref=${encoded}`));
        assert.strictEqual(result, true);
        assert.strictEqual(state.configUpdates.length, 1);
        assert.deepStrictEqual(state.configUpdates[0].value, ['existing/marketplace', 'anthropics/claude-code']);
    });
    // --- add-marketplace: dedup ---
    test('add-marketplace does not duplicate existing entry', async () => {
        const { handler, state } = createHandler();
        const result = await handler.handleURL(uri('/add-marketplace', 'ref=existing/marketplace'));
        assert.strictEqual(result, true);
        assert.strictEqual(state.configUpdates.length, 0);
    });
    test('add-marketplace deduplicates by canonical ID', async () => {
        const { handler, state } = createHandler();
        // The URL form of the same GitHub shorthand should match canonically
        const result = await handler.handleURL(uri('/add-marketplace', 'ref=existing%2Fmarketplace'));
        assert.strictEqual(result, true);
        assert.strictEqual(state.configUpdates.length, 0);
    });
    // --- add-marketplace: dialog declined ---
    test('add-marketplace does nothing when dialog is declined', async () => {
        const { handler, state } = createHandler({ dialogConfirmResult: false });
        const result = await handler.handleURL(uri('/add-marketplace', 'ref=anthropics/claude-code'));
        assert.strictEqual(result, true);
        assert.strictEqual(state.configUpdates.length, 0);
    });
    // --- add-marketplace: missing/invalid ref ---
    test('add-marketplace handles missing ref param', async () => {
        const { handler, state } = createHandler();
        const result = await handler.handleURL(uri('/add-marketplace', ''));
        assert.strictEqual(result, true);
        assert.strictEqual(state.configUpdates.length, 0);
    });
    test('add-marketplace handles invalid ref', async () => {
        const { handler, state } = createHandler();
        const result = await handler.handleURL(uri('/add-marketplace', 'ref=not-valid'));
        assert.strictEqual(result, true);
        assert.strictEqual(state.configUpdates.length, 0);
    });
    // --- install with plugin targeting ---
    function makeMarketplacePlugin(name, marketplace) {
        const [owner, repo] = marketplace.split('/');
        const ref = {
            kind: "githubShorthand" /* MarketplaceReferenceKind.GitHubShorthand */,
            rawValue: marketplace,
            displayLabel: marketplace,
            canonicalId: `github:${owner.toLowerCase()}/${repo.toLowerCase()}`,
            cloneUrl: `https://github.com/${marketplace}.git`,
            githubRepo: marketplace,
            cacheSegments: ['github.com', owner, repo],
        };
        return {
            name,
            description: `${name} description`,
            version: '1.0.0',
            source: name,
            sourceDescriptor: { kind: "relativePath" /* PluginSourceKind.RelativePath */, path: name },
            marketplace,
            marketplaceReference: ref,
            marketplaceType: "openPlugin" /* MarketplaceType.OpenPlugin */,
        };
    }
    test('install with plugin param delegates to installPluginFromValidatedSource and opens editor', async () => {
        const plugin = makeMarketplacePlugin('my-plugin', 'acme/plugins');
        const { handler, state } = createHandler({
            installFromValidatedSourceResult: { success: true, matchedPlugin: plugin },
        });
        const result = await handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
        assert.strictEqual(result, true);
        // Should not show the install confirmation dialog (trust handled by install service)
        assert.deepStrictEqual(state.installedSources, []);
        // Plugin editor was opened
        assert.strictEqual(state.openedEditorInputs.length, 1);
        assert.strictEqual(state.openedEditorInputs[0].item.name, 'my-plugin');
    });
    test('install with base64-encoded plugin param opens editor', async () => {
        const plugin = makeMarketplacePlugin('my-plugin', 'acme/plugins');
        const { handler, state } = createHandler({
            installFromValidatedSourceResult: { success: true, matchedPlugin: plugin },
        });
        const encodedPlugin = toBase64('my-plugin');
        const result = await handler.handleURL(uri('/install', `source=acme/plugins&plugin=${encodedPlugin}`));
        assert.strictEqual(result, true);
        assert.strictEqual(state.openedEditorInputs.length, 1);
        assert.strictEqual(state.openedEditorInputs[0].item.name, 'my-plugin');
    });
    test('install with plugin param falls back to search on failure', async () => {
        const { handler, state } = createHandler({
            installFromValidatedSourceResult: { success: false, message: 'Plugin not found' },
        });
        const result = await handler.handleURL(uri('/install', 'source=acme/plugins&plugin=nonexistent'));
        assert.strictEqual(result, true);
        assert.strictEqual(state.openedEditorInputs.length, 0);
        assert.strictEqual(state.openSearchQueries.length, 1);
        assert.ok(state.openSearchQueries[0].includes('acme/plugins'));
    });
    test('install with plugin param falls back to search when no matchedPlugin', async () => {
        const { handler, state } = createHandler({
            installFromValidatedSourceResult: { success: true },
        });
        const result = await handler.handleURL(uri('/install', 'source=acme/plugins&plugin=my-plugin'));
        assert.strictEqual(result, true);
        assert.strictEqual(state.openedEditorInputs.length, 0);
        assert.strictEqual(state.openSearchQueries.length, 1);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luVXJsSGFuZGxlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvcGx1Z2lucy9wbHVnaW5VcmxIYW5kbGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxZQUFZLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDakYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBdUIscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUM5SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFDNUgsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDM0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUUxRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN4RSxP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