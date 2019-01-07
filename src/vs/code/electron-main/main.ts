/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/code/code.main';
import { app, dialog } from 'electron';
import { assign } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/node/product';
import { parseMainProcessArgv } from 'vs/platform/environment/node/argv';
import { mkdirp } from 'vs/base/node/pfs';
import { validatePaths } from 'vs/code/node/paths';
import { LifecycleService, ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { Server, serve, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { LaunchChannelClient } from 'vs/platform/launch/electron-main/launchService';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/node/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService, ConsoleLogMainService, MultiplexLogService, getLogLevel } from 'vs/platform/log/common/log';
import { StateService } from 'vs/platform/state/node/stateService';
import { IStateService } from 'vs/platform/state/common/state';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/electron-main/requestService';
import * as fs from 'fs';
import { CodeApplication } from 'vs/code/electron-main/app';
import { localize } from 'vs/nls';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { createSpdLogService } from 'vs/platform/log/node/spdlogService';
import { IDiagnosticsService, DiagnosticsService } from 'vs/platform/diagnostics/electron-main/diagnosticsService';
import { BufferLogService } from 'vs/platform/log/common/bufferLog';
import { uploadLogs } from 'vs/code/electron-main/logUploader';
import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { createWaitMarkerFile } from 'vs/code/node/wait';

class ExpectedError extends Error {
	readonly isExpected = true;
}

function setupIPC(accessor: ServicesAccessor): Promise<Server> {
	const logService = accessor.get(ILogService);
	const environmentService = accessor.get(IEnvironmentService);
	const instantiationService = accessor.get(IInstantiationService);

	function allowSetForegroundWindow(service: LaunchChannelClient): Promise<void> {
		let promise: Promise<void> = Promise.resolve();
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

	function setup(retry: boolean): Promise<Server> {
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

			// Handle unexpected errors (the only expected error is EADDRINUSE that
			// indicates a second instance of Code is running)
			if (err.code !== 'EADDRINUSE') {

				// Show a dialog for errors that can be resolved by the user
				handleStartupDataDirError(environmentService, err);

				// Any other runtime error is just printed to the console
				return Promise.reject<Server>(err);
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

						return Promise.reject(new Error(msg));
					}

					// Show a warning dialog after some timeout if it takes long to talk to the other instance
					// Skip this if we are running with --wait where it is expected that we wait for a while.
					// Also skip when gathering diagnostics (--status) which can take a longer time.
					let startupWarningDialogHandle: any;
					if (!environmentService.wait && !environmentService.status && !environmentService.args['upload-logs']) {
						startupWarningDialogHandle = setTimeout(() => {
							showStartupWarningDialog(
								localize('secondInstanceNoResponse', "Another instance of {0} is running but not responding", product.nameShort),
								localize('secondInstanceNoResponseDetail', "Please close all other instances and try again.")
							);
						}, 10000);
					}

					const channel = client.getChannel('launch');
					const service = new LaunchChannelClient(channel);

					// Process Info
					if (environmentService.args.status) {
						return service.getMainProcessInfo().then(info => {
							return instantiationService.invokeFunction(accessor => {
								return accessor.get(IDiagnosticsService).printDiagnostics(info).then(() => Promise.reject(new ExpectedError()));
							});
						});
					}

					// Log uploader
					if (typeof environmentService.args['upload-logs'] !== 'undefined') {
						return instantiationService.invokeFunction(accessor => {
							return uploadLogs(service, accessor.get(IRequestService), environmentService)
								.then(() => Promise.reject(new ExpectedError()));
						});
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

							return Promise.reject(new ExpectedError('Sent env to running instance. Terminating...'));
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

						return Promise.reject<Server>(err);
					}

					// it happens on Linux and OS X that the pipe is left behind
					// let's delete it, since we can't connect to it
					// and then retry the whole thing
					try {
						fs.unlinkSync(environmentService.mainIPCHandle);
					} catch (e) {
						logService.warn('Could not delete obsolete instance handle', e);
						return Promise.reject<Server>(e);
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

function handleStartupDataDirError(environmentService: IEnvironmentService, error): void {
	if (error.code === 'EACCES' || error.code === 'EPERM') {
		showStartupWarningDialog(
			localize('startupDataDirError', "Unable to write program user data."),
			localize('startupDataDirErrorDetail', "Please make sure the directory {0} is writeable.", environmentService.userDataPath)
		);
	}
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

function patchEnvironment(environmentService: IEnvironmentService): typeof process.env {
	const instanceEnvironment: typeof process.env = {
		VSCODE_IPC_HOOK: environmentService.mainIPCHandle,
		VSCODE_NLS_CONFIG: process.env['VSCODE_NLS_CONFIG'],
		VSCODE_LOGS: process.env['VSCODE_LOGS']
	};

	if (process.env['VSCODE_PORTABLE']) {
		instanceEnvironment['VSCODE_PORTABLE'] = process.env['VSCODE_PORTABLE'];
	}

	assign(process.env, instanceEnvironment);

	return instanceEnvironment;
}

function startup(args: ParsedArgs): void {

	// We need to buffer the spdlog logs until we are sure
	// we are the only instance running, otherwise we'll have concurrent
	// log file access on Windows (https://github.com/Microsoft/vscode/issues/41218)
	const bufferLogService = new BufferLogService();

	const instantiationService = createServices(args, bufferLogService);
	instantiationService.invokeFunction(accessor => {
		const environmentService = accessor.get(IEnvironmentService);
		const stateService = accessor.get(IStateService);

		// Patch `process.env` with the instance's environment
		const instanceEnvironment = patchEnvironment(environmentService);

		// Startup
		return initServices(environmentService, stateService as StateService)
			.then(() => instantiationService.invokeFunction(setupIPC), error => {

				// Show a dialog for errors that can be resolved by the user
				handleStartupDataDirError(environmentService, error);

				return Promise.reject(error);
			})
			.then(mainIpcServer => {
				bufferLogService.logger = createSpdLogService('main', bufferLogService.getLevel(), environmentService.logsPath);

				return instantiationService.createInstance(CodeApplication, mainIpcServer, instanceEnvironment).startup();
			});
	}).then(null, err => instantiationService.invokeFunction(quit, err));
}

function createServices(args: ParsedArgs, bufferLogService: BufferLogService): IInstantiationService {
	const services = new ServiceCollection();

	const environmentService = new EnvironmentService(args, process.execPath);

	const logService = new MultiplexLogService([new ConsoleLogMainService(getLogLevel(environmentService)), bufferLogService]);
	process.once('exit', () => logService.dispose());

	services.set(IEnvironmentService, environmentService);
	services.set(ILogService, logService);
	services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
	services.set(IStateService, new SyncDescriptor(StateService));
	services.set(IConfigurationService, new SyncDescriptor(ConfigurationService));
	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(IDiagnosticsService, new SyncDescriptor(DiagnosticsService));

	return new InstantiationService(services, true);
}

function initServices(environmentService: IEnvironmentService, stateService: StateService): Promise<any> {

	// Ensure paths for environment service exist
	const environmentServiceInitialization = Promise.all([
		environmentService.extensionsPath,
		environmentService.nodeCachedDataDir,
		environmentService.logsPath,
		environmentService.globalStorageHome,
		environmentService.workspaceStorageHome,
		environmentService.backupHome
	].map(path => path && mkdirp(path)));

	// State service
	const stateServiceInitialization = stateService.init();

	return Promise.all([environmentServiceInitialization, stateServiceInitialization]);
}

function main(): void {

	// Set the error handler early enough so that we are not getting the
	// default electron error dialog popping up
	setUnexpectedErrorHandler(err => console.error(err));

	// Parse arguments
	let args: ParsedArgs;
	try {
		args = parseMainProcessArgv(process.argv);
		args = validatePaths(args);
	} catch (err) {
		console.error(err.message);
		app.exit(1);

		return undefined;
	}

	// If we are started with --wait create a random temporary file
	// and pass it over to the starting instance. We can use this file
	// to wait for it to be deleted to monitor that the edited file
	// is closed and then exit the waiting process.
	//
	// Note: we are not doing this if the wait marker has been already
	// added as argument. This can happen if Code was started from CLI.
	if (args.wait && !args.waitMarkerFilePath) {
		createWaitMarkerFile(args.verbose).then(waitMarkerFilePath => {
			if (waitMarkerFilePath) {
				process.argv.push('--waitMarkerFilePath', waitMarkerFilePath);
				args.waitMarkerFilePath = waitMarkerFilePath;
			}

			startup(args);
		});
	}

	// Otherwise just startup normally
	else {
		startup(args);
	}
}

main();
