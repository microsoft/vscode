/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {disposeAll} from 'vs/base/common/lifecycle';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/paths';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {AbstractExtensionService, ActivatedExtension} from 'vs/platform/extensions/common/abstractExtensionService';
import {IMessage, IExtensionDescription, IExtensionsStatus} from 'vs/platform/extensions/common/extensions';
import {ExtensionsRegistry} from 'vs/platform/extensions/common/extensionsRegistry';
import {IMessageService} from 'vs/platform/message/common/message';
import {ExtHostStorage} from 'vs/platform/storage/common/remotable.storage';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService, Remotable} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

const hasOwnProperty = Object.hasOwnProperty;

/**
 * Represents a failed extension in the ext host.
 */
class MainProcessFailedExtension extends ActivatedExtension {
	constructor() {
		super(true);
	}
}

/**
 * Represents an extension that was successfully loaded or an
 * empty extension in the ext host.
 */
class MainProcessSuccessExtension extends ActivatedExtension {
	constructor() {
		super(false);
	}
}

function messageWithSource(msg:IMessage): string {
	return (msg.source ? '[' + msg.source + ']: ' : '') + msg.message;
}

@Remotable.MainContext('MainProcessExtensionService')
export class MainProcessExtensionService extends AbstractExtensionService<ActivatedExtension> {

	private _threadService: IThreadService;
	private _messageService: IMessageService;
	private _telemetryService: ITelemetryService;
	private _proxy: ExtHostExtensionService;
	private _isDev: boolean;
	private _extensionsStatus: { [id: string]: IExtensionsStatus };

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(
		contextService: IWorkspaceContextService,
		threadService: IThreadService,
		messageService: IMessageService,
		telemetryService: ITelemetryService
	) {
		super(false);
		let config = contextService.getConfiguration();
		this._isDev = !config.env.isBuilt || !!config.env.extensionDevelopmentPath;

		this._messageService = messageService;
		threadService.registerRemotableInstance(MainProcessExtensionService, this);
		this._threadService = threadService;
		this._telemetryService = telemetryService;
		this._proxy = this._threadService.getRemotable(ExtHostExtensionService);
		this._extensionsStatus = {};

		ExtensionsRegistry.handleExtensionPoints((msg) => this._handleMessage(msg));
	}

	private _handleMessage(msg: IMessage) {
		this._showMessage(msg.type, messageWithSource(msg));

		if (!this._extensionsStatus[msg.source]) {
			this._extensionsStatus[msg.source] = { messages: [] };
		}
		this._extensionsStatus[msg.source].messages.push(msg);
	}

	public $localShowMessage(severity: Severity, msg: string): void {
		let messageShown = false;
		if (severity === Severity.Error || severity === Severity.Warning) {
			if (this._isDev) {
				// Only show nasty intrusive messages if doing extension development.
				this._messageService.show(severity, msg);
				messageShown = true;
			}
		}

		if (!messageShown) {
			switch (severity) {
				case Severity.Error:
					console.error(msg);
					break;
				case Severity.Warning:
					console.warn(msg);
					break;
				default:
					console.log(msg);
			}
		}
	}

	// -- overwriting AbstractExtensionService

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		return this._extensionsStatus;
	}

	protected _showMessage(severity: Severity, msg: string): void {
		this._proxy.$localShowMessage(severity, msg);
		this.$localShowMessage(severity, msg);
	}

	protected _createFailedExtension(): ActivatedExtension {
		return new MainProcessFailedExtension();
	}

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {

		// redirect extension activation to the extension host
		return this._proxy.$activateExtension(extensionDescription).then(_ => {

			// the extension host calls $onExtensionActivated, where we write to `_activatedExtensions`
			return this._activatedExtensions[extensionDescription.id];
		});
	}

	// -- called by extension host

	public $onExtensionHostReady(extensionDescriptions: IExtensionDescription[], messages: IMessage[]): void {
		ExtensionsRegistry.registerExtensions(extensionDescriptions);
		messages.forEach((entry) => this._handleMessage(entry));
		this._triggerOnReady();
	}

	public $onExtensionActivated(extensionId: string): void {
		this._activatedExtensions[extensionId] = new MainProcessSuccessExtension();
	}

	public $onExtensionActivationFailed(extensionId: string): void {
		this._activatedExtensions[extensionId] = new MainProcessFailedExtension();
	}
}

/**
 * Represents the source code (module) of an extension.
 */
export interface IExtensionModule {
	activate(ctx: IExtensionContext): TPromise<IExtensionAPI>;
	deactivate(): void;
}

/**
 * Represents the API of an extension (return value of `activate`).
 */
export interface IExtensionAPI {
	// _extensionAPIBrand: any;
}

export class ExtHostExtension extends ActivatedExtension {

	module: IExtensionModule;
	exports: IExtensionAPI;
	subscriptions: IDisposable[];

	constructor(activationFailed: boolean, module: IExtensionModule, exports: IExtensionAPI, subscriptions: IDisposable[]) {
		super(activationFailed);
		this.module = module;
		this.exports = exports;
		this.subscriptions = subscriptions;
	}
}

export class ExtHostEmptyExtension extends ExtHostExtension {
	constructor() {
		super(false, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

export interface IExtensionMemento {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: any): Thenable<boolean>;
}

class ExtensionMemento implements IExtensionMemento {

	private _id: string;
	private _shared: boolean;
	private _storage: ExtHostStorage;

	private _init: TPromise<ExtensionMemento>;
	private _value: { [n: string]: any; };

	constructor(id: string, global: boolean, storage: ExtHostStorage) {
		this._id = id;
		this._shared = global;
		this._storage = storage;

		this._init = this._storage.getValue(this._shared, this._id, Object.create(null)).then(value => {
			this._value = value;
			return this;
		});
	}

	get whenReady(): TPromise<ExtensionMemento> {
		return this._init;
	}

	get<T>(key: string, defaultValue: T): T {
		let value = this._value[key];
		if (typeof value === 'undefined') {
			value = defaultValue;
		}
		return value;
	}

	update(key: string, value: any): Thenable<boolean> {
		this._value[key] = value;
		return this._storage
			.setValue(this._shared, this._id, this._value)
			.then(() => true);
	}
}

export interface IExtensionContext {
	subscriptions: IDisposable[];
	workspaceState: IExtensionMemento;
	globalState: IExtensionMemento;
	extensionPath: string;
	asAbsolutePath(relativePath: string): string;
}

@Remotable.ExtHostContext('ExtHostExtensionService')
export class ExtHostExtensionService extends AbstractExtensionService<ExtHostExtension> {

	private _threadService: IThreadService;
	private _storage: ExtHostStorage;
	private _proxy: MainProcessExtensionService;
	private _telemetryService: ITelemetryService;

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(threadService: IThreadService, telemetryService: ITelemetryService) {
		super(true);
		threadService.registerRemotableInstance(ExtHostExtensionService, this);
		this._threadService = threadService;
		this._storage = new ExtHostStorage(threadService);
		this._proxy = this._threadService.getRemotable(MainProcessExtensionService);
		this._telemetryService = telemetryService;
	}

	public $localShowMessage(severity: Severity, msg: string): void {
		switch (severity) {
			case Severity.Error:
				console.error(msg);
				break;
			case Severity.Warning:
				console.warn(msg);
				break;
			default:
				console.log(msg);
		}
	}

	public get(extensionId: string): IExtensionAPI {
		if (!hasOwnProperty.call(this._activatedExtensions, extensionId)) {
			throw new Error('Extension `' + extensionId + '` is not known or not activated');
		}
		return this._activatedExtensions[extensionId].exports;
	}

	public deactivate(extensionId: string): void {
		let extension = this._activatedExtensions[extensionId];
		if (!extension) {
			return;
		}

		// call deactivate if available
		try {
			if (typeof extension.module.deactivate === 'function') {
				extension.module.deactivate();
			}
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}

		// clean up subscriptions
		try {
			disposeAll(extension.subscriptions);
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}
	}

	public registrationDone(messages: IMessage[]): void {
		this._triggerOnReady();
		this._proxy.$onExtensionHostReady(ExtensionsRegistry.getAllExtensionDescriptions(), messages);
	}

	// -- overwriting AbstractExtensionService

	protected _showMessage(severity: Severity, msg: string): void {
		this._proxy.$localShowMessage(severity, msg);
		this.$localShowMessage(severity, msg);
	}

	protected _createFailedExtension() {
		return new ExtHostExtension(true, { activate: undefined, deactivate: undefined }, undefined, []);
	}

	private _loadExtensionContext(extensionDescription: IExtensionDescription): TPromise<IExtensionContext> {

		let globalState = new ExtensionMemento(extensionDescription.id, true, this._storage);
		let workspaceState = new ExtensionMemento(extensionDescription.id, false, this._storage);

		return TPromise.join([globalState.whenReady, workspaceState.whenReady]).then(() => {
			return Object.freeze(<IExtensionContext>{
				globalState,
				workspaceState,
				subscriptions: [],
				get extensionPath() { return extensionDescription.extensionFolderPath; },
				asAbsolutePath: (relativePath: string) => { return paths.normalize(paths.join(extensionDescription.extensionFolderPath, relativePath), true); }
			});
		});
	}

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {
		return this._doActualActivateExtension(extensionDescription).then((activatedExtension) => {
			this._proxy.$onExtensionActivated(extensionDescription.id);
			return activatedExtension;
		}, (err) => {
			this._proxy.$onExtensionActivationFailed(extensionDescription.id);
			throw err;
		});
	}

	private _doActualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ExtHostExtension> {
		let event = getTelemetryActivationEvent(extensionDescription);
		this._telemetryService.publicLog('activatePlugin', event);
		if (!extensionDescription.main) {
			// Treat the extension as being empty => NOT AN ERROR CASE
			return TPromise.as(new ExtHostEmptyExtension());
		}

		return loadCommonJSModule<IExtensionModule>(extensionDescription.main).then((extensionModule) => {
			return this._loadExtensionContext(extensionDescription).then(context => {
				return ExtHostExtensionService._callActivate(extensionModule, context);
			});
		});
	}

	private static _callActivate(extensionModule: IExtensionModule, context: IExtensionContext): TPromise<ExtHostExtension> {
		// Make sure the extension's surface is not undefined
		extensionModule = extensionModule || {
			activate: undefined,
			deactivate: undefined
		};

		return this._callActivateOptional(extensionModule, context).then((extensionExports) => {
			return new ExtHostExtension(false, extensionModule, extensionExports, context.subscriptions);
		});
	}

	private static _callActivateOptional(extensionModule: IExtensionModule, context: IExtensionContext): TPromise<IExtensionAPI> {
		if (typeof extensionModule.activate === 'function') {
			try {
				return TPromise.as(extensionModule.activate.apply(global, [context]));
			} catch (err) {
				return TPromise.wrapError(err);
			}
		} else {
			// No activate found => the module is the extension's exports
			return TPromise.as<IExtensionAPI>(extensionModule);
		}
	}

	// -- called by main thread

	public $activateExtension(extensionDescription: IExtensionDescription): TPromise<void> {
		return this._activateExtension(extensionDescription);
	}

}

function loadCommonJSModule<T>(modulePath: string): TPromise<T> {
	let r: T = null;
	try {
		r = require.__$__nodeRequire<T>(modulePath);
	} catch (e) {
		return TPromise.wrapError(e);
	}
	return TPromise.as(r);
}

function getTelemetryActivationEvent(extensionDescription: IExtensionDescription): any {
	let event = {
		id: extensionDescription.id,
		name: extensionDescription.name,
		publisherDisplayName: extensionDescription.publisher,
		activationEvents: extensionDescription.activationEvents ? extensionDescription.activationEvents.join(',') : null
	};

	for (let contribution in extensionDescription.contributes) {
		let contributionDetails = extensionDescription.contributes[contribution];

		if (!contributionDetails) {
			continue;
		}

		switch (contribution) {
			case 'debuggers':
				let types = contributionDetails.reduce((p, c) => p ? p + ',' + c['type'] : c['type'], '');
				event['contribution.debuggers'] = types;
				break;
			case 'grammars':
				let grammers = contributionDetails.reduce((p, c) => p ? p + ',' + c['language'] : c['language'], '');
				event['contribution.grammars'] = grammers;
				break;
			case 'languages':
				let languages = contributionDetails.reduce((p, c) => p ? p + ',' + c['id'] : c['id'], '');
				event['contribution.languages'] = languages;
				break;
			case 'tmSnippets':
				let tmSnippets = contributionDetails.reduce((p, c) => p ? p + ',' + c['languageId'] : c['languageId'], '');
				event['contribution.tmSnippets'] = tmSnippets;
				break;
			default:
				event[`contribution.${contribution}`] = true;
		}
	}

	return event;
}