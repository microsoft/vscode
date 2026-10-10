/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigurationScope } from 'vscode';
import { ExperimentBasedConfig, ExperimentBasedConfigType, IConfigurationService } from '../../configuration/common/configurationService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { derived, DebugOwner, IObservable } from '../../../util/vs/base/common/observable';

/**
 * Resolves a knob that a NES model configuration is allowed to bake in.
 *
 * Precedence is user setting > experiment treatment > model configuration > setting default. A
 * prompting strategy bakes in the values its model was tuned for, but only as a *default*: an
 * experiment must stay able to move the knob in the field, and a user who sets it explicitly must
 * still win.
 *
 * @remark `key` must not be contributed in `package.json`. For contributed settings tagged `onExp`,
 * VS Code folds the treatment into the default value, which would put `modelConfigValue` above the
 * experiment again.
 */
export function resolveModelConfigValue<T extends ExperimentBasedConfigType>(
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	key: ExperimentBasedConfig<T>,
	modelConfigValue: T | undefined,
	scope?: ConfigurationScope,
): T {
	const explicitValue = configurationService.getExperimentBasedConfigIfSet(key, experimentationService, scope);
	if (explicitValue !== undefined) {
		return explicitValue;
	}
	return modelConfigValue !== undefined ? modelConfigValue : configurationService.getDefaultValue(key);
}

/**
 * Observable form of {@link resolveModelConfigValue}, for knobs that are read while building a
 * reactive graph rather than per request. Reading the imperative form inside an `autorun` would not
 * subscribe to it, so a treatment arriving after the graph was built would go unnoticed.
 */
export function observeModelConfigValue<T extends ExperimentBasedConfigType>(
	owner: DebugOwner,
	configurationService: IConfigurationService,
	experimentationService: IExperimentationService,
	key: ExperimentBasedConfig<T>,
	modelConfigValue: IObservable<T | undefined>,
): IObservable<T> {
	const explicitValue = configurationService.getExperimentBasedConfigIfSetObservable(key, experimentationService);
	return derived(owner, reader => {
		const explicit = explicitValue.read(reader);
		if (explicit !== undefined) {
			return explicit;
		}
		const fromModel = modelConfigValue.read(reader);
		return fromModel !== undefined ? fromModel : configurationService.getDefaultValue(key);
	});
}
