/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { DeferredPromise, disposableTimeout, raceTimeout } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ChatMoveSettingId } from '../../../../../platform/agentHost/common/agentHostChatMove.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChatMoveTarget, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChatMoveEnd, SessionMoveRefusedError } from '../../../../services/sessions/common/sessionsProvider.js';
import type { SessionsListNotification } from './sessionsListNotification.js';

/**
 * Whether dragging chats and sessions to move them is on: the Move Chats setting is enabled and AI features are not
 * hidden. Contributions that can read `ChatContextKeys.enabled` also require it.
 */
export function isChatMoveDndEnabled(configurationService: IConfigurationService, chatEntitlementService: IChatEntitlementService): boolean {
	return configurationService.getValue<boolean>(ChatMoveSettingId.Enabled) === true
		&& !chatEntitlementService.sentiment.hidden;
}

/**
 * Whether `target` can receive a chat (or a single-chat session) moved from `source`: another started, unarchived
 * session of the same provider and agent (its session type: one provider can serve several agents, e.g. Copilot,
 * Claude and Codex) that holds several chats.
 */
export function canMoveIntoSession(source: ISession, target: ISession): boolean {
	return target.sessionId !== source.sessionId
		&& target.providerId === source.providerId
		&& target.sessionType === source.sessionType
		&& !target.isArchived.get()
		&& target.status.get() !== SessionStatus.Untitled
		&& target.capabilities.get().supportsMultipleChats;
}

/**
 * The chat a moved chat is placed after to append it to `session`: its last chat that is neither a tool's subagent
 * chat, a hidden chat (neither can anchor a move) nor `exclude` (the moved chat, when it is already in `session`).
 */
export function getChatMoveAppendAnchor(session: ISession, exclude?: IChat): IChat | undefined {
	const chats = session.chats.get();
	for (let i = chats.length - 1; i >= 0; i--) {
		if (chats[i].origin?.kind !== ChatOriginKind.Tool && chats[i].interactivity.get() !== ChatInteractivity.Hidden && chats[i].resource.toString() !== exclude?.resource.toString()) {
			return chats[i];
		}
	}
	return undefined;
}

/**
 * Whether placing `chat` of `session` after `after` (first when `undefined`) changes the order of the session's chats,
 * which is what the host reorders. The list's rows can show the chats in another order, or only some of them.
 */
export function changesChatOrder(session: ISession, chat: IChat, after: IChat | undefined): boolean {
	const ids = session.chats.get().map(candidate => candidate.resource.toString());
	const id = chat.resource.toString();
	if (!ids.includes(id)) {
		return true;
	}
	const reordered = ids.filter(candidate => candidate !== id);
	const afterIndex = after ? reordered.indexOf(after.resource.toString()) : -1;
	if (after && afterIndex === -1) {
		return true;
	}
	reordered.splice(afterIndex + 1, 0, id);
	return reordered.some((candidate, index) => candidate !== ids[index]);
}

/**
 * The chat to place a moved chat after so that it lands right before `next` in the order of `session`'s chats
 * (`undefined`: first), skipping `moved` itself and subagent and hidden chats, which can't anchor a move. The list may
 * show the chats in another order (e.g. by update time), so a position among its rows is turned into one in that order.
 */
export function getChatMoveAnchorBefore(session: ISession, next: IChat, moved?: IChat): IChat | undefined {
	const chats = session.chats.get().filter(candidate => candidate.resource.toString() !== moved?.resource.toString());
	for (let i = chats.findIndex(candidate => candidate.resource.toString() === next.resource.toString()) - 1; i >= 0; i--) {
		if (chats[i].origin?.kind !== ChatOriginKind.Tool && chats[i].interactivity.get() !== ChatInteractivity.Hidden) {
			return chats[i];
		}
	}
	return undefined;
}

/**
 * Where the pointer is in the sessions list during a chat drag: over the row of `session` (`chat` undefined), over its
 * nested chat row `chat`, or over no session (`session` undefined: empty space, a section or folder header, ...).
 */
export interface ISessionsListChatDropTarget {
	readonly session: ISession | undefined;
	readonly chat: IChat | undefined;
	/** The half of the nested chat row `chat` the pointer is over; ignored over a session's own row. */
	readonly position: 'before' | 'after';
}

/**
 * Where a chat dropped in the sessions list moves: into `session` after `after` (first when `undefined`), either at the
 * insertion point before or after a nested chat row (`position` `'before'`/`'after'`) or at its end when dropped
 * anywhere on the session's row (`'over'`); or into a new session.
 */
export type SessionsListChatDrop =
	| { readonly kind: 'session'; readonly session: ISession; readonly after: IChat | undefined; readonly position: 'before' | 'after' | 'over' }
	| { readonly kind: 'newSession' };

/**
 * Where `chat` of `source` moves when dropped on `target` in the sessions list, or `undefined` when it can't move there
 * or would stay put. Like a folder in the Explorer:
 * - anywhere on a session's row: into that session, at its end (to the end of its own session);
 * - on the top or bottom half of a session's nested chat row: into that session before or after that row, which
 *   reorders it within its own session;
 * - anywhere else (empty space, a section or folder header): into a new session.
 * Positions are anchored in the order of the session's chats, whatever order the list shows them in.
 */
export function getSessionsListChatDrop(source: ISession, chat: IChat, target: ISessionsListChatDropTarget | undefined): SessionsListChatDrop | undefined {
	const session = target?.session;
	if (!target || !session) {
		return { kind: 'newSession' };
	}
	const isOwnSession = session.sessionId === source.sessionId;
	if (!isOwnSession && !canMoveIntoSession(source, session)) {
		return undefined;
	}

	if (!target.chat) {
		const after = getChatMoveAppendAnchor(session, chat);
		if (isOwnSession && !changesChatOrder(session, chat, after)) {
			return undefined;
		}
		return { kind: 'session', session, after, position: 'over' };
	}

	const next = target.chat;
	if (next.resource.toString() === chat.resource.toString()) {
		return undefined;
	}
	const after = target.position === 'after' ? next : getChatMoveAnchorBefore(session, next, chat);
	if (isOwnSession && !changesChatOrder(session, chat, after)) {
		return undefined;
	}
	return { kind: 'session', session, after, position: target.position };
}

/**
 * Where the pointer is in the sessions list while dragging a whole session that can move under another session: over
 * the row of `session` (`chat` undefined) or over its nested chat row `chat`, in quarter `quarter` of the row. The
 * rest is asked only when needed, as it is asked on every drag over.
 */
export interface ISessionsListSessionDropTarget {
	readonly session: ISession;
	readonly chat: IChat | undefined;
	readonly quarter: ListViewTargetSector;
	/** Whether `session` is in a section the user orders by hand: Pinned or a custom group. */
	isManuallyOrdered(): boolean;
	/** Whether the row is the last one its section shows: its last session's row, or that session's last chat row. */
	isLastInSection(): boolean;
	/** Whether the list would place the dragged session before or after `session` (reordering, pinning or grouping it). */
	canPlace(position: 'before' | 'after'): boolean;
}

/**
 * What a whole session dropped in the sessions list does: moves under `session` after `after` (`undefined`: first),
 * either at its end (`position` `'over'`) or before or after a nested chat row; or is placed before or after `session`
 * as the list's own reordering, pinning and grouping of sessions does.
 */
export type SessionsListSessionDrop =
	| { readonly kind: 'nest'; readonly session: ISession; readonly after: IChat | undefined; readonly position: 'before' | 'after' | 'over' }
	| { readonly kind: 'place'; readonly session: ISession; readonly position: 'before' | 'after' };

/**
 * What `source`, a session that can move under another session, does when dropped on `target`, or `undefined` when it
 * can't move there (the list then handles the drop as it does for any session). Like a folder in the Explorer:
 * - anywhere on a session's row: under that session, at its end;
 * - on the top or bottom half of a session's nested chat row: under that session, before or after that row, anchored
 *   in the order of the session's chats.
 * In Pinned and custom groups, whose sessions the user orders by hand, the top quarter of a session's row places it
 * before that session, and the bottom quarter of the section's last row places it after the section's last session,
 * where the list accepts that placement; otherwise these quarters nest too.
 */
export function getSessionsListSessionDrop(source: ISession, target: ISessionsListSessionDropTarget): SessionsListSessionDrop | undefined {
	const { session, chat, quarter } = target;
	if (!chat && quarter === ListViewTargetSector.TOP && target.isManuallyOrdered() && target.canPlace('before')) {
		return { kind: 'place', session, position: 'before' };
	}
	if (quarter === ListViewTargetSector.BOTTOM && target.isManuallyOrdered() && target.isLastInSection() && target.canPlace('after')) {
		return { kind: 'place', session, position: 'after' };
	}
	if (!canMoveIntoSession(source, session)) {
		return undefined;
	}
	if (!chat) {
		return { kind: 'nest', session, after: getChatMoveAppendAnchor(session), position: 'over' };
	}
	if (chat.resource.toString() === session.mainChat.get().resource.toString()) {
		return undefined;
	}
	const position = quarter === ListViewTargetSector.TOP || quarter === ListViewTargetSector.CENTER_TOP ? 'before' : 'after';
	return { kind: 'nest', session, after: position === 'after' ? chat : getChatMoveAnchorBefore(session, chat), position };
}

/** A move started by dropping in the sessions list: a chat to another place, or a single-chat session under another session. */
export type SessionsListMove =
	| { readonly kind: 'chat'; readonly session: ISession; readonly chat: IChat; readonly destination: ISessionChatMoveTarget }
	| { readonly kind: 'session'; readonly session: ISession; readonly destination: ISession; readonly after: IChat | undefined };

/** Whether `move` reorders a chat within its own session. */
function isReorder(move: SessionsListMove): boolean {
	return move.kind === 'chat' && move.destination.kind === 'session' && move.destination.session.sessionId === move.session.sessionId;
}

/** What the sessions list says while a move runs, once it moved, and when it was refused or failed. */
interface ISessionsListMoveMessages {
	readonly progress: string;
	readonly success: string;
	/** Why it was refused (`reason`), or that it failed unexpectedly (`reason` undefined): the details of an unexpected failure (e.g. a host's stack trace) aren't meant for the user. */
	failure(reason: string | undefined): string;
	/** What the log says about an unexpected failure. */
	readonly log: string;
}

function getSessionsListMoveMessages(move: SessionsListMove): ISessionsListMoveMessages {
	if (move.kind === 'session') {
		const title = move.session.title.get();
		const target = move.destination.title.get();
		return {
			progress: localize('sessionsMove.movingSession', "Moving session '{0}' into '{1}'...", title, target),
			success: localize('sessionsMove.movedSession', "Moved session '{0}' into '{1}'", title, target),
			failure: reason => reason === undefined
				? localize('sessionsMove.sessionFailedUnexpectedly', "Could not move session '{0}'.", title)
				: localize('sessionsMove.sessionFailed', "Could not move session '{0}'. {1}", title, reason),
			log: 'Moving a session failed',
		};
	}
	const title = move.chat.title.get();
	const failure = (reason: string | undefined) => reason === undefined
		? localize('sessionsMove.chatFailedUnexpectedly', "Could not move '{0}'.", title)
		: localize('sessionsMove.chatFailed', "Could not move '{0}'. {1}", title, reason);
	const log = 'Moving a chat failed';
	if (move.destination.kind === 'newSession') {
		return {
			progress: localize('sessionsMove.promoting', "Promoting '{0}' to a new session...", title),
			success: localize('sessionsMove.promoted', "Promoted '{0}' to a new session", title),
			failure,
			log,
		};
	}
	if (isReorder(move)) {
		return {
			progress: localize('sessionsMove.reordering', "Moving '{0}'...", title),
			success: move.destination.after
				? localize('sessionsMove.reorderedAfter', "Moved '{0}' after '{1}'", title, move.destination.after.title.get())
				: localize('sessionsMove.reorderedFirst', "Moved '{0}' to the start", title),
			failure,
			log,
		};
	}
	const target = move.destination.session.title.get();
	return {
		progress: localize('sessionsMove.moving', "Moving '{0}' into '{1}'...", title, target),
		success: localize('sessionsMove.moved', "Moved '{0}' into '{1}'", title, target),
		failure,
		log,
	};
}

/**
 * What the sessions list says while undoing a move of `title` runs: moving it back within its session, back into
 * session `target`, or back to a session of its own (`target` undefined after a move into another session).
 */
function getSessionsListUndoMessages(title: string, back: { readonly kind: 'reorder' } | { readonly kind: 'session'; readonly target: string } | { readonly kind: 'ownSession' }): ISessionsListMoveMessages {
	const failure = (reason: string | undefined) => reason === undefined
		? localize('sessionsMove.undoFailedUnexpectedly', "Could not undo moving '{0}'.", title)
		: localize('sessionsMove.undoFailed', "Could not undo moving '{0}'. {1}", title, reason);
	const log = 'Undoing a move failed';
	switch (back.kind) {
		case 'reorder':
			return {
				progress: localize('sessionsMove.movingBack', "Moving '{0}' back...", title),
				success: localize('sessionsMove.movedBack', "Moved '{0}' back", title),
				failure,
				log,
			};
		case 'session':
			return {
				progress: localize('sessionsMove.movingBackInto', "Moving '{0}' back into '{1}'...", title, back.target),
				success: localize('sessionsMove.movedBackInto', "Moved '{0}' back into '{1}'", title, back.target),
				failure,
				log,
			};
		case 'ownSession':
			return {
				progress: localize('sessionsMove.movingBackToOwnSession', "Moving '{0}' back to its own session...", title),
				success: localize('sessionsMove.movedBackToOwnSession', "Moved '{0}' back to its own session", title),
				failure,
				log,
			};
	}
}

/** How to undo a move: the move back, once the moved chat is found where it went, and what the list says about it. */
interface ISessionsListMoveUndo extends IDisposable {
	readonly messages: ISessionsListMoveMessages;
	/** The move back, or `undefined` when the moved chat or its session can't be found anymore. */
	getMoveBack(): Promise<SessionsListMove | undefined>;
}

/**
 * Prepares undoing `move` before it starts: remembers where the moved chat is and follows it to where it goes, which
 * the provider reports while it moves, until disposed. Its position is restored after the chat that was
 * before it (first when none), and a chat moved out of a session goes back into it, or to its own session for a
 * session moved under another one.
 */
function prepareSessionsListMoveUndo(move: SessionsListMove, sessionsManagementService: ISessionsManagementService): ISessionsListMoveUndo {
	const current = (session: ISession) => sessionsManagementService.getSession(session.resource) ?? session;
	const findChat = (session: ISession, resource: URI) => session.chats.get().find(candidate => isEqual(candidate.resource, resource));
	if (move.kind === 'chat' && isReorder(move)) {
		const before = getChatMoveAnchorBefore(move.session, move.chat);
		return {
			messages: getSessionsListUndoMessages(move.chat.title.get(), { kind: 'reorder' }),
			getMoveBack: async () => {
				const session = current(move.session);
				const chat = findChat(session, move.chat.resource);
				// An anchor that is gone is still passed, for the provider to refuse the move with its reason.
				const after = before && (findChat(session, before.resource) ?? before);
				return chat && { kind: 'chat', session, chat, destination: { kind: 'session', session, after } };
			},
			dispose: () => { },
		};
	}

	const movedChat = move.kind === 'chat' ? move.chat.resource : move.session.mainChat.get().resource;
	const landed = new DeferredPromise<IChatMoveEnd>();
	const store = new DisposableStore();
	store.add(sessionsManagementService.onDidMoveChat(({ from, to }) => {
		if (from.session.sessionId === move.session.sessionId && isEqual(from.chat, movedChat)) {
			landed.complete(to);
			store.dispose();
		}
	}));
	// The provider reports the move right after it, so stop following it after a while in case it never does.
	store.add(disposableTimeout(() => store.dispose(), 60_000));
	const findLanded = async () => {
		const to = landed.isSettled ? landed.value : await raceTimeout(landed.p, 5_000);
		const session = to && current(to.session);
		const chat = session && to && findChat(session, to.chat);
		return session && chat ? { session, chat } : undefined;
	};

	if (move.kind === 'session') {
		return {
			messages: getSessionsListUndoMessages(move.session.title.get(), { kind: 'ownSession' }),
			getMoveBack: async () => {
				const found = await findLanded();
				return found && { kind: 'chat', session: found.session, chat: found.chat, destination: { kind: 'newSession' } };
			},
			dispose: () => store.dispose(),
		};
	}
	const origin = move.session;
	const before = getChatMoveAnchorBefore(origin, move.chat);
	const toNewSession = move.destination.kind === 'newSession';
	return {
		messages: getSessionsListUndoMessages(move.chat.title.get(), { kind: 'session', target: origin.title.get() }),
		getMoveBack: async () => {
			const found = await findLanded();
			if (!found) {
				return undefined;
			}
			const session = current(origin);
			const after = before && (findChat(session, before.resource) ?? before);
			// A promoted chat is the main chat of its new session: that session moves back under its origin.
			return toNewSession
				? { kind: 'session', session: found.session, destination: session, after }
				: { kind: 'chat', session: found.session, chat: found.chat, destination: { kind: 'session', session, after } };
		},
		dispose: () => store.dispose(),
	};
}

/** The notice at the bottom of the sessions list that shows moves and their results. */
export type SessionsListMoveNotice = Pick<SessionsListNotification, 'show' | 'showProgress'>;

/** How the sessions list reports a move it runs. */
export interface ISessionsListMoveOptions {
	/**
	 * The notice at the bottom of the sessions list, when the list shows: it then shows the move in progress, its result
	 * with Undo, or why it was refused.
	 */
	readonly notice?: SessionsListMoveNotice;
	/**
	 * Called right before a move, or the move undoing it, starts, e.g. to reveal what it moves; the function it returns
	 * is called with whether it moved.
	 */
	readonly watch?: (move: SessionsListMove) => (moved: boolean) => void;
}

interface ISessionsListMoveRunner {
	readonly sessionsManagementService: ISessionsManagementService;
	readonly notificationService: INotificationService;
	readonly logService: ILogService;
	readonly options: ISessionsListMoveOptions;
}

/**
 * Runs a move started in the sessions list, without asking first, as a reorder does. With the list's notice, it shows
 * the move in progress, then its result with Undo, or why it was refused (an unexpected failure says only that it
 * failed and logs the details). Without the notice, a refusal or failure is a notification and a success is only
 * announced to screen readers. Resolves whether it moved.
 */
export async function runSessionsListMove(
	move: SessionsListMove,
	sessionsManagementService: ISessionsManagementService,
	notificationService: INotificationService,
	logService: ILogService,
	options: ISessionsListMoveOptions = {},
): Promise<boolean> {
	const runner: ISessionsListMoveRunner = { sessionsManagementService, notificationService, logService, options };
	// Undo is offered by the notice only.
	const undo = options.notice ? prepareSessionsListMoveUndo(move, sessionsManagementService) : undefined;
	const moved = await executeSessionsListMove(async () => move, getSessionsListMoveMessages(move), undo && (async () => {
		await executeSessionsListMove(() => undo.getMoveBack(), undo.messages, undefined, runner);
	}), runner);
	if (!moved) {
		undo?.dispose();
	}
	return moved;
}

async function executeSessionsListMove(getMove: () => Promise<SessionsListMove | undefined>, messages: ISessionsListMoveMessages, undo: (() => Promise<void>) | undefined, runner: ISessionsListMoveRunner): Promise<boolean> {
	const { sessionsManagementService, notificationService, logService, options: { notice, watch } } = runner;
	notice?.showProgress({ message: messages.progress, help: localize('sessionsMove.progressHelp', "This notice shows a chat or session being moved in the sessions list.") });
	let moved = false;
	let watched: ((moved: boolean) => void) | undefined;
	try {
		const move = await getMove();
		if (!move) {
			throw new Error('The moved chat or its session is no longer available');
		}
		watched = watch?.(move);
		if (move.kind === 'session') {
			await sessionsManagementService.moveSessionUnder(move.session, move.destination, move.after);
		} else {
			await sessionsManagementService.moveChat(move.session, move.chat, move.destination);
		}
		moved = true;
	} catch (error) {
		const reason = error instanceof SessionMoveRefusedError ? error.message : undefined;
		if (reason === undefined) {
			logService.error(`[sessionsList] ${messages.log}`, error);
		}
		const message = messages.failure(reason);
		if (notice) {
			notice.show({ message, help: localize('sessionsMove.failedHelp', "This notice says why a chat or session could not be moved in the sessions list."), warning: true });
		} else {
			notificationService.warn(message);
		}
	} finally {
		watched?.(moved);
	}
	if (!moved) {
		return false;
	}
	if (notice) {
		notice.show(undo
			? { message: messages.success, help: localize('sessionsMove.undoHelp', "This notice appears after moving a chat or session in the sessions list. Undo moves it back where it was."), undo }
			: { message: messages.success, help: localize('sessionsMove.resultHelp', "This notice reports a chat or session moved in the sessions list.") });
	} else {
		status(messages.success);
	}
	return true;
}
