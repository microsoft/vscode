/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { localize } from '../../../../../nls.js';
import { ChatMoveSettingId } from '../../../../../platform/agentHost/common/agentHostChatMove.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChatMoveTarget, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionMoveRefusedError } from '../../../../services/sessions/common/sessionsProvider.js';

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

/**
 * What the sessions list says when `move` was refused for `reason`, or failed unexpectedly (`reason` undefined): the
 * details of an unexpected failure (e.g. a host's stack trace) aren't meant for the user.
 */
export function getSessionsListMoveFailure(move: SessionsListMove, reason: string | undefined): string {
	if (reason === undefined) {
		return move.kind === 'session'
			? localize('sessionsMove.sessionFailedUnexpectedly', "Could not move session '{0}'.", move.session.title.get())
			: localize('sessionsMove.chatFailedUnexpectedly', "Could not move '{0}'.", move.chat.title.get());
	}
	return move.kind === 'session'
		? localize('sessionsMove.sessionFailed', "Could not move session '{0}'. {1}", move.session.title.get(), reason)
		: localize('sessionsMove.chatFailed', "Could not move '{0}'. {1}", move.chat.title.get(), reason);
}

/** What screen readers hear when `move` succeeded. */
function getSessionsListMoveSuccess(move: SessionsListMove): string {
	if (move.kind === 'session') {
		return localize('sessionsMove.movedSession', "Moved session '{0}' into '{1}'", move.session.title.get(), move.destination.title.get());
	}
	if (move.destination.kind === 'newSession') {
		return localize('sessionsMove.promoted', "Moved '{0}' to a new session", move.chat.title.get());
	}
	if (isReorder(move)) {
		return move.destination.after
			? localize('sessionsMove.reorderedAfter', "Moved '{0}' after '{1}'", move.chat.title.get(), move.destination.after.title.get())
			: localize('sessionsMove.reorderedFirst', "Moved '{0}' to the start", move.chat.title.get());
	}
	return localize('sessionsMove.moved', "Moved '{0}' into '{1}'", move.chat.title.get(), move.destination.session.title.get());
}

/**
 * Runs a move dropped in the sessions list, without asking first, as a reorder does. A move that is refused shows why;
 * one that fails unexpectedly says only that it failed and logs the details. A move that succeeds shows nothing (the
 * list shows the result) and is only announced to screen readers. Resolves whether it moved.
 */
export async function runSessionsListMove(
	move: SessionsListMove,
	sessionsManagementService: ISessionsManagementService,
	notificationService: INotificationService,
	logService: ILogService,
): Promise<boolean> {
	try {
		if (move.kind === 'session') {
			await sessionsManagementService.moveSessionUnder(move.session, move.destination, move.after);
		} else {
			await sessionsManagementService.moveChat(move.session, move.chat, move.destination);
		}
	} catch (error) {
		if (error instanceof SessionMoveRefusedError) {
			notificationService.warn(getSessionsListMoveFailure(move, error.message));
		} else {
			logService.error(`[sessionsList] Moving ${move.kind === 'session' ? 'a session' : 'a chat'} failed`, error);
			notificationService.warn(getSessionsListMoveFailure(move, undefined));
		}
		return false;
	}
	status(getSessionsListMoveSuccess(move));
	return true;
}
