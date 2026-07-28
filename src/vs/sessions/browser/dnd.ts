/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../base/common/uri.js';
import { DraggedChatReferenceIdentifier, fillInChatReferenceDragData, LocalSelectionTransfer } from '../../platform/dnd/browser/dnd.js';

/**
 * Code data transfer mime types specific to the Agents window.
 */
export const SessionsDataTransfers = {
	/** Mime type used to identify a session being dragged within the application. */
	SESSION: 'application/vnd.code.session',
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
