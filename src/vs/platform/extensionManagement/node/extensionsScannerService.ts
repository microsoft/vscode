/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri';
import { INativeEnvironmentService } from '../../environment/common/environment';
import { IExtensionsProfileScannerService } from '../common/extensionsProfileScannerService';
import { IExtensionsScannerService, NativeExtensionsScannerService, } from '../common/extensionsScannerService';
import { IFileService } from '../../files/common/files';
import { IInstantiationService } from '../../instantiation/common/instantiation';
import { ILogService } from '../../log/common/log';
import { IProductService } from '../../product/common/productService';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile';

export class ExtensionsScannerService extends NativeExtensionsScannerService implements IExtensionsScannerService {

	constructor(
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
			userDataProfilesService.defaultProfile,
			userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService);
	}

}
