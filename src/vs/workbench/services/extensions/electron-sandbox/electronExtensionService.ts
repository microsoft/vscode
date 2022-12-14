/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CachedExtensionScanner } from 'vs/workbench/services/extensions/electron-sandbox/cachedExtensionScanner';
import { AbstractExtensionService, ExtensionHostCrashTracker, ExtensionRunningPreference, extensionRunningPreferenceToString, filterByRunningLocation } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import * as nls from 'vs/nls';
import { runWhenIdle } from 'vs/base/common/async';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, EnablementState, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRemoteExtensionHostDataProvider, RemoteExtensionHost, IRemoteExtensionHostInitData } from 'vs/workbench/services/extensions/common/remoteExtensionHost';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, ResolverResult } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IExtensionService, toExtension, ExtensionHostKind, IExtensionHost, webWorkerExtHostConfig, ExtensionRunningLocation, WebWorkerExtHostConfigValue, extensionHostKindToString } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManager';
import { ExtensionIdentifier, IExtension, ExtensionType, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtensionKind } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { PersistentConnectionEventType } from 'vs/platform/remote/common/remoteAgentConnection';
import { IProductService } from 'vs/platform/product/common/productService';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IRemoteExplorerService } from 'vs/workbench/services/remote/common/remoteExplorerService';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { getRemoteName, parseAuthorityWithPort } from 'vs/platform/remote/common/remoteHosts';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IWebWorkerExtensionHostDataProvider, IWebWorkerExtensionHostInitData, WebWorkerExtensionHost } from 'vs/workbench/services/extensions/browser/webWorkerExtensionHost';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILogService } from 'vs/platform/log/common/log';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Schemas } from 'vs/base/common/network';
import { ExtensionHostExitCode } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { updateProxyConfigurationsScope } from 'vs/platform/request/common/request';
import { ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { CancellationToken } from 'vs/base/common/cancellation';
import { StopWatch } from 'vs/base/common/stopwatch';
import { isCI } from 'vs/base/common/platform';
import { IResolveAuthorityErrorResult } from 'vs/workbench/services/extensions/common/extensionHostProxy';
import { URI } from 'vs/base/common/uri';
import { ILocalProcessExtensionHostDataProvider, ILocalProcessExtensionHostInitData, SandboxLocalProcessExtensionHost } from 'vs/workbench/services/extensions/electron-sandbox/localProcessExtensionHost';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export abstract class ElectronExtensionService extends AbstractExtensionService implements IExtensionService {

	private readonly _enableLocalWebWorker: boolean;
	private readonly _lazyLocalWebWorker: boolean;
	private readonly _remoteInitData: Map<string, IRemoteExtensionHostInitData>;
	private readonly _extensionScanner: CachedExtensionScanner;
	private readonly _localCrashTracker = new ExtensionHostCrashTracker();
	private _resolveAuthorityAttempt: number = 0;

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
		@ILifecycleService lifecycleService: ILifecycleService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IHostService private readonly _hostService: IHostService,
		@IRemoteExplorerService private readonly _remoteExplorerService: IRemoteExplorerService,
		@IExtensionGalleryService private readonly _extensionGalleryService: IExtensionGalleryService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
	) {
		super(
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
			lifecycleService,
			userDataProfileService
		);

		[this._enableLocalWebWorker, this._lazyLocalWebWorker] = this._isLocalWebWorkerEnabled();
		this._remoteInitData = new Map<string, IRemoteExtensionHostInitData>();
		this._extensionScanner = instantiationService.createInstance(CachedExtensionScanner);

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

	private _isLocalWebWorkerEnabled(): [boolean, boolean] {
		let isEnabled: boolean;
		let isLazy: boolean;
		if (this._environmentService.isExtensionDevelopment && this._environmentService.extensionDevelopmentKind?.some(k => k === 'web')) {
			isEnabled = true;
			isLazy = false;
		} else {
			const config = this._configurationService.getValue<WebWorkerExtHostConfigValue>(webWorkerExtHostConfig);
			if (config === true) {
				isEnabled = true;
				isLazy = false;
			} else if (config === 'auto') {
				isEnabled = true;
				isLazy = true;
			} else {
				isEnabled = false;
				isLazy = false;
			}
		}
		return [isEnabled, isLazy];
	}

	protected _scanSingleExtension(extension: IExtension): Promise<IExtensionDescription | null> {
		if (extension.location.scheme === Schemas.vscodeRemote) {
			return this._remoteAgentService.scanSingleExtension(extension.location, extension.type === ExtensionType.System);
		}

		return this._extensionScanner.scanSingleExtension(extension.location.fsPath, extension.type === ExtensionType.System);
	}

	private async _scanAllLocalExtensions(): Promise<IExtensionDescription[]> {
		return this._extensionScanner.scannedExtensions;
	}

	protected _createLocalExtensionHostDataProvider(isInitialStart: boolean, desiredRunningLocation: ExtensionRunningLocation): ILocalProcessExtensionHostDataProvider & IWebWorkerExtensionHostDataProvider {
		return {
			getInitData: async (): Promise<ILocalProcessExtensionHostInitData & IWebWorkerExtensionHostInitData> => {
				if (isInitialStart) {
					// Here we load even extensions that would be disabled by workspace trust
					const localExtensions = this._checkEnabledAndProposedAPI(await this._scanAllLocalExtensions(), /* ignore workspace trust */true);
					const runningLocation = this._determineRunningLocation(localExtensions);
					const myExtensions = filterByRunningLocation(localExtensions, runningLocation, desiredRunningLocation);
					return {
						autoStart: false,
						allExtensions: localExtensions,
						myExtensions: myExtensions.map(extension => extension.identifier)
					};
				} else {
					// restart case
					const allExtensions = await this.getExtensions();
					const myExtensions = this._filterByRunningLocation(allExtensions, desiredRunningLocation);
					return {
						autoStart: true,
						allExtensions: allExtensions,
						myExtensions: myExtensions.map(extension => extension.identifier)
					};
				}
			}
		};
	}

	private _createRemoteExtensionHostDataProvider(remoteAuthority: string): IRemoteExtensionHostDataProvider {
		return {
			remoteAuthority: remoteAuthority,
			getInitData: async () => {
				await this.whenInstalledExtensionsRegistered();
				return this._remoteInitData.get(remoteAuthority)!;
			}
		};
	}

	protected _pickExtensionHostKind(extensionId: ExtensionIdentifier, extensionKinds: ExtensionKind[], isInstalledLocally: boolean, isInstalledRemotely: boolean, preference: ExtensionRunningPreference): ExtensionHostKind | null {
		const result = ElectronExtensionService.pickExtensionHostKind(extensionKinds, isInstalledLocally, isInstalledRemotely, preference, Boolean(this._environmentService.remoteAuthority), this._enableLocalWebWorker);
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

	protected _createExtensionHost(runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		switch (runningLocation.kind) {
			case ExtensionHostKind.LocalProcess: {
				return this._instantiationService.createInstance(SandboxLocalProcessExtensionHost, runningLocation, this._createLocalExtensionHostDataProvider(isInitialStart, runningLocation));
			}
			case ExtensionHostKind.LocalWebWorker: {
				if (this._enableLocalWebWorker) {
					return this._instantiationService.createInstance(WebWorkerExtensionHost, runningLocation, this._lazyLocalWebWorker, this._createLocalExtensionHostDataProvider(isInitialStart, runningLocation));
				}
				return null;
			}
			case ExtensionHostKind.Remote: {
				const remoteAgentConnection = this._remoteAgentService.getConnection();
				if (remoteAgentConnection) {
					return this._instantiationService.createInstance(RemoteExtensionHost, runningLocation, this._createRemoteExtensionHostDataProvider(remoteAgentConnection.remoteAuthority), this._remoteAgentService.socketFactory);
				}
				return null;
			}
		}
	}

	protected override _onExtensionHostCrashed(extensionHost: IExtensionHostManager, code: number, signal: string | null): void {
		const activatedExtensions = Array.from(this._extensionHostActiveExtensions.values()).filter(extensionId => extensionHost.containsExtension(extensionId));
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
				this._notificationService.prompt(Severity.Error, nls.localize('extensionService.crash', "Extension host terminated unexpectedly 3 times within the last 5 minutes."),
					[{
						label: nls.localize('devTools', "Open Developer Tools"),
						run: () => this._nativeHostService.openDevTools()
					},
					{
						label: nls.localize('restart', "Restart Extension Host"),
						run: () => this.startExtensionHosts()
					}]
				);
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

	private async _resolveAuthority(remoteAuthority: string): Promise<ResolverResult> {

		const authorityPlusIndex = remoteAuthority.indexOf('+');
		if (authorityPlusIndex === -1) {
			// This authority does not need to be resolved, simply parse the port number
			const { host, port } = parseAuthorityWithPort(remoteAuthority);
			return {
				authority: {
					authority: remoteAuthority,
					host,
					port,
					connectionToken: undefined
				}
			};
		}

		const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
		if (localProcessExtensionHosts.length === 0) {
			// no local process extension hosts
			throw new Error(`Cannot resolve authority`);
		}

		this._resolveAuthorityAttempt++;
		const results = await Promise.all(localProcessExtensionHosts.map(extHost => extHost.resolveAuthority(remoteAuthority, this._resolveAuthorityAttempt)));

		let bestErrorResult: IResolveAuthorityErrorResult | null = null;
		for (const result of results) {
			if (result.type === 'ok') {
				return result.value;
			}
			if (!bestErrorResult) {
				bestErrorResult = result;
				continue;
			}
			const bestErrorIsUnknown = (bestErrorResult.error.code === RemoteAuthorityResolverErrorCode.Unknown);
			const errorIsUnknown = (result.error.code === RemoteAuthorityResolverErrorCode.Unknown);
			if (bestErrorIsUnknown && !errorIsUnknown) {
				bestErrorResult = result;
			}
		}

		// we can only reach this if there is an error
		throw new RemoteAuthorityResolverError(bestErrorResult!.error.message, bestErrorResult!.error.code, bestErrorResult!.error.detail);
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

	private async _resolveAuthorityInitial(remoteAuthority: string): Promise<ResolverResult> {
		const MAX_ATTEMPTS = 5;

		for (let attempt = 1; ; attempt++) {
			const sw = StopWatch.create(false);
			this._logService.info(`[attempt ${attempt}] Invoking resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)})`);
			try {
				const resolverResult = await this._resolveAuthority(remoteAuthority);
				this._logService.info(`[attempt ${attempt}] resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)}) returned '${resolverResult.authority.host}:${resolverResult.authority.port}' after ${sw.elapsed()} ms`);
				return resolverResult;
			} catch (err) {
				this._logService.error(`[attempt ${attempt}] resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)}) returned an error after ${sw.elapsed()} ms`, err);

				if (RemoteAuthorityResolverError.isNoResolverFound(err)) {
					// There is no point in retrying if there is no resolver found
					throw err;
				}

				if (RemoteAuthorityResolverError.isNotAvailable(err)) {
					// The resolver is not available and asked us to not retry
					throw err;
				}

				if (attempt >= MAX_ATTEMPTS) {
					// Too many failed attempts, give up
					throw err;
				}
			}
		}
	}

	private async _resolveAuthorityAgain(): Promise<void> {
		const remoteAuthority = this._environmentService.remoteAuthority;
		if (!remoteAuthority) {
			return;
		}

		this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
		const sw = StopWatch.create(false);
		this._logService.info(`Invoking resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)})`);
		try {
			const result = await this._resolveAuthority(remoteAuthority);
			this._logService.info(`resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)}) returned '${result.authority.host}:${result.authority.port}' after ${sw.elapsed()} ms`);
			this._remoteAuthorityResolverService._setResolvedAuthority(result.authority, result.options);
		} catch (err) {
			this._logService.error(`resolveAuthority(${getRemoteAuthorityPrefix(remoteAuthority)}) returned an error after ${sw.elapsed()} ms`, err);
			this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
		}
	}

	protected async _scanAndHandleExtensions(): Promise<void> {
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
				if (isCI) {
					this._logService.info(`Invoking getCanonicalURI for authority ${getRemoteAuthorityPrefix(remoteAuthority)}...`);
				}
				try {
					return this._getCanonicalURI(remoteAuthority, uri);
				} finally {
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
				await this._startLocalExtensionHost();
				return;
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
				this._remoteAgentService.scanExtensions()
			]);

			if (!remoteEnv) {
				this._notificationService.notify({ severity: Severity.Error, message: nls.localize('getEnvironmentFailure', "Could not fetch remote environment") });
				// Proceed with the local extension host
				await this._startLocalExtensionHost();
				return;
			}

			updateProxyConfigurationsScope(remoteEnv.useHostProxy ? ConfigurationScope.APPLICATION : ConfigurationScope.MACHINE);
		} else {

			this._remoteAuthorityResolverService._setCanonicalURIProvider(async (uri) => uri);

		}

		await this._startLocalExtensionHost(remoteAuthority, remoteEnv, remoteExtensions);
	}

	private async _startLocalExtensionHost(remoteAuthority: string | undefined = undefined, remoteEnv: IRemoteAgentEnvironment | null = null, remoteExtensions: IExtensionDescription[] = []): Promise<void> {
		// Ensure that the workspace trust state has been fully initialized so
		// that the extension host can start with the correct set of extensions.
		await this._workspaceTrustManagementService.workspaceTrustInitialized;

		remoteExtensions = this._checkEnabledAndProposedAPI(remoteExtensions, false);
		const localExtensions = this._checkEnabledAndProposedAPI(await this._scanAllLocalExtensions(), false);
		this._initializeRunningLocation(localExtensions, remoteExtensions);

		// remove non-UI extensions from the local extensions
		const localProcessExtensions = this._filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalProcess);
		const localWebWorkerExtensions = this._filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalWebWorker);
		remoteExtensions = this._filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.Remote);

		const result = this._registry.deltaExtensions(remoteExtensions.concat(localProcessExtensions).concat(localWebWorkerExtensions), []);
		if (result.removedDueToLooping.length > 0) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', '))
			});
		}

		if (remoteAuthority && remoteEnv) {
			this._remoteInitData.set(remoteAuthority, {
				connectionData: this._remoteAuthorityResolverService.getConnectionData(remoteAuthority),
				pid: remoteEnv.pid,
				appRoot: remoteEnv.appRoot,
				extensionHostLogsPath: remoteEnv.extensionHostLogsPath,
				globalStorageHome: remoteEnv.globalStorageHome,
				workspaceStorageHome: remoteEnv.workspaceStorageHome,
				allExtensions: this._registry.getAllExtensionDescriptions(),
				myExtensions: remoteExtensions.map(extension => extension.identifier),
			});
		}

		this._doHandleExtensionPoints(this._registry.getAllExtensionDescriptions());

		const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
		const filteredLocalProcessExtensions = localProcessExtensions.filter(extension => this._registry.containsExtension(extension.identifier));
		for (const extHost of localProcessExtensionHosts) {
			this._startExtensionHost(extHost, filteredLocalProcessExtensions);
		}

		const localWebWorkerExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalWebWorker);
		const filteredLocalWebWorkerExtensions = localWebWorkerExtensions.filter(extension => this._registry.containsExtension(extension.identifier));
		for (const extHost of localWebWorkerExtensionHosts) {
			this._startExtensionHost(extHost, filteredLocalWebWorkerExtensions);
		}
	}

	private _startExtensionHost(extensionHostManager: IExtensionHostManager, _extensions: IExtensionDescription[]): void {
		const extensions = this._filterByExtensionHostManager(_extensions, extensionHostManager);
		extensionHostManager.start(this._registry.getAllExtensionDescriptions(), extensions.map(extension => extension.identifier));
	}

	public _onExtensionHostExit(code: number): void {
		// Dispose everything associated with the extension host
		this.stopExtensionHosts();

		// Dispose the management connection to avoid reconnecting after the extension host exits
		const connection = this._remoteAgentService.getConnection();
		connection?.dispose();

		if (this._isExtensionDevTestFromCli) {
			// When CLI testing make sure to exit with proper exit code
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
			if (!this._isEnabled(extension, false)) {
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
					{ sticky: true }
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
					onCancel: () => sendTelemetry('cancel')
				}
			);

		}
		return true;
	}
}

function getRemoteAuthorityPrefix(remoteAuthority: string): string {
	const plusIndex = remoteAuthority.indexOf('+');
	if (plusIndex === -1) {
		return remoteAuthority;
	}
	return remoteAuthority.substring(0, plusIndex);
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

	run(accessor: ServicesAccessor): void {
		accessor.get(IExtensionService).restartExtensionHost();
	}
}

registerAction2(RestartExtensionHostAction);
