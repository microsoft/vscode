/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export interface ITelemetryExperiments {
}

const defaultExperiments: ITelemetryExperiments = {
};

export function loadExperiments(accessor?: ServicesAccessor): ITelemetryExperiments {

	// shortcut since there are currently no experiments (should introduce separate service to load only once)
	if (!accessor) {
		return {};
	}

	const storageService = accessor.get(IStorageService);
	const configurationService = accessor.get(IConfigurationService);

	let {
	} = splitExperimentsRandomness(storageService);

	return applyOverrides(defaultExperiments, configurationService);
}

function applyOverrides(experiments: ITelemetryExperiments, configurationService: IConfigurationService): ITelemetryExperiments {
	const experimentsConfig = getExperimentsOverrides(configurationService);
	Object.keys(experiments).forEach(key => {
		if (key in experimentsConfig) {
			experiments[key] = experimentsConfig[key];
		}
	});
	return experiments;
}

function splitExperimentsRandomness(storageService: IStorageService): ITelemetryExperiments {
	const random1 = getExperimentsRandomness(storageService);
	const [random2, /* showTaskDocumentation */] = splitRandom(random1);
	const [random3, /* openUntitledFile */] = splitRandom(random2);
	const [random4, /* mergeQuickLinks */] = splitRandom(random3);
	// tslint:disable-next-line:no-unused-variable (https://github.com/Microsoft/TypeScript/issues/16628)
	const [random5, /* enableWelcomePage */] = splitRandom(random4);
	return {
	};
}

function getExperimentsRandomness(storageService: IStorageService) {
	const key = 'experiments.randomness';
	let valueString = storageService.get(key);
	if (!valueString) {
		valueString = Math.random().toString();
		storageService.store(key, valueString);
	}

	return parseFloat(valueString);
}

function splitRandom(random: number): [number, boolean] {
	const scaled = random * 2;
	const i = Math.floor(scaled);
	return [scaled - i, i === 1];
}

function getExperimentsOverrides(configurationService: IConfigurationService): ITelemetryExperiments {
	const config: any = configurationService.getConfiguration('telemetry');
	return config && config.experiments || {};
}
