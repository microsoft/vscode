/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { SessionTypeSelectionReason } from '../common/constants.js';
import { IChatWidget } from './chat.js';

export const IChatViewHostService = createDecorator<IChatViewHostService>('chatViewHostService');

/** The chat that a host shows ({@link IChatViewHost.shownSession}), and why it shows it. */
export interface IChatViewHostShownSession {
	readonly resource: URI;
	/**
	 * `open` when the user brought the chat up, such as by picking it in the sessions list or starting a new chat;
	 * `commit` when the first request of a new chat made it the session it became, which the user did not pick; `restore`
	 * when the host shows a chat that it does not bring up for the user, such as the chat it last showed as the window
	 * starts, or one opened with {@link IChatViewHostOpenOptions.restore}.
	 */
	readonly reason: 'open' | 'commit' | 'restore';
}

/** How {@link IChatViewHost.reveal} shows the host. */
export interface IChatViewHostRevealOptions {
	/**
	 * Waits for the widget of the chat it shows while the host has none yet, such as the Chat view before its body first
	 * renders, rather than resolving to `undefined`.
	 */
	readonly waitForWidget?: boolean;
}

/** How {@link IChatViewHost.openSession} shows a session. */
export interface IChatViewHostOpenOptions {
	readonly preserveFocus?: boolean;
	readonly sessionTypeSelectionReason?: SessionTypeSelectionReason;
	/**
	 * Shows the session as one the host restores ({@link IChatViewHostShownSession.reason} `restore`) rather than one
	 * the user opens, such as the chat that was last shown where the user moved the window's folder.
	 */
	readonly restore?: boolean;
	/**
	 * Shows the session as the one that the first request of the chat it shows made of it ({@link IChatViewHostShownSession.reason}
	 * `commit`), rather than one the user opens.
	 */
	readonly commit?: boolean;
}

/** Why a host shows a session that it opens with `options`. */
export function getChatViewHostOpenReason(options: IChatViewHostOpenOptions | undefined): IChatViewHostShownSession['reason'] {
	return options?.commit ? 'commit' : options?.restore ? 'restore' : 'open';
}

/** What a new chat aims at, such as the folder and the session type of a new session that a sessions list starts. */
export interface IChatViewNewChatTarget {
	/** The folder the session of the new chat works in. */
	readonly folder?: URI;
	readonly providerId?: string;
	readonly sessionType?: string;
}

/** How {@link IChatViewHost.startSession} starts a session that its caller may send a first request to. */
export interface IChatViewHostSessionStartOptions {
	/** Whether the session is a new local chat, rather than the session of the given resource. */
	readonly local: boolean;
	/** Whether its first request copies another conversation, which can take a while to show. */
	readonly importingConversation: boolean;
	/** Called once the host shows, before the session loads. */
	readonly beforeOpen?: () => void;
}

/** A session that {@link IChatViewHost.startSession} started; disposing it ends the start without completing it. */
export interface IChatViewHostSessionStart extends IDisposable {
	/** The session moved to `sessionResource`, such as an untitled session that its first request made real. */
	moved(sessionResource: URI): Promise<void>;
	/**
	 * The start is done: its first request, if any, was sent (`sent`) or not, and the session is `sessionResource`. Resolves
	 * to whether the host shows the session, such as not a new session whose request did not run.
	 */
	complete(sessionResource: URI, sent: boolean): Promise<boolean>;
	/**
	 * A new-session composer of the session's type, to put back a first request that was not sent and that the host does not
	 * show; `undefined` when the host has none.
	 */
	createComposer(): Promise<IChatWidget | undefined>;
}

/**
 * What shows the chats of the Chat view: the Chat view itself, unless something replaces it, such as the Agents view of an
 * editor window.
 */
export interface IChatViewHost {
	/** Shows the host and resolves to the widget of the chat it shows. */
	reveal(preserveFocus?: boolean, options?: IChatViewHostRevealOptions): Promise<IChatWidget | undefined>;
	/**
	 * Shows the host and resolves to the widget of the chat of `sessionResource` when the host already holds that chat, without
	 * loading it again; to `undefined` when it does not. A host that does not implement it holds no chat to reveal this way.
	 */
	revealIfShowing?(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined>;
	/** Shows the chat of `sessionResource` in the host and resolves to its widget; to `undefined` when it cannot show it. */
	openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined>;
	/** Shows the host, or hides it while it shows. Resolves to whether it shows afterwards. */
	toggle(): Promise<boolean>;
	/** Starts showing the session of `sessionResource`, which its caller may send a first request to. */
	startSession(sessionResource: URI, options: IChatViewHostSessionStartOptions): Promise<IChatViewHostSessionStart>;
	/**
	 * Whether the host shows the chat of `sessionResource`. A host that does not leaves revealing, opening and starting it to
	 * the Chat view, such as a host that shows only some kinds of chats; without it, the host shows every chat.
	 */
	canShow?(sessionResource: URI): boolean;
	/**
	 * Starts a new chat in the host, as New Chat of the Chat view does, aimed at `target` when given, and resolves to whether
	 * it takes it once its new chat shows, so that a request that follows goes to it. A host that does not implement it leaves
	 * New Chat to the chat widget it acts on.
	 */
	newChat?(target?: IChatViewNewChatTarget): Promise<boolean>;
	/** The chat the host shows; a host that does not implement it reports none. */
	readonly shownSession?: IObservable<IChatViewHostShownSession | undefined>;
}

/**
 * The host of the Chat view's chats. Everything that would show the Chat view goes through it. By default the host is the
 * Chat view; a host registered with {@link registerHost} replaces it while registered.
 */
export interface IChatViewHostService extends IChatViewHost {
	readonly _serviceBrand: undefined;

	revealIfShowing(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined>;

	newChat(target?: IChatViewNewChatTarget): Promise<boolean>;

	/** Whether a registered host replaces the Chat view, which then shows only the chats the host leaves to it. */
	readonly replaced: IObservable<boolean>;
	/**
	 * The chat that the host that showed a chat last shows: the one that opened or started a chat last, the Chat view for the
	 * chats the host in use leaves to it, or the one that restored its chat last. None while that host does not report one
	 * ({@link IChatViewHost.shownSession}).
	 */
	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;

	/**
	 * Replaces the Chat view with `host` until the returned disposable is disposed. The host registered last is the one in
	 * use; disposing it gives the use back to the one before.
	 */
	registerHost(host: IChatViewHost): IDisposable;
}
