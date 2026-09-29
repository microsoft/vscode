/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// !!! NOTE: copied over from src/platform/workspaceRecorder/common/workspaceLog.ts

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
export type HeaderLogEntry = { documentType: 'workspaceRecording@1.0'; kind: 'header'; repoRootUri: string; time: number; uuid: string };

export type ApplicationStartLogEntry = { kind: 'applicationStart'; time: number };

export type DocumentSetContentLogEntry = DocumentLogEntry & { kind: 'setContent'; content: string; /* if undefined, is 0 */ v: number | undefined };

export type DocumentStoreContentLogEntry = DocumentLogEntry & { kind: 'storeContent'; contentId: string; /* if undefined, is 0 */ v: number | undefined };

/** Can only restore from a content id set by any previous store content log entry */
export type DocumentRestoreContentLogEntry = DocumentLogEntry & { kind: 'restoreContent'; contentId: string; /* if undefined, is 0 */ v: number | undefined };

export type DocumentOpenedLogEntry = DocumentLogEntry & { kind: 'opened' };

export type DocumentClosedLogEntry = DocumentLogEntry & { kind: 'closed' };

export type DocumentChangedLogEntry = DocumentLogEntry & { kind: 'changed'; edit: ISerializedEdit; v: number };

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
