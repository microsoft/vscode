/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer as ipc } from 'electron';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionEnablementService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IExtensionService, IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionHostProcessWorker } from 'vs/workbench/services/extensions/electron-browser/extensionHost';
import { CachedExtensionScanner } from 'vs/workbench/services/extensions/electron-browser/cachedExtensionScanner';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { nodeWebSocketFactory } from 'vs/platform/remote/node/nodeWebSocketFactory';
import { IProductService } from 'vs/platform/product/common/product';
import { AbstractExtensionService } from 'vs/workbench/services/extensions/common/abstractExtensionService';

export class ExtensionService extends AbstractExtensionService implements IExtensionService {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionEnablementService extensionEnablementService: IExtensionEnablementService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IWindowService windowService: IWindowService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService
	) {
		super(
			instantiationService.createInstance(CachedExtensionScanner),
			nodeWebSocketFactory,
			instantiationService,
			notificationService,
			environmentService,
			telemetryService,
			extensionEnablementService,
			extensionManagementService,
			windowService,
			remoteAgentService,
			remoteAuthorityResolverService,
			configurationService,
			lifecycleService,
			fileService,
			productService,
		);
	}

	protected _createLocalExtHostProcessWorker(autoStart: boolean, extensions: Promise<IExtensionDescription[]>): IExtensionHostStarter {
		return this._instantiationService.createInstance(ExtensionHostProcessWorker, autoStart, extensions, this._extensionHostLogsLocation);
	}

	public _onExtensionHostExit(code: number): void {
		// Expected development extension termination: When the extension host goes down we also shutdown the window
		if (!this._isExtensionDevTestFromCli) {
			this._windowService.closeWindow();
		}

		// When CLI testing make sure to exit with proper exit code
		else {
			ipc.send('vscode:exit', code);
		}
	}
}

registerSingleton(IExtensionService, ExtensionService);

