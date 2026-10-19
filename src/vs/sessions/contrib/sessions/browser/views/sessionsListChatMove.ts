/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { ListViewTargetSector } from '../../../../../base/browser/ui/list/listView.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { localize } from '../../../../../nls.js';
import { ChatMoveSettingId } from '../../../../../platform/agentHost/common/agentHostChatMove.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChatMoveTarget, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

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
 * session of the same provider that holds several chats.
 */
export function canMoveIntoSession(source: ISession, target: ISession): boolean {
	return target.sessionId !== source.sessionId
		&& target.providerId === source.providerId
		&& !target.isArchived.get()
		&& target.status.get() !== SessionStatus.Untitled
		&& target.capabilities.get().supportsMultipleChats;
}

/**
 * The chat a moved chat is placed after to append it to `session`: its last chat that is not a tool's subagent chat
 * nor `exclude` (the moved chat, when it is already in `session`).
 */
export function getChatMoveAppendAnchor(session: ISession, exclude?: IChat): IChat | undefined {
	const chats = session.chats.get();
	for (let i = chats.length - 1; i >= 0; i--) {
		if (chats[i].origin?.kind !== ChatOriginKind.Tool && chats[i].resource.toString() !== exclude?.resource.toString()) {
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

/** A chat reorder: the chat the dragged chat goes after (`undefined`: first) and the resulting order. */
export interface IChatReorder {
	readonly after: string | undefined;
	readonly order: readonly string[];
}

/**
 * Reorders `dragged` to sit before the item at `insertIndex` (`order.length`: last) of `order`. `undefined` when
 * `dragged` is not in `order` or the drop would leave it where it is.
 */
export function getChatReorder(order: readonly string[], dragged: string, insertIndex: number): IChatReorder | undefined {
	const draggedIndex = order.indexOf(dragged);
	if (draggedIndex === -1 || insertIndex < 0 || insertIndex > order.length || insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
		return undefined;
	}
	const rest = order.filter(id => id !== dragged);
	const index = insertIndex > draggedIndex ? insertIndex - 1 : insertIndex;
	return {
		after: index === 0 ? undefined : rest[index - 1],
		order: [...rest.slice(0, index), dragged, ...rest.slice(index)],
	};
}

/**
 * Where the pointer is in the sessions list during a chat drag: over the row of `session` (`chat` undefined), over its
 * nested chat row `chat`, or over no session (`session` undefined: empty space, a section or folder header, ...).
 */
export interface ISessionsListChatDropTarget {
	readonly session: ISession | undefined;
	readonly chat: IChat | undefined;
	/** The chat rows `session` shows under its row, in order; empty when collapsed. Its main chat is its own row. */
	readonly chatRows: readonly IChat[];
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

	const rows = [session.mainChat.get(), ...target.chatRows];
	const index = rows.findIndex(row => row.resource.toString() === target.chat!.resource.toString());
	if (index === -1) {
		return undefined;
	}
	const insertIndex = target.position === 'before' ? index : index + 1;
	const ids = rows.map(row => row.resource.toString());
	const draggedId = chat.resource.toString();
	let after: IChat | undefined;
	if (isOwnSession && ids.includes(draggedId)) {
		const reorder = getChatReorder(ids, draggedId, insertIndex);
		if (!reorder) {
			return undefined;
		}
		after = rows.find(row => row.resource.toString() === reorder.after);
		if (!changesChatOrder(session, chat, after)) {
			return undefined;
		}
	} else {
		after = rows[insertIndex - 1];
	}
	return { kind: 'session', session, after, position: target.position };
}

/**
 * Where the pointer is in the sessions list while dragging a whole session that can move under another session: over
 * the row of `session` (`chat` undefined) or over its nested chat row `chat`, in quarter `quarter` of the row.
 */
export interface ISessionsListSessionDropTarget {
	readonly session: ISession;
	readonly chat: IChat | undefined;
	/** The chat rows `session` shows under its row, in order; empty when collapsed. Its main chat is its own row. */
	readonly chatRows: readonly IChat[];
	readonly quarter: ListViewTargetSector;
	/** Whether `session` is in a section the user orders by hand: Pinned or a custom group. */
	readonly manuallyOrdered: boolean;
	/** Whether the row is the last one its section shows: its last session's row, or that session's last chat row. */
	readonly lastInSection: boolean;
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
 * - on the top or bottom half of a session's nested chat row: under that session, before or after that row.
 * In Pinned and custom groups, whose sessions the user orders by hand, the top quarter of a session's row places it
 * before that session, and the bottom quarter of the section's last row places it after the section's last session.
 */
export function getSessionsListSessionDrop(source: ISession, target: ISessionsListSessionDropTarget): SessionsListSessionDrop | undefined {
	const { session, chat, quarter } = target;
	if (target.manuallyOrdered && !chat && quarter === ListViewTargetSector.TOP) {
		return { kind: 'place', session, position: 'before' };
	}
	if (target.manuallyOrdered && target.lastInSection && quarter === ListViewTargetSector.BOTTOM) {
		return { kind: 'place', session, position: 'after' };
	}
	if (!canMoveIntoSession(source, session)) {
		return undefined;
	}
	if (!chat) {
		return { kind: 'nest', session, after: getChatMoveAppendAnchor(session), position: 'over' };
	}
	const rows = [session.mainChat.get(), ...target.chatRows];
	const index = rows.findIndex(row => row.resource.toString() === chat.resource.toString());
	if (index <= 0) {
		return undefined;
	}
	const position = quarter === ListViewTargetSector.TOP || quarter === ListViewTargetSector.CENTER_TOP ? 'before' : 'after';
	return { kind: 'nest', session, after: rows[position === 'before' ? index - 1 : index], position };
}

/** A move started by dropping in the sessions list: a chat to another place, or a single-chat session under another session. */
export type SessionsListMove =
	| { readonly kind: 'chat'; readonly session: ISession; readonly chat: IChat; readonly destination: ISessionChatMoveTarget }
	| { readonly kind: 'session'; readonly session: ISession; readonly destination: ISession; readonly after: IChat | undefined };

/** Whether `move` reorders a chat within its own session, which needs no confirmation. */
function isReorder(move: SessionsListMove): boolean {
	return move.kind === 'chat' && move.destination.kind === 'session' && move.destination.session.sessionId === move.session.sessionId;
}

/** The question confirming `move`, or `undefined` for a reorder within a session, which isn't confirmed. */
export function getSessionsListMoveConfirmation(move: SessionsListMove): string | undefined {
	if (move.kind === 'session') {
		return localize('sessionsMove.confirmSession', "Are you sure you want to move session '{0}' into '{1}'?", move.session.title.get(), move.destination.title.get());
	}
	if (move.destination.kind === 'newSession') {
		return localize('sessionsMove.confirmPromote', "Are you sure you want to move '{0}' to a new session?", move.chat.title.get());
	}
	if (isReorder(move)) {
		return undefined;
	}
	return localize('sessionsMove.confirmChat', "Are you sure you want to move '{0}' into '{1}'?", move.chat.title.get(), move.destination.session.title.get());
}

/** What the sessions list says when `move` failed or was refused for `reason`. */
export function getSessionsListMoveFailure(move: SessionsListMove, reason: string): string {
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
 * Runs a move dropped in the sessions list. Unless it reorders a chat within its session, it first asks for
 * confirmation while {@link ChatMoveSettingId.ConfirmDragAndDrop} is on; "Do not ask me again" turns that off. A move
 * that fails or is refused shows why; a move that succeeds shows nothing (the list shows the result) and is only
 * announced to screen readers. Resolves whether it moved.
 */
export async function runSessionsListMove(
	move: SessionsListMove,
	sessionsManagementService: ISessionsManagementService,
	dialogService: IDialogService,
	configurationService: IConfigurationService,
	notificationService: INotificationService,
): Promise<boolean> {
	const confirmation = configurationService.getValue<boolean>(ChatMoveSettingId.ConfirmDragAndDrop) !== false ? getSessionsListMoveConfirmation(move) : undefined;
	if (confirmation) {
		const result = await dialogService.confirm({
			message: confirmation,
			checkbox: { label: localize('sessionsMove.doNotAskAgain', "Do not ask me again") },
			primaryButton: localize({ key: 'sessionsMove.moveButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Move"),
		});
		if (!result.confirmed) {
			return false;
		}
		if (result.checkboxChecked === true) {
			try {
				await configurationService.updateValue(ChatMoveSettingId.ConfirmDragAndDrop, false);
			} catch (error) {
				// The user confirmed the move: make it, though the next one asks again.
				onUnexpectedError(error);
			}
		}
	}
	try {
		if (move.kind === 'session') {
			await sessionsManagementService.moveSessionUnder(move.session, move.destination, move.after);
		} else {
			await sessionsManagementService.moveChat(move.session, move.chat, move.destination);
		}
	} catch (error) {
		notificationService.warn(getSessionsListMoveFailure(move, toErrorMessage(error)));
		return false;
	}
	status(getSessionsListMoveSuccess(move));
	return true;
}
