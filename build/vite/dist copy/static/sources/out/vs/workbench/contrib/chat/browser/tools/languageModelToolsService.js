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
var LanguageModelToolsService_1;
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { RunOnceScheduler, timeout } from '../../../../../base/common/async.js';
import { encodeBase64 } from '../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { arrayEqualsC } from '../../../../../base/common/equals.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { combinedDisposable, Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../../base/common/mime.js';
import { derived, derivedOpts, observableFromEventOpts, ObservableSet, observableSignal, transaction } from '../../../../../base/common/observable.js';
import Severity from '../../../../../base/common/severity.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import * as JSONContributionRegistry from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { toToolSetVariableEntry, toToolVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatService, IChatToolInvocation } from '../../common/chatService/chatService.js';
import { ChatConfiguration, isAutoApproveLevel } from '../../common/constants.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatToolInvocation } from '../../common/model/chatProgressTypes/chatToolInvocation.js';
import { chatSessionResourceToId, getChatSessionType } from '../../common/model/chatUri.js';
import { HookType } from '../../common/promptSyntax/hookTypes.js';
import { ILanguageModelToolsConfirmationService } from '../../common/tools/languageModelToolsConfirmationService.js';
import { createToolSchemaUri, isToolSet, SpecedToolAliases, stringifyPromptTsxPart, ToolDataSource, ToolInvocationPresentation, toolMatchesModel, ToolSet, ToolSetForModel, VSCodeToolReference } from '../../common/tools/languageModelToolsService.js';
import { getToolConfirmationAlert } from '../accessibility/chatAccessibilityProvider.js';
import { IChatWidgetService } from '../chat.js';
const jsonSchemaRegistry = Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
export var AutoApproveStorageKeys;
(function (AutoApproveStorageKeys) {
    AutoApproveStorageKeys["GlobalAutoApproveOptIn"] = "chat.tools.global.autoApprove.optIn";
})(AutoApproveStorageKeys || (AutoApproveStorageKeys = {}));
const SkipAutoApproveConfirmationKey = 'vscode.chat.tools.global.autoApprove.testMode';
// This tool will always require user confirmation even in auto approval mode.
// Users cannot auto approve this tool via settings either, as this is a tool used before the agentic loop.
const toolIdsThatCannotBeAutoApproved = new Set([
    'vscode_get_confirmation_with_options',
    'vscode_get_modified_files_confirmation',
]);
export const globalAutoApproveDescription = localize2({
    key: 'autoApprove3.markdown',
    comment: [
        '{Locked=\'](https://github.com/features/codespaces)\'}',
        '{Locked=\'](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)\'}',
        '{Locked=\'](https://code.visualstudio.com/docs/copilot/security)\'}',
        '{Locked=\'**\'}',
        '{Locked=\'[`chat.autoReply`](command:workbench.action.openSettings?%5B%22chat.autoReply%22%5D)\'}',
    ]
}, 'Global auto approve also known as "YOLO mode" disables manual approval completely for _all tools in all workspaces_, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like [Codespaces](https://github.com/features/codespaces) and [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) have user keys forwarded into the container that could be compromised.\n\n**This feature disables [critical security protections](https://code.visualstudio.com/docs/copilot/security) and makes it much easier for an attacker to compromise the machine.**\n\nNote: This setting only controls tool approval and does not prevent the agent from asking questions. To automatically answer agent questions, use the [`chat.autoReply`](command:workbench.action.openSettings?%5B%22chat.autoReply%22%5D) setting.');
let LanguageModelToolsService = class LanguageModelToolsService extends Disposable {
    static { LanguageModelToolsService_1 = this; }
    constructor(_instantiationService, _extensionService, _contextKeyService, _chatService, _dialogService, _telemetryService, _logService, _configurationService, _accessibilityService, _accessibilitySignalService, _storageService, _confirmationService, _commandService, _chatWidgetService) {
        super();
        this._instantiationService = _instantiationService;
        this._extensionService = _extensionService;
        this._contextKeyService = _contextKeyService;
        this._chatService = _chatService;
        this._dialogService = _dialogService;
        this._telemetryService = _telemetryService;
        this._logService = _logService;
        this._configurationService = _configurationService;
        this._accessibilityService = _accessibilityService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._storageService = _storageService;
        this._confirmationService = _confirmationService;
        this._commandService = _commandService;
        this._chatWidgetService = _chatWidgetService;
        this._onDidChangeTools = this._register(new Emitter());
        this.onDidChangeTools = this._onDidChangeTools.event;
        this._onDidPrepareToolCallBecomeUnresponsive = this._register(new Emitter());
        this.onDidPrepareToolCallBecomeUnresponsive = this._onDidPrepareToolCallBecomeUnresponsive.event;
        this._onDidInvokeTool = this._register(new Emitter());
        this.onDidInvokeTool = this._onDidInvokeTool.event;
        /** Throttle tools updates because it sends all tools and runs on context key updates */
        this._onDidChangeToolsScheduler = this._register(new RunOnceScheduler(() => this._onDidChangeTools.fire(), 750));
        this._tools = new Map();
        this._toolContextKeys = new Set();
        this._callsByRequestId = new Map();
        /** Pending tool calls in the streaming phase, keyed by toolCallId */
        this._pendingToolCalls = new Map();
        this._toolSets = new ObservableSet();
        this.toolSets = derived(this, reader => {
            const allToolSets = Array.from(this._toolSets.observable.read(reader));
            return allToolSets.filter(toolSet => this.isPermitted(toolSet, reader));
        });
        this.allToolsIncludingDisableObs = observableFromEventOpts({ equalsFn: arrayEqualsC() }, this.onDidChangeTools, () => Array.from(this.getAllToolsIncludingDisabled()));
        this.toolsWithFullReferenceName = derived(reader => {
            const result = [];
            const coveredByToolSets = new Set();
            for (const toolSet of this.toolSets.read(reader)) {
                if (toolSet.source.type !== 'user') {
                    result.push([toolSet, getToolSetFullReferenceName(toolSet)]);
                    for (const tool of toolSet.getTools()) {
                        result.push([tool, getToolFullReferenceName(tool, toolSet)]);
                        coveredByToolSets.add(tool);
                    }
                }
            }
            for (const tool of this.allToolsIncludingDisableObs.read(reader)) {
                // todo@connor4312/aeschil: this effectively hides model-specific tools
                // for prompt referencing. Should we eventually enable this? (If so how?)
                if (tool.when && !this._contextKeyService.contextMatchesRules(tool.when)) {
                    continue;
                }
                if (tool.canBeReferencedInPrompt && !coveredByToolSets.has(tool) && this.isPermitted(tool, reader)) {
                    result.push([tool, getToolFullReferenceName(tool)]);
                }
            }
            return result;
        });
        this._isAgentModeEnabled = observableConfigValue(ChatConfiguration.AgentEnabled, true, this._configurationService);
        this._register(this._contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(this._toolContextKeys)) {
                // Not worth it to compute a delta here unless we have many tools changing often
                this._onDidChangeToolsScheduler.schedule();
            }
        }));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ChatConfiguration.ExtensionToolsEnabled) || e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
                this._onDidChangeToolsScheduler.schedule();
            }
        }));
        // Clear out warning accepted state if the setting is disabled
        this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
                if (this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove) !== true) {
                    this._storageService.remove("chat.tools.global.autoApprove.optIn" /* AutoApproveStorageKeys.GlobalAutoApproveOptIn */, -1 /* StorageScope.APPLICATION */);
                }
            }
        }));
        this._ctxToolsCount = ChatContextKeys.Tools.toolsCount.bindTo(_contextKeyService);
        // Create the internal VS Code tool set
        this.vscodeToolSet = this._register(this.createToolSet(ToolDataSource.Internal, 'vscode', VSCodeToolReference.vscode, {
            icon: ThemeIcon.fromId(Codicon.vscode.id),
            description: localize('copilot.toolSet.vscode.description', 'Use VS Code features'),
        }));
        // Create the internal Execute tool set
        this.executeToolSet = this._register(this.createToolSet(ToolDataSource.Internal, 'execute', SpecedToolAliases.execute, {
            icon: ThemeIcon.fromId(Codicon.terminal.id),
            description: localize('copilot.toolSet.execute.description', 'Execute code and applications on your machine'),
        }));
        // Create the internal Read tool set
        this.readToolSet = this._register(this.createToolSet(ToolDataSource.Internal, 'read', SpecedToolAliases.read, {
            icon: ThemeIcon.fromId(Codicon.book.id),
            description: localize('copilot.toolSet.read.description', 'Read files in your workspace'),
        }));
        // Create the internal Agent tool set
        this.agentToolSet = this._register(this.createToolSet(ToolDataSource.Internal, 'agent', SpecedToolAliases.agent, {
            icon: ThemeIcon.fromId(Codicon.agent.id),
            description: localize('copilot.toolSet.agent.description', 'Delegate tasks to other agents'),
        }));
    }
    /**
     * Returns if the given tool or toolset is permitted in the current context.
     * When agent mode is enabled, all tools are permitted (no restriction)
     * When agent mode is disabled only a subset of read-only tools are permitted in agentic-loop contexts.
     */
    isPermitted(toolOrToolSet, reader) {
        const agentModeEnabled = this._isAgentModeEnabled.read(reader);
        if (agentModeEnabled !== false) {
            return true;
        }
        // Internal tools that explicitly cannot be referenced in prompts are always permitted
        // since they are infrastructure tools (e.g. inline_chat_exit), not user-facing agent tools
        if (!isToolSet(toolOrToolSet) && toolOrToolSet.canBeReferencedInPrompt === false && toolOrToolSet.source.type === 'internal') {
            return true;
        }
        const permittedInternalToolSetIds = [SpecedToolAliases.read, SpecedToolAliases.search, SpecedToolAliases.web];
        if (isToolSet(toolOrToolSet)) {
            const permitted = toolOrToolSet.source.type === 'internal' && permittedInternalToolSetIds.includes(toolOrToolSet.referenceName);
            this._logService.trace(`LanguageModelToolsService#isPermitted: ToolSet ${toolOrToolSet.id} (${toolOrToolSet.referenceName}) permitted=${permitted}`);
            return permitted;
        }
        for (const toolSet of this._toolSets) {
            if (toolSet.source.type === 'internal' && permittedInternalToolSetIds.includes(toolSet.referenceName)) {
                for (const memberTool of toolSet.getTools()) {
                    if (memberTool.id === toolOrToolSet.id) {
                        this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=true (member of ${toolSet.referenceName})`);
                        return true;
                    }
                }
            }
        }
        // Special case for 'vscode_fetchWebPage_internal', which is allowed if we allow 'web' tools
        // Fetch is implemented with two tools, this one and 'copilot_fetchWebPage'
        if (toolOrToolSet.id === 'vscode_fetchWebPage_internal' && permittedInternalToolSetIds.includes(SpecedToolAliases.web)) {
            this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=true (special case)`);
            return true;
        }
        this._logService.trace(`LanguageModelToolsService#isPermitted: Tool ${toolOrToolSet.id} (${toolOrToolSet.toolReferenceName}) permitted=false`);
        return false;
    }
    dispose() {
        super.dispose();
        this._callsByRequestId.forEach(calls => calls.forEach(call => call.store.dispose()));
        this._pendingToolCalls.clear();
        this._ctxToolsCount.reset();
    }
    registerToolData(toolData) {
        if (this._tools.has(toolData.id)) {
            throw new Error(`Tool "${toolData.id}" is already registered.`);
        }
        this._tools.set(toolData.id, { data: toolData });
        this._ctxToolsCount.set(this._tools.size);
        if (!this._onDidChangeToolsScheduler.isScheduled()) {
            this._onDidChangeToolsScheduler.schedule();
        }
        toolData.when?.keys().forEach(key => this._toolContextKeys.add(key));
        let store;
        if (toolData.inputSchema) {
            store = new DisposableStore();
            const schemaUrl = createToolSchemaUri(toolData.id).toString();
            jsonSchemaRegistry.registerSchema(schemaUrl, toolData.inputSchema, store);
            store.add(jsonSchemaRegistry.registerSchemaAssociation(schemaUrl, `/lm/tool/${toolData.id}/tool_input.json`));
        }
        return toDisposable(() => {
            store?.dispose();
            this._tools.delete(toolData.id);
            this._ctxToolsCount.set(this._tools.size);
            this._refreshAllToolContextKeys();
            if (!this._onDidChangeToolsScheduler.isScheduled()) {
                this._onDidChangeToolsScheduler.schedule();
            }
        });
    }
    flushToolUpdates() {
        this._onDidChangeToolsScheduler.flush();
    }
    _refreshAllToolContextKeys() {
        this._toolContextKeys.clear();
        for (const tool of this._tools.values()) {
            tool.data.when?.keys().forEach(key => this._toolContextKeys.add(key));
        }
    }
    registerToolImplementation(id, tool) {
        const entry = this._tools.get(id);
        if (!entry) {
            throw new Error(`Tool "${id}" was not contributed.`);
        }
        if (entry.impl) {
            throw new Error(`Tool "${id}" already has an implementation.`);
        }
        entry.impl = tool;
        return toDisposable(() => {
            entry.impl = undefined;
        });
    }
    registerTool(toolData, tool) {
        return combinedDisposable(this.registerToolData(toolData), this.registerToolImplementation(toolData.id, tool));
    }
    getTools(model) {
        const toolDatas = Iterable.map(this._tools.values(), i => i.data);
        const extensionToolsEnabled = this._configurationService.getValue(ChatConfiguration.ExtensionToolsEnabled);
        return Iterable.filter(toolDatas, toolData => {
            const satisfiesWhenClause = !toolData.when || this._contextKeyService.contextMatchesRules(toolData.when);
            const satisfiesExternalToolCheck = toolData.source.type !== 'extension' || !!extensionToolsEnabled;
            const satisfiesPermittedCheck = this.isPermitted(toolData);
            const satisfiesModelFilter = toolMatchesModel(toolData, model);
            return satisfiesWhenClause && satisfiesExternalToolCheck && satisfiesPermittedCheck && satisfiesModelFilter;
        });
    }
    observeTools(model) {
        const meta = derived(reader => {
            const signal = observableSignal('observeToolsContext');
            const trigger = () => transaction(tx => signal.trigger(tx));
            reader.store.add(this.onDidChangeTools(trigger));
            return signal;
        });
        return derivedOpts({ equalsFn: arrayEqualsC() }, reader => {
            meta.read(reader).read(reader);
            return Array.from(this.getTools(model));
        });
    }
    getAllToolsIncludingDisabled() {
        const toolDatas = Iterable.map(this._tools.values(), i => i.data);
        const extensionToolsEnabled = this._configurationService.getValue(ChatConfiguration.ExtensionToolsEnabled);
        return Iterable.filter(toolDatas, toolData => {
            const satisfiesExternalToolCheck = toolData.source.type !== 'extension' || !!extensionToolsEnabled;
            const satisfiesPermittedCheck = this.isPermitted(toolData);
            return satisfiesExternalToolCheck && satisfiesPermittedCheck;
        });
    }
    getTool(id) {
        return this._tools.get(id)?.data;
    }
    getToolByName(name) {
        for (const tool of this.getAllToolsIncludingDisabled()) {
            if (tool.toolReferenceName === name) {
                return tool;
            }
        }
        return undefined;
    }
    _handlePreToolUseDenial(dto, hookResult, toolData, pendingInvocation, request) {
        const hookReason = hookResult.permissionDecisionReason ?? localize('hookDeniedNoReason', "Hook denied tool execution");
        const reason = localize('deniedByPreToolUseHook', "Denied by {0} hook: {1}", HookType.PreToolUse, hookReason);
        this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} denied by preToolUse hook: ${hookReason}`);
        if (toolData) {
            if (pendingInvocation) {
                pendingInvocation.presentation = ToolInvocationPresentation.Hidden;
                pendingInvocation.cancelFromStreaming(0 /* ToolConfirmKind.Denied */, reason);
            }
            else if (request) {
                const cancelledInvocation = ChatToolInvocation.createCancelled({ toolCallId: dto.callId, toolId: dto.toolId, toolData, subagentInvocationId: dto.subAgentInvocationId, chatRequestId: dto.chatRequestId }, dto.parameters, 0 /* ToolConfirmKind.Denied */, reason);
                cancelledInvocation.presentation = ToolInvocationPresentation.Hidden;
                this._chatService.appendProgress(request, cancelledInvocation);
            }
        }
        return {
            content: [{ kind: 'text', value: `Tool execution denied: ${hookReason}` }],
            toolResultError: hookReason,
        };
    }
    /**
     * Validate updatedInput from a preToolUse hook against the tool's input schema
     * using the json.validate command from the JSON extension.
     * @returns An error message string if validation fails, or undefined if valid.
     */
    async _validateUpdatedInput(toolId, toolData, updatedInput) {
        if (!toolData?.inputSchema) {
            return undefined;
        }
        try {
            const schemaUri = createToolSchemaUri(toolId);
            const inputJson = JSON.stringify(updatedInput);
            const diagnostics = await this._commandService.executeCommand('json.validate', schemaUri, inputJson) || [];
            if (diagnostics.length > 0) {
                return diagnostics.map(d => d.message).join('; ');
            }
        }
        catch (e) {
            // json extension may not be available; skip validation
            this._logService.debug(`[LanguageModelToolsService#_validateUpdatedInput] json.validate command failed, skipping validation: ${toErrorMessage(e)}`);
        }
        return undefined;
    }
    async invokeTool(dto, countTokens, token) {
        this._logService.trace(`[LanguageModelToolsService#invokeTool] Invoking tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}`);
        const toolData = this._tools.get(dto.toolId)?.data;
        let model;
        let request;
        if (dto.context?.sessionResource) {
            model = this._chatService.getSession(dto.context.sessionResource);
            request = model?.getRequests().at(-1);
            if (request?.response?.isCanceled || request?.response?.isComplete) {
                this._logService.debug(`[LanguageModelToolsService#invokeTool] Ignoring tool ${dto.toolId} for cancelled/complete request ${request.id}`);
                throw new CancellationError();
            }
        }
        // Check if there's an existing pending tool call from streaming phase BEFORE hook check
        let pendingToolCallKey;
        let toolInvocation;
        if (this._pendingToolCalls.has(dto.callId)) {
            pendingToolCallKey = dto.callId;
            toolInvocation = this._pendingToolCalls.get(dto.callId);
        }
        else if (dto.chatStreamToolCallId && this._pendingToolCalls.has(dto.chatStreamToolCallId)) {
            pendingToolCallKey = dto.chatStreamToolCallId;
            toolInvocation = this._pendingToolCalls.get(dto.chatStreamToolCallId);
        }
        let requestId;
        let store;
        if (dto.context && request) {
            requestId = request.id;
            store = new DisposableStore();
            if (!this._callsByRequestId.has(requestId)) {
                this._callsByRequestId.set(requestId, []);
            }
            const trackedCall = { store };
            this._callsByRequestId.get(requestId).push(trackedCall);
            const source = new CancellationTokenSource();
            store.add(toDisposable(() => {
                source.dispose(true);
            }));
            store.add(token.onCancellationRequested((() => {
                IChatToolInvocation.confirmWith(toolInvocation, { type: 0 /* ToolConfirmKind.Denied */ });
                source.cancel();
            })));
            store.add(source.token.onCancellationRequested(() => {
                IChatToolInvocation.confirmWith(toolInvocation, { type: 0 /* ToolConfirmKind.Denied */ });
            }));
            token = source.token;
        }
        // Handle preToolUse hook denial
        const preToolUseHookResult = dto.preToolUseResult;
        if (preToolUseHookResult?.permissionDecision === 'deny') {
            const denialResult = this._handlePreToolUseDenial(dto, preToolUseHookResult, toolData, toolInvocation, request);
            if (pendingToolCallKey) {
                this._pendingToolCalls.delete(pendingToolCallKey);
            }
            return denialResult;
        }
        // Apply updatedInput from preToolUse hook if provided, after validating against the tool's input schema
        if (preToolUseHookResult?.updatedInput) {
            const validationError = await this._validateUpdatedInput(dto.toolId, toolData, preToolUseHookResult.updatedInput);
            if (validationError) {
                this._logService.warn(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} updatedInput from preToolUse hook failed schema validation: ${validationError}`);
            }
            else {
                this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} input modified by preToolUse hook`);
                dto.parameters = preToolUseHookResult.updatedInput;
            }
        }
        // Fire the event to notify listeners that a tool is being invoked
        this._onDidInvokeTool.fire({
            toolId: dto.toolId,
            sessionResource: dto.context?.sessionResource,
            requestId: dto.chatRequestId,
            subagentInvocationId: dto.subAgentInvocationId,
        });
        // When invoking a tool, don't validate the "when" clause. An extension may have invoked a tool just as it was becoming disabled, and just let it go through rather than throw and break the chat.
        let tool = this._tools.get(dto.toolId);
        if (!tool) {
            throw new Error(`Tool ${dto.toolId} was not contributed`);
        }
        if (!tool.impl) {
            await this._extensionService.activateByEvent(`onLanguageModelTool:${dto.toolId}`);
            // Extension should activate and register the tool implementation
            tool = this._tools.get(dto.toolId);
            if (!tool?.impl) {
                throw new Error(`Tool ${dto.toolId} does not have an implementation registered.`);
            }
        }
        // Note: pending invocation lookup was already done above for the hook check
        const hadPendingInvocation = !!toolInvocation;
        if (hadPendingInvocation && pendingToolCallKey) {
            // Remove from pending since we're now invoking it
            this._pendingToolCalls.delete(pendingToolCallKey);
        }
        let toolResult;
        let prepareTimeWatch;
        let invocationTimeWatch;
        let preparedInvocation;
        try {
            if (dto.context) {
                if (!model) {
                    throw new Error(`Tool called for unknown chat session`);
                }
                if (!request) {
                    throw new Error(`Tool called for unknown chat request`);
                }
                dto.modelId = request.modelId;
                dto.userSelectedTools = request.userSelectedTools && { ...request.userSelectedTools };
                prepareTimeWatch = StopWatch.create(true);
                preparedInvocation = await this.prepareToolInvocationWithHookResult(tool, dto, preToolUseHookResult, token);
                prepareTimeWatch.stop();
                const { autoConfirmed, preparedInvocation: updatedPreparedInvocation } = await this.resolveAutoConfirmFromHook(preToolUseHookResult, tool, dto, preparedInvocation, dto.context?.sessionResource);
                preparedInvocation = updatedPreparedInvocation;
                // Important: a tool invocation that will be autoconfirmed should never
                // be in the chat response in the `NeedsConfirmation` state, even briefly,
                // as that triggers notifications and causes issues in eval.
                if (hadPendingInvocation && toolInvocation) {
                    // Transition from streaming to executing/waiting state
                    toolInvocation.transitionFromStreaming(preparedInvocation, dto.parameters, autoConfirmed);
                }
                else {
                    // Create a new tool invocation (no streaming phase)
                    toolInvocation = new ChatToolInvocation(preparedInvocation, tool.data, dto.chatStreamToolCallId ?? dto.callId, dto.subAgentInvocationId, dto.parameters);
                    if (autoConfirmed) {
                        IChatToolInvocation.confirmWith(toolInvocation, autoConfirmed);
                    }
                    this._chatService.appendProgress(request, toolInvocation);
                }
                dto.toolSpecificData = toolInvocation?.toolSpecificData;
                if (preparedInvocation?.confirmationMessages?.title) {
                    if (!IChatToolInvocation.executionConfirmedOrDenied(toolInvocation) && !autoConfirmed) {
                        this.playAccessibilitySignal([toolInvocation], dto.context?.sessionResource);
                    }
                    const userConfirmed = await IChatToolInvocation.awaitConfirmation(toolInvocation, token);
                    if (userConfirmed.type === 0 /* ToolConfirmKind.Denied */) {
                        throw new CancellationError();
                    }
                    if (userConfirmed.type === 5 /* ToolConfirmKind.Skipped */) {
                        toolResult = {
                            content: [{
                                    kind: 'text',
                                    value: 'The user chose to skip the tool call, they want to proceed without running it'
                                }]
                        };
                        return toolResult;
                    }
                    if (userConfirmed.type === 4 /* ToolConfirmKind.UserAction */ && userConfirmed.selectedButton) {
                        dto.selectedCustomButton = userConfirmed.selectedButton;
                    }
                    if (dto.toolSpecificData?.kind === 'input') {
                        dto.parameters = dto.toolSpecificData.rawInput;
                        dto.toolSpecificData = undefined;
                    }
                }
            }
            else {
                prepareTimeWatch = StopWatch.create(true);
                preparedInvocation = await this.prepareToolInvocationWithHookResult(tool, dto, preToolUseHookResult, token);
                prepareTimeWatch.stop();
                const { autoConfirmed: fallbackAutoConfirmed, preparedInvocation: updatedPreparedInvocation } = await this.resolveAutoConfirmFromHook(preToolUseHookResult, tool, dto, preparedInvocation, undefined);
                preparedInvocation = updatedPreparedInvocation;
                if (preparedInvocation?.confirmationMessages?.title && !fallbackAutoConfirmed) {
                    const result = await this._dialogService.confirm({ message: renderAsPlaintext(preparedInvocation.confirmationMessages.title), detail: renderAsPlaintext(preparedInvocation.confirmationMessages.message) });
                    if (!result.confirmed) {
                        throw new CancellationError();
                    }
                }
                dto.toolSpecificData = preparedInvocation?.toolSpecificData;
            }
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            invocationTimeWatch = StopWatch.create(true);
            toolResult = await tool.impl.invoke(dto, countTokens, {
                report: step => {
                    toolInvocation?.acceptProgress(step);
                }
            }, token);
            invocationTimeWatch.stop();
            this.ensureToolDetails(dto, toolResult, tool.data, toolInvocation);
            const afterExecuteState = await toolInvocation?.didExecuteTool(toolResult, undefined, () => this.shouldAutoConfirmPostExecution(tool.data.id, tool.data.runsInWorkspace, tool.data.source, dto.parameters, dto.context?.sessionResource, dto.chatRequestId));
            if (toolInvocation && afterExecuteState?.type === 3 /* IChatToolInvocation.StateKind.WaitingForPostApproval */) {
                const postConfirm = await IChatToolInvocation.awaitPostConfirmation(toolInvocation, token);
                if (postConfirm.type === 0 /* ToolConfirmKind.Denied */) {
                    throw new CancellationError();
                }
                if (postConfirm.type === 5 /* ToolConfirmKind.Skipped */) {
                    toolResult = {
                        content: [{
                                kind: 'text',
                                value: 'The tool executed but the user chose not to share the results'
                            }]
                    };
                }
            }
            this._telemetryService.publicLog2('languageModelToolInvoked', {
                result: 'success',
                chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : undefined,
                toolId: tool.data.id,
                toolExtensionId: tool.data.source.type === 'extension' ? tool.data.source.extensionId.value : undefined,
                toolSourceKind: tool.data.source.type,
                prepareTimeMs: prepareTimeWatch?.elapsed(),
                invocationTimeMs: invocationTimeWatch?.elapsed(),
            });
            return toolResult;
        }
        catch (err) {
            const result = isCancellationError(err) ? 'userCancelled' : 'error';
            this._telemetryService.publicLog2('languageModelToolInvoked', {
                result,
                chatSessionId: dto.context?.sessionResource ? chatSessionResourceToId(dto.context.sessionResource) : undefined,
                toolId: tool.data.id,
                toolExtensionId: tool.data.source.type === 'extension' ? tool.data.source.extensionId.value : undefined,
                toolSourceKind: tool.data.source.type,
                prepareTimeMs: prepareTimeWatch?.elapsed(),
                invocationTimeMs: invocationTimeWatch?.elapsed(),
            });
            if (!isCancellationError(err)) {
                this._logService.error(`[LanguageModelToolsService#invokeTool] Error from tool ${dto.toolId} with parameters ${JSON.stringify(dto.parameters)}:\n${toErrorMessage(err, true)}`);
            }
            toolResult ??= { content: [] };
            toolResult.toolResultError = err instanceof Error ? err.message : String(err);
            if (tool.data.alwaysDisplayInputOutput) {
                toolResult.toolResultDetails = { input: this.formatToolInput(dto), output: [{ type: 'embed', isText: true, value: String(err) }], isError: true };
            }
            throw err;
        }
        finally {
            toolInvocation?.didExecuteTool(toolResult, true);
            if (store) {
                this.cleanupCallDisposables(requestId, store);
            }
        }
    }
    async prepareToolInvocationWithHookResult(tool, dto, hookResult, token) {
        let forceConfirmationReason;
        if (hookResult?.permissionDecision === 'ask') {
            const hookMessage = localize('preToolUseHookRequiredConfirmation', "{0} required confirmation", HookType.PreToolUse);
            forceConfirmationReason = hookResult.permissionDecisionReason
                ? `${hookMessage}: ${hookResult.permissionDecisionReason}`
                : hookMessage;
        }
        return this.prepareToolInvocation(tool, dto, forceConfirmationReason, token);
    }
    /**
     * Determines the auto-confirm decision based on a preToolUse hook result.
     * If the hook returned 'allow', auto-approves. If 'ask', forces confirmation
     * and ensures confirmation messages exist on `preparedInvocation`. Otherwise
     * falls back to normal auto-confirm logic.
     *
     * Returns the possibly-updated preparedInvocation along with the auto-confirm decision,
     * since when the hook returns 'ask' and preparedInvocation was undefined, we create one.
     */
    async resolveAutoConfirmFromHook(hookResult, tool, dto, preparedInvocation, sessionResource) {
        if (hookResult?.permissionDecision === 'allow') {
            this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} auto-approved by preToolUse hook`);
            return { autoConfirmed: { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */, reason: localize('hookAllowed', "Allowed by hook") }, preparedInvocation };
        }
        if (hookResult?.permissionDecision === 'ask') {
            this._logService.debug(`[LanguageModelToolsService#invokeTool] Tool ${dto.toolId} requires confirmation (preToolUse hook returned 'ask')`);
            // Ensure confirmation messages exist when hook requires confirmation
            if (!preparedInvocation?.confirmationMessages?.title) {
                if (!preparedInvocation) {
                    preparedInvocation = {};
                }
                const fullReferenceName = getToolFullReferenceName(tool.data);
                const hookReason = hookResult.permissionDecisionReason;
                const hookNote = hookReason
                    ? localize('hookRequiresConfirmation.messageWithReason', "{0} hook required confirmation: {1}", HookType.PreToolUse, hookReason)
                    : localize('hookRequiresConfirmation.message', "{0} hook required confirmation", HookType.PreToolUse);
                preparedInvocation.confirmationMessages = {
                    ...preparedInvocation.confirmationMessages,
                    title: localize('hookRequiresConfirmation.title', "Use the '{0}' tool?", fullReferenceName),
                    message: new MarkdownString(`_${hookNote}_`),
                    allowAutoConfirm: false,
                };
                preparedInvocation.toolSpecificData = {
                    kind: 'input',
                    rawInput: dto.parameters,
                };
            }
            else {
                // Tool already has its own confirmation - prepend hook note
                const hookReason = hookResult.permissionDecisionReason;
                const hookNote = hookReason
                    ? localize('hookRequiresConfirmation.note', "{0} hook required confirmation: {1}", HookType.PreToolUse, hookReason)
                    : localize('hookRequiresConfirmation.noteNoReason', "{0} hook required confirmation", HookType.PreToolUse);
                const existing = preparedInvocation.confirmationMessages;
                if (preparedInvocation.toolSpecificData?.kind === 'terminal') {
                    // Terminal tools render message as hover only; use disclaimer for visible text
                    const existingDisclaimerText = existing.disclaimer
                        ? (typeof existing.disclaimer === 'string' ? existing.disclaimer : existing.disclaimer.value)
                        : undefined;
                    const combinedDisclaimer = existingDisclaimerText
                        ? `${hookNote}\n\n${existingDisclaimerText}`
                        : hookNote;
                    preparedInvocation.confirmationMessages = {
                        ...existing,
                        disclaimer: combinedDisclaimer,
                        allowAutoConfirm: false,
                    };
                }
                else {
                    // Edit/other tools: prepend hook note to the message body
                    const msgText = typeof existing.message === 'string' ? existing.message : existing.message?.value ?? '';
                    preparedInvocation.confirmationMessages = {
                        ...existing,
                        message: new MarkdownString(`_${hookNote}_\n\n${msgText}`),
                        allowAutoConfirm: false,
                    };
                }
            }
            return { autoConfirmed: undefined, preparedInvocation };
        }
        // No hook decision - use normal auto-confirm logic
        const approveCombination = preparedInvocation?.confirmationMessages?.approveCombination;
        let combination;
        if (approveCombination) {
            combination = {
                label: typeof approveCombination.label === 'string' ? approveCombination.label : approveCombination.label.value,
                key: approveCombination.key,
            };
        }
        const autoConfirmed = await this.shouldAutoConfirm(tool.data.id, tool.data.runsInWorkspace, tool.data.source, dto.parameters, sessionResource, dto.chatRequestId, combination);
        return { autoConfirmed, preparedInvocation };
    }
    async prepareToolInvocation(tool, dto, forceConfirmationReason, token) {
        let prepared;
        if (tool.impl.prepareToolInvocation) {
            const preparePromise = tool.impl.prepareToolInvocation({
                parameters: dto.parameters,
                toolCallId: dto.callId,
                chatRequestId: dto.chatRequestId,
                chatSessionResource: dto.context?.sessionResource,
                chatInteractionId: dto.chatInteractionId,
                modelId: dto.modelId,
                forceConfirmationReason: forceConfirmationReason
            }, token);
            const raceResult = await Promise.race([
                timeout(3000, token).then(() => 'timeout'),
                preparePromise
            ]);
            if (raceResult === 'timeout' && dto.context) {
                this._onDidPrepareToolCallBecomeUnresponsive.fire({
                    sessionResource: dto.context.sessionResource,
                    toolData: tool.data
                });
            }
            prepared = await preparePromise;
        }
        const isEligibleForAutoApproval = this.isToolEligibleForAutoApproval(tool.data);
        // Default confirmation messages if tool is not eligible for auto-approval
        if (!isEligibleForAutoApproval && !prepared?.confirmationMessages?.title) {
            if (!prepared) {
                prepared = {};
            }
            const fullReferenceName = getToolFullReferenceName(tool.data);
            // TODO: This should be more detailed per tool.
            prepared.confirmationMessages = {
                ...prepared.confirmationMessages,
                title: localize('defaultToolConfirmation.title', 'Confirm tool execution'),
                message: localize('defaultToolConfirmation.message', 'Run the \'{0}\' tool?', fullReferenceName),
                disclaimer: toolIdsThatCannotBeAutoApproved.has(tool.data.id) ? undefined : new MarkdownString(localize('defaultToolConfirmation.disclaimer', 'Auto approval for \'{0}\' is restricted via {1}.', getToolFullReferenceName(tool.data), createMarkdownCommandLink({ text: '`' + ChatConfiguration.EligibleForAutoApproval + '`', id: 'workbench.action.openSettings', arguments: [ChatConfiguration.EligibleForAutoApproval], tooltip: localize('openSettings.autoApproval.tooltip', 'Open settings to configure auto-approval') }, false)), { isTrusted: true }),
                allowAutoConfirm: false,
            };
        }
        if (!isEligibleForAutoApproval && prepared?.confirmationMessages?.title) {
            // Always overwrite the disclaimer if not eligible for auto-approval
            prepared.confirmationMessages.disclaimer = toolIdsThatCannotBeAutoApproved.has(tool.data.id) ? undefined : new MarkdownString(localize('defaultToolConfirmation.disclaimer', 'Auto approval for \'{0}\' is restricted via {1}.', getToolFullReferenceName(tool.data), createMarkdownCommandLink({ text: '`' + ChatConfiguration.EligibleForAutoApproval + '`', id: 'workbench.action.openSettings', arguments: [ChatConfiguration.EligibleForAutoApproval], tooltip: localize('openSettings.autoApproval.tooltip', 'Open settings to configure auto-approval') }, false)), { isTrusted: true });
        }
        if (prepared?.confirmationMessages?.title) {
            if (prepared.toolSpecificData?.kind !== 'terminal' && prepared.confirmationMessages.allowAutoConfirm !== false) {
                prepared.confirmationMessages.allowAutoConfirm = isEligibleForAutoApproval;
            }
            if (!prepared.toolSpecificData && tool.data.alwaysDisplayInputOutput) {
                prepared.toolSpecificData = {
                    kind: 'input',
                    rawInput: dto.parameters,
                };
            }
        }
        return prepared;
    }
    beginToolCall(options) {
        // First try to look up by tool ID (the package.json "name" field),
        // then fall back to looking up by toolReferenceName
        const toolEntry = this._tools.get(options.toolId);
        if (!toolEntry) {
            return undefined;
        }
        // Don't create a streaming invocation for tools that don't implement handleToolStream.
        // These tools will have their invocation created directly in invokeToolInternal.
        if (!toolEntry.impl?.handleToolStream) {
            return undefined;
        }
        // Create the invocation in streaming state
        const invocation = ChatToolInvocation.createStreaming({
            toolCallId: options.toolCallId,
            toolId: options.toolId,
            toolData: toolEntry.data,
            subagentInvocationId: options.subagentInvocationId,
            chatRequestId: options.chatRequestId,
        });
        // Track the pending tool call
        this._pendingToolCalls.set(options.toolCallId, invocation);
        // If we have a session, append the invocation to the chat as progress
        if (options.sessionResource) {
            const model = this._chatService.getSession(options.sessionResource);
            if (model) {
                // Find the request by chatRequestId if available, otherwise use the last request
                const request = (options.chatRequestId
                    ? model.getRequests().find(r => r.id === options.chatRequestId)
                    : undefined) ?? model.getRequests().at(-1);
                if (request) {
                    this._chatService.appendProgress(request, invocation);
                }
            }
        }
        // Call handleToolStream to get initial streaming message
        this._callHandleToolStream(toolEntry, invocation, options.toolCallId, undefined, CancellationToken.None);
        return invocation;
    }
    async _callHandleToolStream(toolEntry, invocation, toolCallId, rawInput, token) {
        if (!toolEntry.impl?.handleToolStream) {
            return;
        }
        try {
            const result = await toolEntry.impl.handleToolStream({
                toolCallId,
                rawInput,
                chatRequestId: invocation.chatRequestId,
            }, token);
            if (result?.invocationMessage) {
                invocation.updateStreamingMessage(result.invocationMessage);
            }
        }
        catch (error) {
            this._logService.error(`[LanguageModelToolsService#_callHandleToolStream] Error calling handleToolStream for tool ${toolEntry.data.id}:`, error);
        }
    }
    async updateToolStream(toolCallId, partialInput, token) {
        const invocation = this._pendingToolCalls.get(toolCallId);
        if (!invocation) {
            return;
        }
        // Update the partial input on the invocation
        invocation.updatePartialInput(partialInput);
        // Call handleToolStream if the tool implements it
        const toolEntry = this._tools.get(invocation.toolId);
        if (toolEntry) {
            await this._callHandleToolStream(toolEntry, invocation, toolCallId, partialInput, token);
        }
    }
    playAccessibilitySignal(toolInvocations, chatSessionResource) {
        const autoApproved = this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove);
        if (autoApproved) {
            return;
        }
        // Autopilot/auto-approve permission levels auto-approve all tools, skip signal
        if (chatSessionResource) {
            const model = this._chatService.getSession(chatSessionResource);
            const request = model?.getRequests().at(-1);
            if (isAutoApproveLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutoApproveLevel(chatSessionResource)) {
                return;
            }
        }
        // Filter out any tool invocations that have already been confirmed/denied.
        // This is a defensive check - normally the call site should prevent this,
        // but tools may be auto-approved through various mechanisms (per-session rules,
        // per-workspace rules, etc.) that could cause a race condition.
        const pendingInvocations = toolInvocations.filter(inv => !IChatToolInvocation.executionConfirmedOrDenied(inv));
        if (pendingInvocations.length === 0) {
            return;
        }
        const setting = this._configurationService.getValue(AccessibilitySignal.chatUserActionRequired.settingsKey);
        if (!setting) {
            return;
        }
        const soundEnabled = setting.sound === 'on' || (setting.sound === 'auto' && (this._accessibilityService.isScreenReaderOptimized()));
        const announcementEnabled = this._accessibilityService.isScreenReaderOptimized() && setting.announcement === 'auto';
        if (soundEnabled || announcementEnabled) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { customAlertMessage: this._instantiationService.invokeFunction(getToolConfirmationAlert, pendingInvocations), userGesture: true, modality: !soundEnabled ? 'announcement' : undefined });
        }
    }
    ensureToolDetails(dto, toolResult, toolData, toolInvocation) {
        if (!toolResult.toolResultDetails && (toolData.alwaysDisplayInputOutput || (this.toolResultHasImages(toolResult) && !this.toolResultMessageHasImageFileWidgets(toolResult, toolInvocation)))) {
            toolResult.toolResultDetails = {
                input: this.formatToolInput(dto),
                output: this.toolResultToIO(toolResult),
            };
        }
    }
    toolResultHasImages(toolResult) {
        return toolResult.content.some(part => part.kind === 'data' && part.value.mimeType?.startsWith('image/'));
    }
    /**
     * Returns true if the tool result message (or falling back to the tool invocation's
     * pastTenseMessage from streaming) contains empty markdown links pointing to image
     * files (the `[](imageUri)` pattern) that will be rendered as file pills by renderFileWidgets.
     */
    toolResultMessageHasImageFileWidgets(toolResult, toolInvocation) {
        // Check toolResult.toolResultMessage first — this is what didExecuteTool will
        // copy into pastTenseMessage, and it's already available at this point.
        // Fall back to pastTenseMessage which may have been set during the streaming phase.
        const message = toolResult.toolResultMessage ?? toolInvocation?.pastTenseMessage;
        if (!message) {
            return false;
        }
        const value = typeof message === 'string' ? message : message.value;
        // Match empty-text markdown links: [](uri) or [ ](uri), capturing the uri
        const linkPattern = /\[\s*\]\((?<uri>[^)]+)\)/g;
        let match;
        while ((match = linkPattern.exec(value)) !== null) {
            try {
                const parsed = URI.parse(match.groups.uri);
                const mime = getMediaMime(parsed.path);
                if (mime?.startsWith('image/')) {
                    return true;
                }
            }
            catch {
                // Invalid URI, skip
            }
        }
        return false;
    }
    formatToolInput(dto) {
        return JSON.stringify(dto.parameters, undefined, 2);
    }
    toolResultToIO(toolResult) {
        return toolResult.content.map(part => {
            if (part.kind === 'text') {
                return { type: 'embed', isText: true, value: part.value };
            }
            else if (part.kind === 'promptTsx') {
                return { type: 'embed', isText: true, value: stringifyPromptTsxPart(part) };
            }
            else if (part.kind === 'data') {
                return { type: 'embed', value: encodeBase64(part.value.data), mimeType: part.value.mimeType };
            }
            else {
                assertNever(part);
            }
        });
    }
    /**
     * Returns true if enterprise policy has explicitly disabled the global auto-approve setting.
     * When this is the case, Bypass Approvals and Autopilot permission levels should not auto-approve tools.
     */
    _isAutoApprovePolicyRestricted() {
        const inspected = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
        return inspected.policyValue === false;
    }
    /**
     * Returns true if the session's current (live) permission picker level is auto-approve.
     * This checks the widget's current state, not what was stamped on the request,
     * so switching to Autopilot mid-session takes effect immediately.
     */
    _isSessionLiveAutoApproveLevel(chatSessionResource) {
        const widget = this._chatWidgetService.getWidgetBySessionResource(chatSessionResource)
            ?? this._chatWidgetService.lastFocusedWidget;
        return !!widget && isAutoApproveLevel(widget.input.currentModeInfo.permissionLevel);
    }
    getEligibleForAutoApprovalSpecialCase(toolData) {
        if (toolData.id === 'vscode_fetchWebPage_internal') {
            return 'fetch';
        }
        return undefined;
    }
    isToolEligibleForAutoApproval(toolData) {
        const fullReferenceName = this.getEligibleForAutoApprovalSpecialCase(toolData) ?? getToolFullReferenceName(toolData);
        if (toolData.id === 'copilot_fetchWebPage') {
            // Special case, this fetch will call an internal tool 'vscode_fetchWebPage_internal'
            return true;
        }
        if (toolIdsThatCannotBeAutoApproved.has(toolData.id)) {
            // Special case, this tool will always require user confirmation as there are multiple options,
            // These aren't LM generated instead are generated by extension before agentic loop starts.
            return false;
        }
        const eligibilityConfig = this._configurationService.getValue(ChatConfiguration.EligibleForAutoApproval);
        if (eligibilityConfig && typeof eligibilityConfig === 'object' && fullReferenceName) {
            // Direct match
            if (Object.prototype.hasOwnProperty.call(eligibilityConfig, fullReferenceName)) {
                return eligibilityConfig[fullReferenceName];
            }
            // Back compat with legacy names
            if (toolData.legacyToolReferenceFullNames) {
                for (const legacyName of toolData.legacyToolReferenceFullNames) {
                    // Check if the full legacy name is in the config
                    if (Object.prototype.hasOwnProperty.call(eligibilityConfig, legacyName)) {
                        return eligibilityConfig[legacyName];
                    }
                    // Some tools may be both renamed and namespaced from a toolset, eg: xxx/yyy -> yyy
                    if (legacyName.includes('/')) {
                        const trimmedLegacyName = legacyName.split('/').pop();
                        if (trimmedLegacyName && Object.prototype.hasOwnProperty.call(eligibilityConfig, trimmedLegacyName)) {
                            return eligibilityConfig[trimmedLegacyName];
                        }
                    }
                }
            }
        }
        return true;
    }
    async shouldAutoConfirm(toolId, runsInWorkspace, source, parameters, chatSessionResource, chatRequestId, combination) {
        const tool = this._tools.get(toolId);
        if (!tool) {
            return undefined;
        }
        // Auto-Approve All permission level bypasses all tool confirmations,
        // unless enterprise policy has explicitly disabled global auto-approve.
        // Check both the request-stamped level AND the live picker level so that
        // switching to Autopilot mid-session takes effect immediately.
        if (chatSessionResource && !this._isAutoApprovePolicyRestricted()) {
            const model = this._chatService.getSession(chatSessionResource);
            const request = model?.getRequests().at(-1);
            if (isAutoApproveLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutoApproveLevel(chatSessionResource)) {
                // CLI sessions must always show their multi-option confirmation dialogs
                // (e.g. uncommitted-changes prompt) even under Bypass Approvals
                if (!(toolIdsThatCannotBeAutoApproved.has(tool.data.id) && getChatSessionType(chatSessionResource) !== localChatSessionType)) {
                    return { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */, reason: 'auto-approve-all' };
                }
            }
        }
        if (!this.isToolEligibleForAutoApproval(tool.data)) {
            return undefined;
        }
        const reason = this._confirmationService.getPreConfirmAction({ toolId, source, parameters, chatSessionResource, combination });
        if (reason) {
            return reason;
        }
        const config = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
        // If we know the tool runs at a global level, only consider the global config.
        // If we know the tool runs at a workspace level, use those specific settings when appropriate.
        let value = config.value ?? config.defaultValue;
        if (typeof runsInWorkspace === 'boolean') {
            value = config.userLocalValue ?? config.applicationValue;
            if (runsInWorkspace) {
                value = config.workspaceValue ?? config.workspaceFolderValue ?? config.userRemoteValue ?? value;
            }
        }
        const autoConfirm = value === true || (typeof value === 'object' && value.hasOwnProperty(toolId) && value[toolId] === true);
        if (autoConfirm) {
            if (await this._checkGlobalAutoApprove()) {
                return { type: 2 /* ToolConfirmKind.Setting */, id: ChatConfiguration.GlobalAutoApprove };
            }
        }
        return undefined;
    }
    async shouldAutoConfirmPostExecution(toolId, runsInWorkspace, source, parameters, chatSessionResource, chatRequestId) {
        // Auto-Approve All permission level bypasses all post-execution confirmations,
        // unless enterprise policy has explicitly disabled global auto-approve.
        // Check both the request-stamped level AND the live picker level.
        if (chatSessionResource && !this._isAutoApprovePolicyRestricted()) {
            const model = this._chatService.getSession(chatSessionResource);
            const request = model?.getRequests().at(-1);
            if (isAutoApproveLevel(request?.modeInfo?.permissionLevel) || this._isSessionLiveAutoApproveLevel(chatSessionResource)) {
                if (!(toolIdsThatCannotBeAutoApproved.has(toolId) && getChatSessionType(chatSessionResource) !== localChatSessionType)) {
                    return { type: 1 /* ToolConfirmKind.ConfirmationNotNeeded */, reason: 'auto-approve-all' };
                }
            }
        }
        if (this._configurationService.getValue(ChatConfiguration.GlobalAutoApprove) && await this._checkGlobalAutoApprove()) {
            return { type: 2 /* ToolConfirmKind.Setting */, id: ChatConfiguration.GlobalAutoApprove };
        }
        return this._confirmationService.getPostConfirmAction({ toolId, source, parameters, chatSessionResource });
    }
    async _checkGlobalAutoApprove() {
        const optedIn = this._storageService.getBoolean("chat.tools.global.autoApprove.optIn" /* AutoApproveStorageKeys.GlobalAutoApproveOptIn */, -1 /* StorageScope.APPLICATION */, false);
        if (optedIn) {
            return true;
        }
        if (this._contextKeyService.getContextKeyValue(SkipAutoApproveConfirmationKey) === true) {
            return true;
        }
        if (this._pendingGlobalAutoApproveCheck) {
            return this._pendingGlobalAutoApproveCheck;
        }
        this._pendingGlobalAutoApproveCheck = this._doCheckGlobalAutoApprove();
        try {
            return await this._pendingGlobalAutoApproveCheck;
        }
        finally {
            this._pendingGlobalAutoApproveCheck = undefined;
        }
    }
    async _doCheckGlobalAutoApprove() {
        const store = new DisposableStore();
        try {
            // Dismiss the dialog automatically if another window stores the
            // opt-in flag, avoiding duplicate approval prompts.
            const cts = new CancellationTokenSource();
            store.add(cts);
            store.add(this._storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, "chat.tools.global.autoApprove.optIn" /* AutoApproveStorageKeys.GlobalAutoApproveOptIn */, store)(() => {
                if (this._storageService.getBoolean("chat.tools.global.autoApprove.optIn" /* AutoApproveStorageKeys.GlobalAutoApproveOptIn */, -1 /* StorageScope.APPLICATION */, false)) {
                    cts.cancel();
                }
            }));
            const promptResult = await this._dialogService.prompt({
                type: Severity.Warning,
                message: localize('autoApprove2.title', 'Enable global auto approve?'),
                buttons: [
                    {
                        label: localize('autoApprove2.button.enable', 'Enable'),
                        run: () => true
                    },
                    {
                        label: localize('autoApprove2.button.disable', 'Disable'),
                        run: () => false
                    },
                ],
                custom: {
                    icon: Codicon.warning,
                    markdownDetails: [{
                            markdown: new MarkdownString(globalAutoApproveDescription.value, { isTrusted: { enabledCommands: ['workbench.action.openSettings'] } }),
                        }],
                },
                token: cts.token,
            });
            // If cancelled by cross-window approval, treat as approved
            if (cts.token.isCancellationRequested) {
                return true;
            }
            if (promptResult.result !== true) {
                await this._configurationService.updateValue(ChatConfiguration.GlobalAutoApprove, false);
                return false;
            }
            this._storageService.store("chat.tools.global.autoApprove.optIn" /* AutoApproveStorageKeys.GlobalAutoApproveOptIn */, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            return true;
        }
        finally {
            store.dispose();
        }
    }
    cleanupCallDisposables(requestId, store) {
        if (requestId) {
            const disposables = this._callsByRequestId.get(requestId);
            if (disposables) {
                const index = disposables.findIndex(d => d.store === store);
                if (index > -1) {
                    disposables.splice(index, 1);
                }
                if (disposables.length === 0) {
                    this._callsByRequestId.delete(requestId);
                }
            }
        }
        store.dispose();
    }
    cancelToolCallsForRequest(requestId) {
        const calls = this._callsByRequestId.get(requestId);
        if (calls) {
            calls.forEach(call => call.store.dispose());
            this._callsByRequestId.delete(requestId);
        }
        // Clean up any pending tool calls that belong to this request
        for (const [toolCallId, invocation] of this._pendingToolCalls) {
            if (invocation.chatRequestId === requestId) {
                this._pendingToolCalls.delete(toolCallId);
            }
        }
    }
    static { this.githubMCPServerAliases = ['github/github-mcp-server', 'io.github.github/github-mcp-server', 'github-mcp-server']; }
    static { this.playwrightMCPServerAliases = ['microsoft/playwright-mcp', 'com.microsoft/playwright-mcp']; }
    *getToolSetAliases(toolSet, fullReferenceName) {
        if (fullReferenceName !== toolSet.referenceName) {
            yield toolSet.referenceName; // tool set name without '/*'
        }
        if (toolSet.legacyFullNames) {
            yield* toolSet.legacyFullNames;
        }
        switch (toolSet.referenceName) {
            case 'github':
                for (const alias of LanguageModelToolsService_1.githubMCPServerAliases) {
                    yield alias + '/*';
                }
                break;
            case 'playwright':
                for (const alias of LanguageModelToolsService_1.playwrightMCPServerAliases) {
                    yield alias + '/*';
                }
                break;
            case SpecedToolAliases.execute: // 'execute'
                yield 'shell'; // legacy alias
                break;
            case SpecedToolAliases.agent: // 'agent'
                yield VSCodeToolReference.runSubagent; // prefer the tool set over th old tool name
                yield 'custom-agent'; // legacy alias
                break;
        }
    }
    *getToolAliases(toolSet, fullReferenceName) {
        const referenceName = toolSet.toolReferenceName ?? toolSet.displayName;
        if (fullReferenceName !== referenceName && referenceName !== VSCodeToolReference.runSubagent) {
            yield referenceName; // simple name, without toolset name
        }
        if (toolSet.legacyToolReferenceFullNames) {
            for (const legacyName of toolSet.legacyToolReferenceFullNames) {
                yield legacyName;
                const lastSlashIndex = legacyName.lastIndexOf('/');
                if (lastSlashIndex !== -1) {
                    yield legacyName.substring(lastSlashIndex + 1); // it was also known under the simple name
                }
            }
        }
        const slashIndex = fullReferenceName.lastIndexOf('/');
        if (slashIndex !== -1) {
            switch (fullReferenceName.substring(0, slashIndex)) {
                case 'github':
                    for (const alias of LanguageModelToolsService_1.githubMCPServerAliases) {
                        yield alias + fullReferenceName.substring(slashIndex);
                    }
                    break;
                case 'playwright':
                    for (const alias of LanguageModelToolsService_1.playwrightMCPServerAliases) {
                        yield alias + fullReferenceName.substring(slashIndex);
                    }
                    break;
            }
        }
    }
    /**
     * Create a map that contains all tools and toolsets with their enablement state.
     * @param fullReferenceNames A list of tool or toolset by their full reference names that are enabled.
     * @returns A map of tool or toolset instances to their enablement state.
     */
    toToolAndToolSetEnablementMap(fullReferenceNames, model) {
        const toolOrToolSetNames = new Set(fullReferenceNames);
        const result = new Map();
        for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
            if (isToolSet(tool)) {
                const enabled = toolOrToolSetNames.has(fullReferenceName) || Iterable.some(this.getToolSetAliases(tool, fullReferenceName), name => toolOrToolSetNames.has(name));
                const scoped = model ? new ToolSetForModel(tool, model) : tool;
                result.set(scoped, enabled);
                if (enabled) {
                    for (const memberTool of scoped.getTools()) {
                        result.set(memberTool, true);
                    }
                }
            }
            else {
                if (model && !toolMatchesModel(tool, model)) {
                    continue;
                }
                if (!result.has(tool)) { // already set via an enabled toolset
                    const enabled = toolOrToolSetNames.has(fullReferenceName)
                        || Iterable.some(this.getToolAliases(tool, fullReferenceName), name => toolOrToolSetNames.has(name))
                        || !!tool.legacyToolReferenceFullNames?.some(toolFullName => {
                            // enable tool if just the legacy tool set name is present
                            const index = toolFullName.lastIndexOf('/');
                            return index !== -1 && toolOrToolSetNames.has(toolFullName.substring(0, index));
                        });
                    result.set(tool, enabled);
                }
            }
        }
        // also add all user tool sets (not part of the prompt referencable tools)
        for (const toolSet of this._toolSets) {
            if (toolSet.source.type === 'user') {
                const enabled = Iterable.every(toolSet.getTools(), t => result.get(t) === true);
                result.set(toolSet, enabled);
            }
        }
        return result;
    }
    toFullReferenceNames(map) {
        const result = [];
        const toolsCoveredByEnabledToolSet = new Set();
        for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
            if (isToolSet(tool)) {
                if (map.get(tool)) {
                    result.push(fullReferenceName);
                    for (const memberTool of tool.getTools()) {
                        toolsCoveredByEnabledToolSet.add(memberTool);
                    }
                }
            }
            else {
                if (map.get(tool) && !toolsCoveredByEnabledToolSet.has(tool)) {
                    result.push(fullReferenceName);
                }
            }
        }
        return result;
    }
    toToolReferences(variableReferences) {
        const toolsOrToolSetByName = new Map();
        for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
            toolsOrToolSetByName.set(fullReferenceName, tool);
        }
        const result = [];
        for (const ref of variableReferences) {
            const toolOrToolSet = toolsOrToolSetByName.get(ref.name);
            if (toolOrToolSet) {
                if (isToolSet(toolOrToolSet)) {
                    result.push(toToolSetVariableEntry(toolOrToolSet, ref.range));
                }
                else {
                    result.push(toToolVariableEntry(toolOrToolSet, ref.range));
                }
            }
        }
        return result;
    }
    getToolSetsForModel(model, reader) {
        if (!model) {
            return this.toolSets.read(reader);
        }
        return Iterable.map(this.toolSets.read(reader), ts => new ToolSetForModel(ts, model));
    }
    getToolSet(id) {
        for (const toolSet of this._toolSets) {
            if (toolSet.id === id) {
                return toolSet;
            }
        }
        return undefined;
    }
    getToolSetByName(name) {
        for (const toolSet of this._toolSets) {
            if (toolSet.referenceName === name) {
                return toolSet;
            }
        }
        return undefined;
    }
    getSpecedToolSetName(referenceName) {
        if (LanguageModelToolsService_1.githubMCPServerAliases.includes(referenceName)) {
            return 'github';
        }
        if (LanguageModelToolsService_1.playwrightMCPServerAliases.includes(referenceName)) {
            return 'playwright';
        }
        return referenceName;
    }
    createToolSet(source, id, referenceName, options) {
        const that = this;
        referenceName = this.getSpecedToolSetName(referenceName);
        const result = new class extends ToolSet {
            dispose() {
                if (that._toolSets.has(result)) {
                    this._tools.clear();
                    that._toolSets.delete(result);
                }
            }
        }(id, referenceName, options?.icon ?? Codicon.tools, source, options?.description, options?.legacyFullNames, this._contextKeyService);
        this._toolSets.add(result);
        return result;
    }
    *getFullReferenceNames() {
        for (const [, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
            yield fullReferenceName;
        }
    }
    getDeprecatedFullReferenceNames() {
        const result = new Map();
        const knownToolSetNames = new Set();
        const add = (name, fullReferenceName) => {
            if (name !== fullReferenceName) {
                if (!result.has(name)) {
                    result.set(name, new Set());
                }
                result.get(name).add(fullReferenceName);
            }
        };
        for (const [tool, _] of this.toolsWithFullReferenceName.get()) {
            if (isToolSet(tool)) {
                knownToolSetNames.add(tool.referenceName);
                if (tool.legacyFullNames) {
                    for (const legacyName of tool.legacyFullNames) {
                        knownToolSetNames.add(legacyName);
                    }
                }
            }
        }
        for (const [tool, fullReferenceName] of this.toolsWithFullReferenceName.get()) {
            if (isToolSet(tool)) {
                for (const alias of this.getToolSetAliases(tool, fullReferenceName)) {
                    add(alias, fullReferenceName);
                }
            }
            else {
                for (const alias of this.getToolAliases(tool, fullReferenceName)) {
                    add(alias, fullReferenceName);
                }
                if (tool.legacyToolReferenceFullNames) {
                    // If the tool is in a toolset (fullReferenceName has a '/'), also add the
                    // namespaced form of legacy names (e.g. 'vscode/oldName' → 'vscode/newName')
                    const slashIndex = fullReferenceName.lastIndexOf('/');
                    const toolSetPrefix = slashIndex !== -1 ? fullReferenceName.substring(0, slashIndex + 1) : undefined;
                    for (const legacyName of tool.legacyToolReferenceFullNames) {
                        if (toolSetPrefix && !legacyName.includes('/')) {
                            add(toolSetPrefix + legacyName, fullReferenceName);
                        }
                        // for any 'orphaned' toolsets (toolsets that no longer exist and
                        // do not have an explicit legacy mapping), we should
                        // just point them to the list of tools directly
                        if (legacyName.includes('/')) {
                            const toolSetFullName = legacyName.substring(0, legacyName.lastIndexOf('/'));
                            if (!knownToolSetNames.has(toolSetFullName)) {
                                add(toolSetFullName, fullReferenceName);
                            }
                        }
                    }
                }
            }
        }
        return result;
    }
    getToolByFullReferenceName(fullReferenceName) {
        for (const [tool, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
            if (fullReferenceName === toolFullReferenceName) {
                return tool;
            }
            const aliases = isToolSet(tool) ? this.getToolSetAliases(tool, toolFullReferenceName) : this.getToolAliases(tool, toolFullReferenceName);
            if (Iterable.some(aliases, alias => fullReferenceName === alias)) {
                return tool;
            }
        }
        return undefined;
    }
    getFullReferenceName(tool, toolSet) {
        for (const [item, toolFullReferenceName] of this.toolsWithFullReferenceName.get()) {
            if (item === tool) {
                return toolFullReferenceName;
            }
        }
        if (isToolSet(tool)) {
            return getToolSetFullReferenceName(tool);
        }
        return getToolFullReferenceName(tool, toolSet);
    }
};
LanguageModelToolsService = LanguageModelToolsService_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, IExtensionService),
    __param(2, IContextKeyService),
    __param(3, IChatService),
    __param(4, IDialogService),
    __param(5, ITelemetryService),
    __param(6, ILogService),
    __param(7, IConfigurationService),
    __param(8, IAccessibilityService),
    __param(9, IAccessibilitySignalService),
    __param(10, IStorageService),
    __param(11, ILanguageModelToolsConfirmationService),
    __param(12, ICommandService),
    __param(13, IChatWidgetService)
], LanguageModelToolsService);
export { LanguageModelToolsService };
function getToolFullReferenceName(tool, toolSet) {
    const toolName = tool.toolReferenceName ?? tool.displayName;
    if (toolSet) {
        return `${toolSet.referenceName}/${toolName}`;
    }
    else if (tool.source.type === 'extension') {
        return `${tool.source.extensionId.value.toLowerCase()}/${toolName}`;
    }
    return toolName;
}
function getToolSetFullReferenceName(toolSet) {
    if (toolSet.source.type === 'mcp') {
        return `${toolSet.referenceName}/*`;
    }
    return toolSet.referenceName;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckksT0FB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