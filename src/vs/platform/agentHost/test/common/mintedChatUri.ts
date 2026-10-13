/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { AHP_CHAT_SCHEME, isDefaultChatUri } from '../../common/state/sessionState.js';

/**
 * Test fakes stand in for a host's chat records with the session a test
 * minted its chat URI for. Production code never derives owners this way.
 */
export function mintedTestChatOwner(chat: URI | string): string | undefined {
	let parsed: URI;
	try {
		parsed = typeof chat === 'string' ? URI.parse(chat) : chat;
	} catch {
		return undefined;
	}
	const [encodedSession] = parsed.path.replace(/^\//, '').split('/');
	if (parsed.scheme !== AHP_CHAT_SCHEME || !parsed.authority || !encodedSession) {
		return undefined;
	}
	try {
		return decodeBase64(encodedSession).toString();
	} catch {
		return undefined;
	}
}

/** {@link mintedTestChatOwner} for a chat URI the test is known to have minted. */
export function requireMintedTestChatOwner(chat: URI | string): string {
	const owner = mintedTestChatOwner(chat);
	if (owner === undefined) {
		throw new Error(`Not a minted test chat URI: ${chat.toString()}`);
	}
	return owner;
}

/** The storage a host records for a chat the test minted: its session for a default chat, otherwise the chat itself. */
export function mintedTestChatStorage(chat: URI | string): URI {
	return isDefaultChatUri(chat.toString()) ? URI.parse(requireMintedTestChatOwner(chat)) : URI.parse(chat.toString());
}
