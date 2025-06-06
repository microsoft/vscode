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
	walkthroughId: string;
	iteration: number;
}

export const IGettingStartedExperimentService = createDecorator<IGettingStartedExperimentService>('gettingStartedExperimentService');

export interface IGettingStartedExperimentService {
	readonly _serviceBrand: undefined;
	getCurrentExperiment(): IGettingStartedExperiment | undefined;
}

const EXPERIMENT_STORAGE_KEY = 'gettingStartedExperiment';

interface ExperimentGroupDefinition {
	name: string;
	min: number;
	max: number;
	iteration: number;
	walkthroughId: string;
}

export enum GettingStartedExperimentGroup {
	New = 'newExp',
	Control = 'controlExp',
	Default = 'defaultExp'
}

const STABLE_EXPERIMENT_GROUPS: ExperimentGroupDefinition[] = [
	// Bump the iteration each time we change group allocations
	{ name: GettingStartedExperimentGroup.New, min: 0.0, max: 0.2, iteration: 1, walkthroughId: 'NewWelcomeExperience' },
	{ name: GettingStartedExperimentGroup.Control, min: 0.2, max: 0.4, iteration: 1, walkthroughId: 'Setup' },
	{ name: GettingStartedExperimentGroup.Default, min: 0.4, max: 1, iteration: 1, walkthroughId: 'Setup' }
];

const INSIDERS_EXPERIMENT_GROUPS: ExperimentGroupDefinition[] = [
	// Bump the iteration each time we change group allocations
	{ name: GettingStartedExperimentGroup.New, min: 0.0, max: 0.3, iteration: 1, walkthroughId: 'NewWelcomeExperience' },
	{ name: GettingStartedExperimentGroup.Control, min: 0.3, max: 0.6, iteration: 1, walkthroughId: 'Setup' },
	{ name: GettingStartedExperimentGroup.Default, min: 0.6, max: 1, iteration: 1, walkthroughId: 'Setup' }
];

export class GettingStartedExperimentService extends Disposable implements IGettingStartedExperimentService {
	declare readonly _serviceBrand: undefined;

	private readonly experiment: IGettingStartedExperiment | undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		this.experiment = this.getOrCreateExperiment();
		this.sendExperimentTelemetry();
	}

	private getExperimentAllocation(): ExperimentGroupDefinition[] | undefined {
		const quality = this.productService.quality;
		if (quality === 'stable') {
			return STABLE_EXPERIMENT_GROUPS;
		} else if (quality === 'insider') {
			return INSIDERS_EXPERIMENT_GROUPS;
		}
		return;
	}

	private getOrCreateExperiment(): IGettingStartedExperiment | undefined {
		const storedExperiment = this.storageService.get(EXPERIMENT_STORAGE_KEY, StorageScope.APPLICATION);
		if (storedExperiment) {
			try {
				return JSON.parse(storedExperiment);
			} catch (e) {
				this.storageService.remove(EXPERIMENT_STORAGE_KEY, StorageScope.APPLICATION);
			}
		}

		const newExperiment = this.createNewExperiment();
		if (!newExperiment) {
			return;
		}

		this.storageService.store(
			EXPERIMENT_STORAGE_KEY,
			JSON.stringify(newExperiment),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);

		return newExperiment;
	}

	private createNewExperiment(): IGettingStartedExperiment | undefined {
		const cohort = Math.random();
		const experimentGroups = this.getExperimentAllocation();
		if (!experimentGroups) {
			return;
		}

		for (const group of experimentGroups) {
			if (cohort >= group.min && cohort < group.max) {
				return { cohort, experimentGroup: group.name, walkthroughId: group.walkthroughId, iteration: group.iteration };
			}
		}

		return;
	}

	private sendExperimentTelemetry(): void {
		if (!this.experiment) {
			return;
		}

		type GettingStartedExperimentClassification = {
			owner: 'bhavyaus';
			comment: 'Records which experiment cohort the user is in for getting started experience';
			cohort: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The exact cohort number for the user' };
			experimentGroup: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The experiment group the user is in' };
			iteration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The iteration number for the experiment' };
			walkthroughId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The walkthrough ID for the experiment' };
		};

		type GettingStartedExperimentEvent = {
			cohort: number;
			experimentGroup: string;
			iteration: number;
			walkthroughId: string;
		};

		this.telemetryService.publicLog2<GettingStartedExperimentEvent, GettingStartedExperimentClassification>(
			'gettingStarted.experimentCohort',
			{
				cohort: this.experiment.cohort,
				experimentGroup: this.experiment.experimentGroup,
				iteration: this.experiment.iteration,
				walkthroughId: this.experiment.walkthroughId
			}
		);
	}

	getCurrentExperiment(): IGettingStartedExperiment | undefined {
		return this.experiment;
	}
}

registerSingleton(IGettingStartedExperimentService, GettingStartedExperimentService, InstantiationType.Delayed);
