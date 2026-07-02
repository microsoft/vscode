/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, derived } from '../../../../../base/common/observable.js';
import { DiffEditorEditors } from './diffEditorEditors.js';
import { allowsTrueInlineDiffRendering } from './diffEditorViewZones/diffEditorViewZones.js';
import { DiffEditorOptions } from '../diffEditorOptions.js';
import { DiffEditorViewModel } from '../diffEditorViewModel.js';
import { DiffEditorWidget } from '../diffEditorWidget.js';
import { MovedBlocksLinesFeature } from '../features/movedBlocksLinesFeature.js';
import { diffAddDecoration, diffAddDecorationEmpty, diffDeleteDecoration, diffDeleteDecorationEmpty, diffLineAddDecorationBackground, diffLineAddDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackground, diffLineDeleteDecorationBackgroundWithIndicator, diffLineMoveActiveDecorationBackground, diffLineMoveDecorationBackground, diffWholeLineAddDecoration, diffWholeLineDeleteDecoration } from '../registrations.contribution.js';
import { applyObservableDecorations } from '../utils.js';
import { LineRange, LineRangeSet } from '../../../../common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../../common/diff/rangeMapping.js';
import { IModelDecorationOptions, IModelDeltaDecoration } from '../../../../common/model.js';

export class DiffEditorDecorations extends Disposable {
	constructor(
		private readonly _editors: DiffEditorEditors,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _options: DiffEditorOptions,
		widget: DiffEditorWidget,
	) {
		super();

		this._register(applyObservableDecorations(this._editors.original, this._decorations.map(d => d?.originalDecorations || [])));
		this._register(applyObservableDecorations(this._editors.modified, this._decorations.map(d => d?.modifiedDecorations || [])));
	}

	private readonly _decorations = derived(this, (reader) => {
		const diffModel = this._diffModel.read(reader);
		const diff = diffModel?.diff.read(reader);
		if (!diff) {
			return null;
		}

		const movedTextToCompare = this._diffModel.read(reader)!.movedTextToCompare.read(reader);
		const renderIndicators = this._options.renderIndicators.read(reader);
		const showEmptyDecorations = this._options.showEmptyDecorations.read(reader);

		const originalDecorations: IModelDeltaDecoration[] = [];
		const modifiedDecorations: IModelDeltaDecoration[] = [];
		const activeMovedText = this._diffModel.read(reader)!.activeMovedText.read(reader);

		const pushChangeDecorations = (mapping: DetailedLineRangeMapping, innerChanges = mapping.innerChanges) => {
			const useInlineDiff = this._options.useTrueInlineDiffRendering.read(reader) && allowsTrueInlineDiffRendering(mapping);

			for (const i of innerChanges || []) {
				// Don't show empty markers outside the line range
				if (mapping.original.contains(i.originalRange.startLineNumber)) {
					originalDecorations.push({ range: i.originalRange, options: (i.originalRange.isEmpty() && showEmptyDecorations) ? diffDeleteDecorationEmpty : diffDeleteDecoration });
				}
				if (mapping.modified.contains(i.modifiedRange.startLineNumber)) {
					modifiedDecorations.push({ range: i.modifiedRange, options: (i.modifiedRange.isEmpty() && showEmptyDecorations && !useInlineDiff) ? diffAddDecorationEmpty : diffAddDecoration });
				}
				if (useInlineDiff) {
					const deletedText = diffModel!.model.original.getValueInRange(i.originalRange);
					modifiedDecorations.push({
						range: i.modifiedRange,
						options: {
							description: 'deleted-text',
							before: {
								content: deletedText,
								inlineClassName: 'inline-deleted-text',
							},
							zIndex: 100000,
							showIfCollapsed: true,
						}
					});
				}
			}
		};

		if (!movedTextToCompare) {
			const originalMovedRanges = new LineRangeSet();
			const modifiedMovedRanges = new LineRangeSet();
			for (const m of diff.movedTexts) {
				originalMovedRanges.addRange(m.lineRangeMapping.original);
				modifiedMovedRanges.addRange(m.lineRangeMapping.modified);
			}
			const pushLineDecorations = (decorations: IModelDeltaDecoration[], ranges: readonly LineRange[], options: IModelDecorationOptions) => {
				for (const range of ranges) {
					const inclusiveRange = range.toInclusiveRange();
					if (inclusiveRange) {
						decorations.push({ range: inclusiveRange, options });
					}
				}
			};

			// Paint the normal diffs, with holes punched out for moved text
			for (const m of diff.mappings) {
				const originalLineBackground = renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground;
				const modifiedLineBackground = renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground;

				// Punching holes happens here
				const originalRanges = originalMovedRanges.subtractFrom(m.lineRangeMapping.original).ranges;
				const modifiedRanges = modifiedMovedRanges.subtractFrom(m.lineRangeMapping.modified).ranges;

				pushLineDecorations(originalDecorations, originalRanges, originalLineBackground);
				pushLineDecorations(modifiedDecorations, modifiedRanges, modifiedLineBackground);

				if (m.lineRangeMapping.modified.isEmpty || m.lineRangeMapping.original.isEmpty) {
					pushLineDecorations(originalDecorations, originalRanges, diffWholeLineDeleteDecoration);
					pushLineDecorations(modifiedDecorations, modifiedRanges, diffWholeLineAddDecoration);
				} else {
					// Filter out inner changes that belong to moved blocks
					const validInnerChanges = m.lineRangeMapping.innerChanges?.filter(i => {
						const inOriginalUnmoved = originalRanges.some(r => r.contains(i.originalRange.startLineNumber));
						const inModifiedUnmoved = modifiedRanges.some(r => r.contains(i.modifiedRange.startLineNumber));

						// If it's valid in either side's unmoved ranges, we render it.
						return inOriginalUnmoved || inModifiedUnmoved;
					});

					// Pass the filtered array as the second argument
					pushChangeDecorations(m.lineRangeMapping, validInnerChanges);
				}
			}

			// Paint the Moved Text
			for (const movedText of diff.movedTexts) {
				const moveColor = movedText === activeMovedText ? diffLineMoveActiveDecorationBackground : diffLineMoveDecorationBackground;

				// Create sets for the inner changes inside the moved block
				const originalChangedRanges = new LineRangeSet();
				const modifiedChangedRanges = new LineRangeSet();
				for (const m of movedText.changes) {
					originalChangedRanges.addRange(m.original);
					modifiedChangedRanges.addRange(m.modified);
				}

				// Punch the holes: Subtract the inner changes from the total move block
				const originalUnchangedMoveRanges = originalChangedRanges.subtractFrom(movedText.lineRangeMapping.original).ranges;
				const modifiedUnchangedMoveRanges = modifiedChangedRanges.subtractFrom(movedText.lineRangeMapping.modified).ranges;

				// Only paint the move background on the lines that did not change
				pushLineDecorations(originalDecorations, originalUnchangedMoveRanges, moveColor);
				pushLineDecorations(modifiedDecorations, modifiedUnchangedMoveRanges, moveColor);

				// Paint inner changes (Red/Green) inside the move blocks
				for (const m of movedText.changes) {
					const originalRange = m.original.toInclusiveRange();
					if (originalRange) {
						originalDecorations.push({ range: originalRange, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
					}
					const modifiedRange = m.modified.toInclusiveRange();
					if (modifiedRange) {
						modifiedDecorations.push({ range: modifiedRange, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
					}

					pushChangeDecorations(m);
				}
			}
			// If there is text to compare
		} else {
			for (const m of movedTextToCompare.changes) {
				const fullRangeOriginal = m.original.toInclusiveRange();
				if (fullRangeOriginal) {
					originalDecorations.push({ range: fullRangeOriginal, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
				}
				const fullRangeModified = m.modified.toInclusiveRange();
				if (fullRangeModified) {
					modifiedDecorations.push({ range: fullRangeModified, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
				}

				// Inline diffs and empty decoration settings are now fully respected.
				pushChangeDecorations(m);
			}
		}

		for (const m of diff.movedTexts) {
			const originalRange = m.lineRangeMapping.original.toInclusiveRange();
			if (originalRange) {
				originalDecorations.push({
					range: originalRange,
					options: {
						description: 'moved',
						blockClassName: 'movedOriginal' + (m === activeMovedText ? ' currentMove' : ''),
						blockPadding: [MovedBlocksLinesFeature.movedCodeBlockPadding, 0, MovedBlocksLinesFeature.movedCodeBlockPadding, MovedBlocksLinesFeature.movedCodeBlockPadding],
					}
				});
			}

			const modifiedRange = m.lineRangeMapping.modified.toInclusiveRange();
			if (modifiedRange) {
				modifiedDecorations.push({
					range: modifiedRange,
					options: {
						description: 'moved',
						blockClassName: 'movedModified' + (m === activeMovedText ? ' currentMove' : ''),
						blockPadding: [4, 0, 4, 4],
					}
				});
			}
		}

		return { originalDecorations, modifiedDecorations };
	});
}
