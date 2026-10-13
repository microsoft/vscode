/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import type { URI as ResourceURI } from '../../../base/common/uri.js';
import type { URI as ProtocolURI } from './state/sessionState.js';

/**
 * The default chat VS Code minted for `session` before default chats were
 * recorded and advertised: `ahp-chat://default/<base64url(session)>`, with
 * unpadded URL-safe base64.
 *
 * This is a FROZEN compatibility format. It must reproduce exactly what VS Code
 * previously minted and must never change, even when the scheme that mints new
 * default chats does. It is the only legacy derivation of a default chat: the
 * host calls it only for a legacy source that records no default chat (a
 * catalog without a header, a payload without a default entry, a legacy
 * subagent or provider-native session) after every recorded source was
 * consulted, and records the result; a client calls it only through
 * `getOlderHostDefaultChat`, when the protocol client fills the default chat
 * an older VS Code host did not advertise.
 */
export function deriveLegacyDefaultChat(session: ProtocolURI | ResourceURI): ProtocolURI {
	const encoded = encodeBase64(VSBuffer.fromString(session.toString()), false, true);
	return `ahp-chat://default/${encoded}`;
}
