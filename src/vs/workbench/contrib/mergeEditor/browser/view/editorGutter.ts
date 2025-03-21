/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h, reset } from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader, observableFromEvent, observableSignal, observableSignalFromEvent, transaction } from '../../../../../base/common/observable.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { LineRange } from '../model/lineRange.js';

export class EditorGutter<T extends IGutterItemInfo = IGutterItemInfo> extends Disposable {
	private readonly scrollTop = observableFromEvent(this,
		this._editor.onDidScrollChange,
		(e) => /** @description editor.onDidScrollChange */ this._editor.getScrollTop()
	);
	private readonly isScrollTopZero = this.scrollTop.map((scrollTop) => /** @description isScrollTopZero */ scrollTop === 0);
	private readonly modelAttached = observableFromEvent(this,
		this._editor.onDidChangeModel,
		(e) => /** @description editor.onDidChangeModel */ this._editor.hasModel()
	);

	private readonly editorOnDidChangeViewZones = observableSignalFromEvent('onDidChangeViewZones', this._editor.onDidChangeViewZones);
	private readonly editorOnDidContentSizeChange = observableSignalFromEvent('onDidContentSizeChange', this._editor.onDidContentSizeChange);
	private readonly domNodeSizeChanged = observableSignal('domNodeSizeChanged');

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _domNode: HTMLElement,
		private readonly itemProvider: IGutterItemProvider<T>
	) {
		super();
		this._domNode.className = 'gutter monaco-editor';
		const scrollDecoration = this._domNode.appendChild(
			h('div.scroll-decoration', { role: 'presentation', ariaHidden: 'true', style: { width: '100%' } })
				.root
		);

		const o = new ResizeObserver(() => {
			transaction(tx => {
				/** @description ResizeObserver: size changed */
				this.domNodeSizeChanged.trigger(tx);
			});
		});
		o.observe(this._domNode);
		this._register(toDisposable(() => o.disconnect()));

		this._register(autorun(reader => {
			/** @description update scroll decoration */
			scrollDecoration.className = this.isScrollTopZero.read(reader) ? '' : 'scroll-decoration';
		}));

		this._register(autorun(reader => /** @description EditorGutter.Render */ this.render(reader)));
	}

	override dispose(): void {
		super.dispose();

		reset(this._domNode);
	}

	private readonly views = new Map<string, ManagedGutterItemView>();

	private render(reader: IReader): void {
		if (!this.modelAttached.read(reader)) {
			return;
		}

		this.domNodeSizeChanged.read(reader);
		this.editorOnDidChangeViewZones.read(reader);
		this.editorOnDidContentSizeChange.read(reader);

		const scrollTop = this.scrollTop.read(reader);

		const visibleRanges = this._editor.getVisibleRanges();
		const unusedIds = new Set(this.views.keys());

		if (visibleRanges.length > 0) {
			const visibleRange = visibleRanges[0];

			const visibleRange2 = new LineRange(
				visibleRange.startLineNumber,
				visibleRange.endLineNumber - visibleRange.startLineNumber
			).deltaEnd(1);

			const gutterItems = this.itemProvider.getIntersectingGutterItems(
				visibleRange2,
				reader
			);

			for (const gutterItem of gutterItems) {
				if (!gutterItem.range.touches(visibleRange2)) {
					continue;
				}

				unusedIds.delete(gutterItem.id);
				let view = this.views.get(gutterItem.id);
				if (!view) {
					const viewDomNode = document.createElement('div');
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
					gutterItem.range.startLineNumber <= this._editor.getModel()!.getLineCount()
						? this._editor.getTopForLineNumber(gutterItem.range.startLineNumber, true) - scrollTop
						: this._editor.getBottomForLineNumber(gutterItem.range.startLineNumber - 1, false) - scrollTop;
				const bottom = this._editor.getBottomForLineNumber(gutterItem.range.endLineNumberExclusive - 1, true) - scrollTop;

				const height = bottom - top;

				view.domNode.style.top = `${top}px`;
				view.domNode.style.height = `${height}px`;

				view.gutterItemView.layout(top, height, 0, this._domNode.clientHeight);
			}
		}

		for (const id of unusedIds) {
			const view = this.views.get(id)!;
			view.gutterItemView.dispose();
			view.domNode.remove();
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
}

export interface IGutterItemView<T extends IGutterItemInfo> extends IDisposable {
	update(item: T): void;
	layout(top: number, height: number, viewTop: number, viewHeight: number): void;
}
