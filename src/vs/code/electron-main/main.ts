/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { app } from 'electron';
import { assign } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { parseMainProcessArgv } from 'vs/platform/environment/node/argv';
import { mkdirp } from 'vs/base/node/pfs';
import { validatePaths } from 'vs/code/node/paths';
import { LifecycleService, ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { Server, serve, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { TPromise } from 'vs/base/common/winjs.base';
import { ILaunchChannel, LaunchChannelClient } from './launch';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService, LogMainService } from 'vs/platform/log/common/log';
import { IStorageService, StorageService } from 'vs/platform/storage/node/storage';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/electron-main/requestService';
import { IURLService } from 'vs/platform/url/common/url';
import { URLService } from 'vs/platform/url/electron-main/urlService';
import * as fs from 'original-fs';
import { CodeApplication } from 'vs/code/electron-main/app';
import { HistoryMainService } from 'vs/platform/history/electron-main/historyMainService';
import { IHistoryMainService } from 'vs/platform/history/common/history';
import { WorkspacesMainService } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';

function createServices(args: ParsedArgs): IInstantiationService {
	const services = new ServiceCollection();

	services.set(IEnvironmentService, new SyncDescriptor(EnvironmentService, args, process.execPath));
	services.set(ILogService, new SyncDescriptor(LogMainService));
	services.set(IWorkspacesMainService, new SyncDescriptor(WorkspacesMainService));
	services.set(IHistoryMainService, new SyncDescriptor(HistoryMainService));
	services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
	services.set(IStorageService, new SyncDescriptor(StorageService));
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(IURLService, new SyncDescriptor(URLService, args['open-url']));
	services.set(IBackupMainService, new SyncDescriptor(BackupMainService));

	return new InstantiationService(services, true);
}

function createPaths(environmentService: IEnvironmentService): TPromise<any> {
	const paths = [
		environmentService.appSettingsHome,
		environmentService.extensionsPath,
		environmentService.nodeCachedDataDir
	];
	return TPromise.join(paths.map(p => p && mkdirp(p))) as TPromise<any>;
}

class ExpectedError extends Error {
	public readonly isExpected = true;
}

function setupIPC(accessor: ServicesAccessor): TPromise<Server> {
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);

	function allowSetForegroundWindow(service: LaunchChannelClient): TPromise<void> {
		let promise = TPromise.as<void>(void 0);
		if (platform.isWindows) {
			promise = service.getMainProcessId()
				.then(processId => {
					logService.log('Sending some foreground love to the running instance:', processId);

					try {
						const { allowSetForegroundWindow } = <any>require.__$__nodeRequire('windows-foreground-love');
						allowSetForegroundWindow(processId);
					} catch (e) {
						// noop
					}
				});
		}

		return promise;
	}

	function setup(retry: boolean): TPromise<Server> {
		return serve(environmentService.mainIPCHandle).then(server => {
			if (platform.isMacintosh) {
				app.dock.show(); // dock might be hidden at this case due to a retry
			}

			return server;
		}, err => {
			if (err.code !== 'EADDRINUSE') {
				return TPromise.wrapError<Server>(err);
			}

			// Since we are the second instance, we do not want to show the dock
			if (platform.isMacintosh) {
				app.dock.hide();
			}

			// there's a running instance, let's connect to it
			return connect(environmentService.mainIPCHandle, 'main').then(
				client => {

					// Tests from CLI require to be the only instance currently
					if (environmentService.extensionTestsPath && !environmentService.debugExtensionHost.break) {
						const msg = 'Running extension tests from the command line is currently only supported if no other instance of Code is running.';
						logService.error(msg);
						client.dispose();

						return TPromise.wrapError<Server>(new Error(msg));
					}

					logService.log('Sending env to running instance...');

					const channel = client.getChannel<ILaunchChannel>('launch');
					const service = new LaunchChannelClient(channel);

					return allowSetForegroundWindow(service)
						.then(() => service.start(environmentService.args, process.env))
						.then(() => client.dispose())
						.then(() => TPromise.wrapError(new ExpectedError('Sent env to running instance. Terminating...')));
				},
				err => {
					if (!retry || platform.isWindows || err.code !== 'ECONNREFUSED') {
						return TPromise.wrapError<Server>(err);
					}

					// it happens on Linux and OS X that the pipe is left behind
					// let's delete it, since we can't connect to it
					// and the retry the whole thing
					try {
						fs.unlinkSync(environmentService.mainIPCHandle);
					} catch (e) {
						logService.log('Fatal error deleting obsolete instance handle', e);
						return TPromise.wrapError<Server>(e);
					}

					return setup(false);
				}
			);
		});
	}

	return setup(true);
}

function quit(accessor: ServicesAccessor, reason?: ExpectedError | Error): void {
	const logService = accessor.get(ILogService);
	const lifecycleService = accessor.get(ILifecycleService);

	let exitCode = 0;

	if (reason) {
		if ((reason as ExpectedError).isExpected) {
			logService.log(reason.message);
		} else {
			exitCode = 1; // signal error to the outside

			if (reason.stack) {
				console.error(reason.stack);
			} else {
				console.error(`Startup error: ${reason.toString()}`);
			}
		}
	}

	lifecycleService.kill(exitCode);
}

function main() {
	let args: ParsedArgs;

	try {
		args = parseMainProcessArgv(process.argv);
		args = validatePaths(args);
	} catch (err) {
		console.error(err.message);
		app.exit(1);

		return;
	}

	const instantiationService = createServices(args);

	return instantiationService.invokeFunction(accessor => {

		// Patch `process.env` with the instance's environment
		const environmentService = accessor.get(IEnvironmentService);
		const instanceEnv: typeof process.env = {
			VSCODE_PID: String(process.pid),
			VSCODE_IPC_HOOK: environmentService.mainIPCHandle,
			VSCODE_NLS_CONFIG: process.env['VSCODE_NLS_CONFIG']
		};
		assign(process.env, instanceEnv);

		// Startup
		return instantiationService.invokeFunction(a => createPaths(a.get(IEnvironmentService)))
			.then(() => instantiationService.invokeFunction(setupIPC))
			.then(mainIpcServer => {
				const app = instantiationService.createInstance(CodeApplication, mainIpcServer, instanceEnv);
				app.startup();
			});
	}).done(null, err => instantiationService.invokeFunction(quit, err));
}

main();