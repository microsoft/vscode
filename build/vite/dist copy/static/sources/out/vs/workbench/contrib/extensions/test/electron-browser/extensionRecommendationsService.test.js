/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import assert from 'assert';
import * as uuid from '../../../../../base/common/uuid.js';
import { IExtensionGalleryService, IExtensionManagementService, IExtensionTipsService, getTargetPlatform, } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { TestExtensionTipsService, TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../../base/common/uri.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ConfigurationKey, IExtensionsWorkbenchService } from '../../common/extensions.js';
import { TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ExtensionRecommendationsService } from '../../browser/extensionRecommendationsService.js';
import { NoOpWorkspaceTagsService } from '../../../tags/browser/workspaceTagsService.js';
import { IWorkspaceTagsService } from '../../../tags/common/workspaceTags.js';
import { ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IWorkspaceExtensionsConfigService, WorkspaceExtensionsConfigService } from '../../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { IExtensionIgnoredRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { ExtensionIgnoredRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionIgnoredRecommendationsService.js';
import { IExtensionRecommendationNotificationService } from '../../../../../platform/extensionRecommendations/common/extensionRecommendations.js';
import { ExtensionRecommendationNotificationService } from '../../browser/extensionRecommendationNotificationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { timeout } from '../../../../../base/common/async.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });
const mockExtensionGallery = [
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
        type: 1 /* ExtensionType.User */,
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
        type: 1 /* ExtensionType.User */,
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
function aPage(...objects) {
    return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null };
}
const noAssets = {
    changelog: null,
    download: null,
    icon: null,
    license: null,
    manifest: null,
    readme: null,
    repository: null,
    signature: null,
    coreTranslations: []
};
function aGalleryExtension(name, properties = {}, galleryExtensionProperties = {}, assets = noAssets) {
    const targetPlatform = getTargetPlatform(platform, arch);
    const galleryExtension = Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
    galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
    galleryExtension.assets = { ...galleryExtension.assets, ...assets };
    galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: uuid.generateUuid() };
    return galleryExtension;
}
suite('ExtensionRecommendationsService Test', () => {
    let disposableStore;
    let workspaceService;
    let instantiationService;
    let testConfigurationService;
    let testObject;
    let prompted;
    let promptedEmitter;
    let onModelAddedEvent;
    teardown(async () => {
        disposableStore.dispose();
        await timeout(0); // allow for async disposables to complete
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        disposableStore = new DisposableStore();
        instantiationService = disposableStore.add(new TestInstantiationService());
        promptedEmitter = disposableStore.add(new Emitter());
        instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
        instantiationService.stub(ISharedProcessService, TestSharedProcessService);
        instantiationService.stub(ILifecycleService, disposableStore.add(new TestLifecycleService()));
        testConfigurationService = new TestConfigurationService();
        instantiationService.stub(IConfigurationService, testConfigurationService);
        instantiationService.stub(IProductService, TestProductService);
        instantiationService.stub(ILogService, NullLogService);
        const fileService = new FileService(instantiationService.get(ILogService));
        instantiationService.stub(IFileService, disposableStore.add(fileService));
        const fileSystemProvider = disposableStore.add(new InMemoryFileSystemProvider());
        disposableStore.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
        instantiationService.stub(IUriIdentityService, disposableStore.add(new UriIdentityService(instantiationService.get(IFileService))));
        instantiationService.stub(INotificationService, new TestNotificationService());
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IWorkbenchExtensionManagementService, {
            onInstallExtension: Event.None,
            onDidInstallExtensions: Event.None,
            onUninstallExtension: Event.None,
            onDidUninstallExtension: Event.None,
            onDidUpdateExtensionMetadata: Event.None,
            onDidChangeProfile: Event.None,
            onProfileAwareDidInstallExtensions: Event.None,
            async getInstalled() { return []; },
            async canInstall() { return true; },
            async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
            async getTargetPlatform() { return getTargetPlatform(platform, arch); },
        });
        instantiationService.stub(IExtensionService, {
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
        instantiationService.stub(IProductService, {
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
        instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
        instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
        instantiationService.set(IExtensionsWorkbenchService, disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
        instantiationService.stub(IExtensionTipsService, disposableStore.add(instantiationService.createInstance(TestExtensionTipsService)));
        onModelAddedEvent = new Emitter();
        instantiationService.stub(IEnvironmentService, {});
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
        instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(...mockExtensionGallery));
        instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', mockExtensionGallery);
        prompted = false;
        class TestNotificationService2 extends TestNotificationService {
            prompt(severity, message, choices, options) {
                prompted = true;
                promptedEmitter.fire();
                return super.prompt(severity, message, choices, options);
            }
        }
        instantiationService.stub(INotificationService, new TestNotificationService2());
        testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: false });
        instantiationService.stub(IModelService, {
            getModels() { return []; },
            onModelAdded: onModelAddedEvent.event
        });
    });
    function setUpFolderWorkspace(folderName, recommendedExtensions, ignoredRecommendations = []) {
        return setUpFolder(folderName, recommendedExtensions, ignoredRecommendations);
    }
    async function setUpFolder(folderName, recommendedExtensions, ignoredRecommendations = []) {
        const fileService = instantiationService.get(IFileService);
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
    function testNoPromptForValidRecommendations(recommendations) {
        return setUpFolderWorkspace('myFolder', recommendations).then(() => {
            testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
            return testObject.activationPromise.then(() => {
                assert.strictEqual(Object.keys(testObject.getAllRecommendationsWithReason()).length, recommendations.length);
                assert.ok(!prompted);
            });
        });
    }
    function testNoPromptOrRecommendationsForValidRecommendations(recommendations) {
        return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions).then(() => {
            testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
            assert.ok(!prompted);
            return testObject.getWorkspaceRecommendations().then(() => {
                assert.strictEqual(Object.keys(testObject.getAllRecommendationsWithReason()).length, 0);
                assert.ok(!prompted);
            });
        });
    }
    test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations when galleryService is absent', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const galleryQuerySpy = sinon.spy();
        instantiationService.stub(IExtensionGalleryService, { query: galleryQuerySpy, isEnabled: () => false });
        return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions)
            .then(() => assert.ok(galleryQuerySpy.notCalled));
    }));
    test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations during extension development', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        instantiationService.stub(IEnvironmentService, { extensionDevelopmentLocationURI: [URI.file('/folder/file')], isExtensionDevelopment: true });
        return testNoPromptOrRecommendationsForValidRecommendations(mockTestData.validRecommendedExtensions);
    }));
    test('ExtensionRecommendationsService: No workspace recommendations or prompts when extensions.json has empty array', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        return testNoPromptForValidRecommendations([]);
    }));
    test('ExtensionRecommendationsService: Prompt for valid workspace recommendations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
    test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if they are already installed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', mockExtensionLocal);
        return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
    }));
    test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations with casing mismatch if they are already installed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', mockExtensionLocal);
        return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions.map(x => x.toUpperCase()));
    }));
    test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        testConfigurationService.setUserConfiguration(ConfigurationKey, { ignoreRecommendations: true });
        return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
    }));
    test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if showRecommendationsOnlyOnDemand is set', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        testConfigurationService.setUserConfiguration(ConfigurationKey, { showRecommendationsOnlyOnDemand: true });
        return setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions).then(() => {
            testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
            return testObject.activationPromise.then(() => {
                assert.ok(!prompted);
            });
        });
    }));
    test('ExtensionRecommendationsService: No Prompt for valid workspace recommendations if ignoreRecommendations is set for current workspace', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        instantiationService.get(IStorageService).store('extensionsAssistant/workspaceRecommendationsIgnore', true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        return testNoPromptForValidRecommendations(mockTestData.validRecommendedExtensions);
    }));
    test('ExtensionRecommendationsService: No Recommendations of globally ignored recommendations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        instantiationService.get(IStorageService).store('extensionsAssistant/workspaceRecommendationsIgnore', true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', '["ms-dotnettools.csharp", "ms-python.python", "ms-vscode.vscode-typescript-tslint-plugin"]', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        instantiationService.get(IStorageService).store('extensionsAssistant/ignored_recommendations', '["ms-dotnettools.csharp", "mockpublisher2.mockextension2"]', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
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
    test('ExtensionRecommendationsService: No Recommendations of workspace ignored recommendations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const ignoredRecommendations = ['ms-dotnettools.csharp', 'mockpublisher2.mockextension2']; // ignore a stored recommendation and a workspace recommendation.
        const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
        instantiationService.get(IStorageService).store('extensionsAssistant/workspaceRecommendationsIgnore', true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', storedRecommendations, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
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
    test('ExtensionRecommendationsService: Able to retrieve collection of all ignored recommendations', async () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const storageService = instantiationService.get(IStorageService);
        const workspaceIgnoredRecommendations = ['ms-dotnettools.csharp']; // ignore a stored recommendation and a workspace recommendation.
        const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
        const globallyIgnoredRecommendations = '["mockpublisher2.mockextension2"]'; // ignore a workspace recommendation.
        storageService.store('extensionsAssistant/workspaceRecommendationsIgnore', true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('extensionsAssistant/recommendations', storedRecommendations, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('extensionsAssistant/ignored_recommendations', globallyIgnoredRecommendations, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        await setUpFolderWorkspace('myFolder', mockTestData.validRecommendedExtensions, workspaceIgnoredRecommendations);
        testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
        await testObject.activationPromise;
        const recommendations = testObject.getAllRecommendationsWithReason();
        assert.deepStrictEqual(Object.keys(recommendations), ['ms-python.python', 'mockpublisher1.mockextension1']);
    }));
    test('ExtensionRecommendationsService: Able to dynamically ignore/unignore global recommendations', async () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const storageService = instantiationService.get(IStorageService);
        const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python"]';
        const globallyIgnoredRecommendations = '["mockpublisher2.mockextension2"]'; // ignore a workspace recommendation.
        storageService.store('extensionsAssistant/workspaceRecommendationsIgnore', true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('extensionsAssistant/recommendations', storedRecommendations, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('extensionsAssistant/ignored_recommendations', globallyIgnoredRecommendations, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
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
    test('test global extensions are modified and recommendation change event is fired when an extension is ignored', async () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const storageService = instantiationService.get(IStorageService);
        const changeHandlerTarget = sinon.spy();
        const ignoredExtensionId = 'Some.Extension';
        storageService.store('extensionsAssistant/workspaceRecommendationsIgnore', true, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storageService.store('extensionsAssistant/ignored_recommendations', '["ms-vscode.vscode"]', 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        await setUpFolderWorkspace('myFolder', []);
        testObject = disposableStore.add(instantiationService.createInstance(ExtensionRecommendationsService));
        const extensionIgnoredRecommendationsService = instantiationService.get(IExtensionIgnoredRecommendationsService);
        disposableStore.add(extensionIgnoredRecommendationsService.onDidChangeGlobalIgnoredRecommendation(changeHandlerTarget));
        extensionIgnoredRecommendationsService.toggleGlobalIgnoredRecommendation(ignoredExtensionId, true);
        await testObject.activationPromise;
        assert.ok(changeHandlerTarget.calledOnce);
        assert.ok(changeHandlerTarget.getCall(0).calledWithMatch({ extensionId: ignoredExtensionId.toLowerCase(), isRecommended: false }));
    }));
    test('ExtensionRecommendationsService: Get file based recommendations from storage (old format)', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
        const storedRecommendations = '["ms-dotnettools.csharp", "ms-python.python", "ms-vscode.vscode-typescript-tslint-plugin"]';
        instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', storedRecommendations, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
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
        instantiationService.get(IStorageService).store('extensionsAssistant/recommendations', storedRecommendations, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssSUFBSSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFDTix3QkFBd0IsRUFBOEMsMkJBQTJCLEVBQUUscUJBQXFCLEVBQUUsaUJBQWlCLEdBQzNJLE1BQU0sMkVBQTJFLENBQUM7QUFDbkYsT0FBTyxFQUFFLG9DQUFvQyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0sd0VBQXdFLENBQUM7QUFDcEssT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDeEgsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztB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