/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import {
	AgentState,
	IAgentDefinition,
	IAgentError,
	IAgentInstance,
	IAgentLaneService,
	IAgentStateChange,
	IAgentTokenUsage,
	IModelProviderValidation,
	VALID_STATE_TRANSITIONS,
} from './agentLaneService.js';
import { BUILT_IN_AGENT_DEFINITIONS } from './builtInAgents.js';
import { IMultiAgentProviderService } from './multiAgentProviderService.js';

const STORAGE_KEY_DEFINITIONS = 'multiAgent.agentDefinitions';

export class AgentLaneServiceImpl extends Disposable implements IAgentLaneService {
	declare readonly _serviceBrand: undefined;

	private readonly _definitions = new Map<string, IAgentDefinition>();
	private readonly _instances = new Map<string, MutableAgentInstance>();

	private readonly _onDidChangeDefinitions = this._register(new Emitter<void>());
	readonly onDidChangeDefinitions: Event<void> = this._onDidChangeDefinitions.event;

	private readonly _onDidChangeInstances = this._register(new Emitter<IAgentInstance | undefined>());
	readonly onDidChangeInstances: Event<IAgentInstance | undefined> = this._onDidChangeInstances.event;

	private readonly _onDidChangeState = this._register(new Emitter<IAgentStateChange>());
	readonly onDidChangeState: Event<IAgentStateChange> = this._onDidChangeState.event;

	constructor(
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._loadBuiltInAgents();
		this._loadPersistedDefinitions();
	}

	// --- Definition CRUD ---

	getAgentDefinitions(): readonly IAgentDefinition[] {
		return Array.from(this._definitions.values());
	}

	getBuiltInAgents(): readonly IAgentDefinition[] {
		return Array.from(this._definitions.values()).filter(d => d.isBuiltIn);
	}

	getAgentDefinition(id: string): IAgentDefinition | undefined {
		return this._definitions.get(id);
	}

	addAgentDefinition(def: Omit<IAgentDefinition, 'id' | 'isBuiltIn'>): IAgentDefinition {
		const validation = this.validateModelProviderAssignment(def.modelId, def.providerIds);
		if (!validation.valid) {
			throw new Error(`Invalid model-provider assignment: ${validation.errors.join(', ')}`);
		}

		const definition: IAgentDefinition = {
			...def,
			id: `custom-${generateUuid()}`,
			isBuiltIn: false,
		};

		this._definitions.set(definition.id, definition);
		this._persistDefinitions();
		this._onDidChangeDefinitions.fire();
		this._logService.info(`[MultiAgent] Agent definition added: ${definition.name} (${definition.role})`);
		return definition;
	}

	updateAgentDefinition(id: string, updates: Partial<Omit<IAgentDefinition, 'id' | 'isBuiltIn'>>): void {
		const existing = this._definitions.get(id);
		if (!existing) {
			throw new Error(`Agent definition not found: ${id}`);
		}

		// Validate new model-provider combination if either changed
		const modelId = updates.modelId ?? existing.modelId;
		const providerIds = updates.providerIds ?? existing.providerIds;
		if (updates.modelId || updates.providerIds) {
			const validation = this.validateModelProviderAssignment(modelId, providerIds);
			if (!validation.valid) {
				throw new Error(`Invalid model-provider assignment: ${validation.errors.join(', ')}`);
			}
		}

		const updated: IAgentDefinition = { ...existing, ...updates };
		this._definitions.set(id, updated);
		this._persistDefinitions();
		this._onDidChangeDefinitions.fire();
	}

	removeAgentDefinition(id: string): void {
		const def = this._definitions.get(id);
		if (!def) {
			return;
		}
		if (def.isBuiltIn) {
			throw new Error('Cannot remove built-in agent definitions');
		}

		// Terminate any running instances of this definition
		for (const instance of this._instances.values()) {
			if (instance.definitionId === id) {
				this.terminateAgent(instance.id);
			}
		}

		this._definitions.delete(id);
		this._persistDefinitions();
		this._onDidChangeDefinitions.fire();
	}

	// --- Agent instances ---

	getAgentInstances(): readonly IAgentInstance[] {
		return Array.from(this._instances.values());
	}

	getAgentInstance(instanceId: string): IAgentInstance | undefined {
		return this._instances.get(instanceId);
	}

	spawnAgent(definitionId: string): IAgentInstance {
		const definition = this._definitions.get(definitionId);
		if (!definition) {
			throw new Error(`Agent definition not found: ${definitionId}`);
		}

		const maxAgents = this._configService.getValue<number>('multiAgent.maxConcurrentAgents') ?? 10;
		if (this._instances.size >= maxAgents) {
			throw new Error(`Maximum concurrent agents reached (${maxAgents})`);
		}

		const instance = new MutableAgentInstance(generateUuid(), definitionId);
		this._instances.set(instance.id, instance);
		this._onDidChangeInstances.fire(instance);
		this._logService.info(`[MultiAgent] Agent spawned: ${definition.name} (${instance.id})`);
		return instance;
	}

	terminateAgent(instanceId: string): void {
		const instance = this._instances.get(instanceId);
		if (!instance) {
			return;
		}

		this._instances.delete(instanceId);
		this._onDidChangeInstances.fire(undefined);
		this._logService.info(`[MultiAgent] Agent terminated: ${instanceId}`);
	}

	// --- State management ---

	transitionState(instanceId: string, newState: AgentState): void {
		const instance = this._instances.get(instanceId);
		if (!instance) {
			throw new Error(`Agent instance not found: ${instanceId}`);
		}

		const oldState = instance.state;
		const validTransitions = VALID_STATE_TRANSITIONS[oldState];
		if (!validTransitions.includes(newState)) {
			throw new Error(`Invalid state transition: ${oldState} → ${newState}`);
		}

		instance.state = newState;
		if (newState === AgentState.Running && !instance.startedAt) {
			instance.startedAt = Date.now();
		}

		this._onDidChangeState.fire({ agentId: instanceId, oldState, newState });
		this._onDidChangeInstances.fire(instance);
	}

	assignTask(instanceId: string, taskId: string, description: string): void {
		const instance = this._instances.get(instanceId);
		if (!instance) {
			throw new Error(`Agent instance not found: ${instanceId}`);
		}
		if (instance.state !== AgentState.Idle && instance.state !== AgentState.Queued) {
			throw new Error(`Cannot assign task to agent in state: ${instance.state}`);
		}

		instance.currentTaskId = taskId;
		instance.currentTaskDescription = description;
		this._onDidChangeInstances.fire(instance);
	}

	completeTask(instanceId: string, result: 'success' | 'failure', _summary: string): void {
		const instance = this._instances.get(instanceId);
		if (!instance) {
			return;
		}

		instance.currentTaskId = undefined;
		instance.currentTaskDescription = undefined;

		if (result === 'failure') {
			instance.error = {
				message: _summary,
				retryCount: (instance.error?.retryCount ?? 0) + 1,
			};
		}

		this._onDidChangeInstances.fire(instance);
	}

	setActiveProvider(instanceId: string, providerId: string, accountId: string): void {
		const instance = this._instances.get(instanceId);
		if (!instance) {
			return;
		}

		instance.activeProviderId = providerId;
		instance.activeAccountId = accountId;
		this._onDidChangeInstances.fire(instance);
	}

	addTokenUsage(instanceId: string, input: number, output: number): void {
		const instance = this._instances.get(instanceId);
		if (!instance) {
			return;
		}

		instance.tokenUsage = {
			input: instance.tokenUsage.input + input,
			output: instance.tokenUsage.output + output,
		};
		this._onDidChangeInstances.fire(instance);
	}

	// --- Validation ---

	validateModelProviderAssignment(modelId: string, providerIds: readonly string[]): IModelProviderValidation {
		const errors: string[] = [];
		const model = this._providerService.getModel(modelId);

		if (!model) {
			errors.push(`Model not found: ${modelId}`);
			return { valid: false, errors };
		}

		if (providerIds.length === 0) {
			errors.push('At least one provider is required');
			return { valid: false, errors };
		}

		for (const providerId of providerIds) {
			const provider = this._providerService.getProvider(providerId);
			if (!provider) {
				errors.push(`Provider not found: ${providerId}`);
				continue;
			}
			if (!model.compatibleProviders.includes(providerId)) {
				errors.push(`Provider '${provider.name}' does not support model '${model.displayName}'`);
			}
		}

		return { valid: errors.length === 0, errors };
	}

	// --- Persistence ---

	private _loadBuiltInAgents(): void {
		for (const agent of BUILT_IN_AGENT_DEFINITIONS) {
			this._definitions.set(agent.id, agent);
		}
	}

	private _loadPersistedDefinitions(): void {
		const json = this._storageService.get(STORAGE_KEY_DEFINITIONS, StorageScope.APPLICATION);
		if (json) {
			try {
				const customDefs: IAgentDefinition[] = JSON.parse(json);
				for (const def of customDefs) {
					if (!this._definitions.has(def.id)) {
						this._definitions.set(def.id, def);
					}
				}
			} catch {
				this._logService.warn('[MultiAgent] Failed to parse persisted agent definitions');
			}
		}
	}

	private _persistDefinitions(): void {
		const customDefs = Array.from(this._definitions.values()).filter(d => !d.isBuiltIn);
		this._storageService.store(
			STORAGE_KEY_DEFINITIONS,
			JSON.stringify(customDefs),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
	}
}

/**
 * Mutable version of IAgentInstance for internal state management.
 * Exposed as readonly IAgentInstance via service interface.
 */
class MutableAgentInstance implements IAgentInstance {
	state: AgentState = AgentState.Idle;
	currentTaskId?: string;
	currentTaskDescription?: string;
	startedAt?: number;
	error?: IAgentError;
	activeProviderId?: string;
	activeAccountId?: string;
	tokenUsage: IAgentTokenUsage = { input: 0, output: 0 };

	constructor(
		readonly id: string,
		readonly definitionId: string,
	) { }
}
