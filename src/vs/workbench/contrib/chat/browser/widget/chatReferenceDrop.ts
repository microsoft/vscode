/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatReferenceTransferData } from '../../../../../platform/dnd/browser/dnd.js';
import { createChatReferenceVariableEntry, IChatRequestChatReferenceVariableEntry } from '../../common/attachments/chatVariableEntries.js';

/**
 * Parses a drag-payload resource, returning `undefined` when it is malformed.
 *
 * The `dataTransfer` payload is JSON supplied by whatever initiated the drag, so
 * it is ultimately untrusted: `URI.parse` throws on some malformed input (an
 * illegal scheme, or a path that conflicts with an authority) even in its
 * non-strict mode. These guards run from `dragover`, where an exception would
 * break drop feedback for *every* drag type, so parse defensively.
 */
function tryParseUri(value: string): URI | undefined {
	try {
		return URI.parse(value);
	} catch {
		return undefined;
	}
}

/**
 * Whether a dragged chat reference points at the drop target's *own* chat, i.e.
 * a chat dropped onto its own input. The comparison is on the sessions-window
 * **client** chat resources (opaque identity, never parsed by this layer), so a
 * peer chat of the same session — or any chat of another session — is not
 * treated as a self-reference and remains droppable. A self-reference is a
 * no-op, so the caller suppresses the drop overlay entirely rather than showing
 * a "looks droppable but isn't" hint.
 *
 * Fails closed: a resource that cannot be parsed is reported as a
 * self-reference, so a malformed payload is never droppable.
 *
 * @param droppedClientResource The dragged chat's client resource (`IChat.resource`).
 * @param ownClientResource The drop-target chat's client resource (its session resource).
 */
export function isSelfChatReferenceDrop(droppedClientResource: string, ownClientResource: string): boolean {
	const dropped = tryParseUri(droppedClientResource);
	const own = tryParseUri(ownClientResource);
	if (!dropped || !own) {
		return true;
	}
	return isEqual(dropped, own);
}

/**
 * Whether a dragged chat reference originates from a *different agent host* than
 * the drop target. A chat reference may cross *sessions* but MUST NOT cross
 * *agent hosts*: only the owning host can map the referenced client resource
 * back to its opaque backend chat URI on send, so a cross-host reference could
 * never be resolved.
 *
 * Host identity is derived from the client resource's **scheme and authority
 * only** (e.g. local `agent-host-copilotcli` vs remote
 * `remote-<authority>-copilotcli`); paths and fragments — which identify the
 * session and chat within a host — are never parsed. A cross-host drag is a
 * no-op, so the caller suppresses the drop overlay entirely.
 *
 * Fails closed: a resource that cannot be parsed is reported as cross-host, so a
 * malformed payload is never droppable.
 *
 * @param droppedClientResource The dragged chat's client resource (`IChat.resource`).
 * @param ownClientResource The drop-target chat's client resource (its session resource).
 */
export function isCrossAgentHostChatReferenceDrop(droppedClientResource: string, ownClientResource: string): boolean {
	const dropped = tryParseUri(droppedClientResource);
	const own = tryParseUri(ownClientResource);
	if (!dropped || !own) {
		return true;
	}
	return dropped.scheme !== own.scheme || dropped.authority !== own.authority;
}

/**
 * Resolves a dropped chat-reference payload to a plain chat-reference attachment
 * entry (an input pill) — the same shape every other drop type produces, with no
 * inline text, range, or editor manipulation. The entry carries the payload's
 * **opaque backend** `chatResource` verbatim (never parsed) and the payload
 * title as its display name, and deliberately has **no `range`** — that is what
 * makes it a plain attachment rather than an inline `#chat:` token.
 *
 * Returns `undefined` when a guard rejects the drop: the drop target must be an
 * agent-host chat (`ownClientResource` is `undefined` otherwise), a
 * self-reference (dropped onto its own input) or a cross-agent-host reference is
 * a no-op, and a malformed payload resource is never droppable. The client
 * resources are compared by identity only.
 *
 * @param data The dragged chat-reference payload (opaque `chatResource`, client `clientResource`, and `title`).
 * @param ownClientResource The drop-target chat's client resource, or `undefined` when the target is not an agent-host chat.
 */
export function resolveChatReferenceDropEntry(data: ChatReferenceTransferData, ownClientResource: string | undefined): IChatRequestChatReferenceVariableEntry | undefined {
	if (ownClientResource === undefined) {
		return undefined;
	}
	if (isSelfChatReferenceDrop(data.clientResource, ownClientResource)
		|| isCrossAgentHostChatReferenceDrop(data.clientResource, ownClientResource)) {
		return undefined;
	}
	const chatResource = tryParseUri(data.chatResource);
	if (!chatResource) {
		return undefined;
	}
	return createChatReferenceVariableEntry(chatResource, undefined, data.title);
}
