/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RunSubagentTool_1;
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ChatRequestVariableSet } from '../../attachments/chatVariableEntries.js';
import { IChatService } from '../../chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, GeneralPurposeAgentName } from '../../constants.js';
import { ILanguageModelsService } from '../../languageModels.js';
import { IChatAgentService } from '../../participants/chatAgents.js';
import { ComputeAutomaticInstructions } from '../../promptSyntax/computeAutomaticInstructions.js';
import { mergeHooks } from '../../promptSyntax/hookSchema.js';
import { HookType } from '../../promptSyntax/hookTypes.js';
import { IPromptsService } from '../../promptSyntax/service/promptsService.js';
import { isBuiltinAgent } from '../../promptSyntax/utils/promptsServiceUtils.js';
import { ILanguageModelToolsService, isToolSet, ToolDataSource, VSCodeToolReference, } from '../languageModelToolsService.js';
import { ManageTodoListToolToolId } from './manageTodoListTool.js';
import { createToolSimpleTextResult } from './toolHelpers.js';
const BaseModelDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.

- Agents do not run async or in the background, you will wait for the agent\'s result.
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user\'s intent
- If the user asks for a certain agent, you MUST provide that EXACT agent name (case-sensitive) to invoke that specific agent.`;
export const RUN_SUBAGENT_MAX_NESTING_DEPTH = 5;
let RunSubagentTool = class RunSubagentTool extends Disposable {
    static { RunSubagentTool_1 = this; }
    static { this.Id = 'runSubagent'; }
    constructor(chatAgentService, chatService, languageModelToolsService, languageModelsService, logService, configurationService, promptsService, instantiationService, productService) {
        super();
        this.chatAgentService = chatAgentService;
        this.chatService = chatService;
        this.languageModelToolsService = languageModelToolsService;
        this.languageModelsService = languageModelsService;
        this.logService = logService;
        this.configurationService = configurationService;
        this.promptsService = promptsService;
        this.instantiationService = instantiationService;
        this.productService = productService;
        this._onDidUpdateToolData = this._register(new Emitter());
        this.onDidUpdateToolData = this._onDidUpdateToolData.event;
        /** Hack to port data between prepare/invoke */
        this._resolvedModels = new Map();
        /** Tracks the current subagent nesting depth per session to detect and limit recursion. */
        this._sessionDepth = new Map();
        this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.SubagentToolCustomAgents) ||
            e.affectsConfiguration(ChatConfiguration.GeneralPurposeAgentEnabled))(() => this._onDidUpdateToolData.fire()));
    }
    getToolData() {
        const modelDescription = BaseModelDescription;
        const generalPurposeAgentEnabled = this.configurationService.getValue(ChatConfiguration.GeneralPurposeAgentEnabled);
        const customAgentsEnabled = this.configurationService.getValue(ChatConfiguration.SubagentToolCustomAgents);
        const properties = {
            prompt: {
                type: 'string',
                description: 'A detailed description of the task for the agent to perform'
            },
            description: {
                type: 'string',
                description: 'A short (3-5 word) description of the task'
            }
        };
        if (customAgentsEnabled || generalPurposeAgentEnabled) {
            properties.agentName = {
                type: 'string',
                description: generalPurposeAgentEnabled
                    ? 'Name of the agent to invoke.'
                    : 'Optional name of a specific agent to invoke. If not provided, uses the current agent.'
            };
        }
        const required = ['prompt', 'description'];
        if (generalPurposeAgentEnabled) {
            required.push('agentName');
        }
        const inputSchema = {
            type: 'object',
            properties,
            required
        };
        const runSubagentToolData = {
            id: RunSubagentTool_1.Id,
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
    async invoke(invocation, _countTokens, _progress, token) {
        const args = invocation.parameters;
        this.logService.debug(`RunSubagentTool: Invoking with prompt: ${args.prompt.substring(0, 100)}...`);
        if (!invocation.context) {
            throw new Error('toolInvocationToken is required for this tool');
        }
        // Get the chat model and request for writing progress
        const model = this.chatService.getSession(invocation.context.sessionResource);
        if (!model) {
            throw new Error('Chat model not found for session');
        }
        const request = model.getRequests().at(-1);
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
            let modeInstructions;
            let subagent;
            let resolvedModelName;
            const subAgentName = args.agentName;
            // Defensive: model may omit agentName despite schema requiring it
            const gpEnabled = this.configurationService.getValue(ChatConfiguration.GeneralPurposeAgentEnabled);
            const customAgentsEnabled = this.configurationService.getValue(ChatConfiguration.SubagentToolCustomAgents);
            const isGeneralPurpose = gpEnabled && (!subAgentName || subAgentName === GeneralPurposeAgentName);
            const effectiveSubAgentName = isGeneralPurpose ? GeneralPurposeAgentName : subAgentName;
            if (subAgentName && !isGeneralPurpose) {
                subagent = customAgentsEnabled ? await this.getSubAgentByName(subAgentName) : undefined;
                if (subagent) {
                    // Check the pre-resolved model cache from prepareToolInvocation
                    const cached = this._resolvedModels.get(invocation.callId);
                    if (cached) {
                        this._resolvedModels.delete(invocation.callId);
                        modeModelId = cached.modeModelId;
                        resolvedModelName = cached.resolvedModelName;
                    }
                    else {
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
                        toolReferences: this.languageModelToolsService.toToolReferences(instructions.toolReferences),
                        metadata: instructions.metadata,
                        isBuiltin: isBuiltinAgent(subagent.source, subagent.uri, this.productService),
                    };
                }
                else {
                    this._resolvedModels.delete(invocation.callId);
                    const baseHint = ' Try again with the correct agent name, or omit agentName to use the current agent.';
                    const gpHint = gpEnabled ? ` Additionally, you can use '${GeneralPurposeAgentName}' for a full-capability agent.` : '';
                    throw new Error(`Requested agent '${subAgentName}' not found.${baseHint}${gpHint}`);
                }
            }
            else {
                // No subagent name - clean up any cached entry and resolve model name from main model
                const cached = this._resolvedModels.get(invocation.callId);
                if (cached) {
                    this._resolvedModels.delete(invocation.callId);
                    resolvedModelName = cached.resolvedModelName;
                }
                else {
                    const resolvedModelMetadata = modeModelId ? this.languageModelsService.lookupLanguageModel(modeModelId) : undefined;
                    resolvedModelName = resolvedModelMetadata?.name;
                }
            }
            // Track whether we should collect markdown (after the last tool invocation)
            const markdownParts = [];
            // Generate a stable subAgentInvocationId for routing edits to this subagent's content part.
            // Use chatStreamToolCallId when available because that is what ChatToolInvocation.toolCallId
            // uses in the renderer (see PR #302863), and the subagent grouping matches on toolCallId.
            const subAgentInvocationId = invocation.chatStreamToolCallId ?? invocation.callId ?? `subagent-${generateUuid()}`;
            let inEdit = false;
            const progressCallback = (parts) => {
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
                        }
                        else {
                            model.acceptResponseProgress(request, part);
                        }
                    }
                    else if (part.kind === 'hook') {
                        model.acceptResponseProgress(request, { ...part, subAgentInvocationId });
                    }
                    else if (part.kind === 'markdownContent') {
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
            const allowInvocationsFromSubagents = this.configurationService.getValue(ChatConfiguration.SubagentsAllowInvocationsFromSubagents) ?? false;
            const maxDepth = allowInvocationsFromSubagents ? RUN_SUBAGENT_MAX_NESTING_DEPTH : 0;
            const sessionKey = invocation.context.sessionResource.toString();
            const currentDepth = this._sessionDepth.get(sessionKey) ?? 0;
            const depthAllowed = currentDepth + 1 <= maxDepth;
            if (!modeTools) {
                // Initialize modeTools so that we can still enforce the max depth restriction
                modeTools = {};
            }
            // Only further-restrict RunSubagentTool: do not re-enable it if it was explicitly disabled.
            const existingRunSubagentEnablement = modeTools[RunSubagentTool_1.Id];
            if (existingRunSubagentEnablement !== false) {
                modeTools[RunSubagentTool_1.Id] = depthAllowed; // only enable the Run Subagent tool if we are under the max depth limit
            }
            modeTools[ManageTodoListToolToolId] = false;
            modeTools['copilot_askQuestions'] = false;
            if (maxDepth > 0) {
                this.logService.debug(`RunSubagentTool: Nested subagents enabling ${modeTools[RunSubagentTool_1.Id]}: session ${sessionKey}, currentDepth: ${currentDepth}, maxDepth: ${maxDepth}, allowInvocationsFromSubagents: ${allowInvocationsFromSubagents}`);
            }
            const variableSet = new ChatRequestVariableSet();
            const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, modeTools, undefined);
            await computer.collect(variableSet, token);
            // Collect hooks from hook .json files
            let collectedHooks;
            try {
                const info = await this.promptsService.getHooks(token);
                collectedHooks = info?.hooks;
            }
            catch (error) {
                this.logService.warn('[ChatService] Failed to collect hooks:', error);
            }
            // Merge subagent-level hooks (from the agent's frontmatter) with global hooks.
            // Remap Stop hooks to SubagentStop since the agent is running as a subagent.
            if (subagent?.hooks) {
                const remapped = { ...subagent.hooks };
                if (remapped[HookType.Stop]) {
                    const stopHooks = remapped[HookType.Stop];
                    remapped[HookType.SubagentStop] = remapped[HookType.SubagentStop]
                        ? [...remapped[HookType.SubagentStop], ...stopHooks]
                        : stopHooks;
                    remapped[HookType.Stop] = undefined;
                }
                collectedHooks = mergeHooks(collectedHooks, remapped);
            }
            // Build the agent request
            const agentRequest = {
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
            let result;
            try {
                result = await this.chatAgentService.invokeAgent(defaultAgent.id, agentRequest, progressCallback, [], token);
            }
            finally {
                const newDepth = (this._sessionDepth.get(sessionKey) ?? 1) - 1;
                if (newDepth <= 0) {
                    this._sessionDepth.delete(sessionKey);
                }
                else {
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
        }
        catch (error) {
            const errorMessage = `Error invoking subagent: ${error instanceof Error ? error.message : 'Unknown error'}`;
            this.logService.error(errorMessage, error);
            return createToolSimpleTextResult(errorMessage);
        }
        finally {
            store.dispose();
        }
    }
    async getSubAgentByName(name) {
        const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
        return agents.find(agent => agent.name === name);
    }
    /**
     * Resolves the model to be used by a subagent, applying multiplier-based
     * fallback to avoid using a more expensive model than the main agent.
     */
    resolveSubagentModel(subagent, mainModelId) {
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
    async prepareToolInvocation(context, _token) {
        const args = context.parameters;
        // Defensive: model may omit agentName despite schema requiring it
        const gpEnabled = this.configurationService.getValue(ChatConfiguration.GeneralPurposeAgentEnabled);
        const customAgentsEnabled = this.configurationService.getValue(ChatConfiguration.SubagentToolCustomAgents);
        const isGeneralPurpose = gpEnabled && (!args.agentName || args.agentName === GeneralPurposeAgentName);
        const subagent = (args.agentName && !isGeneralPurpose && customAgentsEnabled) ? await this.getSubAgentByName(args.agentName) : undefined;
        // Resolve the model early and cache it for invoke()
        const resolved = this.resolveSubagentModel(subagent, context.modelId);
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
};
RunSubagentTool = RunSubagentTool_1 = __decorate([
    __param(0, IChatAgentService),
    __param(1, IChatService),
    __param(2, ILanguageModelToolsService),
    __param(3, ILanguageModelsService),
    __param(4, ILogService),
    __param(5, IConfigurationService),
    __param(6, IPromptsService),
    __param(7, IInstantiationService),
    __param(8, IProductService)
], RunSubagentTool);
export { RunSubagentTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVuU3ViYWdlbnRUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL3J1blN1YmFnZW50VG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDekYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM5RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsRixPQUFPLEVBQWlCLFlBQVksRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxZ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