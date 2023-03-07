/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toDisposable } from 'vs/base/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';
import { IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostInteractiveSessionShape, IInteractiveRequestDto, IInteractiveResponseDto, IInteractiveSessionDto, IMainContext, MainContext, MainThreadInteractiveSessionShape } from 'vs/workbench/api/common/extHost.protocol';
import type * as vscode from 'vscode';

class InteractiveSessionProviderWrapper {

	private static _pool = 0;

	readonly handle: number = InteractiveSessionProviderWrapper._pool++;

	constructor(
		readonly extension: Readonly<IRelaxedExtensionDescription>,
		readonly provider: vscode.InteractiveSessionProvider,
	) { }
}

export class ExtHostInteractiveSession implements ExtHostInteractiveSessionShape {
	private static _nextId = 0;

	private readonly _interactiveSessionProvider = new Map<number, InteractiveSessionProviderWrapper>();
	private readonly _interactiveSessions = new Map<number, vscode.InteractiveSession>();

	private readonly _proxy: MainThreadInteractiveSessionShape;

	constructor(
		mainContext: IMainContext,
		_logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadInteractiveSession);
	}

	//#region interactive session

	registerInteractiveSessionProvider(extension: Readonly<IRelaxedExtensionDescription>, id: string, provider: vscode.InteractiveSessionProvider): vscode.Disposable {
		const wrapper = new InteractiveSessionProviderWrapper(extension, provider);
		this._interactiveSessionProvider.set(wrapper.handle, wrapper);
		this._proxy.$registerInteractiveSessionProvider(wrapper.handle, id, !!provider.provideResponseWithProgress);
		return toDisposable(() => {
			this._proxy.$unregisterInteractiveSessionProvider(wrapper.handle);
			this._interactiveSessionProvider.delete(wrapper.handle);
		});
	}

	addInteractiveSessionRequest(context: vscode.InteractiveSessionRequestArgs): void {
		this._proxy.$addInteractiveSessionRequest(context);
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
			requesterAvatarIconPath: session.requester?.iconPath,
			responderUsername: session.responder?.name,
			responderAvatarIconPath: session.responder?.iconPath
		};
	}

	async $resolveInteractiveRequest(handle: number, sessionId: number, context: any, token: CancellationToken): Promise<IInteractiveRequestDto | undefined> {
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
				message: request.message,
			};
		}

		return undefined;
	}

	async $provideInitialSuggestions(handle: number, token: CancellationToken): Promise<string[] | undefined> {
		const entry = this._interactiveSessionProvider.get(handle);
		if (!entry) {
			return undefined;
		}

		if (!entry.provider.provideInitialSuggestions) {
			return undefined;
		}

		return withNullAsUndefined(await entry.provider.provideInitialSuggestions(token));
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
			message: request.message,
		};

		if (entry.provider.provideResponse) {
			const res = await entry.provider.provideResponse(requestObj, token);
			if (realSession.saveState) {
				const newState = realSession.saveState();
				this._proxy.$acceptInteractiveSessionState(sessionId, newState);
			}

			if (!res) {
				return;
			}

			this._proxy.$acceptInteractiveResponseProgress(handle, sessionId, { responsePart: res.content });
			return { followups: res.followups };
		} else if (entry.provider.provideResponseWithProgress) {
			const progressObj: vscode.Progress<vscode.InteractiveProgress> = {
				report: (progress: vscode.InteractiveProgress) => this._proxy.$acceptInteractiveResponseProgress(handle, sessionId, { responsePart: progress.content })
			};
			const res = await entry.provider.provideResponseWithProgress(requestObj, progressObj, token);
			if (realSession.saveState) {
				const newState = realSession.saveState();
				this._proxy.$acceptInteractiveSessionState(sessionId, newState);
			}

			if (!res) {
				return;
			}

			return { followups: res.followups, commandFollowups: res.commands };
		}

		throw new Error('provider must implement either provideResponse or provideResponseWithProgress');
	}

	$releaseSession(sessionId: number) {
		this._interactiveSessions.delete(sessionId);
	}

	//#endregion
}
