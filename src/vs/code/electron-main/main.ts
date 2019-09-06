/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/platform/update/node/update.config.contribution';
import { app, dialog } from 'electron';
import { assign } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import product from 'vs/platform/product/node/product';
import { parseMainProcessArgv } from 'vs/platform/environment/node/argvHelper';
import { addArg, createWaitMarkerFile } from 'vs/platform/environment/node/argv';
import { mkdirp } from 'vs/base/node/pfs';
import { validatePaths } from 'vs/code/node/paths';
import { LifecycleService, ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { Server, serve, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { LaunchChannelClient } from 'vs/platform/launch/electron-main/launchService';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService, ConsoleLogMainService, MultiplexLogService, getLogLevel } from 'vs/platform/log/common/log';
import { StateService } from 'vs/platform/state/node/stateService';
import { IStateService } from 'vs/platform/state/common/state';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { EnvironmentService, xdgRuntimeDir } from 'vs/platform/environment/node/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/platform/request/electron-main/requestService';
import * as fs from 'fs';
import { CodeApplication } from 'vs/code/electron-main/app';
import { localize } from 'vs/nls';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { SpdLogService } from 'vs/platform/log/node/spdlogService';
import { BufferLogService } from 'vs/platform/log/common/bufferLog';
import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { IThemeMainService, ThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { once } from 'vs/base/common/functional';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/node/signService';
import { DiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsIpc';

class ExpectedError extends Error {
	readonly isExpected = true;
}

class CodeMain {

	main(): void {

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

			return;
		}

		// If we are started with --wait create a random temporary file
		// and pass it over to the starting instance. We can use this file
		// to wait for it to be deleted to monitor that the edited file
		// is closed and then exit the waiting process.
		//
		// Note: we are not doing this if the wait marker has been already
		// added as argument. This can happen if Code was started from CLI.
		if (args.wait && !args.waitMarkerFilePath) {
			const waitMarkerFilePath = createWaitMarkerFile(args.verbose);
			if (waitMarkerFilePath) {
				addArg(process.argv, '--waitMarkerFilePath', waitMarkerFilePath);
				args.waitMarkerFilePath = waitMarkerFilePath;
			}
		}

		// Launch
		this.startup(args);
	}

	private async startup(args: ParsedArgs): Promise<void> {

		// We need to buffer the spdlog logs until we are sure
		// we are the only instance running, otherwise we'll have concurrent
		// log file access on Windows (https://github.com/Microsoft/vscode/issues/41218)
		const bufferLogService = new BufferLogService();

		const [instantiationService, instanceEnvironment] = this.createServices(args, bufferLogService);
		try {

			// Init services
			await instantiationService.invokeFunction(async accessor => {
				const environmentService = accessor.get(IEnvironmentService);
				const configurationService = accessor.get(IConfigurationService);
				const stateService = accessor.get(IStateService);

				try {
					await this.initServices(environmentService, configurationService as ConfigurationService, stateService as StateService);
				} catch (error) {

					// Show a dialog for errors that can be resolved by the user
					this.handleStartupDataDirError(environmentService, error);

					throw error;
				}
			});

			// Startup
			await instantiationService.invokeFunction(async accessor => {
				const environmentService = accessor.get(IEnvironmentService);
				const logService = accessor.get(ILogService);
				const lifecycleService = accessor.get(ILifecycleService);
				const configurationService = accessor.get(IConfigurationService);

				const mainIpcServer = await this.doStartup(logService, environmentService, lifecycleService, instantiationService, true);

				bufferLogService.logger = new SpdLogService('main', environmentService.logsPath, bufferLogService.getLevel());
				once(lifecycleService.onWillShutdown)(() => (configurationService as ConfigurationService).dispose());

				return instantiationService.createInstance(CodeApplication, mainIpcServer, instanceEnvironment).startup();
			});
		} catch (error) {
			instantiationService.invokeFunction(this.quit, error);
		}
	}

	private createServices(args: ParsedArgs, bufferLogService: BufferLogService): [IInstantiationService, typeof process.env] {
		const services = new ServiceCollection();

		const environmentService = new EnvironmentService(args, process.execPath);
		const instanceEnvironment = this.patchEnvironment(environmentService); // Patch `process.env` with the instance's environment
		services.set(IEnvironmentService, environmentService);

		const logService = new MultiplexLogService([new ConsoleLogMainService(getLogLevel(environmentService)), bufferLogService]);
		process.once('exit', () => logService.dispose());
		services.set(ILogService, logService);

		services.set(IConfigurationService, new ConfigurationService(environmentService.settingsResource));
		services.set(ILifecycleService, new SyncDescriptor(LifecycleService));
		services.set(IStateService, new SyncDescriptor(StateService));
		services.set(IRequestService, new SyncDescriptor(RequestService));
		services.set(IThemeMainService, new SyncDescriptor(ThemeMainService));
		services.set(ISignService, new SyncDescriptor(SignService));

		return [new InstantiationService(services, true), instanceEnvironment];
	}

	private initServices(environmentService: IEnvironmentService, configurationService: ConfigurationService, stateService: StateService): Promise<unknown> {

		// Environment service (paths)
		const environmentServiceInitialization = Promise.all<void | undefined>([
			environmentService.extensionsPath,
			environmentService.nodeCachedDataDir,
			environmentService.logsPath,
			environmentService.globalStorageHome,
			environmentService.workspaceStorageHome,
			environmentService.backupHome.fsPath
		].map((path): undefined | Promise<void> => path ? mkdirp(path) : undefined));

		// Configuration service
		const configurationServiceInitialization = configurationService.initialize();

		// State service
		const stateServiceInitialization = stateService.init();

		return Promise.all([environmentServiceInitialization, configurationServiceInitialization, stateServiceInitialization]);
	}

	private patchEnvironment(environmentService: IEnvironmentService): typeof process.env {
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

	private async doStartup(logService: ILogService, environmentService: IEnvironmentService, lifecycleService: ILifecycleService, instantiationService: IInstantiationService, retry: boolean): Promise<Server> {

		// Try to setup a server for running. If that succeeds it means
		// we are the first instance to startup. Otherwise it is likely
		// that another instance is already running.
		let server: Server;
		try {
			server = await serve(environmentService.mainIPCHandle);
			once(lifecycleService.onWillShutdown)(() => server.dispose());
		} catch (error) {

			// Handle unexpected errors (the only expected error is EADDRINUSE that
			// indicates a second instance of Code is running)
			if (error.code !== 'EADDRINUSE') {

				// Show a dialog for errors that can be resolved by the user
				this.handleStartupDataDirError(environmentService, error);

				// Any other runtime error is just printed to the console
				throw error;
			}

			// Since we are the second instance, we do not want to show the dock
			if (platform.isMacintosh) {
				app.dock.hide();
			}

			// there's a running instance, let's connect to it
			let client: Client<string>;
			try {
				client = await connect(environmentService.mainIPCHandle, 'main');
			} catch (error) {

				// Handle unexpected connection errors by showing a dialog to the user
				if (!retry || platform.isWindows || error.code !== 'ECONNREFUSED') {
					if (error.code === 'EPERM') {
						this.showStartupWarningDialog(
							localize('secondInstanceAdmin', "A second instance of {0} is already running as administrator.", product.nameShort),
							localize('secondInstanceAdminDetail', "Please close the other instance and try again.")
						);
					}

					throw error;
				}

				// it happens on Linux and OS X that the pipe is left behind
				// let's delete it, since we can't connect to it and then
				// retry the whole thing
				try {
					fs.unlinkSync(environmentService.mainIPCHandle);
				} catch (error) {
					logService.warn('Could not delete obsolete instance handle', error);

					throw error;
				}

				return this.doStartup(logService, environmentService, lifecycleService, instantiationService, false);
			}

			// Tests from CLI require to be the only instance currently
			if (environmentService.extensionTestsLocationURI && !environmentService.debugExtensionHost.break) {
				const msg = 'Running extension tests from the command line is currently only supported if no other instance of Code is running.';
				logService.error(msg);
				client.dispose();

				throw new Error(msg);
			}

			// Show a warning dialog after some timeout if it takes long to talk to the other instance
			// Skip this if we are running with --wait where it is expected that we wait for a while.
			// Also skip when gathering diagnostics (--status) which can take a longer time.
			let startupWarningDialogHandle: NodeJS.Timeout | undefined = undefined;
			if (!environmentService.wait && !environmentService.status) {
				startupWarningDialogHandle = setTimeout(() => {
					this.showStartupWarningDialog(
						localize('secondInstanceNoResponse', "Another instance of {0} is running but not responding", product.nameShort),
						localize('secondInstanceNoResponseDetail', "Please close all other instances and try again.")
					);
				}, 10000);
			}

			const channel = client.getChannel('launch');
			const launchClient = new LaunchChannelClient(channel);

			// Process Info
			if (environmentService.args.status) {
				return instantiationService.invokeFunction(async accessor => {
					// Create a diagnostic service connected to the existing shared process
					const sharedProcessClient = await connect(environmentService.sharedIPCHandle, 'main');
					const diagnosticsChannel = sharedProcessClient.getChannel('diagnostics');
					const diagnosticsService = new DiagnosticsService(diagnosticsChannel);
					const mainProcessInfo = await launchClient.getMainProcessInfo();
					const remoteDiagnostics = await launchClient.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true });
					const diagnostics = await diagnosticsService.getDiagnostics(mainProcessInfo, remoteDiagnostics);
					console.log(diagnostics);

					throw new ExpectedError();
				});
			}

			// Windows: allow to set foreground
			if (platform.isWindows) {
				await this.windowsAllowSetForegroundWindow(launchClient, logService);
			}

			// Send environment over...
			logService.trace('Sending env to running instance...');
			await launchClient.start(environmentService.args, process.env as platform.IProcessEnvironment);

			// Cleanup
			await client.dispose();

			// Now that we started, make sure the warning dialog is prevented
			if (startupWarningDialogHandle) {
				clearTimeout(startupWarningDialogHandle);
			}

			throw new ExpectedError('Sent env to running instance. Terminating...');
		}

		// Print --status usage info
		if (environmentService.args.status) {
			logService.warn('Warning: The --status argument can only be used if Code is already running. Please run it again after Code has started.');

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
	}

	private handleStartupDataDirError(environmentService: IEnvironmentService, error: NodeJS.ErrnoException): void {
		if (error.code === 'EACCES' || error.code === 'EPERM') {
			const directories = [environmentService.userDataPath];

			if (environmentService.extensionsPath) {
				directories.push(environmentService.extensionsPath);
			}

			if (xdgRuntimeDir) {
				directories.push(xdgRuntimeDir);
			}

			this.showStartupWarningDialog(
				localize('startupDataDirError', "Unable to write program user data."),
				localize('startupUserDataAndExtensionsDirErrorDetail', "Please make sure the following directories are writeable:\n\n{0}", directories.join('\n'))
			);
		}
	}

	private showStartupWarningDialog(message: string, detail: string): void {
		dialog.showMessageBox({
			title: product.nameLong,
			type: 'warning',
			buttons: [mnemonicButtonLabel(localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"))],
			message,
			detail,
			noLink: true
		});
	}

	private async windowsAllowSetForegroundWindow(client: LaunchChannelClient, logService: ILogService): Promise<void> {
		if (platform.isWindows) {
			const processId = await client.getMainProcessId();

			logService.trace('Sending some foreground love to the running instance:', processId);

			try {
				(await import('windows-foreground-love')).allowSetForegroundWindow(processId);
			} catch (error) {
				logService.error(error);
			}
		}
	}

	private quit(accessor: ServicesAccessor, reason?: ExpectedError | Error): void {
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
}

// Main Startup
const code = new CodeMain();
code.main();
