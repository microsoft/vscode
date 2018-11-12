/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import { Barrier } from 'vs/base/common/async';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TernarySearchTree } from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { dirExists, mkdirp, realpath, writeFile } from 'vs/base/node/pfs';
import { ILogService } from 'vs/platform/log/common/log';
import { createApiFactory, initializeExtensionApi } from 'vs/workbench/api/node/extHost.api.impl';
import { ExtHostExtensionServiceShape, IEnvironment, IInitData, IMainContext, IWorkspaceData, MainContext, MainThreadExtensionServiceShape, MainThreadTelemetryShape } from 'vs/workbench/api/node/extHost.protocol';
import { ExtHostConfiguration } from 'vs/workbench/api/node/extHostConfiguration';
import { ActivatedExtension, EmptyExtension, ExtensionActivatedByAPI, ExtensionActivatedByEvent, ExtensionActivationReason, ExtensionActivationTimes, ExtensionActivationTimesBuilder, ExtensionsActivator, IExtensionAPI, IExtensionContext, IExtensionMemento, IExtensionModule } from 'vs/workbench/api/node/extHostExtensionActivator';
import { ExtHostLogService } from 'vs/workbench/api/node/extHostLogService';
import { ExtHostStorage } from 'vs/workbench/api/node/extHostStorage';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/node/extensionDescriptionRegistry';
import { connectProxyResolver } from 'vs/workbench/node/proxyResolver';

class ExtensionMemento implements IExtensionMemento {

	private readonly _id: string;
	private readonly _shared: boolean;
	private readonly _storage: ExtHostStorage;

	private readonly _init: Thenable<ExtensionMemento>;
	private _value: { [n: string]: any; };
	private readonly _storageListener: IDisposable;

	constructor(id: string, global: boolean, storage: ExtHostStorage) {
		this._id = id;
		this._shared = global;
		this._storage = storage;

		this._init = this._storage.getValue(this._shared, this._id, Object.create(null)).then(value => {
			this._value = value;
			return this;
		});

		this._storageListener = this._storage.onDidChangeStorage(e => {
			if (e.shared === this._shared && e.key === this._id) {
				this._value = e.value;
			}
		});
	}

	get whenReady(): Thenable<ExtensionMemento> {
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

	dispose(): void {
		this._storageListener.dispose();
	}
}

class ExtensionStoragePath {

	private readonly _workspace: IWorkspaceData;
	private readonly _environment: IEnvironment;

	private readonly _ready: Promise<string>;
	private _value: string;

	constructor(workspace: IWorkspaceData, environment: IEnvironment) {
		this._workspace = workspace;
		this._environment = environment;
		this._ready = this._getOrCreateWorkspaceStoragePath().then(value => this._value = value);
	}

	get whenReady(): Promise<any> {
		return this._ready;
	}

	value(extension: IExtensionDescription): string {
		if (this._value) {
			return join(this._value, extension.id);
		}
		return undefined;
	}

	private async _getOrCreateWorkspaceStoragePath(): Promise<string> {
		if (!this._workspace) {
			return Promise.resolve(undefined);
		}

		const storageName = this._workspace.id;
		const storagePath = join(this._environment.appSettingsHome.fsPath, 'workspaceStorage', storageName);

		const exists = await dirExists(storagePath);

		if (exists) {
			return storagePath;
		}

		try {
			await mkdirp(storagePath);
			await writeFile(
				join(storagePath, 'meta.json'),
				JSON.stringify({
					id: this._workspace.id,
					configuration: this._workspace.configuration && URI.revive(this._workspace.configuration).toString(),
					name: this._workspace.name
				}, undefined, 2)
			);
			return storagePath;

		} catch (e) {
			console.error(e);
			return undefined;
		}
	}
}
export class ExtHostExtensionService implements ExtHostExtensionServiceShape {

	private readonly _barrier: Barrier;
	private readonly _registry: ExtensionDescriptionRegistry;
	private readonly _mainThreadTelemetry: MainThreadTelemetryShape;
	private readonly _storage: ExtHostStorage;
	private readonly _storagePath: ExtensionStoragePath;
	private readonly _proxy: MainThreadExtensionServiceShape;
	private readonly _extHostLogService: ExtHostLogService;
	private _activator: ExtensionsActivator;
	private _extensionPathIndex: Promise<TernarySearchTree<IExtensionDescription>>;
	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(initData: IInitData,
		extHostContext: IMainContext,
		extHostWorkspace: ExtHostWorkspace,
		extHostConfiguration: ExtHostConfiguration,
		extHostLogService: ExtHostLogService,
		mainThreadTelemetry: MainThreadTelemetryShape
	) {
		this._barrier = new Barrier();
		this._registry = new ExtensionDescriptionRegistry(initData.extensions);
		this._extHostLogService = extHostLogService;
		this._mainThreadTelemetry = mainThreadTelemetry;
		this._storage = new ExtHostStorage(extHostContext);
		this._storagePath = new ExtensionStoragePath(initData.workspace, initData.environment);
		this._proxy = extHostContext.getProxy(MainContext.MainThreadExtensionService);
		this._activator = null;

		// initialize API first (i.e. do not release barrier until the API is initialized)
		const apiFactory = createApiFactory(initData, extHostContext, extHostWorkspace, extHostConfiguration, this, this._extHostLogService, this._storage);

		initializeExtensionApi(this, apiFactory).then(() => {
			// Do this when extension service exists, but extensions are not being activated yet.
			return connectProxyResolver(extHostWorkspace, extHostConfiguration, this, this._extHostLogService, this._mainThreadTelemetry);
		}).then(() => {

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

				actualActivateExtension: (extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension> => {
					return this._activateExtension(extensionDescription, reason);
				}
			});

			this._barrier.open();
		});
	}

	public onExtensionAPIReady(): Thenable<boolean> {
		return this._barrier.wait();
	}

	public isActivated(extensionId: string): boolean {
		if (this._barrier.isOpen()) {
			return this._activator.isActivated(extensionId);
		}
		return false;
	}

	public activateByEvent(activationEvent: string, startup: boolean): Thenable<void> {
		const reason = new ExtensionActivatedByEvent(startup, activationEvent);
		if (this._barrier.isOpen()) {
			return this._activator.activateByEvent(activationEvent, reason);
		} else {
			return this._barrier.wait().then(() => this._activator.activateByEvent(activationEvent, reason));
		}
	}

	public activateById(extensionId: string, reason: ExtensionActivationReason): Thenable<void> {
		if (this._barrier.isOpen()) {
			return this._activator.activateById(extensionId, reason);
		} else {
			return this._barrier.wait().then(() => this._activator.activateById(extensionId, reason));
		}
	}

	public activateByIdWithErrors(extensionId: string, reason: ExtensionActivationReason): Thenable<void> {
		return this.activateById(extensionId, reason).then(() => {
			const extension = this._activator.getActivatedExtension(extensionId);
			if (extension.activationFailed) {
				// activation failed => bubble up the error as the promise result
				return Promise.reject(extension.activationFailedError);
			}
			return void 0;
		});
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

	// create trie to enable fast 'filename -> extension id' look up
	public getExtensionPathIndex(): Promise<TernarySearchTree<IExtensionDescription>> {
		if (!this._extensionPathIndex) {
			const tree = TernarySearchTree.forPaths<IExtensionDescription>();
			const extensions = this.getAllExtensionDescriptions().map(ext => {
				if (!ext.main) {
					return undefined;
				}
				return realpath(ext.extensionLocation.fsPath).then(value => tree.set(URI.file(value).fsPath, ext));
			});
			this._extensionPathIndex = Promise.all(extensions).then(() => tree);
		}
		return this._extensionPathIndex;
	}


	public deactivate(extensionId: string): Thenable<void> {
		let result = Promise.resolve(void 0);

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
				result = Promise.resolve(extension.module.deactivate()).then(null, (err) => {
					// TODO: Do something with err if this is not the shutdown case
					return Promise.resolve(void 0);
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

	public addMessage(extensionId: string, severity: Severity, message: string): void {
		this._proxy.$addMessage(extensionId, severity, message);
	}

	// --- impl

	private _activateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension> {
		return this._doActivateExtension(extensionDescription, reason).then((activatedExtension) => {
			const activationTimes = activatedExtension.activationTimes;
			let activationEvent = (reason instanceof ExtensionActivatedByEvent ? reason.activationEvent : null);
			this._proxy.$onExtensionActivated(extensionDescription.id, activationTimes.startup, activationTimes.codeLoadingTime, activationTimes.activateCallTime, activationTimes.activateResolvedTime, activationEvent);
			return activatedExtension;
		}, (err) => {
			this._proxy.$onExtensionActivationFailed(extensionDescription.id);
			throw err;
		});
	}

	private _doActivateExtension(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): Promise<ActivatedExtension> {
		let event = getTelemetryActivationEvent(extensionDescription, reason);
		/* __GDPR__
			"activatePlugin" : {
				"${include}": [
					"${TelemetryActivationEvent}"
				]
			}
		*/
		this._mainThreadTelemetry.$publicLog('activatePlugin', event);
		if (!extensionDescription.main) {
			// Treat the extension as being empty => NOT AN ERROR CASE
			return Promise.resolve(new EmptyExtension(ExtensionActivationTimes.NONE));
		}

		this._extHostLogService.info(`ExtensionService#_doActivateExtension ${extensionDescription.id} ${JSON.stringify(reason)}`);

		const activationTimesBuilder = new ExtensionActivationTimesBuilder(reason.startup);
		return Promise.all<any>([
			loadCommonJSModule(this._extHostLogService, extensionDescription.main, activationTimesBuilder),
			this._loadExtensionContext(extensionDescription)
		]).then(values => {
			return ExtHostExtensionService._callActivate(this._extHostLogService, extensionDescription.id, <IExtensionModule>values[0], <IExtensionContext>values[1], activationTimesBuilder);
		});
	}

	private _loadExtensionContext(extensionDescription: IExtensionDescription): Promise<IExtensionContext> {

		let globalState = new ExtensionMemento(extensionDescription.id, true, this._storage);
		let workspaceState = new ExtensionMemento(extensionDescription.id, false, this._storage);

		this._extHostLogService.trace(`ExtensionService#loadExtensionContext ${extensionDescription.id}`);
		return Promise.all([
			globalState.whenReady,
			workspaceState.whenReady,
			this._storagePath.whenReady
		]).then(() => {
			const that = this;
			return Object.freeze(<IExtensionContext>{
				globalState,
				workspaceState,
				subscriptions: [],
				get extensionPath() { return extensionDescription.extensionLocation.fsPath; },
				storagePath: this._storagePath.value(extensionDescription),
				asAbsolutePath: (relativePath: string) => { return join(extensionDescription.extensionLocation.fsPath, relativePath); },
				logPath: that._extHostLogService.getLogDirectory(extensionDescription.id)
			});
		});
	}

	private static _callActivate(logService: ILogService, extensionId: string, extensionModule: IExtensionModule, context: IExtensionContext, activationTimesBuilder: ExtensionActivationTimesBuilder): Thenable<ActivatedExtension> {
		// Make sure the extension's surface is not undefined
		extensionModule = extensionModule || {
			activate: undefined,
			deactivate: undefined
		};

		return this._callActivateOptional(logService, extensionId, extensionModule, context, activationTimesBuilder).then((extensionExports) => {
			return new ActivatedExtension(false, null, activationTimesBuilder.build(), extensionModule, extensionExports, context.subscriptions);
		});
	}

	private static _callActivateOptional(logService: ILogService, extensionId: string, extensionModule: IExtensionModule, context: IExtensionContext, activationTimesBuilder: ExtensionActivationTimesBuilder): Thenable<IExtensionAPI> {
		if (typeof extensionModule.activate === 'function') {
			try {
				activationTimesBuilder.activateCallStart();
				logService.trace(`ExtensionService#_callActivateOptional ${extensionId}`);
				const activateResult: Thenable<IExtensionAPI> = extensionModule.activate.apply(global, [context]);
				activationTimesBuilder.activateCallStop();

				activationTimesBuilder.activateResolveStart();
				return Promise.resolve(activateResult).then((value) => {
					activationTimesBuilder.activateResolveStop();
					return value;
				});
			} catch (err) {
				return Promise.reject(err);
			}
		} else {
			// No activate found => the module is the extension's exports
			return Promise.resolve<IExtensionAPI>(extensionModule);
		}
	}

	// -- called by main thread

	public $activateByEvent(activationEvent: string): Thenable<void> {
		return this.activateByEvent(activationEvent, false);
	}
}

function loadCommonJSModule<T>(logService: ILogService, modulePath: string, activationTimesBuilder: ExtensionActivationTimesBuilder): Promise<T> {
	let r: T | null = null;
	activationTimesBuilder.codeLoadingStart();
	logService.info(`ExtensionService#loadCommonJSModule ${modulePath}`);
	try {
		r = require.__$__nodeRequire<T>(modulePath);
	} catch (e) {
		return Promise.reject(e);
	} finally {
		activationTimesBuilder.codeLoadingStop();
	}
	return Promise.resolve(r);
}

function getTelemetryActivationEvent(extensionDescription: IExtensionDescription, reason: ExtensionActivationReason): any {
	const reasonStr = reason instanceof ExtensionActivatedByEvent ? reason.activationEvent :
		reason instanceof ExtensionActivatedByAPI ? 'api' :
			'';

	/* __GDPR__FRAGMENT__
		"TelemetryActivationEvent" : {
			"id": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
			"name": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
			"publisherDisplayName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"activationEvents": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"isBuiltin": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"reason": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		}
	*/
	let event = {
		id: extensionDescription.id,
		name: extensionDescription.name,
		publisherDisplayName: extensionDescription.publisher,
		activationEvents: extensionDescription.activationEvents ? extensionDescription.activationEvents.join(',') : null,
		isBuiltin: extensionDescription.isBuiltin,
		reason: reasonStr
	};

	return event;
}
