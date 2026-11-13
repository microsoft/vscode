/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { stringHash } from '../../../../base/common/hash.js';
import { fillInChatReferenceDragData, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { isAgentHostProvider } from '../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from './sessionsProvidersService.js';

/**
 * Code data transfer mime types specific to the Agents window.
 */
export const SessionsDataTransfers = {
	/** Mime type used to identify a session being dragged within the application. */
	SESSION: 'application/vnd.code.session',
	/** Mime type used to identify a chat being dragged into or between groups within a session. */
	CHAT: 'application/vnd.code.session.chat',
	/** Marks a chat dragged from a standalone pane, readable during dragover. */
	DETACHED_CHAT: 'application/vnd.code.session.chat.detached',
};

/** Keep a small drag-free buffer beside the pane's resize boundaries. */
export function isSessionDragFromPaneEdge(element: HTMLElement, event: MouseEvent): boolean {
	const pane = element.closest<HTMLElement>('.chat-group-view, .session-view');
	if (!pane) {
		return false;
	}
	const bounds = pane.getBoundingClientRect();
	if (bounds.width === 0 || bounds.height === 0) {
		return false;
	}
	const gap = 6;
	return event.clientX < bounds.left + gap || event.clientX > bounds.right - gap
		|| event.clientY < bounds.top + gap || event.clientY > bounds.bottom - gap;
}

/**
 * Identifier used to track a session being dragged via
 * {@link LocalSelectionTransfer}. Mirrors the editor's
 * {@link DraggedEditorIdentifier} pattern.
 */
export class DraggedSessionIdentifier {

	constructor(
		readonly sessionId: string | undefined,
		readonly resource: URI | undefined,
	) { }
}

/** Attach a session placement payload; an absent session represents the empty composer. */
export function fillSessionDragData(event: DragEvent, session: ISession | undefined): void {
	LocalSelectionTransfer.getInstance<DraggedSessionIdentifier>().setData(
		[new DraggedSessionIdentifier(session?.sessionId, session?.resource)],
		DraggedSessionIdentifier.prototype,
	);
	fillSessionDataTransfer(event, session);
}

/**
 * Attaches the session to a drag on the drag's own data only, not on the shared {@link LocalSelectionTransfer}, such as to
 * a drag that is of something else in the window, an editor, whose payload the shared transfer holds.
 */
export function fillSessionDataTransfer(event: DragEvent, session: ISession | undefined): void {
	event.dataTransfer?.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: session?.sessionId, resource: session?.resource.toString() }));
}

/**
 * The group-placement payload carried on a chat drag via the
 * {@link SessionsDataTransfers.CHAT} `dataTransfer` mime. Used to move/split a
 * visible chat between groups or open a hidden chat in a group within a session.
 *
 * This is deliberately carried on the drag event's `dataTransfer` (not on the
 * shared {@link LocalSelectionTransfer} singleton) because a chat-tab drag can
 * also offer a chat *reference* payload, and that reference uses the singleton. The
 * singleton holds only one payload at a time, so relying on it here would let
 * the reference payload clobber the group-move payload (and vice versa). The
 * `dataTransfer` mime keeps the two independent: its `types` are readable during
 * `dragover` (to gate the drop overlay) and its value on `drop`.
 */
export interface IDraggedSessionChat {
	readonly sessionId: string;
	readonly resource: string;
	readonly isDetached?: boolean;
}

/**
 * Attaches the {@link IDraggedSessionChat} group-placement payload to a chat drag.
 */
export function fillSessionChatDragData(e: DragEvent, sessionId: string, resource: URI, isDetached = false): void {
	const data: IDraggedSessionChat = { sessionId, resource: resource.toString(), ...(isDetached ? { isDetached: true } : {}) };
	e.dataTransfer?.setData(SessionsDataTransfers.CHAT, JSON.stringify(data));
	e.dataTransfer?.setData(getSessionChatDragType(sessionId), '');
	if (isDetached) {
		e.dataTransfer?.setData(SessionsDataTransfers.DETACHED_CHAT, '');
	}
}

/**
 * Whether the drag carries a session chat. Reads the `dataTransfer` **types**, so
 * it works during `dragover` (when values are not yet readable).
 */
export function isSessionChatDrag(e: DragEvent, sessionId?: string): boolean {
	if (!e.dataTransfer?.types.includes(SessionsDataTransfers.CHAT)) {
		return false;
	}
	return sessionId === undefined || e.dataTransfer.types.includes(getSessionChatDragType(sessionId));
}

function getSessionChatDragType(sessionId: string): string {
	return `${SessionsDataTransfers.CHAT}.${(stringHash(sessionId, 0) >>> 0).toString(16)}`;
}

/**
 * Reads the {@link IDraggedSessionChat} group-move payload from a drop event.
 * Only meaningful on `drop` (when `dataTransfer` values are readable).
 */
export function getSessionChatDragData(e: DragEvent): IDraggedSessionChat | undefined {
	const raw = e.dataTransfer?.getData(SessionsDataTransfers.CHAT);
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed.sessionId === 'string' && typeof parsed.resource === 'string') {
			return parsed;
		}
	} catch {
		// ignore malformed payloads
	}
	return undefined;
}

/**
 * Attach a chat-reference payload to a drag that stands for a chat in the
 * Agents window, such as of its tab, so it can be dropped into an agent-host
 * chat input to insert an inline `#chat:<title>` reference. The payload carries both the opaque
 * {@link chatResource backend chat URI} — forwarded verbatim into the reference
 * entry — and the {@link clientResource client chat resource} used only for
 * identity comparison, plus the display title. The payload is transient (never
 * persisted), so carrying both resources is fine.
 *
 * The payload is also readable during `dragover`, see {@link fillInChatReferenceDragData}.
 * Callers MUST pair this with `clearChatReferenceDragData` on `dragend`.
 *
 * @param e The in-progress drag event to fill.
 * @param chatResource The referenced chat's opaque backend chat URI (the value
 * carried on `MessageChatAttachment.resource`), forwarded into the reference entry.
 * @param clientResource The sessions-window client chat resource (`IChat.resource`),
 * carried for identity comparison only.
 * @param title The display title; whitespace is collapsed so the inserted
 * `#chat:<title>` token stays on a single line.
 */
export function fillChatReferenceDragData(e: DragEvent, chatResource: URI, clientResource: URI, title: string): void {
	const collapsedTitle = title.replace(/\s+/g, ' ').trim();
	fillInChatReferenceDragData({ chatResource: chatResource.toString(), clientResource: clientResource.toString(), title: collapsedTitle }, e);
}

/**
 * Attach a reference to `chat` of `session` to a drag that stands for the chat, such as of its tab or of its session's
 * row in the sessions list, see {@link fillChatReferenceDragData}. The reference needs the opaque backend chat URI, which
 * only the owning agent-host provider knows: where it is unavailable (not agent-host backed, or state not yet hydrated),
 * the drag simply carries no reference.
 */
export function fillSessionChatReferenceDragData(e: DragEvent, session: ISession, chat: IChat, sessionsProvidersService: ISessionsProvidersService): void {
	const provider = sessionsProvidersService.getProvider(session.providerId, session.sessionId);
	const backendChatResource = provider && isAgentHostProvider(provider) ? provider.getBackendChatResource(chat.resource) : undefined;
	if (backendChatResource) {
		fillChatReferenceDragData(e, backendChatResource, chat.resource, chat.title.get());
	}
}

/**
 * Handles the end of a chat's drag, such as by opening the chat in a window of its own where a drag out of the window
 * ended. Without a chat, the drag is of the session, which stands for the chat it shows. Returns whether it handled it.
 */
export type SessionChatDragEndHandler = (e: DragEvent, offsetElement: HTMLElement, session: ISession, chat: URI | undefined, name: string) => Promise<boolean>;

let sessionChatDragEndHandler: SessionChatDragEndHandler | undefined;

/** Registers what handles the end of a chat's drag; there is one at a time. */
export function registerSessionChatDragEndHandler(handler: SessionChatDragEndHandler): IDisposable {
	sessionChatDragEndHandler = handler;

	return toDisposable(() => {
		if (sessionChatDragEndHandler === handler) {
			sessionChatDragEndHandler = undefined;
		}
	});
}

/** Called where a drag of a chat (or of a session, without `chat`), such as of its tab or its row in the sessions list, ends. */
export function onDidEndSessionChatDrag(e: DragEvent, offsetElement: HTMLElement, session: ISession, chat: URI | undefined, name: string): void {
	sessionChatDragEndHandler?.(e, offsetElement, session, chat, name).catch(onUnexpectedError);
}
