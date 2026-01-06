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
import { diffAddDecoration, diffAddDecorationEmpty, diffDeleteDecoration, diffDeleteDecorationEmpty, diffLineAddDecorationBackground, diffLineAddDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackground, diffLineDeleteDecorationBackgroundWithIndicator, diffWholeLineAddDecoration, diffWholeLineDeleteDecoration } from '../registrations.contribution.js';
import { applyObservableDecorations } from '../utils.js';
import { IModelDeltaDecoration } from '../../../../common/model.js';

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
		if (!movedTextToCompare) {
			for (const m of diff.mappings) {
				if (!m.lineRangeMapping.original.isEmpty) {
					originalDecorations.push({ range: m.lineRangeMapping.original.toInclusiveRange()!, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
				}
				if (!m.lineRangeMapping.modified.isEmpty) {
					modifiedDecorations.push({ range: m.lineRangeMapping.modified.toInclusiveRange()!, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
				}

				if (m.lineRangeMapping.modified.isEmpty || m.lineRangeMapping.original.isEmpty) {
					if (!m.lineRangeMapping.original.isEmpty) {
						originalDecorations.push({ range: m.lineRangeMapping.original.toInclusiveRange()!, options: diffWholeLineDeleteDecoration });
					}
					if (!m.lineRangeMapping.modified.isEmpty) {
						modifiedDecorations.push({ range: m.lineRangeMapping.modified.toInclusiveRange()!, options: diffWholeLineAddDecoration });
					}
				} else {
					const useInlineDiff = this._options.useTrueInlineDiffRendering.read(reader) && allowsTrueInlineDiffRendering(m.lineRangeMapping);
					for (const i of m.lineRangeMapping.innerChanges || []) {
						// Don't show empty markers outside the line range
						if (m.lineRangeMapping.original.contains(i.originalRange.startLineNumber)) {
							originalDecorations.push({ range: i.originalRange, options: (i.originalRange.isEmpty() && showEmptyDecorations) ? diffDeleteDecorationEmpty : diffDeleteDecoration });
						}
						if (m.lineRangeMapping.modified.contains(i.modifiedRange.startLineNumber)) {
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
				}
			}
		}

		if (movedTextToCompare) {
			for (const m of movedTextToCompare.changes) {
				const fullRangeOriginal = m.original.toInclusiveRange();
				if (fullRangeOriginal) {
					originalDecorations.push({ range: fullRangeOriginal, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
				}
				const fullRangeModified = m.modified.toInclusiveRange();
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
					blockPadding: [MovedBlocksLinesFeature.movedCodeBlockPadding, 0, MovedBlocksLinesFeature.movedCodeBlockPadding, MovedBlocksLinesFeature.movedCodeBlockPadding],
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
