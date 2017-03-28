/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { join } from 'path';
import { mkdirp, dirExists } from 'vs/base/node/pfs';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { AbstractExtensionService, ActivatedExtension } from 'vs/platform/extensions/common/abstractExtensionService';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostStorage } from 'vs/workbench/api/node/extHostStorage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { createApiFactory, initializeExtensionApi } from 'vs/workbench/api/node/extHost.api.impl';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { MainContext, MainProcessExtensionServiceShape, IEnvironment, IInitData } from './extHost.protocol';
import { createHash } from 'crypto';

const hasOwnProperty = Object.hasOwnProperty;

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

class ExtensionStoragePath {

	private readonly _contextService: IWorkspaceContextService;
	private readonly _environment: IEnvironment;

	private readonly _ready: TPromise<string>;
	private _value: string;

	constructor(contextService: IWorkspaceContextService, environment: IEnvironment) {
		this._contextService = contextService;
		this._environment = environment;
		this._ready = this._getOrCreateWorkspaceStoragePath().then(value => this._value = value);
	}

	get whenReady(): TPromise<any> {
		return this._ready;
	}

	value(extension: IExtensionDescription): string {
		if (this._value) {
			return join(this._value, extension.id);
		}
		return undefined;
	}

	private _getOrCreateWorkspaceStoragePath(): TPromise<string> {

		const workspace = this._contextService.getWorkspace();

		if (!workspace) {
			return TPromise.as(undefined);
		}

		const storageName = createHash('md5')
			.update(workspace.resource.fsPath)
			.update(workspace.uid ? workspace.uid.toString() : '')
			.digest('hex');

		const storagePath = join(this._environment.appSettingsHome, 'workspaceStorage', storageName);

		return dirExists(storagePath).then(exists => {
			if (exists) {
				return storagePath;
			}

			return mkdirp(storagePath).then(success => {
				return storagePath;
			}, err => {
				return undefined;
			});
		});
	}
}

export interface IExtensionContext {
	subscriptions: IDisposable[];
	workspaceState: IExtensionMemento;
	globalState: IExtensionMemento;
	extensionPath: string;
	storagePath: string;
	asAbsolutePath(relativePath: string): string;
}

export class ExtHostExtensionService extends AbstractExtensionService<ExtHostExtension> {

	private _threadService: IThreadService;
	private _storage: ExtHostStorage;
	private _storagePath: ExtensionStoragePath;
	private _proxy: MainProcessExtensionServiceShape;
	private _telemetryService: ITelemetryService;
	private _contextService: IWorkspaceContextService;

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(initData: IInitData, threadService: IThreadService, telemetryService: ITelemetryService, contextService: IWorkspaceContextService) {
		super(false);
		this._registry.registerExtensions(initData.extensions);
		this._threadService = threadService;
		this._storage = new ExtHostStorage(threadService);
		this._storagePath = new ExtensionStoragePath(contextService, initData.environment);
		this._proxy = this._threadService.get(MainContext.MainProcessExtensionService);
		this._telemetryService = telemetryService;
		this._contextService = contextService;

		// initialize API first
		const apiFactory = createApiFactory(initData, threadService, this, this._contextService, this._telemetryService);
		initializeExtensionApi(this, apiFactory).then(() => this._triggerOnReady());
	}

	public getAllExtensionDescriptions(): IExtensionDescription[] {
		return this._registry.getAllExtensionDescriptions();
	}

	public getExtensionDescription(extensionId: string): IExtensionDescription {
		return this._registry.getExtensionDescription(extensionId);
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

	public deactivate(extensionId: string): TPromise<void> {
		let result: TPromise<void> = TPromise.as(void 0);

		let extension = this._activatedExtensions[extensionId];
		if (!extension) {
			return result;
		}

		// call deactivate if available
		try {
			if (typeof extension.module.deactivate === 'function') {
				result = TPromise.wrap(extension.module.deactivate()).then(null, (err) => {
					// TODO: Do something with err if this is not the shutdown case
					return TPromise.as(void 0);
				});
			}
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}

		// clean up subscriptions
		try {
			dispose(extension.subscriptions);
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}

		return result;
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

		return TPromise.join([
			globalState.whenReady,
			workspaceState.whenReady,
			this._storagePath.whenReady
		]).then(() => {
			return Object.freeze(<IExtensionContext>{
				globalState,
				workspaceState,
				subscriptions: [],
				get extensionPath() { return extensionDescription.extensionFolderPath; },
				storagePath: this._storagePath.value(extensionDescription),
				asAbsolutePath: (relativePath: string) => { return join(extensionDescription.extensionFolderPath, relativePath); }
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
		return this.onReady().then(() => {
			return TPromise.join<any>([
				loadCommonJSModule(extensionDescription.main),
				this._loadExtensionContext(extensionDescription)
			]).then(values => {
				return ExtHostExtensionService._callActivate(<IExtensionModule>values[0], <IExtensionContext>values[1]);
			}, (errors: any[]) => {
				// Avoid failing with an array of errors, fail with a single error
				if (errors[0]) {
					return TPromise.wrapError(errors[0]);
				}
				if (errors[1]) {
					return TPromise.wrapError(errors[1]);
				}
				return undefined;
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
		activationEvents: extensionDescription.activationEvents ? extensionDescription.activationEvents.join(',') : null,
		isBuiltin: extensionDescription.isBuiltin
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
