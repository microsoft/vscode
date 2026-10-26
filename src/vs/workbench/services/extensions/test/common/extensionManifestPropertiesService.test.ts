/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY, ExtensionUntrustedWorkspaceSupportType, IExtensionContributions, IExtensionManifest } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceTrustEnablementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { EXTENSIONS_SUPPORT_AGENTS_WINDOW, ExtensionManifestPropertiesService, getSessionsWindowMissingFeatures, getSessionsWindowSuggestedContributions, SessionsWindowMissingFeature } from '../../common/extensionManifestPropertiesService.js';
import { TestProductService, TestWorkspaceTrustEnablementService } from '../../../../test/common/workbenchTestServices.js';

suite('ExtensionManifestPropertiesService - ExtensionKind', () => {

	let disposables: DisposableStore;
	let testObject: ExtensionManifestPropertiesService;

	setup(() => {
		disposables = new DisposableStore();
		testObject = disposables.add(new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService(), new TestWorkspaceTrustEnablementService(), new NullLogService()));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('declarative with extension dependencies', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionDependencies: ['ext1'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative extension pack', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative extension pack and extension dependencies', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'], extensionDependencies: ['ext1', 'ext2'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative with unknown contribution point => workspace, web in web and => workspace in desktop', () => {
		// eslint-disable-next-line local/code-no-any-casts
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ contributes: <any>{ 'unknownPoint': { something: true } } }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative extension pack with unknown contribution point', () => {
		// eslint-disable-next-line local/code-no-any-casts
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'], contributes: <any>{ 'unknownPoint': { something: true } } }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('simple declarative => ui, workspace, web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{}), ['ui', 'workspace', 'web']);
	});

	test('only browser => web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js' }), ['web']);
	});

	test('only main => workspace', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js' }), ['workspace']);
	});

	test('main and browser => workspace, web in web and workspace in desktop', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js', browser: 'main.browser.js' }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('browser entry point with workspace extensionKind => workspace, web in web and workspace in desktop', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js', browser: 'main.browser.js', extensionKind: ['workspace'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('only browser entry point with out extensionKind => web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js' }), ['web']);
	});

	test('simple descriptive with workspace, ui extensionKind => workspace, ui, web in web and workspace, ui in desktop', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionKind: ['workspace', 'ui'] }), isWeb ? ['workspace', 'ui', 'web'] : ['workspace', 'ui']);
	});

	test('opt out from web through settings even if it can run in web', () => {
		testObject = disposables.add(new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService({ remote: { extensionKind: { 'pub.a': ['-web'] } } }), new TestWorkspaceTrustEnablementService(), new NullLogService()));
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js', publisher: 'pub', name: 'a' }), ['ui', 'workspace']);
	});

	test('opt out from web and include only workspace through settings even if it can run in web', () => {
		testObject = disposables.add(new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService({ remote: { extensionKind: { 'pub.a': ['-web', 'workspace'] } } }), new TestWorkspaceTrustEnablementService(), new NullLogService()));
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js', publisher: 'pub', name: 'a' }), ['workspace']);
	});

	test('extension cannot opt out from web', () => {
		// eslint-disable-next-line local/code-no-any-casts
		assert.deepStrictEqual(testObject.getExtensionKind(<any>{ browser: 'main.browser.js', extensionKind: ['-web'] }), ['web']);
	});

	test('extension cannot opt into web', () => {
		// eslint-disable-next-line local/code-no-any-casts
		assert.deepStrictEqual(testObject.getExtensionKind(<any>{ main: 'main.js', extensionKind: ['web', 'workspace', 'ui'] }), ['workspace', 'ui']);
	});

	test('extension cannot opt into web only', () => {
		// eslint-disable-next-line local/code-no-any-casts
		assert.deepStrictEqual(testObject.getExtensionKind(<any>{ main: 'main.js', extensionKind: ['web'] }), ['workspace']);
	});
});

suite('ExtensionManifestPropertiesService - SessionsWindowSupport', () => {

	let disposables: DisposableStore;
	let testConfigurationService: TestConfigurationService;
	let testObject: ExtensionManifestPropertiesService;

	setup(() => {
		disposables = new DisposableStore();
		testConfigurationService = new TestConfigurationService();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function getExtensionManifest(properties: Partial<IExtensionManifest> = {}): IExtensionManifest {
		return Object.create({ name: 'a', publisher: 'pub', version: '1.0.0', ...properties }) as IExtensionManifest;
	}

	function createTestObject(): ExtensionManifestPropertiesService {
		return disposables.add(new ExtensionManifestPropertiesService(TestProductService, testConfigurationService, new TestWorkspaceTrustEnablementService(), new NullLogService()));
	}

	test('defaults to declarative extensions without executable code and supported contributions', () => {
		testObject = createTestObject();

		assert.deepStrictEqual([
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ contributes: { themes: [] } })),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js', contributes: { themes: [] } })),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ contributes: { commands: [] } })),
		], [true, false, false]);
	});

	test('preserves built-in defaults when no agents window support is declared', () => {
		testObject = createTestObject();

		assert.deepStrictEqual([
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js' }), true),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ browser: './out/extension.js' }), true),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ contributes: { views: {} } }), true),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ contributes: { viewsContainers: {} } }), true),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ contributes: { debuggers: [] } }), true),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ contributes: { walkthroughs: [] } }), true),
		], [true, true, false, false, false, false]);
	});

	for (const isBuiltin of [false, true]) {
		test(`uses configured sessions window support override for ${isBuiltin ? 'built-in' : 'user'} extensions`, async () => {
			await testConfigurationService.setUserConfiguration(EXTENSIONS_SUPPORT_AGENTS_WINDOW, { 'pub.a': true, 'pub.b': false });
			testObject = createTestObject();

			assert.deepStrictEqual([
				testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js', capabilities: { agentsWindow: { supported: false } }, contributes: { views: {} } }), isBuiltin),
				testObject.canExecuteOnSessionsWindow(getExtensionManifest({ name: 'b', capabilities: { agentsWindow: { supported: true } }, contributes: { themes: [] } }), isBuiltin),
			], [true, false]);
		});

		test(`uses declared agents window support for ${isBuiltin ? 'built-in' : 'user'} extensions without the proposal`, async () => {
			await testConfigurationService.setUserConfiguration(EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY, true);
			testObject = createTestObject();

			assert.deepStrictEqual([
				testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js', capabilities: { agentsWindow: { supported: true } }, contributes: { commands: [] } }), isBuiltin),
				testObject.canExecuteOnSessionsWindow(getExtensionManifest({ browser: './out/extension.js', capabilities: { agentsWindow: { supported: true } }, contributes: { views: {} } }), isBuiltin),
				testObject.canExecuteOnSessionsWindow(getExtensionManifest({ capabilities: { agentsWindow: { supported: false } }, contributes: { themes: [] } }), isBuiltin),
			], [true, true, false]);
		});
	}

	test('registers sessions window support configuration without editor window contributions', () => {
		testObject = createTestObject();
		const property = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[EXTENSIONS_SUPPORT_AGENTS_WINDOW];

		assert.deepStrictEqual({
			type: property?.type,
			scope: property?.scope,
			default: property?.default,
			additionalProperties: property?.additionalProperties,
			valueTypes: Object.values(property?.patternProperties ?? {}).map(value => value.type),
		}, {
			type: 'object',
			scope: ConfigurationScope.APPLICATION,
			default: {},
			additionalProperties: false,
			valueTypes: ['boolean'],
		});
	});

	test('supports product allow-listed extensions regardless of declarations when not configured', () => {
		testObject = disposables.add(new ExtensionManifestPropertiesService({ ...TestProductService, sessionsWindowAllowedExtensions: ['Pub.A'] }, testConfigurationService, new TestWorkspaceTrustEnablementService(), new NullLogService()));

		assert.deepStrictEqual([
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js', capabilities: { agentsWindow: { supported: false } }, contributes: { commands: [] } })),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js', capabilities: { agentsWindow: { supported: false } }, contributes: { views: {} } }), true),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ name: 'b', main: './out/extension.js' })),
		], [true, true, false]);
	});

	for (const supported of [false, true]) {
		test(`configured ${supported} overrides product allow-listed extensions`, async () => {
			await testConfigurationService.setUserConfiguration(EXTENSIONS_SUPPORT_AGENTS_WINDOW, { 'PUB.a': supported });
			testObject = disposables.add(new ExtensionManifestPropertiesService({ ...TestProductService, sessionsWindowAllowedExtensions: ['Pub.A'] }, testConfigurationService, new TestWorkspaceTrustEnablementService(), new NullLogService()));
			const manifest = getExtensionManifest({ main: './out/extension.js', contributes: { grammars: [{ language: 'a' }] } });

			assert.deepStrictEqual({
				user: testObject.canExecuteOnSessionsWindow(manifest),
				builtin: testObject.canExecuteOnSessionsWindow(manifest, true),
				autoEnable: testObject.canAutoEnableOnSessionsWindow(manifest),
			}, {
				user: supported,
				builtin: supported,
				autoEnable: false,
			});
		});
	}

	test('ignores declared agents window support for user extensions when the capability setting is disabled', async () => {
		await testConfigurationService.setUserConfiguration(EXTENSIONS_ENABLE_AGENTS_WINDOW_CAPABILITY, false);
		testObject = createTestObject();

		assert.deepStrictEqual([
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js', capabilities: { agentsWindow: { supported: true } }, contributes: { commands: [] } })),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ capabilities: { agentsWindow: { supported: false } }, contributes: { themes: [] } })),
			testObject.canExecuteOnSessionsWindow(getExtensionManifest({ main: './out/extension.js', capabilities: { agentsWindow: { supported: true } }, contributes: { views: {} } }), true),
		], [false, true, true]);
	});

	test('automatically enables extensions that contribute something useful and nothing that relies on missing features', async () => {
		await testConfigurationService.setUserConfiguration(EXTENSIONS_SUPPORT_AGENTS_WINDOW, { 'pub.configuredUnsupported': false });
		testObject = createTestObject();
		const extension = (name: string, contributes: Record<string, unknown>, properties: Partial<IExtensionManifest> = {}) =>
			getExtensionManifest({ name, main: './out/extension.js', contributes: contributes as IExtensionContributions, ...properties });
		const manifests = [
			extension('tools', { languageModelTools: [{}] }),
			extension('mcp', { commands: [{}], mcpServerDefinitionProviders: [{}] }),
			extension('skills', { chatSkills: [{}] }),
			extension('languageFeaturesOnly', { grammars: [{}], 'markdown.markdownItPlugins': true }),
			extension('toolsWithViews', { languageModelTools: [{}], views: { explorer: [{}] } }),
			extension('promptsWithDebugger', { chatPromptFiles: [{}], debuggers: [{}] }),
			extension('toolsWithStatusBarItem', { languageModelTools: [{}], statusBarItems: { item: {} } }),
			extension('commandsOnly', { commands: [{}] }),
			extension('noTools', { languageModelTools: [] }),
			extension('declaredUnsupported', { languageModelTools: [{}] }, { capabilities: { agentsWindow: { supported: false } } }),
			extension('configuredUnsupported', { languageModelTools: [{}] }),
			getExtensionManifest({ name: 'supported', contributes: { grammars: [{ language: 'a' }] } }),
		];

		assert.deepStrictEqual({
			user: Object.fromEntries(manifests.map(manifest => [manifest.name, testObject.canAutoEnableOnSessionsWindow(manifest)])),
			builtin: testObject.canAutoEnableOnSessionsWindow(manifests[0], true),
			suggestedContributions: getSessionsWindowSuggestedContributions(manifests[1]),
		}, {
			user: {
				tools: true,
				mcp: true,
				skills: true,
				languageFeaturesOnly: false,
				toolsWithViews: false,
				promptsWithDebugger: false,
				toolsWithStatusBarItem: false,
				commandsOnly: false,
				noTools: false,
				declaredUnsupported: false,
				configuredUnsupported: false,
				supported: false,
			},
			builtin: false,
			suggestedContributions: ['mcpServerDefinitionProviders'],
		});
	});

	test('enables useful extensions automatically when the setting is true, and only listed extensions when it is a list', async () => {
		await testConfigurationService.setUserConfiguration(EXTENSIONS_SUPPORT_AGENTS_WINDOW, { 'pub.configuredUnsupported': false });
		testObject = createTestObject();
		const extension = (name: string, contributes: Record<string, unknown>, properties: Partial<IExtensionManifest> = {}) =>
			getExtensionManifest({ name, main: './out/extension.js', contributes: contributes as IExtensionContributions, ...properties });
		const manifests = [
			extension('tools', { languageModelTools: [{}] }),
			extension('toolsWithViews', { languageModelTools: [{}], views: { explorer: [{}] } }),
			extension('commandsOnly', { commands: [{}] }),
			extension('declaredUnsupported', { languageModelTools: [{}] }, { capabilities: { agentsWindow: { supported: false } } }),
			extension('configuredUnsupported', { languageModelTools: [{}] }),
			getExtensionManifest({ name: 'supported', contributes: { grammars: [{ language: 'a' }] } }),
		];
		const shouldAutoEnable = async (value: unknown, isBuiltin?: boolean) => {
			await testConfigurationService.setUserConfiguration(EXTENSIONS_AGENTS_WINDOW_AUTO_ENABLE, value);
			return manifests.filter(manifest => testObject.shouldAutoEnableOnSessionsWindow(manifest, isBuiltin)).map(manifest => manifest.name);
		};
		const list = ['PUB.toolsWithViews', 'pub.commandsOnly', 'pub.declaredUnsupported', 'pub.configuredUnsupported', 'pub.supported', 42];

		assert.deepStrictEqual({
			disabled: await shouldAutoEnable(false),
			enabled: await shouldAutoEnable(true),
			listed: await shouldAutoEnable(list),
			listedBuiltin: await shouldAutoEnable(list, true),
			empty: await shouldAutoEnable([]),
		}, {
			disabled: [],
			enabled: ['tools'],
			listed: ['toolsWithViews', 'commandsOnly'],
			listedBuiltin: [],
			empty: [],
		});
	});

	test('lists the features that the sessions window lacks and that contributions rely on', () => {
		const features = (contributes: Record<string, unknown>) => getSessionsWindowMissingFeatures(getExtensionManifest({ contributes: contributes as IExtensionContributions }));

		assert.deepStrictEqual({
			none: features({ languageModelTools: [{}], commands: [{}] }),
			empty: features({ views: {}, debuggers: [] }),
			views: features({ viewsWelcome: [{}], viewsContainers: { activitybar: [{}] }, views: { explorer: [{}] } }),
			all: features({ walkthroughs: [{}], statusBarItems: { item: {} }, breakpoints: [{}], views: { explorer: [{}] } }),
		}, {
			none: [],
			empty: [],
			views: [SessionsWindowMissingFeature.Views],
			all: [SessionsWindowMissingFeature.Views, SessionsWindowMissingFeature.Debugging, SessionsWindowMissingFeature.StatusBar, SessionsWindowMissingFeature.Walkthroughs],
		});
	});
});


// Workspace Trust is disabled in web at the moment
if (!isWeb) {
	suite('ExtensionManifestPropertiesService - ExtensionUntrustedWorkspaceSupportType', () => {
		let testObject: ExtensionManifestPropertiesService;
		let instantiationService: TestInstantiationService;
		let testConfigurationService: TestConfigurationService;

		setup(async () => {
			instantiationService = new TestInstantiationService();

			testConfigurationService = new TestConfigurationService();
			instantiationService.stub(IConfigurationService, testConfigurationService);
		});

		teardown(() => {
			testObject.dispose();
			instantiationService.dispose();
		});

		function assertUntrustedWorkspaceSupport(extensionManifest: IExtensionManifest, expected: ExtensionUntrustedWorkspaceSupportType): void {
			testObject = instantiationService.createInstance(ExtensionManifestPropertiesService);
			const untrustedWorkspaceSupport = testObject.getExtensionUntrustedWorkspaceSupportType(extensionManifest);

			assert.strictEqual(untrustedWorkspaceSupport, expected);
		}

		function getExtensionManifest(properties: any = {}): IExtensionManifest {
			return Object.create({ name: 'a', publisher: 'pub', version: '1.0.0', ...properties }) as IExtensionManifest;
		}

		test('test extension workspace trust request when main entry point is missing', () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest();
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when workspace trust is disabled', async () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService(false));

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when "true" override exists in settings.json', async () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: true } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when override (false) exists in settings.json', async () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: false } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when override (true) for the version exists in settings.json', async () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: true, version: '1.0.0' } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when override (false) for the version exists in settings.json', async () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: false, version: '1.0.0' } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when override for a different version exists in settings.json', async () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: true, version: '2.0.0' } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, 'limited');
		});

		test('test extension workspace trust request when default (true) exists in product.json', () => {
			instantiationService.stub(IProductService, { extensionUntrustedWorkspaceSupport: { 'pub.a': { default: true } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when default (false) exists in product.json', () => {
			instantiationService.stub(IProductService, { extensionUntrustedWorkspaceSupport: { 'pub.a': { default: false } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when override (limited) exists in product.json', () => {
			instantiationService.stub(IProductService, { extensionUntrustedWorkspaceSupport: { 'pub.a': { override: 'limited' } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: true } } });
			assertUntrustedWorkspaceSupport(extensionManifest, 'limited');
		});

		test('test extension workspace trust request when override (false) exists in product.json', () => {
			instantiationService.stub(IProductService, { extensionUntrustedWorkspaceSupport: { 'pub.a': { override: false } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: true } } });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when value exists in package.json', () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, 'limited');
		});

		test('test extension workspace trust request when no value exists in package.json', () => {
			instantiationService.stub(IProductService, {});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});
	});
}
