/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtensionService as BrowserExtensionService } from 'vs/workbench/services/extensions/browser/extensionService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ExtensionKind, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier, IExtension, IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { createServices, TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustEnablementService } from 'vs/platform/workspace/common/workspaceTrust';
import { WorkspaceTrustEnablementService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { AbstractExtensionService, ExtensionRunningPreference } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import { ExtensionManifestPropertiesService, IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { ExtensionHostKind, ExtensionRunningLocation, IExtensionHost, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TestEnvironmentService, TestFileService, TestLifecycleService, TestRemoteAgentService, TestWebExtensionsScannerService, TestWorkbenchExtensionEnablementService, TestWorkbenchExtensionManagementService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestContextService } from 'vs/workbench/test/common/workbenchTestServices';
import { mock } from 'vs/base/test/common/mock';
import { IExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManager';

suite('BrowserExtensionService', () => {
	test('pickRunningLocation', () => {
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation([], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation([], false, true, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation([], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation([], true, true, ExtensionRunningPreference.None), null);

		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);


		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui'], true, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);


		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web', 'workspace'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'web', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['ui', 'workspace', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);

		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui', 'workspace'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui', 'workspace'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui', 'workspace'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'ui', 'workspace'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace', 'ui'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['web', 'workspace', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);

		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui', 'web'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui', 'web'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui', 'web'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'ui', 'web'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web', 'ui'], false, false, ExtensionRunningPreference.None), null);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web', 'ui'], false, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web', 'ui'], true, false, ExtensionRunningPreference.None), ExtensionHostKind.LocalWebWorker);
		assert.deepStrictEqual(BrowserExtensionService.pickRunningLocation(['workspace', 'web', 'ui'], true, true, ExtensionRunningPreference.None), ExtensionHostKind.Remote);
	});
});

suite('ExtensionService', () => {

	class MyTestExtensionService extends AbstractExtensionService {
		public readonly order: string[] = [];
		protected _pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
			throw new Error('Method not implemented.');
		}
		protected override _doCreateExtensionHostManager(extensionHostId: string, extensionHost: IExtensionHost, isInitialStart: boolean, initialActivationEvents: string[]): IExtensionHostManager {
			const order = this.order;
			order.push(`create ${extensionHostId}`);
			return new class extends mock<IExtensionHostManager>() {
				override onDidExit = Event.None;
				override onDidChangeResponsiveState = Event.None;
				override dispose(): void {
					order.push(`dispose ${extensionHostId}`);
				}
				override representsRunningLocation(runningLocation: ExtensionRunningLocation): boolean {
					return extensionHost.runningLocation.equals(runningLocation);
				}
			};
		}
		protected _createExtensionHost(runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
			return new class extends mock<IExtensionHost>() {
				override runningLocation = runningLocation;
			};
		}
		protected _scanAndHandleExtensions(): Promise<void> {
			throw new Error('Method not implemented.');
		}
		protected _scanSingleExtension(extension: IExtension): Promise<Readonly<IRelaxedExtensionDescription> | null> {
			throw new Error('Method not implemented.');
		}
		public _onExtensionHostExit(code: number): void {
			throw new Error('Method not implemented.');
		}
	}

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let extService: MyTestExtensionService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = createServices(disposables, [
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
			[IProductService, { _serviceBrand: undefined, ...product }],
			[IFileService, TestFileService],
			[IWorkbenchExtensionEnablementService, TestWorkbenchExtensionEnablementService],
			[ITelemetryService, NullTelemetryService],
			[IEnvironmentService, TestEnvironmentService],
			[IWorkspaceTrustEnablementService, WorkspaceTrustEnablementService]
		]);
		extService = <MyTestExtensionService>instantiationService.get(IExtensionService);
	});

	teardown(() => {
		disposables.dispose();
	});

	test('issue #152204: Remote extension host not disposed after closing vscode client', async () => {
		await extService.startExtensionHosts();
		extService.stopExtensionHosts();
		assert.deepStrictEqual(extService.order, (['create 1', 'create 2', 'create 3', 'dispose 3', 'dispose 2', 'dispose 1']));
	});
});
