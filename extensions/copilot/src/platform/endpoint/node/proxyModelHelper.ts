/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExperimentBasedConfig, IConfigurationService } from '../../configuration/common/configurationService';
import { IProxyModelsService } from '../../proxyModels/common/proxyModelsService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';

/**
 * Determines which model to use for instant apply endpoints.
 * Uses the proxy models service when available, falling back to the config-based model name.
 */
export function getInstantApplyModel(
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	proxyModelsService: IProxyModelsService,
	modelNameConfig: ExperimentBasedConfig<string>,
): string {
	const instantApplyModels = proxyModelsService.instantApplyModels;

	return (instantApplyModels && instantApplyModels.length > 0)
		? instantApplyModels[0].name
		: configurationService.getExperimentBasedConfig(modelNameConfig, experimentationService);
}
