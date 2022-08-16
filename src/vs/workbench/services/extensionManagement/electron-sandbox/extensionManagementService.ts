/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from 'vs/base/common/uuid';
import { ILocalExtension, IExtensionGalleryService, InstallVSIXOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { ExtensionManagementService as BaseExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagementService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionManagementServer, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDownloadService } from 'vs/platform/download/common/download';
import { IProductService } from 'vs/platform/product/common/productService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { joinPath } from 'vs/base/common/resources';
import { IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';

export class ExtensionManagementService extends BaseExtensionManagementService {

	constructor(
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
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
	) {
		super(extensionManagementServerService, extensionGalleryService, configurationService, productService, downloadService, userDataSyncEnablementService, dialogService, workspaceTrustRequestService, extensionManifestPropertiesService, fileService, logService, instantiationService);
	}

	protected override async installVSIXInServer(vsix: URI, server: IExtensionManagementServer, options: InstallVSIXOptions | undefined): Promise<ILocalExtension> {
		if (vsix.scheme === Schemas.vscodeRemote && server === this.extensionManagementServerService.localExtensionManagementServer) {
			const downloadedLocation = joinPath(this.environmentService.tmpDir, generateUuid());
			await this.downloadService.download(vsix, downloadedLocation);
			vsix = downloadedLocation;
		}
		return super.installVSIXInServer(vsix, server, options);
	}
}

registerSingleton(IWorkbenchExtensionManagementService, ExtensionManagementService, false);
