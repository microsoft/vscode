/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDefined } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { SessionStatus as ProtocolSessionStatus, type ChangesetFile } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ISessionFileDiff } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { normalizeFileEdit } from '../../../../../platform/agentHost/common/fileEditDiff.js';
import { IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionFileChange, SessionStatus } from '../../../../services/sessions/common/session.js';
import { readChangesetFileMeta } from '../../../../../platform/agentHost/common/meta/agentChangesetFileMeta.js';

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
export function diffToChange(file: ChangesetFile, mapUri?: (uri: URI) => URI): IChatSessionFileChange2 | undefined {
	const normalized = normalizeFileEdit(file.edit);
	if (!normalized) {
		return undefined;
	}

	const map = (uri: URI): URI => mapUri ? mapUri(uri) : uri;

	const uri = map(normalized.resource);

	// For deletions (no `after`), `modifiedUri` is `undefined` so the
	// renderer treats the entry as a deletion and doesn't try to open the
	// (now-missing) file as the "modified" side of the diff editor.
	const modifiedUri = normalized.afterUri ? map(normalized.afterUri) : undefined;

	// Use the before-content reference URI so the diff editor can
	// fetch the snapshot of the file *before* the session's edits.
	const originalUri = normalized.beforeContentUri ? map(normalized.beforeContentUri) : undefined;

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
export function changesetFileToChange(file: ChangesetFile, mapUri?: (uri: URI) => URI): IChatSessionFileChange2 | undefined {
	return diffToChange(file, mapUri);
}

/**
 * Converts agent host diffs to the chat session file change format.
 *
 * @param mapUri Optional URI mapper applied after parsing. The remote agent
 *   host provider uses this to rewrite `file:` URIs into agent-host URIs.
 */
export function diffsToChanges(files: readonly ChangesetFile[], mapUri?: (uri: URI) => URI): IChatSessionFileChange2[] {
	return files.map(d => diffToChange(d, mapUri)).filter(isDefined);
}

/**
 * Converts a {@link ChangesetFile | changeset file list} (the post-0.2.0
 * shape produced by `changeset/fileSet` actions) into the
 * {@link IChatSessionFileChange2 | chat session file change} format used by
 * the changes view.
 *
 * Each entry's underlying {@link ISessionFileDiff} is forwarded straight to
 * {@link diffsToChanges}; the wrapping `id` and `_meta` fields don't carry
 * additional information the UI needs.
 */
export function changesetFilesToChanges(files: readonly ChangesetFile[], mapUri?: (uri: URI) => URI): IChatSessionFileChange2[] {
	return diffsToChanges(files, mapUri);
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

/**
 * Same as {@link diffsEqual} but compares against a {@link ChangesetFile}
 * list (the post-0.2.0 producer output).
 */
export function changesetFilesEqual(current: readonly ISessionFileChange[], files: readonly ChangesetFile[], mapUri?: (uri: URI) => URI): boolean {
	return diffsEqual(current, files.map(f => f.edit), mapUri);
}
