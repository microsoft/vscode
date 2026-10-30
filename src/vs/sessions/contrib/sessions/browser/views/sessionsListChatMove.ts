/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { localize } from '../../../../../nls.js';
import { ChatMoveSettingId } from '../../../../../platform/agentHost/common/agentHostChatMove.js';
import { ChatProvidersSettingId } from '../../../../../platform/agentHost/common/agentHostChatProviders.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatInteractivity, ChatOriginKind, getChatHarness, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
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
 * Whether chats may move into sessions of another agent of the same provider, keeping their own agent: both Move Chats
 * and chats with their own agents are enabled.
 */
export function isCrossAgentChatMoveEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(ChatMoveSettingId.Enabled) === true
		&& configurationService.getValue<boolean>(ChatProvidersSettingId.Enabled) === true;
}

/**
 * Whether `target` can receive a chat (or a single-chat session) moved from `source`: another started, unarchived
 * session of the same provider that holds several chats, and of the same agent (its session type: one provider can
 * serve several agents, e.g. Copilot, Claude and Codex), or, when `harness` is given (cross-agent moves are on, see
 * {@link isCrossAgentChatMoveEnabled}), of another agent whose session offers its chats `harness`: the harness of the
 * moved chat, which keeps its agent.
 */
export function canMoveIntoSession(source: ISession, target: ISession, harness?: string): boolean {
	return target.sessionId !== source.sessionId
		&& target.providerId === source.providerId
		&& (target.sessionType === source.sessionType || (harness !== undefined && !!target.capabilities.get().supportsChatHarnesses?.includes(harness)))
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

/** Where a chat or session moved into `session` goes: after `after` (first when `undefined`). */
export interface ISessionsListMoveDestination {
	readonly session: ISession;
	readonly after: IChat | undefined;
}

/**
 * Where moving a chat or single-chat session of `source` to the end of `target` puts it, or `undefined` when `target`
 * can't receive it (see {@link canMoveIntoSession}, which `harness` is passed to). `exclude` is the moved chat, when it
 * is already in `target`. The sessions list's drops and the move commands share it.
 */
export function getChatMoveAppendDestination(source: ISession, target: ISession, exclude?: IChat, harness?: string): ISessionsListMoveDestination | undefined {
	return canMoveIntoSession(source, target, harness) ? { session: target, after: getChatMoveAppendAnchor(target, exclude) } : undefined;
}

/** The harness a chat moved across agents keeps, or `undefined` while cross-agent moves are off (see {@link isCrossAgentChatMoveEnabled}). */
function getMovedChatHarness(source: ISession, chat: IChat, crossAgent: boolean | undefined): string | undefined {
	return crossAgent ? getChatHarness(source, chat) : undefined;
}

/**
 * The sessions the nested session `chat` of `source` can move into, each at its end, in the order of `sessions`: none
 * when its provider can't move it. With `crossAgent` (see {@link isCrossAgentChatMoveEnabled}), also the sessions of
 * other agents that offer the chat's harness.
 */
export function getChatMoveDestinations(source: ISession, chat: IChat, sessions: readonly ISession[], sessionsManagementService: Pick<ISessionsManagementService, 'canMoveChat'>, crossAgent?: boolean): ISessionsListMoveDestination[] {
	if (!sessionsManagementService.canMoveChat(source, chat)) {
		return [];
	}
	const harness = getMovedChatHarness(source, chat, crossAgent);
	return sessions.flatMap(session => getChatMoveAppendDestination(source, session, chat, harness) ?? []);
}

/**
 * The sessions the single-chat session `source` can nest under, each at its end, in the order of `sessions`: none
 * when its provider can't move it. With `crossAgent`, also the sessions of other agents that offer the harness of its
 * main chat.
 */
export function getSessionMoveDestinations(source: ISession, sessions: readonly ISession[], sessionsManagementService: Pick<ISessionsManagementService, 'canMoveSessionUnder'>, crossAgent?: boolean): ISessionsListMoveDestination[] {
	if (!sessionsManagementService.canMoveSessionUnder(source)) {
		return [];
	}
	const harness = getMovedChatHarness(source, source.mainChat.get(), crossAgent);
	return sessions.flatMap(session => getChatMoveAppendDestination(source, session, undefined, harness) ?? []);
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
 * When the list doesn't show the session's chats in that order (`positionsShown` false), a chat can't be reordered in
 * its own session, and dropped on a nested chat row of another session it goes to that session's end.
 * With `crossAgent` (see {@link isCrossAgentChatMoveEnabled}), it can also drop into sessions of other agents that
 * offer its harness.
 */
export function getSessionsListChatDrop(source: ISession, chat: IChat, target: ISessionsListChatDropTarget | undefined, positionsShown: boolean, crossAgent?: boolean): SessionsListChatDrop | undefined {
	const session = target?.session;
	if (!target || !session) {
		return { kind: 'newSession' };
	}
	const isOwnSession = session.sessionId === source.sessionId;
	if (!positionsShown && isOwnSession) {
		return undefined;
	}
	const append = isOwnSession ? { session, after: getChatMoveAppendAnchor(session, chat) } : getChatMoveAppendDestination(source, session, chat, getMovedChatHarness(source, chat, crossAgent));
	if (!append) {
		return undefined;
	}

	if (!target.chat || !positionsShown) {
		if (isOwnSession && !changesChatOrder(session, chat, append.after)) {
			return undefined;
		}
		return { kind: 'session', ...append, position: 'over' };
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
	/** Whether `session` is in a section the user orders by hand: Pinned, a custom group, or a workspace, repository or environment section. */
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
 * In Pinned, custom groups and workspace, repository or environment sections, whose sessions the user orders by hand,
 * the top quarter of a session's row places it
 * before that session, and the bottom quarter of the section's last row places it after the section's last session,
 * where the list accepts that placement; otherwise these quarters nest too.
 * When the list doesn't show the session's chats in that order (`positionsShown` false), a nested chat row is the
 * session's row: the session goes to its end.
 * With `crossAgent`, it can also nest under sessions of other agents that offer the harness of its main chat.
 */
export function getSessionsListSessionDrop(source: ISession, target: ISessionsListSessionDropTarget, positionsShown: boolean, crossAgent?: boolean): SessionsListSessionDrop | undefined {
	const { session, quarter } = target;
	const chat = positionsShown ? target.chat : undefined;
	if (!target.chat && quarter === ListViewTargetSector.TOP && target.isManuallyOrdered() && target.canPlace('before')) {
		return { kind: 'place', session, position: 'before' };
	}
	if (quarter === ListViewTargetSector.BOTTOM && target.isManuallyOrdered() && target.isLastInSection() && target.canPlace('after')) {
		return { kind: 'place', session, position: 'after' };
	}
	const append = getChatMoveAppendDestination(source, session, undefined, getMovedChatHarness(source, source.mainChat.get(), crossAgent));
	if (!append) {
		return undefined;
	}
	if (!chat) {
		return { kind: 'nest', ...append, position: 'over' };
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

/** What screen readers hear once a move moved, and what the error notification says when it was refused or failed. */
interface ISessionsListMoveMessages {
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
			success: localize('sessionsMove.movedToNewSession', "Moved '{0}' to a new session", title),
			failure,
			log,
		};
	}
	if (isReorder(move)) {
		return {
			success: move.destination.after
				? localize('sessionsMove.reorderedAfter', "Moved '{0}' after '{1}'", title, move.destination.after.title.get())
				: localize('sessionsMove.reorderedFirst', "Moved '{0}' to the start", title),
			failure,
			log,
		};
	}
	const target = move.destination.session.title.get();
	return {
		success: localize('sessionsMove.moved', "Moved '{0}' into '{1}'", title, target),
		failure,
		log,
	};
}

/** How the sessions list runs a move. */
export interface ISessionsListMoveOptions {
	/** Called right before the move starts, e.g. to reveal what it moves; the function it returns is called with whether it moved. */
	readonly watch?: (move: SessionsListMove) => (moved: boolean) => void;
}

/**
 * Runs a move started in the sessions list, without asking first, as a reorder does. A success is only announced to
 * screen readers. A refusal or failure is an error notification saying why it was refused (an unexpected failure says
 * only that it failed and logs the details). Resolves whether it moved.
 */
export async function runSessionsListMove(
	move: SessionsListMove,
	sessionsManagementService: ISessionsManagementService,
	notificationService: INotificationService,
	logService: ILogService,
	options?: ISessionsListMoveOptions,
): Promise<boolean> {
	const messages = getSessionsListMoveMessages(move);
	const watched = options?.watch?.(move);
	let moved = false;
	try {
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
		notificationService.error(messages.failure(reason));
	} finally {
		watched?.(moved);
	}
	if (moved) {
		status(messages.success);
	}
	return moved;
}
