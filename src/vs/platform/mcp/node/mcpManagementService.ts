/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IMcpGalleryService, IMcpManagementService } from '../common/mcpManagement.js';
import { McpUserResourceManagementService as CommonMcpUserResourceManagementService, McpManagementService as CommonMcpManagementService } from '../common/mcpManagementService.js';
import { IMcpResourceScannerService } from '../common/mcpResourceScannerService.js';


export class McpUserResourceManagementService extends CommonMcpUserResourceManagementService {
	constructor(
		mcpResource: URI,
		@IMcpGalleryService mcpGalleryService: IMcpGalleryService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
		@IMcpResourceScannerService mcpResourceScannerService: IMcpResourceScannerService,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, environmentService);
	}
}

export class McpManagementService extends CommonMcpManagementService implements IMcpManagementService {
	protected override createMcpResourceManagementService(mcpResource: URI): McpUserResourceManagementService {
		return this.instantiationService.createInstance(McpUserResourceManagementService, mcpResource);
	}
}
