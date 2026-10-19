/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../base/common/buffer.js';
import type { SimpleMessageAttachment } from '../../common/state/protocol/state.js';

const attachmentDisplayKindParameter = 'x-vscode-display-kind=';
const simpleAttachmentMimeType = 'text/x-vscode-simple-attachment';

export function addSimpleAttachmentDisplayKindToMimeType(attachment: SimpleMessageAttachment): string {
	return addAttachmentDisplayKindToMimeType(attachment.displayKind);
}

export function addAttachmentDisplayKindToMimeType(displayKind: string | undefined): string {
	if (displayKind === undefined) {
		return 'text/plain';
	}
	return `${simpleAttachmentMimeType}; ${attachmentDisplayKindParameter}${encodeURIComponent(displayKind)}`;
}

export function readSimpleAttachmentDisplayKindFromMimeType(mimeType: string): string | undefined {
	const parameter = mimeType.split(';').map(part => part.trim()).find(part => part.startsWith(attachmentDisplayKindParameter));
	if (!parameter) {
		return undefined;
	}
	try {
		return decodeURIComponent(parameter.slice(attachmentDisplayKindParameter.length));
	} catch {
		return undefined;
	}
}

/**
 * Decodes a `blob` attachment's `data` field for a text/simple attachment.
 * Handles standard/URL-safe base64, line-wrapped base64, `data:` URLs, and
 * legacy/external sessions that persisted raw unencoded text in `data`.
 */
export function decodeTextBlobAttachmentData(data: string): string {
	if (!data) {
		return '';
	}
	const dataUrlMatch = /^data:[^,]*?(?<base64>;base64)?,(?<payload>[\s\S]*)$/i.exec(data);
	if (dataUrlMatch?.groups) {
		const { base64, payload } = dataUrlMatch.groups;
		if (base64) {
			return tryDecodeBase64Text(payload.replace(/[\t\n\v\f\r ]+/g, '')) ?? payload;
		}
		try {
			return decodeURIComponent(payload);
		} catch {
			return payload;
		}
	}
	return tryDecodeBase64Text(data.replace(/[\r\n]+/g, '')) ?? data;
}

const base64TextPattern = /^(?<body>[A-Za-z0-9+/_-]*)={0,2}$/;
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// C0 controls that do not occur in real text. Tab, newlines, BEL, BS, VT, FF and ESC are allowed (e.g. terminal output).
const unexpectedControlCharacterPattern = /[\u0000-\u0006\u000E-\u001A\u001C-\u001F]/;

/**
 * Whether `body` (base64 without padding) is what an encoder would produce:
 * its length is possible and the unused low bits of the last character are zero.
 */
function isCanonicalBase64(body: string): boolean {
	const remainder = body.length % 4;
	if (remainder === 0) {
		return true;
	}
	if (remainder === 1) {
		return false;
	}
	const last = body[body.length - 1];
	const value = base64Alphabet.indexOf(last === '-' ? '+' : last === '_' ? '/' : last);
	return (value & (remainder === 2 ? 0b1111 : 0b11)) === 0;
}

/**
 * Decodes base64-encoded UTF-8 text. Returns `undefined` when `payload` is not
 * canonical base64 or does not decode to plausible UTF-8 text, so callers can
 * treat it as raw unencoded text (e.g. `README` or `a=b`) instead of producing
 * garbage.
 */
function tryDecodeBase64Text(payload: string): string | undefined {
	const body = base64TextPattern.exec(payload)?.groups?.body;
	if (body === undefined || !isCanonicalBase64(body)) {
		return undefined;
	}
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decodeBase64(body).buffer);
	} catch {
		return undefined;
	}
	return unexpectedControlCharacterPattern.test(text) ? undefined : text;
}

/**
 * Normalizes a `blob` attachment's `data` field for binary/embedded resources
 * by stripping a leading `data:...;base64,` prefix and ASCII whitespace when
 * the payload is otherwise valid base64.
 */
export function normalizeBase64AttachmentData(data: string): string {
	if (!data) {
		return '';
	}
	const dataUrlMatch = /^data:[^,]*;base64,(?<payload>[\s\S]*)$/i.exec(data);
	const raw = dataUrlMatch?.groups?.payload ?? data;
	return /^[A-Za-z0-9+/_=\s-]+$/.test(raw) ? raw.replace(/\s+/g, '') : raw;
}
