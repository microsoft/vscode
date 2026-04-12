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
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { ChatDebugHookResult, IChatDebugService } from '../../contrib/chat/common/chatDebugService.js';
import { IChatService } from '../../contrib/chat/common/chatService/chatService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
let MainThreadChatDebug = class MainThreadChatDebug extends Disposable {
    constructor(extHostContext, _chatDebugService, _chatService) {
        super();
        this._chatDebugService = _chatDebugService;
        this._chatService = _chatService;
        this._providerDisposables = new Map();
        this._activeSessionResources = new Map();
        this._coreEventForwarder = this._register(new MutableDisposable());
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatDebug);
    }
    $subscribeToCoreDebugEvents() {
        this._coreEventForwarder.value = this._chatDebugService.onDidAddEvent(event => {
            if (this._chatDebugService.isCoreEvent(event)) {
                this._proxy.$onCoreDebugEvent(this._serializeEvent(event));
            }
        });
    }
    $unsubscribeFromCoreDebugEvents() {
        this._coreEventForwarder.clear();
    }
    $registerChatDebugLogProvider(handle) {
        const disposables = new DisposableStore();
        this._providerDisposables.set(handle, disposables);
        disposables.add(this._chatDebugService.registerProvider({
            provideChatDebugLog: async (sessionResource, token) => {
                this._activeSessionResources.set(handle, sessionResource);
                const dtos = await this._proxy.$provideChatDebugLog(handle, sessionResource, token);
                return dtos?.map(dto => this._reviveEvent(dto, sessionResource));
            },
            resolveChatDebugLogEvent: async (eventId, token) => {
                const dto = await this._proxy.$resolveChatDebugLogEvent(handle, eventId, token);
                return dto ? this._reviveResolvedContent(dto) : undefined;
            },
            provideChatDebugLogExport: async (sessionResource, token) => {
                // Gather core events and session title to pass to the extension.
                const coreEventDtos = this._chatDebugService.getEvents(sessionResource)
                    .filter(e => this._chatDebugService.isCoreEvent(e))
                    .map(e => this._serializeEvent(e));
                const sessionTitle = this._chatService.getSessionTitle(sessionResource);
                const result = await this._proxy.$exportChatDebugLog(handle, sessionResource, coreEventDtos, sessionTitle, token);
                return result?.buffer;
            },
            resolveChatDebugLogImport: async (data, token) => {
                const result = await this._proxy.$importChatDebugLog(handle, VSBuffer.wrap(data), token);
                if (!result) {
                    return undefined;
                }
                const uri = URI.revive(result.uri);
                if (result.sessionTitle) {
                    this._chatDebugService.setImportedSessionTitle(uri, result.sessionTitle);
                }
                return uri;
            }
        }));
    }
    $unregisterChatDebugLogProvider(handle) {
        const disposables = this._providerDisposables.get(handle);
        disposables?.dispose();
        this._providerDisposables.delete(handle);
        this._activeSessionResources.delete(handle);
    }
    $acceptChatDebugEvent(handle, dto) {
        const sessionResource = (dto.sessionResource ? URI.revive(dto.sessionResource) : undefined)
            ?? this._activeSessionResources.get(handle)
            ?? this._chatDebugService.activeSessionResource;
        if (!sessionResource) {
            return;
        }
        const revived = this._reviveEvent(dto, sessionResource);
        this._chatDebugService.addProviderEvent(revived);
    }
    _serializeEvent(event) {
        const base = {
            id: event.id,
            sessionResource: event.sessionResource,
            created: event.created.getTime(),
            parentEventId: event.parentEventId,
        };
        switch (event.kind) {
            case 'toolCall':
                return { ...base, kind: 'toolCall', toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output, result: event.result, durationInMillis: event.durationInMillis };
            case 'modelTurn':
                return { ...base, kind: 'modelTurn', model: event.model, requestName: event.requestName, inputTokens: event.inputTokens, outputTokens: event.outputTokens, totalTokens: event.totalTokens, durationInMillis: event.durationInMillis };
            case 'generic':
                return { ...base, kind: 'generic', name: event.name, details: event.details, level: event.level, category: event.category };
            case 'subagentInvocation':
                return { ...base, kind: 'subagentInvocation', agentName: event.agentName, description: event.description, status: event.status, durationInMillis: event.durationInMillis, toolCallCount: event.toolCallCount, modelTurnCount: event.modelTurnCount };
            case 'userMessage':
                return { ...base, kind: 'userMessage', message: event.message, sections: event.sections.map(s => ({ name: s.name, content: s.content })) };
            case 'agentResponse':
                return { ...base, kind: 'agentResponse', message: event.message, sections: event.sections.map(s => ({ name: s.name, content: s.content })) };
        }
    }
    _reviveEvent(dto, sessionResource) {
        const base = {
            id: dto.id,
            sessionResource,
            created: new Date(dto.created),
            parentEventId: dto.parentEventId,
        };
        switch (dto.kind) {
            case 'toolCall':
                return {
                    ...base,
                    kind: 'toolCall',
                    toolName: dto.toolName,
                    toolCallId: dto.toolCallId,
                    input: dto.input,
                    output: dto.output,
                    result: dto.result,
                    durationInMillis: dto.durationInMillis,
                };
            case 'modelTurn':
                return {
                    ...base,
                    kind: 'modelTurn',
                    model: dto.model,
                    requestName: dto.requestName,
                    inputTokens: dto.inputTokens,
                    outputTokens: dto.outputTokens,
                    totalTokens: dto.totalTokens,
                    durationInMillis: dto.durationInMillis,
                };
            case 'generic':
                return {
                    ...base,
                    kind: 'generic',
                    name: dto.name,
                    details: dto.details,
                    level: dto.level,
                    category: dto.category,
                };
            case 'subagentInvocation':
                return {
                    ...base,
                    kind: 'subagentInvocation',
                    agentName: dto.agentName,
                    description: dto.description,
                    status: dto.status,
                    durationInMillis: dto.durationInMillis,
                    toolCallCount: dto.toolCallCount,
                    modelTurnCount: dto.modelTurnCount,
                };
            case 'userMessage':
                return {
                    ...base,
                    kind: 'userMessage',
                    message: dto.message,
                    sections: dto.sections,
                };
            case 'agentResponse':
                return {
                    ...base,
                    kind: 'agentResponse',
                    message: dto.message,
                    sections: dto.sections,
                };
        }
    }
    _reviveResolvedContent(dto) {
        switch (dto.kind) {
            case 'text':
                return { kind: 'text', value: dto.value };
            case 'message':
                return {
                    kind: 'message',
                    type: dto.type,
                    message: dto.message,
                    sections: dto.sections,
                };
            case 'toolCall':
                return {
                    kind: 'toolCall',
                    toolName: dto.toolName,
                    result: dto.result,
                    durationInMillis: dto.durationInMillis,
                    input: dto.input,
                    output: dto.output,
                };
            case 'modelTurn':
                return {
                    kind: 'modelTurn',
                    requestName: dto.requestName,
                    model: dto.model,
                    status: dto.status,
                    durationInMillis: dto.durationInMillis,
                    inputTokens: dto.inputTokens,
                    outputTokens: dto.outputTokens,
                    cachedTokens: dto.cachedTokens,
                    totalTokens: dto.totalTokens,
                    errorMessage: dto.errorMessage,
                    sections: dto.sections,
                };
            case 'hook':
                return {
                    kind: 'hook',
                    hookType: dto.hookType,
                    command: dto.command,
                    result: dto.result === 'success' ? ChatDebugHookResult.Success
                        : dto.result === 'error' ? ChatDebugHookResult.Error
                            : dto.result === 'nonBlockingError' ? ChatDebugHookResult.NonBlockingError
                                : undefined,
                    durationInMillis: dto.durationInMillis,
                    input: dto.input,
                    output: dto.output,
                    exitCode: dto.exitCode,
                    errorMessage: dto.errorMessage,
                };
        }
    }
};
MainThreadChatDebug = __decorate([
    extHostNamedCustomer(MainContext.MainThreadChatDebug),
    __param(1, IChatDebugService),
    __param(2, IChatService)
], MainThreadChatDebug);
export { MainThreadChatDebug };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENoYXREZWJ1Zy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdERlYnVnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsbUJBQW1CLEVBQXNFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDM0ssT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQXlCLGNBQWMsRUFBeUQsV0FBVyxFQUE0QixNQUFNLCtCQUErQixDQUFDO0FBSTdLLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQU1sRCxZQUNDLGNBQStCLEVBQ1osaUJBQXFELEVBQzFELFlBQTJDO1FBRXpELEtBQUssRUFBRSxDQUFDO1FBSDRCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFDekMsaUJBQVksR0FBWixZQUFZLENBQWM7UUFQekMseUJBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFDMUQsNEJBQXVCLEdBQUcsSUFBSSxHQUFHLEVBQWUsQ0FBQztRQUNqRCx3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBUTlFLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FB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