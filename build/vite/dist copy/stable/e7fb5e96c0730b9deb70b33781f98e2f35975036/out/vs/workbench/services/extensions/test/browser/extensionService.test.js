/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { createServices } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import product from '../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { RemoteAuthorityResolverService } from '../../../../../platform/remote/browser/remoteAuthorityResolverService.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteExtensionsScannerService } from '../../../../../platform/remote/common/remoteExtensionsScanner.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUserDataProfilesService, UserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../../extensionManagement/common/extensionManagement.js';
import { BrowserExtensionHostKindPicker } from '../../browser/extensionService.js';
import { AbstractExtensionService } from '../../common/abstractExtensionService.js';
import { ExtensionManifestPropertiesService, IExtensionManifestPropertiesService } from '../../common/extensionManifestPropertiesService.js';
import { IExtensionService } from '../../common/extensions.js';
import { ExtensionsProposedApi } from '../../common/extensionsProposedApi.js';
import { ILifecycleService } from '../../../lifecycle/common/lifecycle.js';
import { IRemoteAgentService } from '../../../remote/common/remoteAgentService.js';
import { IUserDataProfileService } from '../../../userDataProfile/common/userDataProfile.js';
import { WorkspaceTrustEnablementService } from '../../../workspaces/common/workspaceTrust.js';
import { TestEnvironmentService, TestLifecycleService, TestRemoteAgentService, TestRemoteExtensionsScannerService, TestWebExtensionsScannerService, TestWorkbenchExtensionEnablementService, TestWorkbenchExtensionManagementService } from '../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestFileService, TestUserDataProfileService } from '../../../../test/common/workbenchTestServices.js';
suite('BrowserExtensionService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('pickRunningLocation', () => {
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], false, true, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], true, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], true, true, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], true, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], true, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], false, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], true, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], true, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], true, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], false, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], true, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], false, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], true, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], false, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], true, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], false, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], true, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], false, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], true, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], false, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], true, true, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], false, false, 0 /* ExtensionRunningPreference.None */), null);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], false, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], true, false, 0 /* ExtensionRunningPreference.None */), 2 /* ExtensionHostKind.LocalWebWorker */);
        assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], true, true, 0 /* ExtensionRunningPreference.None */), 3 /* ExtensionHostKind.Remote */);
    });
});
suite('ExtensionService', () => {
    let MyTestExtensionService = class MyTestExtensionService extends AbstractExtensionService {
        constructor(instantiationService, notificationService, environmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService) {
            const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
            const extensionHostFactory = new class {
                createExtensionHost(runningLocations, runningLocation, isInitialStart) {
                    return new class extends mock() {
                        constructor() {
                            super(...arguments);
                            this.runningLocation = runningLocation;
                        }
                    };
                }
            };
            super({ allowRemoteExtensionsInLocalWebWorker: false, hasLocalProcess: true }, extensionsProposedApi, extensionHostFactory, null, instantiationService, notificationService, environmentService, telemetryService, extensionEnablementService, fileService, productService, extensionManagementService, contextService, configurationService, extensionManifestPropertiesService, logService, remoteAgentService, remoteExtensionsScannerService, lifecycleService, remoteAuthorityResolverService, new TestDialogService());
            this._extHostId = 0;
            this.order = [];
            this.activationEvents = [];
            this.remoteExtHostIsReady = true;
            this.localExtHostIsReady = true;
            this._initializeIfNeeded();
        }
        _pickExtensionHostKind(extensionId, extensionKinds, isInstalledLocally, isInstalledRemotely, preference) {
            throw new Error('Method not implemented.');
        }
        _doCreateExtensionHostManager(extensionHost, initialActivationEvents) {
            const order = this.order;
            const activationEvents = this.activationEvents;
            const extService = this;
            const extensionHostId = ++this._extHostId;
            const extHostKind = extensionHost.runningLocation.kind;
            order.push(`create ${extensionHostId}`);
            return new class extends mock() {
                constructor() {
                    super(...arguments);
                    this.onDidExit = Event.None;
                    this.onDidChangeResponsiveState = Event.None;
                    this.kind = extHostKind;
                }
                get isReady() { return extHostKind === 3 /* ExtensionHostKind.Remote */ ? extService.remoteExtHostIsReady : extService.localExtHostIsReady; }
                disconnect() {
                    return Promise.resolve();
                }
                start() {
                    return Promise.resolve();
                }
                dispose() {
                    order.push(`dispose ${extensionHostId}`);
                }
                representsRunningLocation(runningLocation) {
                    return extensionHost.runningLocation.equals(runningLocation);
                }
                activateByEvent(event, activationKind) {
                    activationEvents.push({ event, activationKind, kind: extHostKind });
                    return Promise.resolve();
                }
                ready() {
                    return Promise.resolve();
                }
            };
        }
        async *_resolveExtensions() {
            // Return empty iterable - no extensions to resolve in tests
        }
        _scanSingleExtension(extension) {
            throw new Error('Method not implemented.');
        }
        _onExtensionHostExit(code) {
            throw new Error('Method not implemented.');
        }
        _resolveAuthority(remoteAuthority) {
            throw new Error('Method not implemented.');
        }
    };
    MyTestExtensionService = __decorate([
        __param(0, IInstantiationService),
        __param(1, INotificationService),
        __param(2, IWorkbenchEnvironmentService),
        __param(3, ITelemetryService),
        __param(4, IWorkbenchExtensionEnablementService),
        __param(5, IFileService),
        __param(6, IProductService),
        __param(7, IWorkbenchExtensionManagementService),
        __param(8, IWorkspaceContextService),
        __param(9, IConfigurationService),
        __param(10, IExtensionManifestPropertiesService),
        __param(11, ILogService),
        __param(12, IRemoteAgentService),
        __param(13, IRemoteExtensionsScannerService),
        __param(14, ILifecycleService),
        __param(15, IRemoteAuthorityResolverService)
    ], MyTestExtensionService);
    let disposables;
    let instantiationService;
    let extService;
    setup(() => {
        disposables = new DisposableStore();
        const testProductService = { _serviceBrand: undefined, ...product };
        disposables.add(instantiationService = createServices(disposables, [
            // custom
            [IExtensionService, MyTestExtensionService],
            // default
            [ILifecycleService, TestLifecycleService],
            [IWorkbenchExtensionManagementService, TestWorkbenchExtensionManagementService],
            [INotificationService, TestNotificationService],
            [IRemoteAgentService, TestRemoteAgentService],
            [ILogService, NullLogService],
            [IWebExtensionsScannerService, TestWebExtensionsScannerService],
            [IExtensionManifestPropertiesService, ExtensionManifestPropertiesService],
            [IConfigurationService, TestConfigurationService],
            [IWorkspaceContextService, TestContextService],
            [IProductService, testProductService],
            [IFileService, TestFileService],
            [IWorkbenchExtensionEnablementService, TestWorkbenchExtensionEnablementService],
            [ITelemetryService, NullTelemetryService],
            [IEnvironmentService, TestEnvironmentService],
            [IWorkspaceTrustEnablementService, WorkspaceTrustEnablementService],
            [IUserDataProfilesService, UserDataProfilesService],
            [IUserDataProfileService, TestUserDataProfileService],
            [IUriIdentityService, UriIdentityService],
            [IRemoteExtensionsScannerService, TestRemoteExtensionsScannerService],
            [IRemoteAuthorityResolverService, new RemoteAuthorityResolverService(false, undefined, undefined, undefined, testProductService, new NullLogService())]
        ]));
        extService = instantiationService.get(IExtensionService);
    });
    teardown(async () => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #152204: Remote extension host not disposed after closing vscode client', async () => {
        await extService.stopExtensionHosts('foo');
        assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3', 'dispose 3', 'dispose 2', 'dispose 1']));
    });
    test('Extension host disposed when awaited', async () => {
        await extService.stopExtensionHosts('foo');
        assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3', 'dispose 3', 'dispose 2', 'dispose 1']));
    });
    test('Extension host not disposed when vetoed (sync)', async () => {
        disposables.add(extService.onWillStop(e => e.veto(true, 'test 1')));
        disposables.add(extService.onWillStop(e => e.veto(false, 'test 2')));
        await extService.stopExtensionHosts('foo');
        assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3']));
    });
    test('Extension host not disposed when vetoed (async)', async () => {
        disposables.add(extService.onWillStop(e => e.veto(false, 'test 1')));
        disposables.add(extService.onWillStop(e => e.veto(Promise.resolve(true), 'test 2')));
        disposables.add(extService.onWillStop(e => e.veto(Promise.resolve(false), 'test 3')));
        await extService.stopExtensionHosts('foo');
        assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3']));
    });
    test('onWillActivateByEvent includes activationKind for Normal activation', async () => {
        const events = [];
        disposables.add(extService.onWillActivateByEvent(e => events.push(e)));
        await extService.activateByEvent('onTest', 0 /* ActivationKind.Normal */);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].event, 'onTest');
        assert.strictEqual(events[0].activationKind, 0 /* ActivationKind.Normal */);
    });
    test('onWillActivateByEvent includes activationKind for Immediate activation', async () => {
        const events = [];
        disposables.add(extService.onWillActivateByEvent(e => events.push(e)));
        await extService.activateByEvent('onTest', 1 /* ActivationKind.Immediate */);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].event, 'onTest');
        assert.strictEqual(events[0].activationKind, 1 /* ActivationKind.Immediate */);
    });
    test('Immediate activation includes ready remote extension hosts (issue #297019)', async () => {
        extService.activationEvents.length = 0; // Clear any initial activations
        await extService.activateByEvent('onTest', 1 /* ActivationKind.Immediate */);
        // When remote host is ready, Immediate activation should include it
        const activatedKinds = extService.activationEvents.map(e => e.kind);
        assert.ok(activatedKinds.includes(1 /* ExtensionHostKind.LocalProcess */), 'Should activate on LocalProcess');
        assert.ok(activatedKinds.includes(2 /* ExtensionHostKind.LocalWebWorker */), 'Should activate on LocalWebWorker');
        assert.ok(activatedKinds.includes(3 /* ExtensionHostKind.Remote */), 'Should activate on ready Remote host');
    });
    test('Immediate activation excludes not-ready remote extension hosts', async () => {
        extService.remoteExtHostIsReady = false;
        extService.activationEvents.length = 0; // Clear any initial activations
        await extService.activateByEvent('onTest', 1 /* ActivationKind.Immediate */);
        // When remote host is not ready, Immediate activation should skip it
        const activatedKinds = extService.activationEvents.map(e => e.kind);
        assert.ok(activatedKinds.includes(1 /* ExtensionHostKind.LocalProcess */), 'Should activate on LocalProcess');
        assert.ok(activatedKinds.includes(2 /* ExtensionHostKind.LocalWebWorker */), 'Should activate on LocalWebWorker');
        assert.ok(!activatedKinds.includes(3 /* ExtensionHostKind.Remote */), 'Should NOT activate on not-ready Remote host');
    });
    test('Immediate activation still activates local extension hosts even when not ready', async () => {
        extService.localExtHostIsReady = false;
        extService.activationEvents.length = 0; // Clear any initial activations
        await extService.activateByEvent('onTest', 1 /* ActivationKind.Immediate */);
        // Local hosts should always be activated for Immediate, regardless of isReady
        const activatedKinds = extService.activationEvents.map(e => e.kind);
        assert.ok(activatedKinds.includes(1 /* ExtensionHostKind.LocalProcess */), 'Should activate on LocalProcess even when not ready');
        assert.ok(activatedKinds.includes(2 /* ExtensionHostKind.LocalWebWorker */), 'Should activate on LocalWebWorker even when not ready');
    });
    test('Normal activation activates all extension hosts', async () => {
        extService.activationEvents.length = 0; // Clear any initial activations
        await extService.activateByEvent('onTest', 0 /* ActivationKind.Normal */);
        // Should activate on all hosts
        const activatedKinds = extService.activationEvents.map(e => e.kind);
        assert.ok(activatedKinds.includes(1 /* ExtensionHostKind.LocalProcess */), 'Should activate on LocalProcess');
        assert.ok(activatedKinds.includes(2 /* ExtensionHostKind.LocalWebWorker */), 'Should activate on LocalWebWorker');
        assert.ok(activatedKinds.includes(3 /* ExtensionHostKind.Remote */), 'Should activate on Remote');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uU2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvdGVzdC9icm93c2VyL2V4dGVuc2lvblNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDckcsT0FBTyxFQUFpQixtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRS9HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQTRCLGNBQWMsRUFBRSxNQUFNLCtFQUErRSxDQUFDO0FBQ3pJLE9BQU8sRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbkcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDdEgs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