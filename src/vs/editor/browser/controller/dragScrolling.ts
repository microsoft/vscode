/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { EditorOption } from '../../common/config/editorOptions.js';
import { Position } from '../../common/core/position.js';
import { ViewContext } from '../../common/viewModel/viewContext.js';
import { NavigationCommandRevealType } from '../coreCommands.js';
import { IMouseTarget, IMouseTargetOutsideEditor } from '../editorBrowser.js';
import { createCoordinatesRelativeToEditor, createEditorPagePosition, EditorMouseEvent, PageCoordinates } from '../editorDom.js';
import { IPointerHandlerHelper } from './mouseHandler.js';
import { MouseTarget, MouseTargetFactory } from './mouseTarget.js';

export abstract class DragScrolling extends Disposable {

	private _operation: DragScrollingOperation | null;

	constructor(
		protected readonly _context: ViewContext,
		protected readonly _viewHelper: IPointerHandlerHelper,
		protected readonly _mouseTargetFactory: MouseTargetFactory,
		protected readonly _dispatchMouse: (position: IMouseTarget, inSelectionMode: boolean, revealType: NavigationCommandRevealType) => void
	) {
		super();
		this._operation = null;
	}

	public override dispose(): void {
		super.dispose();
		this.stop();
	}

	public start(position: IMouseTargetOutsideEditor, mouseEvent: EditorMouseEvent): void {
		if (this._operation) {
			this._operation.setPosition(position, mouseEvent);
		} else {
			this._operation = this._createDragScrollingOperation(position, mouseEvent);
		}
	}

	public stop(): void {
		if (this._operation) {
			this._operation.dispose();
			this._operation = null;
		}
	}

	protected abstract _createDragScrollingOperation(position: IMouseTargetOutsideEditor, mouseEvent: EditorMouseEvent): DragScrollingOperation;
}

export abstract class DragScrollingOperation extends Disposable {

	protected _position: IMouseTargetOutsideEditor;
	protected _mouseEvent: EditorMouseEvent;
	private _lastTime: number;
	protected _animationFrameDisposable: IDisposable;

	constructor(
		protected readonly _context: ViewContext,
		protected readonly _viewHelper: IPointerHandlerHelper,
		protected readonly _mouseTargetFactory: MouseTargetFactory,
		protected readonly _dispatchMouse: (position: IMouseTarget, inSelectionMode: boolean, revealType: NavigationCommandRevealType) => void,
		position: IMouseTargetOutsideEditor,
		mouseEvent: EditorMouseEvent
	) {
		super();
		this._position = position;
		this._mouseEvent = mouseEvent;
		this._lastTime = Date.now();
		this._animationFrameDisposable = dom.scheduleAtNextAnimationFrame(dom.getWindow(mouseEvent.browserEvent), () => this._execute());
	}

	public override dispose(): void {
		this._animationFrameDisposable.dispose();
		super.dispose();
	}

	public setPosition(position: IMouseTargetOutsideEditor, mouseEvent: EditorMouseEvent): void {
		this._position = position;
		this._mouseEvent = mouseEvent;
	}

	/**
	 * update internal state and return elapsed ms since last time
	 */
	protected _tick(): number {
		const now = Date.now();
		const elapsed = now - this._lastTime;
		this._lastTime = now;
		return elapsed;
	}

	protected abstract _execute(): void;

}

export class TopBottomDragScrolling extends DragScrolling {
	protected _createDragScrollingOperation(position: IMouseTargetOutsideEditor, mouseEvent: EditorMouseEvent): DragScrollingOperation {
		return new TopBottomDragScrollingOperation(this._context, this._viewHelper, this._mouseTargetFactory, this._dispatchMouse, position, mouseEvent);
	}
}

export class TopBottomDragScrollingOperation extends DragScrollingOperation {

	/**
	 * get the number of lines per second to auto-scroll
	 */
	private _getScrollSpeed(): number {
		const lineHeight = this._context.configuration.options.get(EditorOption.lineHeight);
		const viewportInLines = this._context.configuration.options.get(EditorOption.layoutInfo).height / lineHeight;
		const outsideDistanceInLines = this._position.outsideDistance / lineHeight;

		if (outsideDistanceInLines <= 1.5) {
			return Math.max(30, viewportInLines * (1 + outsideDistanceInLines));
		}
		if (outsideDistanceInLines <= 3) {
			return Math.max(60, viewportInLines * (2 + outsideDistanceInLines));
		}
		return Math.max(200, viewportInLines * (7 + outsideDistanceInLines));
	}

	protected _execute(): void {
		const lineHeight = this._context.configuration.options.get(EditorOption.lineHeight);
		const scrollSpeedInLines = this._getScrollSpeed();
		const elapsed = this._tick();
		const scrollInPixels = scrollSpeedInLines * (elapsed / 1000) * lineHeight;
		const scrollValue = (this._position.outsidePosition === 'above' ? -scrollInPixels : scrollInPixels);

		this._context.viewModel.viewLayout.deltaScrollNow(0, scrollValue);
		this._viewHelper.renderNow();

		const viewportData = this._context.viewLayout.getLinesViewportData();
		const edgeLineNumber = (this._position.outsidePosition === 'above' ? viewportData.startLineNumber : viewportData.endLineNumber);

		// First, try to find a position that matches the horizontal position of the mouse
		let mouseTarget: IMouseTarget;
		{
			const editorPos = createEditorPagePosition(this._viewHelper.viewDomNode);
			const horizontalScrollbarHeight = this._context.configuration.options.get(EditorOption.layoutInfo).horizontalScrollbarHeight;
			const pos = new PageCoordinates(this._mouseEvent.pos.x, editorPos.y + editorPos.height - horizontalScrollbarHeight - 0.1);
			const relativePos = createCoordinatesRelativeToEditor(this._viewHelper.viewDomNode, editorPos, pos);
			mouseTarget = this._mouseTargetFactory.createMouseTarget(this._viewHelper.getLastRenderData(), editorPos, pos, relativePos, null);
		}
		if (!mouseTarget.position || mouseTarget.position.lineNumber !== edgeLineNumber) {
			if (this._position.outsidePosition === 'above') {
				mouseTarget = MouseTarget.createOutsideEditor(this._position.mouseColumn, new Position(edgeLineNumber, 1), 'above', this._position.outsideDistance);
			} else {
				mouseTarget = MouseTarget.createOutsideEditor(this._position.mouseColumn, new Position(edgeLineNumber, this._context.viewModel.getLineMaxColumn(edgeLineNumber)), 'below', this._position.outsideDistance);
			}
		}

		this._dispatchMouse(mouseTarget, true, NavigationCommandRevealType.None);
		this._animationFrameDisposable = dom.scheduleAtNextAnimationFrame(dom.getWindow(mouseTarget.element), () => this._execute());
	}
}

export class LeftRightDragScrolling extends DragScrolling {
	protected _createDragScrollingOperation(position: IMouseTargetOutsideEditor, mouseEvent: EditorMouseEvent): DragScrollingOperation {
		return new LeftRightDragScrollingOperation(this._context, this._viewHelper, this._mouseTargetFactory, this._dispatchMouse, position, mouseEvent);
	}
}

export class LeftRightDragScrollingOperation extends DragScrollingOperation {

	/**
	 * get the number of cols per second to auto-scroll
	 */
	private _getScrollSpeed(): number {
		const charWidth = this._context.configuration.options.get(EditorOption.fontInfo).typicalFullwidthCharacterWidth;
		const viewportInChars = this._context.configuration.options.get(EditorOption.layoutInfo).contentWidth / charWidth;
		const outsideDistanceInChars = this._position.outsideDistance / charWidth;
		if (outsideDistanceInChars <= 1.5) {
			return Math.max(30, viewportInChars * (1 + outsideDistanceInChars));
		}
		if (outsideDistanceInChars <= 3) {
			return Math.max(60, viewportInChars * (2 + outsideDistanceInChars));
		}
		return Math.max(200, viewportInChars * (7 + outsideDistanceInChars));
	}

	protected _execute(): void {
		const charWidth = this._context.configuration.options.get(EditorOption.fontInfo).typicalFullwidthCharacterWidth;
		const scrollSpeedInChars = this._getScrollSpeed();
		const elapsed = this._tick();
		const scrollInPixels = scrollSpeedInChars * (elapsed / 1000) * charWidth * 0.5;
		const scrollValue = (this._position.outsidePosition === 'left' ? -scrollInPixels : scrollInPixels);

		this._context.viewModel.viewLayout.deltaScrollNow(scrollValue, 0);
		this._viewHelper.renderNow();

		if (!this._position.position) {
			return;
		}
		const edgeLineNumber = this._position.position.lineNumber;

		// First, try to find a position that matches the horizontal position of the mouse
		let mouseTarget: IMouseTarget;
		{
			const editorPos = createEditorPagePosition(this._viewHelper.viewDomNode);
			const horizontalScrollbarHeight = this._context.configuration.options.get(EditorOption.layoutInfo).horizontalScrollbarHeight;
			const pos = new PageCoordinates(this._mouseEvent.pos.x, editorPos.y + editorPos.height - horizontalScrollbarHeight - 0.1);
			const relativePos = createCoordinatesRelativeToEditor(this._viewHelper.viewDomNode, editorPos, pos);
			mouseTarget = this._mouseTargetFactory.createMouseTarget(this._viewHelper.getLastRenderData(), editorPos, pos, relativePos, null);
		}

		if (this._position.outsidePosition === 'left') {
			mouseTarget = MouseTarget.createOutsideEditor(mouseTarget.mouseColumn, new Position(edgeLineNumber, mouseTarget.mouseColumn), 'left', this._position.outsideDistance);
		} else {
			mouseTarget = MouseTarget.createOutsideEditor(mouseTarget.mouseColumn, new Position(edgeLineNumber, mouseTarget.mouseColumn), 'right', this._position.outsideDistance);
		}

		this._dispatchMouse(mouseTarget, true, NavigationCommandRevealType.None);
		this._animationFrameDisposable = dom.scheduleAtNextAnimationFrame(dom.getWindow(mouseTarget.element), () => this._execute());
	}
}
