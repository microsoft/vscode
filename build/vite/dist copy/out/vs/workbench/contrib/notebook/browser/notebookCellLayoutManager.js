/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import * as DOM from '../../../../base/browser/dom.js';
export class NotebookCellLayoutManager extends Disposable {
    constructor(notebookWidget, _list, loggingService) {
        super();
        this.notebookWidget = notebookWidget;
        this._list = _list;
        this.loggingService = loggingService;
        this._pendingLayouts = new WeakMap();
        this._layoutDisposables = new Set();
        this._layoutStack = [];
        this._isDisposed = false;
    }
    checkStackDepth() {
        if (this._layoutStack.length > 30) {
            const layoutTrace = this._layoutStack.join(' -> ');
            throw new Error('NotebookCellLayoutManager: layout stack is too deep: ' + layoutTrace);
        }
    }
    async layoutNotebookCell(cell, height) {
        const layoutTag = `cell:${cell.handle}, height:${height}`;
        this.loggingService.debug('cell layout', layoutTag);
        const viewIndex = this._list.getViewIndex(cell);
        if (viewIndex === undefined) {
            // the cell is hidden
            return;
        }
        if (this._pendingLayouts?.has(cell)) {
            const oldPendingLayout = this._pendingLayouts.get(cell);
            oldPendingLayout.dispose();
            this._layoutDisposables.delete(oldPendingLayout);
        }
        const deferred = new DeferredPromise();
        const doLayout = () => {
            const pendingLayout = this._pendingLayouts?.get(cell);
            this._pendingLayouts?.delete(cell);
            this._layoutStack.push(layoutTag);
            try {
                if (this._isDisposed) {
                    return;
                }
                if (!this.notebookWidget.viewModel?.hasCell(cell)) {
                    // Cell removed in the meantime?
                    return;
                }
                if (this._list.getViewIndex(cell) === undefined) {
                    // Cell can be hidden
                    return;
                }
                if (this._list.elementHeight(cell) === height) {
                    return;
                }
                this.checkStackDepth();
                if (!this.notebookWidget.hasEditorFocus()) {
                    // Do not scroll inactive notebook
                    // https://github.com/microsoft/vscode/issues/145340
                    const cellIndex = this.notebookWidget.viewModel?.getCellIndex(cell);
                    const visibleRanges = this.notebookWidget.visibleRanges;
                    if (cellIndex !== undefined
                        && visibleRanges && visibleRanges.length && visibleRanges[0].start === cellIndex
                        // cell is partially visible
                        && this._list.scrollTop > this.notebookWidget.getAbsoluteTopOfElement(cell)) {
                        return this._list.updateElementHeight2(cell, height, Math.min(cellIndex + 1, this.notebookWidget.getLength() - 1));
                    }
                }
                this._list.updateElementHeight2(cell, height);
            }
            finally {
                this._layoutStack.pop();
                deferred.complete(undefined);
                if (pendingLayout) {
                    pendingLayout.dispose();
                    this._layoutDisposables.delete(pendingLayout);
                }
            }
        };
        if (this._list.inRenderingTransaction) {
            const layoutDisposable = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.notebookWidget.getDomNode()), doLayout);
            const disposable = toDisposable(() => {
                layoutDisposable.dispose();
                deferred.complete(undefined);
            });
            this._pendingLayouts?.set(cell, disposable);
            this._layoutDisposables.add(disposable);
        }
        else {
            doLayout();
        }
        return deferred.p;
    }
    dispose() {
        super.dispose();
        this._isDisposed = true;
        this._layoutDisposables.forEach(d => d.dispose());
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsTGF5b3V0TWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tDZWxsTGF5b3V0TWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUk3RixPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBR3ZELE1BQU0sT0FBTyx5QkFBMEIsU0FBUSxVQUFVO0lBS3hELFlBQ1MsY0FBb0MsRUFDcEMsS0FBd0IsRUFDeEIsY0FBdUM7UUFFL0MsS0FBSyxFQUFFLENBQUM7UUFKQSxtQkFBYyxHQUFkLGNBQWMsQ0FBc0I7UUFDcEMsVUFBSyxHQUFMLEtBQUssQ0FBbUI7UUFDeEIsbUJBQWMsR0FBZCxjQUFjLENBQXlCO1FBUHhDLG9CQUFlLEdBQWdELElBQUksT0FBTyxFQUErQixDQUFDO1FBQzFHLHVCQUFrQixHQUFxQixJQUFJLEdBQUcsRUFBZSxDQUFDO1FBQ3JELGlCQUFZLEdBQWEsRUFBRSxDQUFDO1FBQ3JDLGdCQUFXLEdBQUcsS0FBSyxDQUFDO0lBTzVCLENBQUM7SUFFTyxlQUFlO1FBQ3RCLElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsRUFBRSxFQUFFLENBQUM7WUFDbkMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbkQsTUFBTSxJQUFJLEtBQUssQ0FBQyx1REFBdUQsR0FBRyxXQUFXLENBQUMsQ0FBQztRQUN4RixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyxr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