/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';
import { isAhpChatChannel } from './state/sessionState.js';

export const AHP_CANVAS_SCHEME = 'ahp-canvas';

/** Whether `resource` is a single-segment Canvas channel this host can preserve exactly. */
export function isCanvasChannel(resource: string): boolean {
	const match = /^ahp-canvas:\/([A-Za-z0-9._~-]+)$/.exec(resource);
	return !!match && match[1] !== '.' && match[1] !== '..';
}

/** Builds a local host canvas channel with its owning chat and lifetime identifier. */
export function buildCanvasUri(chat: URI, id: string): URI {
	return URI.from({
		scheme: AHP_CANVAS_SCHEME,
		path: `/${encodeBase64(VSBuffer.fromString(JSON.stringify([chat.toString(), id])), false, true)}`,
	});
}

/** Reads ownership from a locally constructed canvas channel, not a remote host's URI. */
export function parseCanvasChatUri(resource: URI): URI | undefined {
	return parseCanvasUri(resource)?.chat;
}

/** Reads the chat and client identifier from a locally constructed canvas channel. */
export function parseCanvasUri(resource: URI): { readonly chat: URI; readonly id: string } | undefined {
	if (resource.scheme !== AHP_CANVAS_SCHEME || resource.authority !== '' || resource.query !== '' || resource.fragment !== '') {
		return undefined;
	}
	const [, encoded] = resource.path.split('/');
	if (!encoded || resource.path.split('/').length !== 2) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(decodeBase64(encoded).toString());
		if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') {
			return undefined;
		}
		const chat = URI.parse(parsed[0], true);
		return isAhpChatChannel(chat.toString()) ? { chat, id: parsed[1] } : undefined;
	} catch {
		return undefined;
	}
}
