/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hostname, release } from 'os';
import { raceTimeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isAbsolute, join } from 'vs/base/common/path';
import { cwd } from 'vs/base/common/process';
import { joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Promises } from 'vs/base/node/pfs';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ExtensionGalleryServiceWithNoStorageService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService, IExtensionManagementCLIService, IExtensionManagementService, InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagementCLIService';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { LocalizationsService } from 'vs/platform/localizations/node/localizations';
import { ConsoleLogger, getLogLevel, ILogger, ILogService, LogLevel, MultiplexLogService } from 'vs/platform/log/common/log';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { resolveCommonProperties } from 'vs/platform/telemetry/common/commonProperties';
import { ITelemetryService, machineIdKey } from 'vs/platform/telemetry/common/telemetry';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { supportsTelemetry, NullTelemetryService, getPiiPathsFromEnvironment } from 'vs/platform/telemetry/common/telemetryUtils';
import { AppInsightsAppender } from 'vs/platform/telemetry/node/appInsightsAppender';
import { buildTelemetryMessage } from 'vs/platform/telemetry/node/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';

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
			const extensionManagementCLIService = accessor.get(IExtensionManagementCLIService);

			// Log info
			logService.info('CLI main', this.argv);

			// Error handler
			this.registerErrorHandler(logService);

			// Run based on argv
			await this.doRun(environmentService, extensionManagementCLIService, fileService);

			// Flush the remaining data in AI adapter (with 1s timeout)
			await Promise.all(appenders.map(a => {
				raceTimeout(a.flush(), 1000);
			}));
			return;
		});
	}

	private async initServices(): Promise<[IInstantiationService, AppInsightsAppender[]]> {
		const services = new ServiceCollection();

		// Product
		const productService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);

		// Environment
		const environmentService = new NativeEnvironmentService(this.argv, productService);
		services.set(INativeEnvironmentService, environmentService);

		// Init folders
		await Promise.all([environmentService.appSettingsHome.fsPath, environmentService.extensionsPath].map(path => path ? Promises.mkdir(path, { recursive: true }) : undefined));

		// Log
		const logLevel = getLogLevel(environmentService);
		const loggers: ILogger[] = [];
		loggers.push(new SpdLogLogger('cli', join(environmentService.logsPath, 'cli.log'), true, false, logLevel));
		if (logLevel === LogLevel.Trace) {
			loggers.push(new ConsoleLogger(logLevel));
		}

		const logService = this._register(new MultiplexLogService(loggers));
		services.set(ILogService, logService);

		// Files
		const fileService = this._register(new FileService(logService));
		services.set(IFileService, fileService);

		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// Configuration
		const configurationService = this._register(new ConfigurationService(environmentService.settingsResource, fileService));
		services.set(IConfigurationService, configurationService);

		// Init config
		await configurationService.initialize();

		// URI Identity
		services.set(IUriIdentityService, new UriIdentityService(fileService));

		// Request
		services.set(IRequestService, new SyncDescriptor(RequestService));

		// Download Service
		services.set(IDownloadService, new SyncDescriptor(DownloadService));

		// Extensions
		services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryServiceWithNoStorageService));
		services.set(IExtensionManagementCLIService, new SyncDescriptor(ExtensionManagementCLIService));

		// Localizations
		services.set(ILocalizationsService, new SyncDescriptor(LocalizationsService));

		// Telemetry
		const appenders: AppInsightsAppender[] = [];
		if (supportsTelemetry(productService, environmentService)) {
			if (productService.aiConfig && productService.aiConfig.asimovKey) {
				appenders.push(new AppInsightsAppender('monacoworkbench', null, productService.aiConfig.asimovKey));
			}

			const { installSourcePath } = environmentService;

			const config: ITelemetryServiceConfig = {
				appenders,
				sendErrorTelemetry: false,
				commonProperties: (async () => {
					let machineId: string | undefined = undefined;
					try {
						const storageContents = await Promises.readFile(joinPath(environmentService.appSettingsHome, 'storage.json').fsPath);
						machineId = JSON.parse(storageContents.toString())[machineIdKey];
					} catch (error) {
						if (error.code !== 'ENOENT') {
							logService.error(error);
						}
					}

					return resolveCommonProperties(fileService, release(), hostname(), process.arch, productService.commit, productService.version, machineId, productService.msftInternalDomains, installSourcePath);
				})(),
				piiPaths: getPiiPathsFromEnvironment(environmentService)
			};

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config]));

		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		return [new InstantiationService(services), appenders];
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
		process.on('uncaughtException', err => onUnexpectedError(err));
		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));
	}

	private async doRun(environmentService: INativeEnvironmentService, extensionManagementCLIService: IExtensionManagementCLIService, fileService: IFileService): Promise<void> {

		// Install Source
		if (this.argv['install-source']) {
			return this.setInstallSource(environmentService, fileService, this.argv['install-source']);
		}

		// List Extensions
		if (this.argv['list-extensions']) {
			return extensionManagementCLIService.listExtensions(!!this.argv['show-versions'], this.argv['category']);
		}

		// Install Extension
		else if (this.argv['install-extension'] || this.argv['install-builtin-extension']) {
			const installOptions: InstallOptions = { isMachineScoped: !!this.argv['do-not-sync'], installPreReleaseVersion: !!this.argv['pre-release'] };
			return extensionManagementCLIService.installExtensions(this.asExtensionIdOrVSIX(this.argv['install-extension'] || []), this.argv['install-builtin-extension'] || [], installOptions, !!this.argv['force']);
		}

		// Uninstall Extension
		else if (this.argv['uninstall-extension']) {
			return extensionManagementCLIService.uninstallExtensions(this.asExtensionIdOrVSIX(this.argv['uninstall-extension']), !!this.argv['force']);
		}

		// Locate Extension
		else if (this.argv['locate-extension']) {
			return extensionManagementCLIService.locateExtension(this.argv['locate-extension']);
		}

		// Telemetry
		else if (this.argv['telemetry']) {
			console.log(await buildTelemetryMessage(environmentService.appRoot, environmentService.extensionsPath));
		}
	}

	private asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
	}

	private async setInstallSource(environmentService: INativeEnvironmentService, fileService: IFileService, installSource: string): Promise<void> {
		await fileService.writeFile(URI.file(environmentService.installSourcePath), VSBuffer.fromString(installSource.slice(0, 30)));
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
