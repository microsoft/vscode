/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ConsoleLogger, getLogLevel, ILoggerService, ILogService, NullLogger } from '../../platform/log/common/log.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { ConfigurationService } from '../../platform/configuration/common/configurationService.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IRequestService } from '../../platform/request/common/request.js';
import { RequestService } from '../../platform/request/node/requestService.js';
import { NullTelemetryService } from '../../platform/telemetry/common/telemetryUtils.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IExtensionGalleryService, InstallOptions } from '../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionGalleryServiceWithNoStorageService } from '../../platform/extensionManagement/common/extensionGalleryService.js';
import { ExtensionManagementService, INativeServerExtensionManagementService } from '../../platform/extensionManagement/node/extensionManagementService.js';
import { ExtensionSignatureVerificationService, IExtensionSignatureVerificationService } from '../../platform/extensionManagement/node/extensionSignatureVerificationService.js';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import product from '../../platform/product/common/product.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { DiskFileSystemProvider } from '../../platform/files/node/diskFileSystemProvider.js';
import { Schemas } from '../../base/common/network.js';
import { IFileService } from '../../platform/files/common/files.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IServerEnvironmentService, ServerEnvironmentService, ServerParsedArgs } from './serverEnvironmentService.js';
import { ExtensionManagementCLI } from '../../platform/extensionManagement/common/extensionManagementCLI.js';
import { ILanguagePackService } from '../../platform/languagePacks/common/languagePacks.js';
import { NativeLanguagePackService } from '../../platform/languagePacks/node/languagePacks.js';
import { getErrorMessage } from '../../base/common/errors.js';
import { URI } from '../../base/common/uri.js';
import { isAbsolute, join } from '../../base/common/path.js';
import { cwd } from '../../base/common/process.js';
import { DownloadService } from '../../platform/download/common/downloadService.js';
import { IDownloadService } from '../../platform/download/common/download.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService.js';
import { buildHelpMessage, buildVersionMessage, OptionDescriptions } from '../../platform/environment/node/argv.js';
import { isWindows } from '../../base/common/platform.js';
import { IExtensionsScannerService } from '../../platform/extensionManagement/common/extensionsScannerService.js';
import { ExtensionsScannerService } from './extensionsScannerService.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { IExtensionsProfileScannerService } from '../../platform/extensionManagement/common/extensionsProfileScannerService.js';
import { NullPolicyService } from '../../platform/policy/common/policy.js';
import { ServerUserDataProfilesService } from '../../platform/userDataProfile/node/userDataProfile.js';
import { ExtensionsProfileScannerService } from '../../platform/extensionManagement/node/extensionsProfileScannerService.js';
import { LogService } from '../../platform/log/common/logService.js';
import { LoggerService } from '../../platform/log/node/loggerService.js';
import { localize } from '../../nls.js';
import { addUNCHostToAllowlist, disableUNCAccessRestrictions } from '../../base/node/unc.js';

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
			const configurationService = accessor.get(IConfigurationService);
			const logService = accessor.get(ILogService);

			// On Windows, configure the UNC allow list based on settings
			if (isWindows) {
				if (configurationService.getValue('security.restrictUNCAccess') === false) {
					disableUNCAccessRestrictions();
				} else {
					addUNCHostToAllowlist(configurationService.getValue('security.allowedUNCHosts'));
				}
			}

			try {
				await this.doRun(instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(logService.getLevel(), false)));
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

		const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
		services.set(ILoggerService, loggerService);

		const logService = new LogService(this._register(loggerService.createLogger('remoteCLI', { name: localize('remotecli', "Remote CLI") })));
		services.set(ILogService, logService);
		logService.trace(`Remote configuration data at ${this.remoteDataFolder}`);
		logService.trace('process arguments:', this.args);

		// Files
		const fileService = this._register(new FileService(logService));
		services.set(IFileService, fileService);
		fileService.registerProvider(Schemas.file, this._register(new DiskFileSystemProvider(logService)));

		const uriIdentityService = new UriIdentityService(fileService);
		services.set(IUriIdentityService, uriIdentityService);

		// User Data Profiles
		const userDataProfilesService = this._register(new ServerUserDataProfilesService(uriIdentityService, environmentService, fileService, logService));
		services.set(IUserDataProfilesService, userDataProfilesService);

		// Configuration
		const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, new NullPolicyService(), logService));
		services.set(IConfigurationService, configurationService);

		// Initialize
		await Promise.all([
			configurationService.initialize(),
			userDataProfilesService.init()
		]);

		services.set(IRequestService, new SyncDescriptor(RequestService, [new NullLogger()]));
		services.set(IDownloadService, new SyncDescriptor(DownloadService));
		services.set(ITelemetryService, NullTelemetryService);
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryServiceWithNoStorageService));
		services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService));
		services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService));
		services.set(IExtensionSignatureVerificationService, new SyncDescriptor(ExtensionSignatureVerificationService));
		services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService));
		services.set(ILanguagePackService, new SyncDescriptor(NativeLanguagePackService));

		return new InstantiationService(services);
	}

	private async doRun(extensionManagementCLI: ExtensionManagementCLI): Promise<void> {

		// List Extensions
		if (this.args['list-extensions']) {
			return extensionManagementCLI.listExtensions(!!this.args['show-versions'], this.args['category']);
		}

		// Install Extension
		else if (this.args['install-extension'] || this.args['install-builtin-extension']) {
			const installOptions: InstallOptions = { isMachineScoped: !!this.args['do-not-sync'], installPreReleaseVersion: !!this.args['pre-release'] };
			return extensionManagementCLI.installExtensions(this.asExtensionIdOrVSIX(this.args['install-extension'] || []), this.asExtensionIdOrVSIX(this.args['install-builtin-extension'] || []), installOptions, !!this.args['force']);
		}

		// Uninstall Extension
		else if (this.args['uninstall-extension']) {
			return extensionManagementCLI.uninstallExtensions(this.asExtensionIdOrVSIX(this.args['uninstall-extension']), !!this.args['force']);
		}

		// Update the installed extensions
		else if (this.args['update-extensions']) {
			return extensionManagementCLI.updateExtensions();
		}

		// Locate Extension
		else if (this.args['locate-extension']) {
			return extensionManagementCLI.locateExtension(this.args['locate-extension']);
		}
	}

	private asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
	}
}

function eventuallyExit(code: number): void {
	setTimeout(() => process.exit(code), 0);
}

export async function run(args: ServerParsedArgs, REMOTE_DATA_FOLDER: string, optionDescriptions: OptionDescriptions<ServerParsedArgs>): Promise<void> {
	if (args.help) {
		const executable = product.serverApplicationName + (isWindows ? '.cmd' : '');
		console.log(buildHelpMessage(product.nameLong, executable, product.version, optionDescriptions, { noInputFiles: true, noPipe: true }));
		return;
	}
	// Version Info
	if (args.version) {
		console.log(buildVersionMessage(product.version, product.commit));
		return;
	}


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
