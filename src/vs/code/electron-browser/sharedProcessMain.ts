/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { serve, Server, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { TPromise } from 'vs/base/common/winjs.base';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ExtensionManagementChannel } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/electron-browser/requestService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { combinedAppender, NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { resolveCommonProperties, machineIdStorageKey } from 'vs/platform/telemetry/node/commonProperties';
import { TelemetryAppenderChannel } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { AppInsightsAppender } from 'vs/platform/telemetry/node/appInsightsAppender';
import { IChoiceService } from 'vs/platform/message/common/message';
import { ChoiceChannelClient } from 'vs/platform/message/common/messageIpc';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/common/windowsIpc';
import { ipcRenderer } from 'electron';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { StorageService, inMemoryLocalStorageInstance } from 'vs/platform/storage/common/storageService';

interface ISharedProcessInitData {
	sharedIPCHandle: string;
	args: ParsedArgs;
}

class ActiveWindowManager implements IDisposable {
	private disposables: IDisposable[] = [];
	private _activeWindowId: number;

	constructor( @IWindowsService windowsService: IWindowsService) {
		windowsService.onWindowOpen(this.setActiveWindow, this, this.disposables);
		windowsService.onWindowFocus(this.setActiveWindow, this, this.disposables);
	}

	private setActiveWindow(windowId: number) {
		this._activeWindowId = windowId;
	}

	public get activeClientId(): string {
		return `window:${this._activeWindowId}`;
	}

	public dispose() {
		this.disposables = dispose(this.disposables);
	}
}

const eventPrefix = 'monacoworkbench';

function main(server: Server, initData: ISharedProcessInitData): void {
	const services = new ServiceCollection();

	services.set(IEnvironmentService, new SyncDescriptor(EnvironmentService, initData.args, process.execPath));
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
	services.set(IRequestService, new SyncDescriptor(RequestService));

	const windowsChannel = server.getChannel('windows', { route: () => 'main' });
	const windowsService = new WindowsChannelClient(windowsChannel);
	services.set(IWindowsService, windowsService);

	const activeWindowManager = new ActiveWindowManager(windowsService);

	const choiceChannel = server.getChannel('choice', { route: () => activeWindowManager.activeClientId });
	services.set(IChoiceService, new ChoiceChannelClient(choiceChannel));

	const instantiationService = new InstantiationService(services);

	instantiationService.invokeFunction(accessor => {
		const appenders: AppInsightsAppender[] = [];

		if (product.aiConfig && product.aiConfig.asimovKey) {
			appenders.push(new AppInsightsAppender(eventPrefix, null, product.aiConfig.asimovKey));
		}

		// It is important to dispose the AI adapter properly because
		// only then they flush remaining data.
		process.once('exit', () => appenders.forEach(a => a.dispose()));

		const appender = combinedAppender(...appenders);
		server.registerChannel('telemetryAppender', new TelemetryAppenderChannel(appender));

		const services = new ServiceCollection();
		const { appRoot, extensionsPath, extensionDevelopmentPath, isBuilt, extensionTestsPath } = accessor.get(IEnvironmentService);

		if (isBuilt && !extensionDevelopmentPath && product.enableTelemetry) {
			const disableStorage = !!extensionTestsPath; // never keep any state when running extension tests!
			const storage = disableStorage ? inMemoryLocalStorageInstance : window.localStorage;
			const storageService = new StorageService(storage, storage);

			const config: ITelemetryServiceConfig = {
				appender,
				commonProperties: resolveCommonProperties(product.commit, pkg.version)
					.then(result => Object.defineProperty(result, 'common.machineId', {
						get: () => storageService.get(machineIdStorageKey),
						enumerable: true
					})),
				piiPaths: [appRoot, extensionsPath]
			};

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, config));
		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));

		const instantiationService2 = instantiationService.createChild(services);

		instantiationService2.invokeFunction(accessor => {
			const extensionManagementService = accessor.get(IExtensionManagementService);
			const channel = new ExtensionManagementChannel(extensionManagementService);
			server.registerChannel('extensions', channel);

			// clean up deprecated extensions
			(extensionManagementService as ExtensionManagementService).removeDeprecatedExtensions();
		});
	});
}

function setupIPC(hook: string): TPromise<Server> {
	function setup(retry: boolean): TPromise<Server> {
		return serve(hook).then<Server>(null, err => {
			if (!retry || platform.isWindows || err.code !== 'EADDRINUSE') {
				return TPromise.wrapError(err);
			}

			// should retry, not windows and eaddrinuse

			return connect(hook, '').then(
				client => {
					// we could connect to a running instance. this is not good, abort
					client.dispose();
					return TPromise.wrapError(new Error('There is an instance already running.'));
				},
				err => {
					// it happens on Linux and OS X that the pipe is left behind
					// let's delete it, since we can't connect to it
					// and the retry the whole thing
					try {
						fs.unlinkSync(hook);
					} catch (e) {
						return TPromise.wrapError(new Error('Error deleting the shared ipc hook.'));
					}

					return setup(false);
				}
			);
		});
	}

	return setup(true);
}

function startHandshake(): TPromise<ISharedProcessInitData> {
	return new TPromise<ISharedProcessInitData>((c, e) => {
		ipcRenderer.once('handshake:hey there', (_, r) => c(r));
		ipcRenderer.send('handshake:hello');
	});
}

function handshake(): TPromise<void> {
	return startHandshake()
		.then((data) => setupIPC(data.sharedIPCHandle).then(server => main(server, data)))
		.then(() => ipcRenderer.send('handshake:im ready'));
}

handshake();
