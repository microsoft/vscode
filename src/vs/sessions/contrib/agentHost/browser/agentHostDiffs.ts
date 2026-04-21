/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { SessionStatus as ProtocolSessionStatus } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ISessionFileDiff } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IChatSessionFileChange } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';

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
export function diffsToChanges(diffs: readonly ISessionFileDiff[], mapUri?: (uri: URI) => URI): IChatSessionFileChange[] {
	return diffs.map(d => {
		const uri = d.after?.uri || d.before?.uri;
		if (!uri) {
			return undefined;
		}

		const modifiedUri = mapUri ? mapUri(URI.parse(uri)) : URI.parse(uri);

		// Use the before-content reference URI so the diff editor can
		// fetch the snapshot of the file *before* the session's edits.
		let originalUri: URI | undefined;
		if (d.before?.content?.uri) {
			const parsed = URI.parse(d.before.content.uri);
			originalUri = mapUri ? mapUri(parsed) : parsed;
		}

		return {
			modifiedUri,
			originalUri,
			insertions: d.diff?.added ?? 0,
			deletions: d.diff?.removed ?? 0,
		};
	}).filter(isDefined);
}

/**
 * Returns `true` when the current file changes already
 * match the incoming diffs, avoiding unnecessary observable updates.
 */
export function diffsEqual(current: readonly IChatSessionFileChange[], diffs: readonly ISessionFileDiff[], mapUri?: (uri: URI) => URI): boolean {
	if (current.length !== diffs.length) {
		return false;
	}
	for (let i = 0; i < current.length; i++) {
		const c = current[i];
		const d = diffs[i];
		const uri = d.after?.uri || d.before?.uri;
		if (!uri) {
			continue;
		}
		const parsed = URI.parse(uri);
		const diffUri = mapUri ? mapUri(parsed) : parsed;
		if (c.modifiedUri.toString() !== diffUri.toString() || c.insertions !== (d.diff?.added ?? 0) || c.deletions !== (d.diff?.removed ?? 0)) {
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
