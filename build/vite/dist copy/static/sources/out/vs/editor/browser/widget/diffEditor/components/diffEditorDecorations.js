/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived } from '../../../../../base/common/observable.js';
import { allowsTrueInlineDiffRendering } from './diffEditorViewZones/diffEditorViewZones.js';
import { MovedBlocksLinesFeature } from '../features/movedBlocksLinesFeature.js';
import { diffAddDecoration, diffAddDecorationEmpty, diffDeleteDecoration, diffDeleteDecorationEmpty, diffLineAddDecorationBackground, diffLineAddDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackground, diffLineDeleteDecorationBackgroundWithIndicator, diffWholeLineAddDecoration, diffWholeLineDeleteDecoration } from '../registrations.contribution.js';
import { applyObservableDecorations } from '../utils.js';
export class DiffEditorDecorations extends Disposable {
    constructor(_editors, _diffModel, _options, widget) {
        super();
        this._editors = _editors;
        this._diffModel = _diffModel;
        this._options = _options;
        this._decorations = derived(this, (reader) => {
            const diffModel = this._diffModel.read(reader);
            const diff = diffModel?.diff.read(reader);
            if (!diff) {
                return null;
            }
            const movedTextToCompare = this._diffModel.read(reader).movedTextToCompare.read(reader);
            const renderIndicators = this._options.renderIndicators.read(reader);
            const showEmptyDecorations = this._options.showEmptyDecorations.read(reader);
            const originalDecorations = [];
            const modifiedDecorations = [];
            if (!movedTextToCompare) {
                for (const m of diff.mappings) {
                    if (!m.lineRangeMapping.original.isEmpty) {
                        originalDecorations.push({ range: m.lineRangeMapping.original.toInclusiveRange(), options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
                    }
                    if (!m.lineRangeMapping.modified.isEmpty) {
                        modifiedDecorations.push({ range: m.lineRangeMapping.modified.toInclusiveRange(), options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
                    }
                    if (m.lineRangeMapping.modified.isEmpty || m.lineRangeMapping.original.isEmpty) {
                        if (!m.lineRangeMapping.original.isEmpty) {
                            originalDecorations.push({ range: m.lineRangeMapping.original.toInclusiveRange(), options: diffWholeLineDeleteDecoration });
                        }
                        if (!m.lineRangeMapping.modified.isEmpty) {
                            modifiedDecorations.push({ range: m.lineRangeMapping.modified.toInclusiveRange(), options: diffWholeLineAddDecoration });
                        }
                    }
                    else {
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
                                const deletedText = diffModel.model.original.getValueInRange(i.originalRange);
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
            const activeMovedText = this._diffModel.read(reader).activeMovedText.read(reader);
            for (const m of diff.movedTexts) {
                originalDecorations.push({
                    range: m.lineRangeMapping.original.toInclusiveRange(), options: {
                        description: 'moved',
                        blockClassName: 'movedOriginal' + (m === activeMovedText ? ' currentMove' : ''),
                        blockPadding: [MovedBlocksLinesFeature.movedCodeBlockPadding, 0, MovedBlocksLinesFeature.movedCodeBlockPadding, MovedBlocksLinesFeature.movedCodeBlockPadding],
                    }
                });
                modifiedDecorations.push({
                    range: m.lineRangeMapping.modified.toInclusiveRange(), options: {
                        description: 'moved',
                        blockClassName: 'movedModified' + (m === activeMovedText ? ' currentMove' : ''),
                        blockPadding: [4, 0, 4, 4],
                    }
                });
            }
            return { originalDecorations, modifiedDecorations };
        });
        this._register(applyObservableDecorations(this._editors.original, this._decorations.map(d => d?.originalDecorations || [])));
        this._register(applyObservableDecorations(this._editors.modified, this._decorations.map(d => d?.modifiedDecorations || [])));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvckRlY29yYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvY29tcG9uZW50cy9kaWZmRWRpdG9yRGVjb3JhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sRUFBZSxPQUFPLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVoRixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUk3RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsc0JBQXNCLEVBQUUsb0JBQW9CLEVBQUUseUJBQXlCLEVBQUUsK0JBQStCLEVBQUUsNENBQTRDLEVBQUUsa0NBQWtDLEVBQUUsK0NBQStDLEVBQUUsMEJBQTBCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM3VyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFHekQsTUFBTSxPQUFPLHFCQUFzQixTQUFRLFVBQVU7SUFDcEQsWUFDa0IsUUFBMkIsRUFDM0IsVUFBd0QsRUFDeEQsUUFBMkIsRUFDNUMsTUFBd0I7UUFFeEIsS0FBSyxFQUFFLENBQUM7UUFMUyxhQUFRLEdBQVIsUUFBUSxDQUFtQjtRQUMzQixlQUFVLEdBQVYsVUFBVSxDQUE4QztRQUN4RCxhQUFRLEdBQVIsUUFBUSxDQUFtQjtRQVM1QixpQkFBWSxHQUFHLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUN4RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENB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