/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { release } from 'os';
import * as fs from 'fs';
import { gracefulify } from 'graceful-fs';
import { isAbsolute, join } from 'vs/base/common/path';
import { raceTimeout } from 'vs/base/common/async';
import product from 'vs/platform/product/common/product';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IEnvironmentService, INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { IExtensionManagementService, IExtensionGalleryService, IExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { combinedAppender, NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties } from 'vs/platform/telemetry/common/commonProperties';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { AppInsightsAppender } from 'vs/platform/telemetry/node/appInsightsAppender';
import { mkdirp, writeFile } from 'vs/base/node/pfs';
import { IStateService } from 'vs/platform/state/node/state';
import { StateService } from 'vs/platform/state/node/stateService';
import { ILogService, getLogLevel, LogLevel, ConsoleLogService, MultiplexLogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { SpdLogService } from 'vs/platform/log/node/spdlogService';
import { buildTelemetryMessage } from 'vs/platform/telemetry/node/telemetry';
import { FileService } from 'vs/platform/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Disposable } from 'vs/base/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagementCLIService';
import { URI } from 'vs/base/common/uri';
import { LocalizationsService } from 'vs/platform/localizations/node/localizations';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { toErrorMessage } from 'vs/base/common/errorMessage';

class CliMain extends Disposable {

	constructor(
		private argv: NativeParsedArgs
	) {
		super();

		// Enable gracefulFs
		gracefulify(fs);

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
			const environmentService = accessor.get(INativeEnvironmentService);
			const extensionManagementCLIService = accessor.get(IExtensionManagementCLIService);

			// Log info
			logService.info('CLI main', this.argv);

			// Error handler
			this.registerErrorHandler(logService);

			// Run based on argv
			await this.doRun(environmentService, extensionManagementCLIService);

			// Flush the remaining data in AI adapter (with 1s timeout)
			return raceTimeout(combinedAppender(...appenders).flush(), 1000);
		});
	}

	private async initServices(): Promise<[IInstantiationService, AppInsightsAppender[]]> {
		const services = new ServiceCollection();

		// Environment
		const environmentService = new NativeEnvironmentService(this.argv);
		services.set(IEnvironmentService, environmentService);
		services.set(INativeEnvironmentService, environmentService);

		// Init folders
		await Promise.all([environmentService.appSettingsHome.fsPath, environmentService.extensionsPath].map(path => path ? mkdirp(path) : undefined));

		// Log
		const logLevel = getLogLevel(environmentService);
		const loggers: ILogService[] = [];
		loggers.push(new SpdLogService('cli', environmentService.logsPath, logLevel));
		if (logLevel === LogLevel.Trace) {
			loggers.push(new ConsoleLogService(logLevel));
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

		// State
		const stateService = new StateService(environmentService, logService);
		services.set(IStateService, stateService);

		// Product
		services.set(IProductService, { _serviceBrand: undefined, ...product });

		const { appRoot, extensionsPath, extensionDevelopmentLocationURI, isBuilt, installSourcePath } = environmentService;

		// Request
		services.set(IRequestService, new SyncDescriptor(RequestService));

		// Extensions
		services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));
		services.set(IExtensionManagementCLIService, new SyncDescriptor(ExtensionManagementCLIService));

		// Localizations
		services.set(ILocalizationsService, new SyncDescriptor(LocalizationsService));

		// Telemetry
		const appenders: AppInsightsAppender[] = [];
		if (isBuilt && !extensionDevelopmentLocationURI && !environmentService.disableTelemetry && product.enableTelemetry) {
			if (product.aiConfig && product.aiConfig.asimovKey) {
				appenders.push(new AppInsightsAppender('monacoworkbench', null, product.aiConfig.asimovKey));
			}

			const config: ITelemetryServiceConfig = {
				appender: combinedAppender(...appenders),
				sendErrorTelemetry: false,
				commonProperties: resolveCommonProperties(fileService, release(), process.arch, product.commit, product.version, stateService.getItem('telemetry.machineId'), product.msftInternalDomains, installSourcePath),
				piiPaths: [appRoot, extensionsPath]
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

			logService.error(message);
		});
	}

	private async doRun(environmentService: INativeEnvironmentService, extensionManagementCLIService: IExtensionManagementCLIService): Promise<void> {

		// Install Source
		if (this.argv['install-source']) {
			return this.setInstallSource(environmentService, this.argv['install-source']);
		}

		// List Extensions
		if (this.argv['list-extensions']) {
			return extensionManagementCLIService.listExtensions(!!this.argv['show-versions'], this.argv['category']);
		}

		// Install Extension
		else if (this.argv['install-extension'] || this.argv['install-builtin-extension']) {
			return extensionManagementCLIService.installExtensions(this.asExtensionIdOrVSIX(this.argv['install-extension'] || []), this.argv['install-builtin-extension'] || [], !!this.argv['do-not-sync'], !!this.argv['force']);
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
			console.log(buildTelemetryMessage(environmentService.appRoot, environmentService.extensionsPath));
		}
	}

	private asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(process.cwd(), input)) : input);
	}

	private setInstallSource(environmentService: INativeEnvironmentService, installSource: string): Promise<void> {
		return writeFile(environmentService.installSourcePath, installSource.slice(0, 30));
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
