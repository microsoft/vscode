/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { toDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { localize } from 'vs/nls';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostChatShape, IChatRequestDto, IChatResponseDto, IChatDto, IMainContext, MainContext, MainThreadChatShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { IChatFollowup, IChatReplyFollowup, IChatUserActionEvent, ISlashCommand } from 'vs/workbench/contrib/chat/common/chatService';
import type * as vscode from 'vscode';

class ChatProviderWrapper<T> {

	private static _pool = 0;

	readonly handle: number = ChatProviderWrapper._pool++;

	constructor(
		readonly extension: Readonly<IRelaxedExtensionDescription>,
		readonly provider: T,
	) { }
}

export class ExtHostChat implements ExtHostChatShape {
	private static _nextId = 0;

	private readonly _chatProvider = new Map<number, ChatProviderWrapper<vscode.InteractiveSessionProvider>>();
	private readonly _slashCommandProvider = new Map<number, ChatProviderWrapper<vscode.InteractiveSlashCommandProvider>>();
	private readonly _chatSessions = new Map<number, vscode.InteractiveSession>();
	// private readonly _providerResponsesByRequestId = new Map<number, { response: vscode.ProviderResult<vscode.InteractiveResponse | vscode.InteractiveResponseForProgress>; sessionId: number }>();

	private readonly _onDidPerformUserAction = new Emitter<vscode.InteractiveSessionUserActionEvent>();
	public readonly onDidPerformUserAction = this._onDidPerformUserAction.event;

	private readonly _proxy: MainThreadChatShape;

	constructor(
		mainContext: IMainContext,
		private readonly logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadChat);
	}

	//#region interactive session

	registerChatProvider(extension: Readonly<IRelaxedExtensionDescription>, id: string, provider: vscode.InteractiveSessionProvider): vscode.Disposable {
		const wrapper = new ChatProviderWrapper(extension, provider);
		this._chatProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerChatProvider(wrapper.handle, id);
		return toDisposable(() => {
			this._proxy.$unregisterChatProvider(wrapper.handle);
			this._chatProvider.delete(wrapper.handle);
		});
	}

	transferChatSession(session: vscode.InteractiveSession, newWorkspace: vscode.Uri): void {
		const sessionId = Iterable.find(this._chatSessions.keys(), key => this._chatSessions.get(key) === session) ?? 0;
		if (typeof sessionId !== 'number') {
			return;
		}

		this._proxy.$transferChatSession(sessionId, newWorkspace);
	}

	addChatRequest(context: vscode.InteractiveSessionRequestArgs): void {
		this._proxy.$addRequest(context);
	}

	sendInteractiveRequestToProvider(providerId: string, message: vscode.InteractiveSessionDynamicRequest): void {
		this._proxy.$sendRequestToProvider(providerId, message);
	}

	async $prepareChat(handle: number, initialState: any, token: CancellationToken): Promise<IChatDto | undefined> {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const session = await entry.provider.prepareSession(initialState, token);
		if (!session) {
			return undefined;
		}

		const id = ExtHostChat._nextId++;
		this._chatSessions.set(id, session);

		return {
			id,
			requesterUsername: session.requester?.name,
			requesterAvatarIconUri: session.requester?.icon,
			responderUsername: session.responder?.name,
			responderAvatarIconUri: session.responder?.icon,
			inputPlaceholder: session.inputPlaceholder,
		};
	}

	async $resolveRequest(handle: number, sessionId: number, context: any, token: CancellationToken): Promise<Omit<IChatRequestDto, 'id'> | undefined> {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._chatSessions.get(sessionId);
		if (!realSession) {
			return undefined;
		}

		if (!entry.provider.resolveRequest) {
			return undefined;
		}
		const request = await entry.provider.resolveRequest(realSession, context, token);
		if (request) {
			return {
				message: typeof request.message === 'string' ? request.message : typeConvert.ChatReplyFollowup.from(request.message),
			};
		}

		return undefined;
	}

	async $provideWelcomeMessage(handle: number, token: CancellationToken): Promise<(string | IChatReplyFollowup[])[] | undefined> {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		if (!entry.provider.provideWelcomeMessage) {
			return undefined;
		}

		const content = await entry.provider.provideWelcomeMessage(token);
		if (!content) {
			return undefined;
		}
		return content.map(item => {
			if (typeof item === 'string') {
				return item;
			} else {
				return item.map(f => typeConvert.ChatReplyFollowup.from(f));
			}
		});
	}

	async $provideFollowups(handle: number, sessionId: number, token: CancellationToken): Promise<IChatFollowup[] | undefined> {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._chatSessions.get(sessionId);
		if (!realSession) {
			return;
		}

		if (!entry.provider.provideFollowups) {
			return undefined;
		}

		const rawFollowups = await entry.provider.provideFollowups(realSession, token);
		return rawFollowups?.map(f => typeConvert.ChatFollowup.from(f));
	}

	$removeRequest(handle: number, sessionId: number, requestId: string): void {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return;
		}

		const realSession = this._chatSessions.get(sessionId);
		if (!realSession) {
			return;
		}

		if (!entry.provider.removeRequest) {
			return;
		}

		entry.provider.removeRequest(realSession, requestId);
	}

	async $provideReply(handle: number, sessionId: number, request: IChatRequestDto, token: CancellationToken): Promise<IChatResponseDto | undefined> {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._chatSessions.get(sessionId);
		if (!realSession) {
			return;
		}

		const requestObj: vscode.InteractiveRequest = {
			session: realSession,
			message: typeof request.message === 'string' ? request.message : typeConvert.ChatReplyFollowup.to(request.message),
		};

		const stopWatch = StopWatch.create(false);
		let firstProgress: number | undefined;
		const progressObj: vscode.Progress<vscode.InteractiveProgress> = {
			report: (progress: vscode.InteractiveProgress) => {
				if (token.isCancellationRequested) {
					return;
				}

				if (typeof firstProgress === 'undefined') {
					firstProgress = stopWatch.elapsed();
				}

				if ('responseId' in progress) {
					this._proxy.$acceptResponseProgress(handle, sessionId, { requestId: progress.responseId });
				} else if ('placeholder' in progress && 'resolvedContent' in progress) {
					const resolvedContent = Promise.all([this._proxy.$acceptResponseProgress(handle, sessionId, { placeholder: progress.placeholder }), progress.resolvedContent]);
					raceCancellation(resolvedContent, token).then((res) => {
						if (!res) {
							return; /* Cancelled */
						}
						const [progressHandle, progressContent] = res;
						this._proxy.$acceptResponseProgress(handle, sessionId, progressContent, progressHandle ?? undefined);
					});
				} else {
					this._proxy.$acceptResponseProgress(handle, sessionId, progress);
				}
			}
		};
		let result: vscode.InteractiveResponseForProgress | undefined | null;
		try {
			result = await entry.provider.provideResponseWithProgress(requestObj, progressObj, token);
			if (!result) {
				result = { errorDetails: { message: localize('emptyResponse', "Provider returned null response") } };
			}
		} catch (err) {
			result = { errorDetails: { message: localize('errorResponse', "Error from provider: {0}", err.message), responseIsIncomplete: true } };
			this.logService.error(err);
		}

		try {
			// Check that the session has not been released since the request started
			if (realSession.saveState && this._chatSessions.has(sessionId)) {
				const newState = realSession.saveState();
				this._proxy.$acceptChatState(sessionId, newState);
			}
		} catch (err) {
			this.logService.warn(err);
		}

		const timings = { firstProgress: firstProgress ?? 0, totalElapsed: stopWatch.elapsed() };
		return { errorDetails: result.errorDetails, timings };
	}

	async $provideSlashCommands(handle: number, sessionId: number, token: CancellationToken): Promise<ISlashCommand[] | undefined> {
		const entry = this._chatProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._chatSessions.get(sessionId);
		if (!realSession) {
			return undefined;
		}

		if (!entry.provider.provideSlashCommands) {
			return undefined;
		}

		const slashCommands = await entry.provider.provideSlashCommands(realSession, token);
		return slashCommands?.map(c => (<ISlashCommand>{
			...c,
			kind: typeConvert.CompletionItemKind.from(c.kind)
		}));
	}

	$releaseSession(sessionId: number) {
		this._chatSessions.delete(sessionId);
	}

	async $onDidPerformUserAction(event: IChatUserActionEvent): Promise<void> {
		this._onDidPerformUserAction.fire(event);
	}

	//#endregion

	registerSlashCommandProvider(extension: Readonly<IRelaxedExtensionDescription>, chatProviderId: string, provider: vscode.InteractiveSlashCommandProvider): vscode.Disposable {
		const wrapper = new ChatProviderWrapper(extension, provider);
		this._slashCommandProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerSlashCommandProvider(wrapper.handle, chatProviderId);
		return toDisposable(() => {
			this._proxy.$unregisterSlashCommandProvider(wrapper.handle);
			this._slashCommandProvider.delete(wrapper.handle);
		});
	}

	async $provideProviderSlashCommands(handle: number, token: CancellationToken): Promise<ISlashCommand[] | undefined> {
		const entry = this._slashCommandProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const slashCommands = await entry.provider.provideSlashCommands(token);
		return slashCommands?.map(c => (<ISlashCommand>{
			...c,
			kind: typeConvert.CompletionItemKind.from(c.kind)
		}));
	}

	async $resolveSlashCommand(handle: number, command: string, token: CancellationToken): Promise<string | undefined> {
		const entry = this._slashCommandProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const resolved = await entry.provider.resolveSlashCommand(command, token);
		return resolved ?? undefined;
	}
}
