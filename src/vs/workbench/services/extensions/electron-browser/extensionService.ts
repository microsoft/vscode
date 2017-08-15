/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import pkg from 'vs/platform/node/package';
import { localize } from 'vs/nls';
import * as path from 'path';
import URI from 'vs/base/common/uri';
import { ExtensionDescriptionRegistry } from 'vs/platform/extensions/common/abstractExtensionService';
import { IMessage, IExtensionDescription, IExtensionsStatus, IExtensionService, ExtensionPointContribution } from 'vs/platform/extensions/common/extensions';
import { IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, getGloballyDisabledExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionsRegistry, ExtensionPoint, IExtensionPointUser, ExtensionMessageCollector, IExtensionPoint } from 'vs/platform/extensions/common/extensionsRegistry';
import { ExtensionScanner, MessagesCollector } from 'vs/workbench/node/extensionPoints';
import { IMessageService } from 'vs/platform/message/common/message';
import { IThreadService, ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostContext, ExtHostExtensionServiceShape } from "vs/workbench/api/node/extHost.protocol";
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from "vs/platform/instantiation/common/instantiation";
import { ExtensionHostProcessWorker } from "vs/workbench/services/extensions/electron-browser/extensionHost";
import { MainThreadService } from "vs/workbench/services/thread/electron-browser/threadService";

const SystemExtensionsRoot = path.normalize(path.join(URI.parse(require.toUrl('')).fsPath, '..', 'extensions'));

function messageWithSource(msg: IMessage): string {
	return (msg.source ? '[' + msg.source + ']: ' : '') + msg.message;
}

const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = TPromise.as<void>(void 0);

export abstract class AbstractExtensionService {
	public _serviceBrand: any;

	private _onReady: TPromise<boolean>;
	private _onReadyC: (v: boolean) => void;
	private _isReady: boolean;
	protected _registry: ExtensionDescriptionRegistry;

	constructor() {
		this._isReady = false;
		this._onReady = new TPromise<boolean>((c, e, p) => {
			this._onReadyC = c;
		}, () => {
			console.warn('You should really not try to cancel this ready promise!');
		});
		this._registry = new ExtensionDescriptionRegistry();
	}

	protected _triggerOnReady(): void {
		this._isReady = true;
		this._onReadyC(true);
	}

	public onReady(): TPromise<boolean> {
		return this._onReady;
	}

	public activateByEvent(activationEvent: string): TPromise<void> {
		if (this._isReady) {
			return this._activateByEvent(activationEvent);
		} else {
			return this._onReady.then(() => this._activateByEvent(activationEvent));
		}
	}

	protected abstract _activateByEvent(activationEvent: string): TPromise<void>;
}

export class MainProcessExtensionService extends AbstractExtensionService implements IThreadService, IExtensionService {

	private readonly _isDev: boolean;
	private readonly _extensionsStatus: { [id: string]: IExtensionsStatus };
	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _alreadyActivatedEvents: { [activationEvent: string]: boolean; };
	private readonly _threadService: IThreadService;
	private readonly _proxy: ExtHostExtensionServiceShape;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMessageService private readonly _messageService: IMessageService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IExtensionEnablementService private readonly _extensionEnablementService: IExtensionEnablementService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._isDev = !this._environmentService.isBuilt || this._environmentService.isExtensionDevelopment;
		this._extensionsStatus = {};
		this._alreadyActivatedEvents = Object.create(null);

		const extensionHostProcessWorker = this._instantiationService.createInstance(ExtensionHostProcessWorker);
		this._threadService = this._instantiationService.createInstance(MainThreadService, extensionHostProcessWorker.messagingProtocol);
		this._proxy = this._threadService.get(ExtHostContext.ExtHostExtensionService);
		extensionHostProcessWorker.start(this);

		this._initialize();
	}

	// ---- begin IThreadService

	public get<T>(identifier: ProxyIdentifier<T>): T {
		return this._threadService.get(identifier);
	}

	public set<T>(identifier: ProxyIdentifier<T>, value: T): void {
		this._threadService.set(identifier, value);
	}

	// ---- end IThreadService

	// ---- begin IExtensionService

	// public activateByEvent(activationEvent: string): TPromise<void> {
	// }

	protected _activateByEvent(activationEvent: string): TPromise<void> {
		if (this._alreadyActivatedEvents[activationEvent]) {
			return NO_OP_VOID_PROMISE;
		}
		return this._proxy.$activateByEvent(activationEvent).then(() => {
			this._alreadyActivatedEvents[activationEvent] = true;
		});
	}

	// public onReady(): TPromise<boolean> {
	// }

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

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		return this._extensionsStatus;
	}

	// ---- end IExtensionService

	private _handleMessage(msg: IMessage) {

		if (!this._extensionsStatus[msg.source]) {
			this._extensionsStatus[msg.source] = { messages: [] };
		}
		this._extensionsStatus[msg.source].messages.push(msg);

		this._localShowMessage(
			msg.type, messageWithSource(msg),
			this._environmentService.extensionDevelopmentPath === msg.source
		);

		if (!this._isDev && msg.extensionId) {
			const { type, extensionId, extensionPointId, message } = msg;
			this._telemetryService.publicLog('extensionsMessage', {
				type, extensionId, extensionPointId, message
			});
		}
	}

	// --- impl

	private _initialize(): void {

		MainProcessExtensionService._scanInstalledExtensions(this._environmentService).done(([installedExtensions, messages]) => {
			messages.forEach(entry => this._localShowMessage(entry.type, this._isDev ? (entry.source ? '[' + entry.source + ']: ' : '') + entry.message : entry.message));

			const disabledExtensions = [
				...getGloballyDisabledExtensions(this._extensionEnablementService, this._storageService, installedExtensions),
				...this._extensionEnablementService.getWorkspaceDisabledExtensions()
			];

			this._telemetryService.publicLog('extensionsScanned', {
				totalCount: installedExtensions.length,
				disabledCount: disabledExtensions.length
			});

			this._onExtensionDescriptions(disabledExtensions.length ? installedExtensions.filter(e => disabledExtensions.every(id => !areSameExtensions({ id }, e))) : installedExtensions);
		});
	}

	private static _scanInstalledExtensions(environmentService: IEnvironmentService): TPromise<[IExtensionDescription[], IMessage[]]> {
		const collector = new MessagesCollector();
		const version = pkg.version;
		const builtinExtensions = ExtensionScanner.scanExtensions(version, collector, SystemExtensionsRoot, true);
		const userExtensions = environmentService.disableExtensions || !environmentService.extensionsPath ? TPromise.as([]) : ExtensionScanner.scanExtensions(version, collector, environmentService.extensionsPath, false);
		const developedExtensions = environmentService.disableExtensions || !environmentService.isExtensionDevelopment ? TPromise.as([]) : ExtensionScanner.scanOneOrMultipleExtensions(version, collector, environmentService.extensionDevelopmentPath, false);

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
					collector.warn(userExtension.extensionFolderPath, localize('overwritingExtension', "Overwriting extension {0} with {1}.", result[userExtension.id].extensionFolderPath, userExtension.extensionFolderPath));
				}
				result[userExtension.id] = userExtension;
			});
			developedExtensions.forEach(developedExtension => {
				collector.info('', localize('extensionUnderDevelopment', "Loading development extension at {0}", developedExtension.extensionFolderPath));
				if (result.hasOwnProperty(developedExtension.id)) {
					collector.warn(developedExtension.extensionFolderPath, localize('overwritingExtension', "Overwriting extension {0} with {1}.", result[developedExtension.id].extensionFolderPath, developedExtension.extensionFolderPath));
				}
				result[developedExtension.id] = developedExtension;
			});

			return Object.keys(result).map(name => result[name]);
		}).then<IExtensionDescription[]>(null, err => {
			collector.error('', err);
			return [];
		}).then<[IExtensionDescription[], IMessage[]]>(extensions => {
			const messages = collector.getMessages();
			const result: [IExtensionDescription[], IMessage[]] = [extensions, messages];
			return result;
		});
	}

	private _onExtensionDescriptions(extensionDescriptions: IExtensionDescription[]): void {
		this._registry.registerExtensions(extensionDescriptions);

		let availableExtensions = this._registry.getAllExtensionDescriptions();
		let extensionPoints = ExtensionsRegistry.getExtensionPoints();

		for (let i = 0, len = extensionPoints.length; i < len; i++) {
			this._handleExtensionPoint(extensionPoints[i], availableExtensions);
		}

		this._triggerOnReady();
	}

	private _handleExtensionPoint<T>(extensionPoint: ExtensionPoint<T>, availableExtensions: IExtensionDescription[]): void {
		let messageHandler = (msg: IMessage) => this._handleMessage(msg);

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

	// -- called by extension host

	public _localShowMessage(severity: Severity, msg: string, useMessageService: boolean = this._isDev): void {
		// Only show nasty intrusive messages if doing extension development
		// and print all other messages to the console
		if (useMessageService && (severity === Severity.Error || severity === Severity.Warning)) {
			this._messageService.show(severity, msg);
		} else if (severity === Severity.Error) {
			console.error(msg);
		} else if (severity === Severity.Warning) {
			console.warn(msg);
		} else {
			console.log(msg);
		}
	}
}
