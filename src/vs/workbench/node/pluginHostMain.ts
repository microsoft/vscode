/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');

import 'vs/base/common/async';
import 'vs/base/node/stdFork';
import 'vs/languages/lib/common/wireProtocol';

import pfs = require('vs/base/node/pfs');

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import paths = require('vs/base/common/paths');
import {IPluginService, IPluginDescription} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry, PluginsMessageCollector, IPluginsMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import {ExtHostAPIImplementation} from 'vs/workbench/api/node/extHost.api.impl';
import {IPluginsIPC} from 'vs/platform/plugins/common/ipcRemoteCom';
import {ExtHostModelService} from 'vs/workbench/api/node/extHostDocuments';
import {IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import InstantiationService = require('vs/platform/instantiation/common/instantiationService');
import {PluginHostPluginService} from 'vs/platform/plugins/common/nativePluginService';
import {PluginHostThreadService} from 'vs/platform/thread/common/pluginHostThreadService';
import {ExtHostTelemetryService} from 'vs/workbench/api/node/extHostTelemetry';
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {ModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {PluginScanner} from 'vs/workbench/node/extensionPoints';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Client } from 'vs/base/node/service.net';
import { IExtensionsService } from 'vs/workbench/parts/extensions/common/extensions';
import { ExtensionsService } from 'vs/workbench/parts/extensions/node/extensionsService';

const DIRNAME = URI.parse(require.toUrl('./')).fsPath;
const BASE_PATH = paths.normalize(paths.join(DIRNAME, '../../../..'));
const BUILTIN_PLUGINS_PATH = paths.join(BASE_PATH, 'extensions');

export interface IInitData {
	threadService: any;
	contextService: {
		workspace: any;
		configuration: any;
		options: any;
	};
}

const nativeExit = process.exit.bind(process);
process.exit = function() {
	const err = new Error('An extension called process.exit() and this was prevented.');
	console.warn((<any>err).stack);
};
export function exit(code?: number) {
	nativeExit(code);
}

export function createServices(remoteCom: IPluginsIPC, initData: IInitData, sharedProcessClient: Client): IInstantiationService {

	let contextService = new BaseWorkspaceContextService(initData.contextService.workspace, initData.contextService.configuration, initData.contextService.options);
	let threadService = new PluginHostThreadService(remoteCom);
	threadService.setInstantiationService(InstantiationService.createInstantiationService({ threadService: threadService }));
	let telemetryService = new ExtHostTelemetryService(threadService);
	let requestService = new BaseRequestService(contextService, telemetryService);
	let modelService = threadService.getRemotable(ExtHostModelService);

	let pluginService = new PluginHostPluginService(threadService);
	let modeService = new ModeServiceImpl(threadService, pluginService);
	let _services: any = {
		contextService: contextService,
		requestService: requestService,
		modelService: modelService,
		threadService: threadService,
		modeService: modeService,
		pluginService: pluginService,
		telemetryService: telemetryService
	};
	let instantiationService = InstantiationService.createInstantiationService(_services);
	threadService.setInstantiationService(instantiationService);

	// Create the monaco API
	instantiationService.createInstance(ExtHostAPIImplementation);

	// Connect to shared process services
	instantiationService.addSingleton(IExtensionsService, sharedProcessClient.getService<IExtensionsService>('ExtensionService', ExtensionsService));

	return instantiationService;
}

interface ITestRunner {
	run(testsRoot: string, clb: (error: Error, failures?: number) => void): void;
}

export class PluginHostMain {

	private _isTerminating: boolean;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IPluginService private pluginService: IPluginService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._isTerminating = false;
	}

	public start(): TPromise<void> {
		return this.readPlugins();
	}

	public terminate(): void {
		if (this._isTerminating) {
			// we are already shutting down...
			return;
		}
		this._isTerminating = true;

		try {
			let allExtensions = PluginsRegistry.getAllPluginDescriptions();
			let allExtensionsIds = allExtensions.map(ext => ext.id);
			let activatedExtensions = allExtensionsIds.filter(id => this.pluginService.isActivated(id));

			activatedExtensions.forEach((extensionId) => {
				this.pluginService.deactivate(extensionId);
			});
		} catch (err) {
			// TODO: write to log once we have one
		}

		// Give extensions 1 second to wrap up any async dispose, then exit
		setTimeout(() => {
			exit();
		}, 1000);
	}

	private readPlugins(): TPromise<void> {
		let collector = new PluginsMessageCollector();
		let env = this.contextService.getConfiguration().env;

		return PluginHostMain.scanPlugins(collector, BUILTIN_PLUGINS_PATH, !env.disablePlugins ? env.userPluginsHome : void 0, !env.disablePlugins ? env.pluginDevelopmentPath : void 0, env.version)
			.then(null, err => {
				collector.error('', err);
				return [];
			})
			.then(extensions => {
				// Register & Signal done
				PluginsRegistry.registerPlugins(extensions);
				this.pluginService.registrationDone(collector.getMessages());
			})
			.then(() => this.handleEagerPlugins())
			.then(() => this.handlePluginTests());
	}

	private static scanPlugins(collector: IPluginsMessageCollector, builtinPluginsPath: string, userInstallPath: string, pluginDevelopmentPath: string, version: string): TPromise<IPluginDescription[]> {
		const builtinPlugins = PluginScanner.scanPlugins(version, collector, builtinPluginsPath, true);
		const userPlugins = !userInstallPath ? TPromise.as([]) : PluginScanner.scanPlugins(version, collector, userInstallPath, false);
		const developedPlugins = !pluginDevelopmentPath ? TPromise.as([]) : PluginScanner.scanOneOrMultiplePlugins(version, collector, pluginDevelopmentPath, false);

		return TPromise.join([builtinPlugins, userPlugins, developedPlugins]).then((_: IPluginDescription[][]) => {
			let builtinPlugins = _[0];
			let userPlugins = _[1];
			let extensionDevPlugins = _[2];

			let resultingPluginsMap: { [pluginName: string]: IPluginDescription; } = {};
			builtinPlugins.forEach((builtinPlugin) => {
				resultingPluginsMap[builtinPlugin.id] = builtinPlugin;
			});
			userPlugins.forEach((userPlugin) => {
				if (resultingPluginsMap.hasOwnProperty(userPlugin.id)) {
					collector.warn(userPlugin.extensionFolderPath, 'Overwriting extension ' + resultingPluginsMap[userPlugin.id].extensionFolderPath + ' with ' + userPlugin.extensionFolderPath);
				}
				resultingPluginsMap[userPlugin.id] = userPlugin;
			});
			extensionDevPlugins.forEach(extensionDevPlugin => {
				collector.info('', 'Loading development extension at ' + extensionDevPlugin.extensionFolderPath);
				if (resultingPluginsMap.hasOwnProperty(extensionDevPlugin.id)) {
					collector.warn(extensionDevPlugin.extensionFolderPath, 'Overwriting extension ' + resultingPluginsMap[extensionDevPlugin.id].extensionFolderPath + ' with ' + extensionDevPlugin.extensionFolderPath);
				}
				resultingPluginsMap[extensionDevPlugin.id] = extensionDevPlugin;
			});

			return Object.keys(resultingPluginsMap).map(name => resultingPluginsMap[name]);
		});
	}

	// Handle "eager" activation plugins
	private handleEagerPlugins(): TPromise<void> {
		this.pluginService.activateByEvent('*').then(null, (err) => {
			console.error(err);
		});
		return this.handleWorkspaceContainsEagerPlugins();
	}

	private handleWorkspaceContainsEagerPlugins(): TPromise<void> {
		let workspace = this.contextService.getWorkspace();
		if (!workspace || !workspace.resource) {
			return TPromise.as(null);
		}

		let folderPath = workspace.resource.fsPath;

		let desiredFilesMap: {
			[filename: string]: boolean;
		} = {};

		PluginsRegistry.getAllPluginDescriptions().forEach((desc) => {
			let activationEvents = desc.activationEvents;
			if (!activationEvents) {
				return;
			}

			for (let i = 0; i < activationEvents.length; i++) {
				if (/^workspaceContains:/.test(activationEvents[i])) {
					let fileName = activationEvents[i].substr('workspaceContains:'.length);
					desiredFilesMap[fileName] = true;
				}
			}
		});

		return TPromise.join(
			Object.keys(desiredFilesMap).map(
				(fileName) => pfs.fileExistsWithResult(paths.join(folderPath, fileName), fileName)
			)
		).then((fileNames: string[]) => {
			fileNames.forEach((existingFileName) => {
				if (!existingFileName) {
					return;
				}

				let activationEvent = 'workspaceContains:' + existingFileName;
				this.pluginService.activateByEvent(activationEvent).then(null, (err) => {
					console.error(err);
				});
			});
		});
	}

	private handlePluginTests(): TPromise<void> {
		let env = this.contextService.getConfiguration().env;
		if (!env.pluginTestsPath || !env.pluginDevelopmentPath) {
			return TPromise.as(null);
		}

		// Require the test runner via node require from the provided path
		let testRunner: ITestRunner;
		let requireError: Error;
		try {
			testRunner = <any>require.__$__nodeRequire(env.pluginTestsPath);
		} catch (error) {
			requireError = error;
		}

		// Execute the runner if it follows our spec
		if (testRunner && typeof testRunner.run === 'function') {
			return new TPromise<void>((c, e) => {
				testRunner.run(env.pluginTestsPath, (error, failures) => {
					if (error) {
						e(error.toString());
					} else {
						c(null);
					}

					// after tests have run, we shutdown the host
					this.gracefulExit(failures && failures > 0 ? 1 /* ERROR */ : 0 /* OK */);
				});
			});
		}

		// Otherwise make sure to shutdown anyway even in case of an error
		else {
			this.gracefulExit(1 /* ERROR */);
		}

		return TPromise.wrapError<void>(requireError ? requireError.toString() : nls.localize('pluginTestError', "Path {0} does not point to a valid extension test runner.", env.pluginTestsPath));
	}

	private gracefulExit(code: number): void {
		// to give the PH process a chance to flush any outstanding console
		// messages to the main process, we delay the exit() by some time
		setTimeout(() => exit(code), 500);
	}
}