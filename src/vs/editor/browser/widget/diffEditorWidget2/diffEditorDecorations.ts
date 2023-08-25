/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, derived } from 'vs/base/common/observable';
import { arrowRevertChange, diffAddDecoration, diffAddDecorationEmpty, diffDeleteDecoration, diffDeleteDecorationEmpty, diffLineAddDecorationBackground, diffLineAddDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackground, diffLineDeleteDecorationBackgroundWithIndicator, diffWholeLineAddDecoration, diffWholeLineDeleteDecoration } from 'vs/editor/browser/widget/diffEditorWidget2/decorations';
import { DiffEditorEditors } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorEditors';
import { DiffEditorOptions } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorOptions';
import { DiffEditorViewModel } from 'vs/editor/browser/widget/diffEditorWidget2/diffEditorViewModel';
import { MovedBlocksLinesPart } from 'vs/editor/browser/widget/diffEditorWidget2/movedBlocksLines';
import { applyObservableDecorations } from 'vs/editor/browser/widget/diffEditorWidget2/utils';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDeltaDecoration } from 'vs/editor/common/model';

export class DiffEditorDecorations extends Disposable {
	constructor(
		private readonly _editors: DiffEditorEditors,
		private readonly _diffModel: IObservable<DiffEditorViewModel | undefined>,
		private readonly _options: DiffEditorOptions,
	) {
		super();

		this._register(applyObservableDecorations(this._editors.original, this._decorations.map(d => d?.originalDecorations || [])));
		this._register(applyObservableDecorations(this._editors.modified, this._decorations.map(d => d?.modifiedDecorations || [])));
	}

	private readonly _decorations = derived((reader) => {
		/** @description _decorations */
		const diff = this._diffModel.read(reader)?.diff.read(reader);
		if (!diff) {
			return null;
		}

		const movedTextToCompare = this._diffModel.read(reader)!.movedTextToCompare.read(reader);
		const renderIndicators = this._options.renderIndicators.read(reader);
		const showEmptyDecorations = this._options.showEmptyDecorations.read(reader);

		const originalDecorations: IModelDeltaDecoration[] = [];
		const modifiedDecorations: IModelDeltaDecoration[] = [];
		if (!movedTextToCompare) {
			for (const m of diff.mappings) {
				if (!m.lineRangeMapping.originalRange.isEmpty) {
					originalDecorations.push({ range: m.lineRangeMapping.originalRange.toInclusiveRange()!, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
				}
				if (!m.lineRangeMapping.modifiedRange.isEmpty) {
					modifiedDecorations.push({ range: m.lineRangeMapping.modifiedRange.toInclusiveRange()!, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
				}

				if (m.lineRangeMapping.modifiedRange.isEmpty || m.lineRangeMapping.originalRange.isEmpty) {
					if (!m.lineRangeMapping.originalRange.isEmpty) {
						originalDecorations.push({ range: m.lineRangeMapping.originalRange.toInclusiveRange()!, options: diffWholeLineDeleteDecoration });
					}
					if (!m.lineRangeMapping.modifiedRange.isEmpty) {
						modifiedDecorations.push({ range: m.lineRangeMapping.modifiedRange.toInclusiveRange()!, options: diffWholeLineAddDecoration });
					}
				} else {
					for (const i of m.lineRangeMapping.innerChanges || []) {
						// Don't show empty markers outside the line range
						if (m.lineRangeMapping.originalRange.contains(i.originalRange.startLineNumber)) {
							originalDecorations.push({ range: i.originalRange, options: (i.originalRange.isEmpty() && showEmptyDecorations) ? diffDeleteDecorationEmpty : diffDeleteDecoration });
						}
						if (m.lineRangeMapping.modifiedRange.contains(i.modifiedRange.startLineNumber)) {
							modifiedDecorations.push({ range: i.modifiedRange, options: (i.modifiedRange.isEmpty() && showEmptyDecorations) ? diffAddDecorationEmpty : diffAddDecoration });
						}
					}
				}

				if (!m.lineRangeMapping.modifiedRange.isEmpty && this._options.shouldRenderRevertArrows.read(reader) && !movedTextToCompare) {
					modifiedDecorations.push({ range: Range.fromPositions(new Position(m.lineRangeMapping.modifiedRange.startLineNumber, 1)), options: arrowRevertChange });
				}
			}
		}

		if (movedTextToCompare) {
			for (const m of movedTextToCompare.changes) {
				const fullRangeOriginal = m.originalRange.toInclusiveRange();
				if (fullRangeOriginal) {
					originalDecorations.push({ range: fullRangeOriginal, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
				}
				const fullRangeModified = m.modifiedRange.toInclusiveRange();
				if (fullRangeModified) {
					modifiedDecorations.push({ range: fullRangeModified, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
				}

				for (const i of m.innerChanges || []) {
					originalDecorations.push({ range: i.originalRange, options: diffDeleteDecoration });
					modifiedDecorations.push({ range: i.modifiedRange, options: diffAddDecoration });
				}
			}
		}
		const activeMovedText = this._diffModel.read(reader)!.activeMovedText.read(reader);

		for (const m of diff.movedTexts) {
			originalDecorations.push({
				range: m.lineRangeMapping.original.toInclusiveRange()!, options: {
					description: 'moved',
					blockClassName: 'movedOriginal' + (m === activeMovedText ? ' currentMove' : ''),
					blockPadding: [MovedBlocksLinesPart.movedCodeBlockPadding, 0, MovedBlocksLinesPart.movedCodeBlockPadding, MovedBlocksLinesPart.movedCodeBlockPadding],
				}
			});

			modifiedDecorations.push({
				range: m.lineRangeMapping.modified.toInclusiveRange()!, options: {
					description: 'moved',
					blockClassName: 'movedModified' + (m === activeMovedText ? ' currentMove' : ''),
					blockPadding: [4, 0, 4, 4],
				}
			});
		}

		return { originalDecorations, modifiedDecorations };
	});
}
