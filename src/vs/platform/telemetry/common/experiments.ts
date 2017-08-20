/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IExperiments {
	deployToAzureQuickLink: boolean;
}

export const IExperimentService = createDecorator<IExperimentService>('experimentService');

export interface IExperimentService {

	_serviceBrand: any;

	getExperiments(): IExperiments;
}

export class ExperimentService implements IExperimentService {

	_serviceBrand: any;

	private experiments: IExperiments;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService,
	) { }

	getExperiments() {
		if (!this.experiments) {
			this.experiments = loadExperiments(this.storageService, this.configurationService);
		}
		return this.experiments;
	}
}

function loadExperiments(storageService: IStorageService, configurationService: IConfigurationService): IExperiments {
	const experiments = splitExperimentsRandomness(storageService);
	return applyOverrides(experiments, configurationService);
}

function applyOverrides(experiments: IExperiments, configurationService: IConfigurationService): IExperiments {
	const experimentsConfig = getExperimentsOverrides(configurationService);
	Object.keys(experiments).forEach(key => {
		if (key in experimentsConfig) {
			experiments[key] = experimentsConfig[key];
		}
	});
	return experiments;
}

function splitExperimentsRandomness(storageService: IStorageService): IExperiments {
	const random1 = getExperimentsRandomness(storageService);
	const [random2, /* showTaskDocumentation */] = splitRandom(random1);
	const [/* random3 */, deployToAzureQuickLink] = splitRandom(random2);
	// const [random4, /* mergeQuickLinks */] = splitRandom(random3);
	// const [random5, /* enableWelcomePage */] = splitRandom(random4);
	return {
		deployToAzureQuickLink
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

function getExperimentsOverrides(configurationService: IConfigurationService): IExperiments {
	const config: any = configurationService.getConfiguration('telemetry');
	return config && config.experiments || {};
}
