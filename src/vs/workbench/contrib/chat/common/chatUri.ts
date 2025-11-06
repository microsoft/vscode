/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer, decodeBase64 } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localChatSessionType } from './chatSessionsService.js';

type ChatSessionIdentifier = {
	readonly chatSessionType: string;
	readonly sessionId: string;
};


export namespace LocalChatSessionUri {

	export const scheme = Schemas.vscodeLocalChatSession;

	export function forSession(sessionId: string): URI {
		return forChatSessionTypeAndId(localChatSessionType, sessionId);
	}

	export function parseLocalSessionId(resource: URI): string | undefined {
		const parsed = parse(resource);
		return parsed?.chatSessionType === localChatSessionType ? parsed.sessionId : undefined;
	}

	/**
	 * @deprecated Does not support non-local sessions
	 */
	export function forChatSessionTypeAndId(chatSessionType: string, sessionId: string): URI {
		const encodedId = encodeBase64(VSBuffer.wrap(new TextEncoder().encode(sessionId)), false, true);
		// TODO: Do we need to encode the authority too?
		return URI.from({ scheme, authority: chatSessionType, path: '/' + encodedId });
	}

	/**
	 * @deprecated Legacy parser that supports non-local sessions.
	 */
	export function parse(resource: URI): ChatSessionIdentifier | undefined {
		if (resource.scheme !== scheme) {
			return undefined;
		}

		if (!resource.authority) {
			return undefined;
		}

		const parts = resource.path.split('/');
		if (parts.length !== 2) {
			return undefined;
		}

		const chatSessionType = resource.authority;
		const decodedSessionId = decodeBase64(parts[1]);
		return { chatSessionType, sessionId: new TextDecoder().decode(decodedSessionId.buffer) };
	}
}

/**
 * Converts a chat session resource URI to a string ID.
 *
 * This exists mainly for backwards compatibility with existing code that uses string IDs in telemetry and storage.
 */
export function chatSessionResourceToId(resource: URI): string {
	// If we have a local session, prefer using just the id part
	const localId = LocalChatSessionUri.parseLocalSessionId(resource);
	if (localId) {
		return localId;
	}

	return resource.toString();
}
