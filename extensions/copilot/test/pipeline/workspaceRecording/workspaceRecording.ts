/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { DEFAULT_NES_DATAGEN_ORACLE_EDIT_LIMIT } from '../../base/simulationOptions';
import { deserializeStringEdit, serializeStringEdit } from '../../../src/platform/inlineEdits/common/dataTypes/editUtils';
import { RecordingData, ResolvedRecording } from '../../../src/platform/workspaceRecorder/common/resolvedRecording/resolvedRecording';
import { OperationKind, type Operation } from '../../../src/platform/workspaceRecorder/common/resolvedRecording/operation';
import type { HeaderLogEntry, ISerializedEdit, ISerializedOffsetRange, LogEntry } from '../../../src/platform/workspaceRecorder/common/workspaceLog';
import { ErrorUtils } from '../../../src/util/common/errors';
import { StringText } from '../../../src/util/vs/editor/common/core/text/abstractText';
import { composeAndLimitSerializedEdits, doesSerializedEditContinueOracle, ORACLE_CURSOR_CONTINUATION_LINE_GAP, ORACLE_CURSOR_SUPPRESSION_MS, ORACLE_EDIT_IDLE_MS } from '../oracleEdits';
import type { IWorkspaceRecordingSampleProvenance } from '../replayRecording';

const WORKSPACE_RECORDING_CONTEXT_WINDOW_MS = 5 * 60 * 1000;
const WORKSPACE_RECORDING_SYNTHETIC_TIME_BASE = 3_000_000;

type EditClassification = 'user' | 'accepted' | 'partially-accepted' | 'generated' | 'ambiguous';
type WorkspacePivotKind = IWorkspaceRecordingSampleProvenance['pivotKind'];
type WorkspaceOracleStopReason = IWorkspaceRecordingSampleProvenance['oracleStopReason'];
type WorkspaceOracleCollectionStopReason = WorkspaceOracleStopReason | 'end-of-recording' | 'touching-boundary';

export interface IWorkspaceRecording {
	readonly entries: LogEntry[];
	readonly resolved: ResolvedRecording;
	readonly revision: 4;
}

export interface IWorkspaceRecordingSampleDescriptor {
	readonly pivotOperationIndex: number;
	readonly pivotKind: WorkspacePivotKind;
	readonly oracleOperationIndices: readonly number[];
	readonly oracleEdits: ISerializedEdit;
	readonly cursorBoundaryOperationIndex: number | undefined;
	readonly oracleStopReason: WorkspaceOracleStopReason;
}

export interface IWorkspaceRecordingSample {
	readonly entries: LogEntry[];
	readonly pivotEntryIndex: number;
	readonly provenance: IWorkspaceRecordingSampleProvenance;
}

const userCursorKinds = new Set([
	'compositionType',
	'compositionEnd',
	'type',
	'paste',
	'cut',
	'executeCommands',
	'executeCommand',
]);

const generatedEditSources = new Set([
	'Chat.applyEdits',
	'inlineChat.applyEdits',
	'reloadFromDisk',
	'setValue',
	'eolChange',
	'applyEdits',
	'snippet',
	'suggest',
]);

export async function loadWorkspaceRecording(inputPath: string): Promise<IWorkspaceRecording> {
	const parsed: { entry: LogEntry; lineNumber: number }[] = [];
	const reader = createInterface({
		input: createReadStream(inputPath, { encoding: 'utf8' }),
		crlfDelay: Infinity,
	});

	let lineNumber = 0;
	try {
		for await (const line of reader) {
			lineNumber++;
			if (line.trim().length === 0) {
				continue;
			}

			let value: unknown;
			try {
				value = JSON.parse(line);
			} catch (error) {
				throw recordingError(lineNumber, `invalid JSON: ${ErrorUtils.fromUnknown(error).message}`, error);
			}

			parsed.push({ entry: parseLogEntry(value, lineNumber), lineNumber });
		}
	} finally {
		reader.close();
	}

	if (parsed.length === 0) {
		throw new Error('Workspace recording is empty');
	}

	const first = parsed[0];
	if (first.entry.kind !== 'header') {
		throw recordingError(first.lineNumber, 'the first non-empty entry must be a workspaceRecording@1.0 header');
	}
	if (first.entry.revision !== 4) {
		throw recordingError(first.lineNumber, `unsupported workspace recording revision ${first.entry.revision ?? 'missing'}; expected 4`);
	}
	for (let i = 1; i < parsed.length; i++) {
		if (parsed[i].entry.kind === 'header') {
			throw recordingError(parsed[i].lineNumber, 'multiple headers are not supported; process rotated recording files separately');
		}
	}

	validateStatefulEntries(parsed);
	const entries = parsed.map(item => item.entry);

	let resolved: ResolvedRecording;
	try {
		resolved = ResolvedRecording.resolve(RecordingData.create(entries));
	} catch (error) {
		throw new Error(`Unable to resolve workspace recording: ${ErrorUtils.fromUnknown(error).message}`, { cause: error });
	}

	return { entries, resolved, revision: 4 };
}

export function selectWorkspaceRecordingSamples(
	recording: IWorkspaceRecording,
	maxSamples: number,
	maxOracleEdits = DEFAULT_NES_DATAGEN_ORACLE_EDIT_LIMIT,
): IWorkspaceRecordingSampleDescriptor[] {
	if (!Number.isInteger(maxOracleEdits) || maxOracleEdits <= 0) {
		throw new Error(`Workspace recording oracle edit limit must be a positive integer, but got: ${maxOracleEdits}`);
	}

	const classifications = createEditClassifications(recording);
	const deliberateCursorOperations = findDeliberateCursorOperations(recording);
	const candidates: IWorkspaceRecordingSampleDescriptor[] = [];

	for (const operation of recording.resolved.operations) {
		let pivotKind: WorkspacePivotKind | undefined;
		if (operation.kind === OperationKind.Changed && classifications.get(operation.operationIdx) === 'user') {
			pivotKind = 'user-edit';
		} else if (deliberateCursorOperations.has(operation.operationIdx)) {
			pivotKind = 'cursor-move';
		}
		if (!pivotKind) {
			continue;
		}

		const oracle = collectOracle(recording, operation, classifications, deliberateCursorOperations);
		if (oracle.operationIndices.length === 0 || oracle.stopReason === 'end-of-recording' || oracle.stopReason === 'touching-boundary') {
			continue;
		}
		const oracleEdits = composeOracleEdits(recording, oracle.operationIndices, maxOracleEdits);
		if (oracleEdits.length === 0) {
			continue;
		}

		candidates.push({
			pivotOperationIndex: operation.operationIdx,
			pivotKind,
			oracleOperationIndices: oracle.operationIndices,
			oracleEdits,
			cursorBoundaryOperationIndex: oracle.cursorBoundaryOperationIndex,
			oracleStopReason: oracle.stopReason,
		});
	}

	const deduplicated = deduplicateCandidates(recording, candidates);
	return evenlyCap(deduplicated, maxSamples);
}

export function materializeWorkspaceRecordingSample(
	recording: IWorkspaceRecording,
	descriptor: IWorkspaceRecordingSampleDescriptor,
): IWorkspaceRecordingSample {
	const operations = recording.resolved.operations;
	const pivot = operations[descriptor.pivotOperationIndex];
	if (!pivot) {
		throw new Error(`Workspace recording pivot operation ${descriptor.pivotOperationIndex} does not exist`);
	}

	const contextStartOperationIndex = findContextStartOperationIndex(operations, pivot);
	const retainedOperations = [
		...operations.slice(contextStartOperationIndex, pivot.operationIdx + 1),
		...descriptor.oracleOperationIndices.map(operationIndex => operations[operationIndex]),
		...(descriptor.cursorBoundaryOperationIndex === undefined ? [] : [operations[descriptor.cursorBoundaryOperationIndex]]),
	]
		.filter(isMaterializedOperation);

	const firstOperationByDocument = new Map<number, Operation>();
	const documentsWithRetainedSelection = new Set<number>();
	for (const operation of retainedOperations) {
		if (!firstOperationByDocument.has(operation.documentId)) {
			firstOperationByDocument.set(operation.documentId, operation);
		}
		if (operation.operationIdx <= pivot.operationIdx && operation.kind === OperationKind.SelectionChanged) {
			documentsWithRetainedSelection.add(operation.documentId);
		}
	}

	const entries: LogEntry[] = [{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } }];
	const skippedInitialSetOperations = new Set<number>();
	const documentVersions = new Map<number, number>();
	const frameTime = WORKSPACE_RECORDING_SYNTHETIC_TIME_BASE;

	for (const [documentId, firstOperation] of [...firstOperationByDocument].sort((a, b) => a[0] - b[0])) {
		const document = recording.resolved.getDocument(documentId);
		const firstOperationSetsValue = firstOperation.kind === OperationKind.SetContent || firstOperation.kind === OperationKind.Restore;
		const stateId = firstOperationSetsValue ? firstOperation.documentStateIdAfter : firstOperation.documentStateIdBefore;
		const state = document.getState(stateId);
		if (firstOperationSetsValue) {
			skippedInitialSetOperations.add(firstOperation.operationIdx);
		}

		entries.push({
			kind: 'documentEncountered',
			id: documentId,
			time: frameTime,
			relativePath: document.documentRelativePath,
		});
		entries.push({
			kind: 'setContent',
			id: documentId,
			time: frameTime + 1,
			content: state.value,
			v: 0,
		});
		documentVersions.set(documentId, 0);

		if (state.selection.length > 0 && !documentsWithRetainedSelection.has(documentId)) {
			entries.push({
				kind: 'selectionChanged',
				id: documentId,
				time: frameTime + 1,
				selection: state.selection.map(selection => [selection.start, selection.endExclusive]),
			});
		}
	}

	let pivotEntryIndex = -1;
	let syntheticTime = WORKSPACE_RECORDING_SYNTHETIC_TIME_BASE + 2;
	for (const operation of retainedOperations) {
		if (skippedInitialSetOperations.has(operation.operationIdx)) {
			continue;
		}

		const time = syntheticTime++;
		switch (operation.kind) {
			case OperationKind.SetContent:
			case OperationKind.Restore: {
				const version = nextDocumentVersion(documentVersions, operation.documentId);
				const state = recording.resolved.getDocument(operation.documentId).getState(operation.documentStateIdAfter);
				entries.push({ kind: 'setContent', id: operation.documentId, time, content: state.value, v: version });
				break;
			}
			case OperationKind.Changed: {
				const version = nextDocumentVersion(documentVersions, operation.documentId);
				entries.push({
					kind: 'changed',
					id: operation.documentId,
					time,
					edit: serializeStringEdit(operation.edit),
					v: version,
				});
				break;
			}
			case OperationKind.SelectionChanged:
				entries.push({
					kind: 'selectionChanged',
					id: operation.documentId,
					time,
					selection: operation.selection.map(selection => [selection.start, selection.endExclusive]),
				});
				break;
			case OperationKind.Opened:
			case OperationKind.Closed:
			case OperationKind.FocusChanged:
				break;
		}

		if (operation.operationIdx === pivot.operationIdx) {
			pivotEntryIndex = entries.length - 1;
		}
	}

	if (pivotEntryIndex < 0) {
		throw new Error(`Workspace recording pivot operation ${pivot.operationIdx} was not materialized`);
	}

	return {
		entries,
		pivotEntryIndex,
		provenance: {
			sourceFormat: 'workspace-recording',
			recordingRevision: recording.revision,
			policyVersion: 2,
			pivotKind: descriptor.pivotKind,
			pivotOperationIndex: descriptor.pivotOperationIndex,
			oracleOperationCount: descriptor.oracleOperationIndices.length,
			oracleStopReason: descriptor.oracleStopReason,
			contextTruncated: contextStartOperationIndex > 0,
		},
	};
}

function parseLogEntry(value: unknown, lineNumber: number): LogEntry {
	const record = requireRecord(value, lineNumber, 'entry');
	const kind = requireString(record['kind'], lineNumber, 'kind');

	switch (kind) {
		case 'header':
			return parseHeader(record, lineNumber);
		case 'applicationStart':
			return {
				kind,
				time: requireFiniteNumber(record['time'], lineNumber, 'time'),
				commitHash: optionalString(record['commitHash'], lineNumber, 'commitHash'),
			};
		case 'documentEncountered':
			return {
				kind,
				...parseDocumentCoordinates(record, lineNumber),
				relativePath: normalizeRelativePath(requireString(record['relativePath'], lineNumber, 'relativePath'), lineNumber),
			};
		case 'setContent':
			return {
				kind,
				...parseDocumentCoordinates(record, lineNumber),
				content: requireString(record['content'], lineNumber, 'content'),
				v: optionalVersion(record['v'], lineNumber),
			};
		case 'storeContent':
		case 'restoreContent':
			return {
				kind,
				...parseDocumentCoordinates(record, lineNumber),
				contentId: requireString(record['contentId'], lineNumber, 'contentId'),
				v: optionalVersion(record['v'], lineNumber),
			};
		case 'opened':
		case 'closed':
		case 'focused':
			return { kind, ...parseDocumentCoordinates(record, lineNumber) };
		case 'changed':
			return {
				kind,
				...parseDocumentCoordinates(record, lineNumber),
				edit: parseEdit(record['edit'], lineNumber),
				v: requireNonNegativeInteger(record['v'], lineNumber, 'v'),
				metadata: optionalRecord(record['metadata'], lineNumber, 'metadata'),
			};
		case 'selectionChanged':
			return {
				kind,
				...parseDocumentCoordinates(record, lineNumber),
				selection: parseSelection(record['selection'], lineNumber),
			};
		case 'documentEvent':
			return { kind, ...parseDocumentCoordinates(record, lineNumber), data: record['data'] };
		case 'event':
			return { kind, time: requireFiniteNumber(record['time'], lineNumber, 'time'), data: record['data'] };
		case 'meta':
			return { kind, data: record['data'] };
		case 'bookmark':
			return { kind, time: requireFiniteNumber(record['time'], lineNumber, 'time') };
		default:
			throw recordingError(lineNumber, `unsupported entry kind '${kind}'`);
	}
}

function parseHeader(record: Record<string, unknown>, lineNumber: number): HeaderLogEntry {
	const documentType = requireString(record['documentType'], lineNumber, 'documentType');
	if (documentType !== 'workspaceRecording@1.0') {
		throw recordingError(lineNumber, `unsupported document type '${documentType}'`);
	}

	const revision = record['revision'] === undefined ? undefined : requireNonNegativeInteger(record['revision'], lineNumber, 'revision');
	return {
		kind: 'header',
		documentType,
		repoRootUri: requireString(record['repoRootUri'], lineNumber, 'repoRootUri'),
		time: requireFiniteNumber(record['time'], lineNumber, 'time'),
		uuid: requireString(record['uuid'], lineNumber, 'uuid'),
		revision,
	};
}

function parseDocumentCoordinates(record: Record<string, unknown>, lineNumber: number): { id: number; time: number } {
	return {
		id: requireNonNegativeInteger(record['id'], lineNumber, 'id'),
		time: requireFiniteNumber(record['time'], lineNumber, 'time'),
	};
}

function parseEdit(value: unknown, lineNumber: number): ISerializedEdit {
	if (!Array.isArray(value) || value.length === 0) {
		throw recordingError(lineNumber, 'edit must be a non-empty array');
	}
	return value.map((replacement, index) => {
		if (!Array.isArray(replacement) || replacement.length !== 3) {
			throw recordingError(lineNumber, `edit[${index}] must be [start, endExclusive, text]`);
		}
		const start = requireNonNegativeInteger(replacement[0], lineNumber, `edit[${index}][0]`);
		const endExclusive = requireNonNegativeInteger(replacement[1], lineNumber, `edit[${index}][1]`);
		if (endExclusive < start) {
			throw recordingError(lineNumber, `edit[${index}] has endExclusive before start`);
		}
		const parsed: [number, number, string] = [start, endExclusive, requireString(replacement[2], lineNumber, `edit[${index}][2]`)];
		return parsed;
	});
}

function parseSelection(value: unknown, lineNumber: number): ISerializedOffsetRange[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw recordingError(lineNumber, 'selection must be a non-empty array');
	}
	return value.map((range, index) => {
		if (!Array.isArray(range) || range.length !== 2) {
			throw recordingError(lineNumber, `selection[${index}] must be [start, endExclusive]`);
		}
		const start = requireNonNegativeInteger(range[0], lineNumber, `selection[${index}][0]`);
		const endExclusive = requireNonNegativeInteger(range[1], lineNumber, `selection[${index}][1]`);
		if (endExclusive < start) {
			throw recordingError(lineNumber, `selection[${index}] has endExclusive before start`);
		}
		const parsed: [number, number] = [start, endExclusive];
		return parsed;
	});
}

function validateStatefulEntries(parsed: readonly { entry: LogEntry; lineNumber: number }[]): void {
	const encountered = new Set<number>();
	const contentByDocument = new Map<number, string>();
	const storedContent = new Map<string, string>();

	for (const { entry, lineNumber } of parsed) {
		if (entry.kind === 'documentEncountered') {
			if (encountered.has(entry.id)) {
				throw recordingError(lineNumber, `document id ${entry.id} was encountered more than once`);
			}
			encountered.add(entry.id);
			continue;
		}

		if (!('id' in entry)) {
			continue;
		}
		if (!encountered.has(entry.id)) {
			throw recordingError(lineNumber, `document id ${entry.id} was used before documentEncountered`);
		}

		switch (entry.kind) {
			case 'setContent':
				contentByDocument.set(entry.id, entry.content);
				break;
			case 'storeContent': {
				const content = contentByDocument.get(entry.id);
				if (content === undefined) {
					throw recordingError(lineNumber, `storeContent for document ${entry.id} has no current content`);
				}
				storedContent.set(entry.contentId, content);
				break;
			}
			case 'restoreContent': {
				const content = storedContent.get(entry.contentId);
				if (content === undefined) {
					throw recordingError(lineNumber, `restoreContent references unknown content id`);
				}
				contentByDocument.set(entry.id, content);
				break;
			}
			case 'changed': {
				const content = requireInitializedContent(contentByDocument, entry.id, lineNumber, entry.kind);
				for (const [, endExclusive] of entry.edit) {
					if (endExclusive > content.length) {
						throw recordingError(lineNumber, `edit range exceeds document ${entry.id} content`);
					}
				}
				try {
					contentByDocument.set(entry.id, deserializeStringEdit(entry.edit).apply(content));
				} catch (error) {
					throw recordingError(lineNumber, `invalid edit: ${ErrorUtils.fromUnknown(error).message}`, error);
				}
				break;
			}
			case 'selectionChanged': {
				const content = requireInitializedContent(contentByDocument, entry.id, lineNumber, entry.kind);
				for (const [, endExclusive] of entry.selection) {
					if (endExclusive > content.length) {
						throw recordingError(lineNumber, `selection exceeds document ${entry.id} content`);
					}
				}
				break;
			}
			case 'opened':
			case 'closed':
			case 'focused':
			case 'documentEvent':
				break;
		}
	}
}

function createEditClassifications(recording: IWorkspaceRecording): ReadonlyMap<number, EditClassification> {
	const legacy = collectLegacyClassifications(recording.entries);
	const result = new Map<number, EditClassification>();

	for (const operation of recording.resolved.operations) {
		if (operation.kind !== OperationKind.Changed) {
			continue;
		}
		const entry = recording.entries[operation.logEventIdx];
		if (entry.kind !== 'changed') {
			result.set(operation.operationIdx, 'ambiguous');
			continue;
		}

		const direct = classifyMetadata(entry.metadata);
		const legacyClassification = legacy.get(documentVersionKey(entry.id, entry.v));
		if (direct !== undefined && legacyClassification !== undefined && direct !== legacyClassification) {
			result.set(operation.operationIdx, 'ambiguous');
		} else {
			result.set(operation.operationIdx, direct ?? legacyClassification ?? 'ambiguous');
		}
	}

	return result;
}

function classifyMetadata(metadata: Record<string, unknown> | undefined): EditClassification | undefined {
	if (!metadata) {
		return undefined;
	}
	const source = metadata['source'];
	if (typeof source !== 'string') {
		return 'ambiguous';
	}
	if (source === 'cursor') {
		const kind = metadata['kind'];
		return typeof kind === 'string' && userCursorKinds.has(kind) ? 'user' : 'ambiguous';
	}
	return classifyNonCursorSource(source);
}

function classifyNonCursorSource(source: string): EditClassification {
	if (source === 'inlineCompletionAccept') {
		return 'accepted';
	}
	if (source === 'inlineCompletionPartialAccept') {
		return 'partially-accepted';
	}
	return generatedEditSources.has(source) ? 'generated' : 'ambiguous';
}

function collectLegacyClassifications(entries: readonly LogEntry[]): ReadonlyMap<string, EditClassification> {
	const result = new Map<string, EditClassification>();
	for (const entry of entries) {
		if (entry.kind !== 'documentEvent' || !isRecord(entry.data)) {
			continue;
		}
		if (entry.data['sourceId'] !== 'TextModel.setChangeReason') {
			continue;
		}
		const version = entry.data['v'];
		const source = entry.data['source'];
		if (typeof version !== 'number' || !Number.isInteger(version) || typeof source !== 'string') {
			continue;
		}
		const classification = source === 'cursor' ? 'user' : classifyNonCursorSource(source);
		const key = documentVersionKey(entry.id, version);
		const previous = result.get(key);
		result.set(key, previous !== undefined && previous !== classification ? 'ambiguous' : classification);
	}
	return result;
}

function findDeliberateCursorOperations(recording: IWorkspaceRecording): ReadonlySet<number> {
	const result = new Set<number>();
	const lastEditTimeByDocument = new Map<number, number>();
	let previousLocation: { documentId: number; lineNumber: number } | undefined;

	for (const operation of recording.resolved.operations) {
		if (operation.kind === OperationKind.Changed) {
			lastEditTimeByDocument.set(operation.documentId, operation.time);
			continue;
		}
		if (operation.kind !== OperationKind.SelectionChanged || operation.selection.length === 0) {
			continue;
		}

		const state = recording.resolved.getStateAfter(operation.operationIdx);
		const offset = operation.selection[0].start;
		const lineNumber = new StringText(state.documentValue).getTransformer().getPosition(offset).lineNumber - 1;
		const location = { documentId: operation.documentId, lineNumber };
		const changedLocation = previousLocation !== undefined
			&& (previousLocation.documentId !== location.documentId || previousLocation.lineNumber !== location.lineNumber);

		const lastEditTime = lastEditTimeByDocument.get(operation.documentId);
		const delta = lastEditTime === undefined ? undefined : operation.time - lastEditTime;
		const followsSameDocumentEdit = delta !== undefined && delta >= 0 && delta <= ORACLE_CURSOR_SUPPRESSION_MS;
		if (changedLocation && !followsSameDocumentEdit) {
			result.add(operation.operationIdx);
		}
		previousLocation = location;
	}

	return result;
}

function collectOracle(
	recording: IWorkspaceRecording,
	pivot: Operation,
	classifications: ReadonlyMap<number, EditClassification>,
	deliberateCursorOperations: ReadonlySet<number>,
): {
	operationIndices: number[];
	cursorBoundaryOperationIndex: number | undefined;
	stopReason: WorkspaceOracleCollectionStopReason;
} {
	const operationIndices: number[] = [];
	let previousEditTime = pivot.time;

	for (let i = pivot.operationIdx + 1; i < recording.resolved.operations.length; i++) {
		const operation = recording.resolved.operations[i];
		if (deliberateCursorOperations.has(i)) {
			const nextChangeOperationIndex = findNextDocumentChangeOperationIndex(recording, i + 1, pivot.documentId);
			if (
				operationIndices.length > 0
				&& nextChangeOperationIndex !== undefined
			) {
				const nextChangeOperation = recording.resolved.operations[nextChangeOperationIndex];
				const nextClassification = classifications.get(nextChangeOperationIndex) ?? 'ambiguous';
				const nextDelta = nextChangeOperation.time - previousEditTime;
				const continuesNearbyUserIntent = (
					nextClassification === 'accepted'
					|| nextClassification === 'partially-accepted'
					|| (nextClassification === 'user' && nextDelta > 0 && nextDelta < ORACLE_EDIT_IDLE_MS)
				) && areDocumentChangesWithinLineGap(
					recording,
					operationIndices[operationIndices.length - 1],
					nextChangeOperationIndex,
					ORACLE_CURSOR_CONTINUATION_LINE_GAP,
				);
				if (continuesNearbyUserIntent) {
					continue;
				}
				if (!doesOperationContinueOracle(recording, operationIndices, nextChangeOperationIndex)) {
					return {
						operationIndices,
						cursorBoundaryOperationIndex: i,
						stopReason: 'cursor-move',
					};
				}
				return {
					operationIndices,
					cursorBoundaryOperationIndex: undefined,
					stopReason: 'touching-boundary',
				};
			}
			return {
				operationIndices,
				cursorBoundaryOperationIndex: i,
				stopReason: 'cursor-move',
			};
		}

		if (operation.kind === OperationKind.SetContent || operation.kind === OperationKind.Restore) {
			let stopReason: WorkspaceOracleCollectionStopReason;
			if (operation.documentId !== pivot.documentId) {
				stopReason = 'other-document-edit';
			} else if (operationIndices.length > 0) {
				stopReason = 'touching-boundary';
			} else {
				stopReason = 'ambiguous-edit';
			}
			return {
				operationIndices,
				cursorBoundaryOperationIndex: undefined,
				stopReason,
			};
		}
		if (operation.kind !== OperationKind.Changed) {
			continue;
		}
		if (isNoOpDocumentChange(recording, operation)) {
			continue;
		}
		if (operation.documentId !== pivot.documentId) {
			return { operationIndices, cursorBoundaryOperationIndex: undefined, stopReason: 'other-document-edit' };
		}

		const classification = classifications.get(operation.operationIdx) ?? 'ambiguous';
		if (classification !== 'user' && classification !== 'accepted' && classification !== 'partially-accepted') {
			if (operationIndices.length > 0 && doesOperationContinueOracle(recording, operationIndices, operation.operationIdx)) {
				return {
					operationIndices,
					cursorBoundaryOperationIndex: undefined,
					stopReason: 'touching-boundary',
				};
			}
			return {
				operationIndices,
				cursorBoundaryOperationIndex: undefined,
				stopReason: classification === 'generated' ? 'generated-edit' : 'ambiguous-edit',
			};
		}

		if (classification === 'user') {
			const delta = operation.time - previousEditTime;
			if (delta <= 0 || delta >= ORACLE_EDIT_IDLE_MS) {
				if (operationIndices.length > 0 && doesOperationContinueOracle(recording, operationIndices, operation.operationIdx)) {
					return {
						operationIndices,
						cursorBoundaryOperationIndex: undefined,
						stopReason: 'touching-boundary',
					};
				}
				return { operationIndices, cursorBoundaryOperationIndex: undefined, stopReason: 'idle-gap' };
			}
		}

		operationIndices.push(operation.operationIdx);
		previousEditTime = operation.time;
	}

	return { operationIndices, cursorBoundaryOperationIndex: undefined, stopReason: 'end-of-recording' };
}

function findNextDocumentChangeOperationIndex(
	recording: IWorkspaceRecording,
	startOperationIndex: number,
	documentId: number,
): number | undefined {
	for (let i = startOperationIndex; i < recording.resolved.operations.length; i++) {
		const operation = recording.resolved.operations[i];
		if (operation.kind === OperationKind.SetContent || operation.kind === OperationKind.Restore) {
			return undefined;
		}
		if (operation.kind !== OperationKind.Changed || isNoOpDocumentChange(recording, operation)) {
			continue;
		}
		return operation.documentId === documentId ? operation.operationIdx : undefined;
	}
	return undefined;
}

function areDocumentChangesWithinLineGap(
	recording: IWorkspaceRecording,
	firstOperationIndex: number,
	secondOperationIndex: number,
	maxLineGap: number,
): boolean {
	const first = getDocumentChangeLineRange(recording, firstOperationIndex);
	const second = getDocumentChangeLineRange(recording, secondOperationIndex);
	if (!first || !second || first.documentId !== second.documentId) {
		return false;
	}
	if (first.endLine < second.startLine) {
		return second.startLine - first.endLine - 1 <= maxLineGap;
	}
	if (second.endLine < first.startLine) {
		return first.startLine - second.endLine - 1 <= maxLineGap;
	}
	return true;
}

function getDocumentChangeLineRange(
	recording: IWorkspaceRecording,
	operationIndex: number,
): { documentId: number; startLine: number; endLine: number } | undefined {
	const operation = recording.resolved.operations[operationIndex];
	if (!operation || operation.kind !== OperationKind.Changed || operation.edit.replacements.length === 0) {
		return undefined;
	}
	const state = recording.resolved.getDocument(operation.documentId).getState(operation.documentStateIdBefore);
	const transformer = new StringText(state.value).getTransformer();
	let startLine = Number.POSITIVE_INFINITY;
	let endLine = Number.NEGATIVE_INFINITY;
	for (const replacement of operation.edit.replacements) {
		startLine = Math.min(startLine, transformer.getPosition(replacement.replaceRange.start).lineNumber - 1);
		endLine = Math.max(endLine, transformer.getPosition(replacement.replaceRange.endExclusive).lineNumber - 1);
	}
	return { documentId: operation.documentId, startLine, endLine };
}

function isNoOpDocumentChange(recording: IWorkspaceRecording, operation: Operation): boolean {
	if (operation.kind !== OperationKind.Changed) {
		return false;
	}
	const document = recording.resolved.getDocument(operation.documentId);
	return document.getState(operation.documentStateIdBefore).value === document.getState(operation.documentStateIdAfter).value;
}

function composeOracleEdits(
	recording: IWorkspaceRecording,
	operationIndices: readonly number[],
	maxOracleEdits: number,
): ISerializedEdit {
	return composeAndLimitSerializedEdits(getSerializedOperationEdits(recording, operationIndices), maxOracleEdits);
}

function getSerializedOperationEdits(
	recording: IWorkspaceRecording,
	operationIndices: readonly number[],
): ISerializedEdit[] {
	return operationIndices.map(operationIndex => {
		const operation = recording.resolved.operations[operationIndex];
		if (!operation || operation.kind !== OperationKind.Changed) {
			throw new Error(`Workspace recording oracle operation ${operationIndex} is not a document change`);
		}
		return serializeStringEdit(operation.edit);
	});
}

function doesOperationContinueOracle(
	recording: IWorkspaceRecording,
	operationIndices: readonly number[],
	nextOperationIndex: number,
): boolean {
	const operation = recording.resolved.operations[nextOperationIndex];
	if (!operation || operation.kind !== OperationKind.Changed) {
		return false;
	}
	return doesSerializedEditContinueOracle(
		getSerializedOperationEdits(recording, operationIndices),
		serializeStringEdit(operation.edit),
	);
}

function deduplicateCandidates(
	recording: IWorkspaceRecording,
	candidates: readonly IWorkspaceRecordingSampleDescriptor[],
): IWorkspaceRecordingSampleDescriptor[] {
	const groups = new Map<string, {
		readonly labelDigest: string;
		readonly candidate: IWorkspaceRecordingSampleDescriptor;
		conflicting: boolean;
	}>();

	for (const candidate of candidates) {
		const sample = materializeWorkspaceRecordingSample(recording, candidate);
		const inputDigest = digest(sample.entries.slice(0, sample.pivotEntryIndex + 1));
		const labelDigest = digest({
			oracleEdits: candidate.oracleEdits,
			cursorBoundaries: sample.entries
				.slice(sample.pivotEntryIndex + 1)
				.filter(entry => entry.kind === 'selectionChanged'),
		});
		const group = groups.get(inputDigest);
		if (!group) {
			groups.set(inputDigest, { labelDigest, candidate, conflicting: false });
		} else if (group.labelDigest !== labelDigest) {
			group.conflicting = true;
		}
	}

	const result = [...groups.values()]
		.filter(group => !group.conflicting)
		.map(group => group.candidate);
	result.sort((a, b) => a.pivotOperationIndex - b.pivotOperationIndex);
	return result;
}

function evenlyCap<T>(items: readonly T[], cap: number): T[] {
	if (cap <= 0 || items.length === 0) {
		return [];
	}
	if (items.length <= cap) {
		return [...items];
	}
	if (cap === 1) {
		return [items[0]];
	}

	const result: T[] = [];
	for (let i = 0; i < cap; i++) {
		result.push(items[Math.floor(i * (items.length - 1) / (cap - 1))]);
	}
	return result;
}

function findContextStartOperationIndex(operations: readonly Operation[], pivot: Operation): number {
	const earliestTime = pivot.time - WORKSPACE_RECORDING_CONTEXT_WINDOW_MS;
	for (let i = 0; i <= pivot.operationIdx; i++) {
		const time = operations[i].time;
		if (time >= earliestTime && time <= pivot.time) {
			return i;
		}
	}
	return pivot.operationIdx;
}

function isMaterializedOperation(operation: Operation): boolean {
	return operation.kind === OperationKind.SetContent
		|| operation.kind === OperationKind.Restore
		|| operation.kind === OperationKind.Changed
		|| operation.kind === OperationKind.SelectionChanged;
}

function nextDocumentVersion(versions: Map<number, number>, documentId: number): number {
	const next = (versions.get(documentId) ?? 0) + 1;
	versions.set(documentId, next);
	return next;
}

function digest(value: unknown): string {
	return createHash('sha256')
		.update('nes-datagen-workspace-recording-v1\0')
		.update(JSON.stringify(value))
		.digest('hex');
}

function normalizeRelativePath(value: string, lineNumber: number): string {
	const normalized = value.replaceAll('\\', '/');
	if (!normalized || normalized.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized) || normalized.includes('?')) {
		throw recordingError(lineNumber, 'relativePath must be a workspace-relative path without a scheme or query');
	}

	const [path, fragment, ...extraFragments] = normalized.split('#');
	if (extraFragments.length > 0 || (fragment !== undefined && !/^[A-Za-z0-9._~-]+$/.test(fragment))) {
		throw recordingError(lineNumber, 'relativePath contains an unsafe fragment');
	}
	const segments = path.split('/');
	if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
		throw recordingError(lineNumber, 'relativePath contains an unsafe path segment');
	}
	return fragment === undefined ? segments.join('/') : `${segments.join('/')}#${fragment}`;
}

function documentVersionKey(documentId: number, version: number): string {
	return `${documentId}:${version}`;
}

function requireInitializedContent(
	contentByDocument: ReadonlyMap<number, string>,
	documentId: number,
	lineNumber: number,
	kind: string,
): string {
	const content = contentByDocument.get(documentId);
	if (content === undefined) {
		throw recordingError(lineNumber, `${kind} for document ${documentId} has no current content`);
	}
	return content;
}

function requireRecord(value: unknown, lineNumber: number, field: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw recordingError(lineNumber, `${field} must be an object`);
	}
	return value;
}

function optionalRecord(value: unknown, lineNumber: number, field: string): Record<string, unknown> | undefined {
	return value === undefined ? undefined : requireRecord(value, lineNumber, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, lineNumber: number, field: string): string {
	if (typeof value !== 'string') {
		throw recordingError(lineNumber, `${field} must be a string`);
	}
	return value;
}

function optionalString(value: unknown, lineNumber: number, field: string): string | undefined {
	return value === undefined ? undefined : requireString(value, lineNumber, field);
}

function requireFiniteNumber(value: unknown, lineNumber: number, field: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw recordingError(lineNumber, `${field} must be a finite number`);
	}
	return value;
}

function requireNonNegativeInteger(value: unknown, lineNumber: number, field: string): number {
	const number = requireFiniteNumber(value, lineNumber, field);
	if (!Number.isInteger(number) || number < 0) {
		throw recordingError(lineNumber, `${field} must be a non-negative integer`);
	}
	return number;
}

function optionalVersion(value: unknown, lineNumber: number): number | undefined {
	return value === undefined ? undefined : requireNonNegativeInteger(value, lineNumber, 'v');
}

function recordingError(lineNumber: number, message: string, cause?: unknown): Error {
	return new Error(`Invalid workspace recording at line ${lineNumber}: ${message}`, cause === undefined ? undefined : { cause });
}
