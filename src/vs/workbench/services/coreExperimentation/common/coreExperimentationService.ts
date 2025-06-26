/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { firstSessionDateStorageKey, ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const ICoreExperimentationService = createDecorator<ICoreExperimentationService>('coreExperimentationService');
export const startupExpContext = new RawContextKey<string>('coreExperimentation.startupExpGroup', '');

interface IExperiment {
	cohort: number;
	subCohort: number; // Optional for future use
	experimentGroup: string;
	iteration: number;
	isInExperiment: boolean;
}

export interface ICoreExperimentationService {
	readonly _serviceBrand: undefined;
	getExperiment(experimentName: string): IExperiment | undefined;
}

interface IExperimentDefinition {
	name: string;
	targetPercentage: number;
	treatments: { name: string; percentage: number }[];
	iteration: number;
}

export class CoreExperimentationService extends Disposable implements ICoreExperimentationService {
	declare readonly _serviceBrand: undefined;

	private readonly experiments = new Map<string, IExperiment>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();
		this.initializeExperiments();
	}

	private initializeExperiments(): void {

		const firstSessionDateString = this.storageService.get(firstSessionDateStorageKey, StorageScope.APPLICATION) || new Date().toUTCString();
		const daysSinceFirstSession = ((+new Date()) - (+new Date(firstSessionDateString))) / 1000 / 60 / 60 / 24;
		if (daysSinceFirstSession > 1) {
			// not a startup exp candidate.
			return;
		}

		const expName = 'startupExp';
		// also check storage to see if this user has already seen the startup experience
		const storageKey = `coreExperimentation.${expName}`;
		const storedExperiment = this.storageService.get(storageKey, StorageScope.APPLICATION);
		if (storedExperiment) {
			return;
		}

		// check that this is a new launch scenario.
		const startupLayoutExperiment: IExperimentDefinition = {
			name: expName,
			targetPercentage: this.getTargetPercentage(),
			treatments: [
				{ name: 'control', percentage: 25 },
				{ name: 'maximizedChat', percentage: 25 },
				{ name: 'splitEmptyEditorChat', percentage: 25 },
				{ name: 'splitWelcomeChat', percentage: 25 }
			],
			iteration: 1
		};

		const experiment = this.createExperiment(startupLayoutExperiment, storageKey);
		if (experiment) {
			this.experiments.set(startupLayoutExperiment.name, experiment);
			this.sendExperimentTelemetry(startupLayoutExperiment.name, experiment);
			startupExpContext.bindTo(this.contextKeyService).set(experiment.experimentGroup);
		}
	}

	private getTargetPercentage(): number {
		const quality = this.productService.quality;
		if (quality === 'stable') {
			return 20;
		} else if (quality === 'insider') {
			return 20;
		}
		return 100;
	}

	private createExperiment(definition: IExperimentDefinition, storageKey: string): IExperiment | undefined {
		const newExperiment = this.createNewExperiment(definition);
		if (newExperiment) {
			this.storageService.store(
				storageKey,
				JSON.stringify(newExperiment),
				StorageScope.APPLICATION,
				StorageTarget.MACHINE
			);
		}
		return newExperiment;
	}

	private createNewExperiment(definition: IExperimentDefinition): IExperiment | undefined {
		const cohort = Math.random();

		if (cohort >= definition.targetPercentage / 100) {
			return undefined;
		}

		// Normalize the cohort to the experiment range [0, targetPercentage/100]
		const normalizedCohort = cohort / (definition.targetPercentage / 100);

		let cumulativePercentage = 0;
		for (const treatment of definition.treatments) {
			cumulativePercentage += treatment.percentage;
			if (normalizedCohort * 100 <= cumulativePercentage) {
				return {
					cohort,
					subCohort: normalizedCohort,
					experimentGroup: treatment.name,
					iteration: definition.iteration,
					isInExperiment: true
				};
			}
		}
		return undefined;
	}

	private sendExperimentTelemetry(experimentName: string, experiment: IExperiment): void {
		type ExperimentCohortClassification = {
			owner: 'bhavyaus';
			comment: 'Records which experiment cohort the user is in for core experiments';
			experimentName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the experiment' };
			cohort: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The exact cohort number for the user' };
			subCohort: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The exact sub-cohort number for the user in the experiment cohort' };
			experimentGroup: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The experiment group the user is in' };
			iteration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The iteration number for the experiment' };
			isInExperiment: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the user is in the experiment' };
		};

		type ExperimentCohortEvent = {
			experimentName: string;
			cohort: number;
			subCohort: number;
			experimentGroup: string;
			iteration: number;
			isInExperiment: boolean;
		};

		this.telemetryService.publicLog2<ExperimentCohortEvent, ExperimentCohortClassification>(
			`coreExperimentation.experimentCohort`,
			{
				experimentName,
				cohort: experiment.cohort,
				subCohort: experiment.subCohort,
				experimentGroup: experiment.experimentGroup,
				iteration: experiment.iteration,
				isInExperiment: experiment.isInExperiment
			}
		);
	}

	getExperiment(experimentName: string): IExperiment | undefined {
		return this.experiments.get(experimentName);
	}
}

registerSingleton(ICoreExperimentationService, CoreExperimentationService, InstantiationType.Delayed);
