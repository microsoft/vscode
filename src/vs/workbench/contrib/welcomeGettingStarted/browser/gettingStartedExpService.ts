/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

export interface IGettingStartedExperiment {
	cohort: number;
	experimentGroup: string;
}

export const IGettingStartedExperimentService = createDecorator<IGettingStartedExperimentService>('gettingStartedExperimentService');

export interface IGettingStartedExperimentService {
	readonly _serviceBrand: undefined;
	getCurrentExperiment(): IGettingStartedExperiment;
}

const EXPERIMENT_STORAGE_KEY = 'gettingStartedExperiment';

interface ExperimentGroupDefinition {
	name: string;
	min: number;
	max: number;
}

export enum GettingStartedExperimentGroup {
	New = 'newExp',
	Default = 'defaultExp'
}

const STABLE_EXPERIMENT_GROUPS: ExperimentGroupDefinition[] = [
	// { name: GettingStartedExperimentGroup.New, min: 0.0, max: 0.1 },
	//{ name: GettingStartedExperimentGroup.Default, min: 0.1, max: 1.0 }
	{ name: GettingStartedExperimentGroup.Default, min: 0.0, max: 1.0 }
];

const INSIDERS_EXPERIMENT_GROUPS: ExperimentGroupDefinition[] = [
	// { name: GettingStartedExperimentGroup.New, min: 0.0, max: 0.3 },
	//{ name: GettingStartedExperimentGroup.Default, min: 0.3, max: 1.0 }
	{ name: GettingStartedExperimentGroup.Default, min: 0.0, max: 1.0 }
];

const DEFAULT_EXPERIMENT_GROUPS: ExperimentGroupDefinition[] = [
	{ name: GettingStartedExperimentGroup.Default, min: 0.0, max: 1.0 }
];

export class GettingStartedExperimentService extends Disposable implements IGettingStartedExperimentService {
	declare readonly _serviceBrand: undefined;

	private readonly experiment: IGettingStartedExperiment;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		this.experiment = this.getOrCreateExperiment();
		this.sendExperimentTelemetry();
	}

	private getExperimentAllocation(): ExperimentGroupDefinition[] {
		const quality = this.productService.quality;
		if (quality === 'stable') {
			return STABLE_EXPERIMENT_GROUPS;
		} else if (quality === 'insider') {
			return INSIDERS_EXPERIMENT_GROUPS;
		} else {
			return DEFAULT_EXPERIMENT_GROUPS;
		}
	}

	private getOrCreateExperiment(): IGettingStartedExperiment {
		const storedExperiment = this.storageService.get(EXPERIMENT_STORAGE_KEY, StorageScope.APPLICATION);
		if (storedExperiment) {
			try {
				return JSON.parse(storedExperiment);
			} catch (e) {
				this.storageService.remove(EXPERIMENT_STORAGE_KEY, StorageScope.APPLICATION);
			}
		}

		const newExperiment = this.createNewExperiment();

		this.storageService.store(
			EXPERIMENT_STORAGE_KEY,
			JSON.stringify(newExperiment),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);

		return newExperiment;
	}

	private createNewExperiment(): IGettingStartedExperiment {
		const cohort = Math.random();
		const experimentGroups = this.getExperimentAllocation();

		let experimentGroup = GettingStartedExperimentGroup.Default;
		for (const group of experimentGroups) {
			if (cohort >= group.min && cohort < group.max) {
				experimentGroup = group.name as GettingStartedExperimentGroup;
				break;
			}
		}

		return { cohort, experimentGroup };
	}

	private sendExperimentTelemetry(): void {
		type GettingStartedExperimentClassification = {
			owner: 'bhavyaus';
			comment: 'Records which experiment cohort the user is in for getting started experience';
			cohort: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The exact cohort number for the user' };
			experimentGroup: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The experiment group the user is in' };
		};

		type GettingStartedExperimentEvent = {
			cohort: number;
			experimentGroup: string;
		};

		this.telemetryService.publicLog2<GettingStartedExperimentEvent, GettingStartedExperimentClassification>(
			'gettingStarted.experimentCohort',
			{
				cohort: this.experiment.cohort,
				experimentGroup: this.experiment.experimentGroup
			}
		);
	}

	getCurrentExperiment(): IGettingStartedExperiment {
		return this.experiment;
	}
}

registerSingleton(IGettingStartedExperimentService, GettingStartedExperimentService, InstantiationType.Delayed);
