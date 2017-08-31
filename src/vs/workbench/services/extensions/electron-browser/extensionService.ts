/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as errors from 'vs/base/common/errors';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import pkg from 'vs/platform/node/package';
import * as path from 'path';
import URI from 'vs/base/common/uri';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/node/extensionDescriptionRegistry';
import { IMessage, IExtensionDescription, IExtensionsStatus, IExtensionService, ExtensionPointContribution, ActivationTimes } from 'vs/platform/extensions/common/extensions';
import { IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, getGloballyDisabledExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionsRegistry, ExtensionPoint, IExtensionPointUser, ExtensionMessageCollector, IExtensionPoint } from 'vs/platform/extensions/common/extensionsRegistry';
import { ExtensionScanner, ILog } from 'vs/workbench/services/extensions/electron-browser/extensionPoints';
import { IMessageService } from 'vs/platform/message/common/message';
import { ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, ExtHostExtensionServiceShape, IExtHostContext, MainContext } from 'vs/workbench/api/node/extHost.protocol';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ExtensionHostProcessWorker } from 'vs/workbench/services/extensions/electron-browser/extensionHost';
import { MainThreadService } from 'vs/workbench/services/thread/electron-browser/threadService';
import { Barrier } from 'vs/workbench/services/extensions/node/barrier';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { ExtHostCustomersRegistry } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { Action } from 'vs/base/common/actions';
import { IDisposable } from 'vs/base/common/lifecycle';

const SystemExtensionsRoot = path.normalize(path.join(URI.parse(require.toUrl('')).fsPath, '..', 'extensions'));

function messageWithSource(msg: IMessage): string {
	return messageWithSource2(msg.source, msg.message);
}

function messageWithSource2(source: string, message: string): string {
	if (source) {
		return `[${source}]: ${message}`;
	}
	return message;
}

const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = TPromise.as<void>(void 0);

export class ExtensionService implements IExtensionService {
	public _serviceBrand: any;

	private _registry: ExtensionDescriptionRegistry;
	private readonly _barrier: Barrier;
	private readonly _isDev: boolean;
	private readonly _extensionsStatus: { [id: string]: IExtensionsStatus };
	private _allRequestedActivateEvents: { [activationEvent: string]: boolean; };


	// --- Members used per extension host process

	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private _extensionHostProcessFinishedActivateEvents: { [activationEvent: string]: boolean; };
	private _extensionHostProcessActivationTimes: { [id: string]: ActivationTimes; };
	private _extensionHostProcessWorker: ExtensionHostProcessWorker;
	private _extensionHostProcessThreadService: MainThreadService;
	private _extensionHostProcessCustomers: IDisposable[];
	/**
	 * winjs believes a proxy is a promise because it has a `then` method, so wrap the result in an object.
	 */
	private _extensionHostProcessProxy: TPromise<{ value: ExtHostExtensionServiceShape; }>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMessageService private readonly _messageService: IMessageService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExtensionEnablementService private readonly _extensionEnablementService: IExtensionEnablementService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWindowService private readonly _windowService: IWindowService
	) {
		this._registry = null;
		this._barrier = new Barrier();
		this._isDev = !this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment;
		this._extensionsStatus = {};
		this._allRequestedActivateEvents = Object.create(null);

		this._extensionHostProcessFinishedActivateEvents = Object.create(null);
		this._extensionHostProcessActivationTimes = Object.create(null);
		this._extensionHostProcessWorker = null;
		this._extensionHostProcessThreadService = null;
		this._extensionHostProcessCustomers = [];
		this._extensionHostProcessProxy = null;

		this._startExtensionHostProcess([]);
		this._scanAndHandleExtensions();
	}

	public restartExtensionHost(): void {
		this._stopExtensionHostProcess();
		this._startExtensionHostProcess(Object.keys(this._allRequestedActivateEvents));
	}

	private _stopExtensionHostProcess(): void {
		this._extensionHostProcessFinishedActivateEvents = Object.create(null);
		this._extensionHostProcessActivationTimes = Object.create(null);
		if (this._extensionHostProcessWorker) {
			this._extensionHostProcessWorker.dispose();
			this._extensionHostProcessWorker = null;
		}
		if (this._extensionHostProcessThreadService) {
			this._extensionHostProcessThreadService.dispose();
			this._extensionHostProcessThreadService = null;
		}
		for (let i = 0, len = this._extensionHostProcessCustomers.length; i < len; i++) {
			const customer = this._extensionHostProcessCustomers[i];
			try {
				customer.dispose();
			} catch (err) {
				errors.onUnexpectedError(err);
			}
		}
		this._extensionHostProcessCustomers = [];
		this._extensionHostProcessProxy = null;
	}

	private _startExtensionHostProcess(initialActivationEvents: string[]): void {
		this._stopExtensionHostProcess();

		this._extensionHostProcessWorker = this._instantiationService.createInstance(ExtensionHostProcessWorker, this);
		this._extensionHostProcessWorker.onCrashed(([code, signal]) => this._onExtensionHostCrashed(code, signal));
		this._extensionHostProcessProxy = this._extensionHostProcessWorker.start().then(
			(protocol) => {
				return { value: this._createExtensionHostCustomers(protocol) };
			},
			(err) => {
				console.error('Error received from starting extension host');
				console.error(err);
				return null;
			}
		);
		this._extensionHostProcessProxy.then(() => {
			initialActivationEvents.forEach((activationEvent) => this.activateByEvent(activationEvent));
		});
	}

	private _onExtensionHostCrashed(code: number, signal: string): void {
		const openDevTools = new Action('openDevTools', nls.localize('devTools', "Developer Tools"), '', true, (): TPromise<boolean> => {
			return this._windowService.openDevTools().then(() => false);
		});

		const restart = new Action('restart', nls.localize('restart', "Restart Extension Host"), '', true, (): TPromise<boolean> => {
			this._messageService.hideAll();
			this._startExtensionHostProcess(Object.keys(this._allRequestedActivateEvents));
			return TPromise.as(true);
		});

		console.error('Extension host terminated unexpectedly. Code: ', code, ' Signal: ', signal);
		this._stopExtensionHostProcess();

		let message = nls.localize('extensionHostProcess.crash', "Extension host terminated unexpectedly.");
		if (code === 87) {
			message = nls.localize('extensionHostProcess.unresponsiveCrash', "Extension host terminated because it was not responsive.");
		}
		this._messageService.show(Severity.Error, {
			message: message,
			actions: [
				openDevTools,
				restart
			]
		});
	}

	private _createExtensionHostCustomers(protocol: IMessagePassingProtocol): ExtHostExtensionServiceShape {

		this._extensionHostProcessThreadService = this._instantiationService.createInstance(MainThreadService, protocol);
		const extHostContext: IExtHostContext = this._extensionHostProcessThreadService;

		// Named customers
		const namedCustomers = ExtHostCustomersRegistry.getNamedCustomers();
		for (let i = 0, len = namedCustomers.length; i < len; i++) {
			const [id, ctor] = namedCustomers[i];
			const instance = this._instantiationService.createInstance(ctor, extHostContext);
			this._extensionHostProcessCustomers.push(instance);
			this._extensionHostProcessThreadService.set(id, instance);
		}

		// Customers
		const customers = ExtHostCustomersRegistry.getCustomers();
		for (let i = 0, len = customers.length; i < len; i++) {
			const ctor = customers[i];
			const instance = this._instantiationService.createInstance(ctor, extHostContext);
			this._extensionHostProcessCustomers.push(instance);
		}

		// Check that no named customers are missing
		const expected: ProxyIdentifier<any>[] = Object.keys(MainContext).map((key) => MainContext[key]);
		this._extensionHostProcessThreadService.assertRegistered(expected);

		return this._extensionHostProcessThreadService.get(ExtHostContext.ExtHostExtensionService);
	}

	// ---- begin IExtensionService

	public activateByEvent(activationEvent: string): TPromise<void> {
		if (this._barrier.isOpen()) {
			// Extensions have been scanned and interpreted

			if (!this._registry.containsActivationEvent(activationEvent)) {
				// There is no extension that is interested in this activation event
				return NO_OP_VOID_PROMISE;
			}

			// Record the fact that this activationEvent was requested (in case of a restart)
			this._allRequestedActivateEvents[activationEvent] = true;

			return this._activateByEvent(activationEvent);
		} else {
			// Extensions have not been scanned yet.

			// Record the fact that this activationEvent was requested (in case of a restart)
			this._allRequestedActivateEvents[activationEvent] = true;

			return this._barrier.wait().then(() => this._activateByEvent(activationEvent));
		}
	}

	protected _activateByEvent(activationEvent: string): TPromise<void> {
		if (this._extensionHostProcessFinishedActivateEvents[activationEvent]) {
			return NO_OP_VOID_PROMISE;
		}
		return this._extensionHostProcessProxy.then((proxy) => {
			return proxy.value.$activateByEvent(activationEvent);
		}).then(() => {
			this._extensionHostProcessFinishedActivateEvents[activationEvent] = true;
		});
	}

	public onReady(): TPromise<boolean> {
		return this._barrier.wait();
	}

	public getExtensions(): TPromise<IExtensionDescription[]> {
		return this.onReady().then(() => {
			return this._registry.getAllExtensionDescriptions();
		});
	}

	public readExtensionPointContributions<T>(extPoint: IExtensionPoint<T>): TPromise<ExtensionPointContribution<T>[]> {
		return this.onReady().then(() => {
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
		return this._extensionsStatus;
	}

	public getExtensionsActivationTimes(): { [id: string]: ActivationTimes; } {
		return this._extensionHostProcessActivationTimes;
	}

	// ---- end IExtensionService

	// --- impl

	private _scanAndHandleExtensions(): void {

		const log = new Logger((severity, source, message) => {
			this._logOrShowMessage(severity, this._isDev ? messageWithSource2(source, message) : message);
		});

		ExtensionService._scanInstalledExtensions(this._environmentService, log).then((installedExtensions) => {
			const disabledExtensions = [
				...getGloballyDisabledExtensions(this._extensionEnablementService, this._storageService, installedExtensions),
				...this._extensionEnablementService.getWorkspaceDisabledExtensions()
			];

			this._telemetryService.publicLog('extensionsScanned', {
				totalCount: installedExtensions.length,
				disabledCount: disabledExtensions.length
			});

			if (disabledExtensions.length === 0) {
				return installedExtensions;
			}
			return installedExtensions.filter(e => disabledExtensions.every(id => !areSameExtensions({ id }, e)));

		}).then((extensionDescriptions) => {
			this._registry = new ExtensionDescriptionRegistry(extensionDescriptions);

			let availableExtensions = this._registry.getAllExtensionDescriptions();
			let extensionPoints = ExtensionsRegistry.getExtensionPoints();

			let messageHandler = (msg: IMessage) => this._handleExtensionPointMessage(msg);

			for (let i = 0, len = extensionPoints.length; i < len; i++) {
				ExtensionService._handleExtensionPoint(extensionPoints[i], availableExtensions, messageHandler);
			}

			this._barrier.open();
		});
	}

	private _handleExtensionPointMessage(msg: IMessage) {

		if (!this._extensionsStatus[msg.source]) {
			this._extensionsStatus[msg.source] = { messages: [] };
		}
		this._extensionsStatus[msg.source].messages.push(msg);

		if (msg.source === this._environmentService.extensionDevelopmentPath) {
			// This message is about the extension currently being developed
			this._showMessageToUser(msg.type, messageWithSource(msg));
		} else {
			this._logMessageInConsole(msg.type, messageWithSource(msg));
		}

		if (!this._isDev && msg.extensionId) {
			const { type, extensionId, extensionPointId, message } = msg;
			this._telemetryService.publicLog('extensionsMessage', {
				type, extensionId, extensionPointId, message
			});
		}
	}

	private static _scanInstalledExtensions(environmentService: IEnvironmentService, log: ILog): TPromise<IExtensionDescription[]> {
		const version = pkg.version;
		const builtinExtensions = ExtensionScanner.scanExtensions(version, log, SystemExtensionsRoot, true);
		const userExtensions = environmentService.disableExtensions || !environmentService.extensionsPath ? TPromise.as([]) : ExtensionScanner.scanExtensions(version, log, environmentService.extensionsPath, false);
		const developedExtensions = environmentService.disableExtensions || !environmentService.isExtensionDevelopment ? TPromise.as([]) : ExtensionScanner.scanOneOrMultipleExtensions(version, log, environmentService.extensionDevelopmentPath, false);

		return TPromise.join([builtinExtensions, userExtensions, developedExtensions]).then<IExtensionDescription[]>((extensionDescriptions: IExtensionDescription[][]) => {
			const builtinExtensions = extensionDescriptions[0];
			const userExtensions = extensionDescriptions[1];
			const developedExtensions = extensionDescriptions[2];

			let result: { [extensionId: string]: IExtensionDescription; } = {};
			builtinExtensions.forEach((builtinExtension) => {
				result[builtinExtension.id] = builtinExtension;
			});
			userExtensions.forEach((userExtension) => {
				if (result.hasOwnProperty(userExtension.id)) {
					log.warn(userExtension.extensionFolderPath, nls.localize('overwritingExtension', "Overwriting extension {0} with {1}.", result[userExtension.id].extensionFolderPath, userExtension.extensionFolderPath));
				}
				result[userExtension.id] = userExtension;
			});
			developedExtensions.forEach(developedExtension => {
				log.info('', nls.localize('extensionUnderDevelopment', "Loading development extension at {0}", developedExtension.extensionFolderPath));
				if (result.hasOwnProperty(developedExtension.id)) {
					log.warn(developedExtension.extensionFolderPath, nls.localize('overwritingExtension', "Overwriting extension {0} with {1}.", result[developedExtension.id].extensionFolderPath, developedExtension.extensionFolderPath));
				}
				result[developedExtension.id] = developedExtension;
			});

			return Object.keys(result).map(name => result[name]);
		}).then(null, err => {
			log.error('', err);
			return [];
		});
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
			this._messageService.show(severity, msg);
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

	public _onExtensionActivated(extensionId: string, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number): void {
		this._extensionHostProcessActivationTimes[extensionId] = new ActivationTimes(startup, codeLoadingTime, activateCallTime, activateResolvedTime);
	}
}

export class Logger implements ILog {

	private readonly _messageHandler: (severity: Severity, source: string, message: string) => void;

	constructor(
		messageHandler: (severity: Severity, source: string, message: string) => void
	) {
		this._messageHandler = messageHandler;
	}

	public error(source: string, message: string): void {
		this._messageHandler(Severity.Error, source, message);
	}

	public warn(source: string, message: string): void {
		this._messageHandler(Severity.Warning, source, message);
	}

	public info(source: string, message: string): void {
		this._messageHandler(Severity.Info, source, message);
	}
}
