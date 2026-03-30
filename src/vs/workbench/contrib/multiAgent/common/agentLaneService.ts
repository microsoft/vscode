/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IAgentLaneService = createDecorator<IAgentLaneService>('IAgentLaneService');

// --- Agent state machine ---

export enum AgentState {
	Idle = 'idle',
	Queued = 'queued',
	Running = 'running',
	Blocked = 'blocked',
	Waiting = 'waiting',
	Error = 'error',
	Done = 'done',
}

/** Valid state transitions enforced at runtime */
export const VALID_STATE_TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
	[AgentState.Idle]: [AgentState.Queued],
	[AgentState.Queued]: [AgentState.Running, AgentState.Idle],
	[AgentState.Running]: [AgentState.Done, AgentState.Error, AgentState.Blocked, AgentState.Waiting],
	[AgentState.Blocked]: [AgentState.Running, AgentState.Error],
	[AgentState.Waiting]: [AgentState.Running, AgentState.Error],
	[AgentState.Error]: [AgentState.Queued, AgentState.Idle],
	[AgentState.Done]: [AgentState.Idle],
};

// --- Agent capabilities ---

export type AgentCapability = 'code-edit' | 'file-read' | 'file-write' | 'terminal' | 'web-search' | 'image-gen';

// --- Agent definition (persisted) ---

export interface IAgentDefinition {
	readonly id: string;
	readonly name: string;
	readonly role: string;
	readonly description: string;
	readonly systemInstructions: string;
	readonly modelId: string;
	readonly providerIds: readonly string[];
	readonly icon: string;
	readonly isBuiltIn: boolean;
	readonly capabilities: readonly AgentCapability[];
	readonly maxConcurrentTasks: number;
}

// --- Agent instance (runtime, session-scoped) ---

export interface IAgentInstance {
	readonly id: string;
	readonly definitionId: string;
	readonly state: AgentState;
	readonly currentTaskId?: string;
	readonly currentTaskDescription?: string;
	readonly startedAt?: number;
	readonly error?: IAgentError;
	readonly activeProviderId?: string;
	readonly activeAccountId?: string;
	readonly tokenUsage: IAgentTokenUsage;
}

export interface IAgentError {
	readonly message: string;
	readonly retryCount: number;
}

export interface IAgentTokenUsage {
	readonly input: number;
	readonly output: number;
}

// --- Validation result ---

export interface IModelProviderValidation {
	readonly valid: boolean;
	readonly errors: readonly string[];
}

// --- State change event ---

export interface IAgentStateChange {
	readonly agentId: string;
	readonly oldState: AgentState;
	readonly newState: AgentState;
}

// --- Service interface ---

export interface IAgentLaneService {
	readonly _serviceBrand: undefined;

	// Agent definition CRUD (persisted)
	getAgentDefinitions(): readonly IAgentDefinition[];
	getBuiltInAgents(): readonly IAgentDefinition[];
	getAgentDefinition(id: string): IAgentDefinition | undefined;
	addAgentDefinition(def: Omit<IAgentDefinition, 'id' | 'isBuiltIn'>): IAgentDefinition;
	updateAgentDefinition(id: string, updates: Partial<Omit<IAgentDefinition, 'id' | 'isBuiltIn'>>): void;
	removeAgentDefinition(id: string): void;

	// Agent instances (session-scoped runtime)
	getAgentInstances(): readonly IAgentInstance[];
	getAgentInstance(instanceId: string): IAgentInstance | undefined;
	spawnAgent(definitionId: string): IAgentInstance;
	terminateAgent(instanceId: string): void;

	// State management
	transitionState(instanceId: string, newState: AgentState): void;
	assignTask(instanceId: string, taskId: string, description: string): void;
	completeTask(instanceId: string, result: 'success' | 'failure', summary: string): void;
	setActiveProvider(instanceId: string, providerId: string, accountId: string): void;
	addTokenUsage(instanceId: string, input: number, output: number): void;

	// Validation
	validateModelProviderAssignment(modelId: string, providerIds: readonly string[]): IModelProviderValidation;

	// Events
	readonly onDidChangeDefinitions: Event<void>;
	readonly onDidChangeInstances: Event<IAgentInstance | undefined>;
	readonly onDidChangeState: Event<IAgentStateChange>;
}
