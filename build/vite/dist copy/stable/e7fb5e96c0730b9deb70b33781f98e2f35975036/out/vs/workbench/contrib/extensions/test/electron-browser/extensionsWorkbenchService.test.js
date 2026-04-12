/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as sinon from 'sinon';
import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { AutoCheckUpdatesConfigurationKey, AutoUpdateConfigurationKey } from '../../common/extensions.js';
import { ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, getTargetPlatform } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { anExtensionManagementServerService, TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestExtensionTipsService, TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ProgressService } from '../../../../services/progress/browser/progressService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { URI } from '../../../../../base/common/uri.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../../../../services/remote/electron-browser/remoteAgentService.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { TestContextService, TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
suite('ExtensionsWorkbenchServiceTest', () => {
    let instantiationService;
    let testObject;
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    let installEvent, didInstallEvent, uninstallEvent, didUninstallEvent;
    setup(async () => {
        disposableStore.add(toDisposable(() => sinon.restore()));
        installEvent = disposableStore.add(new Emitter());
        didInstallEvent = disposableStore.add(new Emitter());
        uninstallEvent = disposableStore.add(new Emitter());
        didUninstallEvent = disposableStore.add(new Emitter());
        instantiationService = disposableStore.add(new TestInstantiationService());
        instantiationService.stub(ITelemetryService, NullTelemetryService);
        instantiationService.stub(ILogService, NullLogService);
        instantiationService.stub(IFileService, disposableStore.add(new FileService(new NullLogService())));
        instantiationService.stub(IProgressService, ProgressService);
        instantiationService.stub(IProductService, TestProductService);
        instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
        instantiationService.stub(IURLService, NativeURLService);
        instantiationService.stub(ISharedProcessService, TestSharedProcessService);
        instantiationService.stub(IContextKeyService, new MockContextKeyService());
        instantiationService.stub(IWorkspaceContextService, new TestContextService());
        stubConfiguration();
        instantiationService.stub(IRemoteAgentService, RemoteAgentService);
        instantiationService.stub(IUserDataProfileService, disposableStore.add(new UserDataProfileService(toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache')))));
        instantiationService.stub(IWorkbenchExtensionManagementService, {
            onDidInstallExtensions: didInstallEvent.event,
            // eslint-disable-next-line local/code-no-any-casts
            onInstallExtension: installEvent.event,
            // eslint-disable-next-line local/code-no-any-casts
            onUninstallExtension: uninstallEvent.event,
            // eslint-disable-next-line local/code-no-any-casts
            onDidUninstallExtension: didUninstallEvent.event,
            onDidUpdateExtensionMetadata: Event.None,
            onDidChangeProfile: Event.None,
            onProfileAwareDidInstallExtensions: Event.None,
            async getInstalled() { return []; },
            async getInstalledWorkspaceExtensions() { return []; },
            async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
            async updateMetadata(local, metadata) {
                local.identifier.uuid = metadata.id;
                local.publisherDisplayName = metadata.publisherDisplayName;
                local.publisherId = metadata.publisherId;
                return local;
            },
            async canInstall() { return true; },
            getTargetPlatform: async () => getTargetPlatform(platform, arch),
            async resetPinnedStateForAllUserExtensions(pinned) { }
        });
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService({
            id: 'local',
            label: 'local',
            extensionManagementService: instantiationService.get(IExtensionManagementService),
        }, null, null));
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        instantiationService.stub(ILifecycleService, disposableStore.add(new TestLifecycleService()));
        instantiationService.stub(IExtensionTipsService, disposableStore.add(instantiationService.createInstance(TestExtensionTipsService)));
        instantiationService.stub(IExtensionRecommendationsService, {});
        instantiationService.stub(INotificationService, { prompt: () => null });
        instantiationService.stub(IExtensionService, {
            onDidChangeExtensions: Event.None,
            extensions: [],
            canAddExtension(extension) { return false; },
            canRemoveExtension(extension) { return false; },
            async whenInstalledExtensionsRegistered() { return true; }
        });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', []);
        instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
        instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', []);
        instantiationService.stubPromise(INotificationService, 'prompt', 0);
        instantiationService.get(IWorkbenchExtensionEnablementService).reset();
        instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
        instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
    });
    test('test gallery extension', async () => {
        const expected = aGalleryExtension('expectedName', {
            displayName: 'expectedDisplayName',
            version: '1.5.0',
            publisherId: 'expectedPublisherId',
            publisher: 'expectedPublisher',
            publisherDisplayName: 'expectedPublisherDisplayName',
            description: 'expectedDescription',
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
        });
        testObject = await aWorkbenchService();
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(expected));
        return testObject.queryGallery(CancellationToken.None).then(pagedResponse => {
            assert.strictEqual(1, pagedResponse.firstPage.length);
            const actual = pagedResponse.firstPage[0];
            assert.strictEqual(1 /* ExtensionType.User */, actual.type);
            assert.strictEqual('expectedName', actual.name);
            assert.strictEqual('expectedDisplayName', actual.displayName);
            assert.strictEqual('expectedpublisher.expectedname', actual.identifier.id);
            assert.strictEqual('expectedPublisher', actual.publisher);
            assert.strictEqual('expectedPublisherDisplayName', actual.publisherDisplayName);
            assert.strictEqual('1.5.0', actual.version);
            assert.strictEqual('1.5.0', actual.latestVersion);
            assert.strictEqual('expectedDescription', actual.description);
            assert.strictEqual('uri:icon', actual.iconUrl);
            assert.strictEqual('fallback:icon', actual.iconUrlFallback);
            assert.strictEqual('uri:license', actual.licenseUrl);
            assert.strictEqual(3 /* ExtensionState.Uninstalled */, actual.state);
            assert.strictEqual(1000, actual.installCount);
            assert.strictEqual(4, actual.rating);
            assert.strictEqual(100, actual.ratingCount);
            assert.strictEqual(false, actual.outdated);
            assert.deepStrictEqual(['pub.1', 'pub.2'], actual.dependencies);
        });
    });
    test('test for empty installed extensions', async () => {
        testObject = await aWorkbenchService();
        assert.deepStrictEqual([], testObject.local);
    });
    test('test for installed extensions', async () => {
        const expected1 = aLocalExtension('local1', {
            publisher: 'localPublisher1',
            version: '1.1.0',
            displayName: 'localDisplayName1',
            description: 'localDescription1',
            icon: 'localIcon1',
            extensionDependencies: ['pub.1', 'pub.2'],
        }, {
            type: 1 /* ExtensionType.User */,
            readmeUrl: 'localReadmeUrl1',
            changelogUrl: 'localChangelogUrl1',
            location: URI.file('localPath1')
        });
        const expected2 = aLocalExtension('local2', {
            publisher: 'localPublisher2',
            version: '1.2.0',
            displayName: 'localDisplayName2',
            description: 'localDescription2',
        }, {
            type: 0 /* ExtensionType.System */,
            readmeUrl: 'localReadmeUrl2',
            changelogUrl: 'localChangelogUrl2',
        });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [expected1, expected2]);
        testObject = await aWorkbenchService();
        const actuals = testObject.local;
        assert.strictEqual(2, actuals.length);
        let actual = actuals[0];
        assert.strictEqual(1 /* ExtensionType.User */, actual.type);
        assert.strictEqual('local1', actual.name);
        assert.strictEqual('localDisplayName1', actual.displayName);
        assert.strictEqual('localpublisher1.local1', actual.identifier.id);
        assert.strictEqual('localPublisher1', actual.publisher);
        assert.strictEqual('1.1.0', actual.version);
        assert.strictEqual('1.1.0', actual.latestVersion);
        assert.strictEqual('localDescription1', actual.description);
        assert.ok(actual.iconUrl === 'file:///localPath1/localIcon1' || actual.iconUrl === 'vscode-file://vscode-app/localPath1/localIcon1');
        assert.ok(actual.iconUrlFallback === undefined);
        assert.strictEqual(undefined, actual.licenseUrl);
        assert.strictEqual(1 /* ExtensionState.Installed */, actual.state);
        assert.strictEqual(undefined, actual.installCount);
        assert.strictEqual(undefined, actual.rating);
        assert.strictEqual(undefined, actual.ratingCount);
        assert.strictEqual(false, actual.outdated);
        assert.deepStrictEqual(['pub.1', 'pub.2'], actual.dependencies);
        actual = actuals[1];
        assert.strictEqual(0 /* ExtensionType.System */, actual.type);
        assert.strictEqual('local2', actual.name);
        assert.strictEqual('localDisplayName2', actual.displayName);
        assert.strictEqual('localpublisher2.local2', actual.identifier.id);
        assert.strictEqual('localPublisher2', actual.publisher);
        assert.strictEqual('1.2.0', actual.version);
        assert.strictEqual('1.2.0', actual.latestVersion);
        assert.strictEqual('localDescription2', actual.description);
        assert.strictEqual(undefined, actual.licenseUrl);
        assert.strictEqual(1 /* ExtensionState.Installed */, actual.state);
        assert.strictEqual(undefined, actual.installCount);
        assert.strictEqual(undefined, actual.rating);
        assert.strictEqual(undefined, actual.ratingCount);
        assert.strictEqual(false, actual.outdated);
        assert.deepStrictEqual([], actual.dependencies);
    });
    test('test installed extensions get syncs with gallery', async () => {
        const local1 = aLocalExtension('local1', {
            publisher: 'localPublisher1',
            version: '1.1.0',
            displayName: 'localDisplayName1',
            description: 'localDescription1',
            icon: 'localIcon1',
            extensionDependencies: ['pub.1', 'pub.2'],
        }, {
            type: 1 /* ExtensionType.User */,
            readmeUrl: 'localReadmeUrl1',
            changelogUrl: 'localChangelogUrl1',
            location: URI.file('localPath1')
        });
        const local2 = aLocalExtension('local2', {
            publisher: 'localPublisher2',
            version: '1.2.0',
            displayName: 'localDisplayName2',
            description: 'localDescription2',
        }, {
            type: 0 /* ExtensionType.System */,
            readmeUrl: 'localReadmeUrl2',
            changelogUrl: 'localChangelogUrl2',
        });
        const gallery1 = aGalleryExtension(local1.manifest.name, {
            identifier: local1.identifier,
            displayName: 'expectedDisplayName',
            version: '1.5.0',
            publisherId: 'expectedPublisherId',
            publisher: local1.manifest.publisher,
            publisherDisplayName: 'expectedPublisherDisplayName',
            description: 'expectedDescription',
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
        });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local1, local2]);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery1));
        instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery1);
        instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery1]);
        testObject = await aWorkbenchService();
        await testObject.queryLocal();
        return Event.toPromise(testObject.onChange).then(() => {
            const actuals = testObject.local;
            assert.strictEqual(2, actuals.length);
            let actual = actuals[0];
            assert.strictEqual(1 /* ExtensionType.User */, actual.type);
            assert.strictEqual('local1', actual.name);
            assert.strictEqual('expectedDisplayName', actual.displayName);
            assert.strictEqual('localpublisher1.local1', actual.identifier.id);
            assert.strictEqual('localPublisher1', actual.publisher);
            assert.strictEqual('1.1.0', actual.version);
            assert.strictEqual('1.5.0', actual.latestVersion);
            assert.strictEqual('expectedDescription', actual.description);
            assert.strictEqual('uri:icon', actual.iconUrl);
            assert.strictEqual('fallback:icon', actual.iconUrlFallback);
            assert.strictEqual(1 /* ExtensionState.Installed */, actual.state);
            assert.strictEqual('uri:license', actual.licenseUrl);
            assert.strictEqual(1000, actual.installCount);
            assert.strictEqual(4, actual.rating);
            assert.strictEqual(100, actual.ratingCount);
            assert.strictEqual(true, actual.outdated);
            assert.deepStrictEqual(['pub.1'], actual.dependencies);
            actual = actuals[1];
            assert.strictEqual(0 /* ExtensionType.System */, actual.type);
            assert.strictEqual('local2', actual.name);
            assert.strictEqual('localDisplayName2', actual.displayName);
            assert.strictEqual('localpublisher2.local2', actual.identifier.id);
            assert.strictEqual('localPublisher2', actual.publisher);
            assert.strictEqual('1.2.0', actual.version);
            assert.strictEqual('1.2.0', actual.latestVersion);
            assert.strictEqual('localDescription2', actual.description);
            assert.strictEqual(undefined, actual.licenseUrl);
            assert.strictEqual(1 /* ExtensionState.Installed */, actual.state);
            assert.strictEqual(undefined, actual.installCount);
            assert.strictEqual(undefined, actual.rating);
            assert.strictEqual(undefined, actual.ratingCount);
            assert.strictEqual(false, actual.outdated);
            assert.deepStrictEqual([], actual.dependencies);
        });
    });
    test('test extension state computation', async () => {
        const gallery = aGalleryExtension('gallery1');
        testObject = await aWorkbenchService();
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        return testObject.queryGallery(CancellationToken.None).then(page => {
            const extension = page.firstPage[0];
            assert.strictEqual(3 /* ExtensionState.Uninstalled */, extension.state);
            const identifier = gallery.identifier;
            // Installing
            installEvent.fire({ identifier, source: gallery, profileLocation: null });
            const local = testObject.local;
            assert.strictEqual(1, local.length);
            const actual = local[0];
            assert.strictEqual(`${gallery.publisher}.${gallery.name}`, actual.identifier.id);
            assert.strictEqual(0 /* ExtensionState.Installing */, actual.state);
            // Installed
            didInstallEvent.fire([{ identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension(gallery.name, gallery, { identifier }), profileLocation: null }]);
            assert.strictEqual(1 /* ExtensionState.Installed */, actual.state);
            assert.strictEqual(1, testObject.local.length);
            testObject.uninstall(actual);
            // Uninstalling
            uninstallEvent.fire({ identifier, profileLocation: null });
            assert.strictEqual(2 /* ExtensionState.Uninstalling */, actual.state);
            // Uninstalled
            didUninstallEvent.fire({ identifier, profileLocation: null });
            assert.strictEqual(3 /* ExtensionState.Uninstalled */, actual.state);
            assert.strictEqual(0, testObject.local.length);
        });
    });
    test('test extension doesnot show outdated for system extensions', async () => {
        const local = aLocalExtension('a', { version: '1.0.1' }, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { identifier: local.identifier, version: '1.0.2' })));
        testObject = await aWorkbenchService();
        await testObject.queryLocal();
        assert.ok(!testObject.local[0].outdated);
    });
    test('test canInstall returns false for extensions with out gallery', async () => {
        const local = aLocalExtension('a', { version: '1.0.1' }, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        testObject = await aWorkbenchService();
        const target = testObject.local[0];
        testObject.uninstall(target);
        uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        assert.ok(await testObject.canInstall(target) !== true);
    });
    test('test canInstall returns false for a system extension', async () => {
        const local = aLocalExtension('a', { version: '1.0.1' }, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension(local.manifest.name, { identifier: local.identifier })));
        testObject = await aWorkbenchService();
        const target = testObject.local[0];
        assert.ok(await testObject.canInstall(target) !== true);
    });
    test('test canInstall returns true for extensions with gallery', async () => {
        const local = aLocalExtension('a', { version: '1.0.1' }, { type: 1 /* ExtensionType.User */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const gallery = aGalleryExtension(local.manifest.name, { identifier: local.identifier });
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
        instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
        testObject = await aWorkbenchService();
        const target = testObject.local[0];
        await Event.toPromise(Event.filter(testObject.onChange, e => !!e?.gallery));
        assert.equal(await testObject.canInstall(target), true);
    });
    test('test onchange event is triggered while installing', async () => {
        const gallery = aGalleryExtension('gallery1');
        testObject = await aWorkbenchService();
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const page = await testObject.queryGallery(CancellationToken.None);
        const extension = page.firstPage[0];
        assert.strictEqual(3 /* ExtensionState.Uninstalled */, extension.state);
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        const promise = Event.toPromise(testObject.onChange);
        // Installed
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension(gallery.name, gallery, gallery), profileLocation: null }]);
        await promise;
    });
    test('test onchange event is triggered when installation is finished', async () => {
        const gallery = aGalleryExtension('gallery1');
        testObject = await aWorkbenchService();
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const target = sinon.spy();
        return testObject.queryGallery(CancellationToken.None).then(page => {
            const extension = page.firstPage[0];
            assert.strictEqual(3 /* ExtensionState.Uninstalled */, extension.state);
            disposableStore.add(testObject.onChange(target));
            // Installing
            installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
            assert.ok(target.calledOnce);
        });
    });
    test('test onchange event is triggered while uninstalling', async () => {
        const local = aLocalExtension('a', {}, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        testObject = await aWorkbenchService();
        const target = sinon.spy();
        testObject.uninstall(testObject.local[0]);
        disposableStore.add(testObject.onChange(target));
        uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        assert.ok(target.calledOnce);
    });
    test('test onchange event is triggered when uninstalling is finished', async () => {
        const local = aLocalExtension('a', {}, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        testObject = await aWorkbenchService();
        const target = sinon.spy();
        testObject.uninstall(testObject.local[0]);
        uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        disposableStore.add(testObject.onChange(target));
        didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        assert.ok(target.calledOnce);
    });
    test('test uninstalled extensions are always enabled', async () => {
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            testObject = await aWorkbenchService();
            instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
            return testObject.queryGallery(CancellationToken.None).then(pagedResponse => {
                const actual = pagedResponse.firstPage[0];
                assert.strictEqual(actual.enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test enablement state installed enabled extension', async () => {
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
            testObject = await aWorkbenchService();
            const actual = testObject.local[0];
            assert.strictEqual(actual.enablementState, 12 /* EnablementState.EnabledGlobally */);
        });
    });
    test('test workspace disabled extension', async () => {
        const extensionA = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('d')], 10 /* EnablementState.DisabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 11 /* EnablementState.DisabledWorkspace */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('e')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA]);
            testObject = await aWorkbenchService();
            const actual = testObject.local[0];
            assert.strictEqual(actual.enablementState, 11 /* EnablementState.DisabledWorkspace */);
        });
    });
    test('test globally disabled extension', async () => {
        const localExtension = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('d')], 10 /* EnablementState.DisabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
            testObject = await aWorkbenchService();
            const actual = testObject.local[0];
            assert.strictEqual(actual.enablementState, 10 /* EnablementState.DisabledGlobally */);
        });
    });
    test('test enablement state is updated for user extensions', async () => {
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 11 /* EnablementState.DisabledWorkspace */)
                .then(() => {
                const actual = testObject.local[0];
                assert.strictEqual(actual.enablementState, 11 /* EnablementState.DisabledWorkspace */);
            });
        });
    });
    test('test enable extension globally when extension is disabled for workspace', async () => {
        const localExtension = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], 11 /* EnablementState.DisabledWorkspace */)
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 12 /* EnablementState.EnabledGlobally */)
                .then(() => {
                const actual = testObject.local[0];
                assert.strictEqual(actual.enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test disable extension globally', async () => {
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
        testObject = await aWorkbenchService();
        return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            const actual = testObject.local[0];
            assert.strictEqual(actual.enablementState, 10 /* EnablementState.DisabledGlobally */);
        });
    });
    test('test system extensions can be disabled', async () => {
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a', {}, { type: 0 /* ExtensionType.System */ })]);
        testObject = await aWorkbenchService();
        return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            const actual = testObject.local[0];
            assert.strictEqual(actual.enablementState, 10 /* EnablementState.DisabledGlobally */);
        });
    });
    test('test enablement state is updated on change from outside', async () => {
        const localExtension = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
            testObject = await aWorkbenchService();
            return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                const actual = testObject.local[0];
                assert.strictEqual(actual.enablementState, 10 /* EnablementState.DisabledGlobally */);
            });
        });
    });
    test('test disable extension with dependencies disable only itself', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test disable extension pack disables the pack', async () => {
        const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 10 /* EnablementState.DisabledGlobally */);
            });
        });
    });
    test('test disable extension pack disable all', async () => {
        const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 10 /* EnablementState.DisabledGlobally */);
            });
        });
    });
    test('test disable extension fails if extension is a dependent of other', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        instantiationService.stub(INotificationService, {
            prompt(severity, message, choices, options) {
                options.onCancel();
                return null;
            }
        });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[1], 10 /* EnablementState.DisabledGlobally */).then(() => assert.fail('Should fail'), error => assert.ok(true));
        });
    });
    test('test disable extension disables all dependents when chosen to disable all', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        instantiationService.stub(IDialogService, {
            prompt() {
                return Promise.resolve({ result: true });
            }
        });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            await testObject.setEnablement(testObject.local[1], 10 /* EnablementState.DisabledGlobally */);
            assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
            assert.strictEqual(testObject.local[1].enablementState, 10 /* EnablementState.DisabledGlobally */);
        });
    });
    test('test disable extension when extension is part of a pack', async () => {
        const extensionA = aLocalExtension('a', { extensionPack: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[1], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[1].enablementState, 10 /* EnablementState.DisabledGlobally */);
            });
        });
    });
    test('test disable both dependency and dependent do not promot and do not fail', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            const target = sinon.spy();
            testObject = await aWorkbenchService();
            return testObject.setEnablement([testObject.local[1], testObject.local[0]], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                assert.ok(!target.called);
                assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 10 /* EnablementState.DisabledGlobally */);
            });
        });
    });
    test('test enable both dependency and dependent do not promot and do not fail', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 10 /* EnablementState.DisabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 10 /* EnablementState.DisabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            const target = sinon.spy();
            testObject = await aWorkbenchService();
            return testObject.setEnablement([testObject.local[1], testObject.local[0]], 12 /* EnablementState.EnabledGlobally */)
                .then(() => {
                assert.ok(!target.called);
                assert.strictEqual(testObject.local[0].enablementState, 12 /* EnablementState.EnabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test disable extension does not fail if its dependency is a dependent of other but chosen to disable only itself', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
            });
        });
    });
    test('test disable extension if its dependency is a dependent of other disabled extension', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 10 /* EnablementState.DisabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
            });
        });
    });
    test('test disable extension if its dependencys dependency is itself', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.a'] });
        const extensionC = aLocalExtension('c');
        instantiationService.stub(INotificationService, {
            prompt(severity, message, choices, options) {
                options.onCancel();
                return null;
            }
        });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => assert.fail('An extension with dependent should not be disabled'), () => null);
        });
    });
    test('test disable extension if its dependency is dependent and is disabled', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.b'] });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 10 /* EnablementState.DisabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => assert.strictEqual(testObject.local[0].enablementState, 10 /* EnablementState.DisabledGlobally */));
        });
    });
    test('test disable extension with cyclic dependencies', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.c'] });
        const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.a'] });
        instantiationService.stub(INotificationService, {
            prompt(severity, message, choices, options) {
                options.onCancel();
                return null;
            }
        });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 12 /* EnablementState.EnabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 12 /* EnablementState.EnabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => assert.fail('An extension with dependent should not be disabled'), () => null);
        });
    });
    test('test enable extension with dependencies enable all', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 10 /* EnablementState.DisabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 10 /* EnablementState.DisabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 12 /* EnablementState.EnabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[0].enablementState, 12 /* EnablementState.EnabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test enable extension with dependencies does not prompt if dependency is enabled already', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 12 /* EnablementState.EnabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 10 /* EnablementState.DisabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            const target = sinon.spy();
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 12 /* EnablementState.EnabledGlobally */)
                .then(() => {
                assert.ok(!target.called);
                assert.strictEqual(testObject.local[0].enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test enable extension with dependency does not prompt if both are enabled', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b');
        const extensionC = aLocalExtension('c');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 10 /* EnablementState.DisabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 10 /* EnablementState.DisabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            const target = sinon.spy();
            testObject = await aWorkbenchService();
            return testObject.setEnablement([testObject.local[1], testObject.local[0]], 12 /* EnablementState.EnabledGlobally */)
                .then(() => {
                assert.ok(!target.called);
                assert.strictEqual(testObject.local[0].enablementState, 12 /* EnablementState.EnabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test enable extension with cyclic dependencies', async () => {
        const extensionA = aLocalExtension('a', { extensionDependencies: ['pub.b'] });
        const extensionB = aLocalExtension('b', { extensionDependencies: ['pub.c'] });
        const extensionC = aLocalExtension('c', { extensionDependencies: ['pub.a'] });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionA], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionB], 10 /* EnablementState.DisabledGlobally */))
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([extensionC], 10 /* EnablementState.DisabledGlobally */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extensionA, extensionB, extensionC]);
            testObject = await aWorkbenchService();
            return testObject.setEnablement(testObject.local[0], 12 /* EnablementState.EnabledGlobally */)
                .then(() => {
                assert.strictEqual(testObject.local[0].enablementState, 12 /* EnablementState.EnabledGlobally */);
                assert.strictEqual(testObject.local[1].enablementState, 12 /* EnablementState.EnabledGlobally */);
                assert.strictEqual(testObject.local[2].enablementState, 12 /* EnablementState.EnabledGlobally */);
            });
        });
    });
    test('test change event is fired when disablement flags are changed', async () => {
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [aLocalExtension('a')]);
            testObject = await aWorkbenchService();
            const target = sinon.spy();
            disposableStore.add(testObject.onChange(target));
            return testObject.setEnablement(testObject.local[0], 10 /* EnablementState.DisabledGlobally */)
                .then(() => assert.ok(target.calledOnce));
        });
    });
    test('test change event is fired when disablement flags are changed from outside', async () => {
        const localExtension = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('c')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([aLocalExtension('b')], 11 /* EnablementState.DisabledWorkspace */))
            .then(async () => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localExtension]);
            testObject = await aWorkbenchService();
            const target = sinon.spy();
            disposableStore.add(testObject.onChange(target));
            return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], 10 /* EnablementState.DisabledGlobally */)
                .then(() => assert.ok(target.calledOnce));
        });
    });
    test('test updating an extension does not re-eanbles it when disabled globally', async () => {
        testObject = await aWorkbenchService();
        const local = aLocalExtension('pub.a');
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */);
        didInstallEvent.fire([{ local, identifier: local.identifier, operation: 3 /* InstallOperation.Update */, profileLocation: null }]);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
    });
    test('test updating an extension does not re-eanbles it when workspace disabled', async () => {
        testObject = await aWorkbenchService();
        const local = aLocalExtension('pub.a');
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 11 /* EnablementState.DisabledWorkspace */);
        didInstallEvent.fire([{ local, identifier: local.identifier, operation: 3 /* InstallOperation.Update */, profileLocation: null }]);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual[0].enablementState, 11 /* EnablementState.DisabledWorkspace */);
    });
    test('test user extension is preferred when the same extension exists as system and user extension', async () => {
        testObject = await aWorkbenchService();
        const userExtension = aLocalExtension('pub.a');
        const systemExtension = aLocalExtension('pub.a', {}, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [systemExtension, userExtension]);
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, userExtension);
    });
    test('test user extension is disabled when the same extension exists as system and user extension and system extension is disabled', async () => {
        testObject = await aWorkbenchService();
        const systemExtension = aLocalExtension('pub.a', {}, { type: 0 /* ExtensionType.System */ });
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([systemExtension], 10 /* EnablementState.DisabledGlobally */);
        const userExtension = aLocalExtension('pub.a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [systemExtension, userExtension]);
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, userExtension);
        assert.strictEqual(actual[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
    });
    test('Test local ui extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['ui'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local workspace extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local web extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['web'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local ui,workspace extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['ui', 'workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local workspace,ui extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['workspace', 'ui'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local ui,workspace,web extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['ui', 'workspace', 'web'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local ui,web,workspace extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['ui', 'web', 'workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local web,ui,workspace extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['web', 'ui', 'workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local web,workspace,ui extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['web', 'workspace', 'ui'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local workspace,web,ui extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['workspace', 'web', 'ui'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local workspace,ui,web extension is chosen if it exists only in local server', async () => {
        // multi server setup
        const extensionKind = ['workspace', 'ui', 'web'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local UI extension is chosen if it exists in both servers', async () => {
        // multi server setup
        const extensionKind = ['ui'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test local ui,workspace extension is chosen if it exists in both servers', async () => {
        // multi server setup
        const extensionKind = ['ui', 'workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test remote workspace extension is chosen if it exists in remote server', async () => {
        // multi server setup
        const extensionKind = ['workspace'];
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, remoteExtension);
    });
    test('Test remote workspace extension is chosen if it exists in both servers', async () => {
        // multi server setup
        const extensionKind = ['workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, remoteExtension);
    });
    test('Test remote workspace extension is chosen if it exists in both servers and local is disabled', async () => {
        // multi server setup
        const extensionKind = ['workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([remoteExtension], 10 /* EnablementState.DisabledGlobally */);
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, remoteExtension);
        assert.strictEqual(actual[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
    });
    test('Test remote workspace extension is chosen if it exists in both servers and remote is disabled in workspace', async () => {
        // multi server setup
        const extensionKind = ['workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([remoteExtension], 11 /* EnablementState.DisabledWorkspace */);
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, remoteExtension);
        assert.strictEqual(actual[0].enablementState, 11 /* EnablementState.DisabledWorkspace */);
    });
    test('Test local ui, workspace extension is chosen if it exists in both servers and local is disabled', async () => {
        // multi server setup
        const extensionKind = ['ui', 'workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], 10 /* EnablementState.DisabledGlobally */);
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
        assert.strictEqual(actual[0].enablementState, 10 /* EnablementState.DisabledGlobally */);
    });
    test('Test local ui, workspace extension is chosen if it exists in both servers and local is disabled in workspace', async () => {
        // multi server setup
        const extensionKind = ['ui', 'workspace'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localExtension], 11 /* EnablementState.DisabledWorkspace */);
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
        assert.strictEqual(actual[0].enablementState, 11 /* EnablementState.DisabledWorkspace */);
    });
    test('Test local web extension is chosen if it exists in both servers', async () => {
        // multi server setup
        const extensionKind = ['web'];
        const localExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`) });
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, localExtension);
    });
    test('Test remote web extension is chosen if it exists only in remote', async () => {
        // multi server setup
        const extensionKind = ['web'];
        const remoteExtension = aLocalExtension('a', { extensionKind }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposableStore.add(new TestExtensionEnablementService(instantiationService)));
        testObject = await aWorkbenchService();
        const actual = await testObject.queryLocal();
        assert.strictEqual(actual.length, 1);
        assert.strictEqual(actual[0].local, remoteExtension);
    });
    test('Test disable autoupdate for extension when auto update is enabled for all', async () => {
        const extension1 = aLocalExtension('a');
        const extension2 = aLocalExtension('b');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local, metadata) => {
            local.pinned = !!metadata.pinned;
            return local;
        });
        testObject = await aWorkbenchService();
        assert.strictEqual(testObject.local[0].local?.pinned, undefined);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);
        assert.strictEqual(testObject.local[0].local?.pinned, undefined);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), ['pub.a']);
    });
    test('Test disable autoupdate for extension when auto update is enabled for enabled extensions', async () => {
        stubConfiguration('onlyEnabledExtensions');
        const extension1 = aLocalExtension('a');
        const extension2 = aLocalExtension('b');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local, metadata) => {
            local.pinned = !!metadata.pinned;
            return local;
        });
        testObject = await aWorkbenchService();
        assert.strictEqual(testObject.local[0].local?.pinned, undefined);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);
        assert.strictEqual(testObject.local[0].local?.pinned, undefined);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), ['pub.a']);
    });
    test('Test enable autoupdate for extension when auto update is enabled for all', async () => {
        const extension1 = aLocalExtension('a');
        const extension2 = aLocalExtension('b');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local, metadata) => {
            local.pinned = !!metadata.pinned;
            return local;
        });
        testObject = await aWorkbenchService();
        assert.strictEqual(testObject.local[0].local?.pinned, undefined);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);
        assert.strictEqual(testObject.local[0].local?.pinned, undefined);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
    });
    test('Test enable autoupdate for pinned extension when auto update is enabled', async () => {
        const extension1 = aLocalExtension('a', undefined, { pinned: true });
        const extension2 = aLocalExtension('b');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local, metadata) => {
            local.pinned = !!metadata.pinned;
            return local;
        });
        testObject = await aWorkbenchService();
        assert.strictEqual(testObject.local[0].local?.pinned, true);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);
        assert.strictEqual(testObject.local[0].local?.pinned, false);
        assert.strictEqual(testObject.local[1].local?.pinned, undefined);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
    });
    test('Test updateAutoUpdateEnablementFor throws error when auto update is disabled', async () => {
        stubConfiguration(false);
        const extension1 = aLocalExtension('a');
        const extension2 = aLocalExtension('b');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        testObject = await aWorkbenchService();
        try {
            await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);
            assert.fail('error expected');
        }
        catch (error) {
            // expected
        }
    });
    test('Test updateAutoUpdateEnablementFor throws error for publisher when auto update is enabled', async () => {
        const extension1 = aLocalExtension('a');
        const extension2 = aLocalExtension('b');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        testObject = await aWorkbenchService();
        try {
            await testObject.updateAutoUpdateEnablementFor(testObject.local[0].publisher, true);
            assert.fail('error expected');
        }
        catch (error) {
            // expected
        }
    });
    test('Test enable autoupdate for extension when auto update is disabled', async () => {
        stubConfiguration(false);
        const extension1 = aLocalExtension('a', undefined, { pinned: true });
        const extension2 = aLocalExtension('b', undefined, { pinned: true });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local, metadata) => {
            local.pinned = !!metadata.pinned;
            return local;
        });
        testObject = await aWorkbenchService();
        assert.strictEqual(testObject.local[0].local?.pinned, true);
        assert.strictEqual(testObject.local[1].local?.pinned, true);
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);
        assert.strictEqual(testObject.local[0].local?.pinned, true);
        assert.strictEqual(testObject.local[1].local?.pinned, true);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), ['pub.a']);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
    });
    test('Test reset autoupdate extensions state when auto update is disabled', async () => {
        instantiationService.stub(IDialogService, {
            confirm: () => Promise.resolve({ confirmed: true })
        });
        const extension1 = aLocalExtension('a', undefined, { pinned: true });
        const extension2 = aLocalExtension('b', undefined, { pinned: true });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local, metadata) => {
            local.pinned = !!metadata.pinned;
            return local;
        });
        testObject = await aWorkbenchService();
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], false);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), ['pub.a']);
        await testObject.updateAutoUpdateForAllExtensions(false);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
    });
    test('Test reset autoupdate extensions state when auto update is enabled', async () => {
        stubConfiguration(false);
        instantiationService.stub(IDialogService, {
            confirm: () => Promise.resolve({ confirmed: true })
        });
        const extension1 = aLocalExtension('a', undefined, { pinned: true });
        const extension2 = aLocalExtension('b', undefined, { pinned: true });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [extension1, extension2]);
        instantiationService.stub(IExtensionManagementService, 'updateMetadata', (local, metadata) => {
            local.pinned = !!metadata.pinned;
            return local;
        });
        testObject = await aWorkbenchService();
        await testObject.updateAutoUpdateEnablementFor(testObject.local[0], true);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), ['pub.a']);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
        await testObject.updateAutoUpdateForAllExtensions(true);
        assert.deepStrictEqual(testObject.getEnabledAutoUpdateExtensions(), []);
        assert.deepStrictEqual(testObject.getDisabledAutoUpdateExtensions(), []);
    });
    async function aWorkbenchService() {
        const workbenchService = disposableStore.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        await workbenchService.queryLocal();
        return workbenchService;
    }
    function stubConfiguration(autoUpdateValue, autoCheckUpdatesValue) {
        const values = {
            [AutoUpdateConfigurationKey]: autoUpdateValue ?? true,
            [AutoCheckUpdatesConfigurationKey]: autoCheckUpdatesValue ?? true
        };
        const emitter = disposableStore.add(new Emitter());
        instantiationService.stub(IConfigurationService, {
            onDidChangeConfiguration: emitter.event,
            getValue: (key) => {
                return key ? values[key] : undefined;
            },
            updateValue: async (key, value) => {
                values[key] = value;
                emitter.fire({
                    affectedKeys: new Set([key]),
                    source: 2 /* ConfigurationTarget.USER */,
                    change: { keys: [], overrides: [] },
                    affectsConfiguration(configuration, overrides) {
                        return true;
                    },
                });
            },
            inspect: (key) => {
                return {};
            }
        });
    }
    function aLocalExtension(name = 'someext', manifest = {}, properties = {}) {
        manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
        properties = {
            type: 1 /* ExtensionType.User */,
            location: URI.file(`pub.${name}`),
            identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
            ...properties,
            isValid: properties.isValid ?? true,
        };
        return Object.create({ manifest, ...properties });
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
        const galleryExtension = Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, isSigned: true, ...properties });
        galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
        galleryExtension.assets = { ...galleryExtension.assets, ...assets };
        galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
        return galleryExtension;
    }
    function aPage(...objects) {
        return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null };
    }
    function aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, remoteExtensionManagementService) {
        const localExtensionManagementServer = {
            id: 'vscode-local',
            label: 'local',
            extensionManagementService: localExtensionManagementService || createExtensionManagementService(),
        };
        const remoteExtensionManagementServer = {
            id: 'vscode-remote',
            label: 'remote',
            extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
        };
        return anExtensionManagementServerService(localExtensionManagementServer, remoteExtensionManagementServer, null);
    }
    function createExtensionManagementService(installed = []) {
        return {
            onInstallExtension: Event.None,
            onDidInstallExtensions: Event.None,
            onUninstallExtension: Event.None,
            onDidUninstallExtension: Event.None,
            onDidChangeProfile: Event.None,
            onDidUpdateExtensionMetadata: Event.None,
            onProfileAwareDidInstallExtensions: Event.None,
            getInstalled: () => Promise.resolve(installed),
            installFromGallery: (extension) => Promise.reject(new Error('not supported')),
            updateMetadata: async (local, metadata, profileLocation) => {
                local.identifier.uuid = metadata.id;
                local.publisherDisplayName = metadata.publisherDisplayName;
                local.publisherId = metadata.publisherId;
                return local;
            },
            getTargetPlatform: async () => getTargetPlatform(platform, arch),
            async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
            async resetPinnedStateForAllUserExtensions(pinned) { }
        };
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvdGVzdC9lbGVjdHJvbi1icm93c2VyL2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQWtCLGdDQUFnQyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekYsT0FBTyxFQUNOLDJCQUEyQixFQUFFLHdCQUF3QixFQUN5QyxxQkFBcUIsRUFBMEIsaUJBQWlCLEVBQzlKLE1BQU0sMkVBQTJFLENBQUM7QUFDbkYsT0FBTyxFQUFFLG9DQUFvQyxFQUFtQixpQ0FBaUMsRUFBdUUsb0NBQW9DLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUM3UixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUNwSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN0SCxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwwRkFBMEYsQ0FBQztBQUM5SyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN4SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7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