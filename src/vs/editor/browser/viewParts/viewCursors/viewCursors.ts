/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./viewCursors';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ClassNames} from 'vs/editor/browser/editorBrowser';
import {ViewPart} from 'vs/editor/browser/view/viewPart';
import {ViewCursor} from 'vs/editor/browser/viewParts/viewCursors/viewCursor';
import {ViewContext} from 'vs/editor/common/view/viewContext';
import {IRenderingContext, IRestrictedRenderingContext} from 'vs/editor/common/view/renderingContext';
import {FastDomNode, createFastDomNode} from 'vs/base/browser/styleMutator';

enum RenderType {
	Hidden,
	Visible,
	Blink
}

export class ViewCursors extends ViewPart {

	static BLINK_INTERVAL = 500;

	private _readOnly: boolean;
	private _cursorBlinking: string;
	private _cursorStyle: editorCommon.TextEditorCursorStyle;
	private _canUseTranslate3d: boolean;

	private _isVisible: boolean;

	private _domNode: FastDomNode;

	private _blinkTimer: number;

	private _editorHasFocus: boolean;

	private _primaryCursor: ViewCursor;
	private _secondaryCursors: ViewCursor[];

	constructor(context: ViewContext) {
		super(context);

		this._readOnly = this._context.configuration.editor.readOnly;
		this._cursorBlinking = this._context.configuration.editor.viewInfo.cursorBlinking;
		this._cursorStyle = this._context.configuration.editor.viewInfo.cursorStyle;
		this._canUseTranslate3d = context.configuration.editor.viewInfo.canUseTranslate3d;

		this._primaryCursor = new ViewCursor(this._context, false);
		this._secondaryCursors = [];

		this._domNode = createFastDomNode(document.createElement('div'));
		this._updateDomClassName();

		this._domNode.domNode.appendChild(this._primaryCursor.getDomNode());

		this._blinkTimer = -1;

		this._editorHasFocus = false;
		this._updateBlinking();
	}

	public dispose(): void {
		super.dispose();
		if (this._blinkTimer !== -1) {
			window.clearInterval(this._blinkTimer);
			this._blinkTimer = -1;
		}
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		this._primaryCursor.onModelFlushed();
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			var domNode = this._secondaryCursors[i].getDomNode();
			domNode.parentNode.removeChild(domNode);
		}
		this._secondaryCursors = [];
		return true;
	}
	public onModelDecorationsChanged(e: editorCommon.IViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return e.inlineDecorationsChanged;
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
		var shouldRender = (position: editorCommon.IPosition) => {
			return e.fromLineNumber <= position.lineNumber && position.lineNumber <= e.toLineNumber;
		};
		if (shouldRender(this._primaryCursor.getPosition())) {
			return true;
		}
		for (var i = 0; i < this._secondaryCursors.length; i++) {
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
			var addCnt = e.secondaryPositions.length - this._secondaryCursors.length;
			for (var i = 0; i < addCnt; i++) {
				var newCursor = new ViewCursor(this._context, true);
				this._primaryCursor.getDomNode().parentNode.insertBefore(newCursor.getDomNode(), this._primaryCursor.getDomNode().nextSibling);
				this._secondaryCursors.push(newCursor);
			}
		} else if (this._secondaryCursors.length > e.secondaryPositions.length) {
			// Remove some cursors
			var removeCnt = this._secondaryCursors.length - e.secondaryPositions.length;
			for (var i = 0; i < removeCnt; i++) {
				this._secondaryCursors[0].getDomNode().parentNode.removeChild(this._secondaryCursors[0].getDomNode());
				this._secondaryCursors.splice(0, 1);
			}
		}

		for (var i = 0; i < e.secondaryPositions.length; i++) {
			this._secondaryCursors[i].onCursorPositionChanged(e.secondaryPositions[i], e.isInEditableRange);
		}

		return true;
	}
	public onCursorSelectionChanged(e: editorCommon.IViewCursorSelectionChangedEvent): boolean {
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
		if (e.viewInfo.canUseTranslate3d) {
			this._canUseTranslate3d = this._context.configuration.editor.viewInfo.canUseTranslate3d;
		}

		this._primaryCursor.onConfigurationChanged(e);
		this._updateBlinking();
		if (e.viewInfo.cursorStyle) {
			this._updateDomClassName();
		}
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
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

	public getPosition(): editorCommon.IPosition {
		return this._primaryCursor.getPosition();
	}

	// ---- blinking logic

	private _getRenderType(): RenderType {
		if (this._editorHasFocus) {
			if (this._primaryCursor.getIsInEditableRange() && !this._readOnly) {
				switch (this._cursorBlinking) {
					case 'blink':
						return RenderType.Blink;
					case 'visible':
						return RenderType.Visible;
					case 'hidden':
						return RenderType.Hidden;
					default:
						return RenderType.Blink;
				}
			}
			return RenderType.Visible;
		}
		return RenderType.Hidden;
	}

	private _updateBlinking(): void {
		if (this._blinkTimer !== -1) {
			window.clearInterval(this._blinkTimer);
			this._blinkTimer = -1;
		}

		var renderType = this._getRenderType();

		if (renderType === RenderType.Visible || renderType === RenderType.Blink) {
			this._show();
		} else {
			this._hide();
		}

		if (renderType === RenderType.Blink) {
			this._blinkTimer = window.setInterval(() => this._blink(), ViewCursors.BLINK_INTERVAL);
		}
	}
	// --- end blinking logic

	private _updateDomClassName(): void {
		this._domNode.setClassName(this._getClassName());
	}

	private _getClassName(): string {
		let result = ClassNames.VIEW_CURSORS_LAYER;
		let extraClassName: string;
		switch (this._cursorStyle) {
			case editorCommon.TextEditorCursorStyle.Line:
				extraClassName = 'cursor-line-style';
				break;
			case editorCommon.TextEditorCursorStyle.Block:
				extraClassName = 'cursor-block-style';
				break;
			case editorCommon.TextEditorCursorStyle.Underline:
				extraClassName = 'cursor-underline-style';
				break;
			default:
				extraClassName = 'cursor-line-style';
		}
		return result + ' ' + extraClassName;
	}

	private _blink(): void {
		if (this._isVisible) {
			this._hide();
		} else {
			this._show();
		}
	}

	private _show(): void {
		this._primaryCursor.show();
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].show();
		}
		this._isVisible = true;
	}

	private _hide(): void {
		this._primaryCursor.hide();
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
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
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].prepareRender(ctx);
		}
	}

	public render(ctx: IRestrictedRenderingContext): void {
		this._primaryCursor.render(ctx);
		for (var i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].render(ctx);
		}

		if (this._canUseTranslate3d) {
			this._domNode.setTransform('translate3d(0px, 0px, 0px)');
		} else {
			this._domNode.setTransform('');
		}
	}
}
