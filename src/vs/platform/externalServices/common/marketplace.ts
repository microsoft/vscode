/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHeaders } from '../../../base/parts/request/common/request.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { getServiceMachineId } from './serviceMachineId.js';
import { IFileService } from '../../files/common/files.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService, TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { getTelemetryLevel, supportsTelemetry } from '../../telemetry/common/telemetryUtils.js';

export async function resolveMarketplaceHeaders(version: string,
	productService: IProductService,
	environmentService: IEnvironmentService,
	configurationService: IConfigurationService,
	fileService: IFileService,
	storageService: IStorageService | undefined,
	telemetryService: ITelemetryService): Promise<IHeaders> {

	const headers: IHeaders = {
		'X-Market-Client-Id': `VSCode ${version}`,
		'User-Agent': `VSCode ${version} (${productService.nameShort})`
	};

	if (supportsTelemetry(productService, environmentService) && getTelemetryLevel(configurationService) === TelemetryLevel.USAGE) {
		const serviceMachineId = await getServiceMachineId(environmentService, fileService, storageService);
		headers['X-Market-User-Id'] = serviceMachineId;
		// Send machineId as VSCode-SessionId so we can correlate telemetry events across different services
		// machineId can be undefined sometimes (eg: when launching from CLI), so send serviceMachineId instead otherwise
		// Marketplace will reject the request if there is no VSCode-SessionId header
		headers['VSCode-SessionId'] = telemetryService.machineId || serviceMachineId;
	}

	return headers;
}
