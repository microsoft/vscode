/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineEditsUnification, type ModelConfiguration } from './dataTypes/xtabPromptOptions';
import { ConfigKey, type ExperimentBasedConfig, type IConfigurationService } from '../../configuration/common/configurationService';
import type { IExperimentationService } from '../../telemetry/common/nullExperimentationService';

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

export const DEFAULT_INLINE_EDITS_UNIFICATION_CONFIGURATION: InlineEditsUnificationConfiguration = {
	nLinesBelow: 5,
	nLinesAbove: 2,
	unification: false,
	rebasedCacheDelay: 0,
	extraDebounceEndOfLine: 2000,
	debounce: 100,
	cacheDelay: 200,
};

const COMPLETIONS_NES_UNIFICATION_DEFAULTS: InlineEditsUnificationConfiguration = {
	nLinesBelow: 7,
	nLinesAbove: 0,
	unification: true,
	rebasedCacheDelay: 0,
	extraDebounceEndOfLine: 0,
	debounce: 0,
	cacheDelay: 200,
};

export function resolveInlineEditsUnificationConfiguration(
	modelConfiguration: ModelConfiguration,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
): InlineEditsUnificationConfiguration {
	const defaults = modelConfiguration.unification === InlineEditsUnification.CompletionsNes
		? COMPLETIONS_NES_UNIFICATION_DEFAULTS
		: DEFAULT_INLINE_EDITS_UNIFICATION_CONFIGURATION;

	return {
		nLinesBelow: getConfigWithDefault(configurationService, ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesBelow, experimentationService, defaults.nLinesBelow),
		nLinesAbove: getConfigWithDefault(configurationService, ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesAbove, experimentationService, defaults.nLinesAbove),
		unification: getConfigWithDefault(configurationService, ConfigKey.TeamInternal.InlineEditsUnification, experimentationService, defaults.unification),
		rebasedCacheDelay: getConfigWithDefault(configurationService, ConfigKey.TeamInternal.InlineEditsRebasedCacheDelay, experimentationService, defaults.rebasedCacheDelay),
		extraDebounceEndOfLine: getConfigWithDefault(configurationService, ConfigKey.TeamInternal.InlineEditsExtraDebounceEndOfLine, experimentationService, defaults.extraDebounceEndOfLine),
		debounce: getConfigWithDefault(configurationService, ConfigKey.TeamInternal.InlineEditsDebounce, experimentationService, defaults.debounce),
		cacheDelay: getConfigWithDefault(configurationService, ConfigKey.TeamInternal.InlineEditsCacheDelay, experimentationService, defaults.cacheDelay),
	};
}

function getConfigWithDefault<T extends boolean | number | string>(
	configurationService: IConfigurationService,
	key: ExperimentBasedConfig<T | undefined>,
	experimentationService: IExperimentationService,
	defaultValue: T,
): T {
	if (configurationService.isConfigured(key)) {
		return configurationService.getExperimentBasedConfig(key, experimentationService) ?? defaultValue;
	}

	const value = configurationService.getExperimentBasedConfig(key, experimentationService);
	if (value !== configurationService.getDefaultValue(key)) {
		return value ?? defaultValue;
	}

	return defaultValue;
}
