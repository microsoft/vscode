/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringSHA1 } from '../../../base/common/hash.js';
import { URI } from '../../../base/common/uri.js';
import { getAgentHostChatId, getCanonicalOpaqueChatUuid, parseChatUri } from './state/sessionState.js';

/** Whether `resource` has the legacy shape that encodes its minting session (`ahp-chat://<chatId>/<base64(session)>`). */
export function isShapedChatUri(resource: URI | string): boolean {
	return parseChatUri(resource) !== undefined;
}

/**
 * Formats a name-based (version 5, RFC 4122 variant) UUID from the SHA-1 of
 * `name`, so the same name always yields the same UUID.
 */
export function uuidFromSha1(name: string): string {
	const sha = new StringSHA1();
	sha.update(name);
	const hex = sha.digest();
	const timeHighAndVersion = ((parseInt(hex.slice(12, 16), 16) & 0x0fff) | 0x5000).toString(16).padStart(4, '0');
	const clockSequenceAndVariant = ((parseInt(hex.slice(16, 20), 16) & 0x3fff) | 0x8000).toString(16).padStart(4, '0');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${timeHighAndVersion}-${clockSequenceAndVariant}-${hex.slice(20, 32)}`;
}

export { getAgentHostChatId, getCanonicalOpaqueChatUuid };
