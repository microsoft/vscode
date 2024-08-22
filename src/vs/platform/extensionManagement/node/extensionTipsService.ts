/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionManagementService } from '../common/extensionManagement';
import { IFileService } from '../../files/common/files';
import { IProductService } from '../../product/common/productService';
import { INativeEnvironmentService } from '../../environment/common/environment';
import { IExtensionRecommendationNotificationService } from '../../extensionRecommendations/common/extensionRecommendations';
import { INativeHostService } from '../../native/common/native';
import { IStorageService } from '../../storage/common/storage';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { AbstractNativeExtensionTipsService } from '../common/extensionTipsService';

export class ExtensionTipsService extends AbstractNativeExtensionTipsService {

	constructor(
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@IStorageService storageService: IStorageService,
		@INativeHostService nativeHostService: INativeHostService,
		@IExtensionRecommendationNotificationService extensionRecommendationNotificationService: IExtensionRecommendationNotificationService,
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
	) {
		super(environmentService.userHome, nativeHostService, telemetryService, extensionManagementService, storageService, extensionRecommendationNotificationService, fileService, productService);
	}
}
