/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IViewZone } from '../../../../editor/browser/editorBrowser.js';
import { EDGE_MARGIN, IRect } from './commentThreadFloatingWidgetLayout.js';

/**
 * Space after the content of an editor that grows with its content, like the editors of the multi diff editor, which
 * makes the editor tall enough for the floating widgets that reach below its content.
 *
 * The space is measured from the end of the last line, so that it doesn't depend on itself or on other space after the
 * last line, like the space that a diff editor adds to align its sides when the other side makes room for its widgets.
 */
export class FloatingWidgetRoom extends Disposable {

	private readonly _zone: IViewZone = { afterLineNumber: 0, heightInPx: 0, domNode: dom.$('div'), showInHiddenAreas: true };
	private _zoneId: string | undefined;
	private readonly _scheduler: dom.AnimationFrameScheduler;

	/**
	 * @param _getWidgets The areas, in document coordinates, of the widgets that are shown in the editor.
	 */
	constructor(private readonly _editor: ICodeEditor, private readonly _getWidgets: () => Iterable<IRect | undefined>) {
		super();
		this._scheduler = this._register(new dom.AnimationFrameScheduler(_editor.getContainerDomNode(), () => this._update()));
		// A new model gets a new view, which doesn't have the space.
		this._register(_editor.onDidChangeModel(() => this._zoneId = undefined));
		// Edits and hidden lines move the end of the content.
		this._register(_editor.onDidContentSizeChange(() => this.update()));
		this._register(toDisposable(() => this._setHeight(0)));
	}

	/**
	 * The part of the document that is in view, in document coordinates. The editor is as tall as its content, so the
	 * view that it's shown in scrolls instead, and may show only part of the editor, or more than the editor.
	 */
	getViewport(): { top: number; height: number } {
		const editorNode = this._editor.getContainerDomNode();
		const view = dom.findParentWithClass(editorNode, 'multiDiffEditor');
		const viewRect = view?.getBoundingClientRect() ?? { top: 0, height: dom.getWindow(editorNode).innerHeight };
		return { top: this._editor.getScrollTop() + viewRect.top - editorNode.getBoundingClientRect().top, height: viewRect.height };
	}

	/**
	 * How far down the widgets can go. The editor grows to make room for them, so they can go as far below the content
	 * as the window is tall, which is taller than any widget.
	 */
	getScrollableHeight(): number {
		return this._getContentBottom() + dom.getWindow(this._editor.getContainerDomNode()).innerHeight;
	}

	/**
	 * Makes room for the widgets at the next animation frame, once for all the widgets that moved or resized until
	 * then. Widgets also resize while the browser delivers resize notifications, which resizing the editor would delay.
	 */
	update(): void {
		this._scheduler.schedule();
	}

	/**
	 * The bottom of the last line, without the space after it.
	 */
	private _getContentBottom(): number {
		const model = this._editor.getModel();
		return model ? this._editor.getBottomForLineNumber(model.getLineCount()) : 0;
	}

	private _update(): void {
		let bottom = 0;
		for (const widget of this._getWidgets()) {
			if (widget) {
				bottom = Math.max(bottom, widget.top + widget.height + EDGE_MARGIN);
			}
		}
		this._setHeight(Math.max(0, Math.ceil(bottom - this._getContentBottom())));
	}

	private _setHeight(height: number): void {
		const lineCount = this._editor.getModel()?.getLineCount();
		const isUnchanged = this._zoneId ? height === this._zone.heightInPx && lineCount === this._zone.afterLineNumber : height === 0;
		if (lineCount === undefined || isUnchanged) {
			return;
		}
		this._zone.afterLineNumber = lineCount;
		this._zone.heightInPx = height;
		this._editor.changeViewZones(accessor => {
			if (!this._zoneId) {
				this._zoneId = accessor.addZone(this._zone);
			} else if (height > 0) {
				accessor.layoutZone(this._zoneId);
			} else {
				accessor.removeZone(this._zoneId);
				this._zoneId = undefined;
			}
		});
	}
}
