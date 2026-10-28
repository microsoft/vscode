/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { AbstractExtensionsProfileScannerService, IProfileExtensionsScanOptions, IScannedProfileExtension } from '../common/extensionsProfileScannerService.js';
import { IFileService } from '../../files/common/files.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { URI } from '../../../base/common/uri.js';
import { getExtensionManagementStoreCoordinator } from './extensionManagementStoreCoordinator.js';

export class ExtensionsProfileScannerService extends AbstractExtensionsProfileScannerService {
	override scanProfileExtensions(profileLocation: URI, options?: IProfileExtensionsScanOptions): Promise<IScannedProfileExtension[]> {
		// Take the global read lock before the per-profile queue. Mutations use the same order.
		return getExtensionManagementStoreCoordinator().withRead(() => super.scanProfileExtensions(profileLocation, options));
	}

	protected override withStoreMutation<T>(task: () => Promise<T>): Promise<T> {
		return getExtensionManagementStoreCoordinator().withMutation(task);
	}

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
	) {
		super(URI.file(environmentService.extensionsPath), fileService, userDataProfilesService, uriIdentityService, logService);
	}
}
