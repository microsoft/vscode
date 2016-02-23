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
import {IMessageService} from 'vs/platform/message/common/message';
import {AbstractPluginService, ActivatedPlugin, IPluginContext, IPluginMemento, loadAMDModule} from 'vs/platform/plugins/common/abstractPluginService';
import {IMessage, IPluginDescription, IPluginStatus} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import {PluginHostStorage} from 'vs/platform/storage/common/remotable.storage';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService, Remotable} from 'vs/platform/thread/common/thread';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

const hasOwnProperty = Object.hasOwnProperty;

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
export class MainProcessFailedPlugin extends ActivatedPlugin {
	constructor() {
		super(true);
	}
}

/**
 * Represents an extension that was successfully loaded or an
 * empty extension in the ext host.
 */
export class MainProcessSuccessPlugin extends ActivatedPlugin {
	constructor() {
		super(false);
	}
}


@Remotable.MainContext('MainProcessPluginService')
export class MainProcessPluginService extends AbstractPluginService<ActivatedPlugin> {

	private _threadService: IThreadService;
	private _messageService: IMessageService;
	private _telemetryService: ITelemetryService;
	private _proxy: PluginHostPluginService;
	private _isDev: boolean;
	private _pluginsStatus: { [id: string]: IPluginStatus };

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(
		contextService: IWorkspaceContextService,
		threadService: IThreadService,
		messageService: IMessageService,
		telemetryService: ITelemetryService
	) {
		let config = contextService.getConfiguration();
		this._isDev = !config.env.isBuilt || !!config.env.pluginDevelopmentPath;

		this._messageService = messageService;
		threadService.registerRemotableInstance(MainProcessPluginService, this);
		super(false);
		this._threadService = threadService;
		this._telemetryService = telemetryService;
		this._proxy = this._threadService.getRemotable(PluginHostPluginService);
		this._pluginsStatus = {};

		PluginsRegistry.handleExtensionPoints((severity, source, message) => {
			this.showMessage(severity, source, message);
		});
	}

	protected _createFailedPlugin() {
		return new MainProcessFailedPlugin();
	}

	private getTelemetryActivationEvent(pluginDescription: IPluginDescription): any {
		let event = {
			id: pluginDescription.id,
			name: pluginDescription.name,
			publisherDisplayName: pluginDescription.publisher,
			activationEvents: pluginDescription.activationEvents ? pluginDescription.activationEvents.join(',') : null
		};

		for (let contribution in pluginDescription.contributes) {
			let contributionDetails = pluginDescription.contributes[contribution];

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

	public getPluginsStatus(): { [id: string]: IPluginStatus } {
		return this._pluginsStatus;
	}

	public deactivate(pluginId: string): void {
		this._proxy.deactivate(pluginId);
	}

	// -- overwriting AbstractPluginService

	protected _actualActivatePlugin(pluginDescription: IPluginDescription): TPromise<ActivatedPlugin> {
		let event = this.getTelemetryActivationEvent(pluginDescription);
		this._telemetryService.publicLog('activatePlugin', event);
		// redirect plugin activation to the plugin host
		return this._proxy.$activatePluginInPluginHost(pluginDescription).then(_ => {
			// the plugin host calls $onPluginActivatedInPluginHost, where we write to `activatedPlugins`
			return this.activatedPlugins[pluginDescription.id];
		});
	}

	// -- called by plugin host

	public $onPluginHostReady(pluginDescriptions: IPluginDescription[], messages: IMessage[]): void {
		PluginsRegistry.registerPlugins(pluginDescriptions);
		this.registrationDone(messages);
	}

	public $onPluginActivatedInPluginHost(pluginId: string): void {
		this.activatedPlugins[pluginId] = new MainProcessSuccessPlugin();
	}

	public $onPluginActivationFailedInPluginHost(pluginId: string): void {
		this.activatedPlugins[pluginId] = new MainProcessFailedPlugin();
	}
}

export interface IPluginModule {
	activate(ctx: IPluginContext): TPromise<IPluginExports>;
	deactivate(): void;
}

export interface IPluginExports {
	// _pluginExportsBrand: any;
}

export class ExtHostPlugin extends ActivatedPlugin {

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
export class PluginHostPluginService extends AbstractPluginService<ExtHostPlugin> {

	private _threadService: IThreadService;
	private _storage: PluginHostStorage;
	private _proxy: MainProcessPluginService;

	/**
	 * This class is constructed manually because it is a service, so it doesn't use any ctor injection
	 */
	constructor(threadService: IThreadService) {
		threadService.registerRemotableInstance(PluginHostPluginService, this);
		super(true);
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

	public get(pluginId: string): IPluginExports {
		if (!hasOwnProperty.call(this.activatedPlugins, pluginId)) {
			throw new Error('Plugin `' + pluginId + '` is not known or not activated');
		}
		return this.activatedPlugins[pluginId].exports;
	}

	public deactivate(pluginId: string): void {
		let plugin = this.activatedPlugins[pluginId];
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

	protected _createFailedPlugin() {
		return new ExtHostPlugin(true, { activate: undefined, deactivate: undefined }, undefined, []);
	}

	// -- overwriting AbstractPluginService

	public registrationDone(messages: IMessage[]): void {
		super.registrationDone([]);
		this._proxy.$onPluginHostReady(PluginsRegistry.getAllPluginDescriptions(), messages);
	}

	protected _loadPluginModule(pluginDescription: IPluginDescription): TPromise<IPluginModule> {
		if (pluginDescription.isAMD) {
			return loadAMDModule(uriFromPath(pluginDescription.main));
		}

		return loadCommonJSModule(pluginDescription.main);
	}

	protected _loadPluginContext(pluginDescription: IPluginDescription): TPromise<IPluginContext> {

		let globalState = new PluginMemento(pluginDescription.id, true, this._storage);
		let workspaceState = new PluginMemento(pluginDescription.id, false, this._storage);

		return TPromise.join([globalState.whenReady, workspaceState.whenReady]).then(() => {
			return Object.freeze(<IPluginContext>{
				globalState,
				workspaceState,
				subscriptions: [],
				get extensionPath() { return pluginDescription.extensionFolderPath; },
				asAbsolutePath: (relativePath: string) => { return paths.normalize(paths.join(pluginDescription.extensionFolderPath, relativePath), true); }
			});
		});
	}

	protected _actualActivatePlugin(pluginDescription: IPluginDescription): TPromise<ActivatedPlugin> {

		return this._superActualActivatePlugin(pluginDescription).then((activatedPlugin) => {
			this._proxy.$onPluginActivatedInPluginHost(pluginDescription.id);
			return activatedPlugin;
		}, (err) => {
			this._proxy.$onPluginActivationFailedInPluginHost(pluginDescription.id);
			throw err;
		});
	}

	private _superActualActivatePlugin(pluginDescription: IPluginDescription): TPromise<ExtHostPlugin> {

		if (!pluginDescription.main) {
			// Treat the plugin as being empty => NOT AN ERROR CASE
			return TPromise.as(new EmptyPlugin());
		}
		return this._loadPluginModule(pluginDescription).then((pluginModule) => {
			return this._loadPluginContext(pluginDescription).then(context => {
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

	public $activatePluginInPluginHost(pluginDescription: IPluginDescription): TPromise<void> {
		return this._activatePlugin(pluginDescription);
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


// TODO@Alex: Duplicated in:
// * src\bootstrap.js
// * src\vs\workbench\electron-main\bootstrap.js
// * src\vs\platform\plugins\common\nativePluginService.ts
function uriFromPath(_path) {
	let pathName = _path.replace(/\\/g, '/');

	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}