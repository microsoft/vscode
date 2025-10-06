/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { ExtensionKind, IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { ExtensionIdentifier, IExtension, IExtensionDescription } from '../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService, createServices } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import product from '../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { RemoteAuthorityResolverService } from '../../../../../platform/remote/browser/remoteAuthorityResolverService.js';
import { IRemoteAuthorityResolverService, ResolverResult } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
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
import { AbstractExtensionService, IExtensionHostFactory, ResolvedExtensions } from '../../common/abstractExtensionService.js';
import { ExtensionHostKind, ExtensionRunningPreference } from '../../common/extensionHostKind.js';
import { IExtensionHostManager } from '../../common/extensionHostManagers.js';
import { ExtensionManifestPropertiesService, IExtensionManifestPropertiesService } from '../../common/extensionManifestPropertiesService.js';
import { ExtensionRunningLocation } from '../../common/extensionRunningLocation.js';
import { ExtensionRunningLocationTracker } from '../../common/extensionRunningLocationTracker.js';
import { IExtensionHost, IExtensionService } from '../../common/extensions.js';
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
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], false, true, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation([], true, true, ExtensionRunningPreference.None), null);

		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);


		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);


		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'web', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['ui', 'workspace', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'ui', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['web', 'workspace', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);

		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'ui', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionHostKindPicker.pickRunningLocation(['workspace', 'web', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
	});
});

suite('ExtensionService', () => {

	class MyTestExtensionService extends AbstractExtensionService {

		constructor(
			@IInstantiationService instantiationService: IInstantiationService,
			@INotificationService notificationService: INotificationService,
			@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
			@ITelemetryService telemetryService: ITelemetryService,
			@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
			@IFileService fileService: IFileService,
			@IProductService productService: IProductService,
			@IWorkbenchExtensionManagementService extensionManagementService: IWorkbenchExtensionManagementService,
			@IWorkspaceContextService contextService: IWorkspaceContextService,
			@IConfigurationService configurationService: IConfigurationService,
			@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
			@ILogService logService: ILogService,
			@IRemoteAgentService remoteAgentService: IRemoteAgentService,
			@IRemoteExtensionsScannerService remoteExtensionsScannerService: IRemoteExtensionsScannerService,
			@ILifecycleService lifecycleService: ILifecycleService,
			@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		) {
			const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
			const extensionHostFactory = new class implements IExtensionHostFactory {
				createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
					return new class extends mock<IExtensionHost>() {
						override runningLocation = runningLocation;
					};
				}
			};
			super(
				{ allowRemoteExtensionsInLocalWebWorker: false, hasLocalProcess: true },
				extensionsProposedApi,
				extensionHostFactory,
				null!,
				instantiationService,
				notificationService,
				environmentService,
				telemetryService,
				extensionEnablementService,
				fileService,
				productService,
				extensionManagementService,
				contextService,
				configurationService,
				extensionManifestPropertiesService,
				logService,
				remoteAgentService,
				remoteExtensionsScannerService,
				lifecycleService,
				remoteAuthorityResolverService,
				new TestDialogService()
			);
		}

		private _extHostId = 0;
		public readonly order: string[] = [];
		protected _pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
			throw new Error('Method not implemented.');
		}
		protected override _doCreateExtensionHostManager(extensionHost: IExtensionHost, initialActivationEvents: string[]): IExtensionHostManager {
			const order = this.order;
			const extensionHostId = ++this._extHostId;
			order.push(`create ${extensionHostId}`);
			return new class extends mock<IExtensionHostManager>() {
				override onDidExit = Event.None;
				override onDidChangeResponsiveState = Event.None;
				override disconnect() {
					return Promise.resolve();
				}
				override start(): Promise<void> {
					return Promise.resolve();
				}
				override dispose(): void {
					order.push(`dispose ${extensionHostId}`);
				}
				override representsRunningLocation(runningLocation: ExtensionRunningLocation): boolean {
					return extensionHost.runningLocation.equals(runningLocation);
				}
			};
		}
		protected _resolveExtensions(): AsyncIterable<ResolvedExtensions> {
			throw new Error('Method not implemented.');
		}
		protected _scanSingleExtension(extension: IExtension): Promise<IExtensionDescription | null> {
			throw new Error('Method not implemented.');
		}
		protected _onExtensionHostExit(code: number): Promise<void> {
			throw new Error('Method not implemented.');
		}
		protected _resolveAuthority(remoteAuthority: string): Promise<ResolverResult> {
			throw new Error('Method not implemented.');
		}
	}

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let extService: MyTestExtensionService;

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
		extService = <MyTestExtensionService>instantiationService.get(IExtensionService);
	});

	teardown(async () => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #152204: Remote extension host not disposed after closing vscode client', async () => {
		await extService.startExtensionHosts();
		await extService.stopExtensionHosts('foo');
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3', 'dispose 3', 'dispose 2', 'dispose 1']));
	});

	test('Extension host disposed when awaited', async () => {
		await extService.startExtensionHosts();
		await extService.stopExtensionHosts('foo');
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3', 'dispose 3', 'dispose 2', 'dispose 1']));
	});

	test('Extension host not disposed when vetoed (sync)', async () => {
		await extService.startExtensionHosts();

		disposables.add(extService.onWillStop(e => e.veto(true, 'test 1')));
		disposables.add(extService.onWillStop(e => e.veto(false, 'test 2')));

		await extService.stopExtensionHosts('foo');
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3']));
	});

	test('Extension host not disposed when vetoed (async)', async () => {
		await extService.startExtensionHosts();

		disposables.add(extService.onWillStop(e => e.veto(false, 'test 1')));
		disposables.add(extService.onWillStop(e => e.veto(Promise.resolve(true), 'test 2')));
		disposables.add(extService.onWillStop(e => e.veto(Promise.resolve(false), 'test 3')));

		await extService.stopExtensionHosts('foo');
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3']));
	});
});
