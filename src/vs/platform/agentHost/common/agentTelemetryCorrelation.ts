/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { hash, StringSHA1 } from '../../../base/common/hash.js';
import { escapeRegExpCharacters } from '../../../base/common/strings.js';
import type { URI } from '../../../base/common/uri.js';
import { DEFAULT_CHAT_ID, parseChatUri } from './state/sessionState.js';

/** Correlates migration diagnostics without emitting the backend session URI. */
export function getTelemetryMigrationSessionId(session: URI): string {
	const hash = new StringSHA1();
	hash.update(session.toString());
	return hash.digest();
}

/** Removes the migrating session's identifiers before the telemetry service applies its general error cleaning. */
export function getTelemetryMigrationErrorMessage(error: unknown, session: URI): string | undefined {
	if (error === undefined) {
		return undefined;
	}
	const sessionId = session.path.startsWith('/') ? session.path.substring(1) : session.path;
	const identifiers = new Set([session.toString(), session.toString(true), sessionId, encodeURIComponent(sessionId)]);
	const alternatives = [...identifiers].filter(value => value.length > 0).sort((a, b) => b.length - a.length).map(escapeRegExpCharacters).join('|');
	// Frontend and backend schemes differ, but carry the same session identifier.
	return toErrorMessage(error).replace(new RegExp(`(?:[a-z][a-z0-9+.-]*:\\/+)?(?:${alternatives})`, 'gi'), '[REDACTED: session]');
}

/** Hashes the chat identifier within its owning session; correlate it with the session identifier, not on its own. */
export function getTelemetryChatSessionId(chat: string | URI): string {
	return String(hash(parseChatUri(chat)?.chatId ?? DEFAULT_CHAT_ID));
}
