/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived } from '../../../../../base/common/observable.js';
import { DocumentLineRangeMap } from '../model/mapping.js';
import { ReentrancyBarrier } from '../../../../../base/common/controlFlow.js';
import { BugIndicatingError } from '../../../../../base/common/errors.js';
import { isDefined } from '../../../../../base/common/types.js';
export class ScrollSynchronizer extends Disposable {
    get model() { return this.viewModel.get()?.model; }
    get lockResultWithInputs() { return this.layout.get().kind === 'columns'; }
    get lockBaseWithInputs() { return this.layout.get().kind === 'mixed' && !this.layout.get().showBaseAtTop; }
    constructor(viewModel, input1View, input2View, baseView, inputResultView, layout) {
        super();
        this.viewModel = viewModel;
        this.input1View = input1View;
        this.input2View = input2View;
        this.baseView = baseView;
        this.inputResultView = inputResultView;
        this.layout = layout;
        this.reentrancyBarrier = new ReentrancyBarrier();
        this._isSyncing = true;
        const s = derived((reader) => {
            const baseView = this.baseView.read(reader);
            const editors = [this.input1View, this.input2View, this.inputResultView, baseView].filter(isDefined);
            const alignScrolling = (source, updateScrollLeft, updateScrollTop) => {
                this.reentrancyBarrier.runExclusivelyOrSkip(() => {
                    if (updateScrollLeft) {
                        const scrollLeft = source.editor.getScrollLeft();
                        for (const editorView of editors) {
                            if (editorView !== source) {
                                editorView.editor.setScrollLeft(scrollLeft, 1 /* ScrollType.Immediate */);
                            }
                        }
                    }
                    if (updateScrollTop) {
                        const scrollTop = source.editor.getScrollTop();
                        for (const editorView of editors) {
                            if (editorView !== source) {
                                if (this._shouldLock(source, editorView)) {
                                    editorView.editor.setScrollTop(scrollTop, 1 /* ScrollType.Immediate */);
                                }
                                else {
                                    const m = this._getMapping(source, editorView);
                                    if (m) {
                                        this._synchronizeScrolling(source.editor, editorView.editor, m);
                                    }
                                }
                            }
                        }
                    }
                });
            };
            for (const editorView of editors) {
                reader.store.add(editorView.editor.onDidScrollChange(e => {
                    if (!this._isSyncing) {
                        return;
                    }
                    alignScrolling(editorView, e.scrollLeftChanged, e.scrollTopChanged);
                }));
            }
            return {
                update: () => {
                    alignScrolling(this.inputResultView, true, true);
                }
            };
        }).recomputeInitiallyAndOnChange(this._store);
        this.updateScrolling = () => {
            s.get().update();
        };
    }
    stopSync() {
        this._isSyncing = false;
    }
    startSync() {
        this._isSyncing = true;
    }
    _shouldLock(editor1, editor2) {
        const isInput = (editor) => editor === this.input1View || editor === this.input2View;
        if (isInput(editor1) && editor2 === this.inputResultView || isInput(editor2) && editor1 === this.inputResultView) {
            return this.lockResultWithInputs;
        }
        if (isInput(editor1) && editor2 === this.baseView.get() || isInput(editor2) && editor1 === this.baseView.get()) {
            return this.lockBaseWithInputs;
        }
        if (isInput(editor1) && isInput(editor2)) {
            return true;
        }
        return false;
    }
    _getMapping(editor1, editor2) {
        if (editor1 === this.input1View) {
            if (editor2 === this.input2View) {
                return undefined;
            }
            else if (editor2 === this.inputResultView) {
                return this.model?.input1ResultMapping.get();
            }
            else if (editor2 === this.baseView.get()) {
                const b = this.model?.baseInput1Diffs.get();
                if (!b) {
                    return undefined;
                }
                return new DocumentLineRangeMap(b, -1).reverse();
            }
        }
        else if (editor1 === this.input2View) {
            if (editor2 === this.input1View) {
                return undefined;
            }
            else if (editor2 === this.inputResultView) {
                return this.model?.input2ResultMapping.get();
            }
            else if (editor2 === this.baseView.get()) {
                const b = this.model?.baseInput2Diffs.get();
                if (!b) {
                    return undefined;
                }
                return new DocumentLineRangeMap(b, -1).reverse();
            }
        }
        else if (editor1 === this.inputResultView) {
            if (editor2 === this.input1View) {
                return this.model?.resultInput1Mapping.get();
            }
            else if (editor2 === this.input2View) {
                return this.model?.resultInput2Mapping.get();
            }
            else if (editor2 === this.baseView.get()) {
                const b = this.model?.resultBaseMapping.get();
                if (!b) {
                    return undefined;
                }
                return b;
            }
        }
        else if (editor1 === this.baseView.get()) {
            if (editor2 === this.input1View) {
                const b = this.model?.baseInput1Diffs.get();
                if (!b) {
                    return undefined;
                }
                return new DocumentLineRangeMap(b, -1);
            }
            else if (editor2 === this.input2View) {
                const b = this.model?.baseInput2Diffs.get();
                if (!b) {
                    return undefined;
                }
                return new DocumentLineRangeMap(b, -1);
            }
            else if (editor2 === this.inputResultView) {
                const b = this.model?.baseResultMapping.get();
                if (!b) {
                    return undefined;
                }
                return b;
            }
        }
        throw new BugIndicatingError();
    }
    _synchronizeScrolling(scrollingEditor, targetEditor, mapping) {
        if (!mapping) {
            return;
        }
        const visibleRanges = scrollingEditor.getVisibleRanges();
        if (visibleRanges.length === 0) {
            return;
        }
        const topLineNumber = visibleRanges[0].startLineNumber - 1;
        const result = mapping.project(topLineNumber);
        const sourceRange = result.inputRange;
        const targetRange = result.outputRange;
        const resultStartTopPx = targetEditor.getTopForLineNumber(targetRange.startLineNumber);
        const resultEndPx = targetEditor.getTopForLineNumber(targetRange.endLineNumberExclusive);
        const sourceStartTopPx = scrollingEditor.getTopForLineNumber(sourceRange.startLineNumber);
        const sourceEndPx = scrollingEditor.getTopForLineNumber(sourceRange.endLineNumberExclusive);
        const factor = Math.min((scrollingEditor.getScrollTop() - sourceStartTopPx) / (sourceEndPx - sourceStartTopPx), 1);
        const resultScrollPosition = resultStartTopPx + (resultEndPx - resultStartTopPx) * factor;
        targetEditor.setScrollTop(resultScrollPosition, 1 /* ScrollType.Immediate */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Nyb2xsU3luY2hyb25pemVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci92aWV3L3Njcm9sbFN5bmNocm9uaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLE9BQU8sRUFBZSxNQUFNLDBDQUEwQyxDQUFDO0FBR2hGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBTzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVoRSxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsVUFBVTtJQUNqRCxJQUFZLEtBQUssS0FBSyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQU0zRCxJQUFZLG9CQUFvQixLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNuRixJQUFZLGtCQUFrQixLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEtBQUssT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBSW5ILFlBQ2tCLFNBQXdELEVBQ3hELFVBQStCLEVBQy9CLFVBQStCLEVBQy9CLFFBQXFELEVBQ3JELGVBQXFDLEVB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