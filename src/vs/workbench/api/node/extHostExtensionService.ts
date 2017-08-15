/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { join } from 'path';
import { mkdirp, dirExists } from 'vs/base/node/pfs';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtensionDescriptionRegistry } from 'vs/platform/extensions/common/abstractExtensionService';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostStorage } from 'vs/workbench/api/node/extHostStorage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { createApiFactory, initializeExtensionApi } from 'vs/workbench/api/node/extHost.api.impl';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { MainContext, MainProcessExtensionServiceShape, IWorkspaceData, IEnvironment, IInitData } from './extHost.protocol';

const hasOwnProperty = Object.hasOwnProperty;
const NO_OP_VOID_PROMISE = TPromise.as<void>(void 0);

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

export abstract class ActivatedExtension {
	activationFailed: boolean;

	constructor(activationFailed: boolean) {
		this.activationFailed = activationFailed;
	}
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

	private readonly _workspace: IWorkspaceData;
	private readonly _environment: IEnvironment;

	private readonly _ready: TPromise<string>;
	private _value: string;

	constructor(workspace: IWorkspaceData, environment: IEnvironment) {
		this._workspace = workspace;
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
		if (!this._workspace) {
			return TPromise.as(undefined);
		}
		const storageName = this._workspace.id;
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

export abstract class AbstractExtensionService<T extends ActivatedExtension> {
	public _serviceBrand: any;

	private _onReady: TPromise<boolean>;
	private _onReadyC: (v: boolean) => void;
	private _isReady: boolean;
	protected _registry: ExtensionDescriptionRegistry;
	protected _manager: ExtensionsManager<T>;

	constructor(isReadyByDefault: boolean) {
		if (isReadyByDefault) {
			this._isReady = true;
			this._onReady = TPromise.as(true);
			this._onReadyC = (v: boolean) => { /*no-op*/ };
		} else {
			this._isReady = false;
			this._onReady = new TPromise<boolean>((c, e, p) => {
				this._onReadyC = c;
			}, () => {
				console.warn('You should really not try to cancel this ready promise!');
			});
		}
		this._registry = new ExtensionDescriptionRegistry();
		this._manager = new ExtensionsManager(this._registry, {
			showMessage: (severity: Severity, message: string): void => {
				this._showMessage(severity, message);
			},

			createFailedExtension: (): T => {
				return this._createFailedExtension();
			},

			actualActivateExtension: (extensionDescription: IExtensionDescription): TPromise<T> => {
				return this._actualActivateExtension(extensionDescription);
			}
		});
	}

	protected _triggerOnReady(): void {
		this._isReady = true;
		this._onReadyC(true);
	}

	public onReady(): TPromise<boolean> {
		return this._onReady;
	}

	public isActivated(extensionId: string): boolean {
		return this._manager.isActivated(extensionId);
	}

	public activateByEvent(activationEvent: string): TPromise<void> {
		if (this._isReady) {
			return this._manager.activateByEvent(activationEvent);
		} else {
			return this._onReady.then(() => this._manager.activateByEvent(activationEvent));
		}
	}

	public activateById(extensionId: string): TPromise<void> {
		if (this._isReady) {
			return this._manager.activateById(extensionId);
		} else {
			return this._onReady.then(() => this._manager.activateById(extensionId));
		}
	}

	protected abstract _showMessage(severity: Severity, message: string): void;

	protected abstract _createFailedExtension(): T;

	protected abstract _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<T>;
}

export class ExtHostExtensionService extends AbstractExtensionService<ExtHostExtension> {

	private _threadService: IThreadService;
	private _storage: ExtHostStorage;
	private _storagePath: ExtensionStoragePath;
	private _proxy: MainProcessExtensionServiceShape;
	private _telemetryService: ITelemetryService;

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(initData: IInitData, threadService: IThreadService, telemetryService: ITelemetryService) {
		super(false);
		this._registry.registerExtensions(initData.extensions);
		this._threadService = threadService;
		this._storage = new ExtHostStorage(threadService);
		this._storagePath = new ExtensionStoragePath(initData.workspace, initData.environment);
		this._proxy = this._threadService.get(MainContext.MainProcessExtensionService);
		this._telemetryService = telemetryService;

		// initialize API first
		const apiFactory = createApiFactory(initData, threadService, this, this._telemetryService);
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
		return this._manager.getActivatedExtension(extensionId).exports;
	}

	public deactivate(extensionId: string): TPromise<void> {
		let result: TPromise<void> = TPromise.as(void 0);

		if (!this._manager.isActivated(extensionId)) {
			return result;
		}

		let extension = this._manager.getActivatedExtension(extensionId);
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

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ExtHostExtension> {
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
					return TPromise.wrapError<ExtHostExtension>(errors[0]);
				}
				if (errors[1]) {
					return TPromise.wrapError<ExtHostExtension>(errors[1]);
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

	public $activateByEvent(activationEvent: string): TPromise<void> {
		return this._manager.activateByEvent(activationEvent);
	}
}


export interface IExtensionsManagerHost<T extends ActivatedExtension> {
	showMessage(severity: Severity, message: string): void;

	createFailedExtension(): T;

	actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<T>;
}

export interface IActivatedExtensionMap<T extends ActivatedExtension> {
	[extensionId: string]: T;
}

interface IActivatingExtensionMap {
	[extensionId: string]: TPromise<void>;
}

export class ExtensionsManager<T extends ActivatedExtension> {

	private readonly _registry: ExtensionDescriptionRegistry;
	private readonly _host: IExtensionsManagerHost<T>;
	private readonly _activatingExtensions: IActivatingExtensionMap;
	private readonly _activatedExtensions: IActivatedExtensionMap<T>;
	/**
	 * A map of already activated events to speed things up if the same activation event is triggered multiple times.
	 */
	private readonly _alreadyActivatedEvents: { [activationEvent: string]: boolean; };

	constructor(registry: ExtensionDescriptionRegistry, host: IExtensionsManagerHost<T>) {
		this._registry = registry;
		this._host = host;
		this._activatingExtensions = {};
		this._activatedExtensions = {};
		this._alreadyActivatedEvents = Object.create(null);
	}

	public isActivated(extensionId: string): boolean {
		return hasOwnProperty.call(this._activatedExtensions, extensionId);
	}

	public getActivatedExtension(extensionId: string): T {
		if (!hasOwnProperty.call(this._activatedExtensions, extensionId)) {
			throw new Error('Extension `' + extensionId + '` is not known or not activated');
		}
		return this._activatedExtensions[extensionId];
	}

	public setActivatedExtension(extensionId: string, value: T): void {
		this._activatedExtensions[extensionId] = value;
	}

	public activateByEvent(activationEvent: string): TPromise<void> {
		if (this._alreadyActivatedEvents[activationEvent]) {
			return NO_OP_VOID_PROMISE;
		}
		let activateExtensions = this._registry.getExtensionDescriptionsForActivationEvent(activationEvent);
		return this._activateExtensions(activateExtensions, 0).then(() => {
			this._alreadyActivatedEvents[activationEvent] = true;
		});
	}

	public activateById(extensionId: string): TPromise<void> {
		let desc = this._registry.getExtensionDescription(extensionId);
		if (!desc) {
			throw new Error('Extension `' + extensionId + '` is not known');
		}

		return this._activateExtensions([desc], 0);
	}

	/**
	 * Handle semantics related to dependencies for `currentExtension`.
	 * semantics: `redExtensions` must wait for `greenExtensions`.
	 */
	private _handleActivateRequest(currentExtension: IExtensionDescription, greenExtensions: { [id: string]: IExtensionDescription; }, redExtensions: IExtensionDescription[]): void {
		let depIds = (typeof currentExtension.extensionDependencies === 'undefined' ? [] : currentExtension.extensionDependencies);
		let currentExtensionGetsGreenLight = true;

		for (let j = 0, lenJ = depIds.length; j < lenJ; j++) {
			let depId = depIds[j];
			let depDesc = this._registry.getExtensionDescription(depId);

			if (!depDesc) {
				// Error condition 1: unknown dependency
				this._host.showMessage(Severity.Error, nls.localize('unknownDep', "Extension `{1}` failed to activate. Reason: unknown dependency `{0}`.", depId, currentExtension.id));
				this._activatedExtensions[currentExtension.id] = this._host.createFailedExtension();
				return;
			}

			if (hasOwnProperty.call(this._activatedExtensions, depId)) {
				let dep = this._activatedExtensions[depId];
				if (dep.activationFailed) {
					// Error condition 2: a dependency has already failed activation
					this._host.showMessage(Severity.Error, nls.localize('failedDep1', "Extension `{1}` failed to activate. Reason: dependency `{0}` failed to activate.", depId, currentExtension.id));
					this._activatedExtensions[currentExtension.id] = this._host.createFailedExtension();
					return;
				}
			} else {
				// must first wait for the dependency to activate
				currentExtensionGetsGreenLight = false;
				greenExtensions[depId] = depDesc;
			}
		}

		if (currentExtensionGetsGreenLight) {
			greenExtensions[currentExtension.id] = currentExtension;
		} else {
			redExtensions.push(currentExtension);
		}
	}

	private _activateExtensions(extensionDescriptions: IExtensionDescription[], recursionLevel: number): TPromise<void> {
		// console.log(recursionLevel, '_activateExtensions: ', extensionDescriptions.map(p => p.id));
		if (extensionDescriptions.length === 0) {
			return TPromise.as(void 0);
		}

		extensionDescriptions = extensionDescriptions.filter((p) => !hasOwnProperty.call(this._activatedExtensions, p.id));
		if (extensionDescriptions.length === 0) {
			return TPromise.as(void 0);
		}

		if (recursionLevel > 10) {
			// More than 10 dependencies deep => most likely a dependency loop
			for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
				// Error condition 3: dependency loop
				this._host.showMessage(Severity.Error, nls.localize('failedDep2', "Extension `{0}` failed to activate. Reason: more than 10 levels of dependencies (most likely a dependency loop).", extensionDescriptions[i].id));
				this._activatedExtensions[extensionDescriptions[i].id] = this._host.createFailedExtension();
			}
			return TPromise.as(void 0);
		}

		let greenMap: { [id: string]: IExtensionDescription; } = Object.create(null),
			red: IExtensionDescription[] = [];

		for (let i = 0, len = extensionDescriptions.length; i < len; i++) {
			this._handleActivateRequest(extensionDescriptions[i], greenMap, red);
		}

		// Make sure no red is also green
		for (let i = 0, len = red.length; i < len; i++) {
			if (greenMap[red[i].id]) {
				delete greenMap[red[i].id];
			}
		}

		let green = Object.keys(greenMap).map(id => greenMap[id]);

		// console.log('greenExtensions: ', green.map(p => p.id));
		// console.log('redExtensions: ', red.map(p => p.id));

		if (red.length === 0) {
			// Finally reached only leafs!
			return TPromise.join(green.map((p) => this._activateExtension(p))).then(_ => void 0);
		}

		return this._activateExtensions(green, recursionLevel + 1).then(_ => {
			return this._activateExtensions(red, recursionLevel + 1);
		});
	}

	public _activateExtension(extensionDescription: IExtensionDescription): TPromise<void> {
		if (hasOwnProperty.call(this._activatedExtensions, extensionDescription.id)) {
			return TPromise.as(void 0);
		}

		if (hasOwnProperty.call(this._activatingExtensions, extensionDescription.id)) {
			return this._activatingExtensions[extensionDescription.id];
		}

		this._activatingExtensions[extensionDescription.id] = this._host.actualActivateExtension(extensionDescription).then(null, (err) => {
			this._host.showMessage(Severity.Error, nls.localize('activationError', "Activating extension `{0}` failed: {1}.", extensionDescription.id, err.message));
			console.error('Activating extension `' + extensionDescription.id + '` failed: ', err.message);
			console.log('Here is the error stack: ', err.stack);
			// Treat the extension as being empty
			return this._host.createFailedExtension();
		}).then((x: T) => {
			this._activatedExtensions[extensionDescription.id] = x;
			delete this._activatingExtensions[extensionDescription.id];
		});

		return this._activatingExtensions[extensionDescription.id];
	}
}

function loadCommonJSModule<T>(modulePath: string): TPromise<T> {
	let r: T = null;
	try {
		r = require.__$__nodeRequire<T>(modulePath);
	} catch (e) {
		return TPromise.wrapError<T>(e);
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
