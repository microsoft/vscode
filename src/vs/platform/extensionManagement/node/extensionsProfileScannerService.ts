/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { AbstractExtensionsProfileScannerService } from '../common/extensionsProfileScannerService';
import { IFileService } from '../../files/common/files';
import { INativeEnvironmentService } from '../../environment/common/environment';
import { URI } from '../../../base/common/uri';

export class ExtensionsProfileScannerService extends AbstractExtensionsProfileScannerService {
	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super(URI.file(environmentService.extensionsPath), fileService, userDataProfilesService, uriIdentityService, telemetryService, logService);
	}
}
