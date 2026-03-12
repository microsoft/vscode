/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostChatDebugShape, IChatDebugEventDto, IChatDebugResolvedEventContentDto, MainContext, MainThreadChatDebugShape } from './extHost.protocol.js';
import { ChatDebugGenericEvent, ChatDebugLogLevel, ChatDebugMessageContentType, ChatDebugMessageSection, ChatDebugModelTurnEvent, ChatDebugSubagentInvocationEvent, ChatDebugSubagentStatus, ChatDebugToolCallEvent, ChatDebugToolCallResult, ChatDebugUserMessageEvent, ChatDebugAgentResponseEvent } from './extHostTypes.js';
import { IExtHostRpcService } from './extHostRpcService.js';

export class ExtHostChatDebug extends Disposable implements ExtHostChatDebugShape {
	declare _serviceBrand: undefined;

	private readonly _proxy: MainThreadChatDebugShape;
	private _provider: vscode.ChatDebugLogProvider | undefined;
	private _nextHandle: number = 0;
	/** Progress pipelines keyed by `${handle}:${sessionResource}` so multiple sessions can stream concurrently. */
	private readonly _activeProgress = new Map<string, DisposableStore>();

	private readonly _onDidAddCoreEvent = this._register(new Emitter<vscode.ChatDebugEvent>({
		onWillAddFirstListener: () => this._proxy.$subscribeToCoreDebugEvents(),
		onDidRemoveLastListener: () => this._proxy.$unsubscribeFromCoreDebugEvents(),
	}));
	readonly onDidAddCoreEvent = this._onDidAddCoreEvent.event;

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

	private _deserializeEvent(dto: IChatDebugEventDto): vscode.ChatDebugEvent | undefined {
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
				const evt = new ChatDebugGenericEvent(dto.name, dto.level as ChatDebugLogLevel, created);
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

	$onCoreDebugEvent(dto: IChatDebugEventDto): void {
		const event = this._deserializeEvent(dto);
		if (event) {
			this._onDidAddCoreEvent.fire(event);
		}
	}

	async $exportChatDebugLog(_handle: number, sessionResource: UriComponents, coreEventDtos: IChatDebugEventDto[], sessionTitle: string | undefined, token: CancellationToken): Promise<VSBuffer | undefined> {
		if (!this._provider?.provideChatDebugLogExport) {
			return undefined;
		}
		const sessionUri = URI.revive(sessionResource);
		const coreEvents = coreEventDtos.map(dto => this._deserializeEvent(dto)).filter((e): e is vscode.ChatDebugEvent => e !== undefined);
		const options: vscode.ChatDebugLogExportOptions = { coreEvents, sessionTitle };
		const result = await this._provider.provideChatDebugLogExport(sessionUri, options, token);
		if (!result) {
			return undefined;
		}
		return VSBuffer.wrap(result);
	}

	async $importChatDebugLog(_handle: number, data: VSBuffer, token: CancellationToken): Promise<{ uri: UriComponents; sessionTitle?: string } | undefined> {
		if (!this._provider?.resolveChatDebugLogImport) {
			return undefined;
		}
		const result = await this._provider.resolveChatDebugLogImport(data.buffer, token);
		if (!result) {
			return undefined;
		}
		return { uri: result.uri, sessionTitle: result.sessionTitle };
	}

	override dispose(): void {
		for (const store of this._activeProgress.values()) {
			store.dispose();
		}
		this._activeProgress.clear();
		super.dispose();
	}
}
