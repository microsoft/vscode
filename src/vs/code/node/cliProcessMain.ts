/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { hostname, release } from 'os';
import { raceTimeout } from '../../base/common/async';
import { toErrorMessage } from '../../base/common/errorMessage';
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from '../../base/common/errors';
import { Disposable } from '../../base/common/lifecycle';
import { Schemas } from '../../base/common/network';
import { isAbsolute, join } from '../../base/common/path';
import { isWindows } from '../../base/common/platform';
import { cwd } from '../../base/common/process';
import { URI } from '../../base/common/uri';
import { IConfigurationService } from '../../platform/configuration/common/configuration';
import { ConfigurationService } from '../../platform/configuration/common/configurationService';
import { IDownloadService } from '../../platform/download/common/download';
import { DownloadService } from '../../platform/download/common/downloadService';
import { NativeParsedArgs } from '../../platform/environment/common/argv';
import { INativeEnvironmentService } from '../../platform/environment/common/environment';
import { NativeEnvironmentService } from '../../platform/environment/node/environmentService';
import { ExtensionGalleryServiceWithNoStorageService } from '../../platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService, InstallOptions } from '../../platform/extensionManagement/common/extensionManagement';
import { ExtensionSignatureVerificationService, IExtensionSignatureVerificationService } from '../../platform/extensionManagement/node/extensionSignatureVerificationService';
import { ExtensionManagementCLI } from '../../platform/extensionManagement/common/extensionManagementCLI';
import { IExtensionsProfileScannerService } from '../../platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService } from '../../platform/extensionManagement/common/extensionsScannerService';
import { ExtensionManagementService, INativeServerExtensionManagementService } from '../../platform/extensionManagement/node/extensionManagementService';
import { ExtensionsScannerService } from '../../platform/extensionManagement/node/extensionsScannerService';
import { IFileService } from '../../platform/files/common/files';
import { FileService } from '../../platform/files/common/fileService';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection';
import { ILanguagePackService } from '../../platform/languagePacks/common/languagePacks';
import { NativeLanguagePackService } from '../../platform/languagePacks/node/languagePacks';
import { ConsoleLogger, getLogLevel, ILogger, ILoggerService, ILogService, LogLevel } from '../../platform/log/common/log';
import { FilePolicyService } from '../../platform/policy/common/filePolicyService';
import { IPolicyService, NullPolicyService } from '../../platform/policy/common/policy';
import { NativePolicyService } from '../../platform/policy/node/nativePolicyService';
import product from '../../platform/product/common/product';
import { IProductService } from '../../platform/product/common/productService';
import { IRequestService } from '../../platform/request/common/request';
import { RequestService } from '../../platform/request/node/requestService';
import { SaveStrategy, StateReadonlyService } from '../../platform/state/node/stateService';
import { resolveCommonProperties } from '../../platform/telemetry/common/commonProperties';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry';
import { ITelemetryServiceConfig, TelemetryService } from '../../platform/telemetry/common/telemetryService';
import { supportsTelemetry, NullTelemetryService, getPiiPathsFromEnvironment, isInternalTelemetry, ITelemetryAppender } from '../../platform/telemetry/common/telemetryUtils';
import { OneDataSystemAppender } from '../../platform/telemetry/node/1dsAppender';
import { buildTelemetryMessage } from '../../platform/telemetry/node/telemetry';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService';
import { IUserDataProfile, IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile';
import { UserDataProfilesReadonlyService } from '../../platform/userDataProfile/node/userDataProfile';
import { resolveMachineId, resolveSqmId, resolvedevDeviceId } from '../../platform/telemetry/node/telemetryUtils';
import { ExtensionsProfileScannerService } from '../../platform/extensionManagement/node/extensionsProfileScannerService';
import { LogService } from '../../platform/log/common/logService';
import { LoggerService } from '../../platform/log/node/loggerService';
import { localize } from '../../nls';
import { FileUserDataProvider } from '../../platform/userData/common/fileUserDataProvider';
import { addUNCHostToAllowlist, getUNCHost } from '../../base/node/unc';

class CliMain extends Disposable {

	constructor(
		private argv: NativeParsedArgs
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Dispose on exit
		process.once('exit', () => this.dispose());
	}

	async run(): Promise<void> {

		// Services
		const [instantiationService, appenders] = await this.initServices();

		return instantiationService.invokeFunction(async accessor => {
			const logService = accessor.get(ILogService);
			const fileService = accessor.get(IFileService);
			const environmentService = accessor.get(INativeEnvironmentService);
			const userDataProfilesService = accessor.get(IUserDataProfilesService);

			// Log info
			logService.info('CLI main', this.argv);

			// Error handler
			this.registerErrorHandler(logService);

			// Run based on argv
			await this.doRun(environmentService, fileService, userDataProfilesService, instantiationService);

			// Flush the remaining data in AI adapter (with 1s timeout)
			await Promise.all(appenders.map(a => {
				raceTimeout(a.flush(), 1000);
			}));
			return;
		});
	}

	private async initServices(): Promise<[IInstantiationService, ITelemetryAppender[]]> {
		const services = new ServiceCollection();

		// Product
		const productService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);

		// Environment
		const environmentService = new NativeEnvironmentService(this.argv, productService);
		services.set(INativeEnvironmentService, environmentService);

		// Init folders
		await Promise.all([
			this.allowWindowsUNCPath(environmentService.appSettingsHome.with({ scheme: Schemas.file }).fsPath),
			this.allowWindowsUNCPath(environmentService.extensionsPath)
		].map(path => path ? fs.promises.mkdir(path, { recursive: true }) : undefined));

		// Logger
		const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
		services.set(ILoggerService, loggerService);

		// Log
		const logger = this._register(loggerService.createLogger('cli', { name: localize('cli', "CLI") }));
		const otherLoggers: ILogger[] = [];
		if (loggerService.getLogLevel() === LogLevel.Trace) {
			otherLoggers.push(new ConsoleLogger(loggerService.getLogLevel()));
		}

		const logService = this._register(new LogService(logger, otherLoggers));
		services.set(ILogService, logService);

		// Files
		const fileService = this._register(new FileService(logService));
		services.set(IFileService, fileService);

		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// Uri Identity
		const uriIdentityService = new UriIdentityService(fileService);
		services.set(IUriIdentityService, uriIdentityService);

		// User Data Profiles
		const stateService = new StateReadonlyService(SaveStrategy.DELAYED, environmentService, logService, fileService);
		const userDataProfilesService = new UserDataProfilesReadonlyService(stateService, uriIdentityService, environmentService, fileService, logService);
		services.set(IUserDataProfilesService, userDataProfilesService);

		// Use FileUserDataProvider for user data to
		// enable atomic read / write operations.
		fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));

		// Policy
		const policyService = isWindows && productService.win32RegValueName ? this._register(new NativePolicyService(logService, productService.win32RegValueName))
			: environmentService.policyFile ? this._register(new FilePolicyService(environmentService.policyFile, fileService, logService))
				: new NullPolicyService();
		services.set(IPolicyService, policyService);

		// Configuration
		const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, policyService, logService));
		services.set(IConfigurationService, configurationService);

		// Initialize
		await Promise.all([
			stateService.init(),
			configurationService.initialize()
		]);

		// Get machine ID
		let machineId: string | undefined = undefined;
		try {
			machineId = await resolveMachineId(stateService, logService);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				logService.error(error);
			}
		}
		const sqmId = await resolveSqmId(stateService, logService);
		const devDeviceId = await resolvedevDeviceId(stateService, logService);

		// Initialize user data profiles after initializing the state
		userDataProfilesService.init();

		// URI Identity
		services.set(IUriIdentityService, new UriIdentityService(fileService));

		// Request
		const requestService = new RequestService(configurationService, environmentService, logService, loggerService);
		services.set(IRequestService, requestService);

		// Download Service
		services.set(IDownloadService, new SyncDescriptor(DownloadService, undefined, true));

		// Extensions
		services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, undefined, true));
		services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, undefined, true));
		services.set(IExtensionSignatureVerificationService, new SyncDescriptor(ExtensionSignatureVerificationService, undefined, true));
		services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService, undefined, true));
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryServiceWithNoStorageService, undefined, true));

		// Localizations
		services.set(ILanguagePackService, new SyncDescriptor(NativeLanguagePackService, undefined, false));

		// Telemetry
		const appenders: ITelemetryAppender[] = [];
		const isInternal = isInternalTelemetry(productService, configurationService);
		if (supportsTelemetry(productService, environmentService)) {
			if (productService.aiConfig && productService.aiConfig.ariaKey) {
				appenders.push(new OneDataSystemAppender(requestService, isInternal, 'monacoworkbench', null, productService.aiConfig.ariaKey));
			}

			const config: ITelemetryServiceConfig = {
				appenders,
				sendErrorTelemetry: false,
				commonProperties: resolveCommonProperties(release(), hostname(), process.arch, productService.commit, productService.version, machineId, sqmId, devDeviceId, isInternal),
				piiPaths: getPiiPathsFromEnvironment(environmentService)
			};

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config], false));

		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		return [new InstantiationService(services), appenders];
	}

	private allowWindowsUNCPath(path: string): string {
		if (isWindows) {
			const host = getUNCHost(path);
			if (host) {
				addUNCHostToAllowlist(host);
			}
		}

		return path;
	}

	private registerErrorHandler(logService: ILogService): void {

		// Install handler for unexpected errors
		setUnexpectedErrorHandler(error => {
			const message = toErrorMessage(error, true);
			if (!message) {
				return;
			}

			logService.error(`[uncaught exception in CLI]: ${message}`);
		});

		// Handle unhandled errors that can occur
		process.on('uncaughtException', err => {
			if (!isSigPipeError(err)) {
				onUnexpectedError(err);
			}
		});
		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));
	}

	private async doRun(environmentService: INativeEnvironmentService, fileService: IFileService, userDataProfilesService: IUserDataProfilesService, instantiationService: IInstantiationService): Promise<void> {
		let profile: IUserDataProfile | undefined = undefined;
		if (environmentService.args.profile) {
			profile = userDataProfilesService.profiles.find(p => p.name === environmentService.args.profile);
			if (!profile) {
				throw new Error(`Profile '${environmentService.args.profile}' not found.`);
			}
		}
		const profileLocation = (profile ?? userDataProfilesService.defaultProfile).extensionsResource;

		// List Extensions
		if (this.argv['list-extensions']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).listExtensions(!!this.argv['show-versions'], this.argv['category'], profileLocation);
		}

		// Install Extension
		else if (this.argv['install-extension'] || this.argv['install-builtin-extension']) {
			const installOptions: InstallOptions = { isMachineScoped: !!this.argv['do-not-sync'], installPreReleaseVersion: !!this.argv['pre-release'], profileLocation };
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).installExtensions(this.asExtensionIdOrVSIX(this.argv['install-extension'] || []), this.asExtensionIdOrVSIX(this.argv['install-builtin-extension'] || []), installOptions, !!this.argv['force']);
		}

		// Uninstall Extension
		else if (this.argv['uninstall-extension']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).uninstallExtensions(this.asExtensionIdOrVSIX(this.argv['uninstall-extension']), !!this.argv['force'], profileLocation);
		}

		else if (this.argv['update-extensions']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).updateExtensions(profileLocation);
		}

		// Locate Extension
		else if (this.argv['locate-extension']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).locateExtension(this.argv['locate-extension']);
		}

		// Telemetry
		else if (this.argv['telemetry']) {
			console.log(await buildTelemetryMessage(environmentService.appRoot, environmentService.extensionsPath));
		}
	}

	private asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
	}
}

export async function main(argv: NativeParsedArgs): Promise<void> {
	const cliMain = new CliMain(argv);

	try {
		await cliMain.run();
	} finally {
		cliMain.dispose();
	}
}
