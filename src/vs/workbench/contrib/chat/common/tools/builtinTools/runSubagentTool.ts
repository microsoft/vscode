/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../../base/common/jsonSchema.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ChatRequestVariableSet } from '../../attachments/chatVariableEntries.js';
import { IChatProgress, IChatService } from '../../chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, GeneralPurposeAgentName } from '../../constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import { ChatModel, IChatRequestModeInstructions } from '../../model/chatModel.js';
import { getChatSessionType } from '../../model/chatUri.js';
import { IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../participants/chatAgents.js';
import { ComputeAutomaticInstructions } from '../../promptSyntax/computeAutomaticInstructions.js';
import { ChatRequestHooks, mergeHooks } from '../../promptSyntax/hookSchema.js';
import { HookType } from '../../promptSyntax/hookTypes.js';
import { ICustomAgent, IPromptsService } from '../../promptSyntax/service/promptsService.js';
import { isBuiltinAgent } from '../../promptSyntax/utils/promptsServiceUtils.js';
import {
	CountTokensCallback,
	ILanguageModelToolsService,
	IPreparedToolInvocation,
	isToolSet,
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolInvocationPreparationContext,
	IToolResult,
	ToolDataSource,
	ToolProgress,
	VSCodeToolReference,
} from '../languageModelToolsService.js';
import { ManageTodoListToolToolId } from './manageTodoListTool.js';
import { createToolSimpleTextResult } from './toolHelpers.js';

const BaseModelDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.

- Agents do not run async or in the background, you will wait for the agent\'s result.
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user\'s intent
- If the user asks for a certain agent, you MUST provide that EXACT agent name (case-sensitive) to invoke that specific agent.`;

export interface IRunSubagentToolInputParams {
	prompt: string;
	description: string;
	agentName?: string;
	model?: string;
}

export const RUN_SUBAGENT_MAX_NESTING_DEPTH = 5;

export class RunSubagentTool extends Disposable implements IToolImpl {

	static readonly Id = 'runSubagent';

	private readonly _onDidUpdateToolData = this._register(new Emitter<void>());
	readonly onDidUpdateToolData: Event<void> = this._onDidUpdateToolData.event;

	/** Hack to port data between prepare/invoke */
	private readonly _resolvedModels = new Map<string, { modeModelId: string | undefined; resolvedModelName: string | undefined }>();

	/** Tracks the current subagent nesting depth per session to detect and limit recursion. */
	private readonly _sessionDepth = new Map<string, number>();

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatService private readonly chatService: IChatService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e =>
			e.affectsConfiguration(ChatConfiguration.GeneralPurposeAgentEnabled)
		)(() => this._onDidUpdateToolData.fire()));
	}

	getToolData(): IToolData {
		const modelDescription = BaseModelDescription;
		const generalPurposeAgentEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.GeneralPurposeAgentEnabled);

		const properties: IJSONSchemaMap = {
			prompt: {
				type: 'string',
				description: 'A detailed description of the task for the agent to perform'
			},
			description: {
				type: 'string',
				description: 'A short (3-5 word) description of the task'
			}
		};
		properties.agentName = {
			type: 'string',
			description: generalPurposeAgentEnabled
				? 'Name of the agent to invoke.'
				: 'Optional name of a specific agent to invoke. If not provided, uses the current agent.'
		};
		properties.model = {
			type: 'string',
			description: 'Optional model for the subagent. Format: "Model Name (Vendor)", vendor is usually "copilot". Only use to enforce a specific model.',
		};

		const required: string[] = ['prompt', 'description'];
		if (generalPurposeAgentEnabled) {
			required.push('agentName');
		}

		const inputSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
			type: 'object',
			properties,
			required
		};
		const runSubagentToolData: IToolData = {
			id: RunSubagentTool.Id,
			toolReferenceName: VSCodeToolReference.runSubagent,
			icon: ThemeIcon.fromId(Codicon.organization.id),
			displayName: localize('tool.runSubagent.displayName', 'Run Subagent'),
			userDescription: localize('tool.runSubagent.userDescription', 'Run a task within an isolated subagent context to enable efficient organization of tasks and context window management.'),
			modelDescription: modelDescription,
			source: ToolDataSource.Internal,
			inputSchema: inputSchema
		};
		return runSubagentToolData;
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const args = invocation.parameters as IRunSubagentToolInputParams;

		this.logService.debug(`RunSubagentTool: Invoking with prompt: ${args.prompt.substring(0, 100)}...`);

		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		// Get the chat model and request for writing progress
		const model = this.chatService.getSession(invocation.context.sessionResource) as ChatModel | undefined;
		if (!model) {
			throw new Error('Chat model not found for session');
		}

		const request = model.getRequests().at(-1)!;

		const store = new DisposableStore();

		try {
			// Get the default agent
			const defaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent);
			if (!defaultAgent) {
				return createToolSimpleTextResult('Error: No default agent available');
			}

			// Resolve mode-specific configuration if subagentId is provided
			let modeModelId = invocation.modelId;
			let modeTools = invocation.userSelectedTools;
			let modeInstructions: IChatRequestModeInstructions | undefined;
			let subagent: ICustomAgent | undefined;
			let resolvedModelName: string | undefined;

			const subAgentName = args.agentName;
			// Defensive: model may omit agentName despite schema requiring it
			const gpEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.GeneralPurposeAgentEnabled);
			const isGeneralPurpose = gpEnabled && (!subAgentName || subAgentName === GeneralPurposeAgentName);
			const effectiveSubAgentName = isGeneralPurpose ? GeneralPurposeAgentName : subAgentName;

			if (subAgentName && !isGeneralPurpose) {
				subagent = await this.getSubAgentByName(subAgentName);
				if (subagent) {
					// Check the pre-resolved model cache from prepareToolInvocation
					const cached = this._resolvedModels.get(invocation.callId);
					if (cached) {
						this._resolvedModels.delete(invocation.callId);
						modeModelId = cached.modeModelId;
						resolvedModelName = cached.resolvedModelName;
					} else {
						// Fallback: resolve the model here if prepare didn't cache it
						const resolved = this.resolveSubagentModel(subagent, invocation.modelId, args.model);
						modeModelId = resolved.modeModelId;
						resolvedModelName = resolved.resolvedModelName;
					}

					// Use mode-specific tools if available
					const modeCustomTools = subagent.tools;
					if (modeCustomTools) {
						// Convert the mode's custom tools (array of qualified names) to UserSelectedTools format
						const enablementMap = this.languageModelToolsService.toToolAndToolSetEnablementMap(modeCustomTools, undefined);
						// Convert enablement map to UserSelectedTools (Record<string, boolean>)
						modeTools = {};
						for (const [tool, enabled] of enablementMap) {
							if (!isToolSet(tool)) {
								modeTools[tool.id] = enabled;
							}
						}
					}

					const instructions = subagent.agentInstructions;
					modeInstructions = instructions && {
						name: subAgentName,
						content: instructions.content,
						toolReferences: this.languageModelToolsService.toToolReferences(instructions.toolReferences),
						metadata: instructions.metadata,
						isBuiltin: isBuiltinAgent(subagent.source, subagent.uri, this.productService),
					};
				} else {
					this._resolvedModels.delete(invocation.callId);
					const baseHint = ' Try again with the correct agent name, or omit agentName to use the current agent.';
					const gpHint = gpEnabled ? ` Additionally, you can use '${GeneralPurposeAgentName}' for a full-capability agent.` : '';
					throw new Error(`Requested agent '${subAgentName}' not found.${baseHint}${gpHint}`);
				}
			} else {
				// No subagent name - clean up any cached entry and resolve model from explicit parameter or main model
				const cached = this._resolvedModels.get(invocation.callId);
				if (cached) {
					this._resolvedModels.delete(invocation.callId);
					modeModelId = cached.modeModelId;
					resolvedModelName = cached.resolvedModelName;
				} else {
					const resolved = this.resolveSubagentModel(undefined, invocation.modelId, args.model);
					modeModelId = resolved.modeModelId;
					resolvedModelName = resolved.resolvedModelName;
				}
			}

			// Track whether we should collect markdown (after the last tool invocation)
			const markdownParts: string[] = [];

			// Generate a stable subAgentInvocationId for routing edits to this subagent's content part.
			// Use chatStreamToolCallId when available because that is what ChatToolInvocation.toolCallId
			// uses in the renderer (see PR #302863), and the subagent grouping matches on toolCallId.
			const subAgentInvocationId = invocation.chatStreamToolCallId ?? invocation.callId ?? `subagent-${generateUuid()}`;

			let inEdit = false;
			const progressCallback = (parts: IChatProgress[]) => {
				for (const part of parts) {
					// Write certain parts immediately to the model
					if (part.kind === 'textEdit' || part.kind === 'notebookEdit' || part.kind === 'codeblockUri') {
						if (part.kind === 'codeblockUri' && !inEdit) {
							inEdit = true;
							model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('```\n') });
						}
						// Attach subAgentInvocationId to codeblockUri parts so they can be routed to the subagent content part
						if (part.kind === 'codeblockUri') {
							model.acceptResponseProgress(request, { ...part, subAgentInvocationId });
						} else {
							model.acceptResponseProgress(request, part);
						}
					} else if (part.kind === 'hook') {
						model.acceptResponseProgress(request, { ...part, subAgentInvocationId });
					} else if (part.kind === 'markdownContent') {
						if (inEdit) {
							model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('\n```\n\n') });
							inEdit = false;
						}

						// Collect markdown content for the tool result
						markdownParts.push(part.content.value);
					}
				}
			};

			// Determine whether the subagent should be allowed to spawn its own subagents.
			const allowInvocationsFromSubagents = this.configurationService.getValue<boolean>(ChatConfiguration.SubagentsAllowInvocationsFromSubagents) ?? false;
			const maxDepth = allowInvocationsFromSubagents ? RUN_SUBAGENT_MAX_NESTING_DEPTH : 0;
			const sessionKey = invocation.context.sessionResource.toString();
			const currentDepth = this._sessionDepth.get(sessionKey) ?? 0;
			const depthAllowed = currentDepth + 1 <= maxDepth;

			if (!modeTools) {
				// Initialize modeTools so that we can still enforce the max depth restriction
				modeTools = {};
			}

			// Only further-restrict RunSubagentTool: do not re-enable it if it was explicitly disabled.
			const existingRunSubagentEnablement = modeTools[RunSubagentTool.Id];
			if (existingRunSubagentEnablement !== false) {
				modeTools[RunSubagentTool.Id] = depthAllowed; // only enable the Run Subagent tool if we are under the max depth limit
			}

			modeTools[ManageTodoListToolToolId] = false;
			modeTools['copilot_askQuestions'] = false;

			if (maxDepth > 0) {
				this.logService.debug(`RunSubagentTool: Nested subagents enabling ${modeTools[RunSubagentTool.Id]}: session ${sessionKey}, currentDepth: ${currentDepth}, maxDepth: ${maxDepth}, allowInvocationsFromSubagents: ${allowInvocationsFromSubagents}`);
			}

			const variableSet = new ChatRequestVariableSet();
			const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, modeTools, undefined, getChatSessionType(invocation.context.sessionResource));
			await computer.collect(variableSet, token);

			// Collect hooks from hook .json files
			let collectedHooks: ChatRequestHooks | undefined;
			try {
				const info = await this.promptsService.getHooks(token);
				collectedHooks = info?.hooks;
			} catch (error) {
				this.logService.warn('[ChatService] Failed to collect hooks:', error);
			}

			// Merge subagent-level hooks (from the agent's frontmatter) with global hooks.
			// Remap Stop hooks to SubagentStop since the agent is running as a subagent.
			if (subagent?.hooks) {
				const remapped: ChatRequestHooks = { ...subagent.hooks };
				if (remapped[HookType.Stop]) {
					const stopHooks = remapped[HookType.Stop];
					(remapped as Record<string, unknown>)[HookType.SubagentStop] = remapped[HookType.SubagentStop]
						? [...remapped[HookType.SubagentStop], ...stopHooks]
						: stopHooks;
					(remapped as Record<string, unknown>)[HookType.Stop] = undefined;
				}
				collectedHooks = mergeHooks(collectedHooks, remapped);
			}

			// Build the agent request
			const agentRequest: IChatAgentRequest = {
				sessionResource: invocation.context.sessionResource,
				requestId: invocation.callId ?? `subagent-${Date.now()}`,
				agentId: defaultAgent.id,
				message: args.prompt,
				variables: { variables: variableSet.asArray() },
				location: ChatAgentLocation.Chat,
				subAgentInvocationId: subAgentInvocationId,
				subAgentName: effectiveSubAgentName,
				userSelectedModelId: modeModelId,
				modelConfiguration: modeModelId ? this.languageModelsService.getModelConfiguration(modeModelId) : undefined,
				userSelectedTools: modeTools,
				modeInstructions,
				parentRequestId: invocation.chatRequestId,
				hooks: collectedHooks,
				hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some(arr => arr && arr.length > 0),
			};

			// Subscribe to tool invocations to clear markdown parts when a tool is invoked
			store.add(this.languageModelToolsService.onDidInvokeTool(e => {
				if (e.subagentInvocationId === subAgentInvocationId) {
					markdownParts.length = 0;
				}
			}));

			// Invoke the agent, tracking nesting depth for recursion detection
			this._sessionDepth.set(sessionKey, currentDepth + 1);
			let result: IChatAgentResult | undefined;
			try {
				result = await this.chatAgentService.invokeAgent(
					defaultAgent.id,
					agentRequest,
					progressCallback,
					[],
					token
				);
			} finally {
				const newDepth = (this._sessionDepth.get(sessionKey) ?? 1) - 1;
				if (newDepth <= 0) {
					this._sessionDepth.delete(sessionKey);
				} else {
					this._sessionDepth.set(sessionKey, newDepth);
				}
			}

			// Check for errors
			if (result?.errorDetails) {
				return createToolSimpleTextResult(`Agent error: ${result.errorDetails.message}`);
			}

			// This is a hack due to the fact that edits are represented as empty codeblocks with URIs. That needs to be cleaned up,
			// in the meantime, just strip an empty codeblock left behind.
			const resultText = markdownParts.join('').replace(/^\n*```\n+```\n*/g, '').trim() || 'Agent completed with no output';

			// Store result in toolSpecificData for serialization
			if (invocation.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData.result = resultText;
				invocation.toolSpecificData.modelName = resolvedModelName;
			}

			// Return result with toolMetadata containing subAgentInvocationId for trajectory tracking
			return {
				content: [{
					kind: 'text',
					value: resultText
				}],
				toolMetadata: {
					subAgentInvocationId,
					description: args.description,
					agentName: agentRequest.subAgentName,
					modelName: resolvedModelName,
				}
			};

		} catch (error) {
			const errorMessage = `Error invoking subagent: ${error instanceof Error ? error.message : 'Unknown error'}`;
			this.logService.error(errorMessage, error);
			return createToolSimpleTextResult(errorMessage);
		} finally {
			store.dispose();
		}
	}

	private async getSubAgentByName(name: string): Promise<ICustomAgent | undefined> {
		const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
		return agents.find(agent => agent.name === name);
	}

	/**
	 * Checks if a model exceeds the main model's cost tier based on multiplier.
	 * @returns An object with `exceeds: true` and a reason string if blocked, or `exceeds: false` if allowed.
	 */
	private checkMultiplierConstraint(modelId: string, mainModelId: string | undefined): { exceeds: false } | { exceeds: true; reason: string } {
		if (!mainModelId || modelId === mainModelId) {
			return { exceeds: false };
		}

		const mainModelMetadata = this.languageModelsService.lookupLanguageModel(mainModelId);
		const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
		const mainMultiplier = mainModelMetadata?.multiplierNumeric;
		const modelMultiplier = modelMetadata?.multiplierNumeric;

		if (mainMultiplier !== undefined && modelMultiplier !== undefined && modelMultiplier > mainMultiplier) {
			return {
				exceeds: true,
				reason: `exceeds the current model's cost tier (${modelMultiplier}x vs ${mainMultiplier}x)`
			};
		}

		return { exceeds: false };
	}

	/**
	 * Returns information about available models for error messages.
	 * Includes which models are unavailable due to multiplier restrictions.
	 */
	private getAvailableModelsInfo(mainModelId: string | undefined): string {
		const models = this.languageModelsService.getLanguageModelIds()
			.map(id => ({ id, metadata: this.languageModelsService.lookupLanguageModel(id) }))
			.filter((m): m is { id: string; metadata: ILanguageModelChatMetadata } =>
				!!m.metadata
				&& ILanguageModelChatMetadata.suitableForAgentMode(m.metadata)
				&& m.metadata.isUserSelectable !== false
				&& !m.metadata.targetChatSessionType
			);

		if (models.length === 0) {
			return 'No models available.';
		}

		const available: string[] = [];
		const unavailableDueToMultiplier: string[] = [];

		for (const { id, metadata } of models) {
			const qualifiedName = ILanguageModelChatMetadata.asQualifiedName(metadata);
			const check = this.checkMultiplierConstraint(id, mainModelId);

			if (check.exceeds) {
				unavailableDueToMultiplier.push(qualifiedName);
			} else {
				available.push(qualifiedName);
			}
		}

		const parts: string[] = [];
		if (available.length > 0) {
			parts.push(`Available models: ${available.join(', ')}`);
		}
		if (unavailableDueToMultiplier.length > 0) {
			parts.push(`Unavailable (exceeds current model's cost tier): ${unavailableDueToMultiplier.join(', ')}`);
		}

		return parts.join('. ') || 'No models available.';
	}

	/**
	 * Resolves the model to be used by a subagent.
	 * @param explicitModelQualifiedName Optional explicit model specified by the caller.
	 *        If provided and not found or not allowed, throws an error with available models.
	 * @throws Error if the requested model is not found or exceeds the main model's cost tier.
	 */
	private resolveSubagentModel(subagent: ICustomAgent | undefined, mainModelId: string | undefined, explicitModelQualifiedName?: string): { modeModelId: string | undefined; resolvedModelName: string | undefined } {
		let modeModelId = mainModelId;
		let explicitModelResolved = false;

		// Explicit model parameter takes highest priority
		if (explicitModelQualifiedName) {
			const lm = this.languageModelsService.lookupLanguageModelByQualifiedName(explicitModelQualifiedName);
			if (lm?.identifier) {
				modeModelId = lm.identifier;
				explicitModelResolved = true;
			} else {
				// Model not found - throw error with available models
				throw new Error(`Requested model '${explicitModelQualifiedName}' not found. ${this.getAvailableModelsInfo(mainModelId)}`);
			}
		}

		if (subagent && !explicitModelResolved) {
			const modeModelQualifiedNames = subagent.model;
			if (modeModelQualifiedNames) {
				// Find the actual model identifier from the qualified name(s)
				for (const qualifiedName of modeModelQualifiedNames) {
					const lmByQualifiedName = this.languageModelsService.lookupLanguageModelByQualifiedName(qualifiedName);
					if (lmByQualifiedName?.identifier) {
						modeModelId = lmByQualifiedName.identifier;
						break;
					}
				}
			}
		}

		// Check multiplier constraint - throw error if requested model exceeds main model's cost tier
		if (modeModelId) {
			const check = this.checkMultiplierConstraint(modeModelId, mainModelId);
			if (check.exceeds) {
				const modelMetadata = this.languageModelsService.lookupLanguageModel(modeModelId);
				throw new Error(`Requested model '${modelMetadata?.name}' ${check.reason}. ${this.getAvailableModelsInfo(mainModelId)}`);
			}
		}

		const resolvedModelMetadata = modeModelId ? this.languageModelsService.lookupLanguageModel(modeModelId) : undefined;
		return { modeModelId, resolvedModelName: resolvedModelMetadata?.name };
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunSubagentToolInputParams;

		// Defensive: model may omit agentName despite schema requiring it
		const gpEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.GeneralPurposeAgentEnabled);
		const isGeneralPurpose = gpEnabled && (!args.agentName || args.agentName === GeneralPurposeAgentName);
		const subagent = (args.agentName && !isGeneralPurpose) ? await this.getSubAgentByName(args.agentName) : undefined;

		// Resolve the model early and cache it for invoke()
		const resolved = this.resolveSubagentModel(subagent, context.modelId, args.model);
		this._resolvedModels.set(context.toolCallId, resolved);

		return {
			invocationMessage: args.description,
			toolSpecificData: {
				kind: 'subagent',
				description: args.description,
				agentName: isGeneralPurpose ? GeneralPurposeAgentName : (subagent?.name ?? args.agentName),
				prompt: args.prompt,
				modelName: resolved.resolvedModelName,
			},
		};
	}
}
