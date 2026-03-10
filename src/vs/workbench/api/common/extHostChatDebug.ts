/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostChatDebugShape, IChatDebugEventDto, IChatDebugResolvedEventContentDto, MainContext, MainThreadChatDebugShape } from './extHost.protocol.js';
import { ChatDebugMessageContentType, ChatDebugSubagentStatus, ChatDebugToolCallResult } from './extHostTypes.js';
import { IExtHostRpcService } from './extHostRpcService.js';

export class ExtHostChatDebug extends Disposable implements ExtHostChatDebugShape {
	declare _serviceBrand: undefined;

	private readonly _proxy: MainThreadChatDebugShape;
	private _provider: vscode.ChatDebugLogProvider | undefined;
	private _nextHandle: number = 0;
	/** Progress pipelines keyed by `${handle}:${sessionResource}` so multiple sessions can stream concurrently. */
	private readonly _activeProgress = new Map<string, DisposableStore>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatDebug);
	}

	private _progressKey(handle: number, sessionResource: UriComponents): string {
		return `${handle}:${URI.revive(sessionResource).toString()}`;
	}

	private _cleanupProgress(key: string): void {
		const store = this._activeProgress.get(key);
		if (store) {
			store.dispose();
			this._activeProgress.delete(key);
		}
	}

	registerChatDebugLogProvider(provider: vscode.ChatDebugLogProvider): vscode.Disposable {
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

	async $provideChatDebugLog(handle: number, sessionResource: UriComponents, token: CancellationToken): Promise<IChatDebugEventDto[] | undefined> {
		if (!this._provider) {
			return undefined;
		}

		// Clean up any previous progress pipeline for this handle+session pair
		const key = this._progressKey(handle, sessionResource);
		this._cleanupProgress(key);

		const store = new DisposableStore();
		this._activeProgress.set(key, store);

		const emitter = store.add(new Emitter<vscode.ChatDebugEvent>());

		// Forward progress events to the main thread
		store.add(emitter.event(event => {
			const dto = this._serializeEvent(event);
			if (!dto.sessionResource) {
				(dto as { sessionResource?: UriComponents }).sessionResource = sessionResource;
			}
			this._proxy.$acceptChatDebugEvent(handle, dto);
		}));

		// Clean up when the token is cancelled
		store.add(token.onCancellationRequested(() => {
			this._cleanupProgress(key);
		}));

		try {
			const progress: vscode.Progress<vscode.ChatDebugEvent> = {
				report: (value) => emitter.fire(value)
			};

			const sessionUri = URI.revive(sessionResource);
			const result = await this._provider.provideChatDebugLog(sessionUri, progress, token);
			if (!result) {
				return undefined;
			}

			return result.map(event => this._serializeEvent(event));
		} catch (err) {
			this._cleanupProgress(key);
			throw err;
		}
		// Note: do NOT dispose progress pipeline here - keep it alive for
		// streaming events via progress.report() after the initial return.
		// It will be cleaned up when a new session is requested, the token
		// is cancelled, or the provider is unregistered.
	}

	private _serializeEvent(event: vscode.ChatDebugEvent): IChatDebugEventDto {
		const base = {
			id: event.id,
			sessionResource: (event as { sessionResource?: vscode.Uri }).sessionResource,
			created: event.created.getTime(),
			parentEventId: event.parentEventId,
		};

		// Use the _kind discriminant set by all event class constructors.
		// This works both for direct instances and when extensions bundle
		// their own copy of the API types (where instanceof would fail).
		const kind = (event as { _kind?: string })._kind;
		switch (kind) {
			case 'toolCall': {
				const e = event as vscode.ChatDebugToolCallEvent;
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
				const e = event as vscode.ChatDebugModelTurnEvent;
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
				const e = event as vscode.ChatDebugGenericEvent;
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
				const e = event as vscode.ChatDebugSubagentInvocationEvent;
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
				const e = event as vscode.ChatDebugUserMessageEvent;
				return {
					...base,
					kind: 'userMessage',
					message: e.message,
					sections: e.sections.map(s => ({ name: s.name, content: s.content })),
				};
			}
			case 'agentResponse': {
				const e = event as vscode.ChatDebugAgentResponseEvent;
				return {
					...base,
					kind: 'agentResponse',
					message: e.message,
					sections: e.sections.map(s => ({ name: s.name, content: s.content })),
				};
			}
			default: {
				const generic = event as vscode.ChatDebugGenericEvent;
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

	async $resolveChatDebugLogEvent(_handle: number, eventId: string, token: CancellationToken): Promise<IChatDebugResolvedEventContentDto | undefined> {
		if (!this._provider?.resolveChatDebugLogEvent) {
			return undefined;
		}
		const result = await this._provider.resolveChatDebugLogEvent(eventId, token);
		if (!result) {
			return undefined;
		}

		// Use the _kind discriminant set by all content class constructors.
		const kind = (result as { _kind?: string })._kind;
		switch (kind) {
			case 'text':
				return { kind: 'text', value: (result as vscode.ChatDebugEventTextContent).value };
			case 'messageContent': {
				const msg = result as vscode.ChatDebugEventMessageContent;
				return {
					kind: 'message',
					type: msg.type === ChatDebugMessageContentType.User ? 'user' : 'agent',
					message: msg.message,
					sections: msg.sections.map(s => ({ name: s.name, content: s.content })),
				};
			}
			case 'userMessage': {
				const msg = result as vscode.ChatDebugUserMessageEvent;
				return {
					kind: 'message',
					type: 'user',
					message: msg.message,
					sections: msg.sections.map(s => ({ name: s.name, content: s.content })),
				};
			}
			case 'agentResponse': {
				const msg = result as vscode.ChatDebugAgentResponseEvent;
				return {
					kind: 'message',
					type: 'agent',
					message: msg.message,
					sections: msg.sections.map(s => ({ name: s.name, content: s.content })),
				};
			}
			case 'toolCallContent': {
				const tc = result as vscode.ChatDebugEventToolCallContent;
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
				const mt = result as vscode.ChatDebugEventModelTurnContent;
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
			default:
				return undefined;
		}
	}

	override dispose(): void {
		for (const store of this._activeProgress.values()) {
			store.dispose();
		}
		this._activeProgress.clear();
		super.dispose();
	}
}
