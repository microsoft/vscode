/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Phase of the spec pipeline.
 */
export type SpecPhase = 'requirements' | 'design' | 'tasks' | 'properties';

/**
 * Status of a spec phase.
 */
export type SpecPhaseStatus = 'draft' | 'approved' | 'out_of_sync' | 'missing';

/**
 * Spec pipeline state for a feature, mirroring the backend type.
 */
export interface SpecPipelineState {
	featureName: string;
	specDir: string;
	requirements: SpecPhaseState;
	design: SpecPhaseState;
	tasks: SpecPhaseState;
	properties: SpecPhaseState;
}

/**
 * State of a single spec phase.
 */
export interface SpecPhaseState {
	status: SpecPhaseStatus;
	lastModified?: number;
	approvedAt?: number;
	approvedBy?: string;
}

/**
 * Clarifying question asked during requirements elicitation.
 */
export interface ClarifyingQuestion {
	question: string;
	context: string;
	suggestedOptions?: string[];
}

/**
 * Developer's answer to a clarifying question.
 */
export interface ClarifyingAnswer {
	question: string;
	answer: string;
}

/**
 * Request to generate a spec from a natural language description.
 */
export interface SpecGenerationRequest {
	description: string;
	phase: SpecPhase;
	featureName: string;
	previousPhaseContent?: string;
	clarifyingAnswers?: ClarifyingAnswer[];
}

/**
 * Result of a spec generation step.
 */
export interface SpecGenerationResult {
	phase: SpecPhase;
	content: string;
	needsClarification: boolean;
	clarifyingQuestions?: ClarifyingQuestion[];
	summary: string;
}
