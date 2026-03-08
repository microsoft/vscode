// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * EARS (Easy Approach to Requirements Syntax) requirement patterns.
 * Each requirement follows one of these syntactic patterns.
 */
export type EarsPattern =
	| 'ubiquitous'    // the system SHALL ...
	| 'event-driven'  // WHEN <trigger>, the system SHALL ...
	| 'state-driven'  // WHILE <state>, the system SHALL ...
	| 'optional'      // WHERE <feature>, the system SHALL ...
	| 'unwanted'      // IF <condition>, THEN the system SHALL ...
	| 'complex';      // Combination of the above

/**
 * A single parsed EARS requirement.
 */
export interface EarsRequirement {
	id: string;
	title: string;
	pattern: EarsPattern;
	trigger?: string;
	condition?: string;
	state?: string;
	feature?: string;
	action: string;
	rawText: string;
}

/**
 * A user story in the requirements document.
 */
export interface UserStory {
	role: string;
	need: string;
	benefit: string;
	rawText: string;
}

/**
 * Parsed requirements specification.
 */
export interface RequirementsSpec {
	title: string;
	userStories: UserStory[];
	requirements: EarsRequirement[];
	edgeCases: string[];
	outOfScope: string[];
}

/**
 * File action in the design (CREATE, MODIFY, DELETE).
 */
export interface FileAction {
	action: 'CREATE' | 'MODIFY' | 'DELETE';
	path: string;
	description?: string;
}

/**
 * Technical design specification.
 */
export interface DesignSpec {
	title: string;
	approach: string;
	dataModel?: string;
	diagrams: DesignDiagram[];
	fileActions: FileAction[];
	rawContent: string;
}

/**
 * A diagram embedded in the design document.
 */
export interface DesignDiagram {
	type: 'mermaid' | 'text';
	title?: string;
	content: string;
}

/**
 * Agent handle for task assignment.
 */
export type SpecAgentHandle =
	| 'anton-code'
	| 'anton-test'
	| 'anton-security'
	| 'anton-docs'
	| 'anton-review';

/**
 * Task status in the implementation pipeline.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

/**
 * A single implementation task.
 */
export interface SpecTask {
	id: number;
	title: string;
	status: TaskStatus;
	agent: SpecAgentHandle;
	files: string[];
	dependsOn: number[];
	description: string;
}

/**
 * Task decomposition specification.
 */
export interface TasksSpec {
	title: string;
	executionOrder: string;
	tasks: SpecTask[];
}

/**
 * Overall spec pipeline state for a feature.
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
 * State of a single pipeline phase.
 */
export interface SpecPhaseState {
	status: 'draft' | 'approved' | 'out_of_sync' | 'missing';
	lastModified?: number;
	approvedAt?: number;
	approvedBy?: string;
}

/**
 * A generated property-based test from a requirement.
 */
export interface PropertyTest {
	requirementId: string;
	requirementTitle: string;
	testName: string;
	testCode: string;
	arbitraries: string[];
	properties: string[];
}

/**
 * Result of a spec sync check.
 */
export interface SyncCheckResult {
	specFile: string;
	codeFile: string;
	requirementId?: string;
	status: 'in_sync' | 'spec_ahead' | 'code_ahead' | 'conflict';
	message: string;
}

/**
 * Configuration for the spec pipeline service.
 */
export interface SpecPipelineConfig {
	server: {
		port: number;
	};
	specsDir: string;
}
