/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { h } from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Action } from '../../../../../base/common/actions.js';
import { booleanComparator, compareBy, numberComparator, tieBreakComparators } from '../../../../../base/common/arrays.js';
import { findMaxIdx } from '../../../../../base/common/arraysFind.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, autorunHandleChanges, autorunWithStore, constObservable, derived, observableFromEvent, observableSignalFromEvent, observableValue, recomputeInitiallyAndOnChange } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { PlaceholderViewZone, ViewZoneOverlayWidget, applyStyle, applyViewZones } from '../utils.js';
import { OffsetRange, OffsetRangeSet } from '../../../../common/core/ranges/offsetRange.js';
import { localize } from '../../../../../nls.js';
export class MovedBlocksLinesFeature extends Disposable {
    static { this.movedCodeBlockPadding = 4; }
    constructor(_rootElement, _diffModel, _originalEditorLayoutInfo, _modifiedEditorLayoutInfo, _editors) {
        super();
        this._rootElement = _rootElement;
        this._diffModel = _diffModel;
        this._originalEditorLayoutInfo = _originalEditorLayoutInfo;
        this._modifiedEditorLayoutInfo = _modifiedEditorLayoutInfo;
        this._editors = _editors;
        this._originalScrollTop = observableFromEvent(this, this._editors.original.onDidScrollChange, () => this._editors.original.getScrollTop());
        this._modifiedScrollTop = observableFromEvent(this, this._editors.modified.onDidScrollChange, () => this._editors.modified.getScrollTop());
        this._viewZonesChanged = observableSignalFromEvent('onDidChangeViewZones', this._editors.modified.onDidChangeViewZones);
        this.width = observableValue(this, 0);
        this._modifiedViewZonesChangedSignal = observableSignalFromEvent('modified.onDidChangeViewZones', this._editors.modified.onDidChangeViewZones);
        this._originalViewZonesChangedSignal = observableSignalFromEvent('original.onDidChangeViewZones', this._editors.original.onDidChangeViewZones);
        this._state = derived(this, (reader) => {
            /** @description state */
            this._element.replaceChildren();
            const model = this._diffModel.read(reader);
            const moves = model?.diff.read(reader)?.movedTexts;
            if (!moves || moves.length === 0) {
                this.width.set(0, undefined);
                return;
            }
            this._viewZonesChanged.read(reader);
            const infoOrig = this._originalEditorLayoutInfo.read(reader);
            const infoMod = this._modifiedEditorLayoutInfo.read(reader);
            if (!infoOrig || !infoMod) {
                this.width.set(0, undefined);
                return;
            }
            this._modifiedViewZonesChangedSignal.read(reader);
            this._originalViewZonesChangedSignal.read(reader);
            const lines = moves.map((move) => {
                function computeLineStart(range, editor) {
                    const t1 = editor.getTopForLineNumber(range.startLineNumber, true);
                    const t2 = editor.getTopForLineNumber(range.endLineNumberExclusive, true);
                    return (t1 + t2) / 2;
                }
                const start = computeLineStart(move.lineRangeMapping.original, this._editors.original);
                const startOffset = this._originalScrollTop.read(reader);
                const end = computeLineStart(move.lineRangeMapping.modified, this._editors.modified);
                const endOffset = this._modifiedScrollTop.read(reader);
                const from = start - startOffset;
                const to = end - endOffset;
                const top = Math.min(start, end);
                const bottom = Math.max(start, end);
                return { range: new OffsetRange(top, bottom), from, to, fromWithoutScroll: start, toWithoutScroll: end, move };
            });
            lines.sort(tieBreakComparators(compareBy(l => l.fromWithoutScroll > l.toWithoutScroll, booleanComparator), compareBy(l => l.fromWithoutScroll > l.toWithoutScroll ? l.fromWithoutScroll : -l.toWithoutScroll, numberComparator)));
            const layout = LinesLayout.compute(lines.map(l => l.range));
            const padding = 10;
            const lineAreaLeft = infoOrig.verticalScrollbarWidth;
            const lineAreaWidth = (layout.getTrackCount() - 1) * 10 + padding * 2;
            const width = lineAreaLeft + lineAreaWidth + (infoMod.contentLeft - MovedBlocksLinesFeature.movedCodeBlockPadding);
            let idx = 0;
            for (const line of lines) {
                const track = layout.getTrack(idx);
                const verticalY = lineAreaLeft + padding + track * 10;
                const arrowHeight = 15;
                const arrowWidth = 15;
                const right = width;
                const rectWidth = infoMod.glyphMarginWidth + infoMod.lineNumbersWidth;
                const rectHeight = 18;
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.classList.add('arrow-rectangle');
                rect.setAttribute('x', `${right - rectWidth}`);
                rect.setAttribute('y', `${line.to - rectHeight / 2}`);
                rect.setAttribute('width', `${rectWidth}`);
                rect.setAttribute('height', `${rectHeight}`);
                this._element.appendChild(rect);
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${0} ${line.from} L ${verticalY} ${line.from} L ${verticalY} ${line.to} L ${right - arrowWidth} ${line.to}`);
                path.setAttribute('fill', 'none');
                g.appendChild(path);
                const arrowRight = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                arrowRight.classList.add('arrow');
                reader.store.add(autorun(reader => {
                    path.classList.toggle('currentMove', line.move === model.activeMovedText.read(reader));
                    arrowRight.classList.toggle('currentMove', line.move === model.activeMovedText.read(reader));
                }));
                arrowRight.setAttribute('points', `${right - arrowWidth},${line.to - arrowHeight / 2} ${right},${line.to} ${right - arrowWidth},${line.to + arrowHeight / 2}`);
                g.appendChild(arrowRight);
                this._element.appendChild(g);
                /*
                TODO@hediet
                path.addEventListener('mouseenter', () => {
                    model.setHoveredMovedText(line.move);
                });
                path.addEventListener('mouseleave', () => {
                    model.setHoveredMovedText(undefined);
                });*/
                idx++;
            }
            this.width.set(lineAreaWidth, undefined);
        });
        this._element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this._element.setAttribute('class', 'moved-blocks-lines');
        this._rootElement.appendChild(this._element);
        this._register(toDisposable(() => this._element.remove()));
        this._register(autorun(reader => {
            /** @description update moved blocks lines positioning */
            const info = this._originalEditorLayoutInfo.read(reader);
            const info2 = this._modifiedEditorLayoutInfo.read(reader);
            if (!info || !info2) {
                return;
            }
            this._element.style.left = `${info.width - info.verticalScrollbarWidth}px`;
            this._element.style.height = `${info.height}px`;
            this._element.style.width = `${info.verticalScrollbarWidth + info.contentLeft - MovedBlocksLinesFeature.movedCodeBlockPadding + this.width.read(reader)}px`;
        }));
        this._register(recomputeInitiallyAndOnChange(this._state));
        const movedBlockViewZones = derived(reader => {
            const model = this._diffModel.read(reader);
            const d = model?.diff.read(reader);
            if (!d) {
                return [];
            }
            return d.movedTexts.map(move => ({
                move,
                original: new PlaceholderViewZone(constObservable(move.lineRangeMapping.original.startLineNumber - 1), 18),
                modified: new PlaceholderViewZone(constObservable(move.lineRangeMapping.modified.startLineNumber - 1), 18),
            }));
        });
        this._register(applyViewZones(this._editors.original, movedBlockViewZones.map(zones => /** @description movedBlockViewZones.original */ zones.map(z => z.original))));
        this._register(applyViewZones(this._editors.modified, movedBlockViewZones.map(zones => /** @description movedBlockViewZones.modified */ zones.map(z => z.modified))));
        this._register(autorunWithStore((reader, store) => {
            const blocks = movedBlockViewZones.read(reader);
            for (const b of blocks) {
                store.add(new MovedBlockOverlayWidget(this._editors.original, b.original, b.move, 'original', this._diffModel.get()));
                store.add(new MovedBlockOverlayWidget(this._editors.modified, b.modified, b.move, 'modified', this._diffModel.get()));
            }
        }));
        const originalHasFocus = observableSignalFromEvent('original.onDidFocusEditorWidget', e => this._editors.original.onDidFocusEditorWidget(() => setTimeout(() => e(undefined), 0)));
        const modifiedHasFocus = observableSignalFromEvent('modified.onDidFocusEditorWidget', e => this._editors.modified.onDidFocusEditorWidget(() => setTimeout(() => e(undefined), 0)));
        let lastChangedEditor = 'modified';
        this._register(autorunHandleChanges({
            changeTracker: {
                createChangeSummary: () => undefined,
                handleChange: (ctx, summary) => {
                    if (ctx.didChange(originalHasFocus)) {
                        lastChangedEditor = 'original';
                    }
                    if (ctx.didChange(modifiedHasFocus)) {
                        lastChangedEditor = 'modified';
                    }
                    return true;
                }
            }
        }, reader => {
            /** @description MovedBlocksLines.setActiveMovedTextFromCursor */
            originalHasFocus.read(reader);
            modifiedHasFocus.read(reader);
            const m = this._diffModel.read(reader);
            if (!m) {
                return;
            }
            const diff = m.diff.read(reader);
            let movedText = undefined;
            if (diff && lastChangedEditor === 'original') {
                const originalPos = this._editors.originalCursor.read(reader);
                if (originalPos) {
                    movedText = diff.movedTexts.find(m => m.lineRangeMapping.original.contains(originalPos.lineNumber));
                }
            }
            if (diff && lastChangedEditor === 'modified') {
                const modifiedPos = this._editors.modifiedCursor.read(reader);
                if (modifiedPos) {
                    movedText = diff.movedTexts.find(m => m.lineRangeMapping.modified.contains(modifiedPos.lineNumber));
                }
            }
            if (movedText !== m.movedTextToCompare.read(undefined)) {
                m.movedTextToCompare.set(undefined, undefined);
            }
            m.setActiveMovedText(movedText);
        }));
    }
}
class LinesLayout {
    static compute(lines) {
        const setsPerTrack = [];
        const trackPerLineIdx = [];
        for (const line of lines) {
            let trackIdx = setsPerTrack.findIndex(set => !set.intersectsStrict(line));
            if (trackIdx === -1) {
                const maxTrackCount = 6;
                if (setsPerTrack.length >= maxTrackCount) {
                    trackIdx = findMaxIdx(setsPerTrack, compareBy(set => set.intersectWithRangeLength(line), numberComparator));
                }
                else {
                    trackIdx = setsPerTrack.length;
                    setsPerTrack.push(new OffsetRangeSet());
                }
            }
            setsPerTrack[trackIdx].addRange(line);
            trackPerLineIdx.push(trackIdx);
        }
        return new LinesLayout(setsPerTrack.length, trackPerLineIdx);
    }
    constructor(_trackCount, trackPerLineIdx) {
        this._trackCount = _trackCount;
        this.trackPerLineIdx = trackPerLineIdx;
    }
    getTrack(lineIdx) {
        return this.trackPerLineIdx[lineIdx];
    }
    getTrackCount() {
        return this._trackCount;
    }
}
class MovedBlockOverlayWidget extends ViewZoneOverlayWidget {
    constructor(_editor, _viewZone, _move, _kind, _diffModel) {
        const root = h('div.diff-hidden-lines-widget');
        super(_editor, _viewZone, root.root);
        this._editor = _editor;
        this._move = _move;
        this._kind = _kind;
        this._diffModel = _diffModel;
        this._nodes = h('div.diff-moved-code-block', { style: { marginRight: '4px' } }, [
            h('div.text-content@textContent'),
            h('div.action-bar@actionBar'),
        ]);
        root.root.appendChild(this._nodes.root);
        const editorLayout = observableFromEvent(this._editor.onDidLayoutChange, () => this._editor.getLayoutInfo());
        this._register(applyStyle(this._nodes.root, {
            paddingRight: editorLayout.map(l => l.verticalScrollbarWidth)
        }));
        let text;
        if (_move.changes.length > 0) {
            text = this._kind === 'original' ? localize('codeMovedToWithChanges', 'Code moved with changes to line {0}-{1}', this._move.lineRangeMapping.modified.startLineNumber, this._move.lineRangeMapping.modified.endLineNumberExclusive - 1) : localize('codeMovedFromWithChanges', 'Code moved with changes from line {0}-{1}', this._move.lineRangeMapping.original.startLineNumber, this._move.lineRangeMapping.original.endLineNumberExclusive - 1);
        }
        else {
            text = this._kind === 'original' ? localize('codeMovedTo', 'Code moved to line {0}-{1}', this._move.lineRangeMapping.modified.startLineNumber, this._move.lineRangeMapping.modified.endLineNumberExclusive - 1) : localize('codeMovedFrom', 'Code moved from line {0}-{1}', this._move.lineRangeMapping.original.startLineNumber, this._move.lineRangeMapping.original.endLineNumberExclusive - 1);
        }
        const actionBar = this._register(new ActionBar(this._nodes.actionBar, {
            highlightToggledItems: true,
        }));
        const caption = new Action('', text, '', false);
        actionBar.push(caption, { icon: false, label: true });
        const actionCompare = new Action('', 'Compare', ThemeIcon.asClassName(Codicon.compareChanges), true, () => {
            this._editor.focus();
            this._diffModel.movedTextToCompare.set(this._diffModel.movedTextToCompare.get() === _move ? undefined : this._move, undefined);
        });
        this._register(autorun(reader => {
            const isActive = this._diffModel.movedTextToCompare.read(reader) === _move;
            actionCompare.checked = isActive;
        }));
        actionBar.push(actionCompare, { icon: false, label: true });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW92ZWRCbG9ja3NMaW5lc0ZlYXR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9mZWF0dXJlcy9tb3ZlZEJsb2Nrc0xpbmVzRmVhdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0gsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25GLE9BQU8sRUFBZSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSx5QkFBeUIsRUFBRSxlQUFlLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNsUCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFJcEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHFCQUFxQixFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFHckcsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUU1RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFFakQsTUFBTSxPQUFPLHVCQUF3QixTQUFRLFVBQVU7YUFDL0IsMEJBQXFCLEdBQUcsQ0FBQyxDQUFDO0lBU2pELFlBQ2tCLFlBQXlCLEVBQ3pCLFVBQXdELEVBQ3hELHlCQUErRCxFQUMvRCx5QkFBK0QsRUFDL0QsUUFBMkI7UUFFNUMsS0FBSyxFQUFFLENBQUM7UUFOUyxpQkFBWSxHQUFaLFlBQVksQ0FBYTtRQUN6QixlQUFVLEdBQVYsVUFBVSxDQUE4QztRQUN4RCw4QkFBeUIsR0FBekIseUJBQXlCLENBQXNDO1FBQy9ELDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBc0M7UUFDL0QsYUFBUSxHQUFSLFFBQVEsQ0FBbUI7UUFHNUMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLG1CQUFtQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQzNJLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUMzSSxJQUFJLENBQUMsaUJBQWlCLEdBQUcseUJBQXlCLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUN4SCxJQUFJLENBQUMsS0FBSyxHQUFHLGVBQWUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLCtCQUErQixHQUFHLHlCQUF5QixDQUFDLCtCQUErQixFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDL0ksSUFBSSxDQUFDLCtCQUErQixHQUFHLHlCQUF5QixDQUFDLCtCQUErQixFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDL0ksSUFBSSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDdEMseUJBQXlCO1lBRXpCLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDaEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0MsTUFBTSxLQUFLLEdBQUcsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsVUFBVSxDQUFDO1lBQ25ELElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUM3QixPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFcEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM3RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzVELElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDM0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUM3QixPQUFPO1lBQ1IsQ0FBQztZQUVELElBQUksQ0FBQywrQkFBK0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbEQsSUFBSSxDQUFDLCtCQUErQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUVsRCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7Z0JBQ2hDLFNBQVMsZ0JBQWdCLENBQUMsS0FBZ0IsRUFBRSxNQUFtQjtvQkFDOUQsTUFBTSxFQUFFLEdBQUcsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQ25FLE1BQU0sRUFBRSxHQUFHLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLENBQUM7b0JBQzFFLE9BQU8sQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN0QixDQUFDO2dCQUVELE1BQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDdkYsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDekQsTUFBTSxHQUFHLEdBQUcsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2dCQUNyRixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUV2RCxNQUFNLElBQUksR0FBRyxLQUFLLEdBQUcsV0FBVyxDQUFDO2dCQUNqQyxNQUFNLEVBQUUsR0FBRyxHQUFHLEdBQUcsU0FBUyxDQUFDO2dCQUUzQixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFDakMsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBRXBDLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxXQUFXLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUM7WUFDaEgsQ0FBQyxDQUFDLENBQUM7WUFFSCxLQUFLLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUM3QixTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxFQUMxRSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsZ0JBQWdCLENBQUMsQ0FDcEgsQ0FBQyxDQUFDO1lBRUgsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFFNUQsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ25CLE1BQU0sWUFBWSxHQUFHLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQztZQUNyRCxNQUFNLGFBQWEsR0FBRyxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsT0FBTyxHQUFHLENBQUMsQ0FBQztZQUN0RSxNQUFNLEtBQUssR0FBRyxZQUFZLEdBQUcsYUFBYSxHQUFHLENBQUMsT0FBTyxDQUFDLFdBQVcsR0FBRyx1QkFBdUIsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBRW5ILElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztZQUNaLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7Z0JBQzFCLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25DLE1BQU0sU0FBUyxHQUFHLFlBQVksR0FBRyxPQUFPLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFFdEQsTUFBTSxXQUFXLEdBQUcsRUFBRSxDQUFDO2dCQUN2QixNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUM7Z0JBQ3RCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQztnQkFFcEIsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDdEUsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDO2dCQUN0QixNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUM1RSxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUN0QyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxHQUFHLEtBQUssR0FBRyxTQUFTLEVBQUUsQ0FBQyxDQUFDO2dCQUMvQyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLEdBQUcsVUFBVSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3RELElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLEdBQUcsU0FBUyxFQUFFLENBQUMsQ0FBQztnQkFDM0MsSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsR0FBRyxVQUFVLEVBQUUsQ0FBQyxDQUFDO2dCQUM3QyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFaEMsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLENBQUMsQ0FBQztnQkFFdEUsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFFNUUsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksTUFBTSxTQUFTLElBQUksSUFBSSxDQUFDLElBQUksTUFBTSxTQUFTLElBQUksSUFBSSxDQUFDLEVBQUUsTUFBTSxLQUFLLEdBQUcsVUFBVSxJQUFJLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN2SSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDbEMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFcEIsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDckYsVUFBVSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBRWxDLE1BQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtvQkFDakMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxJQUFJLEtBQUssS0FBSyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztvQkFDdkYsVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxJQUFJLEtBQUssS0FBSyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDOUYsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFFSixVQUFVLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxHQUFHLEtBQUssR0FBRyxVQUFVLElBQUksSUFBSSxDQUFDLEVBQUUsR0FBRyxXQUFXLEdBQUcsQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLENBQUMsRUFBRSxJQUFJLEtBQUssR0FBRyxVQUFVLElBQUksSUFBSSxDQUFDLEVBQUUsR0FBRyxXQUFXLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDL0osQ0FBQyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFFMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBRTdCOzs7Ozs7O3FCQU9LO2dCQUVMLEdBQUcsRUFBRSxDQUFDO1lBQ1AsQ0FBQztZQUVELElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFM0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0IseURBQXlEO1lBQ3pELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDekQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMxRCxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3JCLE9BQU87WUFDUixDQUFDO1lBRUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsc0JBQXNCLElBQUksQ0FBQztZQUMzRSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUM7WUFDaEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsdUJBQXVCLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUM3SixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUUzRCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUM1QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzQyxNQUFNLENBQUMsR0FBRyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNuQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQUMsT0FBTyxFQUFFLENBQUM7WUFBQyxDQUFDO1lBQ3RCLE9BQU8sQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNoQyxJQUFJO2dCQUNKLFFBQVEsRUFBRSxJQUFJLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzFHLFFBQVEsRUFBRSxJQUFJLG1CQUFtQixDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUM7YUFDMUcsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLGdEQUFnRCxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEssSUFBSSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsZ0RBQWdELENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV0SyxJQUFJLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ2pELE1BQU0sTUFBTSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNoRCxLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUN4QixLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksdUJBQXVCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRyxDQUFDLENBQUMsQ0FBQztnQkFDdkgsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHVCQUF1QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUcsQ0FBQyxDQUFDLENBQUM7WUFDeEgsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLGdCQUFnQixHQUFHLHlCQUF5QixDQUNqRCxpQ0FBaUMsRUFDakMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQzNGLENBQUM7UUFDRixNQUFNLGdCQUFnQixHQUFHLHlCQUF5QixDQUNqRCxpQ0FBaUMsRUFDakMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQzNGLENBQUM7UUFFRixJQUFJLGlCQUFpQixHQUE0QixVQUFVLENBQUM7UUFFNUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQztZQUNuQyxhQUFhLEVBQUU7Z0JBQ2QsbUJBQW1CLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztnQkFDcEMsWUFBWSxFQUFFLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxFQUFFO29CQUM5QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO3dCQUFDLGlCQUFpQixHQUFHLFVBQVUsQ0FBQztvQkFBQyxDQUFDO29CQUN4RSxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDO3dCQUFDLGlCQUFpQixHQUFHLFVBQVUsQ0FBQztvQkFBQyxDQUFDO29CQUN4RSxPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO2FBQ0Q7U0FDRCxFQUFFLE1BQU0sQ0FBQyxFQUFFO1lBQ1gsaUVBQWlFO1lBQ2pFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUM5QixnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFFOUIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUFDLE9BQU87WUFBQyxDQUFDO1lBQ25CLE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRWpDLElBQUksU0FBUyxHQUEwQixTQUFTLENBQUM7WUFFakQsSUFBSSxJQUFJLElBQUksaUJBQWlCLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQzlDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JHLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxJQUFJLElBQUksaUJBQWlCLEtBQUssVUFBVSxFQUFFLENBQUM7Z0JBQzlDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JHLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxTQUFTLEtBQUssQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUN4RCxDQUFDLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNoRCxDQUFDO1lBQ0QsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2pDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDOztBQVFGLE1BQU0sV0FBVztJQUNULE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBb0I7UUFDekMsTUFBTSxZQUFZLEdBQXFCLEVBQUUsQ0FBQztRQUMxQyxNQUFNLGVBQWUsR0FBYSxFQUFFLENBQUM7UUFFckMsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUMxQixJQUFJLFFBQVEsR0FBRyxZQUFZLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMxRSxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNyQixNQUFNLGFBQWEsR0FBRyxDQUFDLENBQUM7Z0JBQ3hCLElBQUksWUFBWSxDQUFDLE1BQU0sSUFBSSxhQUFhLEVBQUUsQ0FBQztvQkFDMUMsUUFBUSxHQUFHLFVBQVUsQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDN0csQ0FBQztxQkFBTSxDQUFDO29CQUNQLFFBQVEsR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDO29CQUMvQixZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztnQkFDekMsQ0FBQztZQUNGLENBQUM7WUFDRCxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3RDLGVBQWUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU8sSUFBSSxXQUFXLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsWUFDa0IsV0FBbUIsRUFDbkIsZUFBeUI7UUFEekIsZ0JBQVcsR0FBWCxXQUFXLENBQVE7UUFDbkIsb0JBQWUsR0FBZixlQUFlLENBQVU7SUFDdkMsQ0FBQztJQUVMLFFBQVEsQ0FBQyxPQUFlO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsYUFBYTtRQUNaLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDO0NBQ0Q7QUFFRCxNQUFNLHVCQUF3QixTQUFRLHFCQUFxQjtJQU0xRCxZQUNrQixPQUFvQixFQUNyQyxTQUE4QixFQUNiLEtBQWdCLEVBQ2hCLEtBQThCLEVBQzlCLFVBQStCO1FBRWhELE1BQU0sSUFBSSxHQUFHLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQy9DLEtBQUssQ0FBQyxPQUFPLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQVBwQixZQUFPLEdBQVAsT0FBTyxDQUFhO1FBRXBCLFVBQUssR0FBTCxLQUFLLENBQVc7UUFDaEIsVUFBSyxHQUFMLEtBQUssQ0FBeUI7UUFDOUIsZUFBVSxHQUFWLFVBQVUsQ0FBcUI7UUFWaEMsV0FBTSxHQUFHLENBQUMsQ0FBQywyQkFBMkIsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQzNGLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQztZQUNqQyxDQUFDLENBQUMsMEJBQTBCLENBQUM7U0FDN0IsQ0FBQyxDQUFDO1FBV0YsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV4QyxNQUFNLFlBQVksR0FBRyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUU3RyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRTtZQUMzQyxZQUFZLEVBQUUsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQztTQUM3RCxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksSUFBWSxDQUFDO1FBRWpCLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDOUIsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQzFDLHdCQUF3QixFQUN4Qix5Q0FBeUMsRUFDekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUNwRCxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsR0FBRyxDQUFDLENBQy9ELENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FDWCwwQkFBMEIsRUFDMUIsMkNBQTJDLEVBQzNDLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFDcEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEdBQUcsQ0FBQyxDQUMvRCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLEdBQUcsSUFBSSxDQUFDLEtBQUssS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FDMUMsYUFBYSxFQUNiLDRCQUE0QixFQUM1QixJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQ3BELElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLHNCQUFzQixHQUFHLENBQUMsQ0FDL0QsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUNYLGVBQWUsRUFDZiw4QkFBOEIsRUFDOUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUNwRCxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsR0FBRyxDQUFDLENBQy9ELENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRTtZQUNyRSxxQkFBcUIsRUFBRSxJQUFJO1NBQzNCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxPQUFPLEdBQUcsSUFBSSxNQUFNLENBQ3pCLEVBQUUsRUFDRixJQUFJLEVBQ0osRUFBRSxFQUNGLEtBQUssQ0FDTCxDQUFDO1FBQ0YsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBRXRELE1BQU0sYUFBYSxHQUFHLElBQUksTUFBTSxDQUMvQixFQUFFLEVBQ0YsU0FBUyxFQUNULFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxFQUM3QyxJQUFJLEVBQ0osR0FBRyxFQUFFO1lBQ0osSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRSxLQUFLLEtBQUssQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2hJLENBQUMsQ0FDRCxDQUFDO1FBQ0YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssS0FBSyxDQUFDO1lBQzNFLGFBQWEsQ0FBQyxPQUFPLEdBQUcsUUFBUSxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixTQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDN0QsQ0FBQztDQUNEIn0=