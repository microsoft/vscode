/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { dispose } from 'vs/base/common/lifecycle';
import { join } from 'path';
import { mkdirp, dirExists } from 'vs/base/node/pfs';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';
import { ExtensionDescriptionRegistry } from "vs/workbench/services/extensions/node/extensionDescriptionRegistry";
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostStorage } from 'vs/workbench/api/node/extHostStorage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { createApiFactory, initializeExtensionApi } from 'vs/workbench/api/node/extHost.api.impl';
import { MainContext, MainThreadExtensionServiceShape, IWorkspaceData, IEnvironment, IInitData } from './extHost.protocol';
import { IExtensionMemento, ExtensionsActivator, ActivatedExtension, IExtensionAPI, IExtensionContext, EmptyExtension, IExtensionModule } from "vs/workbench/api/node/extHostExtensionActivator";
import { Barrier } from "vs/workbench/services/extensions/node/barrier";
import { ExtHostThreadService } from "vs/workbench/services/thread/node/extHostThreadService";

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

export class ExtHostExtensionService {

	private readonly _barrier: Barrier;
	private readonly _registry: ExtensionDescriptionRegistry;
	private readonly _threadService: ExtHostThreadService;
	private readonly _telemetryService: ITelemetryService;
	private readonly _storage: ExtHostStorage;
	private readonly _storagePath: ExtensionStoragePath;
	private readonly _proxy: MainThreadExtensionServiceShape;
	private _activator: ExtensionsActivator;

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(initData: IInitData, threadService: ExtHostThreadService, telemetryService: ITelemetryService) {
		this._barrier = new Barrier();
		this._registry = new ExtensionDescriptionRegistry(initData.extensions);
		this._threadService = threadService;
		this._telemetryService = telemetryService;
		this._storage = new ExtHostStorage(threadService);
		this._storagePath = new ExtensionStoragePath(initData.workspace, initData.environment);
		this._proxy = this._threadService.get(MainContext.MainThreadExtensionService);
		this._activator = null;

		// initialize API first (i.e. do not release barrier until the API is initialized)
		const apiFactory = createApiFactory(initData, threadService, this, this._telemetryService);

		initializeExtensionApi(this, apiFactory).then(() => {

			this._activator = new ExtensionsActivator(this._registry, {
				showMessage: (severity: Severity, message: string): void => {
					this._proxy.$localShowMessage(severity, message);

					switch (severity) {
						case Severity.Error:
							console.error(message);
							break;
						case Severity.Warning:
							console.warn(message);
							break;
						default:
							console.log(message);
					}
				},

				actualActivateExtension: (extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> => {
					return this._activateExtension(extensionDescription);
				}
			});

			this._barrier.open();
		});
	}

	public onExtensionAPIReady(): TPromise<boolean> {
		return this._barrier.wait();
	}

	public isActivated(extensionId: string): boolean {
		if (this._barrier.isOpen()) {
			return this._activator.isActivated(extensionId);
		}
		return false;
	}

	public activateByEvent(activationEvent: string): TPromise<void> {
		if (this._barrier.isOpen()) {
			return this._activator.activateByEvent(activationEvent);
		} else {
			return this._barrier.wait().then(() => this._activator.activateByEvent(activationEvent));
		}
	}

	public activateById(extensionId: string): TPromise<void> {
		if (this._barrier.isOpen()) {
			return this._activator.activateById(extensionId);
		} else {
			return this._barrier.wait().then(() => this._activator.activateById(extensionId));
		}
	}

	public getAllExtensionDescriptions(): IExtensionDescription[] {
		return this._registry.getAllExtensionDescriptions();
	}

	public getExtensionDescription(extensionId: string): IExtensionDescription {
		return this._registry.getExtensionDescription(extensionId);
	}

	public getExtensionExports(extensionId: string): IExtensionAPI {
		if (this._barrier.isOpen()) {
			return this._activator.getActivatedExtension(extensionId).exports;
		} else {
			return null;
		}
	}

	public deactivate(extensionId: string): TPromise<void> {
		let result: TPromise<void> = TPromise.as(void 0);

		if (!this._barrier.isOpen()) {
			return result;
		}

		if (!this._activator.isActivated(extensionId)) {
			return result;
		}

		let extension = this._activator.getActivatedExtension(extensionId);
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

	// --- impl

	private _activateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {
		return this._doActivateExtension(extensionDescription).then((activatedExtension) => {
			this._proxy.$onExtensionActivated(extensionDescription.id);
			return activatedExtension;
		}, (err) => {
			this._proxy.$onExtensionActivationFailed(extensionDescription.id);
			throw err;
		});
	}

	private _doActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {
		let event = getTelemetryActivationEvent(extensionDescription);
		this._telemetryService.publicLog('activatePlugin', event);
		if (!extensionDescription.main) {
			// Treat the extension as being empty => NOT AN ERROR CASE
			return TPromise.as(new EmptyExtension());
		}
		return TPromise.join<any>([
			loadCommonJSModule(extensionDescription.main),
			this._loadExtensionContext(extensionDescription)
		]).then(values => {
			return ExtHostExtensionService._callActivate(<IExtensionModule>values[0], <IExtensionContext>values[1]);
		}, (errors: any[]) => {
			// Avoid failing with an array of errors, fail with a single error
			if (errors[0]) {
				return TPromise.wrapError<ActivatedExtension>(errors[0]);
			}
			if (errors[1]) {
				return TPromise.wrapError<ActivatedExtension>(errors[1]);
			}
			return undefined;
		});
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

	private static _callActivate(extensionModule: IExtensionModule, context: IExtensionContext): TPromise<ActivatedExtension> {
		// Make sure the extension's surface is not undefined
		extensionModule = extensionModule || {
			activate: undefined,
			deactivate: undefined
		};

		return this._callActivateOptional(extensionModule, context).then((extensionExports) => {
			return new ActivatedExtension(false, extensionModule, extensionExports, context.subscriptions);
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
		return this.activateByEvent(activationEvent);
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
