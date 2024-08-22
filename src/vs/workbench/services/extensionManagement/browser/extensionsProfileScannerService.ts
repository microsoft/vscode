/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { AbstractExtensionsProfileScannerService, IExtensionsProfileScannerService } from '../../../../platform/extensionManagement/common/extensionsProfileScannerService';
import { IFileService } from '../../../../platform/files/common/files';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';

export class ExtensionsProfileScannerService extends AbstractExtensionsProfileScannerService {
	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super(environmentService.userRoamingDataHome, fileService, userDataProfilesService, uriIdentityService, telemetryService, logService);
	}
}

registerSingleton(IExtensionsProfileScannerService, ExtensionsProfileScannerService, InstantiationType.Delayed);
