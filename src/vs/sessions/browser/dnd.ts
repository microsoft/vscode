/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';
import { stringHash } from '../../base/common/hash.js';
import { DraggedChatReferenceIdentifier, fillInChatReferenceDragData, LocalSelectionTransfer } from '../../platform/dnd/browser/dnd.js';

/**
 * Code data transfer mime types specific to the Agents window.
 */
export const SessionsDataTransfers = {
	/** Mime type used to identify a session being dragged within the application. */
	SESSION: 'application/vnd.code.session',
	/** Mime type used to identify a chat being dragged between groups within a session. */
	CHAT: 'application/vnd.code.session.chat',
};

/**
 * Identifier used to track a session being dragged via
 * {@link LocalSelectionTransfer}. Mirrors the editor's
 * {@link DraggedEditorIdentifier} pattern.
 */
export class DraggedSessionIdentifier {

	constructor(
		readonly sessionId: string,
		readonly resource: URI,
	) { }
}

/**
 * The group-move payload carried on a chat-tab drag via the
 * {@link SessionsDataTransfers.CHAT} `dataTransfer` mime. Used to move/split a
 * chat between chat groups within a session.
 *
 * This is deliberately carried on the drag event's `dataTransfer` (not on the
 * shared {@link LocalSelectionTransfer} singleton) because a chat-tab drag also
 * offers a chat *reference* payload, and that reference uses the singleton. The
 * singleton holds only one payload at a time, so relying on it here would let
 * the reference payload clobber the group-move payload (and vice versa). The
 * `dataTransfer` mime keeps the two independent: its `types` are readable during
 * `dragover` (to gate the drop overlay) and its value on `drop`.
 */
export interface IDraggedSessionChat {
	readonly sessionId: string;
	readonly resource: string;
}

/**
 * Attaches the {@link IDraggedSessionChat} group-move payload to a chat-tab drag.
 */
export function fillSessionChatDragData(e: DragEvent, sessionId: string, resource: URI): void {
	const data: IDraggedSessionChat = { sessionId, resource: resource.toString() };
	e.dataTransfer?.setData(SessionsDataTransfers.CHAT, JSON.stringify(data));
	e.dataTransfer?.setData(getSessionChatDragType(sessionId), '');
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
 * Shared local transfer for an in-process chat-reference drag. Unlike the
 * `dataTransfer` mime payload it is readable during `dragover`, so the drop
 * target can gate the overlay (e.g. suppress it for a self-reference) before the
 * drop lands.
 */
const chatReferenceTransfer = LocalSelectionTransfer.getInstance<DraggedChatReferenceIdentifier>();

/**
 * Attach a chat-reference payload to a drag started from a chat tab in the
 * Agents window, so it can be dropped into an agent-host chat input to insert an
 * inline `#chat:<title>` reference. The payload carries both the opaque
 * {@link chatResource backend chat URI} — forwarded verbatim into the reference
 * entry — and the {@link clientResource client chat resource} used only for
 * identity comparison, plus the display title. The payload is transient (never
 * persisted), so carrying both resources is fine.
 *
 * Populates both the `dataTransfer` mime payload (read on drop) and an in-process
 * {@link LocalSelectionTransfer} (readable during `dragover`). Callers MUST pair
 * this with {@link clearChatReferenceDragData} on `dragend`.
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
	const chatResourceString = chatResource.toString();
	const clientResourceString = clientResource.toString();
	fillInChatReferenceDragData({ chatResource: chatResourceString, clientResource: clientResourceString, title: collapsedTitle }, e);
	chatReferenceTransfer.setData([new DraggedChatReferenceIdentifier(chatResourceString, clientResourceString, collapsedTitle)], DraggedChatReferenceIdentifier.prototype);
}

/**
 * Clears the in-process chat-reference local transfer set by
 * {@link fillChatReferenceDragData}. Call on `dragend` so a stale reference does
 * not leak into a later, unrelated drag.
 */
export function clearChatReferenceDragData(): void {
	chatReferenceTransfer.clearData(DraggedChatReferenceIdentifier.prototype);
}
