/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as sinon from 'sinon';
import * as assert from 'assert';
import * as uuid from 'vs/base/common/uuid';
import {
	IExtensionGalleryService, IGalleryExtensionAssets, IGalleryExtension, IExtensionManagementService,
	DidUninstallExtensionEvent, InstallExtensionEvent, IExtensionTipsService, InstallExtensionResult, getTargetPlatform, UninstallExtensionEvent
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { Emitter, Event } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { TestLifecycleService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestContextService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { TestExtensionTipsService, TestSharedProcessService } from 'vs/workbench/test/electron-sandbox/workbenchTestServices';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { testWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IPager } from 'vs/base/common/paging';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ConfigurationKey, IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';
import { TestExtensionEnablementService } from 'vs/workbench/services/extensionManagement/test/browser/extensionEnablementService.test';
import { IURLService } from 'vs/platform/url/common/url';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/model';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { INotificationService, Severity, IPromptChoice, IPromptOptions } from 'vs/platform/notification/common/notification';
import { NativeURLService } from 'vs/platform/url/common/urlService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService, ILogService } from 'vs/platform/log/common/log';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtensionRecommendationsService } from 'vs/workbench/contrib/extensions/browser/extensionRecommendationsService';
import { NoOpWorkspaceTagsService } from 'vs/workbench/contrib/tags/browser/workspaceTagsService';
import { IWorkspaceTagsService } from 'vs/workbench/contrib/tags/common/workspaceTags';
import { ExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/browser/extensionsWorkbenchService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkspaceExtensionsConfigService, WorkspaceExtensionsConfigService } from 'vs/workbench/services/extensionRecommendations/common/workspaceExtensionsConfig';
import { IExtensionIgnoredRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { ExtensionIgnoredRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionIgnoredRecommendationsService';
import { IExtensionRecommendationNotificationService } from 'vs/platform/extensionRecommendations/common/extensionRecommendations';
import { ExtensionRecommendationNotificationService } from 'vs/workbench/contrib/extensions/browser/extensionRecommendationNotificationService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { joinPath } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { platform } from 'vs/base/common/platform';
import { arch } from 'vs/base/common/process';
import { runWithFakedTimers } from 'vs/base/test/common/timeTravelScheduler';
import { DisposableStore } from 'vs/base/common/lifecycle';

const mockExtensionGallery: IGalleryExtension[] = [
	aGalleryExtension('MockExtension1', {
		displayName: 'Mock Extension 1',
		version: '1.5',
		publisherId: 'mockPublisher1Id',
		publisher: 'mockPublisher1',
		publisherDisplayName: 'Mock Publisher 1',
		description: 'Mock Description',
		installCount: 1000,
		rating: 4,
		ratingCount: 100
	}, {
		dependencies: ['pub.1'],
	}, {
		manifest: { uri: 'uri:manifest', fallbackUri: 'fallback:manifest' },
		readme: { uri: 'uri:readme', fallbackUri: 'fallback:readme' },
		changelog: { uri: 'uri:changelog', fallbackUri: 'fallback:changlog' },
		download: { uri: 'uri:download', fallbackUri: 'fallback:download' },
		icon: { uri: 'uri:icon', fallbackUri: 'fallback:icon' },
		license: { uri: 'uri:license', fallbackUri: 'fallback:license' },
		repository: { uri: 'uri:repository', fallbackUri: 'fallback:repository' },
		signature: { uri: 'uri:signature', fallbackUri: 'fallback:signature' },
		coreTranslations: []
	}),
	aGalleryExtension('MockExtension2', {
		displayName: 'Mock Extension 2',
		version: '1.5',
		publisherId: 'mockPublisher2Id',
		publisher: 'mockPublisher2',
		publisherDisplayName: 'Mock Publisher 2',
		description: 'Mock Description',
		installCount: 1000,
		rating: 4,
		ratingCount: 100
	}, {
		dependencies: ['pub.1', 'pub.2'],
	}, {
		manifest: { uri: 'uri:manifest', fallbackUri: 'fallback:manifest' },
		readme: { uri: 'uri:readme', fallbackUri: 'fallback:readme' },
		changelog: { uri: 'uri:changelog', fallbackUri: 'fallback:changlog' },
		download: { uri: 'uri:download', fallbackUri: 'fallback:download' },
		icon: { uri: 'uri:icon', fallbackUri: 'fallback:icon' },
		license: { uri: 'uri:license', fallbackUri: 'fallback:license' },
		repository: { uri: 'uri:repository', fallbackUri: 'fallback:repository' },
		signature: { uri: 'uri:signature', fallbackUri: 'fallback:signature' },
		coreTranslations: []
	})
];

const mockExtensionLocal = [
	{
		type: ExtensionType.User,
		identifier: mockExtensionGallery[0].identifier,
		manifest: {
			name: mockExtensionGallery[0].name,
			publisher: mockExtensionGallery[0].publisher,
			version: mockExtensionGallery[0].version
		},
		metadata: null,
		path: 'somepath',
		readmeUrl: 'some readmeUrl',
		changelogUrl: 'some changelogUrl'
	},
	{
		type: ExtensionType.User,
		identifier: mockExtensionGallery[1].identifier,
		manifest: {
			name: mockExtensionGallery[1].name,
			publisher: mockExtensionGallery[1].publisher,
			version: mockExtensionGallery[1].version
		},
		metadata: null,
		path: 'somepath',
		readmeUrl: 'some readmeUrl',
		changelogUrl: 'some changelogUrl'
	}
];

const mockTestData = {
	recommendedExtensions: [
		'mockPublisher1.mockExtension1',
		'MOCKPUBLISHER2.mockextension2',
		'badlyformattedextension',
		'MOCKPUBLISHER2.mockextension2',
		'unknown.extension'
	],
	validRecommendedExtensions: [
		'mockPublisher1.mockExtension1',
		'MOCKPUBLISHER2.mockextension2'
	]
};

function aPage<T>(...objects: T[]): IPager<T> {
	return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null! };
}

const noAssets: IGalleryExtensionAssets = {
	changelog: null,
	download: null!,
	icon: null!,
	license: null,
	manifest: null,
	readme: null,
	repository: null,
	signature: null,
	coreTranslations: []
};

function aGalleryExtension(name: string, properties: any = {}, galleryExtensionProperties: any = {}, assets: IGalleryExtensionAssets = noAssets): IGalleryExtension {
	const targetPlatform = getTargetPlatform(platform, arch);
	const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
	galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
	galleryExtension.assets = { ...galleryExtension.assets, ...assets };
	galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: uuid.generateUuid() };
	return <IGalleryExtension>galleryExtension;
}

suite('ExtensionRecommendationsService Test', () => {
	const disposableStore = new DisposableStore();
	let workspaceService: IWorkspaceContextService;
	let instantiationService: TestInstantiationService;
	let testConfigurationService: TestConfigurationService;
	let testObject: ExtensionRecommendationsService;
	let installEvent: Emitter<InstallExtensionEvent>,
		didInstallEvent: Emitter<readonly InstallExtensionResult[]>,
		uninstallEvent: Emitter<UninstallExtensionEvent>,
		didUninstallEvent: Emitter<DidUninstallExtensionEvent>;
	let prompted: boolean;
	let promptedEmitter: Emitter<void>;
	let onModelAddedEvent: Emitter<ITextModel>;

	setup(() => {
		instantiationService = disposableStore.add(new TestInstantiationService());
		promptedEmitter = disposableStore.add(new Emitter<void>());
		installEvent = disposableStore.add(new Emitter<InstallExtensionEvent>());
		didInstallEvent = disposableStore.add(new Emitter<readonly InstallExtensionResult[]>());
		uninstallEvent = disposableStore.add(new Emitter<UninstallExtensionEvent>());
		didUninstallEvent = disposableStore.add(new Emitter<DidUninstallExtensionEvent>());
		instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
		instantiationService.stub(ISharedProcessService, TestSharedProcessService);
		instantiationService.stub(ILifecycleService, disposableStore.add(new TestLifecycleService()));
		testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IExtensionManagementService, <Partial<IExtensionManagementService>>{
			onInstallExtension: installEvent.event,
			onDidInstallExtensions: didInstallEvent.event,
			onUninstallExtension: uninstallEvent.event,
			onDidUninstallExtension: didUninstallEvent.event,
			onDidUpdateExtensionMetadata: Event.None,
			onDidChangeProfile: Event.None,
			async getInstalled() { return []; },
			async canInstall() { return true; },
			async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [] }; },
			async getTargetPlatform() { return getTargetPlatform(platform, arch); }
		});
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			onDidChangeExtensions: Event.None,
			extensions: [],
			async whenInstalledExtensionsRegistered() { return true; }
		});
		instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IURLService, NativeURLService);
		instantiationService.stub(IWorkspaceTagsService, new NoOpWorkspaceTagsService());
		instantiationService.stub(IStorageService, disposableStore.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IProductService, <Partial<IProductService>>{
			extensionTips: {
				'ms-dotnettools.csharp': '{**/*.cs,**/project.json,**/global.json,**/*.csproj,**/*.sln,**/appsettings.json}',
				'msjsdiag.debugger-for-chrome': '{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs,**/.babelrc}',
				'lukehoban.Go': '**/*.go'
			},
			extensionRecommendations: {
				'ms-python.python': {
					onFileOpen: [
						{
							'pathGlob': '{**/*.py}',
							important: true
						}
					]
				},
				'ms-vscode.PowerShell': {
					onFileOpen: [
						{
							'pathGlob': '{**/*.ps,**/*.ps1}',
							important: true
						}
					]
				},
				'ms-dotnettools.csharp': {
					onFileOpen: [
						{
							'pathGlob': '{**/*.cs,**/project.json,**/global.json,**/*.csproj,**/*.sln,**/appsettings.json}',
						}
					]
				},
				'msjsdiag.debugger-for-chrome': {
					onFileOpen: [
						{
							'pathGlob': '{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs,**/.babelrc}',
						}
					]
				},
				'lukehoban.Go': {
					onFileOpen: [
						{
							'pathGlob': '**/*.go',
						}
					]
				}
			},
		});

		instantiationService.set(IExtensionsWorkbenchService, disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
		instantiationService.stub(IExtensionTipsService, disposableStore.add(instantiationService.createInstance(TestExtensionTipsService)));

		onModelAddedEvent = new Emitter<ITextModel>();

		instantiationService.stub(IEnvironmentService, <Partial<IEnvironmentService>>{});
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
		instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
		instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage<IGalleryExtension>(...mockExtensionGallery));
		instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', mockExtensionGallery);

		prompted = false;

		class TestNotificationService2 extends TestNotificationService {
			public override prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions) {
				prompted = true;
				promptedEmitter.fire();
				return super.prompt(severity, message, choices, options);
			}
		}

		instantiationService.stub(INotificationService, new TestNotificationService2());

		testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: false });
		instantiationService.stub(IModelService, <IModelService>{
			getModels(): any { return []; },
			onModelAdded: onModelAddedEvent.event
		});
	});

	teardown(() => disposableStore.clear());

	function setUpFolderWorkspace(folderName: string, recommendedExtensions: string[], ignoredRecommendations: string[] = []): Promise<void> {
		return setUpFolder(folderName, recommendedExtensions, ignoredRecommendations);
	}

	async function setUpFolder(folderName: string, recommendedExtensions: string[], ignoredRecommendations: string[] = []): Promise<void> {
		const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
		const logService = new NullLogService();
		const fileService = disposableStore.add(new FileService(logService));
		const fileSystemProvider = disposableStore.add(new InMemoryFileSystemProvider());
		disposableStore.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const folderDir = joinPath(ROOT, folderName);
		const workspaceSettingsDir = joinPath(folderDir, '.vscode');
		await fileService.createFolder(workspaceSettingsDir);
		const configPath = joinPath(workspaceSettingsDir, 'extensions.json');
		await fileService.writeFile(configPath, VSBuffer.fromString(JSON.stringify({
			'recommendations': recommendedExtensions,
			'unwantedRecommendations': ignoredRecommendations,
		}, null, '\t')));

		const myWorkspace = testWorkspace(folderDir);

		instantiationService.stub(IFileService, fileService);
		workspaceService = new TestContextService(myWorkspace);
		instantiationService.stub(IWorkspaceContextService, workspaceService);
		instantiationService.stub(IWorkspaceExtensionsConfigService, disposableStore.add(instantiationService.createInstance(WorkspaceExtensionsConfigService)));
		instantiationService.stub(IExtensionIgnoredRecommendationsService, disposableStore.add(instantiationService.createInstance(ExtensionIgnoredRecommendationsService)));
		instantiationService.stub(IExtensionRecommendationNotificationService, disposableStore.add(instantiationService.createInstance(ExtensionRecommendationNotificationService)));
	}

	function testNoPromptForValidRecommendations(recommendations: string[]) {
		return setUpFolderWorkspace('myFolder', recommendations).then(() => {
			testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
			return testObject.activationPromise.then(() => {
				assert.strictEqual(Object.keys(testObject.getAllRecommendationsWithReason()).length, recommendations.length);
				assert.ok(!prompted);
			});
		});
	}

	function testNoPromptOrRecommendationsForValidRecommendations(recommendations: string[]) {
		return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions).then(() => {
			testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
			assert.ok(!prompted);

			return testObject.getWorkspaceRecommendations().then(() => {
				assert.strictEqual(Object.keys(testObject.getAllRecommendationsWithReason()).length, 0);
				assert.ok(!prompted);
			});
		});
	}

	test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations when galleryService is absent', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const galleryQuerySpy = sinon.spy();
		instantiationService.stub(IExtensionGalleryService, { query: galleryQuerySpy, isEnabled: () => false });

		return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions)
			.then(() => assert.ok(galleryQuerySpy.notCalled));
	}));

	test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations during extension development', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		instantiationService.stub(IEnvironmentService, { extensionDevelopmentLocationURI: [URI.file('/folder/file')], isExtensionDevelopment: true });
		return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions);
	}));

	test('ExtensionRecommendationsService: No workspace recommendations or prompts when extensions.json has empty array', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		return testNoPromptForValidRecommendations([]);
	}));

	test('ExtensionRecommendationsService: Prompt for valid workspace recommendations', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		await setUpFolderWorkspace('myFolder', mockTestData.recommendedExtensions);
		testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));

		await Event.toPromise(promptedEmitter.event);
		const recommendations = Object.keys(testObject.getAllRecommendationsWithReason());
		const expected = [...mockTestData.validRecommendedExtensions, 'unknown.extension'];
		assert.strictEqual(recommendations.length, expected.length);
		expected.forEach(x => {
			assert.strictEqual(recommendations.indexOf(x.toLowerCase()) > -1, true);
		});
	}));

	test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if they are already installed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', mockExtensionLocal);
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
	}));

	test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations with casing mismatch if they are already installed', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', mockExtensionLocal);
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions.map(x => x.toUpperCase()));
	}));

	test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: true });
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
	}));

	test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if showRecommendationsOnlyOnDemand is set', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		testConfigurationService.setUserConfiguration(ConfigurationKey, { showRecommendationsOnlyOnDemand: true });
		return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions).then(() => {
			testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
			return testObject.activationPromise.then(() => {
				assert.ok(!prompted);
			});
		});
	}));

	test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set for current workspace', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		instantiationService.get(IStorageService).store('extensionsAssistant/workspaceRecommendationsIgnore', true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
	}));

	test('ExtensionRecommendationsService: No Recommendations of globally ignored recommendations', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		instantiationService.get(IStorageService).store('extensionsAssistant/workspaceRecommendationsIgnore', true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', '["ms-dotnettools.csharp", "ms-python.python", "ms-vscode.vscode-typescript-tslint-plugin"]', StorageScope.PROFILE, StorageTarget.MACHINE);
		instantiationService.get(IStorageService).store('extensionsAssistant/ignored_recommendations', '["ms-dotnettools.csharp", "mockpublisher2.mockextension2"]', StorageScope.PROFILE, StorageTarget.MACHINE);

		return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions).then(() => {
			testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
			return testObject.activationPromise.then(() => {
				const recommendations = testObject.getAllRecommendationsWithReason();
				assert.ok(!recommendations['ms-dotnettools.csharp']); // stored recommendation that has been globally ignored
				assert.ok(recommendations['ms-python.python']); // stored recommendation
				assert.ok(recommendations['mockpublisher1.mockextension1']); // workspace recommendation
				assert.ok(!recommendations['mockpublisher2.mockextension2']); // workspace recommendation that has been globally ignored
			});
		});
	}));

	test('ExtensionRecommendationsService: No Recommendations of workspace ignored recommendations', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const ignoredRecommendations = ['ms-dotnettools.csharp', 'mockpublisher2.mockextension2']; // ignore a stored recommendation and a workspace recommendation.
		const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
		instantiationService.get(IStorageService).store('extensionsAssistant/workspaceRecommendationsIgnore', true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);

		return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions, ignoredRecommendations).then(() => {
			testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
			return testObject.activationPromise.then(() => {
				const recommendations = testObject.getAllRecommendationsWithReason();
				assert.ok(!recommendations['ms-dotnettools.csharp']); // stored recommendation that has been workspace ignored
				assert.ok(recommendations['ms-python.python']); // stored recommendation
				assert.ok(recommendations['mockpublisher1.mockextension1']); // workspace recommendation
				assert.ok(!recommendations['mockpublisher2.mockextension2']); // workspace recommendation that has been workspace ignored
			});
		});
	}));

	test('ExtensionRecommendationsService: Able to retrieve collection of all ignored recommendations', async () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {

		const storageService = instantiationService.get(IStorageService);
		const workspaceIgnoredRecommendations = ['ms-dotnettools.csharp']; // ignore a stored recommendation and a workspace recommendation.
		const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
		const globallyIgnoredRecommendations = '["mockpublisher2.mockextension2"]'; // ignore a workspace recommendation.
		storageService.store('extensionsAssistant/workspaceRecommendationsIgnore', true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('extensionsAssistant/recommendations', storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
		storageService.store('extensionsAssistant/ignored_recommendations', globallyIgnoredRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);

		await setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions, workspaceIgnoredRecommendations);
		testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
		await testObject.activationPromise;

		const recommendations = testObject.getAllRecommendationsWithReason();
		assert.deepStrictEqual(Object.keys(recommendations), ['ms-python.python', 'mockpublisher1.mockextension1']);
	}));

	test('ExtensionRecommendationsService: Able to dynamically ignore/unignore global recommendations', async () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = instantiationService.get(IStorageService);

		const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
		const globallyIgnoredRecommendations = '["mockpublisher2.mockextension2"]'; // ignore a workspace recommendation.
		storageService.store('extensionsAssistant/workspaceRecommendationsIgnore', true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('extensionsAssistant/recommendations', storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);
		storageService.store('extensionsAssistant/ignored_recommendations', globallyIgnoredRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);

		await setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions);
		const extensionIgnoredRecommendationsService = instantiationService.get(IExtensionIgnoredRecommendationsService);
		testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
		await testObject.activationPromise;

		let recommendations = testObject.getAllRecommendationsWithReason();
		assert.ok(recommendations['ms-python.python']);
		assert.ok(recommendations['mockpublisher1.mockextension1']);
		assert.ok(!recommendations['mockpublisher2.mockextension2']);

		extensionIgnoredRecommendationsService.toggleGlobalIgnoredRecommendation('mockpublisher1.mockextension1', true);

		recommendations = testObject.getAllRecommendationsWithReason();
		assert.ok(recommendations['ms-python.python']);
		assert.ok(!recommendations['mockpublisher1.mockextension1']);
		assert.ok(!recommendations['mockpublisher2.mockextension2']);

		extensionIgnoredRecommendationsService.toggleGlobalIgnoredRecommendation('mockpublisher1.mockextension1', false);

		recommendations = testObject.getAllRecommendationsWithReason();
		assert.ok(recommendations['ms-python.python']);
		assert.ok(recommendations['mockpublisher1.mockextension1']);
		assert.ok(!recommendations['mockpublisher2.mockextension2']);
	}));

	test('test global extensions are modified and recommendation change event is fired when an extension is ignored', async () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storageService = instantiationService.get(IStorageService);
		const changeHandlerTarget = sinon.spy();
		const ignoredExtensionId = 'Some.Extension';

		storageService.store('extensionsAssistant/workspaceRecommendationsIgnore', true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storageService.store('extensionsAssistant/ignored_recommendations', '["ms-vscode.vscode"]', StorageScope.PROFILE, StorageTarget.MACHINE);

		await setUpFolderWorkspace('myFolder', []);
		testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
		const extensionIgnoredRecommendationsService = instantiationService.get(IExtensionIgnoredRecommendationsService);
		disposableStore.add(extensionIgnoredRecommendationsService.onDidChangeGlobalIgnoredRecommendation(changeHandlerTarget));
		extensionIgnoredRecommendationsService.toggleGlobalIgnoredRecommendation(ignoredExtensionId, true);
		await testObject.activationPromise;

		assert.ok(changeHandlerTarget.calledOnce);
		assert.ok(changeHandlerTarget.getCall(0).calledWithMatch({ extensionId: ignoredExtensionId.toLowerCase(), isRecommended: false }));
	}));

	test('ExtensionRecommendationsService: Get file based recommendations from storage (old format)', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python", "ms-vscode.vscode-typescript-tslint-plugin"]';
		instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);

		return setUpFolderWorkspace('myFolder', []).then(() => {
			testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
			return testObject.activationPromise.then(() => {
				const recommendations = testObject.getFileBasedRecommendations();
				assert.strictEqual(recommendations.length, 2);
				assert.ok(recommendations.some(extensionId => extensionId === 'ms-dotnettools.csharp')); // stored recommendation that exists in product.extensionTips
				assert.ok(recommendations.some(extensionId => extensionId === 'ms-python.python')); // stored recommendation that exists in product.extensionImportantTips
				assert.ok(recommendations.every(extensionId => extensionId !== 'ms-vscode.vscode-typescript-tslint-plugin')); // stored recommendation that is no longer in neither product.extensionTips nor product.extensionImportantTips
			});
		});
	}));

	test('ExtensionRecommendationsService: Get file based recommendations from storage (new format)', async () => {
		const milliSecondsInADay = 1000 * 60 * 60 * 24;
		const now = Date.now();
		const tenDaysOld = 10 * milliSecondsInADay;
		const storedRecommendations = `{"ms-dotnettools.csharp": ${now}, "ms-python.python": ${now}, "ms-vscode.vscode-typescript-tslint-plugin": ${now}, "lukehoban.Go": ${tenDaysOld}}`;
		instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', storedRecommendations, StorageScope.PROFILE, StorageTarget.MACHINE);

		await setUpFolderWorkspace('myFolder', []);
		testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
		await testObject.activationPromise;

		const recommendations = testObject.getFileBasedRecommendations();
		assert.strictEqual(recommendations.length, 2);
		assert.ok(recommendations.some(extensionId => extensionId === 'ms-dotnettools.csharp')); // stored recommendation that exists in product.extensionTips
		assert.ok(recommendations.some(extensionId => extensionId === 'ms-python.python')); // stored recommendation that exists in product.extensionImportantTips
		assert.ok(recommendations.every(extensionId => extensionId !== 'ms-vscode.vscode-typescript-tslint-plugin')); // stored recommendation that is no longer in neither product.extensionTips nor product.extensionImportantTips
		assert.ok(recommendations.every(extensionId => extensionId !== 'lukehoban.Go')); //stored recommendation that is older than a week
	});
});
