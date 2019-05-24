/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionEnablementService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/product';
import { CommonExtensionService } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import { browserWebSocketFactory } from 'vs/platform/remote/browser/browserWebSocketFactory';
import { ExtensionHostProcessManager } from 'vs/workbench/services/extensions/common/extensionHostProcessManager';
import { RemoteExtensionHostClient, IInitDataProvider } from 'vs/workbench/services/extensions/common/remoteExtensionHostClient';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

export class ExtensionService extends CommonExtensionService implements IExtensionService {

	private _remoteExtensionsEnvironmentData: IRemoteAgentEnvironment | null;

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

		this._remoteExtensionsEnvironmentData = null;
		this._initialize();
	}

	private _createProvider(remoteAuthority: string): IInitDataProvider {
		return {
			remoteAuthority: remoteAuthority,
			getInitData: () => {
				return this.whenInstalledExtensionsRegistered().then(() => {
					return this._remoteExtensionsEnvironmentData!;
				});
			}
		};
	}

	protected _createExtensionHosts(isInitialStart: boolean, initialActivationEvents: string[]): ExtensionHostProcessManager[] {
		const result: ExtensionHostProcessManager[] = [];

		const remoteAgentConnection = this._remoteAgentService.getConnection()!;
		const remoteExtHostProcessWorker = this._instantiationService.createInstance(RemoteExtensionHostClient, this.getExtensions(), this._createProvider(remoteAgentConnection.remoteAuthority), browserWebSocketFactory);
		const remoteExtHostProcessManager = this._instantiationService.createInstance(ExtensionHostProcessManager, false, remoteExtHostProcessWorker, remoteAgentConnection.remoteAuthority, initialActivationEvents);
		result.push(remoteExtHostProcessManager);

		return result;
	}

	protected async _scanAndHandleExtensions(): Promise<void> {
		// fetch the remote environment
		const remoteEnv = (await this._remoteAgentService.getEnvironment())!;

		// enable or disable proposed API per extension
		this._checkEnableProposedApi(remoteEnv.extensions);

		// remove disabled extensions
		remoteEnv.extensions = remoteEnv.extensions.filter(extension => this._isEnabled(extension));

		// save for remote extension's init data
		this._remoteExtensionsEnvironmentData = remoteEnv;

		// this._handleExtensionPoints((<IExtensionDescription[]>[]).concat(remoteEnv.extensions).concat(localExtensions));
		const result = this._registry.deltaExtensions(remoteEnv.extensions, []);
		if (result.removedDueToLooping.length > 0) {
			this._logOrShowMessage(Severity.Error, nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', ')));
		}

		this._doHandleExtensionPoints(this._registry.getAllExtensionDescriptions());
	}

	public _onExtensionHostExit(code: number): void {
		// Expected development extension termination: When the extension host goes down we also shutdown the window
		if (!this._isExtensionDevTestFromCli) {
			this._windowService.closeWindow();
		}

		// When CLI testing make sure to exit with proper exit code
		else {
			console.log(`vscode:exit`, code);
			// ipc.send('vscode:exit', code);
		}
	}
}

registerSingleton(IExtensionService, ExtensionService);
