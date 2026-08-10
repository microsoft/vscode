/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelConfiguration } from './dataTypes/xtabPromptOptions';
import type { ExperimentBasedConfig, ExperimentBasedConfigType, IConfigurationService } from '../../configuration/common/configurationService';
import type { IExperimentationService } from '../../telemetry/common/nullExperimentationService';

export enum InlineEditsUnification {
	CompletionsNes = 'completionsNes',
}

/**
 * Configuration options used for Unified Completions + NES models.
 */
export interface InlineEditsUnificationConfiguration {
	readonly nLinesBelow: number;
	readonly nLinesAbove: number;
	readonly unification: boolean;
	readonly rebasedCacheDelay: number;
	readonly extraDebounceEndOfLine: number;
	readonly debounce: number;
	readonly cacheDelay: number;
}

export const COMPLETIONS_NES_UNIFICATION_DEFAULTS: InlineEditsUnificationConfiguration = {
	nLinesBelow: 7,
	nLinesAbove: 0,
	unification: true,
	rebasedCacheDelay: 0,
	extraDebounceEndOfLine: 0,
	debounce: 0,
	cacheDelay: 200,
};

export function getInlineEditsUnificationDefaults(config: ModelConfiguration | null | undefined): InlineEditsUnificationConfiguration | undefined {
	return config?.unification === InlineEditsUnification.CompletionsNes
		? COMPLETIONS_NES_UNIFICATION_DEFAULTS
		: undefined;
}

export function getInlineEditsConfigWithDefault<T extends ExperimentBasedConfigType>(
	configurationService: IConfigurationService,
	key: ExperimentBasedConfig<T>,
	experimentationService: IExperimentationService,
	defaultValue: T,
): T {
	if (configurationService.isConfigured(key)) {
		return configurationService.getExperimentBasedConfig(key, experimentationService);
	}

	const experimentValue = getExperimentValue(key, experimentationService);
	if (experimentValue !== undefined) {
		return experimentValue;
	}

	const configuredValue = configurationService.getExperimentBasedConfig(key, experimentationService);
	return configuredValue !== configurationService.getDefaultValue(key) ? configuredValue : defaultValue;
}

function getExperimentValue<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService): T | undefined {
	const treatmentNames = [
		key.experimentName,
		`copilotchat.config.${key.id}`,
		`config.${key.fullyQualifiedId}`,
		key.oldId ? `copilotchat.config.${key.oldId}` : undefined,
		key.fullyQualifiedOldId ? `config.${key.fullyQualifiedOldId}` : undefined,
	];

	for (const treatmentName of treatmentNames) {
		if (treatmentName) {
			const value = experimentationService.getTreatmentVariable<Exclude<T, undefined>>(treatmentName);
			if (value !== undefined) {
				return value;
			}
		}
	}

	return undefined;
}
