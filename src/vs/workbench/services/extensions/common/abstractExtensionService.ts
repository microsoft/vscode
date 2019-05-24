/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Barrier, runWhenIdle } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as perf from 'vs/base/common/performance';
import { isEqualOrParent } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IExtensionEnablementService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { BetterMergeId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInitDataProvider, RemoteExtensionHostClient } from 'vs/workbench/services/extensions/common/remoteExtensionHostClient';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService, ResolvedAuthority, RemoteAuthorityResolverError } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { isUIExtension } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { ActivationTimes, ExtensionPointContribution, IExtensionService, IExtensionsStatus, IMessage, IWillActivateEvent, IResponsiveStateChangeEvent, toExtension, IExtensionHostStarter } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionMessageCollector, ExtensionPoint, ExtensionsRegistry, IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { ResponsiveState } from 'vs/workbench/services/extensions/common/rpcProtocol';
import { ExtensionHostProcessManager } from 'vs/workbench/services/extensions/common/extensionHostProcessManager';
import { ExtensionIdentifier, IExtension, ExtensionType, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { PersistenConnectionEventType, IWebSocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';
import { IProductService } from 'vs/platform/product/common/product';
import { Translations, ILog, Logger } from 'vs/workbench/services/extensions/common/extensionPoints';

const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = Promise.resolve<void>(undefined);

class DeltaExtensionsQueueItem {
	constructor(
		public readonly toAdd: IExtension[],
		public readonly toRemove: string[]
	) { }
}

export interface IExtensionScanner {

	readonly scannedExtensions: Promise<IExtensionDescription[]>;
	readonly translationConfig: Promise<Translations>;

	scanSingleExtension(path: string, isBuiltin: boolean, log: ILog): Promise<IExtensionDescription | null>;
	startScanningExtensions(log: ILog): Promise<void>;
}

export abstract class CommonExtensionService extends Disposable implements IExtensionService {

	public _serviceBrand: any;

	protected readonly _onDidRegisterExtensions: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidRegisterExtensions = this._onDidRegisterExtensions.event;

	protected readonly _onDidChangeExtensionsStatus: Emitter<ExtensionIdentifier[]> = this._register(new Emitter<ExtensionIdentifier[]>());
	public readonly onDidChangeExtensionsStatus: Event<ExtensionIdentifier[]> = this._onDidChangeExtensionsStatus.event;

	protected readonly _onDidChangeExtensions: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeExtensions: Event<void> = this._onDidChangeExtensions.event;

	protected readonly _onWillActivateByEvent = this._register(new Emitter<IWillActivateEvent>());
	public readonly onWillActivateByEvent: Event<IWillActivateEvent> = this._onWillActivateByEvent.event;

	protected readonly _onDidChangeResponsiveChange = this._register(new Emitter<IResponsiveStateChangeEvent>());
	public readonly onDidChangeResponsiveChange: Event<IResponsiveStateChangeEvent> = this._onDidChangeResponsiveChange.event;

	protected readonly _registry: ExtensionDescriptionRegistry;
	private readonly _installedExtensionsReady: Barrier;
	protected readonly _isDev: boolean;
	private readonly _extensionsMessages: Map<string, IMessage[]>;
	protected readonly _allRequestedActivateEvents: { [activationEvent: string]: boolean; };
	private readonly _proposedApiController: ProposedApiController;
	private readonly _isExtensionDevHost: boolean;
	protected readonly _isExtensionDevTestFromCli: boolean;

	// --- Members used per extension host process
	protected _extensionHostProcessManagers: ExtensionHostProcessManager[];
	protected _extensionHostActiveExtensions: Map<string, ExtensionIdentifier>;
	private _extensionHostProcessActivationTimes: Map<string, ActivationTimes>;
	private _extensionHostExtensionRuntimeErrors: Map<string, Error[]>;

	constructor(
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@INotificationService protected readonly _notificationService: INotificationService,
		@IWorkbenchEnvironmentService protected readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IExtensionEnablementService protected readonly _extensionEnablementService: IExtensionEnablementService,
		@IExtensionManagementService protected readonly _extensionManagementService: IExtensionManagementService,
		@IWindowService protected readonly _windowService: IWindowService,
		@IRemoteAgentService protected readonly _remoteAgentService: IRemoteAgentService,
		@IRemoteAuthorityResolverService protected readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@ILifecycleService protected readonly _lifecycleService: ILifecycleService,
		@IFileService protected readonly _fileService: IFileService,
		@IProductService protected readonly _productService: IProductService
	) {
		super();

		// help the file service to activate providers by activating extensions by file system event
		this._register(this._fileService.onWillActivateFileSystemProvider(e => {
			e.join(this.activateByEvent(`onFileSystem:${e.scheme}`));
		}));

		if (this._extensionEnablementService.allUserExtensionsDisabled) {
			this._notificationService.prompt(Severity.Info, nls.localize('extensionsDisabled', "All installed extensions are temporarily disabled. Reload the window to return to the previous state."), [{
				label: nls.localize('Reload', "Reload"),
				run: () => {
					this._windowService.reloadWindow();
				}
			}]);
		}

		this._registry = new ExtensionDescriptionRegistry([]);
		this._installedExtensionsReady = new Barrier();
		this._isDev = !this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment;
		this._extensionsMessages = new Map<string, IMessage[]>();
		this._allRequestedActivateEvents = Object.create(null);
		this._proposedApiController = new ProposedApiController(this._environmentService, this._productService);

		this._extensionHostProcessManagers = [];
		this._extensionHostActiveExtensions = new Map<string, ExtensionIdentifier>();
		this._extensionHostProcessActivationTimes = new Map<string, ActivationTimes>();
		this._extensionHostExtensionRuntimeErrors = new Map<string, Error[]>();

		const devOpts = parseExtensionDevOptions(this._environmentService);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
		this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;
	}

	protected async _initialize(): Promise<void> {
		perf.mark('willLoadExtensions');
		this._startExtensionHostProcess(true, []);
		this.whenInstalledExtensionsRegistered().then(() => perf.mark('didLoadExtensions'));
		await this._scanAndHandleExtensions();
		this._releaseBarrier();
	}

	private _releaseBarrier(): void {
		perf.mark('extensionHostReady');
		this._installedExtensionsReady.open();
		this._onDidRegisterExtensions.fire(undefined);
		this._onDidChangeExtensionsStatus.fire(this._registry.getAllExtensionDescriptions().map(e => e.identifier));
	}

	private _stopExtensionHostProcess(): void {
		let previouslyActivatedExtensionIds: ExtensionIdentifier[] = [];
		this._extensionHostActiveExtensions.forEach((value) => {
			previouslyActivatedExtensionIds.push(value);
		});

		for (const manager of this._extensionHostProcessManagers) {
			manager.dispose();
		}
		this._extensionHostProcessManagers = [];
		this._extensionHostActiveExtensions = new Map<string, ExtensionIdentifier>();
		this._extensionHostProcessActivationTimes = new Map<string, ActivationTimes>();
		this._extensionHostExtensionRuntimeErrors = new Map<string, Error[]>();

		if (previouslyActivatedExtensionIds.length > 0) {
			this._onDidChangeExtensionsStatus.fire(previouslyActivatedExtensionIds);
		}
	}

	private _startExtensionHostProcess(isInitialStart: boolean, initialActivationEvents: string[]): void {
		this._stopExtensionHostProcess();

		const processManagers = this._createExtensionHosts(isInitialStart, initialActivationEvents);
		processManagers.forEach((processManager) => {
			processManager.onDidExit(([code, signal]) => this._onExtensionHostCrashOrExit(processManager, code, signal));
			processManager.onDidChangeResponsiveState((responsiveState) => { this._onDidChangeResponsiveChange.fire({ isResponsive: responsiveState === ResponsiveState.Responsive }); });
			this._extensionHostProcessManagers.push(processManager);
		});
	}

	private _onExtensionHostCrashOrExit(extensionHost: ExtensionHostProcessManager, code: number, signal: string | null): void {

		// Unexpected termination
		if (!this._isExtensionDevHost) {
			this._onExtensionHostCrashed(extensionHost, code, signal);
			return;
		}

		this._onExtensionHostExit(code);
	}

	private _onExtensionHostCrashed(extensionHost: ExtensionHostProcessManager, code: number, signal: string | null): void {
		console.error('Extension host terminated unexpectedly. Code: ', code, ' Signal: ', signal);
		this._stopExtensionHostProcess();

		if (extensionHost.isLocal) {
			if (code === 55) {
				this._notificationService.prompt(
					Severity.Error,
					nls.localize('extensionService.versionMismatchCrash', "Extension host cannot start: version mismatch."),
					[{
						label: nls.localize('relaunch', "Relaunch VS Code"),
						run: () => {
							this._instantiationService.invokeFunction((accessor) => {
								const windowsService = accessor.get(IWindowsService);
								windowsService.relaunch({});
							});
						}
					}]
				);
				return;
			}

			this._notificationService.prompt(Severity.Error, nls.localize('extensionService.crash', "Extension host terminated unexpectedly."),
				[{
					label: nls.localize('devTools', "Open Developer Tools"),
					run: () => this._windowService.openDevTools()
				},
				{
					label: nls.localize('restart', "Restart Extension Host"),
					run: () => this._startExtensionHostProcess(false, Object.keys(this._allRequestedActivateEvents))
				}]
			);
		}
	}

	//#region IExtensionService

	public canAddExtension(extension: IExtensionDescription): boolean {
		return false;
	}

	public canRemoveExtension(extension: IExtensionDescription): boolean {
		return false;
	}

	public restartExtensionHost(): void {
		this._stopExtensionHostProcess();
		this._startExtensionHostProcess(false, Object.keys(this._allRequestedActivateEvents));
	}

	public startExtensionHost(): void {
		this._startExtensionHostProcess(false, Object.keys(this._allRequestedActivateEvents));
	}

	public stopExtensionHost(): void {
		this._stopExtensionHostProcess();
	}

	public activateByEvent(activationEvent: string): Promise<void> {
		if (this._installedExtensionsReady.isOpen()) {
			// Extensions have been scanned and interpreted

			// Record the fact that this activationEvent was requested (in case of a restart)
			this._allRequestedActivateEvents[activationEvent] = true;

			if (!this._registry.containsActivationEvent(activationEvent)) {
				// There is no extension that is interested in this activation event
				return NO_OP_VOID_PROMISE;
			}

			return this._activateByEvent(activationEvent);
		} else {
			// Extensions have not been scanned yet.

			// Record the fact that this activationEvent was requested (in case of a restart)
			this._allRequestedActivateEvents[activationEvent] = true;

			return this._installedExtensionsReady.wait().then(() => this._activateByEvent(activationEvent));
		}
	}

	private _activateByEvent(activationEvent: string): Promise<void> {
		const result = Promise.all(
			this._extensionHostProcessManagers.map(extHostManager => extHostManager.activateByEvent(activationEvent))
		).then(() => { });
		this._onWillActivateByEvent.fire({
			event: activationEvent,
			activation: result
		});
		return result;
	}

	public whenInstalledExtensionsRegistered(): Promise<boolean> {
		return this._installedExtensionsReady.wait();
	}

	public getExtensions(): Promise<IExtensionDescription[]> {
		return this._installedExtensionsReady.wait().then(() => {
			return this._registry.getAllExtensionDescriptions();
		});
	}

	public getExtension(id: string): Promise<IExtensionDescription | undefined> {
		return this._installedExtensionsReady.wait().then(() => {
			return this._registry.getExtensionDescription(id);
		});
	}

	public readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): Promise<ExtensionPointContribution<T>[]> {
		return this._installedExtensionsReady.wait().then(() => {
			let availableExtensions = this._registry.getAllExtensionDescriptions();

			let result: ExtensionPointContribution<T>[] = [], resultLen = 0;
			for (let i = 0, len = availableExtensions.length; i < len; i++) {
				let desc = availableExtensions[i];

				if (desc.contributes && hasOwnProperty.call(desc.contributes, extPoint.name)) {
					result[resultLen++] = new ExtensionPointContribution<T>(desc, desc.contributes[extPoint.name]);
				}
			}

			return result;
		});
	}

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus; } {
		let result: { [id: string]: IExtensionsStatus; } = Object.create(null);
		if (this._registry) {
			const extensions = this._registry.getAllExtensionDescriptions();
			for (const extension of extensions) {
				const extensionKey = ExtensionIdentifier.toKey(extension.identifier);
				result[extension.identifier.value] = {
					messages: this._extensionsMessages.get(extensionKey) || [],
					activationTimes: this._extensionHostProcessActivationTimes.get(extensionKey),
					runtimeErrors: this._extensionHostExtensionRuntimeErrors.get(extensionKey) || [],
				};
			}
		}
		return result;
	}

	public getInspectPort(): number {
		return 0;
	}

	//#endregion

	// --- impl

	protected _checkEnableProposedApi(extensions: IExtensionDescription[]): void {
		for (let extension of extensions) {
			this._proposedApiController.updateEnableProposedApi(extension);
		}
	}

	private _isExtensionUnderDevelopment(extension: IExtensionDescription): boolean {
		if (this._environmentService.isExtensionDevelopment) {
			const extDevLocs = this._environmentService.extensionDevelopmentLocationURI;
			if (extDevLocs) {
				const extLocation = extension.extensionLocation;
				for (let p of extDevLocs) {
					if (isEqualOrParent(extLocation, p)) {
						return true;
					}
				}
			}
		}
		return false;
	}

	protected _isEnabled(extension: IExtensionDescription): boolean {
		if (this._isExtensionUnderDevelopment(extension)) {
			// Never disable extensions under development
			return true;
		}

		if (ExtensionIdentifier.equals(extension.identifier, BetterMergeId)) {
			// Check if this is the better merge extension which was migrated to a built-in extension
			return false;
		}

		return this._extensionEnablementService.isEnabled(toExtension(extension));
	}

	protected _doHandleExtensionPoints(affectedExtensions: IExtensionDescription[]): void {
		const affectedExtensionPoints: { [extPointName: string]: boolean; } = Object.create(null);
		for (let extensionDescription of affectedExtensions) {
			if (extensionDescription.contributes) {
				for (let extPointName in extensionDescription.contributes) {
					if (hasOwnProperty.call(extensionDescription.contributes, extPointName)) {
						affectedExtensionPoints[extPointName] = true;
					}
				}
			}
		}

		const messageHandler = (msg: IMessage) => this._handleExtensionPointMessage(msg);
		const availableExtensions = this._registry.getAllExtensionDescriptions();
		const extensionPoints = ExtensionsRegistry.getExtensionPoints();
		for (let i = 0, len = extensionPoints.length; i < len; i++) {
			if (affectedExtensionPoints[extensionPoints[i].name]) {
				CommonExtensionService._handleExtensionPoint(extensionPoints[i], availableExtensions, messageHandler);
			}
		}
	}

	private _handleExtensionPointMessage(msg: IMessage) {
		const extensionKey = ExtensionIdentifier.toKey(msg.extensionId);

		if (!this._extensionsMessages.has(extensionKey)) {
			this._extensionsMessages.set(extensionKey, []);
		}
		this._extensionsMessages.get(extensionKey)!.push(msg);

		const extension = this._registry.getExtensionDescription(msg.extensionId);
		const strMsg = `[${msg.extensionId.value}]: ${msg.message}`;
		if (extension && extension.isUnderDevelopment) {
			// This message is about the extension currently being developed
			this._showMessageToUser(msg.type, strMsg);
		} else {
			this._logMessageInConsole(msg.type, strMsg);
		}

		if (!this._isDev && msg.extensionId) {
			const { type, extensionId, extensionPointId, message } = msg;
			/* __GDPR__
				"extensionsMessage" : {
					"type" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
					"extensionId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
					"extensionPointId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
					"message": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
				}
			*/
			this._telemetryService.publicLog('extensionsMessage', {
				type, extensionId: extensionId.value, extensionPointId, message
			});
		}
	}

	private static _handleExtensionPoint<T>(extensionPoint: ExtensionPoint<T>, availableExtensions: IExtensionDescription[], messageHandler: (msg: IMessage) => void): void {
		let users: IExtensionPointUser<T>[] = [], usersLen = 0;
		for (let i = 0, len = availableExtensions.length; i < len; i++) {
			let desc = availableExtensions[i];

			if (desc.contributes && hasOwnProperty.call(desc.contributes, extensionPoint.name)) {
				users[usersLen++] = {
					description: desc,
					value: desc.contributes[extensionPoint.name],
					collector: new ExtensionMessageCollector(messageHandler, desc, extensionPoint.name)
				};
			}
		}

		extensionPoint.acceptUsers(users);
	}

	private _showMessageToUser(severity: Severity, msg: string): void {
		if (severity === Severity.Error || severity === Severity.Warning) {
			this._notificationService.notify({ severity, message: msg });
		} else {
			this._logMessageInConsole(severity, msg);
		}
	}

	private _logMessageInConsole(severity: Severity, msg: string): void {
		if (severity === Severity.Error) {
			console.error(msg);
		} else if (severity === Severity.Warning) {
			console.warn(msg);
		} else {
			console.log(msg);
		}
	}

	//#region Called by extension host

	public _logOrShowMessage(severity: Severity, msg: string): void {
		if (this._isDev) {
			this._showMessageToUser(severity, msg);
		} else {
			this._logMessageInConsole(severity, msg);
		}
	}

	public async _activateById(extensionId: ExtensionIdentifier, activationEvent: string): Promise<void> {
		const results = await Promise.all(
			this._extensionHostProcessManagers.map(manager => manager.activate(extensionId, activationEvent))
		);
		const activated = results.some(e => e);
		if (!activated) {
			throw new Error(`Unknown extension ${extensionId.value}`);
		}
	}

	public _onWillActivateExtension(extensionId: ExtensionIdentifier): void {
		this._extensionHostActiveExtensions.set(ExtensionIdentifier.toKey(extensionId), extensionId);
	}

	public _onDidActivateExtension(extensionId: ExtensionIdentifier, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationEvent: string): void {
		this._extensionHostProcessActivationTimes.set(ExtensionIdentifier.toKey(extensionId), new ActivationTimes(startup, codeLoadingTime, activateCallTime, activateResolvedTime, activationEvent));
		this._onDidChangeExtensionsStatus.fire([extensionId]);
	}

	public _onExtensionRuntimeError(extensionId: ExtensionIdentifier, err: Error): void {
		const extensionKey = ExtensionIdentifier.toKey(extensionId);
		if (!this._extensionHostExtensionRuntimeErrors.has(extensionKey)) {
			this._extensionHostExtensionRuntimeErrors.set(extensionKey, []);
		}
		this._extensionHostExtensionRuntimeErrors.get(extensionKey)!.push(err);
		this._onDidChangeExtensionsStatus.fire([extensionId]);
	}

	//#endregion

	protected abstract _createExtensionHosts(isInitialStart: boolean, initialActivationEvents: string[]): ExtensionHostProcessManager[];
	protected abstract _scanAndHandleExtensions(): Promise<void>;
	public abstract _onExtensionHostExit(code: number): void;
}

export abstract class AbstractExtensionService extends CommonExtensionService implements IExtensionService {

	private readonly _remoteExtensionsEnvironmentData: Map<string, IRemoteAgentEnvironment>;

	protected readonly _extensionHostLogsLocation: URI;
	private readonly _extensionScanner: IExtensionScanner;
	private _deltaExtensionsQueue: DeltaExtensionsQueueItem[];

	constructor(
		extensionScanner: IExtensionScanner,
		private readonly _webSocketFactory: IWebSocketFactory,
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

		this._remoteExtensionsEnvironmentData = new Map<string, IRemoteAgentEnvironment>();

		this._extensionHostLogsLocation = URI.file(path.join(this._environmentService.logsPath, `exthost${windowService.windowId}`));
		this._extensionScanner = extensionScanner;
		this._deltaExtensionsQueue = [];

		this._register(this._extensionEnablementService.onEnablementChanged((extensions) => {
			let toAdd: IExtension[] = [];
			let toRemove: string[] = [];
			for (const extension of extensions) {
				if (this._extensionEnablementService.isEnabled(extension)) {
					// an extension has been enabled
					toAdd.push(extension);
				} else {
					// an extension has been disabled
					toRemove.push(extension.identifier.id);
				}
			}
			this._handleDeltaExtensions(new DeltaExtensionsQueueItem(toAdd, toRemove));
		}));

		this._register(this._extensionManagementService.onDidInstallExtension((event) => {
			if (event.local) {
				if (this._extensionEnablementService.isEnabled(event.local)) {
					// an extension has been installed
					this._handleDeltaExtensions(new DeltaExtensionsQueueItem([event.local], []));
				}
			}
		}));

		this._register(this._extensionManagementService.onDidUninstallExtension((event) => {
			if (!event.error) {
				// an extension has been uninstalled
				this._handleDeltaExtensions(new DeltaExtensionsQueueItem([], [event.identifier.id]));
			}
		}));

		// delay extension host creation and extension scanning
		// until the workbench is running. we cannot defer the
		// extension host more (LifecyclePhase.Restored) because
		// some editors require the extension host to restore
		// and this would result in a deadlock
		// see https://github.com/Microsoft/vscode/issues/41322
		this._lifecycleService.when(LifecyclePhase.Ready).then(() => {
			// reschedule to ensure this runs after restoring viewlets, panels, and editors
			runWhenIdle(async () => {
				this._initialize();
			}, 50 /*max delay*/);
		});
	}

	//#region deltaExtensions

	private _inHandleDeltaExtensions = false;
	private async _handleDeltaExtensions(item: DeltaExtensionsQueueItem): Promise<void> {
		this._deltaExtensionsQueue.push(item);
		if (this._inHandleDeltaExtensions) {
			// Let the current item finish, the new one will be picked up
			return;
		}

		while (this._deltaExtensionsQueue.length > 0) {
			const item = this._deltaExtensionsQueue.shift()!;
			try {
				this._inHandleDeltaExtensions = true;
				await this._deltaExtensions(item.toAdd, item.toRemove);
			} finally {
				this._inHandleDeltaExtensions = false;
			}
		}
	}

	private async _deltaExtensions(_toAdd: IExtension[], _toRemove: string[]): Promise<void> {
		if (this._environmentService.configuration.remoteAuthority) {
			return;
		}

		let toAdd: IExtensionDescription[] = [];
		for (let i = 0, len = _toAdd.length; i < len; i++) {
			const extension = _toAdd[i];

			if (extension.location.scheme !== Schemas.file) {
				continue;
			}

			const existingExtensionDescription = this._registry.getExtensionDescription(extension.identifier.id);
			if (existingExtensionDescription) {
				// this extension is already running (most likely at a different version)
				continue;
			}

			const extensionDescription = await this._extensionScanner.scanSingleExtension(extension.location.fsPath, extension.type === ExtensionType.System, this.createLogger());
			if (!extensionDescription) {
				// could not scan extension...
				continue;
			}

			toAdd.push(extensionDescription);
		}

		let toRemove: IExtensionDescription[] = [];
		for (let i = 0, len = _toRemove.length; i < len; i++) {
			const extensionId = _toRemove[i];
			const extensionDescription = this._registry.getExtensionDescription(extensionId);
			if (!extensionDescription) {
				// ignore disabling/uninstalling an extension which is not running
				continue;
			}

			if (!this._canRemoveExtension(extensionDescription)) {
				// uses non-dynamic extension point or is activated
				continue;
			}

			toRemove.push(extensionDescription);
		}

		if (toAdd.length === 0 && toRemove.length === 0) {
			return;
		}

		// Update the local registry
		const result = this._registry.deltaExtensions(toAdd, toRemove.map(e => e.identifier));
		toRemove = toRemove.concat(result.removedDueToLooping);
		if (result.removedDueToLooping.length > 0) {
			this._logOrShowMessage(Severity.Error, nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', ')));
		}

		// Update extension points
		this._rehandleExtensionPoints((<IExtensionDescription[]>[]).concat(toAdd).concat(toRemove));

		// Update the extension host
		if (this._extensionHostProcessManagers.length > 0) {
			await this._extensionHostProcessManagers[0].deltaExtensions(toAdd, toRemove.map(e => e.identifier));
		}

		this._onDidChangeExtensions.fire(undefined);

		for (let i = 0; i < toAdd.length; i++) {
			this._activateAddedExtensionIfNeeded(toAdd[i]);
		}
	}

	private _rehandleExtensionPoints(extensionDescriptions: IExtensionDescription[]): void {
		this._doHandleExtensionPoints(extensionDescriptions);
	}

	public canAddExtension(extension: IExtensionDescription): boolean {
		if (this._environmentService.configuration.remoteAuthority) {
			return false;
		}

		if (extension.extensionLocation.scheme !== Schemas.file) {
			return false;
		}

		const extensionDescription = this._registry.getExtensionDescription(extension.identifier);
		if (extensionDescription) {
			// ignore adding an extension which is already running and cannot be removed
			if (!this._canRemoveExtension(extensionDescription)) {
				return false;
			}
		}

		return true;
	}

	public canRemoveExtension(extension: IExtensionDescription): boolean {
		if (this._environmentService.configuration.remoteAuthority) {
			return false;
		}

		if (extension.extensionLocation.scheme !== Schemas.file) {
			return false;
		}

		const extensionDescription = this._registry.getExtensionDescription(extension.identifier);
		if (!extensionDescription) {
			// ignore removing an extension which is not running
			return false;
		}

		return this._canRemoveExtension(extensionDescription);
	}

	private _canRemoveExtension(extension: IExtensionDescription): boolean {
		if (this._extensionHostActiveExtensions.has(ExtensionIdentifier.toKey(extension.identifier))) {
			// Extension is running, cannot remove it safely
			return false;
		}

		return true;
	}

	private async _activateAddedExtensionIfNeeded(extensionDescription: IExtensionDescription): Promise<void> {

		let shouldActivate = false;
		let shouldActivateReason: string | null = null;
		if (Array.isArray(extensionDescription.activationEvents)) {
			for (let activationEvent of extensionDescription.activationEvents) {
				// TODO@joao: there's no easy way to contribute this
				if (activationEvent === 'onUri') {
					activationEvent = `onUri:${ExtensionIdentifier.toKey(extensionDescription.identifier)}`;
				}

				if (this._allRequestedActivateEvents[activationEvent]) {
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
					// do not trigger a search, just activate in this case...
					shouldActivate = true;
					shouldActivateReason = activationEvent;
					break;
				}
			}
		}

		if (shouldActivate) {
			await Promise.all(
				this._extensionHostProcessManagers.map(extHostManager => extHostManager.activate(extensionDescription.identifier, shouldActivateReason!))
			).then(() => { });
		}
	}

	//#endregion

	private _createProvider(remoteAuthority: string): IInitDataProvider {
		return {
			remoteAuthority: remoteAuthority,
			getInitData: () => {
				return this.whenInstalledExtensionsRegistered().then(() => {
					return this._remoteExtensionsEnvironmentData.get(remoteAuthority)!;
				});
			}
		};
	}

	protected _createExtensionHosts(isInitialStart: boolean, initialActivationEvents: string[]): ExtensionHostProcessManager[] {
		let autoStart: boolean;
		let extensions: Promise<IExtensionDescription[]>;
		if (isInitialStart) {
			autoStart = false;
			extensions = this._extensionScanner.scannedExtensions;
		} else {
			// restart case
			autoStart = true;
			extensions = this.getExtensions().then((extensions) => extensions.filter(ext => ext.extensionLocation.scheme === Schemas.file));
		}

		const result: ExtensionHostProcessManager[] = [];
		const extHostProcessWorker = this._createLocalExtHostProcessWorker(autoStart, extensions);
		const extHostProcessManager = this._instantiationService.createInstance(ExtensionHostProcessManager, true, extHostProcessWorker, null, initialActivationEvents);
		result.push(extHostProcessManager);

		const remoteAgentConnection = this._remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			const remoteExtHostProcessWorker = this._instantiationService.createInstance(RemoteExtensionHostClient, this.getExtensions(), this._createProvider(remoteAgentConnection.remoteAuthority), this._webSocketFactory);
			const remoteExtHostProcessManager = this._instantiationService.createInstance(ExtensionHostProcessManager, false, remoteExtHostProcessWorker, remoteAgentConnection.remoteAuthority, initialActivationEvents);
			result.push(remoteExtHostProcessManager);
		}

		return result;
	}

	// --- impl

	private createLogger(): Logger {
		return new Logger((severity, source, message) => {
			if (this._isDev && source) {
				this._logOrShowMessage(severity, `[${source}]: ${message}`);
			} else {
				this._logOrShowMessage(severity, message);
			}
		});
	}

	private async _resolveAuthorityAgain(): Promise<void> {
		const remoteAuthority = this._environmentService.configuration.remoteAuthority;
		if (!remoteAuthority) {
			return;
		}

		const extensionHost = this._extensionHostProcessManagers[0];
		this._remoteAuthorityResolverService.clearResolvedAuthority(remoteAuthority);
		try {
			const resolvedAuthority = await extensionHost.resolveAuthority(remoteAuthority);
			this._remoteAuthorityResolverService.setResolvedAuthority(resolvedAuthority);
		} catch (err) {
			this._remoteAuthorityResolverService.setResolvedAuthorityError(remoteAuthority, err);
		}
	}

	protected async _scanAndHandleExtensions(): Promise<void> {
		this._extensionScanner.startScanningExtensions(this.createLogger());

		const remoteAuthority = this._environmentService.configuration.remoteAuthority;
		const extensionHost = this._extensionHostProcessManagers[0];

		let localExtensions = await this._extensionScanner.scannedExtensions;

		// enable or disable proposed API per extension
		this._checkEnableProposedApi(localExtensions);

		// remove disabled extensions
		localExtensions = localExtensions.filter(extension => this._isEnabled(extension));

		if (remoteAuthority) {
			let resolvedAuthority: ResolvedAuthority;

			try {
				resolvedAuthority = await extensionHost.resolveAuthority(remoteAuthority);
			} catch (err) {
				console.error(err);
				const plusIndex = remoteAuthority.indexOf('+');
				const authorityFriendlyName = plusIndex > 0 ? remoteAuthority.substr(0, plusIndex) : remoteAuthority;
				if (!RemoteAuthorityResolverError.isHandledNotAvailable(err)) {
					this._notificationService.notify({ severity: Severity.Error, message: nls.localize('resolveAuthorityFailure', "Resolving the authority `{0}` failed", authorityFriendlyName) });
				} else {
					console.log(`Not showing a notification for the error`);
				}

				this._remoteAuthorityResolverService.setResolvedAuthorityError(remoteAuthority, err);

				// Proceed with the local extension host
				await this._startLocalExtensionHost(extensionHost, localExtensions);
				return;
			}

			// set the resolved authority
			this._remoteAuthorityResolverService.setResolvedAuthority(resolvedAuthority);

			// monitor for breakage
			const connection = this._remoteAgentService.getConnection();
			if (connection) {
				connection.onDidStateChange(async (e) => {
					const remoteAuthority = this._environmentService.configuration.remoteAuthority;
					if (!remoteAuthority) {
						return;
					}
					if (e.type === PersistenConnectionEventType.ConnectionLost) {
						this._remoteAuthorityResolverService.clearResolvedAuthority(remoteAuthority);
					}
				});
				connection.onReconnecting(() => this._resolveAuthorityAgain());
			}

			// fetch the remote environment
			const remoteEnv = (await this._remoteAgentService.getEnvironment())!;

			// enable or disable proposed API per extension
			this._checkEnableProposedApi(remoteEnv.extensions);

			// remove disabled extensions
			remoteEnv.extensions = remoteEnv.extensions.filter(extension => this._isEnabled(extension));

			// remove UI extensions from the remote extensions
			remoteEnv.extensions = remoteEnv.extensions.filter(extension => !isUIExtension(extension, this._productService, this._configurationService));

			// remove non-UI extensions from the local extensions
			localExtensions = localExtensions.filter(extension => extension.isBuiltin || isUIExtension(extension, this._productService, this._configurationService));

			// in case of overlap, the remote wins
			const isRemoteExtension = new Set<string>();
			remoteEnv.extensions.forEach(extension => isRemoteExtension.add(ExtensionIdentifier.toKey(extension.identifier)));
			localExtensions = localExtensions.filter(extension => !isRemoteExtension.has(ExtensionIdentifier.toKey(extension.identifier)));

			// save for remote extension's init data
			this._remoteExtensionsEnvironmentData.set(remoteAuthority, remoteEnv);

			this._handleExtensionPoints((<IExtensionDescription[]>[]).concat(remoteEnv.extensions).concat(localExtensions));
			extensionHost.start(localExtensions.map(extension => extension.identifier));

		} else {
			await this._startLocalExtensionHost(extensionHost, localExtensions);
		}
	}

	private async _startLocalExtensionHost(extensionHost: ExtensionHostProcessManager, localExtensions: IExtensionDescription[]): Promise<void> {
		this._handleExtensionPoints(localExtensions);
		extensionHost.start(localExtensions.map(extension => extension.identifier).filter(id => this._registry.containsExtension(id)));
	}

	private _handleExtensionPoints(allExtensions: IExtensionDescription[]): void {
		const result = this._registry.deltaExtensions(allExtensions, []);
		if (result.removedDueToLooping.length > 0) {
			this._logOrShowMessage(Severity.Error, nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', ')));
		}

		this._doHandleExtensionPoints(this._registry.getAllExtensionDescriptions());
	}

	public getInspectPort(): number {
		if (this._extensionHostProcessManagers.length > 0) {
			return this._extensionHostProcessManagers[0].getInspectPort();
		}
		return 0;
	}

	public abstract _onExtensionHostExit(code: number): void;
	protected abstract _createLocalExtHostProcessWorker(autoStart: boolean, extensions: Promise<IExtensionDescription[]>): IExtensionHostStarter;
}

class ProposedApiController {

	private readonly enableProposedApiFor: string | string[];
	private readonly enableProposedApiForAll: boolean;
	private readonly productAllowProposedApi: Set<string>;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService
	) {
		this.enableProposedApiFor = environmentService.args['enable-proposed-api'] || [];
		if (this.enableProposedApiFor.length) {
			// Make enabled proposed API be lowercase for case insensitive comparison
			if (Array.isArray(this.enableProposedApiFor)) {
				this.enableProposedApiFor = this.enableProposedApiFor.map(id => id.toLowerCase());
			} else {
				this.enableProposedApiFor = this.enableProposedApiFor.toLowerCase();
			}
		}

		this.enableProposedApiForAll = !environmentService.isBuilt ||
			(!!environmentService.extensionDevelopmentLocationURI && productService.nameLong !== 'Visual Studio Code') ||
			(this.enableProposedApiFor.length === 0 && 'enable-proposed-api' in environmentService.args);

		this.productAllowProposedApi = new Set<string>();
		if (isNonEmptyArray(productService.extensionAllowedProposedApi)) {
			productService.extensionAllowedProposedApi.forEach((id) => this.productAllowProposedApi.add(ExtensionIdentifier.toKey(id)));
		}
	}

	public updateEnableProposedApi(extension: IExtensionDescription): void {
		if (this._allowProposedApiFromProduct(extension.identifier)) {
			// fast lane -> proposed api is available to all extensions
			// that are listed in product.json-files
			extension.enableProposedApi = true;

		} else if (extension.enableProposedApi && !extension.isBuiltin) {
			if (
				!this.enableProposedApiForAll &&
				this.enableProposedApiFor.indexOf(extension.identifier.value.toLowerCase()) < 0
			) {
				extension.enableProposedApi = false;
				console.error(`Extension '${extension.identifier.value} cannot use PROPOSED API (must started out of dev or enabled via --enable-proposed-api)`);

			} else {
				// proposed api is available when developing or when an extension was explicitly
				// spelled out via a command line argument
				console.warn(`Extension '${extension.identifier.value}' uses PROPOSED API which is subject to change and removal without notice.`);
			}
		}
	}

	private _allowProposedApiFromProduct(id: ExtensionIdentifier): boolean {
		return this.productAllowProposedApi.has(ExtensionIdentifier.toKey(id));
	}
}
