/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import { ipcRenderer as ipc } from 'electron';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Barrier, runWhenIdle } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as perf from 'vs/base/common/performance';
import { isEqualOrParent } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { EnablementState, IExtensionEnablementService, IExtensionIdentifier, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { BetterMergeId, areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import pkg from 'vs/platform/product/node/package';
import product from 'vs/platform/product/node/product';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { ActivationTimes, ExtensionPointContribution, IExtensionService, IExtensionsStatus, IMessage, IWillActivateEvent, IResponsiveStateChangeEvent, toExtension } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionMessageCollector, ExtensionPoint, ExtensionsRegistry, IExtensionPoint, IExtensionPointUser, schema } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ExtensionHostProcessWorker } from 'vs/workbench/services/extensions/electron-browser/extensionHost';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { ResponsiveState } from 'vs/workbench/services/extensions/common/rpcProtocol';
import { CachedExtensionScanner, Logger } from 'vs/workbench/services/extensions/electron-browser/cachedExtensionScanner';
import { ExtensionHostProcessManager } from 'vs/workbench/services/extensions/common/extensionHostProcessManager';
import { ExtensionIdentifier, IExtension, ExtensionType, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { Schemas } from 'vs/base/common/network';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';

const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = Promise.resolve<void>(undefined);

schema.properties.engines.properties.vscode.default = `^${pkg.version}`;

let productAllowProposedApi: Set<string> | null = null;
function allowProposedApiFromProduct(id: ExtensionIdentifier): boolean {
	// create set if needed
	if (!productAllowProposedApi) {
		productAllowProposedApi = new Set<string>();
		if (isNonEmptyArray(product.extensionAllowedProposedApi)) {
			product.extensionAllowedProposedApi.forEach((id) => productAllowProposedApi!.add(ExtensionIdentifier.toKey(id)));
		}
	}
	return productAllowProposedApi.has(ExtensionIdentifier.toKey(id));
}

class DeltaExtensionsQueueItem {
	constructor(
		public readonly toAdd: IExtension[],
		public readonly toRemove: string[]
	) { }
}

export class ExtensionService extends Disposable implements IExtensionService {

	public _serviceBrand: any;

	private readonly _extensionHostLogsLocation: URI;
	private readonly _registry: ExtensionDescriptionRegistry;
	private readonly _installedExtensionsReady: Barrier;
	private readonly _isDev: boolean;
	private readonly _extensionsMessages: Map<string, IMessage[]>;
	private _allRequestedActivateEvents: { [activationEvent: string]: boolean; };
	private readonly _extensionScanner: CachedExtensionScanner;
	private _deltaExtensionsQueue: DeltaExtensionsQueueItem[];

	private readonly _onDidRegisterExtensions: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidRegisterExtensions = this._onDidRegisterExtensions.event;

	private readonly _onDidChangeExtensionsStatus: Emitter<ExtensionIdentifier[]> = this._register(new Emitter<ExtensionIdentifier[]>());
	public readonly onDidChangeExtensionsStatus: Event<ExtensionIdentifier[]> = this._onDidChangeExtensionsStatus.event;

	private readonly _onDidChangeExtensions: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeExtensions: Event<void> = this._onDidChangeExtensions.event;

	private readonly _onWillActivateByEvent = this._register(new Emitter<IWillActivateEvent>());
	public readonly onWillActivateByEvent: Event<IWillActivateEvent> = this._onWillActivateByEvent.event;

	private readonly _onDidChangeResponsiveChange = this._register(new Emitter<IResponsiveStateChangeEvent>());
	public readonly onDidChangeResponsiveChange: Event<IResponsiveStateChangeEvent> = this._onDidChangeResponsiveChange.event;

	// --- Members used per extension host process
	private _extensionHostProcessManagers: ExtensionHostProcessManager[];
	private _extensionHostActiveExtensions: Map<string, ExtensionIdentifier>;
	private _extensionHostProcessActivationTimes: Map<string, ActivationTimes>;
	private _extensionHostExtensionRuntimeErrors: Map<string, Error[]>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExtensionEnablementService private readonly _extensionEnablementService: IExtensionEnablementService,
		@IExtensionManagementService private readonly _extensionManagementService: IExtensionManagementService,
		@IWindowService private readonly _windowService: IWindowService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IFileService fileService: IFileService
	) {
		super();

		// help the file service to activate providers by activating extensions by file system event
		this._register(fileService.onWillActivateFileSystemProvider(e => {
			e.join(this.activateByEvent(`onFileSystem:${e.scheme}`));
		}));

		this._extensionHostLogsLocation = URI.file(path.join(this._environmentService.logsPath, `exthost${this._windowService.windowId}`));
		this._registry = new ExtensionDescriptionRegistry([]);
		this._installedExtensionsReady = new Barrier();
		this._isDev = !this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment;
		this._extensionsMessages = new Map<string, IMessage[]>();
		this._allRequestedActivateEvents = Object.create(null);
		this._extensionScanner = this._instantiationService.createInstance(CachedExtensionScanner);
		this._deltaExtensionsQueue = [];

		this._extensionHostProcessManagers = [];
		this._extensionHostActiveExtensions = new Map<string, ExtensionIdentifier>();
		this._extensionHostProcessActivationTimes = new Map<string, ActivationTimes>();
		this._extensionHostExtensionRuntimeErrors = new Map<string, Error[]>();

		this._startDelayed(this._lifecycleService);

		if (this._extensionEnablementService.allUserExtensionsDisabled) {
			this._notificationService.prompt(Severity.Info, nls.localize('extensionsDisabled', "All installed extensions are temporarily disabled. Reload the window to return to the previous state."), [{
				label: nls.localize('Reload', "Reload"),
				run: () => {
					this._windowService.reloadWindow();
				}
			}]);
		}

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
	}

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
		const affectedExtensionPoints: { [extPointName: string]: boolean; } = Object.create(null);
		for (let extensionDescription of extensionDescriptions) {
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
				ExtensionService._handleExtensionPoint(extensionPoints[i], availableExtensions, messageHandler);
			}
		}
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

	private _startDelayed(lifecycleService: ILifecycleService): void {
		// delay extension host creation and extension scanning
		// until the workbench is running. we cannot defer the
		// extension host more (LifecyclePhase.Restored) because
		// some editors require the extension host to restore
		// and this would result in a deadlock
		// see https://github.com/Microsoft/vscode/issues/41322
		lifecycleService.when(LifecyclePhase.Ready).then(() => {
			// reschedule to ensure this runs after restoring viewlets, panels, and editors
			runWhenIdle(() => {
				perf.mark('willLoadExtensions');
				this._startExtensionHostProcess(true, []);
				this._scanAndHandleExtensions();
				this.whenInstalledExtensionsRegistered().then(() => perf.mark('didLoadExtensions'));
			}, 50 /*max delay*/);
		});
	}

	public dispose(): void {
		super.dispose();
		this._onWillActivateByEvent.dispose();
		this._onDidChangeResponsiveChange.dispose();
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

		let autoStart: boolean;
		let extensions: Promise<IExtensionDescription[]>;
		if (isInitialStart) {
			autoStart = false;
			extensions = this._extensionScanner.scannedExtensions;
		} else {
			// restart case
			autoStart = true;
			extensions = this.getExtensions();
		}

		const extHostProcessWorker = this._instantiationService.createInstance(ExtensionHostProcessWorker, autoStart, extensions, this._extensionHostLogsLocation);
		const extHostProcessManager = this._instantiationService.createInstance(ExtensionHostProcessManager, extHostProcessWorker, null, initialActivationEvents);
		extHostProcessManager.onDidCrash(([code, signal]) => this._onExtensionHostCrashed(code, signal));
		extHostProcessManager.onDidChangeResponsiveState((responsiveState) => { this._onDidChangeResponsiveChange.fire({ isResponsive: responsiveState === ResponsiveState.Responsive }); });
		this._extensionHostProcessManagers.push(extHostProcessManager);
	}

	private _onExtensionHostCrashed(code: number, signal: string | null): void {
		console.error('Extension host terminated unexpectedly. Code: ', code, ' Signal: ', signal);
		this._stopExtensionHostProcess();

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

		let message = nls.localize('extensionService.crash', "Extension host terminated unexpectedly.");
		if (code === 87) {
			message = nls.localize('extensionService.unresponsiveCrash', "Extension host terminated because it was not responsive.");
		}

		this._notificationService.prompt(Severity.Error, message,
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

	// ---- begin IExtensionService

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
		if (this._extensionHostProcessManagers.length > 0) {
			return this._extensionHostProcessManagers[0].getInspectPort();
		}
		return 0;
	}

	// ---- end IExtensionService

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

	private async _scanAndHandleExtensions(): Promise<void> {
		this._extensionScanner.startScanningExtensions(this.createLogger());

		const extensionHost = this._extensionHostProcessManagers[0];
		const extensions = await this._extensionScanner.scannedExtensions;
		const enabledExtensions = await this._getRuntimeExtensions(extensions);

		this._handleExtensionPoints(enabledExtensions);
		extensionHost.start(enabledExtensions.map(extension => extension.identifier).filter(id => this._registry.containsExtension(id)));
		this._releaseBarrier();
	}

	private _handleExtensionPoints(allExtensions: IExtensionDescription[]): void {
		const result = this._registry.deltaExtensions(allExtensions, []);
		if (result.removedDueToLooping.length > 0) {
			this._logOrShowMessage(Severity.Error, nls.localize('looping', "The following extensions contain dependency loops and have been disabled: {0}", result.removedDueToLooping.map(e => `'${e.identifier.value}'`).join(', ')));
		}

		let availableExtensions = this._registry.getAllExtensionDescriptions();
		let extensionPoints = ExtensionsRegistry.getExtensionPoints();

		let messageHandler = (msg: IMessage) => this._handleExtensionPointMessage(msg);

		for (let i = 0, len = extensionPoints.length; i < len; i++) {
			ExtensionService._handleExtensionPoint(extensionPoints[i], availableExtensions, messageHandler);
		}
	}

	private _releaseBarrier(): void {
		perf.mark('extensionHostReady');
		this._installedExtensionsReady.open();
		this._onDidRegisterExtensions.fire(undefined);
		this._onDidChangeExtensionsStatus.fire(this._registry.getAllExtensionDescriptions().map(e => e.identifier));
	}

	private isExtensionUnderDevelopment(extension: IExtensionDescription): boolean {
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

	private async _getRuntimeExtensions(allExtensions: IExtensionDescription[]): Promise<IExtensionDescription[]> {

		const runtimeExtensions: IExtensionDescription[] = [];
		const extensionsToDisable: IExtensionDescription[] = [];
		const userMigratedSystemExtensions: IExtensionIdentifier[] = [{ id: BetterMergeId }];

		let enableProposedApiFor: string | string[] = this._environmentService.args['enable-proposed-api'] || [];

		const notFound = (id: string) => nls.localize('notFound', "Extension \`{0}\` cannot use PROPOSED API as it cannot be found", id);

		if (enableProposedApiFor.length) {
			let allProposed = (enableProposedApiFor instanceof Array ? enableProposedApiFor : [enableProposedApiFor]);
			allProposed.forEach(id => {
				if (!allExtensions.some(description => ExtensionIdentifier.equals(description.identifier, id))) {
					console.error(notFound(id));
				}
			});
			// Make enabled proposed API be lowercase for case insensitive comparison
			if (Array.isArray(enableProposedApiFor)) {
				enableProposedApiFor = enableProposedApiFor.map(id => id.toLowerCase());
			} else {
				enableProposedApiFor = enableProposedApiFor.toLowerCase();
			}
		}

		const enableProposedApiForAll = !this._environmentService.isBuilt ||
			(!!this._environmentService.extensionDevelopmentLocationURI && product.nameLong !== 'Visual Studio Code') ||
			(enableProposedApiFor.length === 0 && 'enable-proposed-api' in this._environmentService.args);


		for (const extension of allExtensions) {

			// Do not disable extensions under development
			if (!this.isExtensionUnderDevelopment(extension)) {
				if (!this._extensionEnablementService.isEnabled(toExtension(extension))) {
					continue;
				}
			}

			if (!extension.isBuiltin) {
				// Check if the extension is changed to system extension
				const userMigratedSystemExtension = userMigratedSystemExtensions.filter(userMigratedSystemExtension => areSameExtensions(userMigratedSystemExtension, { id: extension.identifier.value }))[0];
				if (userMigratedSystemExtension) {
					extensionsToDisable.push(extension);
					continue;
				}
			}
			runtimeExtensions.push(this._updateEnableProposedApi(extension, enableProposedApiForAll, enableProposedApiFor));
		}

		this._telemetryService.publicLog('extensionsScanned', {
			totalCount: runtimeExtensions.length,
			disabledCount: allExtensions.length - runtimeExtensions.length
		});

		if (extensionsToDisable.length) {
			return this._extensionEnablementService.setEnablement(extensionsToDisable.map(e => toExtension(e)), EnablementState.Disabled)
				.then(() => runtimeExtensions);
		} else {
			return runtimeExtensions;
		}
	}

	private _updateEnableProposedApi(extension: IExtensionDescription, enableProposedApiForAll: boolean, enableProposedApiFor: string | string[]): IExtensionDescription {
		if (allowProposedApiFromProduct(extension.identifier)) {
			// fast lane -> proposed api is available to all extensions
			// that are listed in product.json-files
			extension.enableProposedApi = true;

		} else if (extension.enableProposedApi && !extension.isBuiltin) {
			if (
				!enableProposedApiForAll &&
				enableProposedApiFor.indexOf(extension.identifier.value.toLowerCase()) < 0
			) {
				extension.enableProposedApi = false;
				console.error(`Extension '${extension.identifier.value} cannot use PROPOSED API (must started out of dev or enabled via --enable-proposed-api)`);

			} else {
				// proposed api is available when developing or when an extension was explicitly
				// spelled out via a command line argument
				console.warn(`Extension '${extension.identifier.value}' uses PROPOSED API which is subject to change and removal without notice.`);
			}
		}
		return extension;
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

	// -- called by extension host

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

	public _onExtensionHostExit(code: number): void {
		// Expected development extension termination: When the extension host goes down we also shutdown the window
		const devOpts = parseExtensionDevOptions(this._environmentService);
		if (!devOpts.isExtensionDevTestFromCli) {
			this._windowService.closeWindow();
		}

		// When CLI testing make sure to exit with proper exit code
		else {
			ipc.send('vscode:exit', code);
		}
	}
}

registerSingleton(IExtensionService, ExtensionService);
