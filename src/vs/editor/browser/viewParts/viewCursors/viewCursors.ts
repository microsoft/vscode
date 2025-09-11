/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './viewCursors.css';
import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { IntervalTimer, TimeoutTimer } from '../../../../base/common/async.js';
import { ViewPart } from '../../view/viewPart.js';
import { IViewCursorRenderData, ViewCursor, CursorPlurality } from './viewCursor.js';
import { TextEditorCursorBlinkingStyle, TextEditorCursorStyle, EditorOption } from '../../../common/config/editorOptions.js';
import { Position } from '../../../common/core/position.js';
import {
	editorCursorBackground, editorCursorForeground,
	editorMultiCursorPrimaryForeground, editorMultiCursorPrimaryBackground,
	editorMultiCursorSecondaryForeground, editorMultiCursorSecondaryBackground
} from '../../../common/core/editorColorRegistry.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { CursorChangeReason } from '../../../common/cursorEvents.js';
import { WindowIntervalTimer, getWindow } from '../../../../base/browser/dom.js';

/**
 * View cursors is a view part responsible for rendering the primary cursor and
 * any secondary cursors that are currently active.
 */
export class ViewCursors extends ViewPart {

	static readonly BLINK_INTERVAL = 500;

	private _readOnly: boolean;
	private _cursorBlinking: TextEditorCursorBlinkingStyle;
	private _cursorStyle: TextEditorCursorStyle;
	private _cursorSmoothCaretAnimation: 'off' | 'explicit' | 'on';
	private _editContextEnabled: boolean;
	private _selectionIsEmpty: boolean;
	private _isComposingInput: boolean;

	private _isVisible: boolean;

	private readonly _domNode: FastDomNode<HTMLElement>;

	private readonly _startCursorBlinkAnimation: TimeoutTimer;
	private readonly _cursorFlatBlinkInterval: IntervalTimer;
	private _blinkingEnabled: boolean;

	private _editorHasFocus: boolean;

	private readonly _primaryCursor: ViewCursor;
	private readonly _secondaryCursors: ViewCursor[];
	private _renderData: IViewCursorRenderData[];

	constructor(context: ViewContext) {
		super(context);

		const options = this._context.configuration.options;
		this._readOnly = options.get(EditorOption.readOnly);
		this._cursorBlinking = options.get(EditorOption.cursorBlinking);
		this._cursorStyle = options.get(EditorOption.effectiveCursorStyle);
		this._cursorSmoothCaretAnimation = options.get(EditorOption.cursorSmoothCaretAnimation);
		this._editContextEnabled = options.get(EditorOption.effectiveEditContext);
		this._selectionIsEmpty = true;
		this._isComposingInput = false;

		this._isVisible = false;

		this._primaryCursor = new ViewCursor(this._context, CursorPlurality.Single);
		this._secondaryCursors = [];
		this._renderData = [];

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.setAttribute('aria-hidden', 'true');
		this._updateDomClassName();

		this._domNode.appendChild(this._primaryCursor.getDomNode());

		this._startCursorBlinkAnimation = new TimeoutTimer();
		this._cursorFlatBlinkInterval = new WindowIntervalTimer();

		this._blinkingEnabled = false;

		this._editorHasFocus = false;
		this._updateBlinking();
	}

	public override dispose(): void {
		super.dispose();
		this._startCursorBlinkAnimation.dispose();
		this._cursorFlatBlinkInterval.dispose();
	}

	public getDomNode(): FastDomNode<HTMLElement> {
		return this._domNode;
	}

	// --- begin event handlers

	public override onCompositionStart(e: viewEvents.ViewCompositionStartEvent): boolean {
		this._isComposingInput = true;
		this._updateBlinking();
		return true;
	}
	public override onCompositionEnd(e: viewEvents.ViewCompositionEndEvent): boolean {
		this._isComposingInput = false;
		this._updateBlinking();
		return true;
	}
	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;

		this._readOnly = options.get(EditorOption.readOnly);
		this._cursorBlinking = options.get(EditorOption.cursorBlinking);
		this._cursorStyle = options.get(EditorOption.effectiveCursorStyle);
		this._cursorSmoothCaretAnimation = options.get(EditorOption.cursorSmoothCaretAnimation);
		this._editContextEnabled = options.get(EditorOption.effectiveEditContext);

		this._updateBlinking();
		this._updateDomClassName();

		this._primaryCursor.onConfigurationChanged(e);
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].onConfigurationChanged(e);
		}
		return true;
	}
	private _onCursorPositionChanged(position: Position, secondaryPositions: Position[], reason: CursorChangeReason): void {
		const pauseAnimation = (
			this._secondaryCursors.length !== secondaryPositions.length
			|| (this._cursorSmoothCaretAnimation === 'explicit' && reason !== CursorChangeReason.Explicit)
		);
		this._primaryCursor.setPlurality(secondaryPositions.length ? CursorPlurality.MultiPrimary : CursorPlurality.Single);
		this._primaryCursor.onCursorPositionChanged(position, pauseAnimation);
		this._updateBlinking();

		if (this._secondaryCursors.length < secondaryPositions.length) {
			// Create new cursors
			const addCnt = secondaryPositions.length - this._secondaryCursors.length;
			for (let i = 0; i < addCnt; i++) {
				const newCursor = new ViewCursor(this._context, CursorPlurality.MultiSecondary);
				this._domNode.domNode.insertBefore(newCursor.getDomNode().domNode, this._primaryCursor.getDomNode().domNode.nextSibling);
				this._secondaryCursors.push(newCursor);
			}
		} else if (this._secondaryCursors.length > secondaryPositions.length) {
			// Remove some cursors
			const removeCnt = this._secondaryCursors.length - secondaryPositions.length;
			for (let i = 0; i < removeCnt; i++) {
				this._domNode.removeChild(this._secondaryCursors[0].getDomNode());
				this._secondaryCursors.splice(0, 1);
			}
		}

		for (let i = 0; i < secondaryPositions.length; i++) {
			this._secondaryCursors[i].onCursorPositionChanged(secondaryPositions[i], pauseAnimation);
		}

	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		const positions: Position[] = [];
		for (let i = 0, len = e.selections.length; i < len; i++) {
			positions[i] = e.selections[i].getPosition();
		}
		this._onCursorPositionChanged(positions[0], positions.slice(1), e.reason);

		const selectionIsEmpty = e.selections[0].isEmpty();
		if (this._selectionIsEmpty !== selectionIsEmpty) {
			this._selectionIsEmpty = selectionIsEmpty;
			this._updateDomClassName();
		}

		return true;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		// true for inline decorations that can end up relayouting text
		return true;
	}
	public override onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		return true;
	}
	public override onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		this._editorHasFocus = e.isFocused;
		this._updateBlinking();
		return false;
	}
	public override onLinesChanged(e: viewEvents.ViewLinesChangedEvent): boolean {
		return true;
	}
	public override onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		return true;
	}
	public override onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return true;
	}
	public override onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boolean {
		const shouldRender = (position: Position) => {
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
		for (const secondaryCursor of this._secondaryCursors) {
			if (shouldRender(secondaryCursor.getPosition())) {
				return true;
			}
		}
		return false;
	}
	public override onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boolean {
		return true;
	}

	// --- end event handlers

	// ---- blinking logic

	private _getCursorBlinking(): TextEditorCursorBlinkingStyle {
		// TODO: Remove the following if statement when experimental edit context is made default sole implementation
		if (this._isComposingInput && !this._editContextEnabled) {
			// avoid double cursors
			return TextEditorCursorBlinkingStyle.Hidden;
		}
		if (!this._editorHasFocus) {
			return TextEditorCursorBlinkingStyle.Hidden;
		}
		if (this._readOnly) {
			return TextEditorCursorBlinkingStyle.Solid;
		}
		return this._cursorBlinking;
	}

	private _updateBlinking(): void {
		this._startCursorBlinkAnimation.cancel();
		this._cursorFlatBlinkInterval.cancel();

		const blinkingStyle = this._getCursorBlinking();

		// hidden and solid are special as they involve no animations
		const isHidden = (blinkingStyle === TextEditorCursorBlinkingStyle.Hidden);
		const isSolid = (blinkingStyle === TextEditorCursorBlinkingStyle.Solid);

		if (isHidden) {
			this._hide();
		} else {
			this._show();
		}

		this._blinkingEnabled = false;
		this._updateDomClassName();

		if (!isHidden && !isSolid) {
			if (blinkingStyle === TextEditorCursorBlinkingStyle.Blink) {
				// flat blinking is handled by JavaScript to save battery life due to Chromium step timing issue https://bugs.chromium.org/p/chromium/issues/detail?id=361587
				this._cursorFlatBlinkInterval.cancelAndSet(() => {
					if (this._isVisible) {
						this._hide();
					} else {
						this._show();
					}
				}, ViewCursors.BLINK_INTERVAL, getWindow(this._domNode.domNode));
			} else {
				this._startCursorBlinkAnimation.setIfNotSet(() => {
					this._blinkingEnabled = true;
					this._updateDomClassName();
				}, ViewCursors.BLINK_INTERVAL);
			}
		}
	}

	// --- end blinking logic

	private _updateDomClassName(): void {
		this._domNode.setClassName(this._getClassName());
	}

	private _getClassName(): string {
		let result = 'cursors-layer';
		if (!this._selectionIsEmpty) {
			result += ' has-selection';
		}
		switch (this._cursorStyle) {
			case TextEditorCursorStyle.Line:
				result += ' cursor-line-style';
				break;
			case TextEditorCursorStyle.Block:
				result += ' cursor-block-style';
				break;
			case TextEditorCursorStyle.Underline:
				result += ' cursor-underline-style';
				break;
			case TextEditorCursorStyle.LineThin:
				result += ' cursor-line-thin-style';
				break;
			case TextEditorCursorStyle.BlockOutline:
				result += ' cursor-block-outline-style';
				break;
			case TextEditorCursorStyle.UnderlineThin:
				result += ' cursor-underline-thin-style';
				break;
			default:
				result += ' cursor-line-style';
		}
		if (this._blinkingEnabled) {
			switch (this._getCursorBlinking()) {
				case TextEditorCursorBlinkingStyle.Blink:
					result += ' cursor-blink';
					break;
				case TextEditorCursorBlinkingStyle.Smooth:
					result += ' cursor-smooth';
					break;
				case TextEditorCursorBlinkingStyle.Phase:
					result += ' cursor-phase';
					break;
				case TextEditorCursorBlinkingStyle.Expand:
					result += ' cursor-expand';
					break;
				case TextEditorCursorBlinkingStyle.Solid:
					result += ' cursor-solid';
					break;
				default:
					result += ' cursor-solid';
			}
		} else {
			result += ' cursor-solid';
		}
		if (this._cursorSmoothCaretAnimation === 'on' || this._cursorSmoothCaretAnimation === 'explicit') {
			result += ' cursor-smooth-caret-animation';
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

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursor.prepareRender(ctx);
		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			this._secondaryCursors[i].prepareRender(ctx);
		}
	}

	public render(ctx: RestrictedRenderingContext): void {
		const renderData: IViewCursorRenderData[] = [];
		let renderDataLen = 0;

		const primaryRenderData = this._primaryCursor.render(ctx);
		if (primaryRenderData) {
			renderData[renderDataLen++] = primaryRenderData;
		}

		for (let i = 0, len = this._secondaryCursors.length; i < len; i++) {
			const secondaryRenderData = this._secondaryCursors[i].render(ctx);
			if (secondaryRenderData) {
				renderData[renderDataLen++] = secondaryRenderData;
			}
		}

		this._renderData = renderData;
	}

	public getLastRenderData(): IViewCursorRenderData[] {
		return this._renderData;
	}
}

registerThemingParticipant((theme, collector) => {
	type CursorTheme = {
		foreground: string;
		background: string;
		class: string;
	};

	const cursorThemes: CursorTheme[] = [
		{ class: '.cursor', foreground: editorCursorForeground, background: editorCursorBackground },
		{ class: '.cursor-primary', foreground: editorMultiCursorPrimaryForeground, background: editorMultiCursorPrimaryBackground },
		{ class: '.cursor-secondary', foreground: editorMultiCursorSecondaryForeground, background: editorMultiCursorSecondaryBackground },
	];

	for (const cursorTheme of cursorThemes) {
		const caret = theme.getColor(cursorTheme.foreground);
		if (caret) {
			let caretBackground = theme.getColor(cursorTheme.background);
			if (!caretBackground) {
				caretBackground = caret.opposite();
			}
			collector.addRule(`.monaco-editor .cursors-layer ${cursorTheme.class} { background-color: ${caret}; border-color: ${caret}; color: ${caretBackground}; }`);
			if (isHighContrast(theme.type)) {
				collector.addRule(`.monaco-editor .cursors-layer.has-selection ${cursorTheme.class} { border-left: 1px solid ${caretBackground}; border-right: 1px solid ${caretBackground}; }`);
			}
		}
	}
});
