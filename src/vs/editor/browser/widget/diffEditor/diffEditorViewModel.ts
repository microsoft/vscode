/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ISettableObservable, ITransaction, autorunWithStore, derived, observableSignal, observableSignalFromEvent, observableValue, transaction, waitForState } from 'vs/base/common/observable';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';
import { ISerializedLineRange, LineRange } from 'vs/editor/common/core/lineRange';
import { DefaultLinesDiffComputer } from 'vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer';
import { IDocumentDiff } from 'vs/editor/common/diff/documentDiffProvider';
import { MovedText } from 'vs/editor/common/diff/linesDiffComputer';
import { DetailedLineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IDiffEditorModel, IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { TextEditInfo } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper';
import { combineTextEditInfos } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos';
import { DiffEditorOptions } from './diffEditorOptions';
import { optimizeSequenceDiffs } from 'vs/editor/common/diff/defaultLinesDiffComputer/heuristicSequenceOptimizations';

export class DiffEditorViewModel extends Disposable implements IDiffEditorViewModel {
	private readonly _isDiffUpToDate = observableValue<boolean>(this, false);
	public readonly isDiffUpToDate: IObservable<boolean> = this._isDiffUpToDate;

	private _lastDiff: IDocumentDiff | undefined;
	private readonly _diff = observableValue<DiffState | undefined>(this, undefined);
	public readonly diff: IObservable<DiffState | undefined> = this._diff;

	private readonly _unchangedRegions = observableValue<{ regions: UnchangedRegion[]; originalDecorationIds: string[]; modifiedDecorationIds: string[] }>(
		this,
		{ regions: [], originalDecorationIds: [], modifiedDecorationIds: [] }
	);
	public readonly unchangedRegions: IObservable<UnchangedRegion[]> = derived(this, r => {
		if (this._options.hideUnchangedRegions.read(r)) {
			return this._unchangedRegions.read(r).regions;
		} else {
			// Reset state
			transaction(tx => {
				for (const r of this._unchangedRegions.get().regions) {
					r.collapseAll(tx);
				}
			});
			return [];
		}
	}
	);

	public readonly movedTextToCompare = observableValue<MovedText | undefined>(this, undefined);

	private readonly _activeMovedText = observableValue<MovedText | undefined>(this, undefined);
	private readonly _hoveredMovedText = observableValue<MovedText | undefined>(this, undefined);


	public readonly activeMovedText = derived(this, r => this.movedTextToCompare.read(r) ?? this._hoveredMovedText.read(r) ?? this._activeMovedText.read(r));

	public setActiveMovedText(movedText: MovedText | undefined): void {
		this._activeMovedText.set(movedText, undefined);
	}

	public setHoveredMovedText(movedText: MovedText | undefined): void {
		this._hoveredMovedText.set(movedText, undefined);
	}

	private readonly _cancellationTokenSource = new CancellationTokenSource();

	private readonly _diffProvider = derived(this, reader => {
		const diffProvider = this._diffProviderFactoryService.createDiffProvider(this._editor, {
			diffAlgorithm: this._options.diffAlgorithm.read(reader)
		});
		const onChangeSignal = observableSignalFromEvent('onDidChange', diffProvider.onDidChange);
		return {
			diffProvider,
			onChangeSignal,
		};
	});

	constructor(
		public readonly model: IDiffEditorModel,
		private readonly _options: DiffEditorOptions,
		private readonly _editor: IDiffEditor,
		@IDiffProviderFactoryService private readonly _diffProviderFactoryService: IDiffProviderFactoryService,
	) {
		super();

		this._register(toDisposable(() => this._cancellationTokenSource.cancel()));

		const contentChangedSignal = observableSignal('contentChangedSignal');
		const debouncer = this._register(new RunOnceScheduler(() => contentChangedSignal.trigger(undefined), 200));

		const updateUnchangedRegions = (result: IDocumentDiff, tx: ITransaction, reader?: IReader) => {
			const newUnchangedRegions = UnchangedRegion.fromDiffs(
				result.changes,
				model.original.getLineCount(),
				model.modified.getLineCount(),
				this._options.hideUnchangedRegionsMinimumLineCount.read(reader),
				this._options.hideUnchangedRegionsContextLineCount.read(reader),
			);

			// Transfer state from cur state
			const lastUnchangedRegions = this._unchangedRegions.get();
			const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds
				.map(id => model.original.getDecorationRange(id))
				.filter(r => !!r)
				.map(r => LineRange.fromRange(r!));
			const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds
				.map(id => model.modified.getDecorationRange(id))
				.filter(r => !!r)
				.map(r => LineRange.fromRange(r!));

			const originalDecorationIds = model.original.deltaDecorations(
				lastUnchangedRegions.originalDecorationIds,
				newUnchangedRegions.map(r => ({ range: r.originalUnchangedRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
			);
			const modifiedDecorationIds = model.modified.deltaDecorations(
				lastUnchangedRegions.modifiedDecorationIds,
				newUnchangedRegions.map(r => ({ range: r.modifiedUnchangedRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
			);


			for (const r of newUnchangedRegions) {
				for (let i = 0; i < lastUnchangedRegions.regions.length; i++) {
					if (r.originalUnchangedRange.intersectsStrict(lastUnchangedRegionsOrigRanges[i])
						&& r.modifiedUnchangedRange.intersectsStrict(lastUnchangedRegionsModRanges[i])) {
						r.setHiddenModifiedRange(lastUnchangedRegions.regions[i].getHiddenModifiedRange(undefined), tx);
						break;
					}
				}
			}
			this._unchangedRegions.set(
				{
					regions: newUnchangedRegions,
					originalDecorationIds,
					modifiedDecorationIds
				},
				tx
			);
		};

		this._register(model.modified.onDidChangeContent((e) => {
			const diff = this._diff.get();
			if (diff) {
				const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
				const result = applyModifiedEdits(this._lastDiff!, textEdits, model.original, model.modified);
				if (result) {
					this._lastDiff = result;
					transaction(tx => {
						this._diff.set(DiffState.fromDiffResult(this._lastDiff!), tx);
						updateUnchangedRegions(result, tx);
						const currentSyncedMovedText = this.movedTextToCompare.get();
						this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff!.moves.find(m => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : undefined, tx);
					});
				}
			}

			debouncer.schedule();
		}));
		this._register(model.original.onDidChangeContent((e) => {
			const diff = this._diff.get();
			if (diff) {
				const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
				const result = applyOriginalEdits(this._lastDiff!, textEdits, model.original, model.modified);
				if (result) {
					this._lastDiff = result;
					transaction(tx => {
						this._diff.set(DiffState.fromDiffResult(this._lastDiff!), tx);
						updateUnchangedRegions(result, tx);
						const currentSyncedMovedText = this.movedTextToCompare.get();
						this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff!.moves.find(m => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : undefined, tx);
					});
				}
			}

			debouncer.schedule();
		}));

		this._register(autorunWithStore(async (reader, store) => {
			/** @description compute diff */

			// So that they get recomputed when these settings change
			this._options.hideUnchangedRegionsMinimumLineCount.read(reader);
			this._options.hideUnchangedRegionsContextLineCount.read(reader);

			debouncer.cancel();
			contentChangedSignal.read(reader);
			const documentDiffProvider = this._diffProvider.read(reader);
			documentDiffProvider.onChangeSignal.read(reader);

			readHotReloadableExport(DefaultLinesDiffComputer, reader);
			readHotReloadableExport(optimizeSequenceDiffs, reader);

			this._isDiffUpToDate.set(false, undefined);

			let originalTextEditInfos: TextEditInfo[] = [];
			store.add(model.original.onDidChangeContent((e) => {
				const edits = TextEditInfo.fromModelContentChanges(e.changes);
				originalTextEditInfos = combineTextEditInfos(originalTextEditInfos, edits);
			}));

			let modifiedTextEditInfos: TextEditInfo[] = [];
			store.add(model.modified.onDidChangeContent((e) => {
				const edits = TextEditInfo.fromModelContentChanges(e.changes);
				modifiedTextEditInfos = combineTextEditInfos(modifiedTextEditInfos, edits);
			}));

			let result = await documentDiffProvider.diffProvider.computeDiff(model.original, model.modified, {
				ignoreTrimWhitespace: this._options.ignoreTrimWhitespace.read(reader),
				maxComputationTimeMs: this._options.maxComputationTimeMs.read(reader),
				computeMoves: this._options.showMoves.read(reader),
			}, this._cancellationTokenSource.token);

			if (this._cancellationTokenSource.token.isCancellationRequested) {
				return;
			}

			result = normalizeDocumentDiff(result, model.original, model.modified);
			result = applyOriginalEdits(result, originalTextEditInfos, model.original, model.modified) ?? result;
			result = applyModifiedEdits(result, modifiedTextEditInfos, model.original, model.modified) ?? result;

			transaction(tx => {
				updateUnchangedRegions(result, tx);

				this._lastDiff = result;
				const state = DiffState.fromDiffResult(result);
				this._diff.set(state, tx);
				this._isDiffUpToDate.set(true, tx);
				const currentSyncedMovedText = this.movedTextToCompare.get();
				this.movedTextToCompare.set(currentSyncedMovedText ? this._lastDiff.moves.find(m => m.lineRangeMapping.modified.intersect(currentSyncedMovedText.lineRangeMapping.modified)) : undefined, tx);
			});
		}));
	}

	public ensureModifiedLineIsVisible(lineNumber: number, tx: ITransaction | undefined): void {
		if (this.diff.get()?.mappings.length === 0) {
			return;
		}
		const unchangedRegions = this._unchangedRegions.get().regions;
		for (const r of unchangedRegions) {
			if (r.getHiddenModifiedRange(undefined).contains(lineNumber)) {
				r.showModifiedLine(lineNumber, tx);
				return;
			}
		}
	}

	public ensureOriginalLineIsVisible(lineNumber: number, tx: ITransaction | undefined): void {
		if (this.diff.get()?.mappings.length === 0) {
			return;
		}
		const unchangedRegions = this._unchangedRegions.get().regions;
		for (const r of unchangedRegions) {
			if (r.getHiddenOriginalRange(undefined).contains(lineNumber)) {
				r.showOriginalLine(lineNumber, tx);
				return;
			}
		}
	}

	public async waitForDiff(): Promise<void> {
		await waitForState(this.isDiffUpToDate, s => s);
	}

	public serializeState(): SerializedState {
		const regions = this._unchangedRegions.get();
		return {
			collapsedRegions: regions.regions.map(r => ({ range: r.getHiddenModifiedRange(undefined).serialize() }))
		};
	}

	public restoreSerializedState(state: SerializedState): void {
		const ranges = state.collapsedRegions.map(r => LineRange.deserialize(r.range));
		const regions = this._unchangedRegions.get();
		transaction(tx => {
			for (const r of regions.regions) {
				for (const range of ranges) {
					if (r.modifiedUnchangedRange.intersect(range)) {
						r.setHiddenModifiedRange(range, tx);
						break;
					}
				}
			}
		});
	}
}

function normalizeDocumentDiff(diff: IDocumentDiff, original: ITextModel, modified: ITextModel): IDocumentDiff {
	return {
		changes: diff.changes.map(c => new DetailedLineRangeMapping(
			c.original,
			c.modified,
			c.innerChanges ? c.innerChanges.map(i => normalizeRangeMapping(i, original, modified)) : undefined
		)),
		moves: diff.moves,
		identical: diff.identical,
		quitEarly: diff.quitEarly,
	};
}

function normalizeRangeMapping(rangeMapping: RangeMapping, original: ITextModel, modified: ITextModel): RangeMapping {
	let originalRange = rangeMapping.originalRange;
	let modifiedRange = rangeMapping.modifiedRange;
	if (
		(originalRange.endColumn !== 1 || modifiedRange.endColumn !== 1) &&
		originalRange.endColumn === original.getLineMaxColumn(originalRange.endLineNumber)
		&& modifiedRange.endColumn === modified.getLineMaxColumn(modifiedRange.endLineNumber)
		&& originalRange.endLineNumber < original.getLineCount()
		&& modifiedRange.endLineNumber < modified.getLineCount()
	) {
		originalRange = originalRange.setEndPosition(originalRange.endLineNumber + 1, 1);
		modifiedRange = modifiedRange.setEndPosition(modifiedRange.endLineNumber + 1, 1);
	}
	return new RangeMapping(originalRange, modifiedRange);
}

interface SerializedState {
	collapsedRegions: { range: ISerializedLineRange }[];
}

export class DiffState {
	public static fromDiffResult(result: IDocumentDiff): DiffState {
		return new DiffState(
			result.changes.map(c => new DiffMapping(c)),
			result.moves || [],
			result.identical,
			result.quitEarly,
		);
	}

	constructor(
		public readonly mappings: readonly DiffMapping[],
		public readonly movedTexts: readonly MovedText[],
		public readonly identical: boolean,
		public readonly quitEarly: boolean,
	) { }
}

export class DiffMapping {
	constructor(
		readonly lineRangeMapping: DetailedLineRangeMapping,
	) {
		/*
		readonly movedTo: MovedText | undefined,
		readonly movedFrom: MovedText | undefined,

		if (movedTo) {
			assertFn(() =>
				movedTo.lineRangeMapping.modifiedRange.equals(lineRangeMapping.modifiedRange)
				&& lineRangeMapping.originalRange.isEmpty
				&& !movedFrom
			);
		} else if (movedFrom) {
			assertFn(() =>
				movedFrom.lineRangeMapping.originalRange.equals(lineRangeMapping.originalRange)
				&& lineRangeMapping.modifiedRange.isEmpty
				&& !movedTo
			);
		}
		*/
	}
}

export class UnchangedRegion {
	public static fromDiffs(
		changes: readonly DetailedLineRangeMapping[],
		originalLineCount: number,
		modifiedLineCount: number,
		minHiddenLineCount: number,
		minContext: number,
	): UnchangedRegion[] {
		const inversedMappings = DetailedLineRangeMapping.inverse(changes, originalLineCount, modifiedLineCount);
		const result: UnchangedRegion[] = [];

		for (const mapping of inversedMappings) {
			let origStart = mapping.original.startLineNumber;
			let modStart = mapping.modified.startLineNumber;
			let length = mapping.original.length;

			const atStart = origStart === 1 && modStart === 1;
			const atEnd = origStart + length === originalLineCount + 1 && modStart + length === modifiedLineCount + 1;

			if ((atStart || atEnd) && length >= minContext + minHiddenLineCount) {
				if (atStart && !atEnd) {
					length -= minContext;
				}
				if (atEnd && !atStart) {
					origStart += minContext;
					modStart += minContext;
					length -= minContext;
				}
				result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
			} else if (length >= minContext * 2 + minHiddenLineCount) {
				origStart += minContext;
				modStart += minContext;
				length -= minContext * 2;
				result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
			}
		}

		return result;
	}

	public get originalUnchangedRange(): LineRange {
		return LineRange.ofLength(this.originalLineNumber, this.lineCount);
	}

	public get modifiedUnchangedRange(): LineRange {
		return LineRange.ofLength(this.modifiedLineNumber, this.lineCount);
	}

	private readonly _visibleLineCountTop = observableValue<number>(this, 0);
	public readonly visibleLineCountTop: ISettableObservable<number> = this._visibleLineCountTop;

	private readonly _visibleLineCountBottom = observableValue<number>(this, 0);
	public readonly visibleLineCountBottom: ISettableObservable<number> = this._visibleLineCountBottom;

	private readonly _shouldHideControls = derived(this, reader => /** @description isVisible */
		this.visibleLineCountTop.read(reader) + this.visibleLineCountBottom.read(reader) === this.lineCount && !this.isDragged.read(reader));

	public readonly isDragged = observableValue<boolean>(this, false);

	constructor(
		public readonly originalLineNumber: number,
		public readonly modifiedLineNumber: number,
		public readonly lineCount: number,
		visibleLineCountTop: number,
		visibleLineCountBottom: number,
	) {
		this._visibleLineCountTop.set(visibleLineCountTop, undefined);
		this._visibleLineCountBottom.set(visibleLineCountBottom, undefined);
	}

	public shouldHideControls(reader: IReader | undefined): boolean {
		return this._shouldHideControls.read(reader);
	}

	public getHiddenOriginalRange(reader: IReader | undefined): LineRange {
		return LineRange.ofLength(
			this.originalLineNumber + this._visibleLineCountTop.read(reader),
			this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader),
		);
	}

	public getHiddenModifiedRange(reader: IReader | undefined): LineRange {
		return LineRange.ofLength(
			this.modifiedLineNumber + this._visibleLineCountTop.read(reader),
			this.lineCount - this._visibleLineCountTop.read(reader) - this._visibleLineCountBottom.read(reader),
		);
	}

	public setHiddenModifiedRange(range: LineRange, tx: ITransaction) {
		const visibleLineCountTop = range.startLineNumber - this.modifiedLineNumber;
		const visibleLineCountBottom = (this.modifiedLineNumber + this.lineCount) - range.endLineNumberExclusive;
		this.setState(visibleLineCountTop, visibleLineCountBottom, tx);
	}

	public getMaxVisibleLineCountTop() {
		return this.lineCount - this._visibleLineCountBottom.get();
	}

	public getMaxVisibleLineCountBottom() {
		return this.lineCount - this._visibleLineCountTop.get();
	}

	public showMoreAbove(count = 10, tx: ITransaction | undefined): void {
		const maxVisibleLineCountTop = this.getMaxVisibleLineCountTop();
		this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + count, maxVisibleLineCountTop), tx);
	}

	public showMoreBelow(count = 10, tx: ITransaction | undefined): void {
		const maxVisibleLineCountBottom = this.lineCount - this._visibleLineCountTop.get();
		this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + count, maxVisibleLineCountBottom), tx);
	}

	public showAll(tx: ITransaction | undefined): void {
		this._visibleLineCountBottom.set(this.lineCount - this._visibleLineCountTop.get(), tx);
	}

	public showModifiedLine(lineNumber: number, tx: ITransaction | undefined): void {
		const top = lineNumber + 1 - (this.modifiedLineNumber + this._visibleLineCountTop.get());
		const bottom = (this.modifiedLineNumber - this._visibleLineCountBottom.get() + this.lineCount) - lineNumber;
		if (top < bottom) {
			this._visibleLineCountTop.set(this._visibleLineCountTop.get() + top, tx);
		} else {
			this._visibleLineCountBottom.set(this._visibleLineCountBottom.get() + bottom, tx);
		}
	}

	public showOriginalLine(lineNumber: number, tx: ITransaction | undefined): void {
		const top = lineNumber - this.originalLineNumber;
		const bottom = (this.originalLineNumber + this.lineCount) - lineNumber;
		if (top < bottom) {
			this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + bottom - top, this.getMaxVisibleLineCountTop()), tx);
		} else {
			this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + top - bottom, this.getMaxVisibleLineCountBottom()), tx);
		}
	}

	public collapseAll(tx: ITransaction | undefined): void {
		this._visibleLineCountTop.set(0, tx);
		this._visibleLineCountBottom.set(0, tx);
	}

	public setState(visibleLineCountTop: number, visibleLineCountBottom: number, tx: ITransaction | undefined): void {
		visibleLineCountTop = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
		visibleLineCountBottom = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);

		this._visibleLineCountTop.set(visibleLineCountTop, tx);
		this._visibleLineCountBottom.set(visibleLineCountBottom, tx);
	}
}

function applyOriginalEdits(diff: IDocumentDiff, textEdits: TextEditInfo[], originalTextModel: ITextModel, modifiedTextModel: ITextModel): IDocumentDiff | undefined {
	return undefined;
	/*
	TODO@hediet
	if (textEdits.length === 0) {
		return diff;
	}

	const diff2 = flip(diff);
	const diff3 = applyModifiedEdits(diff2, textEdits, modifiedTextModel, originalTextModel);
	if (!diff3) {
		return undefined;
	}
	return flip(diff3);*/
}
/*
function flip(diff: IDocumentDiff): IDocumentDiff {
	return {
		changes: diff.changes.map(c => c.flip()),
		moves: diff.moves.map(m => m.flip()),
		identical: diff.identical,
		quitEarly: diff.quitEarly,
	};
}
*/
function applyModifiedEdits(diff: IDocumentDiff, textEdits: TextEditInfo[], originalTextModel: ITextModel, modifiedTextModel: ITextModel): IDocumentDiff | undefined {
	return undefined;
	/*
	TODO@hediet
	if (textEdits.length === 0) {
		return diff;
	}
	if (diff.changes.some(c => !c.innerChanges) || diff.moves.length > 0) {
		// TODO support these cases
		return undefined;
	}

	const changes = applyModifiedEditsToLineRangeMappings(diff.changes, textEdits, originalTextModel, modifiedTextModel);

	const moves = diff.moves.map(m => {
		const newModifiedRange = applyEditToLineRange(m.lineRangeMapping.modified, textEdits);
		return newModifiedRange ? new MovedText(
			new SimpleLineRangeMapping(m.lineRangeMapping.original, newModifiedRange),
			applyModifiedEditsToLineRangeMappings(m.changes, textEdits, originalTextModel, modifiedTextModel),
		) : undefined;
	}).filter(isDefined);

	return {
		identical: false,
		quitEarly: false,
		changes,
		moves,
	};*/
}
/*
function applyEditToLineRange(range: LineRange, textEdits: TextEditInfo[]): LineRange | undefined {
	let rangeStartLineNumber = range.startLineNumber;
	let rangeEndLineNumberEx = range.endLineNumberExclusive;

	for (let i = textEdits.length - 1; i >= 0; i--) {
		const textEdit = textEdits[i];
		const textEditStartLineNumber = lengthGetLineCount(textEdit.startOffset) + 1;
		const textEditEndLineNumber = lengthGetLineCount(textEdit.endOffset) + 1;
		const newLengthLineCount = lengthGetLineCount(textEdit.newLength);
		const delta = newLengthLineCount - (textEditEndLineNumber - textEditStartLineNumber);

		if (textEditEndLineNumber < rangeStartLineNumber) {
			// the text edit is before us
			rangeStartLineNumber += delta;
			rangeEndLineNumberEx += delta;
		} else if (textEditStartLineNumber > rangeEndLineNumberEx) {
			// the text edit is after us
			// NOOP
		} else if (textEditStartLineNumber < rangeStartLineNumber && rangeEndLineNumberEx < textEditEndLineNumber) {
			// the range is fully contained in the text edit
			return undefined;
		} else if (textEditStartLineNumber < rangeStartLineNumber && textEditEndLineNumber <= rangeEndLineNumberEx) {
			// the text edit ends inside our range
			rangeStartLineNumber = textEditEndLineNumber + 1;
			rangeStartLineNumber += delta;
			rangeEndLineNumberEx += delta;
		} else if (rangeStartLineNumber <= textEditStartLineNumber && textEditEndLineNumber < rangeStartLineNumber) {
			// the text edit starts inside our range
			rangeEndLineNumberEx = textEditStartLineNumber;
		} else {
			rangeEndLineNumberEx += delta;
		}
	}

	return new LineRange(rangeStartLineNumber, rangeEndLineNumberEx);
}

function applyModifiedEditsToLineRangeMappings(changes: readonly LineRangeMapping[], textEdits: TextEditInfo[], originalTextModel: ITextModel, modifiedTextModel: ITextModel): LineRangeMapping[] {
	const diffTextEdits = changes.flatMap(c => c.innerChanges!.map(c => new TextEditInfo(
		positionToLength(c.originalRange.getStartPosition()),
		positionToLength(c.originalRange.getEndPosition()),
		lengthOfRange(c.modifiedRange).toLength(),
	)));

	const combined = combineTextEditInfos(diffTextEdits, textEdits);

	let lastOriginalEndOffset = lengthZero;
	let lastModifiedEndOffset = lengthZero;
	const rangeMappings = combined.map(c => {
		const modifiedStartOffset = lengthAdd(lastModifiedEndOffset, lengthDiffNonNegative(lastOriginalEndOffset, c.startOffset));
		lastOriginalEndOffset = c.endOffset;
		lastModifiedEndOffset = lengthAdd(modifiedStartOffset, c.newLength);

		return new RangeMapping(
			Range.fromPositions(lengthToPosition(c.startOffset), lengthToPosition(c.endOffset)),
			Range.fromPositions(lengthToPosition(modifiedStartOffset), lengthToPosition(lastModifiedEndOffset)),
		);
	});

	const newChanges = lineRangeMappingFromRangeMappings(
		rangeMappings,
		originalTextModel.getLinesContent(),
		modifiedTextModel.getLinesContent(),
	);
	return newChanges;
}
*/
