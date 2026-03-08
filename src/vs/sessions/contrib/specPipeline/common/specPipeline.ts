/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

/**
 * Phase of the spec pipeline.
 */
export type SpecPhase = 'requirements' | 'design' | 'tasks' | 'properties';

/**
 * Status of a spec phase.
 */
export type SpecPhaseStatus = 'draft' | 'approved' | 'out_of_sync' | 'missing';

/**
 * State of a single pipeline phase.
 */
export interface ISpecPhaseState {
	readonly status: SpecPhaseStatus;
	readonly lastModified?: number;
	readonly approvedAt?: number;
	readonly approvedBy?: string;
}

/**
 * Overall pipeline state for a feature.
 */
export interface ISpecPipelineState {
	readonly featureName: string;
	readonly specDir: string;
	readonly requirements: ISpecPhaseState;
	readonly design: ISpecPhaseState;
	readonly tasks: ISpecPhaseState;
	readonly properties: ISpecPhaseState;
}

/**
 * A feature entry in the spec list.
 */
export interface ISpecFeature {
	readonly name: string;
	readonly specDir: string;
	readonly state: ISpecPipelineState;
}

export const ISpecPipelineService = createDecorator<ISpecPipelineService>('specPipelineService');

/**
 * Service for managing the spec-driven development pipeline.
 */
export interface ISpecPipelineService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when the spec pipeline state changes for any feature.
	 */
	readonly onDidChangeState: Event<ISpecPipelineState>;

	/**
	 * List all features that have specs.
	 */
	listFeatures(): Promise<ISpecFeature[]>;

	/**
	 * Get the pipeline state for a specific feature.
	 */
	getState(featureName: string): Promise<ISpecPipelineState>;

	/**
	 * Start a new spec pipeline from a natural language description.
	 */
	startPipeline(featureName: string, description: string): Promise<void>;

	/**
	 * Approve a phase for a feature and optionally advance to the next.
	 */
	approvePhase(featureName: string, phase: SpecPhase): Promise<void>;

	/**
	 * Open a spec file in the editor.
	 */
	openSpecFile(featureName: string, phase: SpecPhase): Promise<void>;
}
