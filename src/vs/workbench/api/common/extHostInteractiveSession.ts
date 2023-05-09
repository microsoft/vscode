/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter } from 'vs/base/common/event';
import { toDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { withNullAsUndefined } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostInteractiveSessionShape, IInteractiveRequestDto, IInteractiveResponseDto, IInteractiveSessionDto, IMainContext, MainContext, MainThreadInteractiveSessionShape } from 'vs/workbench/api/common/extHost.protocol';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { IInteractiveSessionFollowup, IInteractiveSessionReplyFollowup, IInteractiveSessionUserActionEvent, IInteractiveSlashCommand } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import type * as vscode from 'vscode';

class InteractiveSessionProviderWrapper<T> {

	private static _pool = 0;

	readonly handle: number = InteractiveSessionProviderWrapper._pool++;

	constructor(
		readonly extension: Readonly<IRelaxedExtensionDescription>,
		readonly provider: T,
	) { }
}

export class ExtHostInteractiveSession implements ExtHostInteractiveSessionShape {
	private static _nextId = 0;

	private readonly _interactiveSessionProvider = new Map<number, InteractiveSessionProviderWrapper<vscode.InteractiveSessionProvider>>();
	private readonly _slashCommandProvider = new Map<number, InteractiveSessionProviderWrapper<vscode.InteractiveSlashCommandProvider>>();
	private readonly _interactiveSessions = new Map<number, vscode.InteractiveSession>();
	// private readonly _providerResponsesByRequestId = new Map<number, { response: vscode.ProviderResult<vscode.InteractiveResponse | vscode.InteractiveResponseForProgress>; sessionId: number }>();

	private readonly _onDidPerformUserAction = new Emitter<vscode.InteractiveSessionUserActionEvent>();
	public readonly onDidPerformUserAction = this._onDidPerformUserAction.event;

	private readonly _proxy: MainThreadInteractiveSessionShape;

	constructor(
		mainContext: IMainContext,
		private readonly logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadInteractiveSession);
	}

	//#region interactive session

	registerInteractiveSessionProvider(extension: Readonly<IRelaxedExtensionDescription>, id: string, provider: vscode.InteractiveSessionProvider): vscode.Disposable {
		const wrapper = new InteractiveSessionProviderWrapper(extension, provider);
		this._interactiveSessionProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerInteractiveSessionProvider(wrapper.handle, id);
		return toDisposable(() => {
			this._proxy.$unregisterInteractiveSessionProvider(wrapper.handle);
			this._interactiveSessionProvider.delete(wrapper.handle);
		});
	}

	addInteractiveSessionRequest(context: vscode.InteractiveSessionRequestArgs): void {
		this._proxy.$addInteractiveSessionRequest(context);
	}

	sendInteractiveRequestToProvider(providerId: string, message: vscode.InteractiveSessionDynamicRequest): void {
		this._proxy.$sendInteractiveRequestToProvider(providerId, message);
	}

	async $prepareInteractiveSession(handle: number, initialState: any, token: CancellationToken): Promise<IInteractiveSessionDto | undefined> {
		const entry = this._interactiveSessionProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const session = await entry.provider.prepareSession(initialState, token);
		if (!session) {
			return undefined;
		}

		const id = ExtHostInteractiveSession._nextId++;
		this._interactiveSessions.set(id, session);

		return {
			id,
			requesterUsername: session.requester?.name,
			requesterAvatarIconUri: session.requester?.icon,
			responderUsername: session.responder?.name,
			responderAvatarIconUri: session.responder?.icon,
			inputPlaceholder: session.inputPlaceholder,
		};
	}

	async $resolveInteractiveRequest(handle: number, sessionId: number, context: any, token: CancellationToken): Promise<Omit<IInteractiveRequestDto, 'id'> | undefined> {
		const entry = this._interactiveSessionProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._interactiveSessions.get(sessionId);
		if (!realSession) {
			return undefined;
		}

		if (!entry.provider.resolveRequest) {
			return undefined;
		}
		const request = await entry.provider.resolveRequest(realSession, context, token);
		if (request) {
			return {
				message: typeof request.message === 'string' ? request.message : typeConvert.InteractiveSessionReplyFollowup.from(request.message),
			};
		}

		return undefined;
	}

	async $provideWelcomeMessage(handle: number, token: CancellationToken): Promise<(string | IInteractiveSessionReplyFollowup[])[] | undefined> {
		const entry = this._interactiveSessionProvider.get(handle);
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
				return item.map(f => typeConvert.InteractiveSessionReplyFollowup.from(f));
			}
		});
	}

	async $provideFollowups(handle: number, sessionId: number, token: CancellationToken): Promise<IInteractiveSessionFollowup[] | undefined> {
		const entry = this._interactiveSessionProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._interactiveSessions.get(sessionId);
		if (!realSession) {
			return;
		}

		if (!entry.provider.provideFollowups) {
			return undefined;
		}

		const rawFollowups = await entry.provider.provideFollowups(realSession, token);
		return rawFollowups?.map(f => typeConvert.InteractiveSessionFollowup.from(f));
	}

	async $provideInteractiveReply(handle: number, sessionId: number, request: IInteractiveRequestDto, token: CancellationToken): Promise<IInteractiveResponseDto | undefined> {
		const entry = this._interactiveSessionProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._interactiveSessions.get(sessionId);
		if (!realSession) {
			return;
		}

		const requestObj: vscode.InteractiveRequest = {
			session: realSession,
			message: typeof request.message === 'string' ? request.message : typeConvert.InteractiveSessionReplyFollowup.to(request.message),
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

				this._proxy.$acceptInteractiveResponseProgress(handle, sessionId, progress);
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
			if (realSession.saveState && this._interactiveSessions.has(sessionId)) {
				const newState = realSession.saveState();
				this._proxy.$acceptInteractiveSessionState(sessionId, newState);
			}
		} catch (err) {
			this.logService.warn(err);
		}

		const timings = { firstProgress: firstProgress ?? 0, totalElapsed: stopWatch.elapsed() };
		return { errorDetails: result.errorDetails, timings };
	}

	async $provideSlashCommands(handle: number, sessionId: number, token: CancellationToken): Promise<IInteractiveSlashCommand[] | undefined> {
		const entry = this._interactiveSessionProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const realSession = this._interactiveSessions.get(sessionId);
		if (!realSession) {
			return undefined;
		}

		if (!entry.provider.provideSlashCommands) {
			return undefined;
		}

		const slashCommands = await entry.provider.provideSlashCommands(realSession, token);
		return slashCommands?.map(c => (<IInteractiveSlashCommand>{
			...c,
			kind: typeConvert.CompletionItemKind.from(c.kind)
		}));
	}

	$releaseSession(sessionId: number) {
		this._interactiveSessions.delete(sessionId);
	}

	async $onDidPerformUserAction(event: IInteractiveSessionUserActionEvent): Promise<void> {
		this._onDidPerformUserAction.fire(event);
	}

	//#endregion

	registerSlashCommandProvider(extension: Readonly<IRelaxedExtensionDescription>, chatProviderId: string, provider: vscode.InteractiveSlashCommandProvider): vscode.Disposable {
		const wrapper = new InteractiveSessionProviderWrapper(extension, provider);
		this._slashCommandProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerSlashCommandProvider(wrapper.handle, chatProviderId);
		return toDisposable(() => {
			this._proxy.$unregisterSlashCommandProvider(wrapper.handle);
			this._slashCommandProvider.delete(wrapper.handle);
		});
	}

	async $provideProviderSlashCommands(handle: number, token: CancellationToken): Promise<IInteractiveSlashCommand[] | undefined> {
		const entry = this._slashCommandProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		const slashCommands = await entry.provider.provideSlashCommands(token);
		return slashCommands?.map(c => (<IInteractiveSlashCommand>{
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
		return withNullAsUndefined(resolved);
	}
}
