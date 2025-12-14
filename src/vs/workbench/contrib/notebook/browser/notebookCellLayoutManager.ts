/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICellViewModel } from './notebookBrowser.js';
import { NotebookEditorWidget } from './notebookEditorWidget.js';
import { INotebookCellList } from './view/notebookRenderingCommon.js';
import * as DOM from '../../../../base/browser/dom.js';
import { INotebookLoggingService } from '../common/notebookLoggingService.js';

export class NotebookCellLayoutManager extends Disposable {
	private _pendingLayouts: WeakMap<ICellViewModel, IDisposable> | null = new WeakMap<ICellViewModel, IDisposable>();
	private _layoutDisposables: Set<IDisposable> = new Set<IDisposable>();
	private readonly _layoutStack: string[] = [];
	private _isDisposed = false;
	constructor(
		private notebookWidget: NotebookEditorWidget,
		private _list: INotebookCellList,
		private loggingService: INotebookLoggingService
	) {
		super();
	}

	private checkStackDepth() {
		if (this._layoutStack.length > 30) {
			const layoutTrace = this._layoutStack.join(' -> ');
			throw new Error('NotebookCellLayoutManager: layout stack is too deep: ' + layoutTrace);
		}
	}

	async layoutNotebookCell(cell: ICellViewModel, height: number): Promise<void> {
		const layoutTag = `cell:${cell.handle}, height:${height}`;
		this.loggingService.debug('cell layout', layoutTag);
		const viewIndex = this._list.getViewIndex(cell);
		if (viewIndex === undefined) {
			// the cell is hidden
			return;
		}

		if (this._pendingLayouts?.has(cell)) {
			const oldPendingLayout = this._pendingLayouts.get(cell)!;
			oldPendingLayout.dispose();
			this._layoutDisposables.delete(oldPendingLayout);
		}

		const deferred = new DeferredPromise<void>();
		let capturedDisposable: IDisposable | undefined = undefined;

		const doLayout = () => {
			if (capturedDisposable) {
				this._pendingLayouts?.delete(cell);
			}

			this._layoutStack.push(layoutTag);
			try {
				if (this._isDisposed) {
					return;
				}

				if (!this.notebookWidget.viewModel?.hasCell(cell)) {
					return;
				}

				if (this._list.getViewIndex(cell) === undefined) {
					return;
				}

				if (this._list.elementHeight(cell) === height) {
					return;
				}

				this.checkStackDepth();

				if (!this.notebookWidget.hasEditorFocus()) {
					const cellIndex = this.notebookWidget.viewModel?.getCellIndex(cell);
					const visibleRanges = this.notebookWidget.visibleRanges;
					if (cellIndex !== undefined
						&& visibleRanges && visibleRanges.length && visibleRanges[0].start === cellIndex
						&& this._list.scrollTop > this.notebookWidget.getAbsoluteTopOfElement(cell)
					) {
						return this._list.updateElementHeight2(cell, height, Math.min(cellIndex + 1, this.notebookWidget.getLength() - 1));
					}
				}

				this._list.updateElementHeight2(cell, height);
			} finally {
				this._layoutStack.pop();
				deferred.complete(undefined);
				if (capturedDisposable) {
					this._layoutDisposables.delete(capturedDisposable);
				}
			}
		};

		if (this._list.inRenderingTransaction) {
			const layoutDisposable = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.notebookWidget.getDomNode()), doLayout);

			capturedDisposable = toDisposable(() => {
				layoutDisposable.dispose();
				deferred.complete(undefined);
			});
			this._pendingLayouts?.set(cell, capturedDisposable);
			this._layoutDisposables.add(capturedDisposable);
		} else {
			doLayout();
		}

		return deferred.p;
	}

	override dispose() {
		super.dispose();
		this._isDisposed = true;
		this._layoutDisposables.forEach(d => d.dispose());
	}
}
