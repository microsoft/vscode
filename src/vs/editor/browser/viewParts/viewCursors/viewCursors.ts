/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./viewCursors';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ClassNames } from 'vs/editor/browser/editorBrowser';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { Position } from 'vs/editor/common/core/position';
import { IViewCursorRenderData, ViewCursor } from 'vs/editor/browser/viewParts/viewCursors/viewCursor';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IRenderingContext, IRestrictedRenderingContext } from 'vs/editor/common/view/renderingContext';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/styleMutator';
import { TimeoutTimer } from 'vs/base/common/async';

export class ViewCursors extends ViewPart {

	static BLINK_INTERVAL = 500;

	private _readOnly: boolean;
	private _cursorBlinking: editorCommon.TextEditorCursorBlinkingStyle;
	private _cursorStyle: editorCommon.TextEditorCursorStyle;
	private _selectionIsEmpty: boolean;

	private _isVisible: boolean;

	private _domNode: FastDomNode;

	private _startCursorBlinkAnimation: TimeoutTimer;
	private _blinkingEnabled: boolean;

	private _editorHasFocus: boolean;

	private _primaryCursor: ViewCursor;
	private _secondaryCursors: ViewCursor[];
	private _renderData: IViewCursorRenderData[];

	constructor(context: ViewContext) {
		super(context);

		this._readOnly = this._context.configuration.editor.readOnly;
		this._cursorBlinking = this._context.configuration.editor.viewInfo.cursorBlinking;
		this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		this._selectionIsEmpty = true;

		this._primaryCursor = new ViewCursor(this._context, false);
		this._secondaryCursors = [];
		this._renderData = [];

		this._domNode = createFastDomNode(document.createElement('div'));
		this._updateDomClassName();

		this._domNode.domNode.appendChild(this._primaryCursor.getDomNode());

		this._startCursorBlinkAnimation = new TimeoutTimer();
		this._blinkingEnabled = false;

		this._editorHasFocus = false;
		this._updateBlinking();
	}

	public dispose(): void {
		super.dispose();
		this._startCursorBlinkAnimation.dispose();
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		this._primaryCursor.onModelFlushed();
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			let domNode = this._secondaryCursors[i].getDomNode();
			domNode.parentNode.removeChild(domNode);
		}
		this._secondaryCursors = [];
		return true;
	}
	public onModelDecorationsChanged(e: editorCommon.IViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;//e.inlineDecorationsChanged;
	}
	public onModelLinesDeleted(e: editorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLineChanged(e: editorCommon.IViewLineChangedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e: editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onModelTokensChanged(e: editorCommon.IViewTokensChangedEvent): boolean {
		let shouldRender = (position: Position) => {
			for (let i = 0, len = e.ranges.length; i < len; i++) {
				if (e.ranges[i].fromLineNumber <= position.lineNumber && position.lineNumber <= e.ranges[i].toLineNumber) {
					return true;
				}
			}
			return false;
		};
		if (shouldRender(this._primaryCursor.getPosition())) {
			return true;
		}
		for (let i = 0; i < this._secondaryCursors.length; i++) {
			if (shouldRender(this._secondaryCursors[i].getPosition())) {
				return true;
			}
		}
		return false;
	}
	public onCursorPositionChanged(e: editorCommon.IViewCursorPositionChangedEvent): boolean {
		this._primaryCursor.onCursorPositionChanged(e.position, e.isInEditableRange);
		this._updateBlinking();

		if (this._secondaryCursors.length < e.secondaryPositions.length) {
			// Create new cursors
			let addCnt = e.secondaryPositions.length - this._secondaryCursors.length;
			for (let i = 0; i < addCnt; i++) {
				let newCursor = new ViewCursor(this._context, true);
				this._primaryCursor.getDomNode().parentNode.insertBefore(newCursor.getDomNode(), this._primaryCursor.getDomNode().nextSibling);
				this._secondaryCursors.push(newCursor);
			}
		} else if (this._secondaryCursors.length > e.secondaryPositions.length) {
			// Remove some cursors
			let removeCnt = this._secondaryCursors.length - e.secondaryPositions.length;
			for (let i = 0; i < removeCnt; i++) {
				this._secondaryCursors[0].getDomNode().parentNode.removeChild(this._secondaryCursors[0].getDomNode());
				this._secondaryCursors.splice(0, 1);
			}
		}

		for (let i = 0; i < e.secondaryPositions.length; i++) {
			this._secondaryCursors[i].onCursorPositionChanged(e.secondaryPositions[i], e.isInEditableRange);
		}

		return true;
	}
	public onCursorSelectionChanged(e: editorCommon.IViewCursorSelectionChangedEvent): boolean {
		let selectionIsEmpty = e.selection.isEmpty();
		if (this._selectionIsEmpty !== selectionIsEmpty) {
			this._selectionIsEmpty = selectionIsEmpty;
			this._updateDomClassName();
		}
		return false;
	}
	public onConfigurationChanged(e: editorCommon.IConfigurationChangedEvent): boolean {

		if (e.readOnly) {
			this._readOnly = this._context.configuration.editor.readOnly;
		}
		if (e.viewInfo.cursorBlinking) {
			this._cursorBlinking = this._context.configuration.editor.viewInfo.cursorBlinking;
		}
		if (e.viewInfo.cursorStyle) {
			this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		}

		this._primaryCursor.onConfigurationChanged(e);
		this._updateBlinking();
		if (e.viewInfo.cursorStyle || e.viewInfo.cursorBlinking) {
			this._updateDomClassName();
		}
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].onConfigurationChanged(e);
		}
		return true;
	}
	public onLayoutChanged(layoutInfo: editorCommon.EditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e: editorCommon.IScrollEvent): boolean {
		return true;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onViewFocusChanged(isFocused: boolean): boolean {
		this._editorHasFocus = isFocused;
		this._updateBlinking();
		return false;
	}
	// --- end event handlers

	public getPosition(): Position {
		return this._primaryCursor.getPosition();
	}

	// ---- blinking logic

	private _getCursorBlinking(): editorCommon.TextEditorCursorBlinkingStyle {
		if (!this._editorHasFocus) {
			return editorCommon.TextEditorCursorBlinkingStyle.Hidden;
		}
		if (this._readOnly || !this._primaryCursor.getIsInEditableRange()) {
			return editorCommon.TextEditorCursorBlinkingStyle.Solid;
		}
		return this._cursorBlinking;
	}

	private _updateBlinking(): void {
		this._startCursorBlinkAnimation.cancel();

		let blinkingStyle = this._getCursorBlinking();

		// hidden and solid are special as they involve no animations
		let isHidden = (blinkingStyle === editorCommon.TextEditorCursorBlinkingStyle.Hidden);
		let isSolid = (blinkingStyle === editorCommon.TextEditorCursorBlinkingStyle.Solid);

		if (isHidden) {
			this._hide();
		} else {
			this._show();
		}

		this._blinkingEnabled = false;
		this._updateDomClassName();

		if (!isHidden && !isSolid) {
			this._startCursorBlinkAnimation.setIfNotSet(() => {
				this._blinkingEnabled = true;
				this._updateDomClassName();
			}, ViewCursors.BLINK_INTERVAL);
		}
	}
	// --- end blinking logic

	private _updateDomClassName(): void {
		this._domNode.setClassName(this._getClassName());
	}

	private _getClassName(): string {
		let result = ClassNames.VIEW_CURSORS_LAYER;
		if (!this._selectionIsEmpty) {
			result += ' has-selection';
		}
		switch (this._cursorStyle) {
			case editorCommon.TextEditorCursorStyle.Line:
				result += ' cursor-line-style';
				break;
			case editorCommon.TextEditorCursorStyle.Block:
				result += ' cursor-block-style';
				break;
			case editorCommon.TextEditorCursorStyle.Underline:
				result += ' cursor-underline-style';
				break;
			default:
				result += ' cursor-line-style';
		}
		if (this._blinkingEnabled) {
			switch (this._getCursorBlinking()) {
				case editorCommon.TextEditorCursorBlinkingStyle.Blink:
					result += ' cursor-blink';
					break;
				case editorCommon.TextEditorCursorBlinkingStyle.Smooth:
					result += ' cursor-smooth';
					break;
				case editorCommon.TextEditorCursorBlinkingStyle.Phase:
					result += ' cursor-phase';
					break;
				case editorCommon.TextEditorCursorBlinkingStyle.Expand:
					result += ' cursor-expand';
					break;
				case editorCommon.TextEditorCursorBlinkingStyle.Solid:
					result += ' cursor-solid';
					break;
				default:
					result += ' cursor-solid';
			}
		} else {
			result += ' cursor-solid';
		}
		return result;
	}

	private _show(): void {
		this._primaryCursor.show();
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].show();
		}
		this._isVisible = true;
	}

	private _hide(): void {
		this._primaryCursor.hide();
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].hide();
		}
		this._isVisible = false;
	}

	// ---- IViewPart implementation

	public prepareRender(ctx: IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}

		this._primaryCursor.prepareRender(ctx);
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].prepareRender(ctx);
		}
	}

	public render(ctx: IRestrictedRenderingContext): void {
		this._renderData = [];
		this._renderData.push(this._primaryCursor.render(ctx));
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._renderData.push(this._secondaryCursors[i].render(ctx));
		}

		// Keep only data of cursors that are visible
		this._renderData = this._renderData.filter(d => !!d);
	}

	public getLastRenderData(): IViewCursorRenderData[] {
		return this._renderData;
	}
}
