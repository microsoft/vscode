/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ILocalExtension, IExtensionGalleryService, InstallOptions } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { URI } from '../../../../base/common/uri.js';
import { ExtensionManagementService as BaseExtensionManagementService } from '../common/extensionManagementService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IExtensionManagementServer, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../common/extensionManagement.js';
import { Schemas } from '../../../../base/common/network.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDownloadService } from '../../../../platform/download/common/download.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspaceTrustRequestService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IExtensionsScannerService } from '../../../../platform/extensionManagement/common/extensionsScannerService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';

export class ExtensionManagementService extends BaseExtensionManagementService {

	constructor(
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IConfigurationService configurationService: IConfigurationService,
		@IProductService productService: IProductService,
		@IDownloadService downloadService: IDownloadService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IDialogService dialogService: IDialogService,
		@IWorkspaceTrustRequestService workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionsScannerService extensionsScannerService: IExtensionsScannerService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(
			extensionManagementServerService,
			extensionGalleryService,
			userDataProfileService,
			configurationService,
			productService,
			downloadService,
			userDataSyncEnablementService,
			dialogService,
			workspaceTrustRequestService,
			extensionManifestPropertiesService,
			fileService,
			logService,
			instantiationService,
			extensionsScannerService,
			telemetryService
		);
	}

	protected override async installVSIXInServer(vsix: URI, server: IExtensionManagementServer, options: InstallOptions | undefined): Promise<ILocalExtension> {
		if (vsix.scheme === Schemas.vscodeRemote && server === this.extensionManagementServerService.localExtensionManagementServer) {
			const downloadedLocation = joinPath(this.environmentService.tmpDir, generateUuid());
			await this.downloadService.download(vsix, downloadedLocation);
			vsix = downloadedLocation;
		}
		return super.installVSIXInServer(vsix, server, options);
	}
}

registerSingleton(IWorkbenchExtensionManagementService, ExtensionManagementService, InstantiationType.Delayed);
