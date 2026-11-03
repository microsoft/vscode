/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert, assertNever } from '../../../../util/vs/base/common/assert';
import { groupAdjacentBy, pushMany } from '../../../../util/vs/base/common/arrays';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { LinkedList } from '../../../../util/vs/base/common/linkedList';
import { mapObservableArrayCached } from '../../../../util/vs/base/common/observable';
import { derived, IObservable } from '../../../../util/vs/base/common/observableInternal';
import { LineEdit } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { ConfigKey, IConfigurationService } from '../../../configuration/common/configurationService';
import { IExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { DocumentId } from '../dataTypes/documentId';
import { RootedEdit } from '../dataTypes/edit';
import { DiffHistoryMergeStrategy } from '../dataTypes/xtabHistoryOptions';
import { IObservableDocument, ObservableWorkspace } from '../observableWorkspace';
import { autorunWithChanges } from '../utils/observable';
import { Instant, now } from '../utils/utils';

export interface IXtabHistoryDocumentEntry {
	docId: DocumentId;
	/** Monotonically increasing position among captured history entries. */
	readonly ordinal: number;
}

export interface IXtabHistoryEditEntry extends IXtabHistoryDocumentEntry {
	kind: 'edit';
	edit: RootedEdit;
}

export interface IXtabHistoryVisibleRangesEntry extends IXtabHistoryDocumentEntry {
	kind: 'visibleRanges';
	visibleRanges: readonly OffsetRange[];
	documentContent: StringText;
}

export interface IXtabHistoryDiffHunk {
	readonly startLineNumber: number;
	readonly oldLines: readonly string[];
	readonly newLines: readonly string[];
}

export interface IXtabHistoryRejectedEditEntry extends IXtabHistoryDocumentEntry {
	readonly kind: 'rejectedEdit';
	readonly hunks: readonly IXtabHistoryDiffHunk[];
}

export type IXtabHistoryEntry =
	| IXtabHistoryEditEntry
	| IXtabHistoryVisibleRangesEntry;

type DocumentChangedEvent = {
	value: StringText;
	changes: StringEdit[];
	previous: StringText | undefined;
};

type DocumentSelectionChangedEvent = {
	value: readonly OffsetRange[];
	changes: unknown[];
	previous: readonly OffsetRange[] | undefined;
};

/**
 * Controls how consecutive edits to the same document are merged in history.
 */
export type XtabEditMergeStrategy =
	/** Merge when the first replacement of both line-edits starts on the same line. */
	| { readonly kind: DiffHistoryMergeStrategy.SameStartLine }
	/** Merge when all replacements in both line-edits are within `lineGap` lines of each other. */
	| { readonly kind: DiffHistoryMergeStrategy.Proximity; readonly lineGap: number }
	/**
	 * Layer 1 (keystroke coalescing): merge if edits are within `lineGap` lines AND arrived within `splitAfterMs`.
	 * Layer 2 (logical splitting): if either condition fails, start a new history entry.
	 */
	| { readonly kind: DiffHistoryMergeStrategy.Hybrid; readonly lineGap: number; readonly splitAfterMs: number };

export namespace XtabEditMergeStrategy {
	export const sameStartLine: XtabEditMergeStrategy = { kind: DiffHistoryMergeStrategy.SameStartLine };

	export function proximity(lineGap: number): XtabEditMergeStrategy {
		return { kind: DiffHistoryMergeStrategy.Proximity, lineGap };
	}

	export function hybrid(lineGap: number, splitAfterMs: number): XtabEditMergeStrategy {
		return { kind: DiffHistoryMergeStrategy.Hybrid, lineGap, splitAfterMs };
	}

	/**
	 * Constructs a {@link XtabEditMergeStrategy} from config values.
	 */
	export function fromConfig(strategyKind: DiffHistoryMergeStrategy, lineGap: number, splitAfterMs: number): XtabEditMergeStrategy {
		switch (strategyKind) {
			case DiffHistoryMergeStrategy.Proximity:
				return proximity(lineGap);
			case DiffHistoryMergeStrategy.Hybrid:
				return hybrid(lineGap, splitAfterMs);
			case DiffHistoryMergeStrategy.SameStartLine:
				return sameStartLine;
			default:
				assertNever(strategyKind);
		}
	}
}

/**
 * Returns whether all replacements in `a` are within `maxLineGap` lines of some replacement in `b` (and vice-versa).
 */
function areLineEditsWithinProximity(a: LineEdit, b: LineEdit, maxLineGap: number): boolean {
	if (a.isEmpty() || b.isEmpty()) {
		return false;
	}
	// Every replacement in `a` must be close to at least one replacement in `b`.
	for (const repA of a.replacements) {
		const closeToSomeInB = b.replacements.some(repB => repA.lineRange.distanceToRange(repB.lineRange) <= maxLineGap);
		if (!closeToSomeInB) {
			return false;
		}
	}
	return true;
}

export class NesXtabHistoryTracker extends Disposable {

	/** Max # of entries in history */
	private static MAX_HISTORY_SIZE = 50;
	private static MAX_REJECTED_EDIT_HISTORY_SIZE = 3;
	private static MAX_REJECTED_EDIT_CHARS = 3000;

	private readonly idToEntry: Map<DocumentId, { entry: IXtabHistoryEntry; removeFromHistory: () => void; lastEditTimestamp: Instant }>;
	private readonly history: LinkedList<IXtabHistoryEntry>;
	private readonly rejectedEditHistory = new LinkedList<IXtabHistoryRejectedEditEntry>();

	private readonly maxHistorySize: number;
	private historyEntryOrdinal = 0;

	protected mergeStrategy: IObservable<XtabEditMergeStrategy>;

	constructor(
		workspace: ObservableWorkspace,
		maxHistorySize: number | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IExperimentationService private readonly _expService: IExperimentationService,
	) {
		super();

		this.idToEntry = new Map();
		this.history = new LinkedList();

		this.maxHistorySize = maxHistorySize ?? NesXtabHistoryTracker.MAX_HISTORY_SIZE;

		this.mergeStrategy = derived(reader => XtabEditMergeStrategy.fromConfig(
			this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsXtabDiffMergeStrategy, this._expService).read(reader),
			this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsXtabDiffMergeLineGap, this._expService).read(reader),
			this._configurationService.getExperimentBasedConfigObservable(ConfigKey.TeamInternal.InlineEditsXtabDiffMergeSplitAfterMs, this._expService).read(reader),
		));

		mapObservableArrayCached(this, workspace.openDocuments, (doc, store) => {

			// add .value to all observables
			store.add(autorunWithChanges(this, {
				rootedEdits: doc.value,
				visibleRanges: doc.visibleRanges,
			}, (data) => {

				if (data.rootedEdits.changes.length > 0 && data.rootedEdits.previous !== undefined) {
					this.handleEdits(doc, data.rootedEdits);
				} else {
					this.handleVisibleRangesChange(doc, data.visibleRanges);
				}
			}));

		}, d => d.id).recomputeInitiallyAndOnChange(this._store);
	}

	getHistory(): IXtabHistoryEntry[] {
		return [...this.history];
	}

	getRejectedEditHistory(): IXtabHistoryRejectedEditEntry[] {
		return [...this.rejectedEditHistory];
	}

	recordRejectedEdit(docId: DocumentId, base: StringText, edit: StringReplacement): void {
		if (edit.replaceRange.length + edit.newText.length > NesXtabHistoryTracker.MAX_REJECTED_EDIT_CHARS) {
			return;
		}

		const lineEdit = RootedEdit.toLineEdit(new RootedEdit(base, edit.toEdit()));
		const baseLines = base.getLines();
		const hunks: IXtabHistoryDiffHunk[] = [];
		let retainedChars = 0;

		for (const lineEditGroup of groupAdjacentBy(lineEdit.replacements, (left, right) => left.lineRange.endLineNumberExclusive >= right.lineRange.startLineNumber)) {
			const oldLines: string[] = [];
			const newLines: string[] = [];
			let previousEndLineNumberExclusive = lineEditGroup[0].lineRange.startLineNumber;

			for (const replacement of lineEditGroup) {
				if (previousEndLineNumberExclusive < replacement.lineRange.startLineNumber) {
					const unchangedLines = baseLines.slice(previousEndLineNumberExclusive - 1, replacement.lineRange.startLineNumber - 1);
					pushMany(oldLines, unchangedLines);
					pushMany(newLines, unchangedLines);
				}
				pushMany(oldLines, baseLines.slice(replacement.lineRange.startLineNumber - 1, replacement.lineRange.endLineNumberExclusive - 1));
				pushMany(newLines, replacement.newLines);
				previousEndLineNumberExclusive = replacement.lineRange.endLineNumberExclusive;
			}

			if (oldLines.every(line => line.trim().length === 0) && newLines.every(line => line.trim().length === 0)) {
				continue;
			}
			if (oldLines.length === newLines.length && oldLines.every((line, i) => line === newLines[i])) {
				continue;
			}

			retainedChars += oldLines.reduce((total, line) => total + line.length, 0);
			retainedChars += newLines.reduce((total, line) => total + line.length, 0);
			if (retainedChars > NesXtabHistoryTracker.MAX_REJECTED_EDIT_CHARS) {
				// Discard the whole entry so rejected edits are not truncated/incomplete in the prompt.
				return;
			}

			hunks.push({
				startLineNumber: lineEditGroup[0].lineRange.startLineNumber - 1,
				oldLines,
				newLines,
			});
		}

		if (hunks.length === 0) {
			return;
		}

		this.rejectedEditHistory.push({ kind: 'rejectedEdit', docId, ordinal: this.historyEntryOrdinal++, hunks });
		if (this.rejectedEditHistory.size > NesXtabHistoryTracker.MAX_REJECTED_EDIT_HISTORY_SIZE) {
			this.rejectedEditHistory.shift();
		}
	}

	/**
	 * If the document isn't already in history, add it to the history.
	 * If the document is in history either with an edit or selection entry, do not include it again.
	 */
	private handleVisibleRangesChange(doc: IObservableDocument, visibleRangesChange: DocumentSelectionChangedEvent) {
		if (visibleRangesChange.value.length === 0) {
			return;
		}

		const previousRecord = this.idToEntry.get(doc.id);

		// if this's an already known file
		if (previousRecord !== undefined) {
			// if it's an edit entry, do not change anything
			if (previousRecord.entry.kind === 'edit') {
				return;
			}
			// else remove from history to update the visible ranges
			previousRecord.removeFromHistory();
		}

		const entry: IXtabHistoryEntry = { docId: doc.id, kind: 'visibleRanges', ordinal: this.historyEntryOrdinal++, visibleRanges: visibleRangesChange.value, documentContent: doc.value.get() };
		const removeFromHistory = this.history.push(entry);
		this.idToEntry.set(doc.id, { entry, removeFromHistory, lastEditTimestamp: now() });

		this.compactHistory();
	}

	private shouldMerge(lastLineEdit: LineEdit, currentLineEdit: LineEdit, lastEditTimestamp: Instant): boolean {
		const strategy = this.mergeStrategy.get();
		switch (strategy.kind) {
			case DiffHistoryMergeStrategy.SameStartLine:
				return !currentLineEdit.isEmpty()
					&& !lastLineEdit.isEmpty()
					&& lastLineEdit.replacements[0].lineRange.startLineNumber === currentLineEdit.replacements[0].lineRange.startLineNumber;

			case DiffHistoryMergeStrategy.Proximity:
				return areLineEditsWithinProximity(currentLineEdit, lastLineEdit, strategy.lineGap);

			case DiffHistoryMergeStrategy.Hybrid: {
				const withinTimeWindow = (now() - lastEditTimestamp) <= strategy.splitAfterMs;
				return withinTimeWindow && areLineEditsWithinProximity(currentLineEdit, lastLineEdit, strategy.lineGap);
			}
		}
	}

	private handleEdits(doc: IObservableDocument, rootedEdits: DocumentChangedEvent) {
		assert(rootedEdits.previous !== undefined, `Document has previous version`);
		assert(rootedEdits.changes.length === 1, `Expected 1 edit change but got ${rootedEdits.changes.length}`);

		const currentEdit = rootedEdits.changes[0];
		if (currentEdit.replacements.length === 0) {
			return;
		}

		const previousRecord = this.idToEntry.get(doc.id);

		// const currentBase = rootedEdits.value.apply(currentEdit.inverseOnString(rootedEdits.previous.value));
		const currentBase = rootedEdits.previous;
		const currentRootedEdit = new RootedEdit(currentBase, currentEdit);

		if (previousRecord === undefined) {
			this.pushToHistory(doc.id, currentRootedEdit);
			return;
		}

		if (previousRecord.entry.kind === 'visibleRanges') {
			previousRecord.removeFromHistory();
			this.pushToHistory(doc.id, currentRootedEdit);
			return;
		}

		const lastRootedEdit = previousRecord.entry.edit;
		const lastLineEdit = RootedEdit.toLineEdit(lastRootedEdit);
		const currentLineEdit = RootedEdit.toLineEdit(currentRootedEdit);

		if (this.shouldMerge(lastLineEdit, currentLineEdit, previousRecord.lastEditTimestamp)) {
			// merge edits
			previousRecord.removeFromHistory();
			const composedEdit = lastRootedEdit.edit.compose(currentEdit);
			const edit = new RootedEdit(lastRootedEdit.base, composedEdit);
			this.pushToHistory(doc.id, edit);

		} else {
			this.pushToHistory(doc.id, currentRootedEdit);
		}
	}

	private pushToHistory(docId: DocumentId, edit: RootedEdit) {
		const entry: IXtabHistoryEntry = { docId, kind: 'edit', ordinal: this.historyEntryOrdinal++, edit };
		const removeFromHistory = this.history.push(entry);
		this.idToEntry.set(docId, { entry, removeFromHistory, lastEditTimestamp: now() });

		this.compactHistory();
	}

	private compactHistory() {
		if (this.history.size > this.maxHistorySize) {
			const removedEntry = this.history.shift();
			if (removedEntry !== undefined) {
				const lastRecord = this.idToEntry.get(removedEntry.docId);
				if (lastRecord !== undefined && removedEntry === lastRecord.entry) {
					this.idToEntry.delete(removedEntry.docId);
				}
			}
		}
	}
}
