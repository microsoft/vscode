/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ExtensionKind } from 'vs/platform/environment/common/environment';
import { ExtensionIdentifier, ExtensionType, IExtension, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAutomatedWindow, getLogs } from 'vs/platform/log/browser/log';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteExtensionsScannerService } from 'vs/platform/remote/common/remoteExtensionsScanner';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IWebWorkerExtensionHostDataProvider, IWebWorkerExtensionHostInitData, WebWorkerExtensionHost } from 'vs/workbench/services/extensions/browser/webWorkerExtensionHost';
import { FetchFileSystemProvider } from 'vs/workbench/services/extensions/browser/webWorkerFileSystemProvider';
import { AbstractExtensionService, IExtensionHostFactory, ResolvedExtensions } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import { ExtensionHostKind, ExtensionRunningPreference, IExtensionHostKindPicker, extensionHostKindToString, extensionRunningPreferenceToString } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { ExtensionRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { ExtensionRunningLocationTracker } from 'vs/workbench/services/extensions/common/extensionRunningLocationTracker';
import { ExtensionHostStartup, IExtensionHost, IExtensionService, toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsProposedApi } from 'vs/workbench/services/extensions/common/extensionsProposedApi';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IRemoteExtensionHostDataProvider, RemoteExtensionHost } from 'vs/workbench/services/extensions/common/remoteExtensionHost';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IUserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class ExtensionService extends AbstractExtensionService implements IExtensionService {

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
		@IWebExtensionsScannerService private readonly _webExtensionsScannerService: IWebExtensionsScannerService,
		@ILogService logService: ILogService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRemoteExtensionsScannerService remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IUserDataInitializationService private readonly _userDataInitializationService: IUserDataInitializationService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
	) {
		const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
		const extensionHostFactory = new BrowserExtensionHostFactory(
			() => this._getExtensions(),
			instantiationService,
			remoteAgentService,
			remoteAuthorityResolverService
		);
		super(
			extensionsProposedApi,
			extensionHostFactory,
			new BrowserExtensionHostKindPicker(logService),
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
			lifecycleService
		);

		// Initialize installed extensions first and do it only after workbench is ready
		lifecycleService.when(LifecyclePhase.Ready).then(async () => {
			await this._userDataInitializationService.initializeInstalledExtensions(this._instantiationService);
			this._initialize();
		});

		this._initFetchFileSystem();
	}

	protected async _scanSingleExtension(extension: IExtension): Promise<IExtensionDescription | null> {
		if (extension.location.scheme === Schemas.vscodeRemote) {
			return this._remoteExtensionsScannerService.scanSingleExtension(extension.location, extension.type === ExtensionType.System);
		}

		const scannedExtension = await this._webExtensionsScannerService.scanExistingExtension(extension.location, extension.type, this._userDataProfileService.currentProfile.extensionsResource);
		if (scannedExtension) {
			return toExtensionDescription(scannedExtension);
		}

		return null;
	}

	private _initFetchFileSystem(): void {
		const provider = new FetchFileSystemProvider();
		this._register(this._fileService.registerProvider(Schemas.http, provider));
		this._register(this._fileService.registerProvider(Schemas.https, provider));
	}

	private async _scanWebExtensions(): Promise<IExtensionDescription[]> {
		const system: IExtensionDescription[] = [], user: IExtensionDescription[] = [], development: IExtensionDescription[] = [];
		try {
			await Promise.all([
				this._webExtensionsScannerService.scanSystemExtensions().then(extensions => system.push(...extensions.map(e => toExtensionDescription(e)))),
				this._webExtensionsScannerService.scanUserExtensions(this._userDataProfileService.currentProfile.extensionsResource, { skipInvalidExtensions: true }).then(extensions => user.push(...extensions.map(e => toExtensionDescription(e)))),
				this._webExtensionsScannerService.scanExtensionsUnderDevelopment().then(extensions => development.push(...extensions.map(e => toExtensionDescription(e, true))))
			]);
		} catch (error) {
			this._logService.error(error);
		}
		return dedupExtensions(system, user, development, this._logService);
	}

	protected async _resolveExtensions(): Promise<ResolvedExtensions> {
		// fetch the remote environment
		const [localExtensions, remoteExtensions] = await Promise.all([
			this._scanWebExtensions(),
			this._remoteExtensionsScannerService.scanExtensions()
		]);

		return new ResolvedExtensions(localExtensions, remoteExtensions, /*hasLocalProcess*/false, /*allowRemoteExtensionsInLocalWebWorker*/true);
	}

	protected async _onExtensionHostExit(code: number): Promise<void> {
		// Dispose everything associated with the extension host
		this._doStopExtensionHosts();

		// If we are running extension tests, forward logs and exit code
		const automatedWindow = window as unknown as IAutomatedWindow;
		if (typeof automatedWindow.codeAutomationExit === 'function') {
			automatedWindow.codeAutomationExit(await getLogs(this._fileService, this._environmentService), code);
		}
	}
}

class BrowserExtensionHostFactory implements IExtensionHostFactory {

	constructor(
		private readonly _getExtensions: () => Promise<IExtensionDescription[]>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
	) { }

	createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		switch (runningLocation.kind) {
			case ExtensionHostKind.LocalProcess: {
				return null;
			}
			case ExtensionHostKind.LocalWebWorker: {
				return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, ExtensionHostStartup.EagerAutoStart, this._createLocalExtensionHostDataProvider(runningLocations, runningLocation));
			}
			case ExtensionHostKind.Remote: {
				const remoteAgentConnection = this._remoteAgentService.getConnection();
				if (remoteAgentConnection) {
					return this._instantiationService.createInstance(RemoteExtensionHost, runningLocation, this._createRemoteExtensionHostDataProvider(runningLocations, remoteAgentConnection.remoteAuthority), this._remoteAgentService.socketFactory);
				}
				return null;
			}
		}
	}

	private _createLocalExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, desiredRunningLocation: ExtensionRunningLocation): IWebWorkerExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<IWebWorkerExtensionHostInitData> => {
				const allExtensions = await this._getExtensions();
				const localWebWorkerExtensions = runningLocations.filterByRunningLocation(allExtensions, desiredRunningLocation);
				return {
					allExtensions: allExtensions,
					myExtensions: localWebWorkerExtensions.map(extension => extension.identifier)
				};
			}
		};
	}

	private _createRemoteExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, remoteAuthority: string): IRemoteExtensionHostDataProvider {
		return {
			remoteAuthority: remoteAuthority,
			getInitData: async () => {
				const allExtensions = await this._getExtensions();

				const remoteEnv = await this._remoteAgentService.getEnvironment();
				if (!remoteEnv) {
					throw new Error('Cannot provide init data for remote extension host!');
				}

				const myExtensions = runningLocations.filterByExtensionHostKind(allExtensions, ExtensionHostKind.Remote);

				const initData = {
					connectionData: this._remoteAuthorityResolverService.getConnectionData(remoteAuthority),
					pid: remoteEnv.pid,
					appRoot: remoteEnv.appRoot,
					extensionHostLogsPath: remoteEnv.extensionHostLogsPath,
					globalStorageHome: remoteEnv.globalStorageHome,
					workspaceStorageHome: remoteEnv.workspaceStorageHome,
					allExtensions: allExtensions,
					myExtensions: myExtensions.map(extension => extension.identifier),
				};

				return initData;
			}
		};
	}
}

export class BrowserExtensionHostKindPicker implements IExtensionHostKindPicker {

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
		const result = BrowserExtensionHostKindPicker.pickRunningLocation(extensionKinds, isInstalledLocally, isInstalledRemotely, preference);
		this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(', ')}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
		return result;
	}

	public static pickRunningLocation(extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
		const result: ExtensionHostKind[] = [];
		let canRunRemotely = false;
		for (const extensionKind of extensionKinds) {
			if (extensionKind === 'ui' && isInstalledRemotely) {
				// ui extensions run remotely if possible (but only as a last resort)
				if (preference === ExtensionRunningPreference.Remote) {
					return ExtensionHostKind.Remote;
				} else {
					canRunRemotely = true;
				}
			}
			if (extensionKind === 'workspace' && isInstalledRemotely) {
				// workspace extensions run remotely if possible
				if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Remote) {
					return ExtensionHostKind.Remote;
				} else {
					result.push(ExtensionHostKind.Remote);
				}
			}
			if (extensionKind === 'web' && (isInstalledLocally || isInstalledRemotely)) {
				// web worker extensions run in the local web worker if possible
				if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
					return ExtensionHostKind.LocalWebWorker;
				} else {
					result.push(ExtensionHostKind.LocalWebWorker);
				}
			}
		}
		if (canRunRemotely) {
			result.push(ExtensionHostKind.Remote);
		}
		return (result.length > 0 ? result[0] : null);
	}
}

registerSingleton(IExtensionService, ExtensionService, InstantiationType.Eager);
