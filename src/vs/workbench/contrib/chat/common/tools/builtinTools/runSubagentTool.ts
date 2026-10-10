/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, type Event } from '../../../../../../base/common/event.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../../../base/common/jsonSchema.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { extUri, isEqual } from '../../../../../../base/common/resources.js';
import type { URI } from '../../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatRequestVariableSet } from '../../attachments/chatVariableEntries.js';
import { isByokModel } from '../../chatSelectedModel.js';
import { IChatProgress, IChatService } from '../../chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../constants.js';
import { AUTO_RAW_MODEL_ID, COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelsService } from '../../languageModels.js';
import type { ChatModel, ChatRequestModel, ChatResponseModel, IChatRequestModel, IChatRequestModeInstructions } from '../../model/chatModel.js';
import { getChatSessionType } from '../../model/chatUri.js';
import { IChatAgentRequest, IChatAgentResult, IChatAgentService, UserSelectedTools } from '../../participants/chatAgents.js';
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
import { appendBackgroundAgentRoster, BackgroundAgentRegistry, IBackgroundAgentRegistryAccess, IBackgroundAgentSnapshot } from './backgroundAgentRegistry.js';
import { createToolSimpleTextResult } from './toolHelpers.js';

const BaseModelDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.

- Mode "async" is the default and returns an agent_id immediately; "background" is a compatibility alias. Use mode:"sync" for an explicitly requested inline result. Each chat session has a limit of 10 running agents, shared by nested and detached descendants.
- Completion updates the worker card and durable noninterrupting mailbox without steering, stopping, or starting the main agent. Use read_agent mode:"status" for immediate checks, mode:"list" to recover session IDs without consuming results, and explicit mode:"wait" when no independent work remains and the result is required. Wait timeouts leave the agent running.
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
	mode?: 'async' | 'background' | 'sync';
}

export const RUN_SUBAGENT_MAX_NESTING_DEPTH = 5;

type SubagentModelSelectionSource = 'explicitModel' | 'agentModel' | 'autoDefault' | 'mainModel';

interface IResolvedSubagentModel {
	readonly modeModelId: string | undefined;
	readonly resolvedModelName: string | undefined;
	readonly selectionSource: SubagentModelSelectionSource;
}

/** A subagent started by this tool that has not finished yet. A copy of it is made when it runs this tool without `agentName`. */
interface IRunningSubagent {
	readonly sessionResource: URI;
	readonly rootRequestId: string;
	readonly snapshot: IBackgroundAgentSnapshot;
	readonly modeInstructions: IChatRequestModeInstructions | undefined;
	readonly model: IResolvedSubagentModel;
	readonly modelConfiguration: Record<string, unknown> | undefined;
	readonly tools: UserSelectedTools;
	/** The hooks from the subagent's frontmatter, remapped for running as a subagent. */
	readonly hooks: ChatRequestHooks | undefined;
}

type SubagentModelSelectionEvent = {
	selectionSource: SubagentModelSelectionSource;
};

type SubagentModelSelectionClassification = {
	selectionSource: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The source that selected the model for an invoked subagent. One of explicitModel, agentModel, autoDefault, or mainModel.' };
	owner: 'bhavyaus';
	comment: 'Tracks how the model for an invoked subagent was selected without collecting model or agent names.';
};

export class RunSubagentTool extends Disposable implements IToolImpl {

	static readonly Id = 'runSubagent';

	private readonly _onDidUpdateToolData = this._register(new Emitter<void>());
	readonly onDidUpdateToolData: Event<void> = this._onDidUpdateToolData.event;

	/** Hack to port data between prepare/invoke */
	private readonly _resolvedModels = new Map<string, IResolvedSubagentModel>();

	private readonly _backgroundAgents: BackgroundAgentRegistry;
	private readonly _backgroundAgentCards = this._register(new DisposableMap<string, IDisposable>());

	/** Shared session registry for read_agent and exact detached-transport context binding. */
	get backgroundAgents(): IBackgroundAgentRegistryAccess {
		return this._backgroundAgents;
	}

	/** Running subagents keyed by the id of the request they run in, which their tool calls carry in the tool invocation context. */
	private readonly _runningSubagents = new Map<string, IRunningSubagent>();

	private _autoModelResolution: Promise<string | undefined> | undefined;

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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
	) {
		super();
		this._backgroundAgents = this._register(new BackgroundAgentRegistry(storageService));
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => this._autoModelResolution = undefined));
	}

	getToolData(): IToolData {
		const modelDescription = BaseModelDescription;

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
			description: 'Optional name of a specific agent to invoke. If not provided, uses the current agent.'
		};
		properties.model = {
			type: 'string',
			description: 'Optional model for the subagent. Format: "Model Name (Vendor)", vendor is usually "copilot". Only use to enforce a specific model.',
		};
		properties.mode = {
			type: 'string', enum: ['async', 'background', 'sync'], default: 'async',
			description: 'async (default) returns an agent_id immediately. background is an alias. sync waits for an inline result. Completion never steers the parent.',
		};

		const inputSchema: IJSONSchema & { properties: IJSONSchemaMap } = {
			type: 'object',
			properties,
			required: ['prompt', 'description']
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

	async invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}
		const context = invocation.context;
		const args = invocation.parameters as IRunSubagentToolInputParams;
		try {
			if (token.isCancellationRequested) {
				throw new Error(localize('backgroundAgent.startCancelled', "Background agent launch was cancelled."));
			}
			if (args.mode !== undefined && !['async', 'background', 'sync'].includes(args.mode)) {
				throw new Error(localize('runSubagent.invalidMode', "Unknown subagent execution mode."));
			}
			const callingSubagent = await this.getCallingSubagent(context.sessionResource, context.requestId);
			const sessionResource = callingSubagent?.sessionResource ?? context.sessionResource;
			const rootRequestId = callingSubagent?.rootRequestId ?? context.requestId;
			const model = this.chatService.getSession(sessionResource) as ChatModel | undefined;
			const request = model?.getRequests().find(request => request.id === rootRequestId);
			if (!model || !request) {
				throw new Error(localize('runSubagent.exactRequestMissing', "The exact invoking chat request was not found."));
			}
			const handle = await this._backgroundAgents.start({
				...context, parentAgentId: callingSubagent?.snapshot.id,
				invocationId: invocation.chatStreamToolCallId ?? invocation.callId,
				description: args.description, agentName: this.normalizeRequestedAgentName(args.agentName),
			}, async (snapshot, workerToken) => {
				const updateCard = (isActive: boolean, result?: string) => {
					const data = invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData : {
						kind: 'subagent' as const, description: args.description, prompt: args.prompt,
					};
					invocation.toolSpecificData = data;
					Object.assign(data, { isActive, hasStarted: true, startedAt: snapshot.startedAt, ...(isActive ? {} : { duration: Date.now() - snapshot.startedAt, result }) });
					this.acceptProgress(model, request, {
						kind: 'externalToolInvocationUpdate', toolCallId: snapshot.invocationId,
						toolName: RunSubagentTool.Id, isComplete: !isActive, invocationMessage: args.description,
						toolSpecificData: data, subagentInvocationId: invocation.subAgentInvocationId,
					});
				};
				updateCard(true);
				this._backgroundAgentCards.set(snapshot.id, this.backgroundAgents.onDidChange(terminal => {
					if (terminal.id === snapshot.id && terminal.status !== 'running') {
						updateCard(false, terminal.result?.content.filter(part => part.kind === 'text').map(part => part.value).join('\n'));
						this._backgroundAgentCards.deleteAndDispose(snapshot.id);
					}
				}));
				return this.invokeInline(invocation, countTokens, progress, workerToken, snapshot, callingSubagent);
			}, args.mode === 'sync' ? token : CancellationToken.None);
			if (args.mode === 'sync') {
				const terminal = await handle.completion;
				const result = await this.backgroundAgents.claim(context, terminal.id);
				return this.withRoster(invocation, result ?? createToolSimpleTextResult(localize('runSubagent.resultUnavailable', "The agent result has already been retrieved or expired.")));
			}
			void handle.completion.catch(error => this.logService.error('RunSubagentTool: Background persistence failed', error));
			return this.withRoster(invocation, {
				content: [{ kind: 'text', value: localize('runSubagent.receipt', "agent_id: {0}\nstatus: running\nCompletion updates the worker card and noninterrupting mailbox; use read_agent to retrieve the result.", handle.snapshot.id) }],
				toolMetadata: { agent_id: handle.snapshot.id, subAgentInvocationId: handle.snapshot.invocationId },
			});
		} catch (error) {
			const result = createToolSimpleTextResult(`Error invoking subagent: ${error instanceof Error ? error.message : String(error)}`);
			result.toolResultError = true;
			return this.withRoster(invocation, result);
		} finally {
			this._resolvedModels.delete(this.modelCacheKey(context.sessionResource, context.requestId, invocation.callId));
		}
	}

	private async withRoster(invocation: IToolInvocation, result: IToolResult): Promise<IToolResult> {
		try {
			return await appendBackgroundAgentRoster(this.backgroundAgents, invocation.context!, result);
		} catch (error) {
			this.logService.error('RunSubagentTool: Roster storage failed', error);
			return result;
		}
	}

	private async invokeInline(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken, snapshot: IBackgroundAgentSnapshot, callingSubagent: IRunningSubagent | undefined): Promise<IToolResult> {
		const args = invocation.parameters as IRunSubagentToolInputParams;
		const cacheKey = this.modelCacheKey(invocation.context?.sessionResource, invocation.context?.requestId, invocation.callId);
		const preparedModel = this._resolvedModels.get(cacheKey);
		this._resolvedModels.delete(cacheKey);

		this.logService.debug(`RunSubagentTool: Invoking with prompt: ${args.prompt.substring(0, 100)}...`);

		if (!invocation.context) {
			throw new Error('toolInvocationToken is required for this tool');
		}

		// Get the chat model and request for writing progress
		const sessionResource = callingSubagent?.sessionResource ?? invocation.context.sessionResource;
		const model = this.chatService.getSession(sessionResource) as ChatModel | undefined;
		if (!model) {
			throw new Error('Chat model not found for session');
		}

		const rootRequestId = callingSubagent?.rootRequestId ?? invocation.context.requestId;
		const request = model.getRequests().find(request => request.id === rootRequestId);
		if (!request) {
			throw new Error(localize('runSubagent.exactRequestMissing', "The exact invoking chat request was not found."));
		}
		let subagentCredits: number | undefined;

		const store = new DisposableStore();

		try {
			// Get the default agent
			const defaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent);
			if (!defaultAgent) {
				return { ...createToolSimpleTextResult('Error: No default agent available'), toolResultError: true };
			}

			// Resolve mode-specific configuration if subagentId is provided
			const parentModelId = callingSubagent?.model.modeModelId ?? request.modelId ?? invocation.modelId;
			let modeModelId = parentModelId;
			let modeTools = invocation.userSelectedTools ? { ...invocation.userSelectedTools } : undefined;
			let modeInstructions: IChatRequestModeInstructions | undefined;
			let subagent: ICustomAgent | undefined;
			let resolvedModelName: string | undefined;
			let modelSelectionSource: SubagentModelSelectionSource = 'mainModel';
			const currentModeInstructions = callingSubagent ? callingSubagent.modeInstructions : request.modeInfo?.modeInstructions;

			const subAgentName = this.normalizeRequestedAgentName(args.agentName);
			const effectiveSubAgentName = subAgentName ?? currentModeInstructions?.name;

			if (subAgentName) {
				this.validateSubagentAllowed(subAgentName, currentModeInstructions);
				subagent = await this.getSubAgentByName(subAgentName);
				if (subagent) {
					// Check the pre-resolved model cache from prepareToolInvocation
					const cached = preparedModel;
					if (cached) {
						modeModelId = cached.modeModelId;
						resolvedModelName = cached.resolvedModelName;
						modelSelectionSource = cached.selectionSource;
					} else {
						// Fallback: resolve the model here if prepare didn't cache it
						const resolved = await this.resolveSubagentModel(subagent, parentModelId, args.model);
						modeModelId = resolved.modeModelId;
						resolvedModelName = resolved.resolvedModelName;
						modelSelectionSource = resolved.selectionSource;
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
						toolReferences: instructions.toolReferences.length ? this.languageModelToolsService.toToolReferences(instructions.toolReferences) : [],
						allowedSubagents: subagent.agents,
						metadata: instructions.metadata,
						isBuiltin: isBuiltinAgent(subagent.source, subagent.uri, this.productService),
					};
				} else {
					throw new Error(`Requested agent '${subAgentName}' not found. Try again with the correct agent name, or omit agentName to use the current agent.`);
				}
			} else {
				modeInstructions = currentModeInstructions;
				if (callingSubagent) {
					modeTools = { ...callingSubagent.tools };
				}

				// No subagent name - clean up any cached entry and resolve model from explicit parameter or main model
				const cached = preparedModel;
				if (cached) {
					modeModelId = cached.modeModelId;
					resolvedModelName = cached.resolvedModelName;
					modelSelectionSource = cached.selectionSource;
				} else {
					const resolved = await this.resolveSubagentModel(undefined, parentModelId, args.model, currentModeInstructions, callingSubagent?.model);
					modeModelId = resolved.modeModelId;
					resolvedModelName = resolved.resolvedModelName;
					modelSelectionSource = resolved.selectionSource;
				}
			}

			// Track whether we should collect markdown (after the last tool invocation)
			const markdownParts: string[] = [];

			// Generate a stable subAgentInvocationId for routing edits to this subagent's content part.
			// Use chatStreamToolCallId when available because that is what ChatToolInvocation.toolCallId
			// uses in the renderer (see PR #302863), and the subagent grouping matches on toolCallId.
			const subAgentInvocationId = invocation.chatStreamToolCallId ?? invocation.callId ?? `subagent-${generateUuid()}`;

			const progressCallback = (parts: IChatProgress[]) => {
				if (token.isCancellationRequested) {
					return;
				}
				for (const part of parts) {
					// Usage events carry the subagent's running credit total; keep the
					// latest for its hover and fold it into the parent response total.
					if (part.kind === 'usage') {
						if (typeof part.copilotCredits === 'number' && Number.isFinite(part.copilotCredits) && part.copilotCredits >= 0) {
							subagentCredits = Math.max(subagentCredits ?? 0, part.copilotCredits);
						}
						continue;
					}
					// Write certain parts immediately to the model
					if (part.kind === 'textEdit' || part.kind === 'notebookEdit' || part.kind === 'codeblockUri') {
						// Attach subAgentInvocationId to codeblockUri parts so they can be routed to the subagent content part
						if (part.kind === 'codeblockUri') {
							this.acceptProgress(model, request, { ...part, subAgentInvocationId });
						} else {
							this.acceptProgress(model, request, part);
						}
					} else if (part.kind === 'hook') {
						this.acceptProgress(model, request, { ...part, subAgentInvocationId });
					} else if (part.kind === 'markdownContent') {
						// Collect markdown content for the tool result
						markdownParts.push(part.content.value);
						if (invocation.toolSpecificData?.kind === 'subagent') {
							invocation.toolSpecificData.result = markdownParts.join('');
							invocation.toolSpecificData.activity = 'markdown';
							this.acceptProgress(model, request, {
								kind: 'externalToolInvocationUpdate', toolCallId: subAgentInvocationId,
								toolName: RunSubagentTool.Id, isComplete: false, invocationMessage: args.description,
								toolSpecificData: invocation.toolSpecificData, subagentInvocationId: invocation.subAgentInvocationId,
							});
						}
					}
				}
			};

			// Determine whether the subagent should be allowed to spawn its own subagents.
			const allowInvocationsFromSubagents = this.configurationService.getValue<boolean>(ChatConfiguration.SubagentsAllowInvocationsFromSubagents) ?? false;
			const maxDepth = allowInvocationsFromSubagents ? RUN_SUBAGENT_MAX_NESTING_DEPTH : 0;
			const sessionKey = invocation.context.sessionResource.toString();
			const currentDepth = snapshot.depth - 1;
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
			// When the extension is responsible for instruction collection, skip the core path entirely.
			if (this.configurationService.getValue<boolean>(ChatConfiguration.CollectInstructionsInExtension) !== true) {
				const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, modeTools, modeInstructions?.allowedSubagents, getChatSessionType(invocation.context.sessionResource));
				await computer.collect(variableSet, token);
			}

			// Collect hooks from hook .json files
			let collectedHooks: ChatRequestHooks | undefined;
			try {
				const info = await this.promptsService.getHooks(token);
				collectedHooks = info?.hooks;
			} catch (error) {
				this.logService.warn('[ChatService] Failed to collect hooks:', error);
			}

			// Merge subagent-level hooks (from the agent's frontmatter) with global hooks. A copy of a running subagent keeps its hooks.
			// Remap Stop hooks to SubagentStop since the agent is running as a subagent.
			let agentHooks = subagent ? undefined : callingSubagent?.hooks;
			if (subagent?.hooks) {
				const remapped: ChatRequestHooks = { ...subagent.hooks };
				if (remapped[HookType.Stop]) {
					const stopHooks = remapped[HookType.Stop];
					(remapped as Record<string, unknown>)[HookType.SubagentStop] = remapped[HookType.SubagentStop]
						? [...remapped[HookType.SubagentStop], ...stopHooks]
						: stopHooks;
					(remapped as Record<string, unknown>)[HookType.Stop] = undefined;
				}
				agentHooks = remapped;
			}
			if (agentHooks) {
				collectedHooks = mergeHooks(collectedHooks, agentHooks);
			}

			// Build the agent request
			const agentRequest: IChatAgentRequest = {
				sessionResource: invocation.context.sessionResource,
				requestId: snapshot.requestId,
				agentId: defaultAgent.id,
				message: args.prompt,
				variables: { variables: variableSet.asArray() },
				location: ChatAgentLocation.Chat,
				subAgentInvocationId: subAgentInvocationId,
				subAgentName: effectiveSubAgentName,
				userSelectedModelId: modeModelId,
				modelConfiguration: this.getModelConfiguration(modeModelId, request, callingSubagent, invocation.modelId),
				userSelectedTools: modeTools,
				modeInstructions,
				parentRequestId: invocation.context.requestId,
				hooks: collectedHooks,
				hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some(arr => arr && arr.length > 0),
			};
			if (invocation.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData.modelConfiguration = agentRequest.modelConfiguration;
				invocation.toolSpecificData.modelId = modeModelId;
				invocation.toolSpecificData.modelName = resolvedModelName;
				invocation.toolSpecificData.agentName = effectiveSubAgentName;
			}
			if (token.isCancellationRequested) {
				return createToolSimpleTextResult(localize('runSubagent.cancelled', "Agent execution was cancelled."));
			}

			// Subscribe to tool invocations to clear markdown parts when a tool is invoked
			store.add(this.languageModelToolsService.onDidInvokeTool(e => {
				if (e.subagentInvocationId === subAgentInvocationId) {
					markdownParts.length = 0;
				}
			}));

			// Invoke the agent, tracking nesting depth for recursion detection
			this.telemetryService.publicLog2<SubagentModelSelectionEvent, SubagentModelSelectionClassification>('chat.subagentModelSelection', {
				selectionSource: modelSelectionSource,
			});
			this._runningSubagents.set(agentRequest.requestId, {
				sessionResource, rootRequestId: request.id, snapshot,
				modeInstructions,
				model: { modeModelId, resolvedModelName, selectionSource: modelSelectionSource },
				modelConfiguration: agentRequest.modelConfiguration,
				tools: modeTools,
				hooks: agentHooks,
			});
			let result: IChatAgentResult | undefined;
			try {
				result = await raceCancellation(this.chatAgentService.invokeAgent(
					defaultAgent.id,
					agentRequest,
					progressCallback,
					[],
					token
				), token);
			} finally {
				this._runningSubagents.delete(agentRequest.requestId);
			}

			// Check for errors
			if (result?.errorDetails) {
				return { ...createToolSimpleTextResult(`Agent error: ${result.errorDetails.message}`), toolResultError: true };
			}

			// This is a hack due to the fact that edits are represented as empty codeblocks with URIs. That needs to be cleaned up,
			// in the meantime, just strip an empty codeblock left behind.
			const resultText = token.isCancellationRequested ? localize('runSubagent.cancelled', "Agent execution was cancelled.") : markdownParts.join('').replace(/^\n*```\n+```\n*/g, '').trim() || 'Agent completed with no output';

			// Store result in toolSpecificData for serialization
			if (invocation.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData.result = resultText;
				invocation.toolSpecificData.modelId = modeModelId;
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
			return { ...createToolSimpleTextResult(errorMessage), toolResultError: true };
		} finally {
			if (subagentCredits !== undefined) {
				request.response?.setSubagentCopilotCredits(invocation.callId, subagentCredits);
				if (invocation.toolSpecificData?.kind === 'subagent') {
					invocation.toolSpecificData.credits = subagentCredits;
				}
			}
			store.dispose();
		}
	}

	private acceptProgress(model: ChatModel, request: ChatRequestModel, progress: IChatProgress & Parameters<ChatResponseModel['updateContent']>[0]): void {
		try {
			if (request.response?.isComplete) {
				request.response.updateContent(progress);
			} else {
				model.acceptResponseProgress(request, progress);
			}
		} catch (error) {
			this.logService.warn('RunSubagentTool: Parent card is no longer available', error);
		}
	}

	private getModelConfiguration(modelId: string | undefined, request: IChatRequestModel | undefined, callingSubagent: IRunningSubagent | undefined, mainModelId: string | undefined): Record<string, unknown> | undefined {
		if (!modelId) {
			return undefined;
		}
		if (modelId === callingSubagent?.model.modeModelId) {
			return callingSubagent.modelConfiguration;
		}
		if (modelId === (request?.modelId ?? mainModelId)) {
			return request?.modelConfiguration ?? this.languageModelsService.getModelConfiguration(modelId);
		}
		return this.languageModelsService.getModelConfiguration(modelId);
	}

	private async getSubAgentByName(name: string): Promise<ICustomAgent | undefined> {
		const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
		return agents.find(agent => agent.name === name && agent.enabled);
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
			.filter((m): m is { id: string; metadata: ILanguageModelChatMetadata } => !!m.metadata && this.isSelectableForAgentMode(m.metadata));

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
	 * @param currentModeInstructions The current agent inherited when no subagent is requested.
	 *        Its configured model keeps precedence over the Auto default.
	 * @param inheritedModel The model of the running subagent that is copied when no subagent is requested.
	 *        It is used as-is unless an explicit model is requested.
	 * @throws Error if the requested model is not found or exceeds the main model's cost tier.
	 */
	private async resolveSubagentModel(subagent: ICustomAgent | undefined, mainModelId: string | undefined, explicitModelQualifiedName?: string, currentModeInstructions?: IChatRequestModeInstructions, inheritedModel?: IResolvedSubagentModel): Promise<IResolvedSubagentModel> {
		if (inheritedModel && !explicitModelQualifiedName) {
			return inheritedModel;
		}

		let modeModelId = mainModelId;
		let explicitModelResolved = false;
		let usesAutoDefault = false;
		let selectionSource: SubagentModelSelectionSource = 'mainModel';
		const mainModelMetadata = mainModelId ? this.languageModelsService.lookupLanguageModel(mainModelId) : undefined;

		// Explicit model parameter takes highest priority
		if (explicitModelQualifiedName) {
			const lm = this.languageModelsService.lookupLanguageModelByQualifiedName(explicitModelQualifiedName);
			if (lm?.identifier) {
				modeModelId = lm.identifier;
				explicitModelResolved = true;
				selectionSource = 'explicitModel';
			} else {
				// Model not found - throw error with available models
				throw new Error(`Requested model '${explicitModelQualifiedName}' not found. ${this.getAvailableModelsInfo(mainModelId)}`);
			}
		}

		if (subagent && !explicitModelResolved) {
			const modeModelQualifiedNames = subagent.model;
			if (modeModelQualifiedNames) {
				// When the main model is BYOK (flagged via `metadata.isBYOK`), skip Copilot/CAPI fallback models
				// for built-in agents (e.g. Explore), whose model list is a curated convenience fallback. A
				// user-authored agent's model list is a deliberate choice and is always honored as-is.
				const mainModelIsByok = !!mainModelMetadata && isByokModel(mainModelMetadata);
				const skipCopilotFallbacks = mainModelIsByok && isBuiltinAgent(subagent.source, subagent.uri, this.productService);
				// Find the actual model identifier from the qualified name(s)
				for (const qualifiedName of modeModelQualifiedNames) {
					const lmByQualifiedName = this.languageModelsService.lookupLanguageModelByQualifiedName(qualifiedName);
					if (lmByQualifiedName?.identifier) {
						if (skipCopilotFallbacks && lmByQualifiedName.metadata.vendor === COPILOT_VENDOR_ID) {
							continue;
						}
						modeModelId = lmByQualifiedName.identifier;
						selectionSource = 'agentModel';
						break;
					}
				}
			}
		}

		if (
			!explicitModelResolved
			&& !subagent?.model?.length
			&& (!mainModelId || (!!mainModelMetadata && !isByokModel(mainModelMetadata)))
			&& this.configurationService.getValue<boolean>(ChatConfiguration.SubagentsDefaultToAuto) === true
			&& !(await this.inheritedAgentHasModel(subagent, currentModeInstructions))
		) {
			const autoModelId = await this.resolveAutoModelId();
			if (autoModelId) {
				modeModelId = autoModelId;
				usesAutoDefault = true;
				selectionSource = 'autoDefault';
			}
		}

		// Check multiplier constraint - throw error if requested model exceeds main model's cost tier
		if (modeModelId && !usesAutoDefault) {
			const check = this.checkMultiplierConstraint(modeModelId, mainModelId);
			if (check.exceeds) {
				const modelMetadata = this.languageModelsService.lookupLanguageModel(modeModelId);
				throw new Error(`Requested model '${modelMetadata?.name}' ${check.reason}. ${this.getAvailableModelsInfo(mainModelId)}`);
			}
		}

		const resolvedModelMetadata = modeModelId ? this.languageModelsService.lookupLanguageModel(modeModelId) : undefined;
		return { modeModelId, resolvedModelName: resolvedModelMetadata?.name, selectionSource };
	}

	private async inheritedAgentHasModel(subagent: ICustomAgent | undefined, currentModeInstructions: IChatRequestModeInstructions | undefined): Promise<boolean> {
		if (subagent || !currentModeInstructions) {
			return false;
		}
		const { uri, name } = currentModeInstructions;
		const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
		const currentAgent = agents.find(agent => uri ? isEqual(agent.uri, uri) : agent.name === name && agent.enabled);
		return !!currentAgent?.model?.length;
	}

	private isSelectableForAgentMode(metadata: ILanguageModelChatMetadata): boolean {
		return ILanguageModelChatMetadata.suitableForAgentMode(metadata)
			&& metadata.isUserSelectable !== false
			&& !metadata.targetChatSessionType;
	}

	private findEligibleAutoModelId(modelIds: readonly string[]): string | undefined {
		return modelIds.find(modelId => {
			const metadata = this.languageModelsService.lookupLanguageModel(modelId);
			return metadata?.vendor === COPILOT_VENDOR_ID
				&& metadata.id === AUTO_RAW_MODEL_ID
				&& this.isSelectableForAgentMode(metadata);
		});
	}

	private resolveAutoModelId(): Promise<string | undefined> {
		const cachedModelId = this.findEligibleAutoModelId(this.languageModelsService.getLanguageModelIds());
		if (cachedModelId || this.languageModelsService.hasResolvedVendor(COPILOT_VENDOR_ID)) {
			return Promise.resolve(cachedModelId);
		}
		this._autoModelResolution ??= this.activateAutoModel();
		return this._autoModelResolution;
	}

	private async activateAutoModel(): Promise<string | undefined> {
		try {
			const modelIds = await this.languageModelsService.selectLanguageModels({ vendor: COPILOT_VENDOR_ID, id: AUTO_RAW_MODEL_ID });
			return this.findEligibleAutoModelId(modelIds);
		} catch (error) {
			this.logService.warn('RunSubagentTool: Failed to resolve the Auto model, keeping the main model', error);
			return undefined;
		}
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const args = context.parameters as IRunSubagentToolInputParams;
		const requestedAgentName = this.normalizeRequestedAgentName(args.agentName);
		const callingSubagent = context.chatSessionResource ? await this.getCallingSubagent(context.chatSessionResource, context.invocationRequestId) : undefined;
		const currentRequest = context.chatSessionResource && typeof this.chatService.getSession === 'function'
			? this.chatService.getSession(context.chatSessionResource)?.getRequests().find(request => request.id === context.invocationRequestId)
			: undefined;
		const currentModeInstructions = callingSubagent ? callingSubagent.modeInstructions : currentRequest?.modeInfo?.modeInstructions;

		if (requestedAgentName) {
			this.validateSubagentAllowed(requestedAgentName, currentModeInstructions);
		}
		const subagent = requestedAgentName ? await this.getSubAgentByName(requestedAgentName) : undefined;

		// Resolve the model early and cache it for invoke()
		const parentModelId = callingSubagent?.model.modeModelId ?? currentRequest?.modelId ?? context.modelId;
		const resolved = await this.resolveSubagentModel(subagent, parentModelId, args.model, currentModeInstructions, requestedAgentName ? undefined : callingSubagent?.model);
		this._resolvedModels.set(this.modelCacheKey(context.chatSessionResource, context.invocationRequestId, context.toolCallId), resolved);
		const modelConfiguration = this.getModelConfiguration(resolved.modeModelId, currentRequest, callingSubagent, context.modelId);

		return {
			invocationMessage: args.description,
			toolSpecificData: {
				kind: 'subagent',
				description: args.description,
				agentName: subagent?.name ?? requestedAgentName ?? currentModeInstructions?.name,
				prompt: args.prompt,
				modelId: resolved.modeModelId,
				modelName: resolved.resolvedModelName,
				...(modelConfiguration ? { modelConfiguration } : {}),
			},
		};
	}

	private modelCacheKey(sessionResource: URI | undefined, requestId: string | undefined, toolCallId: string): string {
		return JSON.stringify([sessionResource ? extUri.getComparisonKey(sessionResource) : undefined, requestId, toolCallId]);
	}

	private normalizeRequestedAgentName(agentName: string | undefined): string | undefined {
		const normalized = agentName?.trim();
		return normalized ? normalized : undefined;
	}

	/** Returns the running subagent that made a call, if the call was made in a subagent request. */
	private async getCallingSubagent(sessionResource: URI, requestId: string | undefined): Promise<IRunningSubagent | undefined> {
		if (!requestId) {
			return undefined;
		}
		const direct = this._runningSubagents.get(requestId);
		if (direct && isEqual(direct.sessionResource, sessionResource)) {
			return direct;
		}
		const snapshot = await this.backgroundAgents.getInvocation({ sessionResource, requestId });
		return snapshot?.status === 'running' ? this._runningSubagents.get(snapshot.requestId) : undefined;
	}

	private validateSubagentAllowed(subAgentName: string, currentModeInstructions: IChatRequestModeInstructions | undefined): void {
		const allowedSubagents = currentModeInstructions?.allowedSubagents;
		if (allowedSubagents && !allowedSubagents.includes('*') && !allowedSubagents.includes(subAgentName)) {
			throw new Error(`Requested agent '${subAgentName}' is not allowed by the current agent.`);
		}
	}
}
