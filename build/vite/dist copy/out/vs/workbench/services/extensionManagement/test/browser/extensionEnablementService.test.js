/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { IExtensionManagementService, IAllowedExtensionsService, AllowedExtensionsConfigKey } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../../common/extensionManagement.js';
import { ExtensionEnablementService } from '../../browser/extensionEnablementService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IStorageService, InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { isUndefinedOrNull } from '../../../../../base/common/types.js';
import { areSameExtensions } from '../../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { productService, TestLifecycleService } from '../../../../test/browser/workbenchTestServices.js';
import { GlobalExtensionEnablementService } from '../../../../../platform/extensionManagement/common/extensionEnablementService.js';
import { IUserDataSyncAccountService, UserDataSyncAccountService } from '../../../../../platform/userDataSync/common/userDataSyncAccount.js';
import { IUserDataSyncEnablementService } from '../../../../../platform/userDataSync/common/userDataSync.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IHostService } from '../../../host/browser/host.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ExtensionManifestPropertiesService, IExtensionManifestPropertiesService } from '../../../extensions/common/extensionManifestPropertiesService.js';
import { TestContextService, TestProductService, TestWorkspaceTrustEnablementService, TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { TestWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { ExtensionManagementService } from '../../common/extensionManagementService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AllowedExtensionsService } from '../../../../../platform/extensionManagement/common/allowedExtensionsService.js';
function createStorageService(instantiationService, disposableStore) {
    let service = instantiationService.get(IStorageService);
    if (!service) {
        let workspaceContextService = instantiationService.get(IWorkspaceContextService);
        if (!workspaceContextService) {
            workspaceContextService = instantiationService.stub(IWorkspaceContextService, {
                getWorkbenchState: () => 2 /* WorkbenchState.FOLDER */,
                getWorkspace: () => TestWorkspace
            });
        }
        service = instantiationService.stub(IStorageService, disposableStore.add(new InMemoryStorageService()));
    }
    return service;
}
export class TestExtensionEnablementService extends ExtensionEnablementService {
    constructor(instantiationService) {
        const disposables = new DisposableStore();
        const storageService = createStorageService(instantiationService, disposables);
        const extensionManagementServerService = instantiationService.get(IExtensionManagementServerService) ||
            instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService({
                id: 'local',
                label: 'local',
                extensionManagementService: {
                    onInstallExtension: disposables.add(new Emitter()).event,
                    onDidInstallExtensions: disposables.add(new Emitter()).event,
                    onUninstallExtension: disposables.add(new Emitter()).event,
                    onDidUninstallExtension: disposables.add(new Emitter()).event,
                    onDidChangeProfile: disposables.add(new Emitter()).event,
                    onDidUpdateExtensionMetadata: disposables.add(new Emitter()).event,
                    onProfileAwareDidInstallExtensions: Event.None,
                },
            }, null, null));
        const extensionManagementService = disposables.add(instantiationService.createInstance(ExtensionManagementService));
        const workbenchExtensionManagementService = instantiationService.get(IWorkbenchExtensionManagementService) || instantiationService.stub(IWorkbenchExtensionManagementService, extensionManagementService);
        const workspaceTrustManagementService = instantiationService.get(IWorkspaceTrustManagementService) || instantiationService.stub(IWorkspaceTrustManagementService, disposables.add(new TestWorkspaceTrustManagementService()));
        super(storageService, disposables.add(new GlobalExtensionEnablementService(storageService, extensionManagementService)), instantiationService.get(IWorkspaceContextService) || new TestContextService(), instantiationService.get(IWorkbenchEnvironmentService) || instantiationService.stub(IWorkbenchEnvironmentService, {}), workbenchExtensionManagementService, instantiationService.get(IConfigurationService), extensionManagementServerService, instantiationService.get(IUserDataSyncEnablementService) || instantiationService.stub(IUserDataSyncEnablementService, { isEnabled() { return false; } }), instantiationService.get(IUserDataSyncAccountService) || instantiationService.stub(IUserDataSyncAccountService, UserDataSyncAccountService), instantiationService.get(ILifecycleService) || instantiationService.stub(ILifecycleService, disposables.add(new TestLifecycleService())), instantiationService.get(INotificationService) || instantiationService.stub(INotificationService, new TestNotificationService()), instantiationService.get(IHostService), new class extends mock() {
            isDisabledByBisect() { return false; }
        }, instantiationService.stub(IAllowedExtensionsService, disposables.add(new AllowedExtensionsService(instantiationService.get(IProductService), instantiationService.get(IConfigurationService)))), workspaceTrustManagementService, new class extends mock() {
            requestWorkspaceTrust(options) { return Promise.resolve(true); }
        }, instantiationService.get(IExtensionManifestPropertiesService) || instantiationService.stub(IExtensionManifestPropertiesService, disposables.add(new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService(), new TestWorkspaceTrustEnablementService(), new NullLogService()))), instantiationService, new NullLogService(), productService);
        this._register(disposables);
    }
    async waitUntilInitialized() {
        await this.extensionsManager.whenInitialized();
    }
    reset() {
        let extensions = this.globalExtensionEnablementService.getDisabledExtensions();
        for (const e of this._getWorkspaceDisabledExtensions()) {
            if (!extensions.some(r => areSameExtensions(r, e))) {
                extensions.push(e);
            }
        }
        const workspaceEnabledExtensions = this._getWorkspaceEnabledExtensions();
        if (workspaceEnabledExtensions.length) {
            extensions = extensions.filter(r => !workspaceEnabledExtensions.some(e => areSameExtensions(e, r)));
        }
        extensions.forEach(d => this.setEnablement([aLocalExtension(d.id)], 12 /* EnablementState.EnabledGlobally */));
    }
}
suite('ExtensionEnablementService Test', () => {
    const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    let testObject;
    const didInstallEvent = new Emitter();
    const didUninstallEvent = new Emitter();
    const didChangeProfileExtensionsEvent = new Emitter();
    const installed = [];
    const malicious = [];
    setup(() => {
        installed.splice(0, installed.length);
        instantiationService = disposableStore.add(new TestInstantiationService());
        instantiationService.stub(IFileService, disposableStore.add(new FileService(new NullLogService())));
        instantiationService.stub(IProductService, TestProductService);
        const testConfigurationService = new TestConfigurationService();
        testConfigurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': true, 'unallowed': false });
        instantiationService.stub(IConfigurationService, testConfigurationService);
        instantiationService.stub(IWorkspaceContextService, new TestContextService());
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService({
            id: 'local',
            label: 'local',
            extensionManagementService: {
                onDidInstallExtensions: didInstallEvent.event,
                onDidUninstallExtension: didUninstallEvent.event,
                onDidChangeProfile: didChangeProfileExtensionsEvent.event,
                onProfileAwareDidInstallExtensions: Event.None,
                getInstalled: () => Promise.resolve(installed),
                async getExtensionsControlManifest() {
                    return {
                        malicious: malicious.map(e => ({ extensionOrPublisher: e })),
                        deprecated: {},
                        search: []
                    };
                }
            },
        }, null, null));
        instantiationService.stub(ILogService, NullLogService);
        instantiationService.stub(IWorkbenchExtensionManagementService, disposableStore.add(instantiationService.createInstance(ExtensionManagementService)));
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
    });
    test('test disable an extension globally', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        assert.ok(!testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 10 /* EnablementState.DisabledGlobally */);
    });
    test('test disable an extension globally should return truthy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(value => assert.ok(value));
    });
    test('test disable an extension globally triggers the change event', async () => {
        const target = sinon.spy();
        disposableStore.add(testObject.onEnablementChanged(target));
        await testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */);
        assert.ok(target.calledOnce);
        assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.a' });
    });
    test('test disable an extension globally again should return a falsy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */))
            .then(value => assert.ok(!value[0]));
    });
    test('test state of globally disabled extension', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 10 /* EnablementState.DisabledGlobally */));
    });
    test('test state of globally enabled extension', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 12 /* EnablementState.EnabledGlobally */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 12 /* EnablementState.EnabledGlobally */));
    });
    test('test disable an extension for workspace', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        assert.ok(!testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 11 /* EnablementState.DisabledWorkspace */);
    });
    test('test disable an extension for workspace returns a truthy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(value => assert.ok(value));
    });
    test('test disable an extension for workspace again should return a falsy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */))
            .then(value => assert.ok(!value[0]));
    });
    test('test state of workspace disabled extension', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 11 /* EnablementState.DisabledWorkspace */));
    });
    test('test state of workspace and globally disabled extension', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 11 /* EnablementState.DisabledWorkspace */));
    });
    test('test state of workspace enabled extension', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 13 /* EnablementState.EnabledWorkspace */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 13 /* EnablementState.EnabledWorkspace */));
    });
    test('test state of globally disabled and workspace enabled extension', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */))
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 13 /* EnablementState.EnabledWorkspace */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 13 /* EnablementState.EnabledWorkspace */));
    });
    test('test state of an extension when disabled for workspace from workspace enabled', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 13 /* EnablementState.EnabledWorkspace */))
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 11 /* EnablementState.DisabledWorkspace */));
    });
    test('test state of an extension when disabled globally from workspace enabled', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 13 /* EnablementState.EnabledWorkspace */))
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 10 /* EnablementState.DisabledGlobally */));
    });
    test('test state of an extension when disabled globally from workspace disabled', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 10 /* EnablementState.DisabledGlobally */));
    });
    test('test state of an extension when enabled globally from workspace enabled', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 13 /* EnablementState.EnabledWorkspace */))
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 12 /* EnablementState.EnabledGlobally */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 12 /* EnablementState.EnabledGlobally */));
    });
    test('test state of an extension when enabled globally from workspace disabled', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 12 /* EnablementState.EnabledGlobally */))
            .then(() => assert.strictEqual(testObject.getEnablementState(aLocalExtension('pub.a')), 12 /* EnablementState.EnabledGlobally */));
    });
    test('test disable an extension for workspace and then globally', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        assert.ok(!testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 10 /* EnablementState.DisabledGlobally */);
    });
    test('test disable an extension for workspace and then globally return a truthy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */))
            .then(value => assert.ok(value));
    });
    test('test disable an extension for workspace and then globally trigger the change event', () => {
        const target = sinon.spy();
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => disposableStore.add(testObject.onEnablementChanged(target)))
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */))
            .then(() => {
            assert.ok(target.calledOnce);
            assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.a' });
        });
    });
    test('test disable an extension globally and then for workspace', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        assert.ok(!testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 11 /* EnablementState.DisabledWorkspace */);
    });
    test('test disable an extension globally and then for workspace return a truthy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */))
            .then(value => assert.ok(value));
    });
    test('test disable an extension globally and then for workspace triggers the change event', () => {
        const target = sinon.spy();
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => disposableStore.add(testObject.onEnablementChanged(target)))
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */))
            .then(() => {
            assert.ok(target.calledOnce);
            assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.a' });
        });
    });
    test('test disable an extension for workspace when there is no workspace throws error', () => {
        instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', 1 /* WorkbenchState.EMPTY */);
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => assert.fail('should throw an error'), error => assert.ok(error));
    });
    test('test enable an extension globally', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([extension], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test enable an extension globally return truthy promise', async () => {
        await testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */);
        const value = await testObject.setEnablement([aLocalExtension('pub.a')], 12 /* EnablementState.EnabledGlobally */);
        assert.strictEqual(value[0], true);
    });
    test('test enable an extension globally triggers change event', () => {
        const target = sinon.spy();
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => disposableStore.add(testObject.onEnablementChanged(target)))
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 12 /* EnablementState.EnabledGlobally */))
            .then(() => {
            assert.ok(target.calledOnce);
            assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.a' });
        });
    });
    test('test enable an extension globally when already enabled return falsy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 12 /* EnablementState.EnabledGlobally */)
            .then(value => assert.ok(!value[0]));
    });
    test('test enable an extension for workspace', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        await testObject.setEnablement([extension], 13 /* EnablementState.EnabledWorkspace */);
        assert.ok(testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 13 /* EnablementState.EnabledWorkspace */);
    });
    test('test enable an extension for workspace return truthy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.a')], 13 /* EnablementState.EnabledWorkspace */))
            .then(value => assert.ok(value));
    });
    test('test enable an extension for workspace triggers change event', () => {
        const target = sinon.spy();
        return testObject.setEnablement([aLocalExtension('pub.b')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => disposableStore.add(testObject.onEnablementChanged(target)))
            .then(() => testObject.setEnablement([aLocalExtension('pub.b')], 13 /* EnablementState.EnabledWorkspace */))
            .then(() => {
            assert.ok(target.calledOnce);
            assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.b' });
        });
    });
    test('test enable an extension for workspace when already enabled return truthy promise', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 13 /* EnablementState.EnabledWorkspace */)
            .then(value => assert.ok(value));
    });
    test('test enable an extension for workspace when disabled in workspace and gloablly', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([extension], 13 /* EnablementState.EnabledWorkspace */);
        assert.ok(testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 13 /* EnablementState.EnabledWorkspace */);
    });
    test('test enable an extension globally when disabled in workspace and gloablly', async () => {
        const extension = aLocalExtension('pub.a');
        await testObject.setEnablement([extension], 13 /* EnablementState.EnabledWorkspace */);
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([extension], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test enable an extension also enables dependencies', async () => {
        installed.push(...[aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'] }), aLocalExtension('pub.b')]);
        const target = installed[0];
        const dep = installed[1];
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([dep, target], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([target], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(testObject.isEnabled(target));
        assert.ok(testObject.isEnabled(dep));
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(dep), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test enable an extension in workspace with a dependency extension that has auth providers', async () => {
        installed.push(...[aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'] }), aLocalExtension('pub.b', { authentication: [{ id: 'a', label: 'a' }] })]);
        const target = installed[0];
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([target], 11 /* EnablementState.DisabledWorkspace */);
        await testObject.setEnablement([target], 13 /* EnablementState.EnabledWorkspace */);
        assert.ok(testObject.isEnabled(target));
        assert.strictEqual(testObject.getEnablementState(target), 13 /* EnablementState.EnabledWorkspace */);
    });
    test('test enable an extension with a dependency extension that cannot be enabled', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
        const localWorkspaceDepExtension = aLocalExtension2('pub.b', { extensionKind: ['workspace'] }, { location: URI.file(`pub.b`) });
        const remoteWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'], extensionDependencies: ['pub.b'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const remoteWorkspaceDepExtension = aLocalExtension2('pub.b', { extensionKind: ['workspace'] }, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
        installed.push(localWorkspaceDepExtension, remoteWorkspaceExtension, remoteWorkspaceDepExtension);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([remoteWorkspaceExtension], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([remoteWorkspaceExtension], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(testObject.isEnabled(remoteWorkspaceExtension));
        assert.strictEqual(testObject.getEnablementState(remoteWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test enable an extension also enables packed extensions', async () => {
        installed.push(...[aLocalExtension2('pub.a', { extensionPack: ['pub.b'] }), aLocalExtension('pub.b')]);
        const target = installed[0];
        const dep = installed[1];
        await testObject.setEnablement([dep, target], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([target], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(testObject.isEnabled(target));
        assert.ok(testObject.isEnabled(dep));
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(dep), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test remove an extension from disablement list when uninstalled', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        didUninstallEvent.fire({ identifier: { id: 'pub.a' }, profileLocation: null });
        assert.ok(testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test isEnabled return false extension is disabled globally', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 10 /* EnablementState.DisabledGlobally */)
            .then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
    });
    test('test isEnabled return false extension is disabled in workspace', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => assert.ok(!testObject.isEnabled(aLocalExtension('pub.a'))));
    });
    test('test isEnabled return true extension is not disabled', () => {
        return testObject.setEnablement([aLocalExtension('pub.a')], 11 /* EnablementState.DisabledWorkspace */)
            .then(() => testObject.setEnablement([aLocalExtension('pub.c')], 10 /* EnablementState.DisabledGlobally */))
            .then(() => assert.ok(testObject.isEnabled(aLocalExtension('pub.b'))));
    });
    test('test canChangeEnablement return false for language packs', () => {
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { localizations: [{ languageId: 'gr', translations: [{ id: 'vscode', path: 'path' }] }] })), false);
    });
    test('test canChangeEnablement return true for auth extension', () => {
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), true);
    });
    test('test canChangeEnablement return true for auth extension when user data sync account does not depends on it', () => {
        instantiationService.stub(IUserDataSyncAccountService, {
            account: { authenticationProviderId: 'b' }
        });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), true);
    });
    test('test canChangeEnablement return true for auth extension when user data sync account depends on it but auto sync is off', () => {
        instantiationService.stub(IUserDataSyncAccountService, {
            account: { authenticationProviderId: 'a' }
        });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), true);
    });
    test('test canChangeEnablement return false for auth extension and user data sync account depends on it and auto sync is on', () => {
        instantiationService.stub(IUserDataSyncEnablementService, { isEnabled() { return true; } });
        instantiationService.stub(IUserDataSyncAccountService, {
            account: { authenticationProviderId: 'a' }
        });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), false);
    });
    test('test canChangeWorkspaceEnablement return true', () => {
        assert.strictEqual(testObject.canChangeWorkspaceEnablement(aLocalExtension('pub.a')), true);
    });
    test('test canChangeWorkspaceEnablement return false if there is no workspace', () => {
        instantiationService.stub(IWorkspaceContextService, 'getWorkbenchState', 1 /* WorkbenchState.EMPTY */);
        assert.strictEqual(testObject.canChangeWorkspaceEnablement(aLocalExtension('pub.a')), false);
    });
    test('test canChangeWorkspaceEnablement return false for auth extension', () => {
        assert.strictEqual(testObject.canChangeWorkspaceEnablement(aLocalExtension('pub.a', { authentication: [{ id: 'a', label: 'a' }] })), false);
    });
    test('test canChangeEnablement return false when extensions are disabled in environment', () => {
        instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
    });
    test('test canChangeEnablement return false when the extension is disabled in environment', () => {
        instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
    });
    test('test canChangeEnablement return true for system extensions when extensions are disabled in environment', () => {
        instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        const extension = aLocalExtension('pub.a', undefined, 0 /* ExtensionType.System */);
        assert.strictEqual(testObject.canChangeEnablement(extension), true);
    });
    test('test canChangeEnablement return false for system extension when extension is disabled in environment', () => {
        instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        const extension = aLocalExtension('pub.a', undefined, 0 /* ExtensionType.System */);
        assert.ok(!testObject.canChangeEnablement(extension));
    });
    test('test extension is disabled when disabled in environment', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 2 /* EnablementState.DisabledByEnvironment */);
    });
    test('test extension is enabled globally when enabled in environment', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension is enabled workspace when enabled in environment', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        await testObject.setEnablement([extension], 13 /* EnablementState.EnabledWorkspace */);
        instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 13 /* EnablementState.EnabledWorkspace */);
    });
    test('test extension is enabled by environment when disabled globally', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 3 /* EnablementState.EnabledByEnvironment */);
    });
    test('test extension is enabled by environment when disabled workspace', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        await testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 3 /* EnablementState.EnabledByEnvironment */);
    });
    test('test extension is disabled by environment when also enabled in environment', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        testObject.setEnablement([extension], 11 /* EnablementState.DisabledWorkspace */);
        instantiationService.stub(IWorkbenchEnvironmentService, { disableExtensions: true, enableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 2 /* EnablementState.DisabledByEnvironment */);
    });
    test('test canChangeEnablement return false when the extension is enabled in environment', () => {
        instantiationService.stub(IWorkbenchEnvironmentService, { enableExtensions: ['pub.a'] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(aLocalExtension('pub.a')), false);
    });
    test('test extension does not support vitrual workspace is not enabled in virtual workspace', async () => {
        const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } });
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 5 /* EnablementState.DisabledByVirtualWorkspace */);
    });
    test('test web extension from web extension management server and does not support vitrual workspace is enabled in virtual workspace', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(null, anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
        const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false }, browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'web' }) });
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test web extension from remote extension management server and does not support vitrual workspace is disabled in virtual workspace', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(null, anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
        const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false }, browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 5 /* EnablementState.DisabledByVirtualWorkspace */);
    });
    test('test enable a remote workspace extension and local ui extension that is a dependency of remote', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
        const localUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const remoteUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
        const target = aLocalExtension2('pub.b', { main: 'main.js', extensionDependencies: ['pub.a'] }, { location: URI.file(`pub.b`).with({ scheme: 'vscode-remote' }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        installed.push(localUIExtension, remoteUIExtension, target);
        await testObject.setEnablement([target, localUIExtension], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([target, localUIExtension], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(testObject.isEnabled(target));
        assert.ok(testObject.isEnabled(localUIExtension));
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(localUIExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test enable a remote workspace extension also enables its dependency in local', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
        const localUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const remoteUIExtension = aLocalExtension2('pub.a', { main: 'main.js', extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
        const target = aLocalExtension2('pub.b', { main: 'main.js', extensionDependencies: ['pub.a'] }, { location: URI.file(`pub.b`).with({ scheme: 'vscode-remote' }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        installed.push(localUIExtension, remoteUIExtension, target);
        await testObject.setEnablement([target, localUIExtension], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([target], 12 /* EnablementState.EnabledGlobally */);
        assert.ok(testObject.isEnabled(target));
        assert.ok(testObject.isEnabled(localUIExtension));
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(localUIExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test canChangeEnablement return false when extension is disabled in virtual workspace', () => {
        const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } });
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.canChangeEnablement(extension));
    });
    test('test extension does not support vitrual workspace is enabled in normal workspace', async () => {
        const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } });
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA') }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension supports virtual workspace is enabled in virtual workspace', async () => {
        const extension = aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: true } });
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension does not support untrusted workspaces is disabled in untrusted workspace', () => {
        const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return false; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.getEnablementState(extension), 0 /* EnablementState.DisabledByTrustRequirement */);
    });
    test('test canChangeEnablement return true when extension is disabled by workspace trust', () => {
        const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return false; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.canChangeEnablement(extension));
    });
    test('test extension supports untrusted workspaces is enabled in untrusted workspace', () => {
        const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } });
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return false; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension does not support untrusted workspaces is enabled in trusted workspace', () => {
        const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: '' } } });
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return true; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension supports untrusted workspaces is enabled in trusted workspace', () => {
        const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } });
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return true; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension without any value for virtual worksapce is enabled in virtual workspace', async () => {
        const extension = aLocalExtension2('pub.a');
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(extension));
        assert.deepStrictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test local workspace extension is disabled by kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.isEnabled(localWorkspaceExtension));
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 1 /* EnablementState.DisabledByExtensionKind */);
    });
    test('test local workspace + ui extension is enabled by kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace', 'ui'] }, { location: URI.file(`pub.a`) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(localWorkspaceExtension));
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test local ui extension is not disabled by kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(localWorkspaceExtension));
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test canChangeEnablement return true when the local workspace extension is disabled by kind', () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), false);
    });
    test('test canChangeEnablement return true for local ui extension', () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), true);
    });
    test('test remote ui extension is disabled by kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.isEnabled(localWorkspaceExtension));
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 1 /* EnablementState.DisabledByExtensionKind */);
    });
    test('test remote ui+workspace extension is disabled by kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui', 'workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(localWorkspaceExtension));
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test remote ui extension is disabled by kind when there is no local server', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(null, anExtensionManagementServer('vscode-remote', instantiationService), null));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(!testObject.isEnabled(localWorkspaceExtension));
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 1 /* EnablementState.DisabledByExtensionKind */);
    });
    test('test remote workspace extension is not disabled by kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.ok(testObject.isEnabled(localWorkspaceExtension));
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test canChangeEnablement return true when the remote ui extension is disabled by kind', () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), false);
    });
    test('test canChangeEnablement return true for remote workspace extension', () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { extensionKind: ['workspace'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.canChangeEnablement(localWorkspaceExtension), true);
    });
    test('test web extension on local server is disabled by kind when web worker is not enabled', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`) });
        instantiationService.get(IConfigurationService).setUserConfiguration('extensions', { webWorker: false });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), false);
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 1 /* EnablementState.DisabledByExtensionKind */);
    });
    test('test web extension on local server is not disabled by kind when web worker is enabled', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`) });
        instantiationService.get(IConfigurationService).setUserConfiguration('extensions', { webWorker: true });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), true);
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test web extension on remote server is disabled by kind when web worker is not enabled', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
        instantiationService.get(IConfigurationService).setUserConfiguration('extensions', { webWorker: false });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), false);
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 1 /* EnablementState.DisabledByExtensionKind */);
    });
    test('test web extension on remote server is disabled by kind when web worker is enabled', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
        instantiationService.get(IConfigurationService).setUserConfiguration('extensions', { webWorker: true });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), false);
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 1 /* EnablementState.DisabledByExtensionKind */);
    });
    test('test web extension on remote server is enabled in web', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
        const localWorkspaceExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'vscode-remote' }) });
        instantiationService.get(IConfigurationService).setUserConfiguration('extensions', { webWorker: false });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.isEnabled(localWorkspaceExtension), true);
        assert.deepStrictEqual(testObject.getEnablementState(localWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test web extension on web server is not disabled by kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), anExtensionManagementServer('web', instantiationService)));
        const webExtension = aLocalExtension2('pub.a', { browser: 'browser.js' }, { location: URI.file(`pub.a`).with({ scheme: 'web' }) });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.isEnabled(webExtension), true);
        assert.deepStrictEqual(testObject.getEnablementState(webExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test state of multipe extensions', async () => {
        installed.push(...[aLocalExtension('pub.a'), aLocalExtension('pub.b'), aLocalExtension('pub.c'), aLocalExtension('pub.d'), aLocalExtension('pub.e')]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([installed[0]], 10 /* EnablementState.DisabledGlobally */);
        await testObject.setEnablement([installed[1]], 11 /* EnablementState.DisabledWorkspace */);
        await testObject.setEnablement([installed[2]], 13 /* EnablementState.EnabledWorkspace */);
        await testObject.setEnablement([installed[3]], 12 /* EnablementState.EnabledGlobally */);
        assert.deepStrictEqual(testObject.getEnablementStates(installed), [10 /* EnablementState.DisabledGlobally */, 11 /* EnablementState.DisabledWorkspace */, 13 /* EnablementState.EnabledWorkspace */, 12 /* EnablementState.EnabledGlobally */, 12 /* EnablementState.EnabledGlobally */]);
    });
    test('test extension is disabled by dependency if it has a dependency that is disabled', async () => {
        installed.push(...[aLocalExtension2('pub.a'), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([installed[0]], 10 /* EnablementState.DisabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(installed[1]), 8 /* EnablementState.DisabledByExtensionDependency */);
    });
    test('test extension is disabled by dependency if it has a dependency that is disabled by virtual workspace', async () => {
        installed.push(...[aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { virtualWorkspaces: true } })]);
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.strictEqual(testObject.getEnablementState(installed[0]), 5 /* EnablementState.DisabledByVirtualWorkspace */);
        assert.strictEqual(testObject.getEnablementState(installed[1]), 8 /* EnablementState.DisabledByExtensionDependency */);
    });
    test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled by virtual workspace', async () => {
        installed.push(...[aLocalExtension2('pub.a', { capabilities: { virtualWorkspaces: false } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { virtualWorkspaces: true } })]);
        instantiationService.stub(IWorkspaceContextService, 'getWorkspace', { folders: [{ uri: URI.file('worskapceA').with(({ scheme: 'virtual' })) }] });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.ok(!testObject.canChangeEnablement(installed[1]));
    });
    test('test extension is disabled by dependency if it has a dependency that is disabled by workspace trust', async () => {
        installed.push(...[aLocalExtension2('pub.a', { main: 'hello.js', capabilities: { untrustedWorkspaces: { supported: false, description: '' } } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { untrustedWorkspaces: { supported: true } } })]);
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return false; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.strictEqual(testObject.getEnablementState(installed[0]), 0 /* EnablementState.DisabledByTrustRequirement */);
        assert.strictEqual(testObject.getEnablementState(installed[1]), 8 /* EnablementState.DisabledByExtensionDependency */);
    });
    test('test extension is not disabled by dependency if it has a dependency that is disabled by extension kind', async () => {
        instantiationService.stub(IExtensionManagementServerService, anExtensionManagementServerService(anExtensionManagementServer('vscode-local', instantiationService), anExtensionManagementServer('vscode-remote', instantiationService), null));
        const localUIExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const remoteUIExtension = aLocalExtension2('pub.a', { extensionKind: ['ui'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const remoteWorkspaceExtension = aLocalExtension2('pub.n', { extensionKind: ['workspace'], extensionDependencies: ['pub.a'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        installed.push(localUIExtension, remoteUIExtension, remoteWorkspaceExtension);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.strictEqual(testObject.getEnablementState(localUIExtension), 12 /* EnablementState.EnabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(remoteUIExtension), 1 /* EnablementState.DisabledByExtensionKind */);
        assert.strictEqual(testObject.getEnablementState(remoteWorkspaceExtension), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled by workspace trust', async () => {
        installed.push(...[aLocalExtension2('pub.a', { main: 'hello.js', capabilities: { untrustedWorkspaces: { supported: false, description: '' } } }), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'], capabilities: { untrustedWorkspaces: { supported: true } } })]);
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return false; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.deepEqual(testObject.canChangeEnablement(installed[1]), false);
    });
    test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled globally', async () => {
        installed.push(...[aLocalExtension2('pub.a', {}), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([installed[0]], 10 /* EnablementState.DisabledGlobally */);
        assert.deepEqual(testObject.canChangeEnablement(installed[1]), false);
    });
    test('test canChangeEnablement return false when extension is disabled by dependency if it has a dependency that is disabled workspace', async () => {
        installed.push(...[aLocalExtension2('pub.a', {}), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([installed[0]], 11 /* EnablementState.DisabledWorkspace */);
        assert.deepEqual(testObject.canChangeEnablement(installed[1]), false);
    });
    test('test extension is not disabled by dependency even if it has a dependency that is disabled when installed extensions are not set', async () => {
        await testObject.setEnablement([aLocalExtension2('pub.a')], 10 /* EnablementState.DisabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension is disabled by dependency if it has a dependency that is disabled when all extensions are passed', async () => {
        installed.push(...[aLocalExtension2('pub.a'), aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([installed[0]], 10 /* EnablementState.DisabledGlobally */);
        assert.deepStrictEqual(testObject.getEnablementStates(installed), [10 /* EnablementState.DisabledGlobally */, 8 /* EnablementState.DisabledByExtensionDependency */]);
    });
    test('test extension is not disabled when it has a missing dependency', async () => {
        const target = aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] });
        installed.push(target);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension is not disabled when it has a dependency in another server', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const depdencyOnAnotherServer = aLocalExtension2('pub.b', {}, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
        installed.push(...[target, depdencyOnAnotherServer]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension is enabled when it has a dependency in another server which is disabled', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const depdencyOnAnotherServer = aLocalExtension2('pub.b', {}, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
        installed.push(...[target, depdencyOnAnotherServer]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([depdencyOnAnotherServer], 10 /* EnablementState.DisabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension is enabled when it has a dependency in another server which is disabled and with no exports and no main and no browser entrypoints', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const depdencyOnAnotherServer = aLocalExtension2('pub.b', { api: 'none' }, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
        installed.push(...[target, depdencyOnAnotherServer]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([depdencyOnAnotherServer], 10 /* EnablementState.DisabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(target), 12 /* EnablementState.EnabledGlobally */);
    });
    test('test extension is disabled by dependency when it has a dependency in another server  which is disabled and with no exports and has main entry point', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'], extensionKind: ['ui'] }, { location: URI.file(`pub.a`) });
        const depdencyOnAnotherServer = aLocalExtension2('pub.b', { api: 'none', main: 'main.js' }, { location: URI.file(`pub.b`).with({ scheme: Schemas.vscodeRemote }) });
        installed.push(...[target, depdencyOnAnotherServer]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([depdencyOnAnotherServer], 10 /* EnablementState.DisabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(target), 8 /* EnablementState.DisabledByExtensionDependency */);
    });
    test('test extension is disabled by dependency when it has a dependency in another server  which is disabled and with no exports and has browser entry point', async () => {
        instantiationService.stub(IExtensionManagementServerService, aMultiExtensionManagementServerService(instantiationService));
        const target = aLocalExtension2('pub.a', { extensionDependencies: ['pub.b'] }, { location: URI.file(`pub.a`).with({ scheme: Schemas.vscodeRemote }) });
        const depdencyOnAnotherServer = aLocalExtension2('pub.b', { api: 'none', browser: 'browser.js', extensionKind: 'ui' }, { location: URI.file(`pub.b`) });
        installed.push(...[target, depdencyOnAnotherServer]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        await testObject.setEnablement([depdencyOnAnotherServer], 10 /* EnablementState.DisabledGlobally */);
        assert.strictEqual(testObject.getEnablementState(target), 8 /* EnablementState.DisabledByExtensionDependency */);
    });
    test('test extension is disabled by invalidity', async () => {
        const target = aLocalExtension2('pub.b', {}, { isValid: false });
        assert.strictEqual(testObject.getEnablementState(target), 6 /* EnablementState.DisabledByInvalidExtension */);
    });
    test('test extension is disabled by dependency when it has a dependency that is invalid', async () => {
        const target = aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] });
        installed.push(...[target, aLocalExtension2('pub.a', {}, { isValid: false })]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.strictEqual(testObject.getEnablementState(target), 8 /* EnablementState.DisabledByExtensionDependency */);
    });
    test('test extension is enabled when its dependency becomes valid', async () => {
        const extension = aLocalExtension2('pub.b', { extensionDependencies: ['pub.a'] });
        installed.push(...[extension, aLocalExtension2('pub.a', {}, { isValid: false })]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        assert.strictEqual(testObject.getEnablementState(extension), 8 /* EnablementState.DisabledByExtensionDependency */);
        const target = sinon.spy();
        disposableStore.add(testObject.onEnablementChanged(target));
        const validExtension = aLocalExtension2('pub.a');
        didInstallEvent.fire([{
                identifier: validExtension.identifier,
                operation: 2 /* InstallOperation.Install */,
                source: validExtension.location,
                profileLocation: validExtension.location,
                local: validExtension,
            }]);
        assert.strictEqual(testObject.getEnablementState(extension), 12 /* EnablementState.EnabledGlobally */);
        assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.b' });
    });
    test('test override workspace to trusted when getting extensions enablements', async () => {
        const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return false; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.getEnablementStates([extension], { trusted: true })[0], 12 /* EnablementState.EnabledGlobally */);
    });
    test('test override workspace to not trusted when getting extensions enablements', async () => {
        const extension = aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } });
        instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted() { return true; } });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.getEnablementStates([extension], { trusted: false })[0], 0 /* EnablementState.DisabledByTrustRequirement */);
    });
    test('test update extensions enablements on trust change triggers change events for extensions depending on workspace trust', async () => {
        installed.push(...[
            aLocalExtension2('pub.a', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } }),
            aLocalExtension2('pub.b', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } }),
            aLocalExtension2('pub.c', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: false, description: 'hello' } } }),
            aLocalExtension2('pub.d', { main: 'main.js', capabilities: { untrustedWorkspaces: { supported: true } } }),
        ]);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        const target = sinon.spy();
        disposableStore.add(testObject.onEnablementChanged(target));
        await testObject.updateExtensionsEnablementsWhenWorkspaceTrustChanges();
        assert.strictEqual(target.args[0][0].length, 2);
        assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.a' });
        assert.deepStrictEqual(target.args[0][0][1].identifier, { id: 'pub.c' });
    });
    test('test adding an extension that was disabled', async () => {
        const extension = aLocalExtension('pub.a');
        installed.push(extension);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.setEnablement([extension], 10 /* EnablementState.DisabledGlobally */);
        const target = sinon.spy();
        disposableStore.add(testObject.onEnablementChanged(target));
        didChangeProfileExtensionsEvent.fire({ added: [extension], removed: [] });
        assert.ok(!testObject.isEnabled(extension));
        assert.strictEqual(testObject.getEnablementState(extension), 10 /* EnablementState.DisabledGlobally */);
        assert.strictEqual(target.args[0][0].length, 1);
        assert.deepStrictEqual(target.args[0][0][0].identifier, { id: 'pub.a' });
    });
    test('test extension is disabled by allowed list', async () => {
        const target = aLocalExtension2('unallowed.extension');
        assert.strictEqual(testObject.getEnablementState(target), 7 /* EnablementState.DisabledByAllowlist */);
    });
    test('test extension is disabled by malicious', async () => {
        malicious.push({ id: 'malicious.extensionA' });
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        await testObject.waitUntilInitialized();
        const target = aLocalExtension2('malicious.extensionA');
        assert.strictEqual(testObject.getEnablementState(target), 4 /* EnablementState.DisabledByMalicious */);
    });
    test('test installed malicious extension triggers change event', async () => {
        testObject.dispose();
        malicious.push({ id: 'malicious.extensionB' });
        const local = aLocalExtension2('malicious.extensionB');
        installed.push(local);
        testObject = disposableStore.add(new TestExtensionEnablementService(instantiationService));
        assert.strictEqual(testObject.getEnablementState(local), 12 /* EnablementState.EnabledGlobally */);
        const promise = Event.toPromise(testObject.onEnablementChanged);
        const result = await promise;
        assert.deepStrictEqual(result[0], local);
        assert.strictEqual(testObject.getEnablementState(local), 4 /* EnablementState.DisabledByMalicious */);
    });
});
function anExtensionManagementServer(authority, instantiationService) {
    return {
        id: authority,
        label: authority,
        extensionManagementService: instantiationService.get(IExtensionManagementService),
    };
}
function aMultiExtensionManagementServerService(instantiationService) {
    const localExtensionManagementServer = anExtensionManagementServer('vscode-local', instantiationService);
    const remoteExtensionManagementServer = anExtensionManagementServer('vscode-remote', instantiationService);
    return anExtensionManagementServerService(localExtensionManagementServer, remoteExtensionManagementServer, null);
}
export function anExtensionManagementServerService(localExtensionManagementServer, remoteExtensionManagementServer, webExtensionManagementServer) {
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
            return webExtensionManagementServer;
        },
        getExtensionInstallLocation(extension) {
            const server = this.getExtensionManagementServer(extension);
            return server === remoteExtensionManagementServer ? 2 /* ExtensionInstallLocation.Remote */
                : server === webExtensionManagementServer ? 3 /* ExtensionInstallLocation.Web */
                    : 1 /* ExtensionInstallLocation.Local */;
        }
    };
}
function aLocalExtension(id, contributes, type) {
    return aLocalExtension2(id, contributes ? { contributes } : {}, isUndefinedOrNull(type) ? {} : { type });
}
function aLocalExtension2(id, manifest = {}, properties = {}) {
    const [publisher, name] = id.split('.');
    manifest = { name, publisher, ...manifest };
    properties = {
        identifier: { id },
        location: URI.file(`pub.${name}`),
        galleryIdentifier: { id, uuid: undefined },
        type: 1 /* ExtensionType.User */,
        ...properties,
        isValid: properties.isValid ?? true,
    };
    properties.isBuiltin = properties.type === 0 /* ExtensionType.System */;
    return Object.create({ manifest, ...properties });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L3Rlc3QvYnJvd3Nlci9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsMkJBQTJCLEVBQXFLLHlCQUF5QixFQUFFLDBCQUEwQixFQUE4QixNQUFNLDJFQUEyRSxDQUFDO0FBQzlXLE9BQU8sRUFBbUIsaUNBQWlDLEVBQThCLG9DQUFvQyxFQUE0RixNQUFNLHFDQUFxQyxDQUFDO0FBQ3JRLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFjLHdCQUF3QixFQUFrQixNQUFNLHVEQUF1RCxDQUFDO0FBQzdILE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUU1RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUNsSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxjQUFjLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN6RyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUNwSSxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUM3SSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2RUFBNkUsQ0FBQztBQUN0SCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDN0QsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRS9ELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBK0QsTUFBTSw0REFBNEQsQ0FBQztBQUMzSyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUMzSixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsbUNBQW1DLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwTCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDL0YsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDM0YsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0ZBQWdGLENBQUM7QUFHMUgsU0FBUyxvQkFBb0IsQ0FBQyxvQkFBOEMsRUFBRSxlQUFnQztJQUM3RyxJQUFJLE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDeEQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2QsSUFBSSx1QkFBdUIsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUM5Qix1QkFBdUIsR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQTRCO2dCQUN2RyxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsOEJBQXNCO2dCQUM5QyxZQUFZLEVBQUUsR0FBRyxFQUFFLENBQUMsYUFBMkI7YUFDL0MsQ0FBQyxDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU8sR0FBRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSxzQkFBc0IsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN6RyxDQUFDO0lBQ0QsT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQztBQUVELE1BQU0sT0FBTyw4QkFBK0IsU0FBUSwwQkFBMEI7SUFDN0UsWUFBWSxvQkFBOEM7UUFDekQsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUMxQyxNQUFNLGNBQWMsR0FBRyxvQkFBb0IsQ0FBQyxvQkFBb0IsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUMvRSxNQUFNLGdDQUFnQyxHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQztZQUNuRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUM7Z0JBQy9GLEVBQUUsRUFBRSxPQUFPO2dCQUNYLEtBQUssRUFBRSxPQUFPO2dCQUNkLDBCQUEwQixFQUEyQztvQkFDcEUsa0JBQWtCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBeUIsQ0FBQyxDQUFDLEtBQUs7b0JBQy9FLHNCQUFzQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQXFDLENBQUMsQ0FBQyxLQUFLO29CQUMvRixvQkFBb0IsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUEyQixDQUFDLENBQUMsS0FBSztvQkFDbkYsdUJBQXVCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBOEIsQ0FBQyxDQUFDLEtBQUs7b0JBQ3pGLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQXlCLENBQUMsQ0FBQyxLQUFLO29CQUMvRSw0QkFBNEIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUE4QixDQUFDLENBQUMsS0FBSztvQkFDOUYsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLElBQUk7aUJBQzlDO2FBQ0QsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNqQixNQUFNLDBCQUEwQixHQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQztRQUNwSCxNQUFNLG1DQUFtQyxHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1FBQzFNLE1BQU0sK0JBQStCLEdBQUcsb0JBQW9CLENBQUMsR0FBRyxDQUFDLGdDQUFnQyxDQUFDLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxtQ0FBbUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5TixLQUFLLENBQ0osY0FBYyxFQUNkLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQ0FBZ0MsQ0FBQyxjQUFjLEVBQUUsMEJBQTBCLENBQUMsQ0FBQyxFQUNqRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsSUFBSSxJQUFJLGtCQUFrQixFQUFFLEVBQzlFLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLENBQUMsRUFDckgsbUNBQW1DLEVBQ25DLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxFQUMvQyxnQ0FBZ0MsRUFDaEMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLDhCQUE4QixDQUFDLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLDhCQUE4QixFQUEyQyxFQUFFLFNBQVMsS0FBSyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQ2pNLG9CQUFvQixDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQywyQkFBMkIsRUFBRSwwQkFBMEIsQ0FBQyxFQUMzSSxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLG9CQUFvQixFQUFFLENBQUMsQ0FBQyxFQUN4SSxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsSUFBSSx1QkFBdUIsRUFBRSxDQUFDLEVBQ2hJLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFDdEMsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUEyQjtZQUFZLGtCQUFrQixLQUFLLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztTQUFFLEVBQ3JHLG9CQUFvQixDQUFDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUMvTCwrQkFBK0IsRUFDL0IsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFpQztZQUFZLHFCQUFxQixDQUFDLE9BQXNDLElBQXNCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FBRSxFQUN0TCxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtDQUFrQyxDQUFDLGtCQUFrQixFQUFFLElBQUksd0JBQXdCLEVBQUUsRUFBRSxJQUFJLG1DQUFtQyxFQUFFLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFDN1Msb0JBQW9CLEVBQ3BCLElBQUksY0FBYyxFQUFFLEVBQ3BCLGNBQWMsQ0FDZCxDQUFDO1FBQ0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBRU0sS0FBSyxDQUFDLG9CQUFvQjtRQUNoQyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUNoRCxDQUFDO0lBRU0sS0FBSztRQUNYLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQy9FLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLCtCQUErQixFQUFFLEVBQUUsQ0FBQztZQUN4RCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BELFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsQ0FBQztRQUNGLENBQUM7UUFDRCxNQUFNLDBCQUEwQixHQUFHLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxDQUFDO1FBQ3pFLElBQUksMEJBQTBCLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdkMsVUFBVSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckcsQ0FBQztRQUNELFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQywyQ0FBa0MsQ0FBQyxDQUFDO0lBQ3ZHLENBQUM7Q0FDRDtBQUVELEtBQUssQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7SUFFN0MsTUFBTSxlQUFlLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUVsRSxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksVUFBMEMsQ0FBQztJQUUvQyxNQUFNLGVBQWUsR0FBRyxJQUFJLE9BQU8sRUFBcUMsQ0FBQztJQUN6RSxNQUFNLGlCQUFpQixHQUFHLElBQUksT0FBTyxFQUE4QixDQUFDO0lBQ3BFLE1BQU0sK0JBQStCLEdBQUcsSUFBSSxPQUFPLEVBQXlCLENBQUM7SUFDN0UsTUFBTSxTQUFTLEdBQXNCLEVBQUUsQ0FBQztJQUN4QyxNQUFNLFNBQVMsR0FBMkIsRUFBRSxDQUFDO0lBRTdDLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEMsb0JBQW9CLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUMzRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSxXQUFXLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDL0QsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLHdCQUF3QixFQUFFLENBQUM7UUFDaEUsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsMEJBQTBCLEVBQUUsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzdHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBQzNFLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUM5RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUM7WUFDL0YsRUFBRSxFQUFFLE9BQU87WUFDWCxLQUFLLEVBQUUsT0FBTztZQUNkLDBCQUEwQixFQUEyQztnQkFDcEUsc0JBQXNCLEVBQUUsZUFBZSxDQUFDLEtBQUs7Z0JBQzdDLHVCQUF1QixFQUFFLGlCQUFpQixDQUFDLEtBQUs7Z0JBQ2hELGtCQUFrQixFQUFFLCtCQUErQixDQUFDLEtBQUs7Z0JBQ3pELGtDQUFrQyxFQUFFLEtBQUssQ0FBQyxJQUFJO2dCQUM5QyxZQUFZLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUM7Z0JBQzlDLEtBQUssQ0FBQyw0QkFBNEI7b0JBQ2pDLE9BQU87d0JBQ04sU0FBUyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDNUQsVUFBVSxFQUFFLEVBQUU7d0JBQ2QsTUFBTSxFQUFFLEVBQUU7cUJBQ1YsQ0FBQztnQkFDSCxDQUFDO2FBQ0Q7U0FDRCxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2hCLG9CQUFvQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDdkQsb0JBQW9CLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLGVBQWUsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RKLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO0lBQzVGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3JELE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsNENBQW1DLENBQUM7UUFDOUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsNENBQW1DLENBQUM7SUFDaEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsaUVBQWlFLEVBQUUsR0FBRyxFQUFFO1FBQzVFLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUM7YUFDM0YsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhEQUE4RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQy9FLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzQixlQUFlLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQzVELE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM3RixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM3QixNQUFNLENBQUMsZUFBZSxDQUFjLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0VBQXdFLEVBQUUsR0FBRyxFQUFFO1FBQ25GLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUM7YUFDM0YsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DLENBQUM7YUFDbEcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFO1FBQ3RELE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUM7YUFDM0YsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQyxDQUFDO0lBQzdILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtRQUNyRCxPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DO2FBQzNGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDJDQUFrQyxDQUFDO2FBQ2pHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsMkNBQWtDLENBQUMsQ0FBQztJQUM1SCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5Q0FBeUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRCxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLDZDQUFvQyxDQUFDO1FBQy9FLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLDZDQUFvQyxDQUFDO0lBQ2pHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtFQUFrRSxFQUFFLEdBQUcsRUFBRTtRQUM3RSxPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DO2FBQzVGLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNuQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2RUFBNkUsRUFBRSxHQUFHLEVBQUU7UUFDeEYsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDZDQUFvQzthQUM1RixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0MsQ0FBQzthQUNuRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7UUFDdkQsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDZDQUFvQzthQUM1RixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDZDQUFvQyxDQUFDLENBQUM7SUFDOUgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseURBQXlELEVBQUUsR0FBRyxFQUFFO1FBQ3BFLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUM7YUFDM0YsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DLENBQUM7YUFDbkcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0MsQ0FBQyxDQUFDO0lBQzlILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DO2FBQzVGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQyxDQUFDO2FBQ2xHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DLENBQUMsQ0FBQztJQUM3SCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpRUFBaUUsRUFBRSxHQUFHLEVBQUU7UUFDNUUsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQzthQUMzRixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0MsQ0FBQzthQUNuRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQzthQUNsRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQyxDQUFDLENBQUM7SUFDN0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0VBQStFLEVBQUUsR0FBRyxFQUFFO1FBQzFGLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0M7YUFDNUYsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DLENBQUM7YUFDbEcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DLENBQUM7YUFDbkcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0MsQ0FBQyxDQUFDO0lBQzlILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBFQUEwRSxFQUFFLEdBQUcsRUFBRTtRQUNyRixPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DO2FBQzVGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQyxDQUFDO2FBQ2xHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQyxDQUFDO2FBQ2xHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DLENBQUMsQ0FBQztJQUM3SCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyRUFBMkUsRUFBRSxHQUFHLEVBQUU7UUFDdEYsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDZDQUFvQzthQUM1RixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQzthQUNsRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQyxDQUFDLENBQUM7SUFDN0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUVBQXlFLEVBQUUsR0FBRyxFQUFFO1FBQ3BGLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0M7YUFDNUYsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DLENBQUM7YUFDbEcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsMkNBQWtDLENBQUM7YUFDakcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQywyQ0FBa0MsQ0FBQyxDQUFDO0lBQzVILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDBFQUEwRSxFQUFFLEdBQUcsRUFBRTtRQUNyRixPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DO2FBQzVGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDJDQUFrQyxDQUFDO2FBQ2pHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsMkNBQWtDLENBQUMsQ0FBQztJQUM1SCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RSxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLDZDQUFvQyxDQUFDO1FBQy9FLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztJQUNoRyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtRkFBbUYsRUFBRSxHQUFHLEVBQUU7UUFDOUYsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDZDQUFvQzthQUM1RixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQzthQUNsRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDbkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0ZBQW9GLEVBQUUsR0FBRyxFQUFFO1FBQy9GLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzQixPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DO2FBQzVGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2FBQ3ZFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQyxDQUFDO2FBQ2xHLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDVixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM3QixNQUFNLENBQUMsZUFBZSxDQUFjLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyREFBMkQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RSxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLDRDQUFtQyxDQUFDO1FBQzlFLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw2Q0FBb0MsQ0FBQztRQUMvRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyw2Q0FBb0MsQ0FBQztJQUNqRyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtRkFBbUYsRUFBRSxHQUFHLEVBQUU7UUFDOUYsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQzthQUMzRixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0MsQ0FBQzthQUNuRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDbkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUZBQXFGLEVBQUUsR0FBRyxFQUFFO1FBQ2hHLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzQixPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DO2FBQzNGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2FBQ3ZFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDZDQUFvQyxDQUFDO2FBQ25HLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDVixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM3QixNQUFNLENBQUMsZUFBZSxDQUFjLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpRkFBaUYsRUFBRSxHQUFHLEVBQUU7UUFDNUYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLG1CQUFtQiwrQkFBdUIsQ0FBQztRQUMvRixPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DO2FBQzVGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDL0UsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUNBQW1DLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDcEQsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzNDLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM5RSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsMkNBQWtDLENBQUM7UUFDN0UsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLDJDQUFrQyxDQUFDO0lBQy9GLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlEQUF5RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzFFLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM3RixNQUFNLEtBQUssR0FBRyxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsMkNBQWtDLENBQUM7UUFDMUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseURBQXlELEVBQUUsR0FBRyxFQUFFO1FBQ3BFLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzQixPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DO2FBQzNGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO2FBQ3ZFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDJDQUFrQyxDQUFDO2FBQ2pHLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDVixNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUM3QixNQUFNLENBQUMsZUFBZSxDQUFjLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2RUFBNkUsRUFBRSxHQUFHLEVBQUU7UUFDeEYsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDJDQUFrQzthQUMxRixJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RCxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLDZDQUFvQyxDQUFDO1FBQy9FLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsNENBQW1DLENBQUM7SUFDaEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOERBQThELEVBQUUsR0FBRyxFQUFFO1FBQ3pFLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0M7YUFDNUYsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DLENBQUM7YUFDbEcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDhEQUE4RCxFQUFFLEdBQUcsRUFBRTtRQUN6RSxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDM0IsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDZDQUFvQzthQUM1RixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzthQUN2RSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQzthQUNsRyxJQUFJLENBQUMsR0FBRyxFQUFFO1lBQ1YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDN0IsTUFBTSxDQUFDLGVBQWUsQ0FBYyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3hGLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUZBQW1GLEVBQUUsR0FBRyxFQUFFO1FBQzlGLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw0Q0FBbUM7YUFDM0YsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25DLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdGQUFnRixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2pHLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsNkNBQW9DLENBQUM7UUFDL0UsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLDRDQUFtQyxDQUFDO1FBQzlFLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsNENBQW1DLENBQUM7SUFDaEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkVBQTJFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDNUYsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzNDLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM5RSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsNkNBQW9DLENBQUM7UUFDL0UsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLDRDQUFtQyxDQUFDO1FBQzlFLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQywyQ0FBa0MsQ0FBQztRQUM3RSxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsMkNBQWtDLENBQUM7SUFDL0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDckUsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvRyxNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDNUIsTUFBTSxHQUFHLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLE1BQXVDLFVBQVcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBQzFFLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsNENBQW1DLENBQUM7UUFDaEYsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxDQUFDLDJDQUFrQyxDQUFDO1FBQzFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQywyQ0FBa0MsQ0FBQztRQUMzRixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsMkNBQWtDLENBQUM7SUFDekYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkZBQTJGLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDNUcsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlKLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1QixNQUF1QyxVQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUMxRSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLENBQUMsNkNBQW9DLENBQUM7UUFDNUUsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxDQUFDLDRDQUFtQyxDQUFDO1FBQzNFLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyw0Q0FBbUMsQ0FBQztJQUM3RixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw2RUFBNkUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM5RixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUMsMkJBQTJCLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsMkJBQTJCLENBQUMsZUFBZSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM5TyxNQUFNLDBCQUEwQixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDaEksTUFBTSx3QkFBd0IsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZNLE1BQU0sMkJBQTJCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDeEssU0FBUyxDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSx3QkFBd0IsRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1FBRWxHLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQXVDLFVBQVcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBRTFFLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLDRDQUFtQyxDQUFDO1FBQzdGLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLDJDQUFrQyxDQUFDO1FBQzVGLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7UUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsd0JBQXdCLENBQUMsMkNBQWtDLENBQUM7SUFDOUcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseURBQXlELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUUsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkcsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzVCLE1BQU0sR0FBRyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN6QixNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLDRDQUFtQyxDQUFDO1FBQ2hGLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLE1BQU0sQ0FBQywyQ0FBa0MsQ0FBQztRQUMxRSxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNyQyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsMkNBQWtDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLDJDQUFrQyxDQUFDO0lBQ3pGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzFCLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBRTNGLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw2Q0FBb0MsQ0FBQztRQUMvRSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsNENBQW1DLENBQUM7UUFDOUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxFQUFFLGVBQWUsRUFBRSxJQUFLLEVBQUUsQ0FBQyxDQUFDO1FBRWhGLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQywyQ0FBa0MsQ0FBQztJQUMvRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0REFBNEQsRUFBRSxHQUFHLEVBQUU7UUFDdkUsT0FBTyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQzthQUMzRixJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdFQUFnRSxFQUFFLEdBQUcsRUFBRTtRQUMzRSxPQUFPLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNkNBQW9DO2FBQzVGLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0RBQXNELEVBQUUsR0FBRyxFQUFFO1FBQ2pFLE9BQU8sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyw2Q0FBb0M7YUFDNUYsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsNENBQW1DLENBQUM7YUFDbEcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDekUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsR0FBRyxFQUFFO1FBQ3JFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNoTCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRSxHQUFHLEVBQUU7UUFDcEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNuSSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0R0FBNEcsRUFBRSxHQUFHLEVBQUU7UUFDdkgsb0JBQW9CLENBQUMsSUFBSSxDQUFDLDJCQUEyQixFQUF3QztZQUM1RixPQUFPLEVBQUUsRUFBRSx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7U0FDMUMsQ0FBQyxDQUFDO1FBQ0gsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNuSSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3SEFBd0gsRUFBRSxHQUFHLEVBQUU7UUFDbkksb0JBQW9CLENBQUMsSUFBSSxDQUFDLDJCQUEyQixFQUF3QztZQUM1RixPQUFPLEVBQUUsRUFBRSx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7U0FDMUMsQ0FBQyxDQUFDO1FBQ0gsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNuSSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1SEFBdUgsRUFBRSxHQUFHLEVBQUU7UUFDbEksb0JBQW9CLENBQUMsSUFBSSxDQUFDLDhCQUE4QixFQUEyQyxFQUFFLFNBQVMsS0FBSyxPQUFPLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDckksb0JBQW9CLENBQUMsSUFBSSxDQUFDLDJCQUEyQixFQUF3QztZQUM1RixPQUFPLEVBQUUsRUFBRSx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7U0FDMUMsQ0FBQyxDQUFDO1FBQ0gsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNwSSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7UUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsNEJBQTRCLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUVBQXlFLEVBQUUsR0FBRyxFQUFFO1FBQ3BGLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxtQkFBbUIsK0JBQXVCLENBQUM7UUFDL0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsNEJBQTRCLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDOUYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUVBQW1FLEVBQUUsR0FBRyxFQUFFO1FBQzlFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLDRCQUE0QixDQUFDLGVBQWUsQ0FBQyxPQUFPLEVBQUUsRUFBRSxjQUFjLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDN0ksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUZBQW1GLEVBQUUsR0FBRyxFQUFFO1FBQzlGLG9CQUFvQixDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDckYsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDckYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUZBQXFGLEVBQUUsR0FBRyxFQUFFO1FBQ2hHLG9CQUFvQixDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxFQUFFLGlCQUFpQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdHQUF3RyxFQUFFLEdBQUcsRUFBRTtRQUNuSCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3JGLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLEVBQUUsU0FBUywrQkFBdUIsQ0FBQztRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNyRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxzR0FBc0csRUFBRSxHQUFHLEVBQUU7UUFDakgsb0JBQW9CLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDMUYsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLE9BQU8sRUFBRSxTQUFTLCtCQUF1QixDQUFDO1FBQzVFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx5REFBeUQsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMxRSxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUxQixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMxRixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUUzRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxnREFBd0MsQ0FBQztJQUN6RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnRUFBZ0UsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqRixNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUUxQixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxnQkFBZ0IsRUFBcUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUcsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLDJDQUFrQyxDQUFDO0lBQ25HLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTFCLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM5RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxnQkFBZ0IsRUFBcUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUcsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLDRDQUFtQyxDQUFDO0lBQ3BHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTFCLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM5RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxnQkFBZ0IsRUFBcUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUcsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLCtDQUF1QyxDQUFDO0lBQ3hHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtFQUFrRSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25GLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTFCLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyw2Q0FBb0MsQ0FBQztRQUMvRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsRUFBRSxnQkFBZ0IsRUFBcUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUcsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLCtDQUF1QyxDQUFDO0lBQ3hHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRFQUE0RSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdGLE1BQU0sU0FBUyxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTFCLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsNkNBQW9DLENBQUM7UUFDekUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixFQUFxQixDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNySSxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUUzRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxnREFBd0MsQ0FBQztJQUN6RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvRkFBb0YsRUFBRSxHQUFHLEVBQUU7UUFDL0Ysb0JBQW9CLENBQUMsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEVBQUUsZ0JBQWdCLEVBQXFCLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzVHLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVGQUF1RixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hHLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLFlBQVksRUFBRSxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM1RixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsY0FBYyxFQUFjLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5SixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxxREFBNkMsQ0FBQztJQUM5RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnSUFBZ0ksRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqSixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUMsSUFBSSxFQUFFLDJCQUEyQixDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLEtBQUssRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyTyxNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxZQUFZLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUssb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLGNBQWMsRUFBYyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUosVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLDJDQUFrQyxDQUFDO0lBQ25HLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9JQUFvSSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3JKLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxrQ0FBa0MsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLENBQUMsZUFBZSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsMkJBQTJCLENBQUMsS0FBSyxFQUFFLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JPLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLFlBQVksRUFBRSxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0TCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsY0FBYyxFQUFjLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5SixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxxREFBNkMsQ0FBQztJQUM5RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnR0FBZ0csRUFBRSxLQUFLLElBQUksRUFBRTtRQUNqSCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUMsMkJBQTJCLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsMkJBQTJCLENBQUMsZUFBZSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM5TyxNQUFNLGdCQUFnQixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoSSxNQUFNLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSyxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSyxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUUzRixTQUFTLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzVELE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyw0Q0FBbUMsQ0FBQztRQUM3RixNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsMkNBQWtDLENBQUM7UUFDNUYsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDeEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsMkNBQWtDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsMkNBQWtDLENBQUM7SUFDdEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0VBQStFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDaEcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLGtDQUFrQyxDQUFDLDJCQUEyQixDQUFDLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDOU8sTUFBTSxnQkFBZ0IsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDaEksTUFBTSxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkssTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkssVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFFM0YsU0FBUyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM1RCxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsNENBQW1DLENBQUM7UUFDN0YsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxDQUFDLDJDQUFrQyxDQUFDO1FBQzFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLDJDQUFrQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLDJDQUFrQyxDQUFDO0lBQ3RHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVGQUF1RixFQUFFLEdBQUcsRUFBRTtRQUNsRyxNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxZQUFZLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLGNBQWMsRUFBYyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUosVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3ZELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtGQUFrRixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25HLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLFlBQVksRUFBRSxFQUFFLGlCQUFpQixFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM1RixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsY0FBYyxFQUFjLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hJLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQywyQ0FBa0MsQ0FBQztJQUNuRyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyRUFBMkUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RixNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxZQUFZLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0Ysb0JBQW9CLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLGNBQWMsRUFBYyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDOUosVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLDJDQUFrQyxDQUFDO0lBQ25HLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlGQUF5RixFQUFFLEdBQUcsRUFBRTtRQUNwRyxNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEosb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUE2QyxFQUFFLGtCQUFrQixLQUFLLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMscURBQTZDLENBQUM7SUFDMUcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0ZBQW9GLEVBQUUsR0FBRyxFQUFFO1FBQy9GLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwSixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLEVBQTZDLEVBQUUsa0JBQWtCLEtBQUssT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25KLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZ0ZBQWdGLEVBQUUsR0FBRyxFQUFFO1FBQzNGLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDN0gsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUE2QyxFQUFFLGtCQUFrQixLQUFLLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsMkNBQWtDLENBQUM7SUFDL0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0ZBQXNGLEVBQUUsR0FBRyxFQUFFO1FBQ2pHLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLEVBQTZDLEVBQUUsa0JBQWtCLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xKLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQywyQ0FBa0MsQ0FBQztJQUMvRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw4RUFBOEUsRUFBRSxHQUFHLEVBQUU7UUFDekYsTUFBTSxTQUFTLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM3SCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLEVBQTZDLEVBQUUsa0JBQWtCLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xKLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQywyQ0FBa0MsQ0FBQztJQUMvRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3RkFBd0YsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RyxNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1QyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsY0FBYyxFQUFjLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5SixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsMkNBQWtDLENBQUM7SUFDbkcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0RBQW9ELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDckUsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLHNDQUFzQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzSCxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0gsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLGtEQUEwQyxDQUFDO0lBQ3pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSSxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLDJDQUFrQyxDQUFDO0lBQ2pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RILFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsdUJBQXVCLENBQUMsMkNBQWtDLENBQUM7SUFDakgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkZBQTZGLEVBQUUsR0FBRyxFQUFFO1FBQ3hHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdILFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLHVCQUF1QixDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDcEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkRBQTZELEVBQUUsR0FBRyxFQUFFO1FBQ3hFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RILFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLHVCQUF1QixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbkYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOENBQThDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDL0Qsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLHNDQUFzQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzSCxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdKLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyx1QkFBdUIsQ0FBQyxrREFBMEMsQ0FBQztJQUN6SCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3REFBd0QsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsc0NBQXNDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNILE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzFLLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDekQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsdUJBQXVCLENBQUMsMkNBQWtDLENBQUM7SUFDakgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNEVBQTRFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDN0Ysb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLGtDQUFrQyxDQUFDLElBQUksRUFBRSwyQkFBMkIsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2pMLE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0osVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLGtEQUEwQyxDQUFDO0lBQ3pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlEQUF5RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzFFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwSyxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLDJDQUFrQyxDQUFDO0lBQ2pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVGQUF1RixFQUFFLEdBQUcsRUFBRTtRQUNsRyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsc0NBQXNDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNILE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0osVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsdUJBQXVCLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNwRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxRUFBcUUsRUFBRSxHQUFHLEVBQUU7UUFDaEYsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLHNDQUFzQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzSCxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLFdBQVcsQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BLLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLHVCQUF1QixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDbkYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUZBQXVGLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLHNDQUFzQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzSCxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMzRixvQkFBb0IsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUNySSxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RSxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyx1QkFBdUIsQ0FBQyxrREFBMEMsQ0FBQztJQUN6SCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1RkFBdUYsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4RyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsc0NBQXNDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNILE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzNGLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBRSxDQUFDLG9CQUFvQixDQUFDLFlBQVksRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3BJLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLDJDQUFrQyxDQUFDO0lBQ2pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdGQUF3RixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxrQ0FBa0MsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzlPLE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdILG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBRSxDQUFDLG9CQUFvQixDQUFDLFlBQVksRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3JJLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pFLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLGtEQUEwQyxDQUFDO0lBQ3pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9GQUFvRixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3JHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxrQ0FBa0MsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzlPLE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdILG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBRSxDQUFDLG9CQUFvQixDQUFDLFlBQVksRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3BJLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pFLE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHVCQUF1QixDQUFDLGtEQUEwQyxDQUFDO0lBQ3pILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVEQUF1RCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3hFLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxrQ0FBa0MsQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsRUFBRSwyQkFBMkIsQ0FBQyxLQUFLLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbFMsTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDN0gsb0JBQW9CLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFFLENBQUMsb0JBQW9CLENBQUMsWUFBWSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDckksVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsdUJBQXVCLENBQUMsMkNBQWtDLENBQUM7SUFDakgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0Usb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLGtDQUFrQyxDQUFDLDJCQUEyQixDQUFDLGNBQWMsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLGVBQWUsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLDJCQUEyQixDQUFDLEtBQUssRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsUyxNQUFNLFlBQVksR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkksVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFlBQVksQ0FBQywyQ0FBa0MsQ0FBQztJQUN0RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuRCxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFLGVBQWUsQ0FBQyxPQUFPLENBQUMsRUFBRSxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0SixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUF1QyxVQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUUxRSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsNENBQW1DLENBQUM7UUFDakYsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLDZDQUFvQyxDQUFDO1FBQ2xGLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyw0Q0FBbUMsQ0FBQztRQUNqRixNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsMkNBQWtDLENBQUM7UUFFaEYsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLEVBQUUsc05BQXlLLENBQUMsQ0FBQztJQUM5TyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrRkFBa0YsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNuRyxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEgsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFMUUsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLDRDQUFtQyxDQUFDO1FBRWpGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyx3REFBZ0QsQ0FBQztJQUNoSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1R0FBdUcsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4SCxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxZQUFZLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxZQUFZLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNNLG9CQUFvQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxjQUFjLEVBQWMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlKLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQXVDLFVBQVcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBRTFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxxREFBNkMsQ0FBQztRQUM1RyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsd0RBQWdELENBQUM7SUFDaEgsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNklBQTZJLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDOUosU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsWUFBWSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLHFCQUFxQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzTSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsY0FBYyxFQUFjLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM5SixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUF1QyxVQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUUxRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscUdBQXFHLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDdEgsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLHFCQUFxQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsWUFBWSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hSLG9CQUFvQixDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsRUFBNkMsRUFBRSxrQkFBa0IsS0FBSyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkosVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLHFEQUE2QyxDQUFDO1FBQzVHLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyx3REFBZ0QsQ0FBQztJQUNoSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3R0FBd0csRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6SCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsa0NBQWtDLENBQUMsMkJBQTJCLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDLEVBQUUsMkJBQTJCLENBQUMsZUFBZSxFQUFFLG9CQUFvQixDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM5TyxNQUFNLGdCQUFnQixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDL0csTUFBTSxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxhQUFhLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2SixNQUFNLHdCQUF3QixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLFdBQVcsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdk0sU0FBUyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxpQkFBaUIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO1FBRTlFLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQXVDLFVBQVcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBRTFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLDJDQUFrQyxDQUFDO1FBQ3JHLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGlCQUFpQixDQUFDLGtEQUEwQyxDQUFDO1FBQzlHLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLHdCQUF3QixDQUFDLDJDQUFrQyxDQUFDO0lBQzlHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJJQUEySSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzVKLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLFlBQVksRUFBRSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoUixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLEVBQTZDLEVBQUUsa0JBQWtCLEtBQUssT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25KLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQXVDLFVBQVcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBRTFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3ZFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlJQUFpSSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xKLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEgsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFMUUsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLDRDQUFtQyxDQUFDO1FBRWpGLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3ZFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtJQUFrSSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ25KLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEgsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFMUUsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLDZDQUFvQyxDQUFDO1FBRWxGLE1BQU0sQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3ZFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlJQUFpSSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xKLE1BQU0sVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDLDRDQUFtQyxDQUFDO1FBRTlGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLHFCQUFxQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLDJDQUFrQyxDQUFDO0lBQ3JKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlIQUFpSCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xJLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLHFCQUFxQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoSCxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUF1QyxVQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUUxRSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsNENBQW1DLENBQUM7UUFFakYsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLEVBQUUsa0dBQWlGLENBQUMsQ0FBQztJQUN0SixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxpRUFBaUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsRixNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRSxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZCLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE1BQXVDLFVBQVcsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBRTFFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQywyQ0FBa0MsQ0FBQztJQUM1RixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywyRUFBMkUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM1RixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsc0NBQXNDLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBQzNILE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLHFCQUFxQixFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2SSxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RJLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDckQsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLDJDQUFrQyxDQUFDO0lBQzVGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdGQUF3RixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pHLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZJLE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEksU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUNyRCxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUF1QyxVQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUMxRSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyw0Q0FBbUMsQ0FBQztRQUU1RixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsMkNBQWtDLENBQUM7SUFDNUYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsbUpBQW1KLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDcEssb0JBQW9CLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLHNDQUFzQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzSCxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkksTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25KLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDckQsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDMUUsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsdUJBQXVCLENBQUMsNENBQW1DLENBQUM7UUFFNUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLDJDQUFrQyxDQUFDO0lBQzVGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFKQUFxSixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3RLLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZJLE1BQU0sdUJBQXVCLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BLLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7UUFDckQsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDMUUsTUFBTSxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsdUJBQXVCLENBQUMsNENBQW1DLENBQUM7UUFFNUYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLHdEQUFnRCxDQUFDO0lBQzFHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdKQUF3SixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pLLG9CQUFvQixDQUFDLElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxzQ0FBc0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0gsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2SixNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDeEosU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLHVCQUF1QixDQUFDLENBQUMsQ0FBQztRQUNyRCxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUF1QyxVQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUMxRSxNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyw0Q0FBbUMsQ0FBQztRQUU1RixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsd0RBQWdELENBQUM7SUFDMUcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0QsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxxREFBNkMsQ0FBQztJQUN2RyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtRkFBbUYsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNwRyxNQUFNLE1BQU0sR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxxQkFBcUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRSxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvRSxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUF1QyxVQUFXLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUUxRSxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsd0RBQWdELENBQUM7SUFDMUcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNkRBQTZELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDOUUsTUFBTSxTQUFTLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEYsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEYsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFFMUUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLHdEQUFnRCxDQUFDO1FBRTVHLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMzQixlQUFlLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBRTVELE1BQU0sY0FBYyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDckIsVUFBVSxFQUFFLGNBQWMsQ0FBQyxVQUFVO2dCQUNyQyxTQUFTLGtDQUEwQjtnQkFDbkMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxRQUFRO2dCQUMvQixlQUFlLEVBQUUsY0FBYyxDQUFDLFFBQVE7Z0JBQ3hDLEtBQUssRUFBRSxjQUFjO2FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLDJDQUFrQyxDQUFDO1FBQzlGLE1BQU0sQ0FBQyxlQUFlLENBQWMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUN4RixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3RUFBd0UsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN6RixNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEosb0JBQW9CLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxFQUE2QyxFQUFFLGtCQUFrQixLQUFLLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUUzRixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLDJDQUFrQyxDQUFDO0lBQ3hILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRFQUE0RSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdGLE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwSixvQkFBb0IsQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLEVBQTZDLEVBQUUsa0JBQWtCLEtBQUssT0FBTyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2xKLFVBQVUsR0FBRyxlQUFlLENBQUMsR0FBRyxDQUFDLElBQUksOEJBQThCLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO1FBRTNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMscURBQTZDLENBQUM7SUFDcEksQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUhBQXVILEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDeEksU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHO1lBQ2pCLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEVBQUUsbUJBQW1CLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDakksZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFDMUcsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNqSSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxFQUFFLG1CQUFtQixFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsQ0FBQztTQUMxRyxDQUFDLENBQUM7UUFDSCxVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDM0IsZUFBZSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUU1RCxNQUFNLFVBQVUsQ0FBQyxvREFBb0QsRUFBRSxDQUFDO1FBQ3hFLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEQsTUFBTSxDQUFDLGVBQWUsQ0FBYyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBRSxDQUFDLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sQ0FBQyxlQUFlLENBQWMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUN4RixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM3RCxNQUFNLFNBQVMsR0FBRyxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0MsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMxQixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLFVBQVUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxTQUFTLENBQUMsNENBQW1DLENBQUM7UUFFOUUsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzNCLGVBQWUsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDNUQsK0JBQStCLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFMUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsNENBQW1DLENBQUM7UUFDL0YsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRCxNQUFNLENBQUMsZUFBZSxDQUFjLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDeEYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNENBQTRDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDN0QsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUN2RCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsOENBQXNDLENBQUM7SUFDaEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUNBQXlDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDMUQsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxzQkFBc0IsRUFBRSxDQUFDLENBQUM7UUFDL0MsVUFBVSxHQUFHLGVBQWUsQ0FBQyxHQUFHLENBQUMsSUFBSSw4QkFBOEIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDM0YsTUFBdUMsVUFBVyxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDMUUsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsOENBQXNDLENBQUM7SUFDaEcsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMERBQTBELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDM0UsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JCLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDdkQsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN0QixVQUFVLEdBQUcsZUFBZSxDQUFDLEdBQUcsQ0FBQyxJQUFJLDhCQUE4QixDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMzRixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsMkNBQWtDLENBQUM7UUFDMUYsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUVoRSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQztRQUM3QixNQUFNLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsOENBQXNDLENBQUM7SUFDL0YsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDLENBQUMsQ0FBQztBQUVILFNBQVMsMkJBQTJCLENBQUMsU0FBaUIsRUFBRSxvQkFBOEM7SUFDckcsT0FBTztRQUNOLEVBQUUsRUFBRSxTQUFTO1FBQ2IsS0FBSyxFQUFFLFNBQVM7UUFDaEIsMEJBQTBCLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxDQUFDLDJCQUEyQixDQUE0QztLQUM1SCxDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsc0NBQXNDLENBQUMsb0JBQThDO0lBQzdGLE1BQU0sOEJBQThCLEdBQUcsMkJBQTJCLENBQUMsY0FBYyxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDekcsTUFBTSwrQkFBK0IsR0FBRywyQkFBMkIsQ0FBQyxlQUFlLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztJQUMzRyxPQUFPLGtDQUFrQyxDQUFDLDhCQUE4QixFQUFFLCtCQUErQixFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ2xILENBQUM7QUFFRCxNQUFNLFVBQVUsa0NBQWtDLENBQUMsOEJBQWlFLEVBQUUsK0JBQWtFLEVBQUUsNEJBQStEO0lBQ3hQLE9BQU87UUFDTixhQUFhLEVBQUUsU0FBUztRQUN4Qiw4QkFBOEI7UUFDOUIsK0JBQStCO1FBQy9CLDRCQUE0QjtRQUM1Qiw0QkFBNEIsRUFBRSxDQUFDLFNBQXFCLEVBQUUsRUFBRTtZQUN2RCxJQUFJLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDaEQsT0FBTyw4QkFBOEIsQ0FBQztZQUN2QyxDQUFDO1lBQ0QsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ3hELE9BQU8sK0JBQStCLENBQUM7WUFDeEMsQ0FBQztZQUNELE9BQU8sNEJBQTRCLENBQUM7UUFDckMsQ0FBQztRQUNELDJCQUEyQixDQUFDLFNBQXFCO1lBQ2hELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM1RCxPQUFPLE1BQU0sS0FBSywrQkFBK0IsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDLENBQUMsTUFBTSxLQUFLLDRCQUE0QixDQUFDLENBQUM7b0JBQzFDLENBQUMsdUNBQStCLENBQUM7UUFDcEMsQ0FBQztLQUNELENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsRUFBVSxFQUFFLFdBQXFDLEVBQUUsSUFBb0I7SUFDL0YsT0FBTyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzFHLENBQUM7QUFFRCxTQUFTLGdCQUFnQixDQUFDLEVBQVUsRUFBRSxXQUF3QyxFQUFFLEVBQUUsYUFBeUMsRUFBRTtJQUM1SCxNQUFNLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEMsUUFBUSxHQUFHLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxHQUFHLFFBQVEsRUFBRSxDQUFDO0lBQzVDLFVBQVUsR0FBRztRQUNaLFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRTtRQUNsQixRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFDO1FBQ2pDLGlCQUFpQixFQUFFLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUU7UUFDMUMsSUFBSSw0QkFBb0I7UUFDeEIsR0FBRyxVQUFVO1FBQ2IsT0FBTyxFQUFFLFVBQVUsQ0FBQyxPQUFPLElBQUksSUFBSTtLQUNuQyxDQUFDO0lBQ0YsVUFBVSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsSUFBSSxpQ0FBeUIsQ0FBQztJQUNoRSxPQUF3QixNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsUUFBUSxFQUFFLEdBQUcsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUNwRSxDQUFDIn0=