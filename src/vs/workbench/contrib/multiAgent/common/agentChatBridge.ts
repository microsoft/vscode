/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import {
	ChatMessageRole,
	IChatMessage,
	ILanguageModelsService,
} from '../../chat/common/languageModels.js';
import {
	IChatAgentData,
	IChatAgentHistoryEntry,
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentService,
} from '../../chat/common/participants/chatAgents.js';
import { IChatProgress } from '../../chat/common/chatService/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../chat/common/constants.js';
import { AgentState, IAgentDefinition, IAgentLaneService } from './agentLaneService.js';
import { IDirectProviderClient } from './directProviderClient.js';
import { IMultiAgentProviderService } from './multiAgentProviderService.js';
import { IProviderRotationService } from './providerRotationService.js';

export const IAgentChatBridge = createDecorator<IAgentChatBridge>('IAgentChatBridge');

export interface IAgentChatBridge {
	readonly _serviceBrand: undefined;

	/**
	 * Register a spawned agent instance as a dynamic VS Code chat participant.
	 * Returns a disposable to unregister.
	 */
	registerAgent(definitionId: string, instanceId: string): IDisposable;

	/**
	 * Execute a message against an agent's LLM, returning the streamed response text.
	 * Used by the orchestrator to delegate tasks to agents.
	 */
	executeAgentTask(instanceId: string, message: string, token: CancellationToken): Promise<string>;

	readonly onDidRegisterAgent: Event<string>;
	readonly onDidUnregisterAgent: Event<string>;
}

const MULTI_AGENT_EXTENSION_ID = 'vscode.multi-agent-orchestrator';

export class AgentChatBridgeImpl extends Disposable implements IAgentChatBridge {
	declare readonly _serviceBrand: undefined;

	private readonly _registrations = new Map<string, IDisposable>();

	private readonly _onDidRegisterAgent = this._register(new Emitter<string>());
	readonly onDidRegisterAgent: Event<string> = this._onDidRegisterAgent.event;

	private readonly _onDidUnregisterAgent = this._register(new Emitter<string>());
	readonly onDidUnregisterAgent: Event<string> = this._onDidUnregisterAgent.event;

	constructor(
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IAgentLaneService private readonly _agentLaneService: IAgentLaneService,
		@IMultiAgentProviderService private readonly _providerService: IMultiAgentProviderService,
		@IProviderRotationService private readonly _rotationService: IProviderRotationService,
		@IDirectProviderClient private readonly _directClient: IDirectProviderClient,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	registerAgent(definitionId: string, instanceId: string): IDisposable {
		const definition = this._agentLaneService.getAgentDefinition(definitionId);
		if (!definition) {
			throw new Error(`Agent definition not found: ${definitionId}`);
		}

		// Build IChatAgentData for dynamic registration
		const agentData: IChatAgentData = {
			id: `multiAgent.${instanceId}`,
			name: definition.name,
			fullName: `${definition.name} (${definition.role})`,
			description: definition.description,
			extensionId: new ExtensionIdentifier(MULTI_AGENT_EXTENSION_ID),
			extensionVersion: '1.0.0',
			extensionPublisherId: 'vscode',
			extensionDisplayName: 'Multi-Agent Orchestrator',
			isDynamic: true,
			isCore: true,
			metadata: {
				themeIcon: { id: definition.icon },
			},
			slashCommands: [],
			locations: [ChatAgentLocation.Panel],
			modes: [ChatModeKind.Ask, ChatModeKind.Agent],
			disambiguation: [],
		};

		const agentImpl = this._createAgentImplementation(definition, instanceId);
		const disposables = new DisposableStore();
		disposables.add(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));

		this._registrations.set(instanceId, disposables);
		this._onDidRegisterAgent.fire(instanceId);
		this._logService.info(`[ChatBridge] Agent registered: ${definition.name} (${instanceId})`);

		return {
			dispose: () => {
				disposables.dispose();
				this._registrations.delete(instanceId);
				this._onDidUnregisterAgent.fire(instanceId);
			}
		};
	}

	async executeAgentTask(instanceId: string, message: string, token: CancellationToken): Promise<string> {
		const instance = this._agentLaneService.getAgentInstance(instanceId);
		if (!instance) {
			throw new Error(`Agent instance not found: ${instanceId}`);
		}

		const definition = this._agentLaneService.getAgentDefinition(instance.definitionId);
		if (!definition) {
			throw new Error(`Agent definition not found: ${instance.definitionId}`);
		}

		return this._sendLlmRequest(definition, instanceId, message, token);
	}

	private _createAgentImplementation(definition: IAgentDefinition, instanceId: string): IChatAgentImplementation {
		return {
			invoke: async (
				request: IChatAgentRequest,
				progress: (parts: IChatProgress[]) => void,
				_history: IChatAgentHistoryEntry[],
				token: CancellationToken,
			): Promise<IChatAgentResult> => {
				const startTime = Date.now();

				try {
					// Transition agent to running (only when invoked as chat participant directly)
					const instance = this._agentLaneService.getAgentInstance(instanceId);
					const needsTransition = instance?.state === AgentState.Idle;
					if (needsTransition) {
						this._agentLaneService.transitionState(instanceId, AgentState.Queued);
						this._agentLaneService.transitionState(instanceId, AgentState.Running);
					}

					// Execute LLM request — progress is streamed incrementally inside
					await this._sendLlmRequest(definition, instanceId, request.message, token, progress);

					// Transition to done (only if we own the transition)
					if (needsTransition) {
						this._agentLaneService.transitionState(instanceId, AgentState.Done);
						this._agentLaneService.transitionState(instanceId, AgentState.Idle);
					}

					return {
						timings: { totalElapsed: Date.now() - startTime },
						metadata: { instanceId, role: definition.role },
					};
				} catch (e) {
					this._agentLaneService.transitionState(instanceId, AgentState.Error);

					return {
						errorDetails: {
							message: e instanceof Error ? e.message : String(e),
						},
						timings: { totalElapsed: Date.now() - startTime },
					};
				}
			},
		};
	}

	private static readonly MAX_ROTATION_RETRIES = 3;

	/**
	 * Send an LLM request through the rotation service, streaming response text.
	 */
	private async _sendLlmRequest(
		definition: IAgentDefinition,
		instanceId: string,
		userMessage: string,
		token: CancellationToken,
		progress?: (parts: IChatProgress[]) => void,
		retriesRemaining: number = AgentChatBridgeImpl.MAX_ROTATION_RETRIES,
	): Promise<string> {
		// Get the next available account via rotation service
		const account = this._rotationService.getNextAccount(definition.modelId, [...definition.providerIds]);
		if (!account) {
			throw new Error(`No available accounts for model ${definition.modelId}`);
		}

		// Update agent's active provider/account
		this._agentLaneService.setActiveProvider(instanceId, account.providerId, account.id);

		// Build messages: system instructions + user message
		const messages: IChatMessage[] = [
			{
				role: ChatMessageRole.System,
				content: [{ type: 'text', value: definition.systemInstructions }],
			},
			{
				role: ChatMessageRole.User,
				content: [{ type: 'text', value: userMessage }],
			},
		];

		this._logService.info(`[ChatBridge] Sending LLM request: agent=${definition.name}, model=${definition.modelId}, provider=${account.providerId}`);

		try {
			// Try VS Code's language model service first (for extension-registered providers)
			const responseText = await this._sendViaLanguageModelService(messages, definition.modelId, token, progress);
			this._reportUsage(account, instanceId, definition.systemInstructions.length + userMessage.length, responseText.length);
			return responseText;
		} catch {
			// Fallback to direct HTTP client (for providers added via Providers UI)
			this._logService.info(`[ChatBridge] VS Code LM unavailable for ${definition.modelId}, using direct client`);
			try {
				const responseText = await this._directClient.sendRequest(
					account, messages, definition.modelId, token,
					(text) => progress?.([{ kind: 'markdownContent', content: { value: text } }]),
				);
				this._reportUsage(account, instanceId, definition.systemInstructions.length + userMessage.length, responseText.length);
				return responseText;
			} catch (e) {
				// Check if this is a rate limit error — rotate to next account
				const errorMsg = e instanceof Error ? e.message : String(e);
				if (retriesRemaining > 0 && (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('quota'))) {
					this._logService.warn(`[ChatBridge] Rate limited on account ${account.id}, rotating... (${retriesRemaining} retries left)`);
					this._rotationService.markAccountExhausted(account.id);

					const nextAccount = this._rotationService.getNextAccount(definition.modelId, [...definition.providerIds]);
					if (nextAccount) {
						this._agentLaneService.setActiveProvider(instanceId, nextAccount.providerId, nextAccount.id);
						return this._sendLlmRequest(definition, instanceId, userMessage, token, progress, retriesRemaining - 1);
					}
				}
				throw e;
			}
		}
	}

	/** Send via VS Code's built-in language model service (extension-registered providers) */
	private async _sendViaLanguageModelService(
		messages: IChatMessage[],
		modelId: string,
		token: CancellationToken,
		progress?: (parts: IChatProgress[]) => void,
	): Promise<string> {
		const response = await this._languageModelsService.sendChatRequest(
			modelId,
			new ExtensionIdentifier(MULTI_AGENT_EXTENSION_ID),
			messages,
			{},
			token,
		);

		let responseText = '';
		for await (const part of response.stream) {
			if (token.isCancellationRequested) {
				break;
			}
			const parts = Array.isArray(part) ? part : [part];
			for (const p of parts) {
				if (p.type === 'text') {
					responseText += p.value;
					progress?.([{ kind: 'markdownContent', content: { value: p.value } }]);
				}
			}
		}
		await response.result;
		return responseText;
	}

	/** Report token usage to rotation service and agent lane service */
	private _reportUsage(account: import('./multiAgentProviderService.js').IProviderAccount, instanceId: string, inputChars: number, outputChars: number): void {
		const inputTokens = Math.ceil(inputChars / 4);
		const outputTokens = Math.ceil(outputChars / 4);
		this._rotationService.reportUsage(account.id, {
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
			estimatedCost: (inputTokens + outputTokens) * (account.costPer1MTokens ?? 0) / 1_000_000,
			timestamp: Date.now(),
		}, instanceId);
		this._agentLaneService.addTokenUsage(instanceId, inputTokens, outputTokens);
	}

	override dispose(): void {
		for (const registration of this._registrations.values()) {
			registration.dispose();
		}
		this._registrations.clear();
		super.dispose();
	}
}
