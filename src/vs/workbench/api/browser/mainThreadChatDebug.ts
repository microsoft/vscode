/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { ChatDebugHookResult, ChatDebugLogLevel, IChatDebugEvent, IChatDebugResolvedEventContent, IChatDebugService } from '../../contrib/chat/common/chatDebugService.js';
import { IChatService } from '../../contrib/chat/common/chatService/chatService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatDebugShape, ExtHostContext, IChatDebugEventDto, IChatDebugResolvedEventContentDto, MainContext, MainThreadChatDebugShape } from '../common/extHost.protocol.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';

@extHostNamedCustomer(MainContext.MainThreadChatDebug)
export class MainThreadChatDebug extends Disposable implements MainThreadChatDebugShape {
	private readonly _proxy: Proxied<ExtHostChatDebugShape>;
	private readonly _providerDisposables = new Map<number, DisposableStore>();
	private readonly _activeSessionResources = new Map<number, URI>();
	private readonly _coreEventForwarder = this._register(new MutableDisposable());

	constructor(
		extHostContext: IExtHostContext,
		@IChatDebugService private readonly _chatDebugService: IChatDebugService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatDebug);
	}

	$subscribeToCoreDebugEvents(): void {
		this._coreEventForwarder.value = this._chatDebugService.onDidAddEvent(event => {
			if (this._chatDebugService.isCoreEvent(event)) {
				this._proxy.$onCoreDebugEvent(this._serializeEvent(event));
			}
		});
	}

	$unsubscribeFromCoreDebugEvents(): void {
		this._coreEventForwarder.clear();
	}

	$registerChatDebugLogProvider(handle: number): void {
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

		// Register a lazy fetcher so historical sessions are loaded from the
		// extension only when the debug panel home page first needs them.
		this._chatDebugService.registerAvailableSessionsFetcher(async (token) => {
			const entries = await this._proxy.$getAvailableDebugSessionResources(handle, token);
			return entries.map(e => ({ uri: URI.revive(e.uri), title: e.title }));
		});
	}

	$unregisterChatDebugLogProvider(handle: number): void {
		const disposables = this._providerDisposables.get(handle);
		disposables?.dispose();
		this._providerDisposables.delete(handle);
		this._activeSessionResources.delete(handle);
	}

	$acceptChatDebugEvent(handle: number, dto: IChatDebugEventDto): void {
		const sessionResource = (dto.sessionResource ? URI.revive(dto.sessionResource) : undefined)
			?? this._activeSessionResources.get(handle)
			?? this._chatDebugService.activeSessionResource;
		if (!sessionResource) {
			return;
		}
		const revived = this._reviveEvent(dto, sessionResource);
		this._chatDebugService.addProviderEvent(revived);
	}

	private _serializeEvent(event: IChatDebugEvent): IChatDebugEventDto {
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
				return { ...base, kind: 'modelTurn', model: event.model, requestName: event.requestName, inputTokens: event.inputTokens, outputTokens: event.outputTokens, cachedTokens: event.cachedTokens, totalTokens: event.totalTokens, durationInMillis: event.durationInMillis };
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

	private _reviveEvent(dto: IChatDebugEventDto, sessionResource: URI): IChatDebugEvent {
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
					cachedTokens: dto.cachedTokens,
					totalTokens: dto.totalTokens,
					durationInMillis: dto.durationInMillis,
				};
			case 'generic':
				return {
					...base,
					kind: 'generic',
					name: dto.name,
					details: dto.details,
					level: dto.level as ChatDebugLogLevel,
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

	private _reviveResolvedContent(dto: IChatDebugResolvedEventContentDto): IChatDebugResolvedEventContent {
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
					timeToFirstTokenInMillis: dto.timeToFirstTokenInMillis,
					requestId: dto.requestId,
					maxInputTokens: dto.maxInputTokens,
					maxOutputTokens: dto.maxOutputTokens,
					inputTokens: dto.inputTokens,
					outputTokens: dto.outputTokens,
					cachedTokens: dto.cachedTokens,
					totalTokens: dto.totalTokens,
					requestOptions: dto.requestOptions,
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
}
