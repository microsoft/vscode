/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionKind } from '../../../../platform/environment/common/environment.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAutomatedWindow, getLogs } from '../../../../platform/log/browser/log.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { PersistentConnectionEventType } from '../../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, ResolverResult } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IRemoteExtensionsScannerService } from '../../../../platform/remote/common/remoteExtensionsScanner.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IWebExtensionsScannerService, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { IWebWorkerExtensionHostDataProvider, IWebWorkerExtensionHostInitData, WebWorkerExtensionHost } from './webWorkerExtensionHost.js';
import { FetchFileSystemProvider } from './webWorkerFileSystemProvider.js';
import { AbstractExtensionService, IExtensionHostFactory, LocalExtensions, RemoteExtensions, ResolvedExtensions, ResolverExtensions, checkEnabledAndProposedAPI, isResolverExtension } from '../common/abstractExtensionService.js';
import { ExtensionDescriptionRegistrySnapshot } from '../common/extensionDescriptionRegistry.js';
import { ExtensionHostKind, ExtensionRunningPreference, IExtensionHostKindPicker, extensionHostKindToString, extensionRunningPreferenceToString } from '../common/extensionHostKind.js';
import { IExtensionManifestPropertiesService } from '../common/extensionManifestPropertiesService.js';
import { ExtensionRunningLocation } from '../common/extensionRunningLocation.js';
import { ExtensionRunningLocationTracker, filterExtensionDescriptions } from '../common/extensionRunningLocationTracker.js';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost, IExtensionService, toExtensionDescription } from '../common/extensions.js';
import { ExtensionsProposedApi } from '../common/extensionsProposedApi.js';
import { dedupExtensions } from '../common/extensionsUtil.js';
import { IRemoteExtensionHostDataProvider, IRemoteExtensionHostInitData, RemoteExtensionHost } from '../common/remoteExtensionHost.js';
import { ILifecycleService, LifecyclePhase } from '../../lifecycle/common/lifecycle.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IRemoteExplorerService } from '../../remote/common/remoteExplorerService.js';
import { IUserDataInitializationService } from '../../userData/browser/userDataInit.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { AsyncIterableEmitter, AsyncIterableProducer } from '../../../../base/common/async.js';

export class ExtensionService extends AbstractExtensionService implements IExtensionService {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotificationService notificationService: INotificationService,
		@IBrowserWorkbenchEnvironmentService private readonly _browserEnvironmentService: IBrowserWorkbenchEnvironmentService,
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
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IRemoteExplorerService private readonly _remoteExplorerService: IRemoteExplorerService,
		@IDialogService dialogService: IDialogService,
	) {
		const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
		const extensionHostFactory = new BrowserExtensionHostFactory(
			extensionsProposedApi,
			() => this._scanWebExtensions(),
			() => this._getExtensionRegistrySnapshotWhenReady(),
			instantiationService,
			remoteAgentService,
			remoteAuthorityResolverService,
			extensionEnablementService,
			logService
		);
		super(
			{ hasLocalProcess: false, allowRemoteExtensionsInLocalWebWorker: true },
			extensionsProposedApi,
			extensionHostFactory,
			new BrowserExtensionHostKindPicker(logService),
			instantiationService,
			notificationService,
			_browserEnvironmentService,
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
			dialogService
		);

		// Initialize installed extensions first and do it only after workbench is ready
		lifecycleService.when(LifecyclePhase.Ready).then(async () => {
			await this._userDataInitializationService.initializeInstalledExtensions(this._instantiationService);
			this._initialize();
		});

		this._initFetchFileSystem();
	}

	private _initFetchFileSystem(): void {
		const provider = new FetchFileSystemProvider();
		this._register(this._fileService.registerProvider(Schemas.http, provider));
		this._register(this._fileService.registerProvider(Schemas.https, provider));
	}

	private _scanWebExtensionsPromise: Promise<IExtensionDescription[]> | undefined;
	private async _scanWebExtensions(): Promise<IExtensionDescription[]> {
		if (!this._scanWebExtensionsPromise) {
			this._scanWebExtensionsPromise = (async () => {
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
				return dedupExtensions(system, user, [], development, this._logService);
			})();
		}
		return this._scanWebExtensionsPromise;
	}

	private async _resolveExtensionsDefault(emitter: AsyncIterableEmitter<ResolvedExtensions>) {
		const [localExtensions, remoteExtensions] = await Promise.all([
			this._scanWebExtensions(),
			this._remoteExtensionsScannerService.scanExtensions()
		]);

		if (remoteExtensions.length) {
			emitter.emitOne(new RemoteExtensions(remoteExtensions));
		}
		emitter.emitOne(new LocalExtensions(localExtensions));
	}

	protected _resolveExtensions(): AsyncIterable<ResolvedExtensions> {
		return new AsyncIterableProducer(emitter => this._doResolveExtensions(emitter));
	}

	private async _doResolveExtensions(emitter: AsyncIterableEmitter<ResolvedExtensions>): Promise<void> {
		if (!this._browserEnvironmentService.expectsResolverExtension) {
			return this._resolveExtensionsDefault(emitter);
		}

		const remoteAuthority = this._environmentService.remoteAuthority!;

		// Now that the canonical URI provider has been registered, we need to wait for the trust state to be
		// calculated. The trust state will be used while resolving the authority, however the resolver can
		// override the trust state through the resolver result.
		await this._workspaceTrustManagementService.workspaceResolved;

		const localExtensions = await this._scanWebExtensions();
		const resolverExtensions = localExtensions.filter(extension => isResolverExtension(extension));
		if (resolverExtensions.length) {
			emitter.emitOne(new ResolverExtensions(resolverExtensions));
		}

		let resolverResult: ResolverResult;
		try {
			resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
		} catch (err) {
			if (RemoteAuthorityResolverError.isHandled(err)) {
				console.log(`Error handled: Not showing a notification for the error`);
			}
			this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);

			// Proceed with the local extension host
			return this._resolveExtensionsDefault(emitter);
		}

		// set the resolved authority
		this._remoteAuthorityResolverService._setResolvedAuthority(resolverResult.authority, resolverResult.options);
		this._remoteExplorerService.setTunnelInformation(resolverResult.tunnelInformation);

		// monitor for breakage
		const connection = this._remoteAgentService.getConnection();
		if (connection) {
			this._register(connection.onDidStateChange(async (e) => {
				if (e.type === PersistentConnectionEventType.ConnectionLost) {
					this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
				}
			}));
			this._register(connection.onReconnecting(() => this._resolveAuthorityAgain()));
		}

		return this._resolveExtensionsDefault(emitter);
	}

	protected async _onExtensionHostExit(code: number): Promise<void> {
		// Dispose everything associated with the extension host
		await this._doStopExtensionHosts();

		// If we are running extension tests, forward logs and exit code
		const automatedWindow = mainWindow as unknown as IAutomatedWindow;
		if (typeof automatedWindow.codeAutomationExit === 'function') {
			automatedWindow.codeAutomationExit(code, await getLogs(this._fileService, this._environmentService));
		}
	}

	protected async _resolveAuthority(remoteAuthority: string): Promise<ResolverResult> {
		return this._resolveAuthorityOnExtensionHosts(ExtensionHostKind.LocalWebWorker, remoteAuthority);
	}
}

class BrowserExtensionHostFactory implements IExtensionHostFactory {

	constructor(
		private readonly _extensionsProposedApi: ExtensionsProposedApi,
		private readonly _scanWebExtensions: () => Promise<IExtensionDescription[]>,
		private readonly _getExtensionRegistrySnapshotWhenReady: () => Promise<ExtensionDescriptionRegistrySnapshot>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@ILogService private readonly _logService: ILogService,
	) { }

	createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		switch (runningLocation.kind) {
			case ExtensionHostKind.LocalProcess: {
				return null;
			}
			case ExtensionHostKind.LocalWebWorker: {
				const startup = (
					isInitialStart
						? ExtensionHostStartup.EagerManualStart
						: ExtensionHostStartup.EagerAutoStart
				);
				return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createLocalExtensionHostDataProvider(runningLocations, runningLocation, isInitialStart));
			}
			case ExtensionHostKind.Remote: {
				const remoteAgentConnection = this._remoteAgentService.getConnection();
				if (remoteAgentConnection) {
					return this._instantiationService.createInstance(RemoteExtensionHost, runningLocation, this._createRemoteExtensionHostDataProvider(runningLocations, remoteAgentConnection.remoteAuthority));
				}
				return null;
			}
		}
	}

	private _createLocalExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, desiredRunningLocation: ExtensionRunningLocation, isInitialStart: boolean): IWebWorkerExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<IWebWorkerExtensionHostInitData> => {
				if (isInitialStart) {
					// Here we load even extensions that would be disabled by workspace trust
					const localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, await this._scanWebExtensions(), /* ignore workspace trust */true);
					const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
					const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
					const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map(extension => extension.identifier));
					return { extensions };
				} else {
					// restart case
					const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
					const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
					const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));
					return { extensions };
				}
			}
		};
	}

	private _createRemoteExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, remoteAuthority: string): IRemoteExtensionHostDataProvider {
		return {
			remoteAuthority: remoteAuthority,
			getInitData: async (): Promise<IRemoteExtensionHostInitData> => {
				const snapshot = await this._getExtensionRegistrySnapshotWhenReady();

				const remoteEnv = await this._remoteAgentService.getEnvironment();
				if (!remoteEnv) {
					throw new Error('Cannot provide init data for remote extension host!');
				}

				const myExtensions = runningLocations.filterByExtensionHostKind(snapshot.extensions, ExtensionHostKind.Remote);
				const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));

				return {
					connectionData: this._remoteAuthorityResolverService.getConnectionData(remoteAuthority),
					pid: remoteEnv.pid,
					appRoot: remoteEnv.appRoot,
					extensionHostLogsPath: remoteEnv.extensionHostLogsPath,
					globalStorageHome: remoteEnv.globalStorageHome,
					workspaceStorageHome: remoteEnv.workspaceStorageHome,
					extensions,
				};
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
