/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import 'vs/platform/update/common/update.config.contribution';
import { app, dialog } from 'electron';
import { unlinkSync, promises } from 'fs';
import { URI } from 'vs/base/common/uri';
import { coalesce, distinct } from 'vs/base/common/arrays';
import { Promises as BasePromises } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ExpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { IPathWithLineAndColumn, isValidBasename, parseLineAndColumnAware, sanitizeFilePath } from 'vs/base/common/extpath';
import { Event } from 'vs/base/common/event';
import { getPathLabel } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { basename, resolve } from 'vs/base/common/path';
import { mark } from 'vs/base/common/performance';
import { IProcessEnvironment, isMacintosh, isWindows, OS } from 'vs/base/common/platform';
import { cwd } from 'vs/base/common/process';
import { rtrim, trim } from 'vs/base/common/strings';
import { Promises as FSPromises } from 'vs/base/node/pfs';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client as NodeIPCClient } from 'vs/base/parts/ipc/common/ipc.net';
import { connect as nodeIPCConnect, serve as nodeIPCServe, Server as NodeIPCServer, XDG_RUNTIME_DIR } from 'vs/base/parts/ipc/node/ipc.net';
import { CodeApplication } from 'vs/code/electron-main/app';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IDiagnosticsMainService } from 'vs/platform/diagnostics/electron-main/diagnosticsMainService';
import { DiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsService';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { EnvironmentMainService, IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { addArg, parseMainProcessArgv } from 'vs/platform/environment/node/argvHelper';
import { createWaitMarkerFileSync } from 'vs/platform/environment/node/wait';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILaunchMainService } from 'vs/platform/launch/electron-main/launchMainService';
import { ILifecycleMainService, LifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { BufferLogger } from 'vs/platform/log/common/bufferLog';
import { ConsoleMainLogger, getLogLevel, ILoggerService, ILogService } from 'vs/platform/log/common/log';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { ProtocolMainService } from 'vs/platform/protocol/electron-main/protocolMainService';
import { ITunnelService } from 'vs/platform/tunnel/common/tunnel';
import { TunnelService } from 'vs/platform/tunnel/node/tunnelService';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestMainService } from 'vs/platform/request/electron-main/requestMainService';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/node/signService';
import { IStateReadService, IStateService } from 'vs/platform/state/node/state';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IThemeMainService, ThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { IUserDataProfilesMainService, UserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';
import { IPolicyService, NullPolicyService } from 'vs/platform/policy/common/policy';
import { NativePolicyService } from 'vs/platform/policy/node/nativePolicyService';
import { FilePolicyService } from 'vs/platform/policy/common/filePolicyService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { ILoggerMainService, LoggerMainService } from 'vs/platform/log/electron-main/loggerService';
import { LogService } from 'vs/platform/log/common/logService';
import { massageMessageBoxOptions } from 'vs/platform/dialogs/common/dialogs';
import { SaveStrategy, StateService } from 'vs/platform/state/node/stateService';
import { FileUserDataProvider } from 'vs/platform/userData/common/fileUserDataProvider';
import { addUNCHostToAllowlist, getUNCHost } from 'vs/base/node/unc';

class CodeMain {

	main(): void {
		try {
			this.startup();
		} catch (error) {
			console.error(error.message);
			app.exit(1);
		}
	}

	private async startup(): Promise<void> {

		setUnexpectedErrorHandler(err => console.error(err));

		const [instantiationService, instanceEnvironment, environmentMainService, configurationService, stateMainService, bufferLogService, productService, userDataProfilesMainService] = this.createServices();

		try {
			await this.initServices(environmentMainService, userDataProfilesMainService, configurationService, stateMainService, productService);
			await instantiationService.invokeFunction(async accessor => {
				const logService = accessor.get(ILogService);
				const lifecycleMainService = accessor.get(ILifecycleMainService);
				const fileService = accessor.get(IFileService);
				const loggerService = accessor.get(ILoggerService);

				const mainProcessNodeIpcServer = await this.claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, true);

				FSPromises.writeFile(environmentMainService.mainLockfile, String(process.pid)).catch(err => {
					logService.warn(`app#startup(): Error writing main lockfile: ${err.stack}`);
				});

				bufferLogService.logger = loggerService.createLogger('main', { name: localize('mainLog', "Main") });

				Event.once(lifecycleMainService.onWillShutdown)(evt => {
					fileService.dispose();
					configurationService.dispose();
					evt.join('instanceLockfile', promises.unlink(environmentMainService.mainLockfile).catch(() => { /* ignored */ }));
				});

				return instantiationService.createInstance(CodeApplication, mainProcessNodeIpcServer, instanceEnvironment).startup();
			});
		} catch (error) {
			instantiationService.invokeFunction(this.quit, error);
		}
	}

	private createServices(): [IInstantiationService, IProcessEnvironment, IEnvironmentMainService, ConfigurationService, StateService, BufferLogger, IProductService, UserDataProfilesMainService] {
		const services = new ServiceCollection();
		const disposables = new DisposableStore();
		process.once('exit', () => disposables.dispose());

		const productService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);

		const environmentMainService = new EnvironmentMainService(this.resolveArgs(), productService);
		const instanceEnvironment = this.patchEnvironment(environmentMainService);
		services.set(IEnvironmentMainService, environmentMainService);

		const loggerService = new LoggerMainService(getLogLevel(environmentMainService), environmentMainService.logsHome);
		services.set(ILoggerMainService, loggerService);

		const bufferLogger = new BufferLogger(loggerService.getLogLevel());
		const logService = disposables.add(new LogService(bufferLogger, [new ConsoleMainLogger(loggerService.getLogLevel())]));
		services.set(ILogService, logService);

		const fileService = new FileService(logService);
		services.set(IFileService, fileService);
		const diskFileSystemProvider = new DiskFileSystemProvider(logService);
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		const uriIdentityService = new UriIdentityService(fileService);
		services.set(IUriIdentityService, uriIdentityService);

		const stateService = new StateService(SaveStrategy.DELAYED, environmentMainService, logService, fileService);
		services.set(IStateReadService, stateService);
		services.set(IStateService, stateService);

		const userDataProfilesMainService = new UserDataProfilesMainService(stateService, uriIdentityService, environmentMainService, fileService, logService);
		services.set(IUserDataProfilesMainService, userDataProfilesMainService);

		fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, userDataProfilesMainService, uriIdentityService, logService));

		const policyService = isWindows ? new NativePolicyService(environmentMainService, logService) : new FilePolicyService();
		services.set(IPolicyService, policyService);

		const requestService = new RequestMainService(logService);
		services.set(IRequestService, requestService);

		const signService = new SignService();
		services.set(ISignService, signService);

		const tunnelService = new TunnelService();
		services.set(ITunnelService, tunnelService);

		const protocolMainService = new ProtocolMainService(environmentMainService, logService, uriIdentityService);
		services.set(IProtocolMainService, protocolMainService);

		const launchMainService = new LaunchMainService(environmentMainService, logService);
		services.set(ILaunchMainService, launchMainService);

		const diagnosticsService = new DiagnosticsService();
		services.set(IDiagnosticsMainService, diagnosticsService);

		const themeMainService = new ThemeMainService(environmentMainService, logService);
		services.set(IThemeMainService, themeMainService);

		const instantiationService = new InstantiationService(services, true);

		return [instantiationService, instanceEnvironment, environmentMainService, new ConfigurationService(), stateService, bufferLogger, productService, userDataProfilesMainService];
	}

	private resolveArgs(): IProcessEnvironment {
		const args = parseMainProcessArgv(process.argv);
		return {
			execPath: process.execPath,
			cliPath: args.cliPath,
			userDataPath: args.userDataDir,
			extensionsPath: args.extensionsDir,
			locale: args.locale
		};
	}

	private patchEnvironment(environmentMainService: IEnvironmentMainService): IProcessEnvironment {
		const env = process.env;
		if (env['VSCODE_DEV']) {
			env['VSCODE_DEV'] = 'true';
		}
		if (env['VSCODE_PID']) {
			env['VSCODE_PID'] = String(process.pid);
		}
		if (env['VSCODE_WATCHING']) {
			env['VSCODE_WATCHING'] = 'true';
		}
		if (env['VSCODE_NO_PROXY']) {
			env['VSCODE_NO_PROXY'] = 'true';
		}
		if (env['VSCODE_CLI_PATH']) {
			env['VSCODE_CLI_PATH'] = environmentMainService.cliPath;
		}
		if (env['VSCODE_USER_DATA_DIR']) {
			env['VSCODE_USER_DATA_DIR'] = environmentMainService.userDataPath;
		}
		if (env['VSCODE_EXTENSIONS_DIR']) {
			env['VSCODE_EXTENSIONS_DIR'] = environmentMainService.extensionsPath;
		}
		if (env['VSCODE_LOCALE']) {
			env['VSCODE_LOCALE'] = environmentMainService.locale;
		}
		return env;
	}

	private async claimInstance(logService: ILogService, environmentMainService: IEnvironmentMainService, lifecycleMainService: ILifecycleMainService, instantiationService: IInstantiationService, productService: IProductService, isFirstInstance: boolean): Promise<NodeIPCServer> {
		const mainProcessNodeIpcServer = await nodeIPCServe(environmentMainService.mainIPCHandle);
		await this.waitForActiveProcesses(environmentMainService.mainIPCHandle);
		if (!isFirstInstance) {
			await nodeIPCConnect(environmentMainService.mainIPCHandle);
		}
		return mainProcessNodeIpcServer;
	}

	private async waitForActiveProcesses(mainIPCHandle: string): Promise<void> {
		const waitMarkerPath = createWaitMarkerFileSync();
		if (await FSPromises.exists(waitMarkerPath)) {
			throw new ExpectedError(localize('timeout', "Timeout waiting for active processes"));
		}
	}
}

const codeMain = new CodeMain();
codeMain.main();
