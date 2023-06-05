/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ITransaction, derived, observableSignal, observableSignalFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { autorunWithStore2 } from 'vs/base/common/observableImpl/autorun';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { IDocumentDiff, IDocumentDiffProvider } from 'vs/editor/common/diff/documentDiffProvider';
import { LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/linesDiffComputer';
import { lineRangeMappingFromRangeMappings } from 'vs/editor/common/diff/standardLinesDiffComputer';
import { IDiffEditorModel } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { TextEditInfo } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/beforeEditPositionMapper';
import { combineTextEditInfos } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos';
import { lengthAdd, lengthDiffNonNegative, lengthOfRange, lengthToPosition, lengthZero, positionToLength } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/length';

export class DiffModel extends Disposable {
	private readonly _isDiffUpToDate = observableValue<boolean>('isDiffUpToDate', false);
	public readonly isDiffUpToDate: IObservable<boolean> = this._isDiffUpToDate;

	private readonly _diff = observableValue<IDocumentDiff | undefined>('diff', undefined);
	public readonly diff: IObservable<IDocumentDiff | undefined> = this._diff;

	private readonly _unchangedRegions = observableValue<{ regions: UnchangedRegion[]; originalDecorationIds: string[]; modifiedDecorationIds: string[] }>('unchangedRegion', { regions: [], originalDecorationIds: [], modifiedDecorationIds: [] });
	public readonly unchangedRegions: IObservable<UnchangedRegion[]> = derived('unchangedRegions', r =>
		this.hideUnchangedRegions.read(r) ? this._unchangedRegions.read(r).regions : []
	);

	constructor(
		model: IDiffEditorModel,
		ignoreTrimWhitespace: IObservable<boolean>,
		maxComputationTimeMs: IObservable<number>,
		private readonly hideUnchangedRegions: IObservable<boolean>,
		documentDiffProvider: IDocumentDiffProvider,
	) {
		super();

		const contentChangedSignal = observableSignal('contentChangedSignal');
		const debouncer = this._register(new RunOnceScheduler(() => contentChangedSignal.trigger(undefined), 200));
		this._register(model.modified.onDidChangeContent((e) => {
			const diff = this._diff.get();
			if (!diff) {
				return;
			}
			const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
			this._diff.set(
				applyModifiedEdits(diff, textEdits, model.original, model.modified),
				undefined
			);
			debouncer.schedule();
		}));
		this._register(model.original.onDidChangeContent((e) => {
			const diff = this._diff.get();
			if (!diff) {
				return;
			}
			const textEdits = TextEditInfo.fromModelContentChanges(e.changes);
			this._diff.set(
				applyOriginalEdits(diff, textEdits, model.original, model.modified),
				undefined
			);
			debouncer.schedule();
		}));

		const documentDiffProviderOptionChanged = observableSignalFromEvent('documentDiffProviderOptionChanged', documentDiffProvider.onDidChange);

		this._register(autorunWithStore2('compute diff', async (reader, store) => {
			debouncer.cancel();
			contentChangedSignal.read(reader);

			documentDiffProviderOptionChanged.read(reader);
			const ignoreTrimWhitespaceVal = ignoreTrimWhitespace.read(reader);
			const maxComputationTimeMsVal = maxComputationTimeMs.read(reader);

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

			let result = await documentDiffProvider.computeDiff(model.original, model.modified, {
				ignoreTrimWhitespace: ignoreTrimWhitespaceVal,
				maxComputationTimeMs: maxComputationTimeMsVal,
			});

			result = applyOriginalEdits(result, originalTextEditInfos, model.original, model.modified);
			result = applyModifiedEdits(result, modifiedTextEditInfos, model.original, model.modified);

			const newUnchangedRegions = UnchangedRegion.fromDiffs(result.changes, model.original.getLineCount(), model.modified.getLineCount());

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

			for (const r of newUnchangedRegions) {
				for (let i = 0; i < lastUnchangedRegions.regions.length; i++) {
					if (r.originalRange.intersectsStrict(lastUnchangedRegionsOrigRanges[i])
						&& r.modifiedRange.intersectsStrict(lastUnchangedRegionsModRanges[i])) {
						r.setState(
							lastUnchangedRegions.regions[i].visibleLineCountTop.get(),
							lastUnchangedRegions.regions[i].visibleLineCountBottom.get(),
							undefined,
						);
						break;
					}
				}
			}

			const originalDecorationIds = model.original.deltaDecorations(
				lastUnchangedRegions.originalDecorationIds,
				newUnchangedRegions.map(r => ({ range: r.originalRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
			);
			const modifiedDecorationIds = model.modified.deltaDecorations(
				lastUnchangedRegions.modifiedDecorationIds,
				newUnchangedRegions.map(r => ({ range: r.modifiedRange.toInclusiveRange()!, options: { description: 'unchanged' } }))
			);

			transaction(tx => {
				this._diff.set(result, tx);
				this._isDiffUpToDate.set(true, tx);

				this._unchangedRegions.set(
					{
						regions: newUnchangedRegions,
						originalDecorationIds,
						modifiedDecorationIds
					},
					tx
				);
			});
		}));
	}

	public revealModifiedLine(lineNumber: number, tx: ITransaction): void {
		const unchangedRegions = this._unchangedRegions.get().regions;
		for (const r of unchangedRegions) {
			if (r.getHiddenModifiedRange(undefined).contains(lineNumber)) {
				r.showAll(tx); // TODO only unhide what is needed
				return;
			}
		}
	}

	public revealOriginalLine(lineNumber: number, tx: ITransaction): void {
		const unchangedRegions = this._unchangedRegions.get().regions;
		for (const r of unchangedRegions) {
			if (r.getHiddenOriginalRange(undefined).contains(lineNumber)) {
				r.showAll(tx); // TODO only unhide what is needed
				return;
			}
		}
	}
}

export class UnchangedRegion {
	public static fromDiffs(changes: LineRangeMapping[], originalLineCount: number, modifiedLineCount: number): UnchangedRegion[] {
		const inversedMappings = LineRangeMapping.inverse(changes, originalLineCount, modifiedLineCount);
		const result: UnchangedRegion[] = [];

		const minHiddenLineCount = 3;
		const minContext = 3;

		for (const mapping of inversedMappings) {
			let origStart = mapping.originalRange.startLineNumber;
			let modStart = mapping.modifiedRange.startLineNumber;
			let length = mapping.originalRange.length;

			if (origStart === 1 && length > minContext + minHiddenLineCount) {
				length -= minContext;
				result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
			} else if (origStart + length === originalLineCount + 1 && length > minContext + minHiddenLineCount) {
				origStart += minContext;
				modStart += minContext;
				length -= minContext;
				result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
			} else if (length > minContext * 2 + minHiddenLineCount) {
				origStart += minContext;
				modStart += minContext;
				length -= minContext * 2;
				result.push(new UnchangedRegion(origStart, modStart, length, 0, 0));
			}
		}

		return result;
	}

	public get originalRange(): LineRange {
		return LineRange.ofLength(this.originalLineNumber, this.lineCount);
	}

	public get modifiedRange(): LineRange {
		return LineRange.ofLength(this.modifiedLineNumber, this.lineCount);
	}

	private readonly _visibleLineCountTop = observableValue<number>('visibleLineCountTop', 0);
	public readonly visibleLineCountTop: IObservable<number> = this._visibleLineCountTop;

	private readonly _visibleLineCountBottom = observableValue<number>('visibleLineCountBottom', 0);
	public readonly visibleLineCountBottom: IObservable<number> = this._visibleLineCountBottom;

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

	public showMoreAbove(tx: ITransaction | undefined): void {
		const maxVisibleLineCountTop = this.lineCount - this._visibleLineCountBottom.get();
		this._visibleLineCountTop.set(Math.min(this._visibleLineCountTop.get() + 10, maxVisibleLineCountTop), tx);
	}

	public showMoreBelow(tx: ITransaction | undefined): void {
		const maxVisibleLineCountBottom = this.lineCount - this._visibleLineCountTop.get();
		this._visibleLineCountBottom.set(Math.min(this._visibleLineCountBottom.get() + 10, maxVisibleLineCountBottom), tx);
	}

	public showAll(tx: ITransaction | undefined): void {
		this._visibleLineCountBottom.set(this.lineCount - this._visibleLineCountTop.get(), tx);
	}

	public setState(visibleLineCountTop: number, visibleLineCountBottom: number, tx: ITransaction | undefined): void {
		visibleLineCountTop = Math.min(visibleLineCountTop, this.lineCount);
		visibleLineCountBottom = Math.min(visibleLineCountBottom, this.lineCount - visibleLineCountTop);

		this._visibleLineCountTop.set(visibleLineCountTop, tx);
		this._visibleLineCountBottom.set(visibleLineCountBottom, tx);
	}
}

function applyOriginalEdits(diff: IDocumentDiff, textEdits: TextEditInfo[], originalTextModel: ITextModel, modifiedTextModel: ITextModel): IDocumentDiff {
	if (textEdits.length === 0) {
		return diff;
	}

	const diffTextEdits = diff.changes.flatMap(c => c.innerChanges!.map(c => new TextEditInfo(
		positionToLength(c.modifiedRange.getStartPosition()),
		positionToLength(c.modifiedRange.getEndPosition()),
		lengthOfRange(c.originalRange).toLength(),
	)));

	const combined = combineTextEditInfos(diffTextEdits, textEdits);

	let lastModifiedEndOffset = lengthZero;
	let lastOriginalEndOffset = lengthZero;
	const rangeMappings = combined.map(c => {
		const originalStartOffset = lengthAdd(lastOriginalEndOffset, lengthDiffNonNegative(lastModifiedEndOffset, c.startOffset));
		lastModifiedEndOffset = c.endOffset;
		lastOriginalEndOffset = lengthAdd(originalStartOffset, c.newLength);

		return new RangeMapping(
			Range.fromPositions(lengthToPosition(originalStartOffset), lengthToPosition(lastOriginalEndOffset)),
			Range.fromPositions(lengthToPosition(c.startOffset), lengthToPosition(c.endOffset)),
		);
	});

	const changes = lineRangeMappingFromRangeMappings(
		rangeMappings,
		originalTextModel.getLinesContent(),
		modifiedTextModel.getLinesContent(),
	);

	return {
		identical: false,
		quitEarly: false,
		changes,
	};
}

function applyModifiedEdits(diff: IDocumentDiff, textEdits: TextEditInfo[], originalTextModel: ITextModel, modifiedTextModel: ITextModel): IDocumentDiff {
	if (textEdits.length === 0) {
		return diff;
	}

	const diffTextEdits = diff.changes.flatMap(c => c.innerChanges!.map(c => new TextEditInfo(
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

	const changes = lineRangeMappingFromRangeMappings(
		rangeMappings,
		originalTextModel.getLinesContent(),
		modifiedTextModel.getLinesContent(),
	);

	return {
		identical: false,
		quitEarly: false,
		changes,
	};
}
