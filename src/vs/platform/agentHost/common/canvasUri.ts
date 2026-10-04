/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';
import { parseChatUri } from './state/sessionState.js';

export const AHP_CANVAS_SCHEME = 'ahp-canvas';

/** Builds a local host canvas channel with its owning chat and lifetime identifier. */
export function buildCanvasUri(chat: URI, id: string): URI {
	return URI.from({
		scheme: AHP_CANVAS_SCHEME,
		path: `/${encodeBase64(VSBuffer.fromString(chat.toString()), false, true)}/${id}`,
	});
}

/** Reads ownership from a locally constructed canvas channel, not a remote host's URI. */
export function parseCanvasChatUri(resource: URI): URI | undefined {
	if (resource.scheme !== AHP_CANVAS_SCHEME || resource.authority !== '' || resource.query !== '' || resource.fragment !== '') {
		return undefined;
	}
	const [, encodedChat, id, extra] = resource.path.split('/');
	if (!encodedChat || !id || extra !== undefined) {
		return undefined;
	}
	try {
		const chat = URI.parse(decodeBase64(encodedChat).toString(), true);
		return parseChatUri(chat) ? chat : undefined;
	} catch {
		return undefined;
	}
}
