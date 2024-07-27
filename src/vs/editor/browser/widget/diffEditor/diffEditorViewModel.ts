/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ISettableObservable, ITransaction, autorun, autorunWithStore, derived, observableSignal, observableSignalFromEvent, observableValue, transaction, waitForState } from 'vs/base/common/observable';
import { IDiffProviderFactoryService } from 'vs/editor/browser/widget/diffEditor/diffProviderFactoryService';
import { filterWithPrevious } from 'vs/editor/browser/widget/diffEditor/utils';
import { readHotReloadableExport } from 'vs/base/common/hotReloadHelpers';
import { ISerializedLineRange, LineRange, LineRangeSet } from 'vs/editor/common/core/lineRange';
import { DefaultLinesDiffComputer } from 'vs/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer';
import { IDocumentDiff } from 'vs/editor/common/diff/documentDiffProvider';
import { MovedText } from 'vs/editor/common/diff/linesDiffComputer';
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IDiffEditorModel, IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { TextEditInfo } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper';
import { combineTextEditInfos } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos';
import { DiffEditorOptions } from './diffEditorOptions';
import { optimizeSequenceDiffs } from 'vs/editor/common/diff/defaultLinesDiffComputer/heuristicSequenceOptimizations';
import { isDefined } from 'vs/base/common/types';
import { groupAdjacentBy } from 'vs/base/common/arrays';
import { softAssert } from 'vs/base/common/assert';

export class DiffEditorViewModel extends Disposable implements IDiffEditorViewModel {
	private readonly _isDiffUpToDate = observableValue<boolean>(this, false);
	public readonly isDiffUpToDate: IObservable<boolean> = this._isDiffUpToDate;

	private _lastDiff: IDocumentDiff | undefined;
	private readonly _diff = observableValue<DiffState | undefined>(this, undefined);
	public readonly diff: IObservable<DiffState | undefined> = this._diff;

	private readonly _unchangedRegions = observableValue<{ regions: UnchangedRegion[]; originalDecorationIds: string[]; modifiedDecorationIds: string[] } | undefined>(this, undefined);
	public readonly unchangedRegions: IObservable<UnchangedRegion[]> = derived(this, r => {
		if (this._options.hideUnchangedRegions.read(r)) {
			return this._unchangedRegions.read(r)?.regions ?? [];
		} else {
			// Reset state
			transaction(tx => {
				for (const r of this._unchangedRegions.get()?.regions || []) {
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
		const diffProvider = this._diffProviderFactoryService.createDiffProvider({
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
		@IDiffProviderFactoryService private readonly _diffProviderFactoryService: IDiffProviderFactoryService,
	) {
		super();

		this._register(toDisposable(() => this._cancellationTokenSource.cancel()));

		const contentChangedSignal = observableSignal('contentChangedSignal');
		const debouncer = this._register(new RunOnceScheduler(() => contentChangedSignal.trigger(undefined), 200));

		this._register(autorun(reader => {
			/** @description collapse touching unchanged ranges */

			const lastUnchangedRegions = this._unchangedRegions.read(reader);
			if (!lastUnchangedRegions || lastUnchangedRegions.regions.some(r => r.isDragged.read(reader))) {
				return;
			}

			const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds
				.map(id => model.original.getDecorationRange(id))
				.map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
			const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds
				.map(id => model.modified.getDecorationRange(id))
				.map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
			const updatedLastUnchangedRegions = lastUnchangedRegions.regions.map((r, idx) =>
				(!lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx]) ? undefined :
					new UnchangedRegion(
						lastUnchangedRegionsOrigRanges[idx]!.startLineNumber,
						lastUnchangedRegionsModRanges[idx]!.startLineNumber,
						lastUnchangedRegionsOrigRanges[idx]!.length,
						r.visibleLineCountTop.read(reader),
						r.visibleLineCountBottom.read(reader),
					)).filter(isDefined);

			const newRanges: UnchangedRegion[] = [];

			let didChange = false;
			for (const touching of groupAdjacentBy(updatedLastUnchangedRegions, (a, b) => a.getHiddenModifiedRange(reader).endLineNumberExclusive === b.getHiddenModifiedRange(reader).startLineNumber)) {
				if (touching.length > 1) {
					didChange = true;
					const sumLineCount = touching.reduce((sum, r) => sum + r.lineCount, 0);
					const r = new UnchangedRegion(touching[0].originalLineNumber, touching[0].modifiedLineNumber, sumLineCount, touching[0].visibleLineCountTop.get(), touching[touching.length - 1].visibleLineCountBottom.get());
					newRanges.push(r);
				} else {
					newRanges.push(touching[0]);
				}
			}
			if (didChange) {
				const originalDecorationIds = model.original.deltaDecorations(
					lastUnchangedRegions.originalDecorationIds,
					newRanges.map(r => ({ range: r.originalUnchangedRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
				);
				const modifiedDecorationIds = model.modified.deltaDecorations(
					lastUnchangedRegions.modifiedDecorationIds,
					newRanges.map(r => ({ range: r.modifiedUnchangedRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
				);

				transaction(tx => {
					this._unchangedRegions.set(
						{
							regions: newRanges,
							originalDecorationIds,
							modifiedDecorationIds
						},
						tx
					);
				});
			}
		}));

		const updateUnchangedRegions = (result: IDocumentDiff, tx: ITransaction, reader?: IReader) => {
			const newUnchangedRegions = UnchangedRegion.fromDiffs(
				result.changes,
				model.original.getLineCount(),
				model.modified.getLineCount(),
				this._options.hideUnchangedRegionsMinimumLineCount.read(reader),
				this._options.hideUnchangedRegionsContextLineCount.read(reader),
			);

			// Transfer state from cur state
			let visibleRegions: LineRangeMapping[] | undefined = undefined;

			const lastUnchangedRegions = this._unchangedRegions.get();
			if (lastUnchangedRegions) {
				const lastUnchangedRegionsOrigRanges = lastUnchangedRegions.originalDecorationIds
					.map(id => model.original.getDecorationRange(id))
					.map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
				const lastUnchangedRegionsModRanges = lastUnchangedRegions.modifiedDecorationIds
					.map(id => model.modified.getDecorationRange(id))
					.map(r => r ? LineRange.fromRangeInclusive(r) : undefined);
				const updatedLastUnchangedRegions = filterWithPrevious(
					lastUnchangedRegions.regions
						.map((r, idx) => {
							if (!lastUnchangedRegionsOrigRanges[idx] || !lastUnchangedRegionsModRanges[idx]) { return undefined; }
							const length = lastUnchangedRegionsOrigRanges[idx]!.length;
							return new UnchangedRegion(
								lastUnchangedRegionsOrigRanges[idx]!.startLineNumber,
								lastUnchangedRegionsModRanges[idx]!.startLineNumber,
								length,
								// The visible area can shrink by edits -> we have to account for this
								Math.min(r.visibleLineCountTop.get(), length),
								Math.min(r.visibleLineCountBottom.get(), length - r.visibleLineCountTop.get()),
							);
						}
						).filter(isDefined),
					(cur, prev) => !prev || (cur.modifiedLineNumber >= prev.modifiedLineNumber + prev.lineCount && cur.originalLineNumber >= prev.originalLineNumber + prev.lineCount)
				);

				let hiddenRegions = updatedLastUnchangedRegions.map(r => new LineRangeMapping(r.getHiddenOriginalRange(reader), r.getHiddenModifiedRange(reader)));
				hiddenRegions = LineRangeMapping.clip(hiddenRegions, LineRange.ofLength(1, model.original.getLineCount()), LineRange.ofLength(1, model.modified.getLineCount()));
				visibleRegions = LineRangeMapping.inverse(hiddenRegions, model.original.getLineCount(), model.modified.getLineCount());
			}

			const newUnchangedRegions2 = [];
			if (visibleRegions) {
				for (const r of newUnchangedRegions) {
					const intersecting = visibleRegions.filter(f => f.original.intersectsStrict(r.originalUnchangedRange) && f.modified.intersectsStrict(r.modifiedUnchangedRange));
					newUnchangedRegions2.push(...r.setVisibleRanges(intersecting, tx));
				}
			} else {
				newUnchangedRegions2.push(...newUnchangedRegions);
			}

			const originalDecorationIds = model.original.deltaDecorations(
				lastUnchangedRegions?.originalDecorationIds || [],
				newUnchangedRegions2.map(r => ({ range: r.originalUnchangedRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
			);
			const modifiedDecorationIds = model.modified.deltaDecorations(
				lastUnchangedRegions?.modifiedDecorationIds || [],
				newUnchangedRegions2.map(r => ({ range: r.modifiedUnchangedRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
			);

			this._unchangedRegions.set(
				{
					regions: newUnchangedRegions2,
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

			this._isDiffUpToDate.set(false, undefined);
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

			this._isDiffUpToDate.set(false, undefined);
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
			if (model.original.isDisposed() || model.modified.isDisposed()) {
				// TODO@hediet fishy?
				return;
			}
			result = normalizeDocumentDiff(result, model.original, model.modified);
			result = applyOriginalEdits(result, originalTextEditInfos, model.original, model.modified) ?? result;
			result = applyModifiedEdits(result, modifiedTextEditInfos, model.original, model.modified) ?? result;

			transaction(tx => {
				/** @description write diff result */
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

	public ensureModifiedLineIsVisible(lineNumber: number, preference: RevealPreference, tx: ITransaction | undefined): void {
		if (this.diff.get()?.mappings.length === 0) {
			return;
		}
		const unchangedRegions = this._unchangedRegions.get()?.regions || [];
		for (const r of unchangedRegions) {
			if (r.getHiddenModifiedRange(undefined).contains(lineNumber)) {
				r.showModifiedLine(lineNumber, preference, tx);
				return;
			}
		}
	}

	public ensureOriginalLineIsVisible(lineNumber: number, preference: RevealPreference, tx: ITransaction | undefined): void {
		if (this.diff.get()?.mappings.length === 0) {
			return;
		}
		const unchangedRegions = this._unchangedRegions.get()?.regions || [];
		for (const r of unchangedRegions) {
			if (r.getHiddenOriginalRange(undefined).contains(lineNumber)) {
				r.showOriginalLine(lineNumber, preference, tx);
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
			collapsedRegions: regions?.regions.map(r => ({ range: r.getHiddenModifiedRange(undefined).serialize() }))
		};
	}

	public restoreSerializedState(state: SerializedState): void {
		const ranges = state.collapsedRegions?.map(r => LineRange.deserialize(r.range));
		const regions = this._unchangedRegions.get();
		if (!regions || !ranges) {
			return;
		}
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
		originalRange.startColumn === 1 && modifiedRange.startColumn === 1 &&
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
	collapsedRegions: { range: ISerializedLineRange }[] | undefined;
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

	public readonly isDragged = observableValue<undefined | 'bottom' | 'top'>(this, undefined);

	constructor(
		public readonly originalLineNumber: number,
		public readonly modifiedLineNumber: number,
		public readonly lineCount: number,
		visibleLineCountTop: number,
		visibleLineCountBottom: number,
	) {
		const visibleLineCountTop2 = Math.max(Math.min(visibleLineCountTop, this.lineCount), 0);
		const visibleLineCountBottom2 = Math.max(Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop), 0);

		softAssert(visibleLineCountTop === visibleLineCountTop2);
		softAssert(visibleLineCountBottom === visibleLineCountBottom2);

		this._visibleLineCountTop.set(visibleLineCountTop2, undefined);
		this._visibleLineCountBottom.set(visibleLineCountBottom2, undefined);
	}

	public setVisibleRanges(visibleRanges: LineRangeMapping[], tx: ITransaction): UnchangedRegion[] {
		const result: UnchangedRegion[] = [];

		const hiddenModified = new LineRangeSet(visibleRanges.map(r => r.modified)).subtractFrom(this.modifiedUnchangedRange);

		let originalStartLineNumber = this.originalLineNumber;
		let modifiedStartLineNumber = this.modifiedLineNumber;
		const modifiedEndLineNumberEx = this.modifiedLineNumber + this.lineCount;
		if (hiddenModified.ranges.length === 0) {
			this.showAll(tx);
			result.push(this);
		} else {
			let i = 0;
			for (const r of hiddenModified.ranges) {
				const isLast = i === hiddenModified.ranges.length - 1;
				i++;

				const length = (isLast ? modifiedEndLineNumberEx : r.endLineNumberExclusive) - modifiedStartLineNumber;

				const newR = new UnchangedRegion(originalStartLineNumber, modifiedStartLineNumber, length, 0, 0);
				newR.setHiddenModifiedRange(r, tx);
				result.push(newR);

				originalStartLineNumber = newR.originalUnchangedRange.endLineNumberExclusive;
				modifiedStartLineNumber = newR.modifiedUnchangedRange.endLineNumberExclusive;
			}
		}

		return result;
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

	public showModifiedLine(lineNumber: number, preference: RevealPreference, tx: ITransaction | undefined): void {
		const top = lineNumber + 1 - (this.modifiedLineNumber + this._visibleLineCountTop.get());
		const bottom = (this.modifiedLineNumber - this._visibleLineCountBottom.get() + this.lineCount) - lineNumber;
		if (preference === RevealPreference.FromCloserSide && top < bottom || preference === RevealPreference.FromTop) {
			this._visibleLineCountTop.set(this._visibleLineCountTop.get() + top, tx);
		} else {
			this._visibleLineCountBottom.set(this._visibleLineCountBottom.get() + bottom, tx);
		}
	}

	public showOriginalLine(lineNumber: number, preference: RevealPreference, tx: ITransaction | undefined): void {
		const top = lineNumber - this.originalLineNumber;
		const bottom = (this.originalLineNumber + this.lineCount) - lineNumber;
		if (preference === RevealPreference.FromCloserSide && top < bottom || preference === RevealPreference.FromTop) {
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

export const enum RevealPreference {
	FromCloserSide,
	FromTop,
	FromBottom,
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
