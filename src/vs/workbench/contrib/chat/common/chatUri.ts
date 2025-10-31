/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer, decodeBase64 } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localChatSessionType } from './chatSessionsService.js';

export type ChatSessionIdentifier = {
	readonly chatSessionType: string;
	readonly sessionId: string;
};


export namespace LocalChatSessionUri {

	export const scheme = Schemas.vscodeLocalChatSession;

	export function forSession(sessionId: string): URI {
		return forChatSessionTypeAndId(localChatSessionType, sessionId);
	}

	/**
	 * @deprecated Does not support non-local sessions
	 */
	export function forChatSessionTypeAndId(chatSessionType: string, sessionId: string): URI {
		const encodedId = encodeBase64(VSBuffer.wrap(new TextEncoder().encode(sessionId)), false, true);
		// TODO: Do we need to encode the authority too?
		return URI.from({ scheme, authority: chatSessionType, path: '/' + encodedId });
	}

	export function parseLocalSessionId(resource: URI): string | undefined {
		const parsed = parse(resource);
		return parsed?.chatSessionType === localChatSessionType ? parsed.sessionId : undefined;
	}

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
