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
 *
 * @param knownEncoded The producer is known to base64-encode `data` (e.g. a
 * VS Code-specific mime type), so it is decoded whenever possible instead of
 * being checked against the raw-text heuristic.
 */
export function decodeTextBlobAttachmentData(data: string, knownEncoded: boolean): string {
	if (!data) {
		return '';
	}
	const dataUrlMatch = /^data:[^,]*?(?<base64>;base64)?,(?<payload>[\s\S]*)$/i.exec(data);
	if (dataUrlMatch?.groups) {
		const { base64, payload } = dataUrlMatch.groups;
		if (base64) {
			return decodeBase64Text(payload.replace(/[\t\n\v\f\r ]+/g, '')) ?? payload;
		}
		try {
			return decodeURIComponent(payload);
		} catch {
			return payload;
		}
	}
	const unwrapped = data.replace(/[\r\n]+/g, '');
	return (knownEncoded ? decodeBase64Text(unwrapped) : tryDecodeBase64Text(unwrapped)) ?? data;
}

const base64TextPattern = /^(?<body>[A-Za-z0-9+/_-]*)(?<padding>={0,2})$/;
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Whether `body` and `padding` are what an encoder would produce: the body is
 * non-empty with a possible length, the unused low bits of its last character
 * are zero, and any padding completes the final 4-character group.
 */
function isCanonicalBase64(body: string, padding: string): boolean {
	const remainder = body.length % 4;
	if (body.length === 0 || remainder === 1 || (padding.length > 0 && (remainder + padding.length) !== 4)) {
		return false;
	}
	if (remainder === 0) {
		return true;
	}
	const last = body[body.length - 1];
	const value = base64Alphabet.indexOf(last === '-' ? '+' : last === '_' ? '/' : last);
	return (value & (remainder === 2 ? 0b1111 : 0b11)) === 0;
}

/**
 * Decodes base64 that is known to be encoded text, replacing invalid UTF-8
 * sequences. Returns `undefined` only when `payload` is not base64 at all.
 */
function decodeBase64Text(payload: string): string | undefined {
	try {
		return new TextDecoder('utf-8', { ignoreBOM: true }).decode(decodeBase64(payload).buffer);
	} catch {
		return undefined;
	}
}

/**
 * Decodes `payload` only when it is canonical base64 of valid UTF-8, which
 * output of VS Code's own encoder always is. Returns `undefined` otherwise so
 * callers can treat it as raw unencoded text (e.g. `README` or `a=b`) instead
 * of producing garbage.
 */
function tryDecodeBase64Text(payload: string): string | undefined {
	const groups = base64TextPattern.exec(payload)?.groups;
	if (!groups || !isCanonicalBase64(groups.body, groups.padding)) {
		return undefined;
	}
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(decodeBase64(groups.body).buffer);
	} catch {
		return undefined;
	}
}

/**
 * Normalizes a `blob` attachment's `data` field for binary/embedded resources
 * by stripping a leading `data:...;base64,` prefix and the line breaks of
 * line-wrapped base64. Line breaks are only removed when the result is
 * canonical base64; other payloads, including raw text with spaces such as
 * `not base64`, are kept as-is so consumers fail to decode them and fall back
 * instead of producing garbage bytes.
 */
export function normalizeBase64AttachmentData(data: string): string {
	if (!data) {
		return '';
	}
	const dataUrlMatch = /^data:[^,]*;base64,(?<payload>[\s\S]*)$/i.exec(data);
	const raw = dataUrlMatch?.groups?.payload ?? data;
	const unwrapped = raw.replace(/[\r\n]+/g, '');
	const groups = base64TextPattern.exec(unwrapped)?.groups;
	return groups && isCanonicalBase64(groups.body, groups.padding) ? unwrapped : raw;
}
