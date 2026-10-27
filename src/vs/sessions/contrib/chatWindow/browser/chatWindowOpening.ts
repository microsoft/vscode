/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IChat } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { IChatWindowContent } from '../../../services/chatWindow/browser/chatWindowService.js';

/** What opening a chat window has set up so far, which a failure has to take down again. */
export interface IChatWindowOpening {
	readonly disposables: DisposableStore;
	/** Closes the part of the window, once it is created. */
	close?: () => boolean;
}

/** Runs `open`, and when it fails, disposes what it set up and closes the part it created, before rethrowing. */
export async function openCleaningUpOnFailure<T>(open: (opening: IChatWindowOpening) => Promise<T>): Promise<T> {
	const opening: IChatWindowOpening = { disposables: new DisposableStore() };
	try {
		return await open(opening);
	} catch (error) {
		opening.disposables.dispose();
		opening.close?.();
		throw error;
	}
}

/** Gives the same promise to everyone who asks for the same key while it is pending. */
export class InFlightOperations<T> {

	private readonly _pending = new Map<string, Promise<T>>();

	run(key: string, operation: () => Promise<T>): Promise<T> {
		const pending = this._pending.get(key);
		if (pending) {
			return pending;
		}
		const promise = operation().finally(() => this._pending.delete(key));
		this._pending.set(key, promise);
		return promise;
	}
}

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
		let waited = 0;
		this._poll.cancelAndSet(() => {
			waited += this._pollInterval;
			if (isBound() || waited >= this._timeout) {
				this.release();
			}
		}, this._pollInterval);
	}

	release(): void {
		this._poll.cancel();
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
export function isChatWindowChatGone(session: IChatWindowChatSession, chatResource: URI, reader: IReader | undefined): boolean {
	const chat = session.chats.read(reader).find(candidate => isEqual(candidate.resource, chatResource));
	return chat ? chat.isArchived.read(reader) : !session.loading.read(reader);
}

/** A chat window, as far as closing it with its chat needs of it. */
/** A chat window as {@link followReplacedWindowSessions} sees it. */
export interface IReplaceableChatWindow {
	readonly session: IObservable<IActiveSession | undefined>;
	readonly content: IObservable<IChatWindowContent>;
	readonly sessionView: { openSession(session: IActiveSession, options: object): void };
	setSession(session: IActiveSession | undefined): void;
	setContent(content: IChatWindowContent): void;
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
			window.setSession(replacement);
			if (replacement) {
				window.setContent({ ...window.content.read(undefined), session: replacement.resource });
				window.sessionView.openSession(replacement, {});
			} else {
				window.close();
			}
		}
	});
}

export interface IGoneChatWindow {
	readonly session: IObservable<(IChatWindowChatSession & { readonly scopedChatResource?: URI }) | undefined>;
	close(): unknown;
}

/**
 * Closes each chat window whose chat was deleted or archived, including the windows opened after this started:
 * the windows and their sessions are tracked, as the first run has no window to track.
 */
export function closeChatWindowsOfGoneChats(windows: IObservable<readonly IGoneChatWindow[]>, isReplacing: (window: IGoneChatWindow) => boolean): IDisposable {
	return autorun(reader => {
		for (const window of windows.read(reader)) {
			const session = window.session.read(reader);
			const chatResource = session?.scopedChatResource;
			if (!session || !chatResource || isReplacing(window)) {
				continue;
			}
			if (isChatWindowChatGone(session, chatResource, reader)) {
				window.close();
			}
		}
	});
}
