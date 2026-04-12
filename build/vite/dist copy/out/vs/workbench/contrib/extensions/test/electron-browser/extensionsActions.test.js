/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IExtensionsWorkbenchService, ExtensionContainers } from '../../common/extensions.js';
import * as ExtensionsActions from '../../browser/extensionsActions.js';
import { ExtensionsWorkbenchService } from '../../browser/extensionsWorkbenchService.js';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService, getTargetPlatform } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { getGalleryExtensionId } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { TestExtensionEnablementService } from '../../../../services/extensionManagement/test/browser/extensionEnablementService.test.js';
import { ExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionGalleryService.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IExtensionService, toExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { TestContextService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { TestExtensionTipsService, TestSharedProcessService } from '../../../../test/electron-browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { NativeURLService } from '../../../../../platform/url/common/urlService.js';
import { URI } from '../../../../../base/common/uri.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../../../../services/remote/electron-browser/remoteAgentService.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { ProgressService } from '../../../../services/progress/browser/progressService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { TestEnvironmentService, TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { UserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSyncEnablementService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { platform } from '../../../../../base/common/platform.js';
import { arch } from '../../../../../base/common/process.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUpdateService, State } from '../../../../../platform/update/common/update.js';
import { IMeteredConnectionService } from '../../../../../platform/meteredConnection/common/meteredConnection.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfileService.js';
import { toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
let instantiationService;
let installEvent, didInstallEvent, uninstallEvent, didUninstallEvent;
function setupTest(disposables) {
    installEvent = disposables.add(new Emitter());
    didInstallEvent = disposables.add(new Emitter());
    uninstallEvent = disposables.add(new Emitter());
    didUninstallEvent = disposables.add(new Emitter());
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IEnvironmentService, TestEnvironmentService);
    instantiationService.stub(IWorkbenchEnvironmentService, TestEnvironmentService);
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(ILogService, NullLogService);
    instantiationService.stub(IWorkspaceContextService, new TestContextService());
    instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IProgressService, ProgressService);
    instantiationService.stub(IProductService, {});
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IExtensionGalleryService, ExtensionGalleryService);
    instantiationService.stub(ISharedProcessService, TestSharedProcessService);
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
        async getTargetPlatform() { return getTargetPlatform(platform, arch); },
    });
    instantiationService.stub(IRemoteAgentService, RemoteAgentService);
    const localExtensionManagementServer = { extensionManagementService: instantiationService.get(IExtensionManagementService), label: 'local', id: 'vscode-local' };
    instantiationService.stub(IExtensionManagementServerService, {
        get localExtensionManagementServer() {
            return localExtensionManagementServer;
        },
        getExtensionManagementServer(extension) {
            if (extension.location.scheme === Schemas.file) {
                return localExtensionManagementServer;
            }
            throw new Error(`Invalid Extension ${extension.location}`);
        }
    });
    instantiationService.stub(IUserDataProfileService, disposables.add(new UserDataProfileService(toUserDataProfile('test', 'test', URI.file('foo'), URI.file('cache')))));
    instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
    instantiationService.stub(ILabelService, { onDidChangeFormatters: disposables.add(new Emitter()).event });
    instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService()));
    instantiationService.stub(IExtensionTipsService, disposables.add(instantiationService.createInstance(TestExtensionTipsService)));
    instantiationService.stub(IExtensionRecommendationsService, {});
    instantiationService.stub(IURLService, NativeURLService);
    instantiationService.stub(IExtensionGalleryService, 'isEnabled', true);
    instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage());
    instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', []);
    instantiationService.stub(IExtensionService, { extensions: [], onDidChangeExtensions: Event.None, canAddExtension: (extension) => false, canRemoveExtension: (extension) => false, whenInstalledExtensionsRegistered: () => Promise.resolve(true) });
    instantiationService.get(IWorkbenchExtensionEnablementService).reset();
    instantiationService.stub(IUserDataSyncEnablementService, disposables.add(instantiationService.createInstance(UserDataSyncEnablementService)));
    instantiationService.stub(IUpdateService, { onStateChange: Event.None, state: State.Uninitialized });
    instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: Event.None });
    instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
    instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
}
suite('ExtensionsActions', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => setupTest(disposables));
    test('Install action is disabled when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
        assert.ok(!testObject.enabled);
    });
    test('Test Install action when state is installed', () => {
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return workbenchService.queryLocal()
            .then(() => {
            instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier })));
            return workbenchService.queryGallery(CancellationToken.None)
                .then((paged) => {
                testObject.extension = paged.firstPage[0];
                assert.ok(!testObject.enabled);
                assert.strictEqual('Install', testObject.label);
                assert.strictEqual('extension-action label prominent install hide', testObject.class);
            });
        });
    });
    test('Test InstallingLabelAction when state is installing', () => {
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallingLabelAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        return workbenchService.queryGallery(CancellationToken.None)
            .then((paged) => {
            testObject.extension = paged.firstPage[0];
            installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
            assert.ok(!testObject.enabled);
            assert.strictEqual('Installing', testObject.label);
            assert.strictEqual('extension-action label install installing', testObject.class);
        });
    });
    test('Test Install action when state is uninstalled', async () => {
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await workbenchService.queryGallery(CancellationToken.None);
        const promise = Event.toPromise(Event.filter(testObject.onDidChange, e => e.enabled === true));
        testObject.extension = paged.firstPage[0];
        await promise;
        assert.ok(testObject.enabled);
        assert.strictEqual('Install', testObject.label);
    });
    test('Test Install action when extension is system action', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', {}, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            testObject.extension = extensions[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Test Install action when extension doesnot has gallery', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.InstallAction, { installPreReleaseVersion: false }));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            testObject.extension = extensions[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Uninstall action is disabled when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        assert.ok(!testObject.enabled);
    });
    test('Test Uninstall action when state is uninstalling', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            assert.ok(!testObject.enabled);
            assert.strictEqual('Uninstalling', testObject.label);
            assert.strictEqual('extension-action label uninstall uninstalling', testObject.class);
        });
    });
    test('Test Uninstall action when state is installed and is user extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            assert.ok(testObject.enabled);
            assert.strictEqual('Uninstall', testObject.label);
            assert.strictEqual('extension-action label uninstall', testObject.class);
        });
    });
    test('Test Uninstall action when state is installed and is system extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', {}, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            assert.ok(!testObject.enabled);
            assert.strictEqual('Uninstall', testObject.label);
            assert.strictEqual('extension-action label uninstall', testObject.class);
        });
    });
    test('Test Uninstall action when state is installing and is user extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const gallery = aGalleryExtension('a');
            const extension = extensions[0];
            extension.gallery = gallery;
            installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
            testObject.extension = extension;
            assert.ok(!testObject.enabled);
        });
    });
    test('Test Uninstall action after extension is installed', async () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UninstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
        testObject.extension = paged.firstPage[0];
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        const promise = Event.toPromise(testObject.onDidChange);
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', gallery, gallery), profileLocation: null }]);
        await promise;
        assert.ok(testObject.enabled);
        assert.strictEqual('Uninstall', testObject.label);
        assert.strictEqual('extension-action label uninstall', testObject.class);
    });
    test('Test UpdateAction when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        assert.ok(!testObject.enabled);
    });
    test('Test UpdateAction when extension is uninstalled', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a', { version: '1.0.0' });
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
            .then((paged) => {
            testObject.extension = paged.firstPage[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Test UpdateAction when extension is installed and not outdated', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', { version: '1.0.0' });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: local.manifest.version })));
            return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
                .then(extensions => assert.ok(!testObject.enabled));
        });
    });
    test('Test UpdateAction when extension is installed outdated and system extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', { version: '1.0.0' }, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' })));
            return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
                .then(extensions => assert.ok(!testObject.enabled));
        });
    });
    test('Test UpdateAction when extension is installed outdated and user extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', { version: '1.0.0' });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        return workbenchService.queryLocal()
            .then(async (extensions) => {
            testObject.extension = extensions[0];
            const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
            instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
            instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
            instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
            assert.ok(!testObject.enabled);
            return new Promise(c => {
                disposables.add(testObject.onDidChange(() => {
                    if (testObject.enabled) {
                        c();
                    }
                }));
                instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
            });
        });
    });
    test('Test UpdateAction when extension is installing and outdated and user extension', async () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.UpdateAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', { version: '1.0.0' });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
        testObject.extension = extensions[0];
        const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.1' });
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        instantiationService.stubPromise(IExtensionGalleryService, 'getCompatibleExtension', gallery);
        instantiationService.stubPromise(IExtensionGalleryService, 'getExtensions', [gallery]);
        await new Promise(c => {
            disposables.add(testObject.onDidChange(() => {
                if (testObject.enabled) {
                    c();
                }
            }));
            instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
        });
        await new Promise(c => {
            disposables.add(testObject.onDidChange(() => {
                if (!testObject.enabled) {
                    c();
                }
            }));
            installEvent.fire({ identifier: local.identifier, source: gallery, profileLocation: null });
        });
    });
    test('Test ManageExtensionAction when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        assert.ok(!testObject.enabled);
    });
    test('Test ManageExtensionAction when extension is installed', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            assert.ok(testObject.enabled);
            assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
            assert.strictEqual('Manage', testObject.tooltip);
        });
    });
    test('Test ManageExtensionAction when extension is uninstalled', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
            .then(page => {
            testObject.extension = page.firstPage[0];
            assert.ok(!testObject.enabled);
            assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
            assert.strictEqual('Manage', testObject.tooltip);
        });
    });
    test('Test ManageExtensionAction when extension is installing', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
            .then(page => {
            testObject.extension = page.firstPage[0];
            installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
            assert.ok(!testObject.enabled);
            assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage hide', testObject.class);
            assert.strictEqual('Manage', testObject.tooltip);
        });
    });
    test('Test ManageExtensionAction when extension is queried from gallery and installed', async () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
        testObject.extension = paged.firstPage[0];
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        const promise = Event.toPromise(testObject.onDidChange);
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', gallery, gallery), profileLocation: null }]);
        await promise;
        assert.ok(testObject.enabled);
        assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
        assert.strictEqual('Manage', testObject.tooltip);
    });
    test('Test ManageExtensionAction when extension is system extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', {}, { type: 0 /* ExtensionType.System */ });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            assert.ok(testObject.enabled);
            assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
            assert.strictEqual('Manage', testObject.tooltip);
        });
    });
    test('Test ManageExtensionAction when extension is uninstalling', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ManageExtensionAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            testObject.extension = extensions[0];
            uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            assert.ok(!testObject.enabled);
            assert.strictEqual('extension-action icon manage codicon codicon-extensions-manage', testObject.class);
            assert.strictEqual('Manage', testObject.tooltip);
        });
    });
    test('Test EnableForWorkspaceAction when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
        assert.ok(!testObject.enabled);
    });
    test('Test EnableForWorkspaceAction when there extension is not disabled', () => {
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
            testObject.extension = extensions[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Test EnableForWorkspaceAction when the extension is disabled globally', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
                testObject.extension = extensions[0];
                assert.ok(testObject.enabled);
            });
        });
    });
    test('Test EnableForWorkspaceAction when extension is disabled for workspace', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
                testObject.extension = extensions[0];
                assert.ok(testObject.enabled);
            });
        });
    });
    test('Test EnableForWorkspaceAction when the extension is disabled globally and workspace', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 11 /* EnablementState.DisabledWorkspace */))
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableForWorkspaceAction));
                testObject.extension = extensions[0];
                assert.ok(testObject.enabled);
            });
        });
    });
    test('Test EnableGloballyAction when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
        assert.ok(!testObject.enabled);
    });
    test('Test EnableGloballyAction when the extension is not disabled', () => {
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
            testObject.extension = extensions[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Test EnableGloballyAction when the extension is disabled for workspace', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
                testObject.extension = extensions[0];
                assert.ok(!testObject.enabled);
            });
        });
    });
    test('Test EnableGloballyAction when the extension is disabled globally', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
                testObject.extension = extensions[0];
                assert.ok(testObject.enabled);
            });
        });
    });
    test('Test EnableGloballyAction when the extension is disabled in both', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 11 /* EnablementState.DisabledWorkspace */))
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableGloballyAction));
                testObject.extension = extensions[0];
                assert.ok(testObject.enabled);
            });
        });
    });
    test('Test EnableAction when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
        assert.ok(!testObject.enabled);
    });
    test('Test EnableDropDownAction when extension is installed and enabled', () => {
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
            testObject.extension = extensions[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Test EnableDropDownAction when extension is installed and disabled globally', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
                testObject.extension = extensions[0];
                assert.ok(testObject.enabled);
            });
        });
    });
    test('Test EnableDropDownAction when extension is installed and disabled for workspace', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
                testObject.extension = extensions[0];
                assert.ok(testObject.enabled);
            });
        });
    });
    test('Test EnableDropDownAction when extension is uninstalled', () => {
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
            .then(page => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
            testObject.extension = page.firstPage[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Test EnableDropDownAction when extension is installing', () => {
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
            .then(page => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
            testObject.extension = page.firstPage[0];
            disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
            installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
            assert.ok(!testObject.enabled);
        });
    });
    test('Test EnableDropDownAction when extension is uninstalling', () => {
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.EnableDropDownAction));
            testObject.extension = extensions[0];
            uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            assert.ok(!testObject.enabled);
        });
    });
    test('Test DisableForWorkspaceAction when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
        assert.ok(!testObject.enabled);
    });
    test('Test DisableForWorkspaceAction when the extension is disabled globally', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
                testObject.extension = extensions[0];
                assert.ok(!testObject.enabled);
            });
        });
    });
    test('Test DisableForWorkspaceAction when the extension is disabled workspace', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
                testObject.extension = extensions[0];
                assert.ok(!testObject.enabled);
            });
        });
    });
    test('Test DisableForWorkspaceAction when extension is enabled', () => {
        const local = aLocalExtension('a');
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(local)],
            onDidChangeExtensions: Event.None,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableForWorkspaceAction));
            testObject.extension = extensions[0];
            assert.ok(testObject.enabled);
        });
    });
    test('Test DisableGloballyAction when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
        assert.ok(!testObject.enabled);
    });
    test('Test DisableGloballyAction when the extension is disabled globally', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
                testObject.extension = extensions[0];
                assert.ok(!testObject.enabled);
            });
        });
    });
    test('Test DisableGloballyAction when the extension is disabled for workspace', () => {
        const local = aLocalExtension('a');
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
                testObject.extension = extensions[0];
                assert.ok(!testObject.enabled);
            });
        });
    });
    test('Test DisableGloballyAction when the extension is enabled', () => {
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(local)],
            onDidChangeExtensions: Event.None,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
            testObject.extension = extensions[0];
            assert.ok(testObject.enabled);
        });
    });
    test('Test DisableGloballyAction when extension is installed and enabled', () => {
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(local)],
            onDidChangeExtensions: Event.None,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
            testObject.extension = extensions[0];
            assert.ok(testObject.enabled);
        });
    });
    test('Test DisableGloballyAction when extension is installed and disabled globally', () => {
        const local = aLocalExtension('a');
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(local)],
            onDidChangeExtensions: Event.None,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        return instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */)
            .then(() => {
            instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
            return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
                .then(extensions => {
                const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
                testObject.extension = extensions[0];
                assert.ok(!testObject.enabled);
            });
        });
    });
    test('Test DisableGloballyAction when extension is uninstalled', () => {
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a'))],
            onDidChangeExtensions: Event.None,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
            .then(page => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
            testObject.extension = page.firstPage[0];
            assert.ok(!testObject.enabled);
        });
    });
    test('Test DisableGloballyAction when extension is installing', () => {
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a'))],
            onDidChangeExtensions: Event.None,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        return instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None)
            .then(page => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
            testObject.extension = page.firstPage[0];
            disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
            installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
            assert.ok(!testObject.enabled);
        });
    });
    test('Test DisableGloballyAction when extension is uninstalling', () => {
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(local)],
            onDidChangeExtensions: Event.None,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        return instantiationService.get(IExtensionsWorkbenchService).queryLocal()
            .then(extensions => {
            const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.DisableGloballyAction));
            testObject.extension = extensions[0];
            disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
            uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
            assert.ok(!testObject.enabled);
        });
    });
});
suite('ExtensionRuntimeStateAction', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => setupTest(disposables));
    test('Test Runtime State when there is no extension', () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension state is installing', async () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = paged.firstPage[0];
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension state is uninstalling', async () => {
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
        testObject.extension = extensions[0];
        uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is newly installed', async () => {
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('b'))],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
        testObject.extension = paged.firstPage[0];
        assert.ok(!testObject.enabled);
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        const promise = Event.toPromise(testObject.onDidChange);
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', gallery, gallery), profileLocation: null }]);
        await promise;
        assert.ok(testObject.enabled);
        assert.strictEqual(testObject.tooltip, `Please restart extensions to enable this extension.`);
    });
    test('Test Runtime State when extension is newly installed and ext host restart is not required', async () => {
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('b'))],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => true,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
        testObject.extension = paged.firstPage[0];
        assert.ok(!testObject.enabled);
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', gallery, gallery), profileLocation: null }]);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is installed and uninstalled', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('b'))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
        testObject.extension = paged.firstPage[0];
        const identifier = gallery.identifier;
        installEvent.fire({ identifier, source: gallery, profileLocation: null });
        didInstallEvent.fire([{ identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', gallery, { identifier }), profileLocation: null }]);
        uninstallEvent.fire({ identifier, profileLocation: null });
        didUninstallEvent.fire({ identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is uninstalled', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
        testObject.extension = extensions[0];
        uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        assert.ok(testObject.enabled);
        assert.strictEqual(testObject.tooltip, `Please restart extensions to complete the uninstallation of this extension.`);
    });
    test('Test Runtime State when extension is uninstalled and can be removed', async () => {
        const local = aLocalExtension('a');
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(local)],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => true,
            canAddExtension: (extension) => true,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
        testObject.extension = extensions[0];
        uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is uninstalled and installed', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await instantiationService.get(IExtensionsWorkbenchService).queryLocal();
        testObject.extension = extensions[0];
        uninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        didUninstallEvent.fire({ identifier: local.identifier, profileLocation: null });
        const gallery = aGalleryExtension('a');
        const identifier = gallery.identifier;
        installEvent.fire({ identifier, source: gallery, profileLocation: null });
        didInstallEvent.fire([{ identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local, profileLocation: null }]);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is updated while running', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => true,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', { version: '1.0.1' });
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        return new Promise(c => {
            disposables.add(testObject.onDidChange(() => {
                if (testObject.enabled && testObject.tooltip === `Please restart extensions to enable the updated extension.`) {
                    c();
                }
            }));
            const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
            installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
            didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', gallery, gallery), profileLocation: null }]);
        });
    });
    test('Test Runtime State when extension is updated when not running', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('b'))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const local = aLocalExtension('a', { version: '1.0.1' });
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 3 /* InstallOperation.Update */, local: aLocalExtension('a', gallery, gallery), profileLocation: null }]);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is disabled when running', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a'))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        await workbenchService.setEnablement(extensions[0], 10 /* EnablementState.DisabledGlobally */);
        await testObject.update();
        assert.ok(testObject.enabled);
        assert.strictEqual(`Please restart extensions to disable this extension.`, testObject.tooltip);
    });
    test('Test Runtime State when extension enablement is toggled when running', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.0' }))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        instantiationService.set(IExtensionsWorkbenchService, disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService)));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a');
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        await workbenchService.setEnablement(extensions[0], 10 /* EnablementState.DisabledGlobally */);
        await workbenchService.setEnablement(extensions[0], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is enabled when not running', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('b'))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const local = aLocalExtension('a');
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        await workbenchService.setEnablement(extensions[0], 12 /* EnablementState.EnabledGlobally */);
        await testObject.update();
        assert.ok(testObject.enabled);
        assert.strictEqual(`Please restart extensions to enable this extension.`, testObject.tooltip);
    });
    test('Test Runtime State when extension enablement is toggled when not running', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('b'))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const local = aLocalExtension('a');
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        await workbenchService.setEnablement(extensions[0], 12 /* EnablementState.EnabledGlobally */);
        await workbenchService.setEnablement(extensions[0], 10 /* EnablementState.DisabledGlobally */);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is updated when not running and enabled', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a'))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const local = aLocalExtension('a', { version: '1.0.1' });
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([local], 10 /* EnablementState.DisabledGlobally */);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        const gallery = aGalleryExtension('a', { identifier: local.identifier, version: '1.0.2' });
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', gallery, gallery), profileLocation: null }]);
        await workbenchService.setEnablement(extensions[0], 12 /* EnablementState.EnabledGlobally */);
        await testObject.update();
        assert.ok(testObject.enabled);
        assert.strictEqual(`Please restart extensions to enable this extension.`, testObject.tooltip);
    });
    test('Test Runtime State when a localization extension is newly installed', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('b'))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const gallery = aGalleryExtension('a');
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const paged = await instantiationService.get(IExtensionsWorkbenchService).queryGallery(CancellationToken.None);
        testObject.extension = paged.firstPage[0];
        assert.ok(!testObject.enabled);
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', { ...gallery, ...{ contributes: { localizations: [{ languageId: 'de', translations: [] }] } } }, gallery), profileLocation: null }]);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when a localization extension is updated while running', async () => {
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(aLocalExtension('a', { version: '1.0.1' }))],
            onDidChangeExtensions: Event.None,
            canRemoveExtension: (extension) => false,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const local = aLocalExtension('a', { version: '1.0.1', contributes: { localizations: [{ languageId: 'de', translations: [] }] } });
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [local]);
        const extensions = await workbenchService.queryLocal();
        testObject.extension = extensions[0];
        const gallery = aGalleryExtension('a', { uuid: local.identifier.id, version: '1.0.2' });
        installEvent.fire({ identifier: gallery.identifier, source: gallery, profileLocation: null });
        didInstallEvent.fire([{ identifier: gallery.identifier, source: gallery, operation: 2 /* InstallOperation.Install */, local: aLocalExtension('a', { ...gallery, ...{ contributes: { localizations: [{ languageId: 'de', translations: [] }] } } }, gallery), profileLocation: null }]);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is not installed but extension from different server is installed and running', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
        const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(remoteExtension)],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when extension is uninstalled but extension from different server is installed and running', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
        const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const localExtensionManagementService = createExtensionManagementService([localExtension]);
        const uninstallEvent = new Emitter();
        const onDidUninstallEvent = new Emitter();
        localExtensionManagementService.onUninstallExtension = uninstallEvent.event;
        localExtensionManagementService.onDidUninstallExtension = onDidUninstallEvent.event;
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(remoteExtension)],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
        uninstallEvent.fire({ identifier: localExtension.identifier, profileLocation: null });
        didUninstallEvent.fire({ identifier: localExtension.identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when workspace extension is disabled on local server and installed in remote server', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const remoteExtensionManagementService = createExtensionManagementService([]);
        const onDidInstallEvent = new Emitter();
        remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const localExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a') });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
        const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const promise = Event.toPromise(testObject.onDidChange);
        onDidInstallEvent.fire([{ identifier: remoteExtension.identifier, local: remoteExtension, operation: 2 /* InstallOperation.Install */, profileLocation: null }]);
        await promise;
        assert.ok(testObject.enabled);
        assert.strictEqual(testObject.tooltip, `Please reload window to enable this extension.`);
    });
    test('Test Runtime State when ui extension is disabled on remote server and installed in local server', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtensionManagementService = createExtensionManagementService([]);
        const onDidInstallEvent = new Emitter();
        localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const remoteExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
        const localExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a') });
        const promise = Event.toPromise(Event.filter(testObject.onDidChange, () => testObject.enabled));
        onDidInstallEvent.fire([{ identifier: localExtension.identifier, local: localExtension, operation: 2 /* InstallOperation.Install */, profileLocation: null }]);
        await promise;
        assert.ok(testObject.enabled);
        assert.strictEqual(testObject.tooltip, `Please reload window to enable this extension.`);
    });
    test('Test Runtime State for remote ui extension is disabled when it is installed and enabled in local server', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a') });
        const localExtensionManagementService = createExtensionManagementService([localExtension]);
        const onDidInstallEvent = new Emitter();
        localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const remoteExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(localExtension)],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State for remote workspace+ui extension is enabled when it is installed and enabled in local server', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a') });
        const localExtensionManagementService = createExtensionManagementService([localExtension]);
        const onDidInstallEvent = new Emitter();
        localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(localExtension)],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(testObject.enabled);
    });
    test('Test Runtime State for local ui+workspace extension is enabled when it is installed and enabled in remote server', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a') });
        const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const remoteExtensionManagementService = createExtensionManagementService([remoteExtension]);
        const onDidInstallEvent = new Emitter();
        remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(remoteExtension)],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(testObject.enabled);
    });
    test('Test Runtime State for local workspace+ui extension is enabled when it is installed in both servers but running in local server', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a') });
        const localExtensionManagementService = createExtensionManagementService([localExtension]);
        const onDidInstallEvent = new Emitter();
        localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const remoteExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(localExtension)],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(testObject.enabled);
    });
    test('Test Runtime State for remote ui+workspace extension is enabled when it is installed on both servers but running in remote server', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const localExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a') });
        const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const remoteExtensionManagementService = createExtensionManagementService([remoteExtension]);
        const onDidInstallEvent = new Emitter();
        remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), remoteExtensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const onDidChangeExtensionsEmitter = new Emitter();
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(remoteExtension)],
            onDidChangeExtensions: onDidChangeExtensionsEmitter.event,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(testObject.enabled);
    });
    test('Test Runtime State when ui+workspace+web extension is installed in web and remote and running in remote', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const webExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeUserData }) });
        const remoteExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, null, createExtensionManagementService([remoteExtension]), createExtensionManagementService([webExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(remoteExtension)],
            onDidChangeExtensions: Event.None,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test Runtime State when workspace+ui+web extension is installed in web and local and running in local', async () => {
        // multi server setup
        const gallery = aGalleryExtension('a');
        const webExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'], 'browser': 'browser.js' }, { location: URI.file('pub.a').with({ scheme: Schemas.vscodeUserData }) });
        const localExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'], 'browser': 'browser.js' }, { location: URI.file('pub.a') });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localExtension]), null, createExtensionManagementService([webExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        instantiationService.stub(IExtensionService, {
            extensions: [toExtensionDescription(localExtension)],
            onDidChangeExtensions: Event.None,
            canAddExtension: (extension) => false,
            whenInstalledExtensionsRegistered: () => Promise.resolve(true)
        });
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.ExtensionRuntimeStateAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        await workbenchService.queryGallery(CancellationToken.None);
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
});
suite('RemoteInstallAction', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => setupTest(disposables));
    test('Test remote install action is enabled for local workspace extension', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test remote install action when installing local workspace extension', async () => {
        // multi server setup
        const remoteExtensionManagementService = createExtensionManagementService();
        const onInstallExtension = new Emitter();
        remoteExtensionManagementService.onInstallExtension = onInstallExtension.event;
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), remoteExtensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const gallery = aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier });
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
        onInstallExtension.fire({ identifier: localWorkspaceExtension.identifier, source: gallery, profileLocation: null });
        assert.ok(testObject.enabled);
        assert.strictEqual('Installing', testObject.label);
        assert.strictEqual('extension-action label install-other-server installing', testObject.class);
    });
    test('Test remote install action when installing local workspace extension is finished', async () => {
        // multi server setup
        const remoteExtensionManagementService = createExtensionManagementService();
        const onInstallExtension = new Emitter();
        remoteExtensionManagementService.onInstallExtension = onInstallExtension.event;
        const onDidInstallEvent = new Emitter();
        remoteExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), remoteExtensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const gallery = aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier });
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
        onInstallExtension.fire({ identifier: localWorkspaceExtension.identifier, source: gallery, profileLocation: null });
        assert.ok(testObject.enabled);
        assert.strictEqual('Installing', testObject.label);
        assert.strictEqual('extension-action label install-other-server installing', testObject.class);
        const installedExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const promise = Event.toPromise(testObject.onDidChange);
        onDidInstallEvent.fire([{ identifier: installedExtension.identifier, local: installedExtension, operation: 2 /* InstallOperation.Install */, profileLocation: null }]);
        await promise;
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is enabled for disabled local workspace extension', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([remoteWorkspaceExtension], 10 /* EnablementState.DisabledGlobally */);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test remote install action is enabled local workspace+ui extension', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], 10 /* EnablementState.DisabledGlobally */);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test remote install action is enabled for local ui+workapace extension if can install is true', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], 10 /* EnablementState.DisabledGlobally */);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, true));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test remote install action is disabled for local ui+workapace extension if can install is false', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localWorkspaceExtension], 10 /* EnablementState.DisabledGlobally */);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled when extension is not set', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled for extension which is not installed', async () => {
        // multi server setup
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const pager = await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = pager.firstPage[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled for local workspace extension which is disabled in env', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        const environmentService = { disableExtensions: true };
        instantiationService.stub(IEnvironmentService, environmentService);
        instantiationService.stub(INativeEnvironmentService, environmentService);
        instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
        instantiationService.stub(INativeWorkbenchEnvironmentService, environmentService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled when remote server is not available', async () => {
        // single server setup
        const workbenchService = instantiationService.get(IExtensionsWorkbenchService);
        const extensionManagementServerService = instantiationService.get(IExtensionManagementServerService);
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localWorkspaceExtension]);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled for local workspace extension if it is uninstalled locally', async () => {
        // multi server setup
        const extensionManagementService = instantiationService.get(IExtensionManagementService);
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, extensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [localWorkspaceExtension]);
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        uninstallEvent.fire({ identifier: localWorkspaceExtension.identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled for local workspace extension if it is installed in remote', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), createExtensionManagementService([remoteWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is enabled for local workspace extension if it has not gallery', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(testObject.enabled);
    });
    test('Test remote install action is disabled for local workspace system extension', async () => {
        // multi server setup
        const localWorkspaceSystemExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`), type: 0 /* ExtensionType.System */ });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceSystemExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceSystemExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled for local ui extension if it is not installed in remote', async () => {
        // multi server setup
        const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is disabled for local ui extension if it is also installed in remote', async () => {
        // multi server setup
        const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test remote install action is enabled for locally installed language pack extension', async () => {
        // multi server setup
        const languagePackExtension = aLocalExtension('a', { contributes: { localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([languagePackExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test remote install action is disabled if local language pack extension is uninstalled', async () => {
        // multi server setup
        const extensionManagementService = instantiationService.get(IExtensionManagementService);
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, extensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const languagePackExtension = aLocalExtension('a', { contributes: { localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`) });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [languagePackExtension]);
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.RemoteInstallAction, false));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.localExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install in remote', testObject.label);
        uninstallEvent.fire({ identifier: languagePackExtension.identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
});
suite('LocalInstallAction', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => setupTest(disposables));
    test('Test local install action is enabled for remote ui extension', async () => {
        // multi server setup
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test local install action is enabled for remote ui+workspace extension', async () => {
        // multi server setup
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test local install action when installing remote ui extension', async () => {
        // multi server setup
        const localExtensionManagementService = createExtensionManagementService();
        const onInstallExtension = new Emitter();
        localExtensionManagementService.onInstallExtension = onInstallExtension.event;
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const gallery = aGalleryExtension('a', { identifier: remoteUIExtension.identifier });
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
        onInstallExtension.fire({ identifier: remoteUIExtension.identifier, source: gallery, profileLocation: null });
        assert.ok(testObject.enabled);
        assert.strictEqual('Installing', testObject.label);
        assert.strictEqual('extension-action label install-other-server installing', testObject.class);
    });
    test('Test local install action when installing remote ui extension is finished', async () => {
        // multi server setup
        const localExtensionManagementService = createExtensionManagementService();
        const onInstallExtension = new Emitter();
        localExtensionManagementService.onInstallExtension = onInstallExtension.event;
        const onDidInstallEvent = new Emitter();
        localExtensionManagementService.onDidInstallExtensions = onDidInstallEvent.event;
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.stub(IExtensionsWorkbenchService, workbenchService, 'open', undefined);
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const gallery = aGalleryExtension('a', { identifier: remoteUIExtension.identifier });
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(gallery));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
        onInstallExtension.fire({ identifier: remoteUIExtension.identifier, source: gallery, profileLocation: null });
        assert.ok(testObject.enabled);
        assert.strictEqual('Installing', testObject.label);
        assert.strictEqual('extension-action label install-other-server installing', testObject.class);
        const installedExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const promise = Event.toPromise(testObject.onDidChange);
        onDidInstallEvent.fire([{ identifier: installedExtension.identifier, local: installedExtension, operation: 2 /* InstallOperation.Install */, profileLocation: null }]);
        await promise;
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is enabled for disabled remote ui extension', async () => {
        // multi server setup
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        await instantiationService.get(IWorkbenchExtensionEnablementService).setEnablement([localUIExtension], 10 /* EnablementState.DisabledGlobally */);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test local install action is disabled when extension is not set', async () => {
        // multi server setup
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is disabled for extension which is not installed', async () => {
        // multi server setup
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a')));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const pager = await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = pager.firstPage[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is disabled for remote ui extension which is disabled in env', async () => {
        // multi server setup
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const environmentService = { disableExtensions: true };
        instantiationService.stub(IEnvironmentService, environmentService);
        instantiationService.stub(INativeEnvironmentService, environmentService);
        instantiationService.stub(IWorkbenchEnvironmentService, environmentService);
        instantiationService.stub(INativeWorkbenchEnvironmentService, environmentService);
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is disabled when local server is not available', async () => {
        // single server setup
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aSingleRemoteExtensionManagementServerService(instantiationService, createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is disabled for remote ui extension if it is installed in local', async () => {
        // multi server setup
        const localUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localUIExtension]), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is disabled for remoteUI extension if it is uninstalled locally', async () => {
        // multi server setup
        const extensionManagementService = instantiationService.get(IExtensionManagementService);
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), extensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [remoteUIExtension]);
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        uninstallEvent.fire({ identifier: remoteUIExtension.identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is enabled for remote UI extension if it has gallery', async () => {
        // multi server setup
        const remoteUIExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUIExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUIExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(testObject.enabled);
    });
    test('Test local install action is disabled for remote UI system extension', async () => {
        // multi server setup
        const remoteUISystemExtension = aLocalExtension('a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }), type: 0 /* ExtensionType.System */ });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteUISystemExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteUISystemExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is disabled for remote workspace extension if it is not installed in local', async () => {
        // multi server setup
        const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([remoteWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: remoteWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is disabled for remote workspace extension if it is also installed in local', async () => {
        // multi server setup
        const localWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspae'] }, { location: URI.file(`pub.a`) });
        const remoteWorkspaceExtension = aLocalExtension('a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService([localWorkspaceExtension]), createExtensionManagementService([remoteWorkspaceExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: localWorkspaceExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        testObject.extension = extensions[0];
        assert.ok(testObject.extension);
        assert.ok(!testObject.enabled);
    });
    test('Test local install action is enabled for remotely installed language pack extension', async () => {
        // multi server setup
        const languagePackExtension = aLocalExtension('a', { contributes: { localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), createExtensionManagementService([languagePackExtension]));
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        assert.strictEqual('extension-action label prominent install-other-server', testObject.class);
    });
    test('Test local install action is disabled if remote language pack extension is uninstalled', async () => {
        // multi server setup
        const extensionManagementService = instantiationService.get(IExtensionManagementService);
        const extensionManagementServerService = aMultiExtensionManagementServerService(instantiationService, createExtensionManagementService(), extensionManagementService);
        instantiationService.stub(IExtensionManagementServerService, extensionManagementServerService);
        instantiationService.stub(IWorkbenchExtensionEnablementService, disposables.add(new TestExtensionEnablementService(instantiationService)));
        const languagePackExtension = aLocalExtension('a', { contributes: { localizations: [{ languageId: 'de', translations: [] }] } }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        instantiationService.stubPromise(IExtensionManagementService, 'getInstalled', [languagePackExtension]);
        const workbenchService = disposables.add(instantiationService.createInstance(ExtensionsWorkbenchService));
        instantiationService.set(IExtensionsWorkbenchService, workbenchService);
        instantiationService.stubPromise(IExtensionGalleryService, 'query', aPage(aGalleryExtension('a', { identifier: languagePackExtension.identifier })));
        const testObject = disposables.add(instantiationService.createInstance(ExtensionsActions.LocalInstallAction));
        disposables.add(instantiationService.createInstance(ExtensionContainers, [testObject]));
        const extensions = await workbenchService.queryLocal(extensionManagementServerService.remoteExtensionManagementServer);
        await workbenchService.queryGallery(CancellationToken.None);
        testObject.extension = extensions[0];
        assert.ok(testObject.enabled);
        assert.strictEqual('Install Locally', testObject.label);
        uninstallEvent.fire({ identifier: languagePackExtension.identifier, profileLocation: null });
        assert.ok(!testObject.enabled);
    });
});
function aLocalExtension(name = 'someext', manifest = {}, properties = {}) {
    manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
    properties = {
        type: 1 /* ExtensionType.User */,
        location: URI.file(`pub.${name}`),
        identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
        ...properties,
        isValid: properties.isValid ?? true,
    };
    properties.isBuiltin = properties.type === 0 /* ExtensionType.System */;
    return Object.create({ manifest, ...properties });
}
function aGalleryExtension(name, properties = {}, galleryExtensionProperties = {}, assets = {}) {
    const targetPlatform = getTargetPlatform(platform, arch);
    const galleryExtension = Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, isSigned: true, ...properties });
    galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
    galleryExtension.assets = { ...galleryExtension.assets, ...assets };
    galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
    galleryExtension.hasReleaseVersion = true;
    return galleryExtension;
}
function aPage(...objects) {
    return { firstPage: objects, total: objects.length, pageSize: objects.length, getPage: () => null };
}
function aSingleRemoteExtensionManagementServerService(instantiationService, remoteExtensionManagementService) {
    const remoteExtensionManagementServer = {
        id: 'vscode-remote',
        label: 'remote',
        extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
    };
    return {
        _serviceBrand: undefined,
        localExtensionManagementServer: null,
        remoteExtensionManagementServer,
        webExtensionManagementServer: null,
        getExtensionManagementServer: (extension) => {
            if (extension.location.scheme === Schemas.vscodeRemote) {
                return remoteExtensionManagementServer;
            }
            return null;
        },
        getExtensionInstallLocation(extension) {
            const server = this.getExtensionManagementServer(extension);
            return server === remoteExtensionManagementServer ? 2 /* ExtensionInstallLocation.Remote */ : 1 /* ExtensionInstallLocation.Local */;
        }
    };
}
function aMultiExtensionManagementServerService(instantiationService, localExtensionManagementService, remoteExtensionManagementService, webExtensionManagementService) {
    const localExtensionManagementServer = localExtensionManagementService === null ? null : {
        id: 'vscode-local',
        label: 'local',
        extensionManagementService: localExtensionManagementService || createExtensionManagementService(),
    };
    const remoteExtensionManagementServer = remoteExtensionManagementService === null ? null : {
        id: 'vscode-remote',
        label: 'remote',
        extensionManagementService: remoteExtensionManagementService || createExtensionManagementService(),
    };
    const webExtensionManagementServer = webExtensionManagementService ? {
        id: 'vscode-web',
        label: 'web',
        extensionManagementService: webExtensionManagementService,
    } : null;
    return {
        _serviceBrand: undefined,
        localExtensionManagementServer,
        remoteExtensionManagementServer,
        webExtensionManagementServer,
        getExtensionManagementServer: (extension) => {
            if (extension.location.scheme === Schemas.file) {
                return localExtensionManagementServer;
            }
            if (extension.location.scheme === Schemas.vscodeRemote) {
                return remoteExtensionManagementServer;
            }
            if (extension.location.scheme === Schemas.vscodeUserData) {
                return webExtensionManagementServer;
            }
            throw new Error('');
        },
        getExtensionInstallLocation(extension) {
            const server = this.getExtensionManagementServer(extension);
            if (server === null) {
                return null;
            }
            if (server === remoteExtensionManagementServer) {
                return 2 /* ExtensionInstallLocation.Remote */;
            }
            if (server === webExtensionManagementServer) {
                return 3 /* ExtensionInstallLocation.Web */;
            }
            return 1 /* ExtensionInstallLocation.Local */;
        }
    };
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
        canInstall: async (extension) => { return true; },
        installFromGallery: (extension) => Promise.reject(new Error('not supported')),
        updateMetadata: async (local, metadata, profileLocation) => {
            local.identifier.uuid = metadata.id;
            local.publisherDisplayName = metadata.publisherDisplayName;
            local.publisherId = metadata.publisherId;
            return local;
        },
        async getTargetPlatform() { return getTargetPlatform(platform, arch); },
        async getExtensionsControlManifest() { return { malicious: [], deprecated: {}, search: [], publisherMapping: {} }; },
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc0FjdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvdGVzdC9lbGVjdHJvbi1icm93c2VyL2V4dGVuc2lvbnNBY3Rpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM5RixPQUFPLEtBQUssaUJBQWlCLE1BQU0sb0NBQW9DLENBQUM7QUFDeEUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekYsT0FBTyxFQUNOLDJCQUEyQixFQUFFLHdCQUF3QixFQUNzQyxxQkFBcUIsRUFBMEIsaUJBQWlCLEVBQzNKLE1BQU0sMkVBQTJFLENBQUM7QUFDbkYsT0FBTyxFQUFFLG9DQUFvQyxFQUFtQixpQ0FBaUMsRUFBaUcsb0NBQW9DLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUN2VCxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUNwSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN0SCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSwwRkFBMEYsQ0FBQztBQUMxSSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUN4SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLE9BQU8sRUFBRSxL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