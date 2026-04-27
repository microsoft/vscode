/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { SessionStatus as ProtocolSessionStatus } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ISessionFileDiff } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionFileChange, SessionStatus } from '../../../services/sessions/common/session.js';

/**
 * Maps the protocol-layer session status bitset to the UI-layer
 * {@link SessionStatus} enum used by session adapters.
 */
export function mapProtocolStatus(protocol: ProtocolSessionStatus): SessionStatus {
	if ((protocol & ProtocolSessionStatus.InputNeeded) === ProtocolSessionStatus.InputNeeded) {
		return SessionStatus.NeedsInput;
	}
	if (protocol & ProtocolSessionStatus.InProgress) {
		return SessionStatus.InProgress;
	}
	if (protocol & ProtocolSessionStatus.Error) {
		return SessionStatus.Error;
	}

	return SessionStatus.Completed;
}

/**
 * Converts agent host diffs to the chat session file change format.
 *
 * @param mapUri Optional URI mapper applied after parsing. The remote agent
 *   host provider uses this to rewrite `file:` URIs into agent-host URIs.
 */
export function diffsToChanges(diffs: readonly ISessionFileDiff[], mapUri?: (uri: URI) => URI): IChatSessionFileChange2[] {
	return diffs.map(d => {
		const rawUri = d.after?.uri ?? d.before?.uri;
		if (!rawUri) {
			return undefined;
		}

		const uri = mapUri ? mapUri(URI.parse(rawUri)) : URI.parse(rawUri);

		// For deletions (no `after`), `modifiedUri` is `undefined` so the
		// renderer treats the entry as a deletion and doesn't try to open the
		// (now-missing) file as the "modified" side of the diff editor.
		const modifiedUri = d.after
			? (mapUri ? mapUri(URI.parse(d.after.uri)) : URI.parse(d.after.uri))
			: undefined;

		// Use the before-content reference URI so the diff editor can
		// fetch the snapshot of the file *before* the session's edits.
		let originalUri: URI | undefined;
		if (d.before?.content?.uri) {
			const parsed = URI.parse(d.before.content.uri);
			originalUri = mapUri ? mapUri(parsed) : parsed;
		}

		return {
			uri,
			modifiedUri,
			originalUri,
			insertions: d.diff?.added ?? 0,
			deletions: d.diff?.removed ?? 0,
		} satisfies IChatSessionFileChange2;
	}).filter(isDefined);
}

/**
 * Returns `true` when the current file changes already
 * match the incoming diffs, avoiding unnecessary observable updates.
 */
export function diffsEqual(current: readonly ISessionFileChange[], diffs: readonly ISessionFileDiff[], mapUri?: (uri: URI) => URI): boolean {
	if (current.length !== diffs.length) {
		return false;
	}
	for (let i = 0; i < current.length; i++) {
		const c = current[i];
		const d = diffs[i];
		const rawUri = d.after?.uri ?? d.before?.uri;
		if (!rawUri) {
			continue;
		}
		const parsed = URI.parse(rawUri);
		const diffUri = mapUri ? mapUri(parsed) : parsed;
		const cUri = isIChatSessionFileChange2(c) ? c.uri : c.modifiedUri;
		if (cUri.toString() !== diffUri.toString() || c.insertions !== (d.diff?.added ?? 0) || c.deletions !== (d.diff?.removed ?? 0)) {
			return false;
		}

		const beforeContentUri = d.before?.content?.uri;
		const currentOriginal = c.originalUri?.toString();
		if (beforeContentUri) {
			const parsedBefore = URI.parse(beforeContentUri);
			const mappedBefore = mapUri ? mapUri(parsedBefore) : parsedBefore;
			if (currentOriginal !== mappedBefore.toString()) {
				return false;
			}
		} else if (currentOriginal) {
			return false;
		}
	}
	return true;
}
