/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../../base/common/jsonSchema.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ChatRequestVariableSet } from '../../attachments/chatVariableEntries.js';
import { IChatProgress, IChatService } from '../../chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../constants.js';
import { ILanguageModelsService } from '../../languageModels.js';
import { ChatModel, IChatRequestModeInstructions } from '../../model/chatModel.js';
import { IChatAgentRequest, IChatAgentService } from '../../participants/chatAgents.js';
import { ComputeAutomaticInstructions } from '../../promptSyntax/computeAutomaticInstructions.js';
import { IChatRequestHooks } from '../../promptSyntax/hookSchema.js';
import { ICustomAgent, IPromptsService } from '../../promptSyntax/service/promptsService.js';
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
import { AskQuestionsToolId } from './askQuestionsTool.js';
import { createToolSimpleTextResult } from './toolHelpers.js';

const BaseModelDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.

- Agents do not run async or in the background, you will wait for the agent\'s result.
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user\'s intent`;

export interface IRunSubagentToolInputParams {
	prompt: string;
	description: string;
	agentName?: string;
}

export class RunSubagentTool extends Disposable implements IToolImpl {

	static readonly Id = 'runSubagent';

	readonly onDidUpdateToolData: Event<IConfigurationChangeEvent>;

	/** Hack to port data between prepare/invoke */
	private readonly _resolvedModels = new Map<string, { modeModelId: string | undefined; resolvedModelName: string | undefined }>();

	constructor(
		@IChatAgentService private readonly chatAgentService: IChatAgentService,
		@IChatService private readonly chatService: IChatService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.onDidUpdateToolData = Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.SubagentToolCustomAgents));
	}

	getToolData(): IToolData {
		let modelDescription = BaseModelDescription;
		const inputSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
			type: 'object',
			properties: {
				prompt: {
					type: 'string',
					description: 'A detailed description of the task for the agent to perform'
				},
				description: {
					type: 'string',
					description: 'A short (3-5 word) description of the task'
				}
			},
			required: ['prompt', 'description']
		};

		if (this.configurationService.getValue(ChatConfiguration.SubagentToolCustomAgents)) {
			inputSchema.properties.agentName = {
				type: 'string',
				description: 'Optional name of a specific agent to invoke. If not provided, uses the current agent.'
			};
			modelDescription += `\n- If the user asks for a certain agent, you MUST provide that EXACT agent name (case-sensitive) to invoke that specific agent.`;
		}
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
			if (subAgentName) {
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
						const resolved = this.resolveSubagentModel(subagent, invocation.modelId);
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
						toolReferences: this.toolsService.toToolReferences(instructions.toolReferences),
						metadata: instructions.metadata,
					};
				} else {
					throw new Error(`Requested agent '${subAgentName}' not found. Try again with the correct agent name, or omit the agentName to use the current agent.`);
				}
			} else {
				// No subagent name - clean up any cached entry and resolve model name from main model
				const cached = this._resolvedModels.get(invocation.callId);
				if (cached) {
					this._resolvedModels.delete(invocation.callId);
					resolvedModelName = cached.resolvedModelName;
				} else {
					const resolvedModelMetadata = modeModelId ? this.languageModelsService.lookupLanguageModel(modeModelId) : undefined;
					resolvedModelName = resolvedModelMetadata?.name;
				}
			}

			// Track whether we should collect markdown (after the last tool invocation)
			const markdownParts: string[] = [];

			// Generate a stable subAgentInvocationId for routing edits to this subagent's content part
			const subAgentInvocationId = invocation.callId ?? `subagent-${generateUuid()}`;

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

			if (modeTools) {
				modeTools[RunSubagentTool.Id] = false;
				modeTools[ManageTodoListToolToolId] = false;
				modeTools['copilot_askQuestions'] = false;
				modeTools[AskQuestionsToolId] = false;
			}

			const variableSet = new ChatRequestVariableSet();
			const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, modeTools, undefined); // agents can not call subagents
			await computer.collect(variableSet, token);

			// Collect hooks from hook .json files
			let collectedHooks: IChatRequestHooks | undefined;
			try {
				const info = await this.promptsService.getHooks(token);
				collectedHooks = info?.hooks;
			} catch (error) {
				this.logService.warn('[ChatService] Failed to collect hooks:', error);
			}

			// Build the agent request
			const agentRequest: IChatAgentRequest = {
				sessionResource: invocation.context.sessionResource,
				requestId: invocation.callId ?? `subagent-${Date.now()}`,
				agentId: defaultAgent.id,
				message: args.prompt,
				variables: { variables: variableSet.asArray() },
				location: ChatAgentLocation.Chat,
				subAgentInvocationId: invocation.callId,
				subAgentName: subAgentName,
				userSelectedModelId: modeModelId,
				userSelectedTools: modeTools,
				modeInstructions,
				parentRequestId: invocation.chatRequestId,
				hooks: collectedHooks,
				hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some(arr => arr.length > 0),
			};

			// Subscribe to tool invocations to clear markdown parts when a tool is invoked
			store.add(this.languageModelToolsService.onDidInvokeTool(e => {
				if (e.subagentInvocationId === subAgentInvocationId) {
					markdownParts.length = 0;
				}
			}));

			// Invoke the agent
			const result = await this.chatAgentService.invokeAgent(
				defaultAgent.id,
				agentRequest,
				progressCallback,
				[],
				token
			);

			// Check for errors
			if (result.errorDetails) {
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
	 * Resolves the model to be used by a subagent, applying multiplier-based
	 * fallback to avoid using a more expensive model than the main agent.
	 */
	private resolveSubagentModel(subagent: ICustomAgent | undefined, mainModelId: string | undefined): { modeModelId: string | undefined; resolvedModelName: string | undefined } {
		let modeModelId = mainModelId;

		if (subagent) {
			const modeModelQualifiedNames = subagent.model;
			if (modeModelQualifiedNames) {
				// Find the actual model identifier from the qualified name(s)
				outer: for (const qualifiedName of modeModelQualifiedNames) {
					const lmByQualifiedName = this.languageModelsService.lookupLanguageModelByQualifiedName(qualifiedName);
					if (lmByQualifiedName?.identifier) {
						modeModelId = lmByQualifiedName.identifier;
						break outer;
					}
				}
			}

			// If the subagent's model has a larger multiplier than the main agent's model,
			// fall back to the main agent's model to avoid using a more expensive model.
			if (modeModelId && modeModelId !== mainModelId) {
				const mainModelMetadata = mainModelId ? this.languageModelsService.lookupLanguageModel(mainModelId) : undefined;
				const subagentModelMetadata = this.languageModelsService.lookupLanguageModel(modeModelId);
				const mainMultiplier = mainModelMetadata?.multiplierNumeric;
				const subagentMultiplier = subagentModelMetadata?.multiplierNumeric;
				if (mainMultiplier !== undefined && subagentMultiplier !== undefined && subagentMultiplier > mainMultiplier) {
					this.logService.warn(`[RunSubagentTool] Subagent '${subagent.name}' requested model '${subagentModelMetadata?.name}' (multiplier: ${subagentMultiplier}) which has a larger multiplier than the main agent model '${mainModelMetadata?.name}' (multiplier: ${mainMultiplier}). Falling back to the main agent model.`);
					modeModelId = mainModelId;
				}
			}
		}

		const resolvedModelMetadata = modeModelId ? this.languageModelsService.lookupLanguageModel(modeModelId) : undefined;
		return { modeModelId, resolvedModelName: resolvedModelMetadata?.name };
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunSubagentToolInputParams;

		const subagent = args.agentName ? await this.getSubAgentByName(args.agentName) : undefined;

		// Resolve the model early and cache it for invoke()
		const resolved = this.resolveSubagentModel(subagent, context.modelId);
		this._resolvedModels.set(context.toolCallId, resolved);

		return {
			invocationMessage: args.description,
			toolSpecificData: {
				kind: 'subagent',
				description: args.description,
				agentName: subagent?.name,
				prompt: args.prompt,
				modelName: resolved.resolvedModelName,
			},
		};
	}
}
