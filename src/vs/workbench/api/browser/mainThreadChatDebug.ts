/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { ChatDebugLogLevel, IChatDebugEvent, IChatDebugService } from '../../contrib/chat/common/chatDebugService.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatDebugShape, ExtHostContext, IChatDebugEventDto, MainContext, MainThreadChatDebugShape } from '../common/extHost.protocol.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';

@extHostNamedCustomer(MainContext.MainThreadChatDebug)
export class MainThreadChatDebug extends Disposable implements MainThreadChatDebugShape {
	private readonly _proxy: Proxied<ExtHostChatDebugShape>;
	private readonly _providerDisposables = new Map<number, DisposableStore>();
	private readonly _activeSessionResources = new Map<number, URI>();
	/** Tracks core events already forwarded to the extension to avoid duplicates. */
	private readonly _forwardedCoreEvents = new WeakSet<IChatDebugEvent>();

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

				// Send existing core events for this session to the extension
				// so they are captured even when the panel is opened late.
				// Track forwarded events to avoid re-sending on subsequent calls.
				for (const event of this._chatDebugService.getEvents(sessionResource)) {
					if (this._chatDebugService.isCoreEvent(event) && !this._forwardedCoreEvents.has(event)) {
						this._forwardedCoreEvents.add(event);
						this._proxy.$handleCoreDebugEvent(handle, this._serializeEvent(event));
					}
				}

				const dtos = await this._proxy.$provideChatDebugLog(handle, sessionResource, token);
				return dtos?.map(dto => this._reviveEvent(dto, sessionResource));
			},
			resolveChatDebugLogEvent: async (eventId, token) => {
				return this._proxy.$resolveChatDebugLogEvent(handle, eventId, token);
			},
			provideChatDebugLogExport: async (sessionResource, token) => {
				const result = await this._proxy.$exportChatDebugLog(handle, sessionResource, token);
				return result?.buffer;
			},
			resolveChatDebugLogImport: async (data, token) => {
				const result = await this._proxy.$importChatDebugLog(handle, VSBuffer.wrap(data), token);
				return result ? URI.revive(result) : undefined;
			}
		}));

		// Forward core-originated events to the extension so it can include
		// them in its data pipeline (e.g., OTel export).
		disposables.add(this._chatDebugService.onDidAddEvent(event => {
			if (!this._chatDebugService.isCoreEvent(event)) {
				return;
			}
			const activeSession = this._activeSessionResources.get(handle);
			if (!activeSession || event.sessionResource.toString() !== activeSession.toString()) {
				return;
			}
			if (this._forwardedCoreEvents.has(event)) {
				return;
			}
			this._forwardedCoreEvents.add(event);
			this._proxy.$handleCoreDebugEvent(handle, this._serializeEvent(event));
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
