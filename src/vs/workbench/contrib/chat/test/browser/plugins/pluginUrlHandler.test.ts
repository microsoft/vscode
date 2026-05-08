/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { AgentPluginEditorInput } from '../../../browser/agentPluginEditor/agentPluginEditorInput.js';
import { PluginUrlHandler } from '../../../browser/pluginUrlHandler.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IInstallPluginFromSourceOptions, IInstallPluginFromSourceResult, IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, MarketplaceReferenceKind, MarketplaceType, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

function toBase64(value: string): string {
	return encodeBase64(VSBuffer.fromString(value));
}

suite('PluginUrlHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface MockState {
		dialogConfirmResult: boolean;
		installedSources: string[];
		configUpdates: { key: string; value: unknown; target: ConfigurationTarget }[];
		openedEditorInputs: AgentPluginEditorInput[];
		openSearchQueries: string[];
		installFromValidatedSourceResult: IInstallPluginFromSourceResult;
	}

	function createHandler(stateOverrides?: Partial<MockState>): { handler: PluginUrlHandler; state: MockState } {
		const state: MockState = {
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
		} as unknown as IURLService);

		instantiationService.stub(IPluginInstallService, {
			installPluginFromSource: async (source: string) => { state.installedSources.push(source); },
			installPluginFromValidatedSource: async (_source: string, _options?: IInstallPluginFromSourceOptions) => state.installFromValidatedSourceResult,
		} as unknown as IPluginInstallService);

		instantiationService.stub(IDialogService, {
			confirm: async () => ({ confirmed: state.dialogConfirmResult }),
		} as unknown as IDialogService);

		const configService = new TestConfigurationService({
			[ChatConfiguration.PluginMarketplaces]: ['existing/marketplace'],
		});
		// Track updateValue calls
		const origUpdate = configService.updateValue.bind(configService);
		configService.updateValue = async (key: string, value: unknown, target?: ConfigurationTarget) => {
			state.configUpdates.push({ key, value, target: target ?? ConfigurationTarget.USER });
			return origUpdate(key, value);
		};
		instantiationService.stub(IConfigurationService, configService);

		instantiationService.stub(IHostService, {
			focus: async () => { },
		} as unknown as IHostService);

		instantiationService.stub(IExtensionsWorkbenchService, {
			openSearch: (query: string) => { state.openSearchQueries.push(query); },
		} as unknown as IExtensionsWorkbenchService);

		instantiationService.stub(IEditorService, {
			openEditor: async (input: AgentPluginEditorInput) => {
				state.openedEditorInputs.push(input);
				store.add(input);
				return undefined;
			},
		} as unknown as IEditorService);

		// IInstantiationService: delegate createInstance to the TestInstantiationService itself
		instantiationService.stub(IInstantiationService, instantiationService);

		instantiationService.stub(ILogService, new NullLogService());

		const handler = store.add(instantiationService.createInstance(PluginUrlHandler));
		return { handler, state };
	}

	function uri(path: string, query: string): URI {
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

	function makeMarketplacePlugin(name: string, marketplace: string): IMarketplacePlugin {
		const [owner, repo] = marketplace.split('/');
		const ref = {
			kind: MarketplaceReferenceKind.GitHubShorthand as const,
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
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: name },
			marketplace,
			marketplaceReference: ref,
			marketplaceType: MarketplaceType.OpenPlugin,
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
