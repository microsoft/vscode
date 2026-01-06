/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';

/**
 * Determines if experiment properties will be set on telemetry events.
 * When true, TelemetryService should buffer events until setExperimentProperty is called.
 */
export function experimentsEnabled(
	configurationService: IConfigurationService,
	productService: IProductService,
	environmentService: IWorkbenchEnvironmentService
): boolean {
	return getTelemetryLevel(configurationService) === TelemetryLevel.USAGE &&
		!!productService.tasConfig &&
		!environmentService.disableExperiments &&
		!environmentService.extensionTestsLocationURI &&
		!environmentService.enableSmokeTestDriver &&
		configurationService.getValue('workbench.enableExperiments') === true;
}
