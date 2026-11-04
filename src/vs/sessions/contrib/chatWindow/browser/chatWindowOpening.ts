/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, TimeoutTimer } from '../../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IChat } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

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
}

/** The title of a chat window: the title of its chat, or of its session. */
export function chatWindowTitle(session: IChatWindowChatSession, chatResource: URI | undefined, reader: IReader): string {
	const chat = chatResource && session.chats.read(reader).find(candidate => isEqual(candidate.resource, chatResource));
	return chat?.title.read(reader) || session.title.read(reader);
}

/** Whether the chat a window shows was deleted, or archived: the window closes with it. A session that still loads has not listed its chats yet. */
export function isChatWindowChatGone(session: Pick<IChatWindowChatSession, 'loading' | 'chats'>, chatResource: URI, reader: IReader | undefined): boolean {
	const chat = session.chats.read(reader).find(candidate => isEqual(candidate.resource, chatResource));
	return chat ? chat.isArchived.read(reader) : !session.loading.read(reader);
}

/** A chat window as {@link followReplacedWindowSessions} sees it. */
export interface IReplaceableChatWindow {
	/** The window session it shows. */
	readonly session: IObservable<IActiveSession | undefined>;
	/** Shows `session` in place of its window session, which knows it by its resource from then on. */
	setSession(session: IActiveSession): void;
	close(): unknown;
}

/**
 * Keeps each chat window on its session for as long as the session shows in a window. When its provider replaces the
 * session, such as when its resource changes, the window shows the replacement, and knows it by its resource, so that
 * moving it to the main window, restoring it and finding its window work with the replacement; otherwise the window
 * closes.
 */
export function followReplacedWindowSessions(windows: IObservable<readonly IReplaceableChatWindow[]>, windowSessions: IObservable<readonly IActiveSession[]>): IDisposable {
	return autorun(reader => {
		const sessions = windowSessions.read(reader);
		for (const window of windows.read(undefined)) {
			const session = window.session.read(undefined);
			if (!session || sessions.includes(session)) {
				continue;
			}
			const replacement = sessions.find(candidate => isEqual(candidate.scopedChatResource, session.scopedChatResource));
			if (replacement) {
				window.setSession(replacement);
			} else {
				window.close();
			}
		}
	});
}

/** A chat window as {@link closeChatWindowsOfGoneChats} sees it. */
export interface IGoneChatWindow {
	readonly session: IObservable<(Pick<IChatWindowChatSession, 'loading' | 'chats'> & { readonly scopedChatResource?: URI }) | undefined>;
	close(): unknown;
}

/**
 * Closes each chat window whose chat was deleted or archived, including the windows opened after this started:
 * the windows and their sessions are tracked, as the first run has no window to track.
 */
export function closeChatWindowsOfGoneChats(windows: IObservable<readonly IGoneChatWindow[]>): IDisposable {
	return autorun(reader => {
		for (const window of windows.read(reader)) {
			const session = window.session.read(reader);
			const chatResource = session?.scopedChatResource;
			if (!session || !chatResource) {
				continue;
			}
			if (isChatWindowChatGone(session, chatResource, reader)) {
				window.close();
			}
		}
	});
}
