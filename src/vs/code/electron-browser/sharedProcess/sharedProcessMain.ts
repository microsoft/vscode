/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { serve, Server, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ExtensionManagementChannel } from 'vs/platform/extensionManagement/node/extensionManagementIpc';
import { IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/electron-browser/requestService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { combinedAppender, NullTelemetryService, ITelemetryAppender, NullAppender, LogAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { TelemetryAppenderChannel } from 'vs/platform/telemetry/node/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { AppInsightsAppender } from 'vs/platform/telemetry/node/appInsightsAppender';
import { IWindowsService, ActiveWindowManager } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/node/windowsIpc';
import { ipcRenderer } from 'electron';
import { createSharedProcessContributions } from 'vs/code/electron-browser/sharedProcess/contrib/contributions';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { LogLevelSetterChannelClient, FollowerLogService } from 'vs/platform/log/node/logIpc';
import { LocalizationsService } from 'vs/platform/localizations/node/localizations';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { LocalizationsChannel } from 'vs/platform/localizations/node/localizationsIpc';
import { DialogChannelClient } from 'vs/platform/dialogs/node/dialogIpc';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { DownloadService } from 'vs/platform/download/node/downloadService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { StaticRouter } from 'vs/base/parts/ipc/node/ipc';

export interface ISharedProcessConfiguration {
	readonly machineId: string;
}

export function startup(configuration: ISharedProcessConfiguration) {
	handshake(configuration);
}

interface ISharedProcessInitData {
	sharedIPCHandle: string;
	args: ParsedArgs;
	logLevel: LogLevel;
}

const eventPrefix = 'monacoworkbench';

function main(server: Server, initData: ISharedProcessInitData, configuration: ISharedProcessConfiguration): void {
	const services = new ServiceCollection();

	const disposables: IDisposable[] = [];

	const onExit = () => dispose(disposables);
	process.once('exit', onExit);
	ipcRenderer.once('handshake:goodbye', onExit);

	disposables.push(server);

	const environmentService = new EnvironmentService(initData.args, process.execPath);

	const mainRouter = new StaticRouter(ctx => ctx === 'main');
	const logLevelClient = new LogLevelSetterChannelClient(server.getChannel('loglevel', mainRouter));
	const logService = new FollowerLogService(logLevelClient, createSpdLogService('sharedprocess', initData.logLevel, environmentService.logsPath));
	disposables.push(logService);

	logService.info('main', JSON.stringify(configuration));

	services.set(IEnvironmentService, environmentService);
	services.set(ILogService, logService);
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(IDownloadService, new SyncDescriptor(DownloadService));

	const windowsChannel = server.getChannel('windows', mainRouter);
	const windowsService = new WindowsChannelClient(windowsChannel);
	services.set(IWindowsService, windowsService);

	const activeWindowManager = new ActiveWindowManager(windowsService);
	const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
	const dialogChannel = server.getChannel('dialog', activeWindowRouter);
	services.set(IDialogService, new DialogChannelClient(dialogChannel));

	const instantiationService = new InstantiationService(services);

	instantiationService.invokeFunction(accessor => {
		const services = new ServiceCollection();
		const environmentService = accessor.get(IEnvironmentService);
		const { appRoot, extensionsPath, extensionDevelopmentLocationURI, isBuilt, installSourcePath } = environmentService;
		const telemetryLogService = new FollowerLogService(logLevelClient, createSpdLogService('telemetry', initData.logLevel, environmentService.logsPath));
		telemetryLogService.info('The below are logs for every telemetry event sent from VS Code once the log level is set to trace.');
		telemetryLogService.info('===========================================================');

		let appInsightsAppender: ITelemetryAppender | null = NullAppender;
		if (!extensionDevelopmentLocationURI && !environmentService.args['disable-telemetry'] && product.enableTelemetry) {
			if (product.aiConfig && product.aiConfig.asimovKey && isBuilt) {
				appInsightsAppender = new AppInsightsAppender(eventPrefix, null, product.aiConfig.asimovKey, telemetryLogService);
				disposables.push(appInsightsAppender); // Ensure the AI appender is disposed so that it flushes remaining data
			}
			const config: ITelemetryServiceConfig = {
				appender: combinedAppender(appInsightsAppender, new LogAppender(logService)),
				commonProperties: resolveCommonProperties(product.commit, pkg.version, configuration.machineId, installSourcePath),
				piiPaths: [appRoot, extensionsPath]
			};

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config]));
		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}
		server.registerChannel('telemetryAppender', new TelemetryAppenderChannel(appInsightsAppender));

		services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));
		services.set(ILocalizationsService, new SyncDescriptor(LocalizationsService));

		const instantiationService2 = instantiationService.createChild(services);

		instantiationService2.invokeFunction(accessor => {

			const extensionManagementService = accessor.get(IExtensionManagementService);
			const channel = new ExtensionManagementChannel(extensionManagementService, () => null);
			server.registerChannel('extensions', channel);

			// clean up deprecated extensions
			(extensionManagementService as ExtensionManagementService).removeDeprecatedExtensions();

			const localizationsService = accessor.get(ILocalizationsService);
			const localizationsChannel = new LocalizationsChannel(localizationsService);
			server.registerChannel('localizations', localizationsChannel);

			createSharedProcessContributions(instantiationService2);
			disposables.push(extensionManagementService as ExtensionManagementService);
		});
	});
}

function setupIPC(hook: string): Promise<Server> {
	function setup(retry: boolean): Promise<Server> {
		return serve(hook).then(null, err => {
			if (!retry || platform.isWindows || err.code !== 'EADDRINUSE') {
				return Promise.reject(err);
			}

			// should retry, not windows and eaddrinuse

			return connect(hook, '').then(
				client => {
					// we could connect to a running instance. this is not good, abort
					client.dispose();
					return Promise.reject(new Error('There is an instance already running.'));
				},
				err => {
					// it happens on Linux and OS X that the pipe is left behind
					// let's delete it, since we can't connect to it
					// and the retry the whole thing
					try {
						fs.unlinkSync(hook);
					} catch (e) {
						return Promise.reject(new Error('Error deleting the shared ipc hook.'));
					}

					return setup(false);
				}
			);
		});
	}

	return setup(true);
}

async function handshake(configuration: ISharedProcessConfiguration): Promise<void> {
	const data = await new Promise<ISharedProcessInitData>(c => {
		ipcRenderer.once('handshake:hey there', (_: any, r: ISharedProcessInitData) => c(r));
		ipcRenderer.send('handshake:hello');
	});

	const server = await setupIPC(data.sharedIPCHandle);

	main(server, data, configuration);
	ipcRenderer.send('handshake:im ready');
}
