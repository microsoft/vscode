/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model';

export class EditorGutter<
	T extends IGutterItemInfo = IGutterItemInfo
	> extends Disposable {
	private readonly scrollTop = observableFromEvent(
		this._editor.onDidScrollChange,
		(e) => this._editor.getScrollTop()
	);
	private readonly modelAttached = observableFromEvent(
		this._editor.onDidChangeModel,
		(e) => this._editor.hasModel()
	);

	private readonly viewZoneChanges = new ObservableValue(0, 'counter');

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _domNode: HTMLElement,
		private readonly itemProvider: IGutterItemProvider<T>
	) {
		super();
		this._domNode.className = 'gutter';
		this._register(autorun((reader) => this.render(reader), 'Render'));

		this._editor.onDidChangeViewZones(e => {
			this.viewZoneChanges.set(this.viewZoneChanges.get() + 1, undefined);
		});
	}

	private readonly views = new Map<string, ManagedGutterItemView>();

	private render(reader: IReader): void {
		if (!this.modelAttached.read(reader)) {
			return;
		}
		this.viewZoneChanges.read(reader);
		const scrollTop = this.scrollTop.read(reader);

		const visibleRanges = this._editor.getVisibleRanges();
		const unusedIds = new Set(this.views.keys());

		if (visibleRanges.length > 0) {
			const visibleRange = visibleRanges[0];

			const visibleRange2 = new LineRange(
				visibleRange.startLineNumber,
				visibleRange.endLineNumber - visibleRange.startLineNumber
			);

			const gutterItems = this.itemProvider.getIntersectingGutterItems(
				visibleRange2,
				reader
			);

			const lineHeight = this._editor.getOptions().get(EditorOption.lineHeight);

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
					const itemView = this.itemProvider.createView(
						gutterItem,
						viewDomNode
					);
					view = new ManagedGutterItemView(itemView, viewDomNode);
					this.views.set(gutterItem.id, view);
				} else {
					view.gutterItemView.update(gutterItem);
				}

				const top =
					(gutterItem.range.startLineNumber === 1
						? -lineHeight
						: this._editor.getTopForLineNumber(
							gutterItem.range.startLineNumber - 1
						)) -
					scrollTop +
					lineHeight;

				const bottom = (
					gutterItem.range.endLineNumberExclusive <= this._editor.getModel()!.getLineCount()
						? this._editor.getTopForLineNumber(gutterItem.range.endLineNumberExclusive)
						: this._editor.getTopForLineNumber(gutterItem.range.endLineNumberExclusive - 1) + lineHeight
				) - scrollTop;

				const height = bottom - top;

				view.domNode.style.top = `${top}px`;
				view.domNode.style.height = `${height}px`;

				view.gutterItemView.layout(top, height, 0, -1);
			}
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
	getIntersectingGutterItems(range: LineRange, reader: IReader): TItem[];

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

