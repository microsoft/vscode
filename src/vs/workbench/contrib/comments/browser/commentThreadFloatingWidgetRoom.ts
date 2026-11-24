/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IViewZone } from '../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { EDGE_MARGIN, getViewZoneOffset, IRect } from './commentThreadFloatingWidgetLayout.js';

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
		const viewRect = this._getView()?.getBoundingClientRect() ?? { top: 0, height: dom.getWindow(editorNode).innerHeight };
		return { top: this._editor.getScrollTop() + viewRect.top - editorNode.getBoundingClientRect().top, height: viewRect.height };
	}

	/**
	 * Scrolls the view that the editor is shown in down, so that the part of the document in view starts at the given
	 * position, in document coordinates. The multi diff editor moves the native scrolling of its content, such as when
	 * the browser reveals a focused element in it, into its own scroll position. The content is scrolled that way, which
	 * can't scroll it up: its native scroll position is always back at the top.
	 */
	scrollDownTo(top: number): void {
		const view = this._getView();
		const content = view && dom.findParentWithClass(this._editor.getContainerDomNode(), 'scrollContent', view);
		const delta = top - this.getViewport().top;
		if (content && delta > 0) {
			content.scrollTop += delta;
		}
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

	private _getView(): HTMLElement | null {
		return dom.findParentWithClass(this._editor.getContainerDomNode(), 'multiDiffEditor');
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

/**
 * Space right below the code of a comment thread whose widget is docked there, so that the widget covers no code, in an
 * editor that is too narrow for the widget to float beside the code.
 *
 * Unlike {@link FloatingWidgetRoom}, the space is made as soon as it's requested, so that the widget is placed in the
 * space that the editor made, rather than over the code that the space moves out of its way. Making the space while the
 * browser delivers resize notifications, such as when the widget resizes, doesn't resize the editor then: the multi diff
 * editor grows its editors at the next animation frame.
 */
export class FloatingWidgetDockZone extends Disposable {

	// The space goes before the other zones after the last line of the code, so that it's right below the code.
	private readonly _zone: IViewZone = { afterLineNumber: 0, heightInPx: 0, ordinal: 0, domNode: dom.$('div'), showInHiddenAreas: true };
	private _zoneId: string | undefined;

	constructor(private readonly _editor: ICodeEditor) {
		super();
		// A new model gets a new view, which doesn't have the space.
		this._register(_editor.onDidChangeModel(() => this._zoneId = undefined));
		this._register(toDisposable(() => this.hide()));
	}

	/**
	 * Makes the space after the given line as tall as given. With `wholeLines`, the height is rounded up to whole lines of
	 * the editor, so that a height that changes continuously, such as while the user resizes the widget, changes the space
	 * less often: each change makes a diff editor align its sides again.
	 */
	show(afterLineNumber: number, height: number, wholeLines = false): void {
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const zoneHeight = wholeLines ? Math.ceil(height / lineHeight) * lineHeight : height;
		if (this._zoneId && this._zone.afterLineNumber === afterLineNumber && this._zone.heightInPx === zoneHeight) {
			return;
		}
		this._zone.afterLineNumber = afterLineNumber;
		this._zone.heightInPx = zoneHeight;
		this._editor.changeViewZones(accessor => {
			if (this._zoneId) {
				accessor.layoutZone(this._zoneId);
			} else {
				this._zoneId = accessor.addZone(this._zone);
			}
		});
	}

	hide(): void {
		const zoneId = this._zoneId;
		if (zoneId) {
			this._zoneId = undefined;
			this._editor.changeViewZones(accessor => accessor.removeZone(zoneId));
		}
	}

	/**
	 * The top of the space in document coordinates, or `undefined` when the editor doesn't show the space, such as when
	 * it has no view to show it in. Every docked widget asks for it whenever the editor scrolls, so the space is first
	 * looked for where it usually is, first after its line, rather than among all of the editor's view zones.
	 */
	getTop(): number | undefined {
		const viewLayout = this._editor._getViewModel()?.viewLayout;
		if (!viewLayout || !this._zoneId) {
			return undefined;
		}
		const first = viewLayout.getWhitespaceAtVerticalOffset(this._editor.getBottomForLineNumber(this._zone.afterLineNumber));
		if (first?.id === this._zoneId) {
			return first.verticalOffset;
		}
		const placed = getViewZoneOffset(viewLayout.getWhitespaces(), this._zoneId);
		return placed ? viewLayout.getVerticalOffsetAfterLineNumber(placed.afterLineNumber) + placed.offset : undefined;
	}
}
