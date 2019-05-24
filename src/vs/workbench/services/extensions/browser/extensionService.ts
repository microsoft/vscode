/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/product';
import { AbstractExtensionService, IExtensionScanner } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import { browserWebSocketFactory } from 'vs/platform/remote/browser/browserWebSocketFactory';
import { Translations, ILog } from 'vs/workbench/services/extensions/common/extensionPoints';
import { Event } from 'vs/base/common/event';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';

class NullExtensionScanner implements IExtensionScanner {
	readonly scannedExtensions: Promise<IExtensionDescription[]> = Promise.resolve([]);
	readonly translationConfig: Promise<Translations>;

	public async scanSingleExtension(path: string, isBuiltin: boolean, log: ILog): Promise<IExtensionDescription | null> {
		return null;
	}
	public async startScanningExtensions(log: ILog): Promise<void> {
	}
}


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
			new NullExtensionScanner(),
			browserWebSocketFactory,
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
		return new class implements IExtensionHostStarter {
			onExit = Event.None;
			start(): Promise<IMessagePassingProtocol> | null {
				return new Promise<IMessagePassingProtocol>((c, e) => {

				});
			}
			getInspectPort(): number | undefined {
				throw new Error('Method not implemented.');
			}
			dispose(): void {
				throw new Error('Method not implemented.');
			}
		};
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

