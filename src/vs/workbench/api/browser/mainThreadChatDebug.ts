/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugService } from '../../contrib/chat/common/chatDebugService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatDebugShape, ExtHostContext, IChatDebugEventDto, MainContext, MainThreadChatDebugShape } from '../common/extHost.protocol.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';

@extHostNamedCustomer(MainContext.MainThreadChatDebug)
export class MainThreadChatDebug extends Disposable implements MainThreadChatDebugShape {
	private readonly _proxy: Proxied<ExtHostChatDebugShape>;
	private readonly _providerDisposables = new Map<number, DisposableStore>();
	private readonly _activeSessionResources = new Map<number, URI>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatDebugService private readonly _chatDebugService: IChatDebugService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatDebug);
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
				return this._proxy.$resolveChatDebugLogEvent(handle, eventId, token);
			}
		}));
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
}
