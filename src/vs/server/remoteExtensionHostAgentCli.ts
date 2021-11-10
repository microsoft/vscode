/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { getLogLevel, ILogService, LogService } from 'vs/platform/log/common/log';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionGalleryService, IExtensionManagementCLIService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionGalleryServiceWithNoStorageService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import product from 'vs/platform/product/common/product';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/productService';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';
import { RemoteExtensionLogFileName } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IServerEnvironmentService, ServerEnvironmentService, ServerParsedArgs } from 'vs/server/serverEnvironmentService';
import { ExtensionManagementCLIService } from 'vs/platform/extensionManagement/common/extensionManagementCLIService';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { LocalizationsService } from 'vs/platform/localizations/node/localizations';
import { getErrorMessage } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { isAbsolute, join } from 'vs/base/common/path';
import { cwd } from 'vs/base/common/process';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';

class CliMain extends Disposable {

	constructor(private readonly args: ServerParsedArgs, private readonly remoteDataFolder: string) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		// Dispose on exit
		process.once('exit', () => this.dispose());
	}

	async run(): Promise<void> {
		const instantiationService = await this.initServices();
		await instantiationService.invokeFunction(async accessor => {
			const logService = accessor.get(ILogService);
			const extensionManagementCLIService = accessor.get(IExtensionManagementCLIService);
			try {
				await this.doRun(extensionManagementCLIService);
			} catch (error) {
				logService.error(error);
				console.error(getErrorMessage(error));
				throw error;
			}
		});
	}

	private async initServices(): Promise<IInstantiationService> {
		const services = new ServiceCollection();

		const productService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);

		const environmentService = new ServerEnvironmentService(this.args, productService);
		services.set(IServerEnvironmentService, environmentService);
		const logService: ILogService = new LogService(new SpdLogLogger(RemoteExtensionLogFileName, join(environmentService.logsPath, `${RemoteExtensionLogFileName}.log`), true, false, getLogLevel(environmentService)));
		services.set(ILogService, logService);
		logService.trace(`Remote configuration data at ${this.remoteDataFolder}`);
		logService.trace('process arguments:', this.args);


		// Files
		const fileService = this._register(new FileService(logService));
		services.set(IFileService, fileService);
		fileService.registerProvider(Schemas.file, this._register(new DiskFileSystemProvider(logService)));

		// Configuration
		const configurationService = this._register(new ConfigurationService(environmentService.settingsResource, fileService));
		await configurationService.initialize();
		services.set(IConfigurationService, configurationService);

		services.set(IUriIdentityService, new UriIdentityService(fileService));
		services.set(IRequestService, new SyncDescriptor(RequestService));
		services.set(IDownloadService, new SyncDescriptor(DownloadService));
		services.set(ITelemetryService, NullTelemetryService);
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryServiceWithNoStorageService));
		services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
		services.set(IExtensionManagementCLIService, new SyncDescriptor(ExtensionManagementCLIService));
		services.set(ILocalizationsService, new SyncDescriptor(LocalizationsService));

		return new InstantiationService(services);
	}

	private async doRun(extensionManagementCLIService: IExtensionManagementCLIService): Promise<void> {

		// List Extensions
		if (this.args['list-extensions']) {
			return extensionManagementCLIService.listExtensions(!!this.args['show-versions'], this.args['category']);
		}

		// Install Extension
		else if (this.args['install-extension'] || this.args['install-builtin-extension']) {
			return extensionManagementCLIService.installExtensions(this.asExtensionIdOrVSIX(this.args['install-extension'] || []), this.args['install-builtin-extension'] || [], !!this.args['do-not-sync'], !!this.args['force']);
		}

		// Uninstall Extension
		else if (this.args['uninstall-extension']) {
			return extensionManagementCLIService.uninstallExtensions(this.asExtensionIdOrVSIX(this.args['uninstall-extension']), !!this.args['force']);
		}

		// Locate Extension
		else if (this.args['locate-extension']) {
			return extensionManagementCLIService.locateExtension(this.args['locate-extension']);
		}
	}

	private asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
	}
}

function eventuallyExit(code: number): void {
	setTimeout(() => process.exit(code), 0);
}

export async function run(args: ServerParsedArgs, REMOTE_DATA_FOLDER: string): Promise<void> {
	const cliMain = new CliMain(args, REMOTE_DATA_FOLDER);
	try {
		await cliMain.run();
		eventuallyExit(0);
	} catch (err) {
		eventuallyExit(1);
	} finally {
		cliMain.dispose();
	}
}
