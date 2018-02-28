/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/code/electron-main/contributions';
import { app, dialog } from 'electron';
import { assign } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import * as path from 'path';
import { parseMainProcessArgv } from 'vs/platform/environment/node/argv';
import { mkdirp, readdir, rimraf } from 'vs/base/node/pfs';
import { validatePaths } from 'vs/code/node/paths';
import { LifecycleService, ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { Server, serve, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { TPromise } from 'vs/base/common/winjs.base';
import { ILaunchChannel, LaunchChannelClient } from 'vs/code/electron-main/launch';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService, ConsoleLogMainService, MultiplexLogService, getLogLevel } from 'vs/platform/log/common/log';
import { StateService } from 'vs/platform/state/node/stateService';
import { IStateService } from 'vs/platform/state/common/state';
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
import { localize } from 'vs/nls';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { printDiagnostics } from 'vs/code/electron-main/diagnostics';
import { BufferLogService } from 'vs/platform/log/common/bufferLog';
import { uploadLogs } from 'vs/code/electron-main/logUploader';
import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { IChoiceService } from 'vs/platform/dialogs/common/dialogs';
import { ChoiceCliService } from 'vs/platform/dialogs/node/choiceCli';

function createServices(args: ParsedArgs, bufferLogService: BufferLogService): IInstantiationService {
	const services = new ServiceCollection();

	const environmentService = new EnvironmentService(args, process.execPath);
	const consoleLogService = new ConsoleLogMainService(getLogLevel(environmentService));
	const logService = new MultiplexLogService([consoleLogService, bufferLogService]);

	process.once('exit', () => logService.dispose());

	// Eventually cleanup
	setTimeout(() => cleanupOlderLogs(environmentService).then(null, err => console.error(err)), 10000);

	services.set(IEnvironmentService, environmentService);
	services.set(ILogService, logService);
	services.set(IWorkspacesMainService, new SyncDescriptor(WorkspacesMainService));
	services.set(IHistoryMainService, new SyncDescriptor(HistoryMainService));
	services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
	services.set(IStateService, new SyncDescriptor(StateService));
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(IURLService, new SyncDescriptor(URLService, args['open-url'] ? args._urls : []));
	services.set(IBackupMainService, new SyncDescriptor(BackupMainService));
	services.set(IChoiceService, new SyncDescriptor(ChoiceCliService));

	return new InstantiationService(services, true);
}

/**
 * Cleans up older logs, while keeping the 10 most recent ones.
*/
async function cleanupOlderLogs(environmentService: EnvironmentService): TPromise<void> {
	const currentLog = path.basename(environmentService.logsPath);
	const logsRoot = path.dirname(environmentService.logsPath);
	const children = await readdir(logsRoot);
	const allSessions = children.filter(name => /^\d{8}T\d{6}$/.test(name));
	const oldSessions = allSessions.sort().filter((d, i) => d !== currentLog);
	const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));

	await TPromise.join(toDelete.map(name => rimraf(path.join(logsRoot, name))));
}

function createPaths(environmentService: IEnvironmentService): TPromise<any> {
	const paths = [
		environmentService.appSettingsHome,
		environmentService.extensionsPath,
		environmentService.nodeCachedDataDir,
		environmentService.logsPath
	];

	return TPromise.join(paths.map(p => p && mkdirp(p))) as TPromise<any>;
}

class ExpectedError extends Error {
	public readonly isExpected = true;
}

function setupIPC(accessor: ServicesAccessor): TPromise<Server> {
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);
	const requestService = accessor.get(IRequestService);

	function allowSetForegroundWindow(service: LaunchChannelClient): TPromise<void> {
		let promise = TPromise.wrap<void>(void 0);
		if (platform.isWindows) {
			promise = service.getMainProcessId()
				.then(processId => {
					logService.trace('Sending some foreground love to the running instance:', processId);

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

			// Print --status usage info
			if (environmentService.args.status) {
				logService.warn('Warning: The --status argument can only be used if Code is already running. Please run it again after Code has started.');
				throw new ExpectedError('Terminating...');
			}

			// Log uploader usage info
			if (typeof environmentService.args['upload-logs'] !== 'undefined') {
				logService.warn('Warning: The --upload-logs argument can only be used if Code is already running. Please run it again after Code has started.');
				throw new ExpectedError('Terminating...');
			}

			// dock might be hidden at this case due to a retry
			if (platform.isMacintosh) {
				app.dock.show();
			}

			// Set the VSCODE_PID variable here when we are sure we are the first
			// instance to startup. Otherwise we would wrongly overwrite the PID
			process.env['VSCODE_PID'] = String(process.pid);

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

					// Show a warning dialog after some timeout if it takes long to talk to the other instance
					// Skip this if we are running with --wait where it is expected that we wait for a while.
					// Also skip when gathering diagnostics (--status) which can take a longer time.
					let startupWarningDialogHandle: number;
					if (!environmentService.wait && !environmentService.status && !environmentService.args['upload-logs']) {
						startupWarningDialogHandle = setTimeout(() => {
							showStartupWarningDialog(
								localize('secondInstanceNoResponse', "Another instance of {0} is running but not responding", product.nameShort),
								localize('secondInstanceNoResponseDetail', "Please close all other instances and try again.")
							);
						}, 10000);
					}

					const channel = client.getChannel<ILaunchChannel>('launch');
					const service = new LaunchChannelClient(channel);

					// Process Info
					if (environmentService.args.status) {
						return service.getMainProcessInfo().then(info => {
							return printDiagnostics(info).then(() => TPromise.wrapError(new ExpectedError()));
						});
					}

					// Log uploader
					if (typeof environmentService.args['upload-logs'] !== 'undefined') {
						return uploadLogs(channel, requestService, environmentService)
							.then(() => TPromise.wrapError(new ExpectedError()));
					}

					logService.trace('Sending env to running instance...');

					return allowSetForegroundWindow(service)
						.then(() => service.start(environmentService.args, process.env))
						.then(() => client.dispose())
						.then(() => {

							// Now that we started, make sure the warning dialog is prevented
							if (startupWarningDialogHandle) {
								clearTimeout(startupWarningDialogHandle);
							}

							return TPromise.wrapError(new ExpectedError('Sent env to running instance. Terminating...'));
						});
				},
				err => {
					if (!retry || platform.isWindows || err.code !== 'ECONNREFUSED') {
						if (err.code === 'EPERM') {
							showStartupWarningDialog(
								localize('secondInstanceAdmin', "A second instance of {0} is already running as administrator.", product.nameShort),
								localize('secondInstanceAdminDetail', "Please close the other instance and try again.")
							);
						}

						return TPromise.wrapError<Server>(err);
					}

					// it happens on Linux and OS X that the pipe is left behind
					// let's delete it, since we can't connect to it
					// and then retry the whole thing
					try {
						fs.unlinkSync(environmentService.mainIPCHandle);
					} catch (e) {
						logService.warn('Could not delete obsolete instance handle', e);
						return TPromise.wrapError<Server>(e);
					}

					return setup(false);
				}
			);
		});
	}

	return setup(true);
}

function showStartupWarningDialog(message: string, detail: string): void {
	dialog.showMessageBox({
		title: product.nameLong,
		type: 'warning',
		buttons: [mnemonicButtonLabel(localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"))],
		message,
		detail,
		noLink: true
	});
}

function quit(accessor: ServicesAccessor, reason?: ExpectedError | Error): void {
	const logService = accessor.get(ILogService);
	const lifecycleService = accessor.get(ILifecycleService);

	let exitCode = 0;

	if (reason) {
		if ((reason as ExpectedError).isExpected) {
			if (reason.message) {
				logService.trace(reason.message);
			}
		} else {
			exitCode = 1; // signal error to the outside

			if (reason.stack) {
				logService.error(reason.stack);
			} else {
				logService.error(`Startup error: ${reason.toString()}`);
			}
		}
	}

	lifecycleService.kill(exitCode);
}

function main() {

	// Set the error handler early enough so that we are not getting the
	// default electron error dialog popping up
	setUnexpectedErrorHandler(err => console.error(err));

	let args: ParsedArgs;
	try {
		args = parseMainProcessArgv(process.argv);
		args = validatePaths(args);
	} catch (err) {
		console.error(err.message);
		app.exit(1);

		return;
	}

	// We need to buffer the spdlog logs until we are sure
	// we are the only instance running, otherwise we'll have concurrent
	// log file access on Windows
	// https://github.com/Microsoft/vscode/issues/41218
	const bufferLogService = new BufferLogService();
	const instantiationService = createServices(args, bufferLogService);

	return instantiationService.invokeFunction(accessor => {

		// Patch `process.env` with the instance's environment
		const environmentService = accessor.get(IEnvironmentService);
		const instanceEnv: typeof process.env = {
			VSCODE_IPC_HOOK: environmentService.mainIPCHandle,
			VSCODE_NLS_CONFIG: process.env['VSCODE_NLS_CONFIG'],
			VSCODE_LOGS: process.env['VSCODE_LOGS']
		};
		assign(process.env, instanceEnv);

		// Startup
		return instantiationService.invokeFunction(a => createPaths(a.get(IEnvironmentService)))
			.then(() => instantiationService.invokeFunction(setupIPC))
			.then(mainIpcServer => {
				bufferLogService.logger = createSpdLogService('main', bufferLogService.getLevel(), environmentService.logsPath);
				return instantiationService.createInstance(CodeApplication, mainIpcServer, instanceEnv).startup();
			});
	}).done(null, err => instantiationService.invokeFunction(quit, err));
}

main();
