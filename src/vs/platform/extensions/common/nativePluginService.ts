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
import {PluginHostStorage} from 'vs/platform/storage/common/remotable.storage';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService, Remotable} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

const hasOwnProperty = Object.hasOwnProperty;

export interface IPluginContext {
	subscriptions: IDisposable[];
	workspaceState: IPluginMemento;
	globalState: IPluginMemento;
	extensionPath: string;
	asAbsolutePath(relativePath: string): string;
}

export interface IPluginMemento {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: any): Thenable<boolean>;
}

class PluginMemento implements IPluginMemento {

	private _id: string;
	private _shared: boolean;
	private _storage: PluginHostStorage;

	private _init: TPromise<PluginMemento>;
	private _value: { [n: string]: any; };

	constructor(id: string, global: boolean, storage: PluginHostStorage) {
		this._id = id;
		this._shared = global;
		this._storage = storage;

		this._init = this._storage.getValue(this._shared, this._id, Object.create(null)).then(value => {
			this._value = value;
			return this;
		});
	}

	get whenReady(): TPromise<PluginMemento> {
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

/**
 * Represents a failed extension in the ext host.
 */
export class MainProcessFailedPlugin extends ActivatedExtension {
	constructor() {
		super(true);
	}
}

/**
 * Represents an extension that was successfully loaded or an
 * empty extension in the ext host.
 */
export class MainProcessSuccessPlugin extends ActivatedExtension {
	constructor() {
		super(false);
	}
}


@Remotable.MainContext('MainProcessPluginService')
export class MainProcessPluginService extends AbstractExtensionService<ActivatedExtension> {

	private _threadService: IThreadService;
	private _messageService: IMessageService;
	private _telemetryService: ITelemetryService;
	private _proxy: PluginHostPluginService;
	private _isDev: boolean;
	private _pluginsStatus: { [id: string]: IExtensionsStatus };

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
		this._isDev = !config.env.isBuilt || !!config.env.pluginDevelopmentPath;

		this._messageService = messageService;
		threadService.registerRemotableInstance(MainProcessPluginService, this);
		this._threadService = threadService;
		this._telemetryService = telemetryService;
		this._proxy = this._threadService.getRemotable(PluginHostPluginService);
		this._pluginsStatus = {};

		ExtensionsRegistry.handleExtensionPoints((severity, source, message) => {
			this.showMessage(severity, source, message);
		});
	}

	protected _createFailedExtension() {
		return new MainProcessFailedPlugin();
	}

	private getTelemetryActivationEvent(extensionDescription: IExtensionDescription): any {
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

	protected _showMessage(severity: Severity, msg: string): void {
		this._proxy.$doShowMessage(severity, msg);
		this.$doShowMessage(severity, msg);
	}

	public showMessage(severity: Severity, source: string, message: string) {
		super.showMessage(severity, source, message);
		if (!this._pluginsStatus[source]) {
			this._pluginsStatus[source] = { messages: [] };
		}
		this._pluginsStatus[source].messages.push({ type: severity, source, message });
	}

	public $doShowMessage(severity: Severity, msg: string): void {
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

	public getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		return this._pluginsStatus;
	}

	// -- overwriting AbstractPluginService

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {
		let event = this.getTelemetryActivationEvent(extensionDescription);
		this._telemetryService.publicLog('activatePlugin', event);
		// redirect plugin activation to the plugin host
		return this._proxy.$activatePluginInPluginHost(extensionDescription).then(_ => {
			// the plugin host calls $onPluginActivatedInPluginHost, where we write to `activatedPlugins`
			return this._activatedExtensions[extensionDescription.id];
		});
	}

	// -- called by plugin host

	public $onPluginHostReady(extensionDescriptions: IExtensionDescription[], messages: IMessage[]): void {
		ExtensionsRegistry.registerExtensions(extensionDescriptions);
		this.registrationDone(messages);
	}

	public $onPluginActivatedInPluginHost(extensionId: string): void {
		this._activatedExtensions[extensionId] = new MainProcessSuccessPlugin();
	}

	public $onPluginActivationFailedInPluginHost(extensionId: string): void {
		this._activatedExtensions[extensionId] = new MainProcessFailedPlugin();
	}
}

export interface IPluginModule {
	activate(ctx: IPluginContext): TPromise<IPluginExports>;
	deactivate(): void;
}

export interface IPluginExports {
	// _pluginExportsBrand: any;
}

export class ExtHostPlugin extends ActivatedExtension {

	module: IPluginModule;
	exports: IPluginExports;
	subscriptions: IDisposable[];

	constructor(activationFailed: boolean, module: IPluginModule, exports: IPluginExports, subscriptions: IDisposable[]) {
		super(activationFailed);
		this.module = module;
		this.exports = exports;
		this.subscriptions = subscriptions;
	}
}

export class EmptyPlugin extends ExtHostPlugin {
	constructor() {
		super(false, { activate: undefined, deactivate: undefined }, undefined, []);
	}
}

@Remotable.PluginHostContext('PluginHostPluginService')
export class PluginHostPluginService extends AbstractExtensionService<ExtHostPlugin> {

	private _threadService: IThreadService;
	private _storage: PluginHostStorage;
	private _proxy: MainProcessPluginService;

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(threadService: IThreadService) {
		super(true);
		threadService.registerRemotableInstance(PluginHostPluginService, this);
		this._threadService = threadService;
		this._storage = new PluginHostStorage(threadService);
		this._proxy = this._threadService.getRemotable(MainProcessPluginService);
	}

	protected _showMessage(severity: Severity, msg: string): void {
		this._proxy.$doShowMessage(severity, msg);
		this.$doShowMessage(severity, msg);
	}

	public $doShowMessage(severity: Severity, msg: string): void {
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

	public get(extensionId: string): IPluginExports {
		if (!hasOwnProperty.call(this._activatedExtensions, extensionId)) {
			throw new Error('Plugin `' + extensionId + '` is not known or not activated');
		}
		return this._activatedExtensions[extensionId].exports;
	}

	public deactivate(extensionId: string): void {
		let plugin = this._activatedExtensions[extensionId];
		if (!plugin) {
			return;
		}

		// call deactivate if available
		try {
			if (typeof plugin.module.deactivate === 'function') {
				plugin.module.deactivate();
			}
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}

		// clean up subscriptions
		try {
			disposeAll(plugin.subscriptions);
		} catch (err) {
			// TODO: Do something with err if this is not the shutdown case
		}
	}

	protected _createFailedExtension() {
		return new ExtHostPlugin(true, { activate: undefined, deactivate: undefined }, undefined, []);
	}

	// -- overwriting AbstractPluginService

	public registrationDone(messages: IMessage[]): void {
		super.registrationDone([]);
		this._proxy.$onPluginHostReady(ExtensionsRegistry.getAllExtensionDescriptions(), messages);
	}

	protected _loadPluginModule(extensionDescription: IExtensionDescription): TPromise<IPluginModule> {
		return loadCommonJSModule(extensionDescription.main);
	}

	protected _loadPluginContext(extensionDescription: IExtensionDescription): TPromise<IPluginContext> {

		let globalState = new PluginMemento(extensionDescription.id, true, this._storage);
		let workspaceState = new PluginMemento(extensionDescription.id, false, this._storage);

		return TPromise.join([globalState.whenReady, workspaceState.whenReady]).then(() => {
			return Object.freeze(<IPluginContext>{
				globalState,
				workspaceState,
				subscriptions: [],
				get extensionPath() { return extensionDescription.extensionFolderPath; },
				asAbsolutePath: (relativePath: string) => { return paths.normalize(paths.join(extensionDescription.extensionFolderPath, relativePath), true); }
			});
		});
	}

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {

		return this._superActualActivatePlugin(extensionDescription).then((activatedPlugin) => {
			this._proxy.$onPluginActivatedInPluginHost(extensionDescription.id);
			return activatedPlugin;
		}, (err) => {
			this._proxy.$onPluginActivationFailedInPluginHost(extensionDescription.id);
			throw err;
		});
	}

	private _superActualActivatePlugin(extensionDescription: IExtensionDescription): TPromise<ExtHostPlugin> {

		if (!extensionDescription.main) {
			// Treat the plugin as being empty => NOT AN ERROR CASE
			return TPromise.as(new EmptyPlugin());
		}
		return this._loadPluginModule(extensionDescription).then((pluginModule) => {
			return this._loadPluginContext(extensionDescription).then(context => {
				return PluginHostPluginService._callActivate(pluginModule, context);
			});
		});
	}

	private static _callActivate(pluginModule: IPluginModule, context: IPluginContext): TPromise<ExtHostPlugin> {
		// Make sure the plugin's surface is not undefined
		pluginModule = pluginModule || {
			activate: undefined,
			deactivate: undefined
		};

		// let subscriptions:IDisposable[] = [];
		return this._callActivateOptional(pluginModule, context).then((pluginExports) => {
			return new ExtHostPlugin(false, pluginModule, pluginExports, context.subscriptions);
		});
	}

	private static _callActivateOptional(pluginModule: IPluginModule, context: IPluginContext): TPromise<IPluginExports> {
		if (typeof pluginModule.activate === 'function') {
			try {
				return TPromise.as(pluginModule.activate.apply(global, [context]));
			} catch (err) {
				return TPromise.wrapError(err);
			}
		} else {
			// No activate found => the module is the plugin's exports
			return TPromise.as<IPluginExports>(pluginModule);
		}
	}

	// -- called by main thread

	public $activatePluginInPluginHost(extensionDescription: IExtensionDescription): TPromise<void> {
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
