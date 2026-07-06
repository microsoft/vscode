/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { getChatSessionType } from '../common/model/chatUri.js';
import { IEditSessionEntryDiff } from '../common/editing/chatEditingService.js';

export const IChatResponseFileChangesService = createDecorator<IChatResponseFileChangesService>('chatResponseFileChangesService');

/**
 * Supplies the per-response (per-request) file-change diffs rendered by the
 * "Changed N files" summary under a completed chat response.
 *
 * Most chat sessions derive these diffs from their {@link IChatEditingSession}.
 * Some session types (notably agent host sessions) own an authoritative,
 * server-computed view of a turn's changes and provide it here instead, so the
 * summary reflects the same source of truth as the rest of that session's
 * change UI.
 */
export interface IChatResponseFileChangesProvider {
	/**
	 * Returns an observable of the file-change diffs produced by `requestId`
	 * within `sessionResource`, or `undefined` when this provider cannot
	 * supply changes for that request (in which case the caller falls back to
	 * the chat editing session).
	 */
	getChangesForRequest(sessionResource: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> | undefined;
}

export interface IChatResponseFileChangesService {
	readonly _serviceBrand: undefined;

	/**
	 * Registers a provider for a chat session type (as returned by
	 * {@link getChatSessionType}). At most one provider may be registered per
	 * session type.
	 */
	registerProvider(chatSessionType: string, provider: IChatResponseFileChangesProvider): IDisposable;

	/**
	 * Returns the per-request change diffs for `sessionResource` from the
	 * provider registered for its session type, or `undefined` when there is
	 * no provider or the provider cannot supply changes for this request.
	 */
	getChangesForRequest(sessionResource: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> | undefined;
}

export class ChatResponseFileChangesService extends Disposable implements IChatResponseFileChangesService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, IChatResponseFileChangesProvider>();

	registerProvider(chatSessionType: string, provider: IChatResponseFileChangesProvider): IDisposable {
		if (this._providers.has(chatSessionType)) {
			throw new Error(`A chat response file changes provider is already registered for session type '${chatSessionType}'`);
		}
		this._providers.set(chatSessionType, provider);
		return toDisposable(() => {
			if (this._providers.get(chatSessionType) === provider) {
				this._providers.delete(chatSessionType);
			}
		});
	}

	getChangesForRequest(sessionResource: URI, requestId: string): IObservable<readonly IEditSessionEntryDiff[]> | undefined {
		const provider = this._providers.get(getChatSessionType(sessionResource));
		return provider?.getChangesForRequest(sessionResource, requestId);
	}
}
