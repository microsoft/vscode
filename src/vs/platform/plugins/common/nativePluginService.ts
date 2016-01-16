/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IPluginDescription, IMessage, IPluginStatus} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import WinJS = require('vs/base/common/winjs.base');
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {ActivatedPlugin, AbstractPluginService, IPluginModule, IPluginContext, IPluginMemento, loadAMDModule} from 'vs/platform/plugins/common/abstractPluginService';
import Severity from 'vs/base/common/severity';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {PluginHostStorage} from 'vs/platform/storage/common/remotable.storage';
import * as paths from 'vs/base/common/paths';
import {IWorkspaceContextService, IConfiguration} from 'vs/platform/workspace/common/workspace';
import {disposeAll} from 'vs/base/common/lifecycle';

class PluginMemento implements IPluginMemento {

	private _id: string;
	private _shared: boolean;
	private _storage: PluginHostStorage;

	private _init:WinJS.TPromise<PluginMemento>
	private _value: { [n: string]: any;}

	constructor(id: string, global:boolean, storage: PluginHostStorage) {
		this._id = id;
		this._shared = global;
		this._storage = storage;

		this._init = this._storage.getValue(this._shared, this._id, Object.create(null)).then(value => {
			this._value = value;
			return this;
		});
	}

	get whenReady(): WinJS.TPromise<PluginMemento> {
		return this._init;
	}

	get<T>(key: string, defaultValue: T): T {
		let value = this._value[key]
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

@Remotable.MainContext('MainProcessPluginService')
export class MainProcessPluginService extends AbstractPluginService {

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
		messageService:IMessageService,
		telemetryService:ITelemetryService
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

	private getTelemetryActivationEvent(pluginDescription: IPluginDescription): any {
		var event = {
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
					let types = contributionDetails.reduce((p,c)=> p ? p + ',' + c['type']: c['type'], '');
					event['contribution.debuggers'] = types;
					break;
				case 'grammars':
					let grammers = contributionDetails.reduce((p,c)=> p ? p + ',' + c['language']: c['language'], '');
					event['contribution.grammars'] = grammers;
					break;
				case 'languages':
					let languages = contributionDetails.reduce((p,c)=> p ? p + ',' + c['id']: c['id'], '');
					event['contribution.languages'] = languages;
					break;
				case 'tmSnippets':
					let tmSnippets = contributionDetails.reduce((p,c)=> p ? p + ',' + c['languageId']: c['languageId'], '');
					event['contribution.tmSnippets'] = tmSnippets;
					break;
				default:
					event[`contribution.${contribution}`] = true;
			}
		}

		return event;
	}

	protected _showMessage(severity:Severity, msg:string): void {
		this._proxy.$doShowMessage(severity, msg);
		this.$doShowMessage(severity, msg);
	}

	public showMessage(severity:Severity, source: string, message:string) {
		super.showMessage(severity, source, message);
		if (!this._pluginsStatus[source]) {
			this._pluginsStatus[source] = { messages: [] };
		}
		this._pluginsStatus[source].messages.push({ type: severity, source, message });
	}

	public $doShowMessage(severity:Severity, msg:string): void {
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

	public deactivate(pluginId:string): void {
		this._proxy.deactivate(pluginId);
	}

	// -- overwriting AbstractPluginService

	protected _actualActivatePlugin(pluginDescription: IPluginDescription): WinJS.TPromise<ActivatedPlugin> {
		let event = this.getTelemetryActivationEvent(pluginDescription);
		this._telemetryService.publicLog('activatePlugin', event);
		// redirect plugin activation to the plugin host
		return this._proxy.$activatePluginInPluginHost(pluginDescription).then(_ => {
			// the plugin host calls $onPluginActivatedInPluginHost, where we write to `activatedPlugins`
			return this.activatedPlugins[pluginDescription.id];
		});
	}

	// -- called by plugin host

	public $onPluginHostReady(pluginDescriptions: IPluginDescription[], messages:IMessage[]): void {
		PluginsRegistry.registerPlugins(pluginDescriptions);
		this.registrationDone(messages);
	}

	public $onPluginActivatedInPluginHost(pluginId:string, pluginExports:any): void {
		this.activatedPlugins[pluginId] = new ActivatedPlugin(false, { activate: undefined, deactivate: undefined}, pluginExports, []);
	}

	public $onPluginActivationFailedInPluginHost(pluginId:string, err:any): void {
		this.activatedPlugins[pluginId] = new ActivatedPlugin(true, { activate: undefined, deactivate: undefined}, {}, []);
	}
}

@Remotable.PluginHostContext('PluginHostPluginService')
export class PluginHostPluginService extends AbstractPluginService {

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

	protected _showMessage(severity:Severity, msg:string): void {
		this._proxy.$doShowMessage(severity, msg);
		this.$doShowMessage(severity, msg);
	}

	public $doShowMessage(severity:Severity, msg:string): void {
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

	public deactivate(pluginId:string): void {
		let plugin = this.activatedPlugins[pluginId];
		if (!plugin) {
			return;
		}

		// call deactivate if available
		try {
			if (typeof plugin.module.deactivate === 'function') {
				plugin.module.deactivate();
			}
		} catch(err) {
			// TODO: Do something with err if this is not the shutdown case
		}

		// clean up subscriptions
		try {
			disposeAll(plugin.subscriptions)
		} catch(err) {
			// TODO: Do something with err if this is not the shutdown case
		}
	}

	// -- overwriting AbstractPluginService

	public registrationDone(messages:IMessage[]): void {
		super.registrationDone([]);
		this._proxy.$onPluginHostReady(PluginsRegistry.getAllPluginDescriptions(), messages);
	}

	protected _loadPluginModule(pluginDescription: IPluginDescription): WinJS.TPromise<IPluginModule> {
		if (pluginDescription.isAMD) {
			return loadAMDModule(uriFromPath(pluginDescription.main));
		}

		return loadCommonJSModule(pluginDescription.main);
	}

	protected _loadPluginContext(pluginDescription: IPluginDescription): WinJS.TPromise<IPluginContext> {

		let globalState = new PluginMemento(pluginDescription.id, true, this._storage);
		let workspaceState = new PluginMemento(pluginDescription.id, false, this._storage);

		return WinJS.TPromise.join([globalState.whenReady, workspaceState.whenReady]).then(() => {
			return Object.freeze(<IPluginContext>{
				globalState,
				workspaceState,
				subscriptions: [],
				get extensionPath() { return pluginDescription.extensionFolderPath },
				asAbsolutePath: (relativePath:string) => { return paths.normalize(paths.join(pluginDescription.extensionFolderPath, relativePath), true); }
			});
		});
	}

	protected _actualActivatePlugin(pluginDescription: IPluginDescription): WinJS.TPromise<ActivatedPlugin> {

		return super._actualActivatePlugin(pluginDescription).then((activatedPlugin) => {
			let proxyObj = this._threadService.createDynamicProxyFromMethods(activatedPlugin.exports);
			activatedPlugin.subscriptions.push(proxyObj);
			this._proxy.$onPluginActivatedInPluginHost(pluginDescription.id, proxyObj.getProxyDefinition());
			return activatedPlugin;
		}, (err) => {
			this._proxy.$onPluginActivationFailedInPluginHost(pluginDescription.id, err);
			throw err;
		});
	}

	// -- called by main thread

	public $activatePluginInPluginHost(pluginDescription: IPluginDescription): WinJS.TPromise<void> {
		return this._activatePlugin(pluginDescription).then(() => {
			return null;
		});
	}

}

function loadCommonJSModule<T>(modulePath: string): WinJS.TPromise<T> {
	var r: T = null;
	try {
		r = require.__$__nodeRequire<T>(modulePath);
	} catch(e) {
		return WinJS.TPromise.wrapError(e);
	}
	return WinJS.TPromise.as(r);
}


// TODO@Alex: Duplicated in:
// * src\bootstrap.js
// * src\vs\workbench\electron-main\bootstrap.js
// * src\vs\platform\plugins\common\nativePluginService.ts
function uriFromPath(_path) {
	var pathName = _path.replace(/\\/g, '/');

	if (pathName.length > 0 && pathName.charAt(0) !== '/') {
		pathName = '/' + pathName;
	}

	return encodeURI('file://' + pathName);
}