/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, TimeoutTimer } from '../../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IChat } from '../../../../workbench/services/sessions/common/session.js';

/** How long a chat model stays held for its view to bind to it, when the view never reports having done so. */
export const CHAT_MODEL_HOLD_TIMEOUT = 10_000;

/**
 * Holds the loaded model of a chat while it moves between views, such as from the main window's grid to a chat window:
 * the model is released when its last view lets go, so without it the view that takes over loads the history again.
 * The hold only bridges the move: it is released as soon as the new view has bound to the model, so that switching chats
 * afterwards does not keep a large model alive, and in any case after {@link CHAT_MODEL_HOLD_TIMEOUT}, or when disposed.
 */
export class ChatModelHold extends Disposable {

	private readonly _hold = this._register(new MutableDisposable<IDisposable>());
	private readonly _poll = this._register(new IntervalTimer());
	/** The time the hold ends at, the view bound or not: a deadline, not a count of polls, which a window in the background makes fewer. */
	private readonly _expiry = this._register(new TimeoutTimer());

	constructor(
		private readonly _acquire: (resource: URI) => IDisposable | undefined,
		private readonly _timeout = CHAT_MODEL_HOLD_TIMEOUT,
		private readonly _pollInterval = 100,
	) {
		super();
	}

	/** Holds the model of `resource` if it is loaded, instead of what is held; nothing when `resource` is undefined. `isBound` tells when the new view has bound. */
	hold(resource: URI | undefined, isBound: () => boolean): void {
		this._poll.cancel();
		this._hold.value = resource ? this._acquire(resource) : undefined;
		if (!this._hold.value) {
			return;
		}
		this._poll.cancelAndSet(() => {
			if (isBound()) {
				this.release();
			}
		}, this._pollInterval);
		this._expiry.cancelAndSet(() => this.release(), this._timeout);
	}

	release(): void {
		this._poll.cancel();
		this._expiry.cancel();
		this._hold.clear();
	}

	get isHolding(): boolean {
		return !!this._hold.value;
	}
}

/** The session of a chat window, as far as what its chat needs of it. */
export interface IChatWindowChatSession {
	readonly title: IObservable<string>;
	readonly loading: IObservable<boolean>;
	readonly chats: IObservable<readonly IChat[]>;
	readonly mainChat: IObservable<IChat>;
}

/** The title of a chat window: the title of its chat, or of its session. */
export function chatWindowTitle(session: IChatWindowChatSession, chatResource: URI | undefined, reader: IReader): string {
	const chat = chatResource && session.chats.read(reader).find(candidate => isEqual(candidate.resource, chatResource));
	return chat?.title.read(reader) || session.title.read(reader);
}

/**
 * Whether the chat a window shows was deleted, or archived: the window closes with it. The chat resolves as in
 * `getSessionForChatResource`, so a main chat the session does not list yet is still found. A session that still
 * loads has not listed its chats yet, so a chat missing from it is not gone. Shared by the window and the links
 * that open chats in it, so that a link never opens a chat the window would close.
 */
export function isChatWindowChatGone(session: Pick<IChatWindowChatSession, 'loading' | 'chats' | 'mainChat'>, chatResource: URI, reader: IReader | undefined): boolean {
	let chat = session.chats.read(reader).find(candidate => isEqual(candidate.resource, chatResource));
	if (!chat) {
		const mainChat = session.mainChat.read(reader);
		chat = isEqual(mainChat.resource, chatResource) ? mainChat : undefined;
	}
	return chat ? chat.isArchived.read(reader) : !session.loading.read(reader);
}
