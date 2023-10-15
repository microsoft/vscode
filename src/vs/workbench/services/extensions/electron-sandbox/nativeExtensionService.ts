/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { runWhenIdle } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Schemas } from 'vs/base/common/network';
import * as performance from 'vs/base/common/performance';
import { isCI } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ExtensionKind } from 'vs/platform/environment/common/environment';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionIdentifier, ExtensionType, IExtension, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/common/native';
import { INotificationService, IPromptChoice, NotificationPriority, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { PersistentConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IRemoteAuthorityResolverService, RemoteConnectionType, RemoteAuthorityResolverError, ResolverResult, getRemoteAuthorityPrefix } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteExtensionsScannerService } from 'vs/platform/remote/common/remoteExtensionsScanner';
import { getRemoteName, parseAuthorityWithPort } from 'vs/platform/remote/common/remoteHosts';
import { updateProxyConfigurationsScope } from 'vs/platform/request/common/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { EnablementState, IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IWebWorkerExtensionHostDataProvider, IWebWorkerExtensionHostInitData, WebWorkerExtensionHost } from 'vs/workbench/services/extensions/browser/webWorkerExtensionHost';
import { AbstractExtensionService, ExtensionHostCrashTracker, IExtensionHostFactory, ResolvedExtensions, checkEnabledAndProposedAPI, extensionIsEnabled } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import { ExtensionDescriptionRegistrySnapshot } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { ExtensionHostKind, ExtensionRunningPreference, IExtensionHostKindPicker, extensionHostKindToString, extensionRunningPreferenceToString } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { IExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManager';
import { ExtensionHostExitCode } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { ExtensionRunningLocation, LocalProcessRunningLocation, LocalWebWorkerRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { ExtensionRunningLocationTracker, filterExtensionDescriptions } from 'vs/workbench/services/extensions/common/extensionRunningLocationTracker';
import { ExtensionHostExtensions, ExtensionHostStartup, IExtensionHost, IExtensionService, WebWorkerExtHostConfigValue, toExtension, webWorkerExtHostConfig } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsProposedApi } from 'vs/workbench/services/extensions/common/extensionsProposedApi';
import { IRemoteExtensionHostDataProvider, IRemoteExtensionHostInitData, RemoteExtensionHost } from 'vs/workbench/services/extensions/common/remoteExtensionHost';
import { CachedExtensionScanner } from 'vs/workbench/services/extensions/electron-sandbox/cachedExtensionScanner';
import { ILocalProcessExtensionHostDataProvider, ILocalProcessExtensionHostInitData, NativeLocalProcessExtensionHost } from 'vs/workbench/services/extensions/electron-sandbox/localProcessExtensionHost';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';

export class NativeExtensionService extends AbstractExtensionService implements IExtensionService {

	private readonly _extensionScanner: CachedExtensionScanner;
	private readonly _localCrashTracker = new ExtensionHostCrashTracker();

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
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IHostService private readonly _hostService: IHostService,
		@IRemoteExplorerService private readonly _remoteExplorerService: IRemoteExplorerService,
		@IExtensionGalleryService private readonly _extensionGalleryService: IExtensionGalleryService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IDialogService dialogService: IDialogService,
	) {
		const extensionsProposedApi = instantiationService.createInstance(ExtensionsProposedApi);
		const extensionScanner = instantiationService.createInstance(CachedExtensionScanner);
		const extensionHostFactory = new NativeExtensionHostFactory(
			extensionsProposedApi,
			extensionScanner,
			() => this._getExtensionRegistrySnapshotWhenReady(),
			instantiationService,
			environmentService,
			extensionEnablementService,
			configurationService,
			remoteAgentService,
			remoteAuthorityResolverService,
			logService
		);
		super(
			extensionsProposedApi,
			extensionHostFactory,
			new NativeExtensionHostKindPicker(environmentService, configurationService, logService),
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
			dialogService
		);

		this._extensionScanner = extensionScanner;

		// delay extension host creation and extension scanning
		// until the workbench is running. we cannot defer the
		// extension host more (LifecyclePhase.Restored) because
		// some editors require the extension host to restore
		// and this would result in a deadlock
		// see https://github.com/microsoft/vscode/issues/41322
		lifecycleService.when(LifecyclePhase.Ready).then(() => {
			// reschedule to ensure this runs after restoring viewlets, panels, and editors
			runWhenIdle(() => {
				this._initialize();
			}, 50 /*max delay*/);
		});
	}

	protected _scanSingleExtension(extension: IExtension): Promise<IExtensionDescription | null> {
		if (extension.location.scheme === Schemas.vscodeRemote) {
			return this._remoteExtensionsScannerService.scanSingleExtension(extension.location, extension.type === ExtensionType.System);
		}

		return this._extensionScanner.scanSingleExtension(extension.location.fsPath, extension.type === ExtensionType.System);
	}

	private async _scanAllLocalExtensions(): Promise<IExtensionDescription[]> {
		return this._extensionScanner.scannedExtensions;
	}

	protected override _onExtensionHostCrashed(extensionHost: IExtensionHostManager, code: number, signal: string | null): void {

		const activatedExtensions: ExtensionIdentifier[] = [];
		const extensionsStatus = this.getExtensionsStatus();
		for (const key of Object.keys(extensionsStatus)) {
			const extensionStatus = extensionsStatus[key];
			if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
				activatedExtensions.push(extensionStatus.id);
			}
		}

		super._onExtensionHostCrashed(extensionHost, code, signal);

		if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
			if (code === ExtensionHostExitCode.VersionMismatch) {
				this._notificationService.prompt(
					Severity.Error,
					nls.localize('extensionService.versionMismatchCrash', "Extension host cannot start: version mismatch."),
					[{
						label: nls.localize('relaunch', "Relaunch VS Code"),
						run: () => {
							this._instantiationService.invokeFunction((accessor) => {
								const hostService = accessor.get(IHostService);
								hostService.restart();
							});
						}
					}]
				);
				return;
			}

			this._logExtensionHostCrash(extensionHost);
			this._sendExtensionHostCrashTelemetry(code, signal, activatedExtensions);

			this._localCrashTracker.registerCrash();

			if (this._localCrashTracker.shouldAutomaticallyRestart()) {
				this._logService.info(`Automatically restarting the extension host.`);
				this._notificationService.status(nls.localize('extensionService.autoRestart', "The extension host terminated unexpectedly. Restarting..."), { hideAfter: 5000 });
				this.startExtensionHosts();
			} else {
				const choices: IPromptChoice[] = [];
				if (this._environmentService.isBuilt) {
					choices.push({
						label: nls.localize('startBisect', "Start Extension Bisect"),
						run: () => {
							this._instantiationService.invokeFunction(accessor => {
								const commandService = accessor.get(ICommandService);
								commandService.executeCommand('extension.bisect.start');
							});
						}
					});
				} else {
					choices.push({
						label: nls.localize('devTools', "Open Developer Tools"),
						run: () => this._nativeHostService.openDevTools()
					});
				}

				choices.push({
					label: nls.localize('restart', "Restart Extension Host"),
					run: () => this.startExtensionHosts()
				});

				if (this._environmentService.isBuilt) {
					choices.push({
						label: nls.localize('learnMore', "Learn More"),
						run: () => {
							this._instantiationService.invokeFunction(accessor => {
								const openerService = accessor.get(IOpenerService);
								openerService.open('https://aka.ms/vscode-extension-bisect');
							});
						}
					});
				}

				this._notificationService.prompt(Severity.Error, nls.localize('extensionService.crash', "Extension host terminated unexpectedly 3 times within the last 5 minutes."), choices);
			}
		}
	}

	private _sendExtensionHostCrashTelemetry(code: number, signal: string | null, activatedExtensions: ExtensionIdentifier[]): void {
		type ExtensionHostCrashClassification = {
			owner: 'alexdima';
			comment: 'The extension host has terminated unexpectedly';
			code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The exit code of the extension host process.' };
			signal: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The signal that caused the extension host process to exit.' };
			extensionIds: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The list of loaded extensions.' };
		};
		type ExtensionHostCrashEvent = {
			code: number;
			signal: string | null;
			extensionIds: string[];
		};
		this._telemetryService.publicLog2<ExtensionHostCrashEvent, ExtensionHostCrashClassification>('extensionHostCrash', {
			code,
			signal,
			extensionIds: activatedExtensions.map(e => e.value)
		});

		for (const extensionId of activatedExtensions) {
			type ExtensionHostCrashExtensionClassification = {
				owner: 'alexdima';
				comment: 'The extension host has terminated unexpectedly';
				code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The exit code of the extension host process.' };
				signal: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The signal that caused the extension host process to exit.' };
				extensionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the extension.' };
			};
			type ExtensionHostCrashExtensionEvent = {
				code: number;
				signal: string | null;
				extensionId: string;
			};
			this._telemetryService.publicLog2<ExtensionHostCrashExtensionEvent, ExtensionHostCrashExtensionClassification>('extensionHostCrashExtension', {
				code,
				signal,
				extensionId: extensionId.value
			});
		}
	}

	// --- impl

	protected async _resolveAuthority(remoteAuthority: string): Promise<ResolverResult> {

		const authorityPlusIndex = remoteAuthority.indexOf('+');
		if (authorityPlusIndex === -1) {
			// This authority does not need to be resolved, simply parse the port number
			const { host, port } = parseAuthorityWithPort(remoteAuthority);
			return {
				authority: {
					authority: remoteAuthority,
					connectTo: {
						type: RemoteConnectionType.WebSocket,
						host,
						port
					},
					connectionToken: undefined
				}
			};
		}

		return this._resolveAuthorityOnExtensionHosts(ExtensionHostKind.LocalProcess, remoteAuthority);
	}

	private async _getCanonicalURI(remoteAuthority: string, uri: URI): Promise<URI> {

		const authorityPlusIndex = remoteAuthority.indexOf('+');
		if (authorityPlusIndex === -1) {
			// This authority does not use a resolver
			return uri;
		}

		const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
		if (localProcessExtensionHosts.length === 0) {
			// no local process extension hosts
			throw new Error(`Cannot resolve canonical URI`);
		}

		const results = await Promise.all(localProcessExtensionHosts.map(extHost => extHost.getCanonicalURI(remoteAuthority, uri)));

		for (const result of results) {
			if (result) {
				return result;
			}
		}

		// we can only reach this if there was no resolver extension that can return the cannonical uri
		throw new Error(`Cannot get canonical URI because no extension is installed to resolve ${getRemoteAuthorityPrefix(remoteAuthority)}`);
	}

	protected async _resolveExtensions(): Promise<ResolvedExtensions> {
		this._extensionScanner.startScanningExtensions();

		const remoteAuthority = this._environmentService.remoteAuthority;

		let remoteEnv: IRemoteAgentEnvironment | null = null;
		let remoteExtensions: IExtensionDescription[] = [];

		if (remoteAuthority) {

			this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => {
				if (uri.scheme !== Schemas.vscodeRemote || uri.authority !== remoteAuthority) {
					// The current remote authority resolver cannot give the canonical URI for this URI
					return uri;
				}
				performance.mark(`code/willGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
				if (isCI) {
					this._logService.info(`Invoking getCanonicalURI for authority ${getRemoteAuthorityPrefix(remoteAuthority)}...`);
				}
				try {
					return this._getCanonicalURI(remoteAuthority, uri);
				} finally {
					performance.mark(`code/didGetCanonicalURI/${getRemoteAuthorityPrefix(remoteAuthority)}`);
					if (isCI) {
						this._logService.info(`getCanonicalURI returned for authority ${getRemoteAuthorityPrefix(remoteAuthority)}.`);
					}
				}
			});

			if (isCI) {
				this._logService.info(`Starting to wait on IWorkspaceTrustManagementService.workspaceResolved...`);
			}

			// Now that the canonical URI provider has been registered, we need to wait for the trust state to be
			// calculated. The trust state will be used while resolving the authority, however the resolver can
			// override the trust state through the resolver result.
			await this._workspaceTrustManagementService.workspaceResolved;

			if (isCI) {
				this._logService.info(`Finished waiting on IWorkspaceTrustManagementService.workspaceResolved.`);
			}

			let resolverResult: ResolverResult;
			try {
				resolverResult = await this._resolveAuthorityInitial(remoteAuthority);
			} catch (err) {
				if (RemoteAuthorityResolverError.isNoResolverFound(err)) {
					err.isHandled = await this._handleNoResolverFound(remoteAuthority);
				} else {
					if (RemoteAuthorityResolverError.isHandled(err)) {
						console.log(`Error handled: Not showing a notification for the error`);
					}
				}
				this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);

				// Proceed with the local extension host
				return this._startLocalExtensionHost();
			}

			// set the resolved authority
			this._remoteAuthorityResolverService._setResolvedAuthority(resolverResult.authority, resolverResult.options);
			this._remoteExplorerService.setTunnelInformation(resolverResult.tunnelInformation);

			// monitor for breakage
			const connection = this._remoteAgentService.getConnection();
			if (connection) {
				connection.onDidStateChange(async (e) => {
					if (e.type === PersistentConnectionEventType.ConnectionLost) {
						this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
					}
				});
				connection.onReconnecting(() => this._resolveAuthorityAgain());
			}

			// fetch the remote environment
			[remoteEnv, remoteExtensions] = await Promise.all([
				this._remoteAgentService.getEnvironment(),
				this._remoteExtensionsScannerService.scanExtensions()
			]);

			if (!remoteEnv) {
				this._notificationService.notify({ severity: Severity.Error, message: nls.localize('getEnvironmentFailure', "Could not fetch remote environment") });
				// Proceed with the local extension host
				return this._startLocalExtensionHost();
			}

			updateProxyConfigurationsScope(remoteEnv.useHostProxy ? ConfigurationScope.APPLICATION : ConfigurationScope.MACHINE);
		} else {

			this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => uri);

		}

		return this._startLocalExtensionHost(remoteExtensions);
	}

	private async _startLocalExtensionHost(remoteExtensions: IExtensionDescription[] = []): Promise<ResolvedExtensions> {
		// Ensure that the workspace trust state has been fully initialized so
		// that the extension host can start with the correct set of extensions.
		await this._workspaceTrustManagementService.workspaceTrustInitialized;

		return new ResolvedExtensions(await this._scanAllLocalExtensions(), remoteExtensions, /*hasLocalProcess*/true, /*allowRemoteExtensionsInLocalWebWorker*/false);
	}

	protected _onExtensionHostExit(code: number): void {
		// Dispose everything associated with the extension host
		this._doStopExtensionHosts();

		// Dispose the management connection to avoid reconnecting after the extension host exits
		const connection = this._remoteAgentService.getConnection();
		connection?.dispose();

		if (parseExtensionDevOptions(this._environmentService).isExtensionDevTestFromCli) {
			// When CLI testing make sure to exit with proper exit code
			if (isCI) {
				this._logService.info(`Asking native host service to exit with code ${code}.`);
			}
			this._nativeHostService.exit(code);
		} else {
			// Expected development extension termination: When the extension host goes down we also shutdown the window
			this._nativeHostService.closeWindow();
		}
	}

	private async _handleNoResolverFound(remoteAuthority: string): Promise<boolean> {
		const remoteName = getRemoteName(remoteAuthority);
		const recommendation = this._productService.remoteExtensionTips?.[remoteName];
		if (!recommendation) {
			return false;
		}
		const sendTelemetry = (userReaction: 'install' | 'enable' | 'cancel') => {
			/* __GDPR__
			"remoteExtensionRecommendations:popup" : {
				"owner": "sandy081",
				"userReaction" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"extensionId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
			}
			*/
			this._telemetryService.publicLog('remoteExtensionRecommendations:popup', { userReaction, extensionId: resolverExtensionId });
		};

		const resolverExtensionId = recommendation.extensionId;
		const allExtensions = await this._scanAllLocalExtensions();
		const extension = allExtensions.filter(e => e.identifier.value === resolverExtensionId)[0];
		if (extension) {
			if (!extensionIsEnabled(this._logService, this._extensionEnablementService, extension, false)) {
				const message = nls.localize('enableResolver', "Extension '{0}' is required to open the remote window.\nOK to enable?", recommendation.friendlyName);
				this._notificationService.prompt(Severity.Info, message,
					[{
						label: nls.localize('enable', 'Enable and Reload'),
						run: async () => {
							sendTelemetry('enable');
							await this._extensionEnablementService.setEnablement([toExtension(extension)], EnablementState.EnabledGlobally);
							await this._hostService.reload();
						}
					}],
					{
						sticky: true,
						priority: NotificationPriority.URGENT
					}
				);
			}
		} else {
			// Install the Extension and reload the window to handle.
			const message = nls.localize('installResolver', "Extension '{0}' is required to open the remote window.\nDo you want to install the extension?", recommendation.friendlyName);
			this._notificationService.prompt(Severity.Info, message,
				[{
					label: nls.localize('install', 'Install and Reload'),
					run: async () => {
						sendTelemetry('install');
						const [galleryExtension] = await this._extensionGalleryService.getExtensions([{ id: resolverExtensionId }], CancellationToken.None);
						if (galleryExtension) {
							await this._extensionManagementService.installFromGallery(galleryExtension);
							await this._hostService.reload();
						} else {
							this._notificationService.error(nls.localize('resolverExtensionNotFound', "`{0}` not found on marketplace"));
						}

					}
				}],
				{
					sticky: true,
					priority: NotificationPriority.URGENT,
					onCancel: () => sendTelemetry('cancel')
				}
			);

		}
		return true;
	}
}

class NativeExtensionHostFactory implements IExtensionHostFactory {

	private readonly _webWorkerExtHostEnablement: LocalWebWorkerExtHostEnablement;

	constructor(
		private readonly _extensionsProposedApi: ExtensionsProposedApi,
		private readonly _extensionScanner: CachedExtensionScanner,
		private readonly _getExtensionRegistrySnapshotWhenReady: () => Promise<ExtensionDescriptionRegistrySnapshot>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
	}

	public createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		switch (runningLocation.kind) {
			case ExtensionHostKind.LocalProcess: {
				const startup = (
					isInitialStart
						? ExtensionHostStartup.EagerManualStart
						: ExtensionHostStartup.EagerAutoStart
				);
				return this._instantiationService.createInstance(NativeLocalProcessExtensionHost, runningLocation, startup, this._createLocalProcessExtensionHostDataProvider(runningLocations, isInitialStart, runningLocation));
			}
			case ExtensionHostKind.LocalWebWorker: {
				if (this._webWorkerExtHostEnablement !== LocalWebWorkerExtHostEnablement.Disabled) {
					const startup = (
						isInitialStart
							? (this._webWorkerExtHostEnablement === LocalWebWorkerExtHostEnablement.Lazy ? ExtensionHostStartup.Lazy : ExtensionHostStartup.EagerManualStart)
							: ExtensionHostStartup.EagerAutoStart
					);
					return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, startup, this._createWebWorkerExtensionHostDataProvider(runningLocations, runningLocation));
				}
				return null;
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

	private _createLocalProcessExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, isInitialStart: boolean, desiredRunningLocation: LocalProcessRunningLocation): ILocalProcessExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<ILocalProcessExtensionHostInitData> => {
				if (isInitialStart) {
					// Here we load even extensions that would be disabled by workspace trust
					const scannedExtensions = await this._extensionScanner.scannedExtensions;
					if (isCI) {
						this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.scannedExtensions: ${scannedExtensions.map(ext => ext.identifier.value).join(',')}`);
					}

					const localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, scannedExtensions, /* ignore workspace trust */true);
					if (isCI) {
						this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.localExtensions: ${localExtensions.map(ext => ext.identifier.value).join(',')}`);
					}

					const runningLocation = runningLocations.computeRunningLocation(localExtensions, [], false);
					const myExtensions = filterExtensionDescriptions(localExtensions, runningLocation, extRunningLocation => desiredRunningLocation.equals(extRunningLocation));
					const extensions = new ExtensionHostExtensions(0, localExtensions, myExtensions.map(extension => extension.identifier));
					if (isCI) {
						this._logService.info(`NativeExtensionHostFactory._createLocalProcessExtensionHostDataProvider.myExtensions: ${myExtensions.map(ext => ext.identifier.value).join(',')}`);
					}
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

	private _createWebWorkerExtensionHostDataProvider(runningLocations: ExtensionRunningLocationTracker, desiredRunningLocation: LocalWebWorkerRunningLocation): IWebWorkerExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<IWebWorkerExtensionHostInitData> => {
				const snapshot = await this._getExtensionRegistrySnapshotWhenReady();
				const myExtensions = runningLocations.filterByRunningLocation(snapshot.extensions, desiredRunningLocation);
				const extensions = new ExtensionHostExtensions(snapshot.versionId, snapshot.extensions, myExtensions.map(extension => extension.identifier));
				return { extensions };
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

function determineLocalWebWorkerExtHostEnablement(environmentService: IWorkbenchEnvironmentService, configurationService: IConfigurationService): LocalWebWorkerExtHostEnablement {
	if (environmentService.isExtensionDevelopment && environmentService.extensionDevelopmentKind?.some(k => k === 'web')) {
		return LocalWebWorkerExtHostEnablement.Eager;
	} else {
		const config = configurationService.getValue<WebWorkerExtHostConfigValue>(webWorkerExtHostConfig);
		if (config === true) {
			return LocalWebWorkerExtHostEnablement.Eager;
		} else if (config === 'auto') {
			return LocalWebWorkerExtHostEnablement.Lazy;
		} else {
			return LocalWebWorkerExtHostEnablement.Disabled;
		}
	}
}

const enum LocalWebWorkerExtHostEnablement {
	Disabled = 0,
	Eager = 1,
	Lazy = 2
}

export class NativeExtensionHostKindPicker implements IExtensionHostKindPicker {

	private readonly _hasRemoteExtHost: boolean;
	private readonly _hasWebWorkerExtHost: boolean;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._hasRemoteExtHost = Boolean(environmentService.remoteAuthority);
		const webWorkerExtHostEnablement = determineLocalWebWorkerExtHostEnablement(environmentService, configurationService);
		this._hasWebWorkerExtHost = (webWorkerExtHostEnablement !== LocalWebWorkerExtHostEnablement.Disabled);
	}

	public pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
		const result = NativeExtensionHostKindPicker.pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, this._hasRemoteExtHost, this._hasWebWorkerExtHost);
		this._logService.trace(`pickRunningLocation for ${extensionId.value}, extension kinds: [${extensionKinds.join(', ')}], isInstalledLocally: ${isInstalledLocally}, isInstalledRemotely: ${isInstalledRemotely}, preference: ${extensionRunningPreferenceToString(preference)} => ${extensionHostKindToString(result)}`);
		return result;
	}

	public static pickExtensionHostKind(extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference, hasRemoteExtHost: boolean, hasWebWorkerExtHost: boolean): ExtensionHostKind | null {
		const result: ExtensionHostKind[] = [];
		for (const extensionKind of extensionKinds) {
			if (extensionKind === 'ui' && isInstalledLocally) {
				// ui extensions run locally if possible
				if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
					return ExtensionHostKind.LocalProcess;
				} else {
					result.push(ExtensionHostKind.LocalProcess);
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
			if (extensionKind === 'workspace' && !hasRemoteExtHost) {
				// workspace extensions also run locally if there is no remote
				if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
					return ExtensionHostKind.LocalProcess;
				} else {
					result.push(ExtensionHostKind.LocalProcess);
				}
			}
			if (extensionKind === 'web' && isInstalledLocally && hasWebWorkerExtHost) {
				// web worker extensions run in the local web worker if possible
				if (preference === ExtensionRunningPreference.None || preference === ExtensionRunningPreference.Local) {
					return ExtensionHostKind.LocalWebWorker;
				} else {
					result.push(ExtensionHostKind.LocalWebWorker);
				}
			}
		}
		return (result.length > 0 ? result[0] : null);
	}
}

class RestartExtensionHostAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.restartExtensionHost',
			title: { value: nls.localize('restartExtensionHost', "Restart Extension Host"), original: 'Restart Extension Host' },
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const extensionService = accessor.get(IExtensionService);

		const stopped = await extensionService.stopExtensionHosts(nls.localize('restartExtensionHost.reason', "Restarting extension host on explicit request."));
		if (stopped) {
			extensionService.startExtensionHosts();
		}
	}
}

registerAction2(RestartExtensionHostAction);

registerSingleton(IExtensionService, NativeExtensionService, InstantiationType.Eager);
