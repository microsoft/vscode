/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import * as perf from 'vs/base/common/performance';
import { isCI } from 'vs/base/common/platform';
import { isEqualOrParent } from 'vs/base/common/resources';
import { StopWatch } from 'vs/base/common/stopwatch';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ImplicitActivationEvents } from 'vs/platform/extensionManagement/common/implicitActivationEvents';
import { ExtensionIdentifier, ExtensionIdentifierMap, IExtension, IExtensionContributions, IExtensionDescription, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { handleVetos } from 'vs/platform/lifecycle/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, ResolverResult, getRemoteAuthorityPrefix } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteExtensionsScannerService } from 'vs/platform/remote/common/remoteExtensionsScanner';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionFeaturesRegistry, Extensions as ExtensionFeaturesExtensions, IExtensionFeatureMarkdownRenderer, IRenderedData, } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { IWorkbenchExtensionEnablementService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionDescriptionRegistryLock, ExtensionDescriptionRegistrySnapshot, IActivationEventsReader, LockableExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { ExtensionHostKind, ExtensionRunningPreference, IExtensionHostKindPicker } from 'vs/workbench/services/extensions/common/extensionHostKind';
import { ExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManager';
import { IExtensionHostManager } from 'vs/workbench/services/extensions/common/extensionHostManagers';
import { IResolveAuthorityErrorResult } from 'vs/workbench/services/extensions/common/extensionHostProxy';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { ExtensionRunningLocation, LocalProcessRunningLocation, LocalWebWorkerRunningLocation, RemoteRunningLocation } from 'vs/workbench/services/extensions/common/extensionRunningLocation';
import { ExtensionRunningLocationTracker, filterExtensionIdentifiers } from 'vs/workbench/services/extensions/common/extensionRunningLocationTracker';
import { ActivationKind, ActivationTimes, ExtensionActivationReason, ExtensionHostStartup, ExtensionPointContribution, IExtensionHost, IExtensionService, IExtensionsStatus, IInternalExtensionService, IMessage, IResponsiveStateChangeEvent, IWillActivateEvent, WillStopExtensionHostsEvent, toExtension, toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsProposedApi } from 'vs/workbench/services/extensions/common/extensionsProposedApi';
import { ExtensionMessageCollector, ExtensionPoint, ExtensionsRegistry, IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { LazyCreateExtensionHostManager } from 'vs/workbench/services/extensions/common/lazyCreateExtensionHostManager';
import { ResponsiveState } from 'vs/workbench/services/extensions/common/rpcProtocol';
import { IExtensionActivationHost as IWorkspaceContainsActivationHost, checkActivateWorkspaceContainsExtension, checkGlobFileExists } from 'vs/workbench/services/extensions/common/workspaceContains';
import { ILifecycleService, WillShutdownJoinerOrder } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IExtensionHostExitInfo, IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = Promise.resolve<void>(undefined);

export abstract class AbstractExtensionService extends Disposable implements IExtensionService {

	public _serviceBrand: undefined;

	private readonly _onDidRegisterExtensions = this._register(new Emitter<void>());
	public readonly onDidRegisterExtensions = this._onDidRegisterExtensions.event;

	private readonly _onDidChangeExtensionsStatus = this._register(new Emitter<ExtensionIdentifier[]>());
	public readonly onDidChangeExtensionsStatus = this._onDidChangeExtensionsStatus.event;

	private readonly _onDidChangeExtensions = this._register(new Emitter<{ readonly added: ReadonlyArray<IExtensionDescription>; readonly removed: ReadonlyArray<IExtensionDescription> }>({ leakWarningThreshold: 400 }));
	public readonly onDidChangeExtensions = this._onDidChangeExtensions.event;

	private readonly _onWillActivateByEvent = this._register(new Emitter<IWillActivateEvent>());
	public readonly onWillActivateByEvent = this._onWillActivateByEvent.event;

	private readonly _onDidChangeResponsiveChange = this._register(new Emitter<IResponsiveStateChangeEvent>());
	public readonly onDidChangeResponsiveChange = this._onDidChangeResponsiveChange.event;

	private readonly _onWillStop = this._register(new Emitter<WillStopExtensionHostsEvent>());
	public readonly onWillStop = this._onWillStop.event;

	private readonly _activationEventReader = new ImplicitActivationAwareReader();
	private readonly _registry = new LockableExtensionDescriptionRegistry(this._activationEventReader);
	private readonly _installedExtensionsReady = new Barrier();
	private readonly _extensionStatus = new ExtensionIdentifierMap<ExtensionStatus>();
	private readonly _allRequestedActivateEvents = new Set<string>();
	private readonly _runningLocations: ExtensionRunningLocationTracker;
	private readonly _remoteCrashTracker = new ExtensionHostCrashTracker();

	private _deltaExtensionsQueue: DeltaExtensionsQueueItem[] = [];
	private _inHandleDeltaExtensions = false;

	private readonly _extensionHostManagers = this._register(new ExtensionHostCollection());

	private _resolveAuthorityAttempt: number = 0;

	constructor(
		private readonly _extensionsProposedApi: ExtensionsProposedApi,
		private readonly _extensionHostFactory: IExtensionHostFactory,
		private readonly _extensionHostKindPicker: IExtensionHostKindPicker,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@INotificationService protected readonly _notificationService: INotificationService,
		@IWorkbenchEnvironmentService protected readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IWorkbenchExtensionEnablementService protected readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IFileService protected readonly _fileService: IFileService,
		@IProductService protected readonly _productService: IProductService,
		@IWorkbenchExtensionManagementService protected readonly _extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExtensionManifestPropertiesService private readonly _extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@ILogService protected readonly _logService: ILogService,
		@IRemoteAgentService protected readonly _remoteAgentService: IRemoteAgentService,
		@IRemoteExtensionsScannerService protected readonly _remoteExtensionsScannerService: IRemoteExtensionsScannerService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IRemoteAuthorityResolverService protected readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();

		// help the file service to activate providers by activating extensions by file system event
		this._register(this._fileService.onWillActivateFileSystemProvider(e => {
			if (e.scheme !== Schemas.vscodeRemote) {
				e.join(this.activateByEvent(`onFileSystem:${e.scheme}`));
			}
		}));

		this._runningLocations = new ExtensionRunningLocationTracker(
			this._registry,
			this._extensionHostKindPicker,
			this._environmentService,
			this._configurationService,
			this._logService,
			this._extensionManifestPropertiesService
		);

		this._register(this._extensionEnablementService.onEnablementChanged((extensions) => {
			const toAdd: IExtension[] = [];
			const toRemove: IExtension[] = [];
			for (const extension of extensions) {
				if (this._safeInvokeIsEnabled(extension)) {
					// an extension has been enabled
					toAdd.push(extension);
				} else {
					// an extension has been disabled
					toRemove.push(extension);
				}
			}
			if (isCI) {
				this._logService.info(`AbstractExtensionService.onEnablementChanged fired for ${extensions.map(e => e.identifier.id).join(', ')}`);
			}
			this._handleDeltaExtensions(new DeltaExtensionsQueueItem(toAdd, toRemove));
		}));

		this._register(this._extensionManagementService.onDidChangeProfile(({ added, removed }) => {
			if (added.length || removed.length) {
				if (isCI) {
					this._logService.info(`AbstractExtensionService.onDidChangeProfile fired`);
				}
				this._handleDeltaExtensions(new DeltaExtensionsQueueItem(added, removed));
			}
		}));

		this._register(this._extensionManagementService.onDidEnableExtensions(extensions => {
			if (extensions.length) {
				if (isCI) {
					this._logService.info(`AbstractExtensionService.onDidEnableExtensions fired`);
				}
				this._handleDeltaExtensions(new DeltaExtensionsQueueItem(extensions, []));
			}
		}));

		this._register(this._extensionManagementService.onDidInstallExtensions((result) => {
			const extensions: IExtension[] = [];
			for (const { local, operation } of result) {
				if (local && local.isValid && operation !== InstallOperation.Migrate && this._safeInvokeIsEnabled(local)) {
					extensions.push(local);
				}
			}
			if (extensions.length) {
				if (isCI) {
					this._logService.info(`AbstractExtensionService.onDidInstallExtensions fired for ${extensions.map(e => e.identifier.id).join(', ')}`);
				}
				this._handleDeltaExtensions(new DeltaExtensionsQueueItem(extensions, []));
			}
		}));

		this._register(this._extensionManagementService.onDidUninstallExtension((event) => {
			if (!event.error) {
				// an extension has been uninstalled
				if (isCI) {
					this._logService.info(`AbstractExtensionService.onDidUninstallExtension fired for ${event.identifier.id}`);
				}
				this._handleDeltaExtensions(new DeltaExtensionsQueueItem([], [event.identifier.id]));
			}
		}));

		this._register(this._lifecycleService.onWillShutdown(event => {
			if (this._remoteAgentService.getConnection()) {
				event.join(async () => {
					// We need to disconnect the management connection before killing the local extension host.
					// Otherwise, the local extension host might terminate the underlying tunnel before the
					// management connection has a chance to send its disconnection message.
					await this._remoteAgentService.endConnection();
					await this._doStopExtensionHosts();
					this._remoteAgentService.getConnection()?.dispose();
				}, {
					id: 'join.disconnectRemote',
					label: nls.localize('disconnectRemote', "Disconnect Remote Agent"),
					order: WillShutdownJoinerOrder.Last // after others have joined that might depend on a remote connection
				});
			} else {
				event.join(this._doStopExtensionHosts(), {
					id: 'join.stopExtensionHosts',
					label: nls.localize('stopExtensionHosts', "Stopping Extension Hosts"),
				});
			}
		}));
	}

	protected _getExtensionHostManagers(kind: ExtensionHostKind): IExtensionHostManager[] {
		return this._extensionHostManagers.getByKind(kind);
	}

	//#region deltaExtensions

	private async _handleDeltaExtensions(item: DeltaExtensionsQueueItem): Promise<void> {
		this._deltaExtensionsQueue.push(item);
		if (this._inHandleDeltaExtensions) {
			// Let the current item finish, the new one will be picked up
			return;
		}

		let lock: ExtensionDescriptionRegistryLock | null = null;
		try {
			this._inHandleDeltaExtensions = true;

			// wait for _initialize to finish before hanlding any delta extension events
			await this._installedExtensionsReady.wait();

			lock = await this._registry.acquireLock('handleDeltaExtensions');
			while (this._deltaExtensionsQueue.length > 0) {
				const item = this._deltaExtensionsQueue.shift()!;
				await this._deltaExtensions(lock, item.toAdd, item.toRemove);
			}
		} finally {
			this._inHandleDeltaExtensions = false;
			lock?.dispose();
		}
	}

	private async _deltaExtensions(lock: ExtensionDescriptionRegistryLock, _toAdd: IExtension[], _toRemove: string[] | IExtension[]): Promise<void> {
		if (isCI) {
			this._logService.info(`AbstractExtensionService._deltaExtensions: toAdd: [${_toAdd.map(e => e.identifier.id).join(',')}] toRemove: [${_toRemove.map(e => typeof e === 'string' ? e : e.identifier.id).join(',')}]`);
		}
		let toRemove: IExtensionDescription[] = [];
		for (let i = 0, len = _toRemove.length; i < len; i++) {
			const extensionOrId = _toRemove[i];
			const extensionId = (typeof extensionOrId === 'string' ? extensionOrId : extensionOrId.identifier.id);
			const extension = (typeof extensionOrId === 'string' ? null : extensionOrId);
			const extensionDescription = this._registry.getExtensionDescription(extensionId);
			if (!extensionDescription) {
				// ignore disabling/uninstalling an extension which is not running
				continue;
			}

			if (extension && extensionDescription.extensionLocation.scheme !== extension.location.scheme) {
				// this event is for a different extension than mine (maybe for the local extension, while I have the remote extension)
				continue;
			}

			if (!this.canRemoveExtension(extensionDescription)) {
				// uses non-dynamic extension point or is activated
				continue;
			}

			toRemove.push(extensionDescription);
		}

		const toAdd: IExtensionDescription[] = [];
		for (let i = 0, len = _toAdd.length; i < len; i++) {
			const extension = _toAdd[i];

			const extensionDescription = toExtensionDescription(extension, false);
			if (!extensionDescription) {
				// could not scan extension...
				continue;
			}

			if (!this._canAddExtension(extensionDescription, toRemove)) {
				continue;
			}

			toAdd.push(extensionDescription);
		}

		if (toAdd.length === 0 && toRemove.length === 0) {
			return;
		}

		// Update the local registry
		const result = this._registry.deltaExtensions(lock, toAdd, toRemove.map(e => e.identifier));
		this._onDidChangeExtensions.fire({ added: toAdd, removed: toRemove });

		toRemove = toRemove.concat(result.removedDueToLooping);
		if (result.removedDueToLooping.length > 0) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', '))
			});
		}

		// enable or disable proposed API per extension
		this._extensionsProposedApi.updateEnabledApiProposals(toAdd);

		// Update extension points
		this._doHandleExtensionPoints((<IExtensionDescription[]>[]).concat(toAdd).concat(toRemove));

		// Update the extension host
		await this._updateExtensionsOnExtHosts(result.versionId, toAdd, toRemove.map(e => e.identifier));

		for (let i = 0; i < toAdd.length; i++) {
			this._activateAddedExtensionIfNeeded(toAdd[i]);
		}
	}

	private async _updateExtensionsOnExtHosts(versionId: number, toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[]): Promise<void> {
		const removedRunningLocation = this._runningLocations.deltaExtensions(toAdd, toRemove);
		const promises = this._extensionHostManagers.map(
			extHostManager => this._updateExtensionsOnExtHost(extHostManager, versionId, toAdd, toRemove, removedRunningLocation)
		);
		await Promise.all(promises);
	}

	private async _updateExtensionsOnExtHost(extensionHostManager: IExtensionHostManager, versionId: number, toAdd: IExtensionDescription[], toRemove: ExtensionIdentifier[], removedRunningLocation: ExtensionIdentifierMap<ExtensionRunningLocation | null>): Promise<void> {
		const myToAdd = this._runningLocations.filterByExtensionHostManager(toAdd, extensionHostManager);
		const myToRemove = filterExtensionIdentifiers(toRemove, removedRunningLocation, extRunningLocation => extensionHostManager.representsRunningLocation(extRunningLocation));
		const addActivationEvents = ImplicitActivationEvents.createActivationEventsMap(toAdd);
		if (isCI) {
			const printExtIds = (extensions: IExtensionDescription[]) => extensions.map(e => e.identifier.value).join(',');
			const printIds = (extensions: ExtensionIdentifier[]) => extensions.map(e => e.value).join(',');
			this._logService.info(`AbstractExtensionService: Calling deltaExtensions: toRemove: [${printIds(toRemove)}], toAdd: [${printExtIds(toAdd)}], myToRemove: [${printIds(myToRemove)}], myToAdd: [${printExtIds(myToAdd)}],`);
		}
		await extensionHostManager.deltaExtensions({ versionId, toRemove, toAdd, addActivationEvents, myToRemove, myToAdd: myToAdd.map(extension => extension.identifier) });
	}

	public canAddExtension(extension: IExtensionDescription): boolean {
		return this._canAddExtension(extension, []);
	}

	private _canAddExtension(extension: IExtensionDescription, extensionsBeingRemoved: IExtensionDescription[]): boolean {
		// (Also check for renamed extensions)
		const existing = this._registry.getExtensionDescriptionByIdOrUUID(extension.identifier, extension.id);
		if (existing) {
			// This extension is already known (most likely at a different version)
			// so it cannot be added again unless it is removed first
			const isBeingRemoved = extensionsBeingRemoved.some((extensionDescription) => ExtensionIdentifier.equals(extension.identifier, extensionDescription.identifier));
			if (!isBeingRemoved) {
				return false;
			}
		}

		const extensionKinds = this._runningLocations.readExtensionKinds(extension);
		const isRemote = extension.extensionLocation.scheme === Schemas.vscodeRemote;
		const extensionHostKind = this._extensionHostKindPicker.pickExtensionHostKind(extension.identifier, extensionKinds, !isRemote, isRemote, ExtensionRunningPreference.None);
		if (extensionHostKind === null) {
			return false;
		}

		return true;
	}

	public canRemoveExtension(extension: IExtensionDescription): boolean {
		const extensionDescription = this._registry.getExtensionDescription(extension.identifier);
		if (!extensionDescription) {
			// Can't remove an extension that is unknown!
			return false;
		}

		if (this._extensionStatus.get(extensionDescription.identifier)?.activationStarted) {
			// Extension is running, cannot remove it safely
			return false;
		}

		return true;
	}

	private async _activateAddedExtensionIfNeeded(extensionDescription: IExtensionDescription): Promise<void> {
		let shouldActivate = false;
		let shouldActivateReason: string | null = null;
		let hasWorkspaceContains = false;
		const activationEvents = this._activationEventReader.readActivationEvents(extensionDescription);
		for (const activationEvent of activationEvents) {
			if (this._allRequestedActivateEvents.has(activationEvent)) {
				// This activation event was fired before the extension was added
				shouldActivate = true;
				shouldActivateReason = activationEvent;
				break;
			}

			if (activationEvent === '*') {
				shouldActivate = true;
				shouldActivateReason = activationEvent;
				break;
			}

			if (/^workspaceContains/.test(activationEvent)) {
				hasWorkspaceContains = true;
			}

			if (activationEvent === 'onStartupFinished') {
				shouldActivate = true;
				shouldActivateReason = activationEvent;
				break;
			}
		}

		if (shouldActivate) {
			await Promise.all(
				this._extensionHostManagers.map(extHostManager => extHostManager.activate(extensionDescription.identifier, { startup: false, extensionId: extensionDescription.identifier, activationEvent: shouldActivateReason! }))
			).then(() => { });
		} else if (hasWorkspaceContains) {
			const workspace = await this._contextService.getCompleteWorkspace();
			const forceUsingSearch = !!this._environmentService.remoteAuthority;
			const host: IWorkspaceContainsActivationHost = {
				logService: this._logService,
				folders: workspace.folders.map(folder => folder.uri),
				forceUsingSearch: forceUsingSearch,
				exists: (uri) => this._fileService.exists(uri),
				checkExists: (folders, includes, token) => this._instantiationService.invokeFunction((accessor) => checkGlobFileExists(accessor, folders, includes, token))
			};

			const result = await checkActivateWorkspaceContainsExtension(host, extensionDescription);
			if (!result) {
				return;
			}

			await Promise.all(
				this._extensionHostManagers.map(extHostManager => extHostManager.activate(extensionDescription.identifier, { startup: false, extensionId: extensionDescription.identifier, activationEvent: result.activationEvent }))
			).then(() => { });
		}
	}

	//#endregion

	protected async _initialize(): Promise<void> {
		perf.mark('code/willLoadExtensions');
		this._startExtensionHostsIfNecessary(true, []);

		const lock = await this._registry.acquireLock('_initialize');
		try {
			const resolvedExtensions = await this._resolveExtensions();

			this._processExtensions(lock, resolvedExtensions);

			// Start extension hosts which are not automatically started
			const snapshot = this._registry.getSnapshot();
			for (const extHostManager of this._extensionHostManagers) {
				if (extHostManager.startup !== ExtensionHostStartup.EagerAutoStart) {
					const extensions = this._runningLocations.filterByExtensionHostManager(snapshot.extensions, extHostManager);
					extHostManager.start(snapshot.versionId, snapshot.extensions, extensions.map(extension => extension.identifier));
				}
			}
		} finally {
			lock.dispose();
		}

		this._releaseBarrier();
		perf.mark('code/didLoadExtensions');
		await this._handleExtensionTests();
	}

	private _processExtensions(lock: ExtensionDescriptionRegistryLock, resolvedExtensions: ResolvedExtensions): void {
		const { allowRemoteExtensionsInLocalWebWorker, hasLocalProcess } = resolvedExtensions;
		const localExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, resolvedExtensions.local, false);
		let remoteExtensions = checkEnabledAndProposedAPI(this._logService, this._extensionEnablementService, this._extensionsProposedApi, resolvedExtensions.remote, false);

		// `initializeRunningLocation` will look at the complete picture (e.g. an extension installed on both sides),
		// takes care of duplicates and picks a running location for each extension
		this._runningLocations.initializeRunningLocation(localExtensions, remoteExtensions);

		this._startExtensionHostsIfNecessary(true, []);

		// Some remote extensions could run locally in the web worker, so store them
		const remoteExtensionsThatNeedToRunLocally = (allowRemoteExtensionsInLocalWebWorker ? this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.LocalWebWorker) : []);
		const localProcessExtensions = (hasLocalProcess ? this._runningLocations.filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalProcess) : []);
		const localWebWorkerExtensions = this._runningLocations.filterByExtensionHostKind(localExtensions, ExtensionHostKind.LocalWebWorker);
		remoteExtensions = this._runningLocations.filterByExtensionHostKind(remoteExtensions, ExtensionHostKind.Remote);

		// Add locally the remote extensions that need to run locally in the web worker
		for (const ext of remoteExtensionsThatNeedToRunLocally) {
			if (!includes(localWebWorkerExtensions, ext.identifier)) {
				localWebWorkerExtensions.push(ext);
			}
		}

		const allExtensions = remoteExtensions.concat(localProcessExtensions).concat(localWebWorkerExtensions);

		const result = this._registry.deltaExtensions(lock, allExtensions, []);
		if (result.removedDueToLooping.length > 0) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', '))
			});
		}

		this._doHandleExtensionPoints(this._registry.getAllExtensionDescriptions());
	}

	private async _handleExtensionTests(): Promise<void> {
		if (!this._environmentService.isExtensionDevelopment || !this._environmentService.extensionTestsLocationURI) {
			return;
		}

		const extensionHostManager = this.findTestExtensionHost(this._environmentService.extensionTestsLocationURI);
		if (!extensionHostManager) {
			const msg = nls.localize('extensionTestError', "No extension host found that can launch the test runner at {0}.", this._environmentService.extensionTestsLocationURI.toString());
			console.error(msg);
			this._notificationService.error(msg);
			return;
		}


		let exitCode: number;
		try {
			exitCode = await extensionHostManager.extensionTestsExecute();
			if (isCI) {
				this._logService.info(`Extension host test runner exit code: ${exitCode}`);
			}
		} catch (err) {
			if (isCI) {
				this._logService.error(`Extension host test runner error`, err);
			}
			console.error(err);
			exitCode = 1 /* ERROR */;
		}

		this._onExtensionHostExit(exitCode);
	}

	private findTestExtensionHost(testLocation: URI): IExtensionHostManager | null {
		let runningLocation: ExtensionRunningLocation | null = null;

		for (const extension of this._registry.getAllExtensionDescriptions()) {
			if (isEqualOrParent(testLocation, extension.extensionLocation)) {
				runningLocation = this._runningLocations.getRunningLocation(extension.identifier);
				break;
			}
		}
		if (runningLocation === null) {
			// not sure if we should support that, but it was possible to have an test outside an extension

			if (testLocation.scheme === Schemas.vscodeRemote) {
				runningLocation = new RemoteRunningLocation();
			} else {
				// When a debugger attaches to the extension host, it will surface all console.log messages from the extension host,
				// but not necessarily from the window. So it would be best if any errors get printed to the console of the extension host.
				// That is why here we use the local process extension host even for non-file URIs
				runningLocation = new LocalProcessRunningLocation(0);
			}
		}
		if (runningLocation !== null) {
			return this._extensionHostManagers.getByRunningLocation(runningLocation);
		}
		return null;
	}

	private _releaseBarrier(): void {
		this._installedExtensionsReady.open();
		this._onDidRegisterExtensions.fire(undefined);
		this._onDidChangeExtensionsStatus.fire(this._registry.getAllExtensionDescriptions().map(e => e.identifier));
	}

	//#region remote authority resolving

	protected async _resolveAuthorityInitial(remoteAuthority: string): Promise<ResolverResult> {
		const MAX_ATTEMPTS = 5;

		for (let attempt = 1; ; attempt++) {
			try {
				return this._resolveAuthorityWithLogging(remoteAuthority);
			} catch (err) {
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

	protected async _resolveAuthorityAgain(): Promise<void> {
		const remoteAuthority = this._environmentService.remoteAuthority;
		if (!remoteAuthority) {
			return;
		}

		this._remoteAuthorityResolverService._clearResolvedAuthority(remoteAuthority);
		try {
			const result = await this._resolveAuthorityWithLogging(remoteAuthority);
			this._remoteAuthorityResolverService._setResolvedAuthority(result.authority, result.options);
		} catch (err) {
			this._remoteAuthorityResolverService._setResolvedAuthorityError(remoteAuthority, err);
		}
	}

	private async _resolveAuthorityWithLogging(remoteAuthority: string): Promise<ResolverResult> {
		const authorityPrefix = getRemoteAuthorityPrefix(remoteAuthority);
		const sw = StopWatch.create(false);
		this._logService.info(`Invoking resolveAuthority(${authorityPrefix})...`);
		try {
			perf.mark(`code/willResolveAuthority/${authorityPrefix}`);
			const result = await this._resolveAuthority(remoteAuthority);
			perf.mark(`code/didResolveAuthorityOK/${authorityPrefix}`);
			this._logService.info(`resolveAuthority(${authorityPrefix}) returned '${result.authority.connectTo}' after ${sw.elapsed()} ms`);
			return result;
		} catch (err) {
			perf.mark(`code/didResolveAuthorityError/${authorityPrefix}`);
			this._logService.error(`resolveAuthority(${authorityPrefix}) returned an error after ${sw.elapsed()} ms`, err);
			throw err;
		}
	}

	protected async _resolveAuthorityOnExtensionHosts(kind: ExtensionHostKind, remoteAuthority: string): Promise<ResolverResult> {

		const extensionHosts = this._getExtensionHostManagers(kind);
		if (extensionHosts.length === 0) {
			// no local process extension hosts
			throw new Error(`Cannot resolve authority`);
		}

		this._resolveAuthorityAttempt++;
		const results = await Promise.all(extensionHosts.map(extHost => extHost.resolveAuthority(remoteAuthority, this._resolveAuthorityAttempt)));

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

	//#endregion

	//#region Stopping / Starting / Restarting

	public stopExtensionHosts(reason: string, auto?: boolean): Promise<boolean> {
		return this._doStopExtensionHostsWithVeto(reason, auto);
	}

	protected async _doStopExtensionHosts(): Promise<void> {
		const previouslyActivatedExtensionIds: ExtensionIdentifier[] = [];
		for (const extensionStatus of this._extensionStatus.values()) {
			if (extensionStatus.activationStarted) {
				previouslyActivatedExtensionIds.push(extensionStatus.id);
			}
		}

		await this._extensionHostManagers.stopAllInReverse();
		for (const extensionStatus of this._extensionStatus.values()) {
			extensionStatus.clearRuntimeStatus();
		}

		if (previouslyActivatedExtensionIds.length > 0) {
			this._onDidChangeExtensionsStatus.fire(previouslyActivatedExtensionIds);
		}
	}

	private async _doStopExtensionHostsWithVeto(reason: string, auto: boolean = false): Promise<boolean> {
		const vetos: (boolean | Promise<boolean>)[] = [];
		const vetoReasons = new Set<string>();

		this._onWillStop.fire({
			reason,
			auto,
			veto(value, reason) {
				vetos.push(value);

				if (typeof value === 'boolean') {
					if (value === true) {
						vetoReasons.add(reason);
					}
				} else {
					value.then(value => {
						if (value) {
							vetoReasons.add(reason);
						}
					}).catch(error => {
						vetoReasons.add(nls.localize('extensionStopVetoError', "{0} (Error: {1})", reason, toErrorMessage(error)));
					});
				}
			}
		});

		const veto = await handleVetos(vetos, error => this._logService.error(error));
		if (!veto) {
			await this._doStopExtensionHosts();
		} else {
			if (!auto) {
				const vetoReasonsArray = Array.from(vetoReasons);

				this._logService.warn(`Extension host was not stopped because of veto (stop reason: ${reason}, veto reason: ${vetoReasonsArray.join(', ')})`);
				await this._dialogService.warn(
					nls.localize('extensionStopVetoMessage', "The following operation was blocked: {0}", reason),
					vetoReasonsArray.length === 1 ?
						nls.localize('extensionStopVetoDetailsOne', "The reason for blocking the operation: {0}", vetoReasonsArray[0]) :
						nls.localize('extensionStopVetoDetailsMany', "The reasons for blocking the operation:\n- {0}", vetoReasonsArray.join('\n -')),
				);
			}

		}

		return !veto;
	}

	private _startExtensionHostsIfNecessary(isInitialStart: boolean, initialActivationEvents: string[]): void {
		const locations: ExtensionRunningLocation[] = [];
		for (let affinity = 0; affinity <= this._runningLocations.maxLocalProcessAffinity; affinity++) {
			locations.push(new LocalProcessRunningLocation(affinity));
		}
		for (let affinity = 0; affinity <= this._runningLocations.maxLocalWebWorkerAffinity; affinity++) {
			locations.push(new LocalWebWorkerRunningLocation(affinity));
		}
		locations.push(new RemoteRunningLocation());
		for (const location of locations) {
			if (this._extensionHostManagers.getByRunningLocation(location)) {
				// already running
				continue;
			}
			const res = this._createExtensionHostManager(location, isInitialStart, initialActivationEvents);
			if (res) {
				const [extHostManager, disposableStore] = res;
				this._extensionHostManagers.add(extHostManager, disposableStore);
			}
		}
	}

	private _createExtensionHostManager(runningLocation: ExtensionRunningLocation, isInitialStart: boolean, initialActivationEvents: string[]): null | [IExtensionHostManager, DisposableStore] {
		const extensionHost = this._extensionHostFactory.createExtensionHost(this._runningLocations, runningLocation, isInitialStart);
		if (!extensionHost) {
			return null;
		}

		const processManager: IExtensionHostManager = this._doCreateExtensionHostManager(extensionHost, initialActivationEvents);
		const disposableStore = new DisposableStore();
		disposableStore.add(processManager.onDidExit(([code, signal]) => this._onExtensionHostCrashOrExit(processManager, code, signal)));
		disposableStore.add(processManager.onDidChangeResponsiveState((responsiveState) => {
			this._logService.info(`Extension host (${processManager.friendyName}) is ${responsiveState === ResponsiveState.Responsive ? 'responsive' : 'unresponsive'}.`);
			this._onDidChangeResponsiveChange.fire({
				extensionHostKind: processManager.kind,
				isResponsive: responsiveState === ResponsiveState.Responsive,
				getInspectListener: (tryEnableInspector: boolean) => {
					return processManager.getInspectPort(tryEnableInspector);
				}
			});
		}));
		return [processManager, disposableStore];
	}

	protected _doCreateExtensionHostManager(extensionHost: IExtensionHost, initialActivationEvents: string[]): IExtensionHostManager {
		const internalExtensionService = this._acquireInternalAPI(extensionHost);
		if (extensionHost.startup === ExtensionHostStartup.Lazy && initialActivationEvents.length === 0) {
			return this._instantiationService.createInstance(LazyCreateExtensionHostManager, extensionHost, internalExtensionService);
		}
		return this._instantiationService.createInstance(ExtensionHostManager, extensionHost, initialActivationEvents, internalExtensionService);
	}

	private _onExtensionHostCrashOrExit(extensionHost: IExtensionHostManager, code: number, signal: string | null): void {

		// Unexpected termination
		const isExtensionDevHost = parseExtensionDevOptions(this._environmentService).isExtensionDevHost;
		if (!isExtensionDevHost) {
			this._onExtensionHostCrashed(extensionHost, code, signal);
			return;
		}

		this._onExtensionHostExit(code);
	}

	protected _onExtensionHostCrashed(extensionHost: IExtensionHostManager, code: number, signal: string | null): void {
		console.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. Code: ${code}, Signal: ${signal}`);
		if (extensionHost.kind === ExtensionHostKind.LocalProcess) {
			this._doStopExtensionHosts();
		} else if (extensionHost.kind === ExtensionHostKind.Remote) {
			if (signal) {
				this._onRemoteExtensionHostCrashed(extensionHost, signal);
			}
			this._extensionHostManagers.stopOne(extensionHost);
		}
	}

	private _getExtensionHostExitInfoWithTimeout(reconnectionToken: string): Promise<IExtensionHostExitInfo | null> {
		return new Promise((resolve, reject) => {
			const timeoutHandle = setTimeout(() => {
				reject(new Error('getExtensionHostExitInfo timed out'));
			}, 2000);
			this._remoteAgentService.getExtensionHostExitInfo(reconnectionToken).then(
				(r) => {
					clearTimeout(timeoutHandle);
					resolve(r);
				},
				reject
			);
		});
	}

	private async _onRemoteExtensionHostCrashed(extensionHost: IExtensionHostManager, reconnectionToken: string): Promise<void> {
		try {
			const info = await this._getExtensionHostExitInfoWithTimeout(reconnectionToken);
			if (info) {
				this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly with code ${info.code}.`);
			}

			this._logExtensionHostCrash(extensionHost);
			this._remoteCrashTracker.registerCrash();

			if (this._remoteCrashTracker.shouldAutomaticallyRestart()) {
				this._logService.info(`Automatically restarting the remote extension host.`);
				this._notificationService.status(nls.localize('extensionService.autoRestart', "The remote extension host terminated unexpectedly. Restarting..."), { hideAfter: 5000 });
				this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
			} else {
				this._notificationService.prompt(Severity.Error, nls.localize('extensionService.crash', "Remote Extension host terminated unexpectedly 3 times within the last 5 minutes."),
					[{
						label: nls.localize('restart', "Restart Remote Extension Host"),
						run: () => {
							this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));
						}
					}]
				);
			}
		} catch (err) {
			// maybe this wasn't an extension host crash and it was a permanent disconnection
		}
	}

	protected _logExtensionHostCrash(extensionHost: IExtensionHostManager): void {

		const activatedExtensions: ExtensionIdentifier[] = [];
		for (const extensionStatus of this._extensionStatus.values()) {
			if (extensionStatus.activationStarted && extensionHost.containsExtension(extensionStatus.id)) {
				activatedExtensions.push(extensionStatus.id);
			}
		}

		if (activatedExtensions.length > 0) {
			this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. The following extensions were running: ${activatedExtensions.map(id => id.value).join(', ')}`);
		} else {
			this._logService.error(`Extension host (${extensionHost.friendyName}) terminated unexpectedly. No extensions were activated.`);
		}
	}

	public async startExtensionHosts(updates?: { toAdd: IExtension[]; toRemove: string[] }): Promise<void> {
		await this._doStopExtensionHosts();

		if (updates) {
			await this._handleDeltaExtensions(new DeltaExtensionsQueueItem(updates.toAdd, updates.toRemove));
		}

		const lock = await this._registry.acquireLock('startExtensionHosts');
		try {
			this._startExtensionHostsIfNecessary(false, Array.from(this._allRequestedActivateEvents.keys()));

			const localProcessExtensionHosts = this._getExtensionHostManagers(ExtensionHostKind.LocalProcess);
			await Promise.all(localProcessExtensionHosts.map(extHost => extHost.ready()));
		} finally {
			lock.dispose();
		}
	}

	//#endregion

	//#region IExtensionService

	public activateByEvent(activationEvent: string, activationKind: ActivationKind = ActivationKind.Normal): Promise<void> {
		if (this._installedExtensionsReady.isOpen()) {
			// Extensions have been scanned and interpreted

			// Record the fact that this activationEvent was requested (in case of a restart)
			this._allRequestedActivateEvents.add(activationEvent);

			if (!this._registry.containsActivationEvent(activationEvent)) {
				// There is no extension that is interested in this activation event
				return NO_OP_VOID_PROMISE;
			}

			return this._activateByEvent(activationEvent, activationKind);
		} else {
			// Extensions have not been scanned yet.

			// Record the fact that this activationEvent was requested (in case of a restart)
			this._allRequestedActivateEvents.add(activationEvent);

			if (activationKind === ActivationKind.Immediate) {
				// Do not wait for the normal start-up of the extension host(s)
				return this._activateByEvent(activationEvent, activationKind);
			}

			return this._installedExtensionsReady.wait().then(() => this._activateByEvent(activationEvent, activationKind));
		}
	}

	private _activateByEvent(activationEvent: string, activationKind: ActivationKind): Promise<void> {
		const result = Promise.all(
			this._extensionHostManagers.map(extHostManager => extHostManager.activateByEvent(activationEvent, activationKind))
		).then(() => { });
		this._onWillActivateByEvent.fire({
			event: activationEvent,
			activation: result
		});
		return result;
	}

	public activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		return this._activateById(extensionId, reason);
	}

	public activationEventIsDone(activationEvent: string): boolean {
		if (!this._installedExtensionsReady.isOpen()) {
			return false;
		}
		if (!this._registry.containsActivationEvent(activationEvent)) {
			// There is no extension that is interested in this activation event
			return true;
		}
		return this._extensionHostManagers.every(manager => manager.activationEventIsDone(activationEvent));
	}

	public whenInstalledExtensionsRegistered(): Promise<boolean> {
		return this._installedExtensionsReady.wait();
	}

	get extensions(): IExtensionDescription[] {
		return this._registry.getAllExtensionDescriptions();
	}

	protected _getExtensionRegistrySnapshotWhenReady(): Promise<ExtensionDescriptionRegistrySnapshot> {
		return this._installedExtensionsReady.wait().then(() => this._registry.getSnapshot());
	}

	public getExtension(id: string): Promise<IExtensionDescription | undefined> {
		return this._installedExtensionsReady.wait().then(() => {
			return this._registry.getExtensionDescription(id);
		});
	}

	public readExtensionPointContributions<T extends IExtensionContributions[keyof IExtensionContributions]>(extPoint: IExtensionPoint<T>): Promise<ExtensionPointContribution<T>[]> {
		return this._installedExtensionsReady.wait().then(() => {
			const availableExtensions = this._registry.getAllExtensionDescriptions();

			const result: ExtensionPointContribution<T>[] = [];
			for (const desc of availableExtensions) {
				if (desc.contributes && hasOwnProperty.call(desc.contributes, extPoint.name)) {
					result.push(new ExtensionPointContribution<T>(desc, desc.contributes[extPoint.name as keyof typeof desc.contributes] as T));
				}
			}

			return result;
		});
	}

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		const result: { [id: string]: IExtensionsStatus } = Object.create(null);
		if (this._registry) {
			const extensions = this._registry.getAllExtensionDescriptions();
			for (const extension of extensions) {
				const extensionStatus = this._extensionStatus.get(extension.identifier);
				result[extension.identifier.value] = {
					id: extension.identifier,
					messages: extensionStatus?.messages ?? [],
					activationStarted: extensionStatus?.activationStarted ?? false,
					activationTimes: extensionStatus?.activationTimes ?? undefined,
					runtimeErrors: extensionStatus?.runtimeErrors ?? [],
					runningLocation: this._runningLocations.getRunningLocation(extension.identifier),
				};
			}
		}
		return result;
	}

	public async getInspectPorts(extensionHostKind: ExtensionHostKind, tryEnableInspector: boolean): Promise<{ port: number; host: string }[]> {
		const result = await Promise.all(
			this._getExtensionHostManagers(extensionHostKind).map(extHost => extHost.getInspectPort(tryEnableInspector))
		);
		// remove 0s:
		return result.filter(isDefined);
	}

	public async setRemoteEnvironment(env: { [key: string]: string | null }): Promise<void> {
		await this._extensionHostManagers
			.map(manager => manager.setRemoteEnvironment(env));
	}

	//#endregion

	// --- impl

	private _safeInvokeIsEnabled(extension: IExtension): boolean {
		try {
			return this._extensionEnablementService.isEnabled(extension);
		} catch (err) {
			return false;
		}
	}

	private _doHandleExtensionPoints(affectedExtensions: IExtensionDescription[]): void {
		const affectedExtensionPoints: { [extPointName: string]: boolean } = Object.create(null);
		for (const extensionDescription of affectedExtensions) {
			if (extensionDescription.contributes) {
				for (const extPointName in extensionDescription.contributes) {
					if (hasOwnProperty.call(extensionDescription.contributes, extPointName)) {
						affectedExtensionPoints[extPointName] = true;
					}
				}
			}
		}

		const messageHandler = (msg: IMessage) => this._handleExtensionPointMessage(msg);
		const availableExtensions = this._registry.getAllExtensionDescriptions();
		const extensionPoints = ExtensionsRegistry.getExtensionPoints();
		perf.mark('code/willHandleExtensionPoints');
		for (const extensionPoint of extensionPoints) {
			if (affectedExtensionPoints[extensionPoint.name]) {
				perf.mark(`code/willHandleExtensionPoint/${extensionPoint.name}`);
				AbstractExtensionService._handleExtensionPoint(extensionPoint, availableExtensions, messageHandler);
				perf.mark(`code/didHandleExtensionPoint/${extensionPoint.name}`);
			}
		}
		perf.mark('code/didHandleExtensionPoints');
	}

	private _getOrCreateExtensionStatus(extensionId: ExtensionIdentifier): ExtensionStatus {
		if (!this._extensionStatus.has(extensionId)) {
			this._extensionStatus.set(extensionId, new ExtensionStatus(extensionId));
		}
		return this._extensionStatus.get(extensionId)!;
	}

	private _handleExtensionPointMessage(msg: IMessage) {
		const extensionStatus = this._getOrCreateExtensionStatus(msg.extensionId);
		extensionStatus.addMessage(msg);

		const extension = this._registry.getExtensionDescription(msg.extensionId);
		const strMsg = `[${msg.extensionId.value}]: ${msg.message}`;

		if (msg.type === Severity.Error) {
			if (extension && extension.isUnderDevelopment) {
				// This message is about the extension currently being developed
				this._notificationService.notify({ severity: Severity.Error, message: strMsg });
			}
			this._logService.error(strMsg);
		} else if (msg.type === Severity.Warning) {
			if (extension && extension.isUnderDevelopment) {
				// This message is about the extension currently being developed
				this._notificationService.notify({ severity: Severity.Warning, message: strMsg });
			}
			this._logService.warn(strMsg);
		} else {
			this._logService.info(strMsg);
		}

		if (msg.extensionId && this._environmentService.isBuilt && !this._environmentService.isExtensionDevelopment) {
			const { type, extensionId, extensionPointId, message } = msg;
			type ExtensionsMessageClassification = {
				owner: 'alexdima';
				comment: 'A validation message for an extension';
				type: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Severity of problem.' };
				extensionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the extension that has a problem.' };
				extensionPointId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The extension point that has a problem.' };
				message: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The message of the problem.' };
			};
			type ExtensionsMessageEvent = {
				type: Severity;
				extensionId: string;
				extensionPointId: string;
				message: string;
			};
			this._telemetryService.publicLog2<ExtensionsMessageEvent, ExtensionsMessageClassification>('extensionsMessage', {
				type, extensionId: extensionId.value, extensionPointId, message
			});
		}
	}

	private static _handleExtensionPoint<T extends IExtensionContributions[keyof IExtensionContributions]>(extensionPoint: ExtensionPoint<T>, availableExtensions: IExtensionDescription[], messageHandler: (msg: IMessage) => void): void {
		const users: IExtensionPointUser<T>[] = [];
		for (const desc of availableExtensions) {
			if (desc.contributes && hasOwnProperty.call(desc.contributes, extensionPoint.name)) {
				users.push({
					description: desc,
					value: desc.contributes[extensionPoint.name as keyof typeof desc.contributes] as T,
					collector: new ExtensionMessageCollector(messageHandler, desc, extensionPoint.name)
				});
			}
		}
		extensionPoint.acceptUsers(users);
	}

	//#region Called by extension host

	private _acquireInternalAPI(extensionHost: IExtensionHost): IInternalExtensionService {
		return {
			_activateById: (extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> => {
				return this._activateById(extensionId, reason);
			},
			_onWillActivateExtension: (extensionId: ExtensionIdentifier): void => {
				return this._onWillActivateExtension(extensionId, extensionHost.runningLocation);
			},
			_onDidActivateExtension: (extensionId: ExtensionIdentifier, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationReason: ExtensionActivationReason): void => {
				return this._onDidActivateExtension(extensionId, codeLoadingTime, activateCallTime, activateResolvedTime, activationReason);
			},
			_onDidActivateExtensionError: (extensionId: ExtensionIdentifier, error: Error): void => {
				return this._onDidActivateExtensionError(extensionId, error);
			},
			_onExtensionRuntimeError: (extensionId: ExtensionIdentifier, err: Error): void => {
				return this._onExtensionRuntimeError(extensionId, err);
			}
		};
	}

	public async _activateById(extensionId: ExtensionIdentifier, reason: ExtensionActivationReason): Promise<void> {
		const results = await Promise.all(
			this._extensionHostManagers.map(manager => manager.activate(extensionId, reason))
		);
		const activated = results.some(e => e);
		if (!activated) {
			throw new Error(`Unknown extension ${extensionId.value}`);
		}
	}

	private _onWillActivateExtension(extensionId: ExtensionIdentifier, runningLocation: ExtensionRunningLocation): void {
		this._runningLocations.set(extensionId, runningLocation);
		const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
		extensionStatus.onWillActivate();
	}

	private _onDidActivateExtension(extensionId: ExtensionIdentifier, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationReason: ExtensionActivationReason): void {
		const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
		extensionStatus.setActivationTimes(new ActivationTimes(codeLoadingTime, activateCallTime, activateResolvedTime, activationReason));
		this._onDidChangeExtensionsStatus.fire([extensionId]);
	}

	private _onDidActivateExtensionError(extensionId: ExtensionIdentifier, error: Error): void {
		type ExtensionActivationErrorClassification = {
			owner: 'alexdima';
			comment: 'An extension failed to activate';
			extensionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The identifier of the extension.' };
			error: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error message.' };
		};
		type ExtensionActivationErrorEvent = {
			extensionId: string;
			error: string;
		};
		this._telemetryService.publicLog2<ExtensionActivationErrorEvent, ExtensionActivationErrorClassification>('extensionActivationError', {
			extensionId: extensionId.value,
			error: error.message
		});
	}

	private _onExtensionRuntimeError(extensionId: ExtensionIdentifier, err: Error): void {
		const extensionStatus = this._getOrCreateExtensionStatus(extensionId);
		extensionStatus.addRuntimeError(err);
		this._onDidChangeExtensionsStatus.fire([extensionId]);
	}

	//#endregion

	protected abstract _resolveExtensions(): Promise<ResolvedExtensions>;
	protected abstract _onExtensionHostExit(code: number): Promise<void>;
	protected abstract _resolveAuthority(remoteAuthority: string): Promise<ResolverResult>;
}

class ExtensionHostCollection extends Disposable {

	private _extensionHostManagers: ExtensionHostManagerData[] = [];

	public override dispose() {
		for (let i = this._extensionHostManagers.length - 1; i >= 0; i--) {
			const manager = this._extensionHostManagers[i];
			manager.extensionHost.disconnect();
			manager.dispose();
		}
		this._extensionHostManagers = [];
		super.dispose();
	}

	public add(extensionHostManager: IExtensionHostManager, disposableStore: DisposableStore): void {
		this._extensionHostManagers.push(new ExtensionHostManagerData(extensionHostManager, disposableStore));
	}

	public async stopAllInReverse(): Promise<void> {
		// See https://github.com/microsoft/vscode/issues/152204
		// Dispose extension hosts in reverse creation order because the local extension host
		// might be critical in sustaining a connection to the remote extension host
		for (let i = this._extensionHostManagers.length - 1; i >= 0; i--) {
			const manager = this._extensionHostManagers[i];
			await manager.extensionHost.disconnect();
			manager.dispose();
		}
		this._extensionHostManagers = [];
	}

	public async stopOne(extensionHostManager: IExtensionHostManager): Promise<void> {
		const index = this._extensionHostManagers.findIndex(el => el.extensionHost === extensionHostManager);
		if (index >= 0) {
			this._extensionHostManagers.splice(index, 1);
			await extensionHostManager.disconnect();
			extensionHostManager.dispose();
		}
	}

	public getByKind(kind: ExtensionHostKind): IExtensionHostManager[] {
		return this.filter(el => el.kind === kind);
	}

	public getByRunningLocation(runningLocation: ExtensionRunningLocation): IExtensionHostManager | null {
		for (const el of this._extensionHostManagers) {
			if (el.extensionHost.representsRunningLocation(runningLocation)) {
				return el.extensionHost;
			}
		}
		return null;
	}

	*[Symbol.iterator]() {
		for (const extensionHostManager of this._extensionHostManagers) {
			yield extensionHostManager.extensionHost;
		}
	}

	public map<T>(callback: (extHostManager: IExtensionHostManager) => T): T[] {
		return this._extensionHostManagers.map(el => callback(el.extensionHost));
	}

	public every(callback: (extHostManager: IExtensionHostManager) => unknown): boolean {
		return this._extensionHostManagers.every(el => callback(el.extensionHost));
	}

	public filter(callback: (extHostManager: IExtensionHostManager) => unknown): IExtensionHostManager[] {
		return this._extensionHostManagers.filter(el => callback(el.extensionHost)).map(el => el.extensionHost);
	}
}

class ExtensionHostManagerData {
	constructor(
		public readonly extensionHost: IExtensionHostManager,
		public readonly disposableStore: DisposableStore
	) { }

	public dispose(): void {
		this.disposableStore.dispose();
		this.extensionHost.dispose();
	}
}

export class ResolvedExtensions {
	constructor(
		public readonly local: IExtensionDescription[],
		public readonly remote: IExtensionDescription[],
		public readonly hasLocalProcess: boolean,
		public readonly allowRemoteExtensionsInLocalWebWorker: boolean
	) { }
}

export interface IExtensionHostFactory {
	createExtensionHost(runningLocations: ExtensionRunningLocationTracker, runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null;
}

class DeltaExtensionsQueueItem {
	constructor(
		public readonly toAdd: IExtension[],
		public readonly toRemove: string[] | IExtension[]
	) { }
}

/**
 * @argument extensions The extensions to be checked.
 * @argument ignoreWorkspaceTrust Do not take workspace trust into account.
 */
export function checkEnabledAndProposedAPI(logService: ILogService, extensionEnablementService: IWorkbenchExtensionEnablementService, extensionsProposedApi: ExtensionsProposedApi, extensions: IExtensionDescription[], ignoreWorkspaceTrust: boolean): IExtensionDescription[] {
	// enable or disable proposed API per extension
	extensionsProposedApi.updateEnabledApiProposals(extensions);

	// keep only enabled extensions
	return filterEnabledExtensions(logService, extensionEnablementService, extensions, ignoreWorkspaceTrust);
}

/**
 * Return the subset of extensions that are enabled.
 * @argument ignoreWorkspaceTrust Do not take workspace trust into account.
 */
export function filterEnabledExtensions(logService: ILogService, extensionEnablementService: IWorkbenchExtensionEnablementService, extensions: IExtensionDescription[], ignoreWorkspaceTrust: boolean): IExtensionDescription[] {
	const enabledExtensions: IExtensionDescription[] = [], extensionsToCheck: IExtensionDescription[] = [], mappedExtensions: IExtension[] = [];
	for (const extension of extensions) {
		if (extension.isUnderDevelopment) {
			// Never disable extensions under development
			enabledExtensions.push(extension);
		} else {
			extensionsToCheck.push(extension);
			mappedExtensions.push(toExtension(extension));
		}
	}

	const enablementStates = extensionEnablementService.getEnablementStates(mappedExtensions, ignoreWorkspaceTrust ? { trusted: true } : undefined);
	for (let index = 0; index < enablementStates.length; index++) {
		if (extensionEnablementService.isEnabledEnablementState(enablementStates[index])) {
			enabledExtensions.push(extensionsToCheck[index]);
		} else {
			if (isCI) {
				logService.info(`filterEnabledExtensions: extension '${extensionsToCheck[index].identifier.value}' is disabled`);
			}
		}
	}

	return enabledExtensions;
}

/**
 * @argument extension The extension to be checked.
 * @argument ignoreWorkspaceTrust Do not take workspace trust into account.
 */
export function extensionIsEnabled(logService: ILogService, extensionEnablementService: IWorkbenchExtensionEnablementService, extension: IExtensionDescription, ignoreWorkspaceTrust: boolean): boolean {
	return filterEnabledExtensions(logService, extensionEnablementService, [extension], ignoreWorkspaceTrust).includes(extension);
}

function includes(extensions: IExtensionDescription[], identifier: ExtensionIdentifier): boolean {
	for (const extension of extensions) {
		if (ExtensionIdentifier.equals(extension.identifier, identifier)) {
			return true;
		}
	}
	return false;
}

export class ExtensionStatus {

	private readonly _messages: IMessage[] = [];
	public get messages(): IMessage[] {
		return this._messages;
	}

	private _activationTimes: ActivationTimes | null = null;
	public get activationTimes(): ActivationTimes | null {
		return this._activationTimes;
	}

	private _runtimeErrors: Error[] = [];
	public get runtimeErrors(): Error[] {
		return this._runtimeErrors;
	}

	private _activationStarted: boolean = false;
	public get activationStarted(): boolean {
		return this._activationStarted;
	}

	constructor(
		public readonly id: ExtensionIdentifier,
	) { }

	public clearRuntimeStatus(): void {
		this._activationStarted = false;
		this._activationTimes = null;
		this._runtimeErrors = [];
	}

	public addMessage(msg: IMessage): void {
		this._messages.push(msg);
	}

	public setActivationTimes(activationTimes: ActivationTimes) {
		this._activationTimes = activationTimes;
	}

	public addRuntimeError(err: Error): void {
		this._runtimeErrors.push(err);
	}

	public onWillActivate() {
		this._activationStarted = true;
	}
}

interface IExtensionHostCrashInfo {
	timestamp: number;
}

export class ExtensionHostCrashTracker {

	private static _TIME_LIMIT = 5 * 60 * 1000; // 5 minutes
	private static _CRASH_LIMIT = 3;

	private readonly _recentCrashes: IExtensionHostCrashInfo[] = [];

	private _removeOldCrashes(): void {
		const limit = Date.now() - ExtensionHostCrashTracker._TIME_LIMIT;
		while (this._recentCrashes.length > 0 && this._recentCrashes[0].timestamp < limit) {
			this._recentCrashes.shift();
		}
	}

	public registerCrash(): void {
		this._removeOldCrashes();
		this._recentCrashes.push({ timestamp: Date.now() });
	}

	public shouldAutomaticallyRestart(): boolean {
		this._removeOldCrashes();
		return (this._recentCrashes.length < ExtensionHostCrashTracker._CRASH_LIMIT);
	}
}

/**
 * This can run correctly only on the renderer process because that is the only place
 * where all extension points and all implicit activation events generators are known.
 */
export class ImplicitActivationAwareReader implements IActivationEventsReader {
	public readActivationEvents(extensionDescription: IExtensionDescription): string[] {
		return ImplicitActivationEvents.readActivationEvents(extensionDescription);
	}
}

class ActivationFeatureMarkdowneRenderer extends Disposable implements IExtensionFeatureMarkdownRenderer {

	readonly type = 'markdown';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.activationEvents;
	}

	render(manifest: IExtensionManifest): IRenderedData<IMarkdownString> {
		const activationEvents = manifest.activationEvents || [];
		const data = new MarkdownString();
		if (activationEvents.length) {
			for (const activationEvent of activationEvents) {
				data.appendMarkdown(`- \`${activationEvent}\`\n`);
			}
		}
		return {
			data,
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'activationEvents',
	label: nls.localize('activation', "Activation Events"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ActivationFeatureMarkdowneRenderer),
});
