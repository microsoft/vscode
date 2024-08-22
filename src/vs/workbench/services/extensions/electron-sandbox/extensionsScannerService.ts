/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment';
import { IExtensionsProfileScannerService } from '../../../../platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService, NativeExtensionsScannerService, } from '../../../../platform/extensionManagement/common/extensionsScannerService';
import { IFileService } from '../../../../platform/files/common/files';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { ILogService } from '../../../../platform/log/common/log';
import { IProductService } from '../../../../platform/product/common/productService';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile';

export class ExtensionsScannerService extends NativeExtensionsScannerService implements IExtensionsScannerService {

	constructor(
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IExtensionsProfileScannerService extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IProductService productService: IProductService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(
			URI.file(environmentService.builtinExtensionsPath),
			URI.file(environmentService.extensionsPath),
			environmentService.userHome,
			userDataProfileService.currentProfile,
			userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService);
	}

}

registerSingleton(IExtensionsScannerService, ExtensionsScannerService, InstantiationType.Delayed);
