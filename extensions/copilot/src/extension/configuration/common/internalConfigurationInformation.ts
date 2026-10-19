/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Config, ExperimentBasedConfig, ExperimentBasedConfigType } from '../../../platform/configuration/common/configurationService';

export interface IInternalConfigurationPropertyInformation {
	defaultValue: unknown;
}

export interface IInternalConfigurationInformation {
	[id: string]: IInternalConfigurationPropertyInformation;
}

export function buildInternalConfigurationInformation(configs: Iterable<Config<unknown> | ExperimentBasedConfig<ExperimentBasedConfigType>>): IInternalConfigurationInformation {
	const configurationInformation: IInternalConfigurationInformation = {};
	for (const config of configs) {
		if (!config.options?.valueIgnoredForExternals) {
			continue;
		}
		configurationInformation[config.fullyQualifiedId] = { defaultValue: config.defaultValue };
	}
	return configurationInformation;
}
