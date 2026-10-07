/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { SessionStatus as ProtocolSessionStatus, type ChangesetFile } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { normalizeFileEdit } from '../../../../../platform/agentHost/common/fileEditDiff.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { readChangesetFileMeta } from '../../../../../platform/agentHost/common/meta/agentChangesetFileMeta.js';
import type { AgentHostUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';

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
 * Converts a single agent host diff into the chat session file change
 * format, or `undefined` when the diff carries no usable URI.
 *
 * @param mapUri Optional URI mapper applied after parsing. The remote agent
 *   host provider uses this to rewrite `file:` URIs into agent-host URIs.
 */
export function diffToChange(file: ChangesetFile, mapUri?: AgentHostUriMapper, useModifiedSnapshot = false): IChatSessionFileChange2 | undefined {
	const normalized = normalizeFileEdit(file.edit);
	if (!normalized) {
		return undefined;
	}

	const map = (uri: URI): URI => mapUri ? mapUri(uri) : uri;
	const mapContent = (uri: URI, fileUri: URI | undefined): URI => mapUri ? mapUri(uri, { contentRef: true, fileUri }) : uri;

	const uri = map(normalized.resource);

	// For deletions (no `after`), `modifiedUri` is `undefined` so the
	// renderer treats the entry as a deletion and doesn't try to open the
	// (now-missing) file as the "modified" side of the diff editor.
	const modifiedUri = useModifiedSnapshot && normalized.afterContentUri
		? mapContent(normalized.afterContentUri, normalized.afterUri)
		: normalized.afterUri ? map(normalized.afterUri) : undefined;

	// Use the before-content reference URI so the diff editor can
	// fetch the snapshot of the file *before* the session's edits.
	const originalUri = normalized.beforeContentUri
		? mapContent(normalized.beforeContentUri, normalized.beforeUri)
		: undefined;

	// Extract reviewed status from meta. We
	// do this for backward compatibility.
	const meta = readChangesetFileMeta(file);

	return {
		uri,
		modifiedUri,
		originalUri,
		insertions: file.edit?.diff?.added ?? 0,
		deletions: file.edit?.diff?.removed ?? 0,
		reviewed: file.reviewed ?? meta?.reviewed
	} satisfies IChatSessionFileChange2;
}

/**
 * Converts a single {@link ChangesetFile} into a {@link IChatSessionFileChange2},
 * or `undefined` when the underlying diff has no usable URI.
 */
export function changesetFileToChange(file: ChangesetFile, mapUri?: AgentHostUriMapper, useModifiedSnapshot = false): IChatSessionFileChange2 | undefined {
	return diffToChange(file, mapUri, useModifiedSnapshot);
}
