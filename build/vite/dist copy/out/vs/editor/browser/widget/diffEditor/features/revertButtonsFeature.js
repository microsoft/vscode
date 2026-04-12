/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener, h, EventType } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived } from '../../../../../base/common/observable.js';
import { LineRange, LineRangeSet } from '../../../../common/core/ranges/lineRange.js';
import { Range } from '../../../../common/core/range.js';
import { LineRangeMapping } from '../../../../common/diff/rangeMapping.js';
import { GlyphMarginLane } from '../../../../common/model.js';
import { localize } from '../../../../../nls.js';
const emptyArr = [];
export class RevertButtonsFeature extends Disposable {
    constructor(_editors, _diffModel, _options, _widget) {
        super();
        this._editors = _editors;
        this._diffModel = _diffModel;
        this._options = _options;
        this._widget = _widget;
        this._selectedDiffs = derived(this, (reader) => {
            /** @description selectedDiffs */
            const model = this._diffModel.read(reader);
            const diff = model?.diff.read(reader);
            // Return `emptyArr` because it is a constant. [] is always a new array and would trigger a change.
            if (!diff) {
                return emptyArr;
            }
            const selections = this._editors.modifiedSelections.read(reader);
            if (selections.every(s => s.isEmpty())) {
                return emptyArr;
            }
            const selectedLineNumbers = new LineRangeSet(selections.map(s => LineRange.fromRangeInclusive(s)));
            const selectedMappings = diff.mappings.filter(m => m.lineRangeMapping.innerChanges && selectedLineNumbers.intersects(m.lineRangeMapping.modified));
            const result = selectedMappings.map(mapping => ({
                mapping,
                rangeMappings: mapping.lineRangeMapping.innerChanges.filter(c => selections.some(s => Range.areIntersecting(c.modifiedRange, s)))
            }));
            if (result.length === 0 || result.every(r => r.rangeMappings.length === 0)) {
                return emptyArr;
            }
            return result;
        });
        this._register(autorunWithStore((reader, store) => {
            if (!this._options.shouldRenderOldRevertArrows.read(reader)) {
                return;
            }
            const model = this._diffModel.read(reader);
            const diff = model?.diff.read(reader);
            if (!model || !diff) {
                return;
            }
            if (model.movedTextToCompare.read(reader)) {
                return;
            }
            const glyphWidgetsModified = [];
            const selectedDiffs = this._selectedDiffs.read(reader);
            const selectedDiffsSet = new Set(selectedDiffs.map(d => d.mapping));
            if (selectedDiffs.length > 0) {
                // The button to revert the selection
                const selections = this._editors.modifiedSelections.read(reader);
                const btn = store.add(new RevertButton(selections[selections.length - 1].positionLineNumber, this._widget, selectedDiffs.flatMap(d => d.rangeMappings), true));
                this._editors.modified.addGlyphMarginWidget(btn);
                glyphWidgetsModified.push(btn);
            }
            for (const m of diff.mappings) {
                if (selectedDiffsSet.has(m)) {
                    continue;
                }
                if (!m.lineRangeMapping.modified.isEmpty && m.lineRangeMapping.innerChanges) {
                    const btn = store.add(new RevertButton(m.lineRangeMapping.modified.startLineNumber, this._widget, m.lineRangeMapping, false));
                    this._editors.modified.addGlyphMarginWidget(btn);
                    glyphWidgetsModified.push(btn);
                }
            }
            store.add(toDisposable(() => {
                for (const w of glyphWidgetsModified) {
                    this._editors.modified.removeGlyphMarginWidget(w);
                }
            }));
        }));
    }
}
export class RevertButton extends Disposable {
    static { this.counter = 0; }
    getId() { return this._id; }
    constructor(_lineNumber, _widget, _diffs, _revertSelection) {
        super();
        this._lineNumber = _lineNumber;
        this._widget = _widget;
        this._diffs = _diffs;
        this._revertSelection = _revertSelection;
        this._id = `revertButton${RevertButton.counter++}`;
        this._domNode = h('div.revertButton', {
            title: this._revertSelection
                ? localize('revertSelectedChanges', 'Revert Selected Changes')
                : localize('revertChange', 'Revert Change')
        }, [renderIcon(Codicon.arrowRight)]).root;
        this._register(addDisposableListener(this._domNode, EventType.MOUSE_DOWN, e => {
            // don't prevent context menu from showing up
            if (e.button !== 2) {
                e.stopPropagation();
                e.preventDefault();
            }
        }));
        this._register(addDisposableListener(this._domNode, EventType.MOUSE_UP, e => {
            e.stopPropagation();
            e.preventDefault();
        }));
        this._register(addDisposableListener(this._domNode, EventType.CLICK, (e) => {
            if (this._diffs instanceof LineRangeMapping) {
                this._widget.revert(this._diffs);
            }
            else {
                this._widget.revertRangeMappings(this._diffs);
            }
            e.stopPropagation();
            e.preventDefault();
        }));
    }
    /**
     * Get the dom node of the glyph widget.
     */
    getDomNode() {
        return this._domNode;
    }
    /**
     * Get the placement of the glyph widget.
     */
    getPosition() {
        return {
            lane: GlyphMarginLane.Right,
            range: {
                startColumn: 1,
                startLineNumber: this._lineNumber,
                endColumn: 1,
                endLineNumber: this._lineNumber,
            },
            zIndex: 10001,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV2ZXJ0QnV0dG9uc0ZlYXR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9mZWF0dXJlcy9yZXZlcnRCdXR0b25zRmVhdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRixPQUFPLEVBQWUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFNbEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGdCQUFnQixFQUFnQixNQUFNLHlDQUF5QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakQsTUFBTSxRQUFRLEdBQVksRUFBRSxDQUFDO0FBRTdCLE1BQU0sT0FBTyxvQkFBcUIsU0FBUSxVQUFVO0lBQ25ELFlBQ2tCLFFBQTJCLEVBQzNCLFVBQXdELEVBQ3hELFFBQTJCLEVBQzNCLE9BQXlCO1FBRTFDLEtBQUssRUFBRSxDQUFDO1FBTFMsYUFBUSxHQUFSLFFBQVEsQ0FBbUI7UUFDM0IsZUFBVSxHQUFWLFVBQVUsQ0FBOEM7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