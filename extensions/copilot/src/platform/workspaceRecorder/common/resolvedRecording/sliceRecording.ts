/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstMonotonous } from '../../../../util/vs/base/common/arraysFind';
import { CachedFunction } from '../../../../util/vs/base/common/cache';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { serializeStringEdit } from '../../../inlineEdits/common/dataTypes/editUtils';
import { DocumentEventLogEntryData, LogEntry } from '../workspaceLog';
import { OperationKind } from './operation';
import { ResolvedRecording } from './resolvedRecording';

export function sliceRecording(
	workspaceRecording: ResolvedRecording,
	step: number,
	historyMaxTimeMs: number,
	options: { includeSelection: boolean; mergeEdits: boolean; includeReasons: boolean } = { includeSelection: false, mergeEdits: true, includeReasons: false }
): LogEntry[] {
	const currentOp = workspaceRecording.operations[step];
	const startTime = currentOp.time - historyMaxTimeMs;
	const firstOp = findFirstMonotonous(workspaceRecording.operations, op => op.time >= startTime)!;

	let nextDocId = 0;
	const events: LogEntry[] = [];

	events.push({
		kind: 'meta', data: {
			kind: 'log-origin',
			uuid: workspaceRecording.uuid,
			repoRootUri: workspaceRecording.repoRootUri,
			opStart: firstOp.operationIdx,
			opEndEx: currentOp.operationIdx + 1
		}
	});

	const getDocumentRecorder = new CachedFunction((documentId: number) => {
		const doc = workspaceRecording.getDocument(documentId);
		const id = nextDocId++;

		let initialized = false;
		const init = () => {
			events.push({ kind: 'documentEncountered', id, time: currentOp.time, relativePath: doc.documentRelativePath });
			initialized = true;
		};

		function editExtends(edit: StringEdit, previousEdit: StringEdit): boolean {
			const newRanges = previousEdit.getNewRanges();
			return edit.replacements.every(e => intersectsOrTouches(e.replaceRange, newRanges));
		}

		function intersectsOrTouches(range: OffsetRange, sortedRanges: readonly OffsetRange[]): boolean {
			const firstCandidate = findFirstMonotonous(sortedRanges, r => r.endExclusive >= range.start);
			return firstCandidate ? firstCandidate.intersectsOrTouches(range) : false;
		}

		let lastEdit: { edit: StringEdit; timeMs: number } | undefined = undefined;

		return {
			id: id,
			addSetContentEvent: (documentStateId: number) => {
				if (!initialized) { return; } // Wait for first change event

				const content = doc.getState(documentStateId).value;
				events.push({ kind: 'setContent', id: id, time: currentOp.time, content, v: documentStateId });

				lastEdit = undefined;
			},
			addEditEvent: (timeMs: number, edit: StringEdit, documentStateBeforeId: number, documentStateAfterId: number) => {
				if (!initialized) {
					init();
					const content = doc.getState(documentStateBeforeId).value;
					events.push({ kind: 'setContent', id: id, time: currentOp.time, content, v: documentStateBeforeId });
				}

				if (options.mergeEdits && lastEdit && events.at(-1)!.kind === 'changed' && editExtends(edit, lastEdit.edit) && timeMs - lastEdit.timeMs < 1000) {
					events.pop();
					edit = lastEdit.edit.compose(edit);
				}

				events.push({ kind: 'changed', id: id, time: timeMs, edit: serializeStringEdit(edit), v: documentStateAfterId });

				lastEdit = { edit, timeMs };
			},
			addSelectionEvent: (timeMs: number, selection: readonly OffsetRange[], documentStateBeforeId: number) => {
				if (!initialized) {
					init();
					const content = doc.getState(documentStateBeforeId).value;
					events.push({ kind: 'setContent', id: id, time: currentOp.time, content, v: documentStateBeforeId });
				}

				events.push({ kind: 'selectionChanged', id: id, time: timeMs, selection: selection.map(s => [s.start, s.endExclusive]) });
			}
		};
	});

	for (let i = firstOp.operationIdx; i <= step; i++) {
		const op = workspaceRecording.operations[i];
		const d = getDocumentRecorder.get(op.documentId);

		switch (op.kind) {
			case OperationKind.Restore:
			case OperationKind.SetContent: {
				d.addSetContentEvent(op.documentStateIdAfter);
				break;
			}

			case OperationKind.Changed: {
				d.addEditEvent(op.time, op.edit, op.documentStateIdBefore, op.documentStateIdAfter);
				if (op.reason && options.includeReasons) {
					events.push({ kind: 'documentEvent', time: op.time, id: d.id, data: { sourceId: 'TextModel.setChangeReason', source: op.reason, v: op.documentStateIdAfter } satisfies DocumentEventLogEntryData });
				}
				break;
			}

			case OperationKind.SelectionChanged: {
				if (options.includeSelection) {
					d.addSelectionEvent(op.time, op.selection, op.documentStateIdBefore);
				}
				break;
			}

			case OperationKind.FocusChanged:
			case OperationKind.Opened:
			case OperationKind.Closed:
				break;
		}
	}

	return events;
}
