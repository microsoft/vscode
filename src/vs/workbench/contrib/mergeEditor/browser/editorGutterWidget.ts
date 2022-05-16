/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model';

export class EditorGutterWidget<T extends IGutterItemInfo = IGutterItemInfo> {
	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _domNode: HTMLElement,
		private readonly itemProvider: IGutterItemProvider<T>,
	) {
		this._domNode.className = 'gutter';

		this._editor.onDidScrollChange(() => {
			this.render();
		});
	}

	private readonly views = new Map<string, ManagedGutterItemView>();

	private render(): void {
		const visibleRange = this._editor.getVisibleRanges()[0];
		const visibleRange2 = new LineRange(
			visibleRange.startLineNumber,
			visibleRange.endLineNumber - visibleRange.startLineNumber
		);

		const gutterItems = this.itemProvider.getIntersectingGutterItems(visibleRange2);

		const lineHeight = this._editor.getOptions().get(EditorOption.lineHeight);

		const unusedIds = new Set(this.views.keys());
		for (const gutterItem of gutterItems) {
			if (!gutterItem.range.touches(visibleRange2)) {
				continue;
			}

			unusedIds.delete(gutterItem.id);
			let view = this.views.get(gutterItem.id);
			if (!view) {
				const viewDomNode = document.createElement('div');
				viewDomNode.className = 'gutter-item';
				this._domNode.appendChild(viewDomNode);
				const itemView = this.itemProvider.createView(gutterItem, viewDomNode);
				view = new ManagedGutterItemView(itemView, viewDomNode);
				this.views.set(gutterItem.id, view);
			}

			const scrollTop = this._editor.getScrollTop();
			const top = this._editor.getTopForLineNumber(gutterItem.range.startLineNumber) - scrollTop;
			const height = lineHeight * gutterItem.range.lineCount;

			view.domNode.style.top = `${top}px`;
			view.domNode.style.height = `${height}px`;

			view.gutterItemView.layout(top, height, 0, -1);
		}

		for (const id of unusedIds) {
			const view = this.views.get(id)!;
			view.gutterItemView.dispose();
			this._domNode.removeChild(view.domNode);
			this.views.delete(id);
		}
	}
}

class ManagedGutterItemView {
	constructor(
		public readonly gutterItemView: IGutterItemView<any>,
		public readonly domNode: HTMLDivElement
	) { }
}

export interface IGutterItemProvider<TItem extends IGutterItemInfo> {
	// onDidChange
	getIntersectingGutterItems(range: LineRange): TItem[];

	createView(item: TItem, target: HTMLElement): IGutterItemView<TItem>;
}

export interface IGutterItemInfo {
	id: string;
	range: LineRange;

	// To accommodate view zones:
	offsetInPx: number;
	additionalHeightInPx: number;
}

export interface IGutterItemView<T extends IGutterItemInfo> extends IDisposable {
	update(item: T): void;
	layout(top: number, height: number, viewTop: number, viewHeight: number): void;
}

