/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { release } from 'os';
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
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagementCLIService';
import { URI } from 'vs/base/common/uri';

export class Main {

	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IExtensionManagementCLIService private readonly extensionManagementCLIService: IExtensionManagementCLIService
	) { }

	async run(argv: NativeParsedArgs): Promise<void> {
		if (argv['install-source']) {
			await this.setInstallSource(argv['install-source']);
			return;
		}

		if (argv['list-extensions']) {
			await this.extensionManagementCLIService.listExtensions(!!argv['show-versions'], argv['category']);
		} else if (argv['install-extension'] || argv['install-builtin-extension']) {
			await this.extensionManagementCLIService.installExtensions(this.asExtensionIdOrVSIX(argv['install-extension'] || []), argv['install-builtin-extension'] || [], !!argv['do-not-sync'], !!argv['force']);
		} else if (argv['uninstall-extension']) {
			await this.extensionManagementCLIService.uninstallExtensions(this.asExtensionIdOrVSIX(argv['uninstall-extension']), !!argv['force']);
		} else if (argv['locate-extension']) {
			await this.extensionManagementCLIService.locateExtension(argv['locate-extension']);
		} else if (argv['telemetry']) {
			console.log(buildTelemetryMessage(this.environmentService.appRoot, this.environmentService.extensionsPath));
		}
	}

	private asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(process.cwd(), input)) : input);
	}

	private setInstallSource(installSource: string): Promise<void> {
		return writeFile(this.environmentService.installSourcePath, installSource.slice(0, 30));
	}

}

const eventPrefix = 'monacoworkbench';

export async function main(argv: NativeParsedArgs): Promise<void> {
	const services = new ServiceCollection();
	const disposables = new DisposableStore();

	const environmentService = new NativeEnvironmentService(argv);
	const logLevel = getLogLevel(environmentService);
	const loggers: ILogService[] = [];
	loggers.push(new SpdLogService('cli', environmentService.logsPath, logLevel));
	if (logLevel === LogLevel.Trace) {
		loggers.push(new ConsoleLogService(logLevel));
	}
	const logService = new MultiplexLogService(loggers);
	process.once('exit', () => logService.dispose());
	logService.info('main', argv);

	await Promise.all<void | undefined>([environmentService.appSettingsHome.fsPath, environmentService.extensionsPath]
		.map((path): undefined | Promise<void> => path ? mkdirp(path) : undefined));

	// Files
	const fileService = new FileService(logService);
	disposables.add(fileService);
	services.set(IFileService, fileService);

	const diskFileSystemProvider = new DiskFileSystemProvider(logService);
	disposables.add(diskFileSystemProvider);
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);

	const configurationService = new ConfigurationService(environmentService.settingsResource, fileService);
	disposables.add(configurationService);
	await configurationService.initialize();

	services.set(IEnvironmentService, environmentService);
	services.set(INativeEnvironmentService, environmentService);

	services.set(ILogService, logService);
	services.set(IConfigurationService, configurationService);
	services.set(IStateService, new SyncDescriptor(StateService));
	services.set(IProductService, { _serviceBrand: undefined, ...product });

	const instantiationService: IInstantiationService = new InstantiationService(services);

	return instantiationService.invokeFunction(async accessor => {
		const stateService = accessor.get(IStateService);

		const { appRoot, extensionsPath, extensionDevelopmentLocationURI, isBuilt, installSourcePath } = environmentService;

		const services = new ServiceCollection();
		services.set(IRequestService, new SyncDescriptor(RequestService));
		services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));
		services.set(IExtensionManagementCLIService, new SyncDescriptor(ExtensionManagementCLIService));

		const appenders: AppInsightsAppender[] = [];
		if (isBuilt && !extensionDevelopmentLocationURI && !environmentService.disableTelemetry && product.enableTelemetry) {
			if (product.aiConfig && product.aiConfig.asimovKey) {
				appenders.push(new AppInsightsAppender(eventPrefix, null, product.aiConfig.asimovKey));
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

		const instantiationService2 = instantiationService.createChild(services);
		const main = instantiationService2.createInstance(Main);

		try {
			await main.run(argv);

			// Flush the remaining data in AI adapter.
			// If it does not complete in 1 second, exit the process.
			await raceTimeout(combinedAppender(...appenders).flush(), 1000);
		} finally {
			disposables.dispose();
		}
	});
}
