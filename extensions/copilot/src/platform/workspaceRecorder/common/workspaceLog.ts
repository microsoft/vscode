/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';

export type LogDocumentId = number;

export type LogEntry =
	| HeaderLogEntry
	| ApplicationStartLogEntry
	| DocumentSetContentLogEntry
	| DocumentStoreContentLogEntry
	| DocumentRestoreContentLogEntry
	| DocumentOpenedLogEntry
	| DocumentClosedLogEntry
	| DocumentChangedLogEntry
	| DocumentFocusChangedLogEntry
	| DocumentSelectionChangedLogEntry
	| DocumentEncounteredLogEntry
	| MetaLogEntry
	| BookmarkLogEntry
	| DocumentEventLogEntry
	| EventLogEntry;

export type DocumentLogEntry = { id: LogDocumentId; time: number };
export namespace DocumentLogEntry {
	export function is(entry: unknown): entry is DocumentLogEntry {
		return !!entry && typeof entry === 'object' && 'id' in entry && 'time' in entry;
	}
}

/** First entry of the log */
export type HeaderLogEntry = {
	documentType: 'workspaceRecording@1.0';
	kind: 'header';
	repoRootUri: string;
	time: number;
	uuid: string;
	/** Increments on non-breaking changes */
	revision?: number;
};

export type ApplicationStartLogEntry = { kind: 'applicationStart'; time: number; commitHash?: string };

export type DocumentSetContentLogEntry = DocumentLogEntry & { kind: 'setContent'; content: string; /* if undefined, is 0 */ v: number | undefined };

export type DocumentStoreContentLogEntry = DocumentLogEntry & { kind: 'storeContent'; contentId: string; /* if undefined, is 0 */ v: number | undefined };

/** Can only restore from a content id set by any previous store content log entry */
export type DocumentRestoreContentLogEntry = DocumentLogEntry & { kind: 'restoreContent'; contentId: string; /* if undefined, is 0 */ v: number | undefined };

export type DocumentOpenedLogEntry = DocumentLogEntry & { kind: 'opened' };

export type DocumentClosedLogEntry = DocumentLogEntry & { kind: 'closed' };

export type IChangedMetadata = Record<string, unknown>;
export type DocumentChangedLogEntry = DocumentLogEntry & { kind: 'changed'; edit: ISerializedEdit; v: number; metadata?: IChangedMetadata };

export type DocumentFocusChangedLogEntry = DocumentLogEntry & { kind: 'focused' };

export type DocumentSelectionChangedLogEntry = DocumentLogEntry & { kind: 'selectionChanged'; selection: ISerializedOffsetRange[] };

export type DocumentEncounteredLogEntry = DocumentLogEntry & { kind: 'documentEncountered'; relativePath: string };

export type DocumentEventLogEntry = DocumentLogEntry & { kind: 'documentEvent'; data: unknown };

export type EventLogEntry = { kind: 'event'; time: number; data: unknown };

export type MetaLogEntry = { kind: 'meta'; data: unknown | { repoRootUri: string } };

export type BookmarkLogEntry = { kind: 'bookmark'; time: number };


// Edit functions

export type ISerializedOffsetRange = [start: number, endEx: number];
export type ISerializedEdit = [start: number, endEx: number, text: string][];

export function serializeOffsetRange(offsetRange: OffsetRange): ISerializedOffsetRange {
	return [offsetRange.start, offsetRange.endExclusive];
}

export function deserializeOffsetRange(serialized: ISerializedOffsetRange): OffsetRange {
	return new OffsetRange(serialized[0], serialized[1]);
}

export function serializeEdit(edit: StringEdit): ISerializedEdit {
	return edit.replacements.map(e => [e.replaceRange.start, e.replaceRange.endExclusive, e.newText]);
}

export function deserializeEdit(serialized: ISerializedEdit): StringEdit {
	return StringEdit.create(serialized.map(e => StringReplacement.replace(new OffsetRange(e[0], e[1]), e[2])));
}

export type DocumentEventLogEntryData = IDocumentEventDataSetChangeReason | IDocumentEventFetchStart;
export type EventLogEntryData = IEventFetchEnd;

export interface IDocumentEventDataSetChangeReason {
	sourceId: 'TextModel.setChangeReason';
	source: string;
	v: number;
}

interface IDocumentEventFetchStart {
	sourceId: 'InlineCompletions.fetch';
	kind: 'start';
	requestId: number;
	v: number;
}

export interface IEventFetchEnd {
	sourceId: 'InlineCompletions.fetch';
	kind: 'end';
	requestId: number;
	error: string | undefined;
	result: IFetchResult[];
}

interface IFetchResult {
	range: string;
	text: string;
	isInlineEdit: boolean;
	source: string;
}
