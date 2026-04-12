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
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { ChatDebugGenericEvent, ChatDebugHookResult, ChatDebugMessageContentType, ChatDebugMessageSection, ChatDebugModelTurnEvent, ChatDebugSubagentInvocationEvent, ChatDebugSubagentStatus, ChatDebugToolCallEvent, ChatDebugToolCallResult, ChatDebugUserMessageEvent, ChatDebugAgentResponseEvent } from './extHostTypes.js';
import { IExtHostRpcService } from './extHostRpcService.js';
let ExtHostChatDebug = class ExtHostChatDebug extends Disposable {
    constructor(extHostRpc) {
        super();
        this._nextHandle = 0;
        /** Progress pipelines keyed by `${handle}:${sessionResource}` so multiple sessions can stream concurrently. */
        this._activeProgress = new Map();
        this._onDidAddCoreEvent = this._register(new Emitter({
            onWillAddFirstListener: () => this._proxy.$subscribeToCoreDebugEvents(),
            onDidRemoveLastListener: () => this._proxy.$unsubscribeFromCoreDebugEvents(),
        }));
        this.onDidAddCoreEvent = this._onDidAddCoreEvent.event;
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatDebug);
    }
    _progressKey(handle, sessionResource) {
        return `${handle}:${URI.revive(sessionResource).toString()}`;
    }
    _cleanupProgress(key) {
        const store = this._activeProgress.get(key);
        if (store) {
            store.dispose();
            this._activeProgress.delete(key);
        }
    }
    registerChatDebugLogProvider(provider) {
        if (this._provider) {
            throw new Error('A ChatDebugLogProvider is already registered.');
        }
        this._provider = provider;
        const handle = this._nextHandle++;
        this._proxy.$registerChatDebugLogProvider(handle);
        return toDisposable(() => {
            this._provider = undefined;
            // Clean up all progress pipelines for this handle
            for (const [key, store] of this._activeProgress) {
                if (key.startsWith(`${handle}:`)) {
                    store.dispose();
                    this._activeProgress.delete(key);
                }
            }
            this._proxy.$unregisterChatDebugLogProvider(handle);
        });
    }
    async $provideChatDebugLog(handle, sessionResource, token) {
        if (!this._provider) {
            return undefined;
        }
        // Clean up any previous progress pipeline for this handle+session pair
        const key = this._progressKey(handle, sessionResource);
        this._cleanupProgress(key);
        const store = new DisposableStore();
        this._activeProgress.set(key, store);
        const emitter = store.add(new Emitter());
        // Forward progress events to the main thread
        store.add(emitter.event(event => {
            const dto = this._serializeEvent(event);
            if (!dto.sessionResource) {
                dto.sessionResource = sessionResource;
            }
            this._proxy.$acceptChatDebugEvent(handle, dto);
        }));
        // Clean up when the token is cancelled
        store.add(token.onCancellationRequested(() => {
            this._cleanupProgress(key);
        }));
        try {
            const progress = {
                report: (value) => emitter.fire(value)
            };
            const sessionUri = URI.revive(sessionResource);
            const result = await this._provider.provideChatDebugLog(sessionUri, progress, token);
            if (!result) {
                return undefined;
            }
            return result.map(event => this._serializeEvent(event));
        }
        catch (err) {
            this._cleanupProgress(key);
            throw err;
        }
        // Note: do NOT dispose progress pipeline here - keep it alive for
        // streaming events via progress.report() after the initial return.
        // It will be cleaned up when a new session is requested, the token
        // is cancelled, or the provider is unregistered.
    }
    _serializeEvent(event) {
        const base = {
            id: event.id,
            sessionResource: event.sessionResource,
            created: event.created.getTime(),
            parentEventId: event.parentEventId,
        };
        // Use the _kind discriminant set by all event class constructors.
        // This works both for direct instances and when extensions bundle
        // their own copy of the API types (where instanceof would fail).
        const kind = event._kind;
        switch (kind) {
            case 'toolCall': {
                const e = event;
                return {
                    ...base,
                    kind: 'toolCall',
                    toolName: e.toolName,
                    toolCallId: e.toolCallId,
                    input: e.input,
                    output: e.output,
                    result: e.result === ChatDebugToolCallResult.Success ? 'success'
                        : e.result === ChatDebugToolCallResult.Error ? 'error'
                            : undefined,
                    durationInMillis: e.durationInMillis,
                };
            }
            case 'modelTurn': {
                const e = event;
                return {
                    ...base,
                    kind: 'modelTurn',
                    model: e.model,
                    requestName: e.requestName,
                    inputTokens: e.inputTokens,
                    outputTokens: e.outputTokens,
                    totalTokens: e.totalTokens,
                    durationInMillis: e.durationInMillis,
                };
            }
            case 'generic': {
                const e = event;
                return {
                    ...base,
                    kind: 'generic',
                    name: e.name,
                    details: e.details,
                    level: e.level,
                    category: e.category,
                };
            }
            case 'subagentInvocation': {
                const e = event;
                return {
                    ...base,
                    kind: 'subagentInvocation',
                    agentName: e.agentName,
                    description: e.description,
                    status: e.status === ChatDebugSubagentStatus.Running ? 'running'
                        : e.status === ChatDebugSubagentStatus.Completed ? 'completed'
                            : e.status === ChatDebugSubagentStatus.Failed ? 'failed'
                                : undefined,
                    durationInMillis: e.durationInMillis,
                    toolCallCount: e.toolCallCount,
                    modelTurnCount: e.modelTurnCount,
                };
            }
            case 'userMessage': {
                const e = event;
                return {
                    ...base,
                    kind: 'userMessage',
                    message: e.message,
                    sections: e.sections.map(s => ({ name: s.name, content: s.content })),
                };
            }
            case 'agentResponse': {
                const e = event;
                return {
                    ...base,
                    kind: 'agentResponse',
                    message: e.message,
                    sections: e.sections.map(s => ({ name: s.name, content: s.content })),
                };
            }
            default: {
                const generic = event;
                const rawName = generic.name;
                const rawDetails = generic.details;
                return {
                    ...base,
                    kind: 'generic',
                    name: typeof rawName === 'string' ? rawName : '',
                    details: typeof rawDetails === 'string' ? rawDetails : undefined,
                    level: generic.level ?? 1,
                    category: generic.category,
                };
            }
        }
    }
    async $resolveChatDebugLogEvent(_handle, eventId, token) {
        if (!this._provider?.resolveChatDebugLogEvent) {
            return undefined;
        }
        const result = await this._provider.resolveChatDebugLogEvent(eventId, token);
        if (!result) {
            return undefined;
        }
        // Use the _kind discriminant set by all content class constructors.
        const kind = result._kind;
        switch (kind) {
            case 'text':
                return { kind: 'text', value: result.value };
            case 'messageContent': {
                const msg = result;
                return {
                    kind: 'message',
                    type: msg.type === ChatDebugMessageContentType.User ? 'user' : 'agent',
                    message: msg.message,
                    sections: msg.sections.map(s => ({ name: s.name, content: s.content })),
                };
            }
            case 'userMessage': {
                const msg = result;
                return {
                    kind: 'message',
                    type: 'user',
                    message: msg.message,
                    sections: msg.sections.map(s => ({ name: s.name, content: s.content })),
                };
            }
            case 'agentResponse': {
                const msg = result;
                return {
                    kind: 'message',
                    type: 'agent',
                    message: msg.message,
                    sections: msg.sections.map(s => ({ name: s.name, content: s.content })),
                };
            }
            case 'toolCallContent': {
                const tc = result;
                return {
                    kind: 'toolCall',
                    toolName: tc.toolName,
                    result: tc.result === ChatDebugToolCallResult.Success ? 'success'
                        : tc.result === ChatDebugToolCallResult.Error ? 'error'
                            : undefined,
                    durationInMillis: tc.durationInMillis,
                    input: tc.input,
                    output: tc.output,
                };
            }
            case 'modelTurnContent': {
                const mt = result;
                return {
                    kind: 'modelTurn',
                    requestName: mt.requestName,
                    model: mt.model,
                    status: mt.status,
                    durationInMillis: mt.durationInMillis,
                    timeToFirstTokenInMillis: mt.timeToFirstTokenInMillis,
                    maxInputTokens: mt.maxInputTokens,
                    maxOutputTokens: mt.maxOutputTokens,
                    inputTokens: mt.inputTokens,
                    outputTokens: mt.outputTokens,
                    cachedTokens: mt.cachedTokens,
                    totalTokens: mt.totalTokens,
                    errorMessage: mt.errorMessage,
                    sections: mt.sections?.map(s => ({ name: s.name, content: s.content })),
                };
            }
            case 'hookContent': {
                const hk = result;
                return {
                    kind: 'hook',
                    hookType: hk.hookType,
                    command: hk.command,
                    result: hk.result === ChatDebugHookResult.Success ? 'success'
                        : hk.result === ChatDebugHookResult.Error ? 'error'
                            : hk.result === ChatDebugHookResult.NonBlockingError ? 'nonBlockingError'
                                : undefined,
                    durationInMillis: hk.durationInMillis,
                    input: hk.input,
                    output: hk.output,
                    exitCode: hk.exitCode,
                    errorMessage: hk.errorMessage,
                };
            }
            default:
                return undefined;
        }
    }
    _deserializeEvent(dto) {
        const created = new Date(dto.created);
        const sessionResource = dto.sessionResource ? URI.revive(dto.sessionResource) : undefined;
        switch (dto.kind) {
            case 'toolCall': {
                const evt = new ChatDebugToolCallEvent(dto.toolName, created);
                evt.id = dto.id;
                evt.sessionResource = sessionResource;
                evt.parentEventId = dto.parentEventId;
                evt.toolCallId = dto.toolCallId;
                evt.input = dto.input;
                evt.output = dto.output;
                evt.result = dto.result === 'success' ? ChatDebugToolCallResult.Success
                    : dto.result === 'error' ? ChatDebugToolCallResult.Error
                        : undefined;
                evt.durationInMillis = dto.durationInMillis;
                return evt;
            }
            case 'modelTurn': {
                const evt = new ChatDebugModelTurnEvent(created);
                evt.id = dto.id;
                evt.sessionResource = sessionResource;
                evt.parentEventId = dto.parentEventId;
                evt.model = dto.model;
                evt.inputTokens = dto.inputTokens;
                evt.outputTokens = dto.outputTokens;
                evt.totalTokens = dto.totalTokens;
                evt.durationInMillis = dto.durationInMillis;
                return evt;
            }
            case 'generic': {
                const evt = new ChatDebugGenericEvent(dto.name, dto.level, created);
                evt.id = dto.id;
                evt.sessionResource = sessionResource;
                evt.parentEventId = dto.parentEventId;
                evt.details = dto.details;
                evt.category = dto.category;
                return evt;
            }
            case 'subagentInvocation': {
                const evt = new ChatDebugSubagentInvocationEvent(dto.agentName, created);
                evt.id = dto.id;
                evt.sessionResource = sessionResource;
                evt.parentEventId = dto.parentEventId;
                evt.description = dto.description;
                evt.status = dto.status === 'running' ? ChatDebugSubagentStatus.Running
                    : dto.status === 'completed' ? ChatDebugSubagentStatus.Completed
                        : dto.status === 'failed' ? ChatDebugSubagentStatus.Failed
                            : undefined;
                evt.durationInMillis = dto.durationInMillis;
                evt.toolCallCount = dto.toolCallCount;
                evt.modelTurnCount = dto.modelTurnCount;
                return evt;
            }
            case 'userMessage': {
                const evt = new ChatDebugUserMessageEvent(dto.message, created);
                evt.id = dto.id;
                evt.sessionResource = sessionResource;
                evt.parentEventId = dto.parentEventId;
                evt.sections = dto.sections.map(s => new ChatDebugMessageSection(s.name, s.content));
                return evt;
            }
            case 'agentResponse': {
                const evt = new ChatDebugAgentResponseEvent(dto.message, created);
                evt.id = dto.id;
                evt.sessionResource = sessionResource;
                evt.parentEventId = dto.parentEventId;
                evt.sections = dto.sections.map(s => new ChatDebugMessageSection(s.name, s.content));
                return evt;
            }
            default:
                return undefined;
        }
    }
    $onCoreDebugEvent(dto) {
        const event = this._deserializeEvent(dto);
        if (event) {
            this._onDidAddCoreEvent.fire(event);
        }
    }
    async $exportChatDebugLog(_handle, sessionResource, coreEventDtos, sessionTitle, token) {
        if (!this._provider?.provideChatDebugLogExport) {
            return undefined;
        }
        const sessionUri = URI.revive(sessionResource);
        const coreEvents = coreEventDtos.map(dto => this._deserializeEvent(dto)).filter((e) => e !== undefined);
        const options = { coreEvents, sessionTitle };
        const result = await this._provider.provideChatDebugLogExport(sessionUri, options, token);
        if (!result) {
            return undefined;
        }
        return VSBuffer.wrap(result);
    }
    async $importChatDebugLog(_handle, data, token) {
        if (!this._provider?.resolveChatDebugLogImport) {
            return undefined;
        }
        const result = await this._provider.resolveChatDebugLogImport(data.buffer, token);
        if (!result) {
            return undefined;
        }
        return { uri: result.uri, sessionTitle: result.sessionTitle };
    }
    dispose() {
        for (const store of this._activeProgress.values()) {
            store.dispose();
        }
        this._activeProgress.clear();
        super.dispose();
    }
};
ExtHostChatDebug = __decorate([
    __param(0, IExtHostRpcService)
], ExtHostChatDebug);
export { ExtHostChatDebug };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENoYXREZWJ1Zy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDaGF0RGVidWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RixPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBZ0YsV0FBVyxFQUE0QixNQUFNLHVCQUF1QixDQUFDO0FBQzVKLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxtQkFBbUIsRUFBcUIsMkJBQTJCLEVBQUUsdUJBQXVCLEVBQUUsdUJBQXVCLEVBQUUsZ0NBQWdDLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLEVBQUUsdUJBQXVCLEVBQUUseUJBQXlCLEVBQUUsMkJBQTJCLEVBQTZCLE1BQU0sbUJBQW1CLENBQUM7QUFDaFgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFckQsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBaUIsU0FBUSxVQUFVO0lBZS9DLFlBQ3FCLFVBQThCO1FBRWxELEtBQUssRUFBRSxDQUFDO1FBYkQsZ0JBQVcsR0FBVyxDQUFDLENBQUM7UUFDaEMsK0dBQStHO1FBQzlGLG9CQUFlLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFFckQsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBd0I7WUFDdkYsc0JBQXNCLEVBQUUsR0FBRyxFQUFFLENBQUMs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