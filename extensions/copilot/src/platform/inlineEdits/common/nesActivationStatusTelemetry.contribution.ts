/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';

export class NesActivationTelemetryContribution {

	constructor(
		@ITelemetryService _telemetryService: ITelemetryService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IExperimentationService _expService: IExperimentationService,
	) {
		const completionsConfigValue = _configurationService.getConfig(ConfigKey.Enable);
		const isCompletionsEnabled = '*' in completionsConfigValue ? completionsConfigValue['*'] : true /* matches ghost-text Copilot extensions behavior */;
		const isCompletionsUserConfigured = _configurationService.isConfigured(ConfigKey.Enable);

		const isNesEnabled = _configurationService.getExperimentBasedConfig(ConfigKey.InlineEditsEnabled, _expService);
		const isNesUserConfigured = _configurationService.isConfigured(ConfigKey.InlineEditsEnabled);

		/* __GDPR__
			"nesStatusOnActivation" : {
				"owner": "ulugbekna",
				"comment": "To identify if NES was enabled by the user when extension is activated",
				"isCompletionsEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether ghost-text completions was effectively enabled", "isMeasurement": true },
				"isCompletionsUserConfigured": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether ghost-text completions was configured by the user", "isMeasurement": true },
				"isNesEnabled": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether NES was effectively enabled (e.g., by nes-by-default exp)", "isMeasurement": true },
				"isNesUserConfigured": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the Inline Edits feature is configured by the user", "isMeasurement": true }
			}
		*/
		_telemetryService.sendMSFTTelemetryEvent(
			'nesStatusOnActivation',
			{},
			{
				isCompletionsEnabled: toNumber(isCompletionsEnabled),
				isCompletionsUserConfigured: toNumber(isCompletionsUserConfigured),
				isNesEnabled: toNumber(isNesEnabled),
				isNesUserConfigured: toNumber(isNesUserConfigured),
			}
		);
	}
}

function toNumber(v: boolean): 1 | 0 {
	return v ? 1 : 0;
}
