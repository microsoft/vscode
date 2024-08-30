/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ariaLabelForScreenReaderContent, ISimpleModel, newlinecount, PagedScreenReaderStrategy } from 'vs/editor/browser/controller/editContext/screenReaderUtils';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { RestrictedRenderingContext, RenderingContext, HorizontalPosition } from 'vs/editor/browser/view/renderingContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as viewEvents from 'vs/editor/common/viewEvents';
import * as dom from 'vs/base/browser/dom';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { Disposable } from 'vs/base/common/lifecycle';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';

interface ScreenReaderContentInfo {
	value: string;
	selectionOffsetStart: number;
	selectionOffsetEnd: number;
}

export class ScreenReaderSupport extends Disposable {

	// HTMLElement
	private _domNode: FastDomNode<HTMLElement>;

	// View Context
	private _context: ViewContext;

	// Configuration values
	private _contentLeft!: number;
	private _contentWidth!: number;
	private _lineHeight!: number;
	private _fontInfo!: FontInfo;
	private _accessibilitySupport!: AccessibilitySupport;
	private _accessibilityPageSize!: number;

	// Fields used for rendering
	private _scrollTop: number = 0;
	private _primarySelection: Selection = new Selection(1, 1, 1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;
	private _screenReaderContentInfo: ScreenReaderContentInfo | null = null;

	constructor(
		domNode: FastDomNode<HTMLElement>,
		context: ViewContext,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super();
		this._domNode = domNode;
		this._context = context;
		this._updateConfigurationSettings();
		this._updateDomAttributes();
	}

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primarySelection.getPosition());
		this.writeScreenReaderContent();
	}

	public render(ctx: RestrictedRenderingContext): void {
		if (!this._primaryCursorVisibleRange || !this._screenReaderContentInfo) {
			return;
		}
		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domNode, this._fontInfo);

		const verticalOffsetForPrimaryLineNumber = this._context.viewLayout.getVerticalOffsetForLineNumber(this._primarySelection.positionLineNumber);
		const top = verticalOffsetForPrimaryLineNumber - this._scrollTop;
		this._domNode.setTop(top);
		this._domNode.setLeft(this._contentLeft);
		this._domNode.setWidth(this._contentWidth);
		this._domNode.setHeight(this._lineHeight);

		// Setting position within the screen reader content
		const textContent = this._screenReaderContentInfo.value;
		const textContentBeforeSelection = textContent.substring(0, this._screenReaderContentInfo.selectionOffsetStart);
		this._domNode.domNode.scrollTop = newlinecount(textContentBeforeSelection) * this._lineHeight;
		this._domNode.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
	}

	// Will always call render after this, so can place all the code inside of render, no need to place it twice
	public onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.selections[0] ?? new Selection(1, 1, 1, 1);
		return true;
	}

	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._scrollTop = e.scrollTop;
		return true;
	}

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this._updateConfigurationSettings();
		this._updateDomAttributes();
		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this.writeScreenReaderContent();
		}
		return true;
	}

	private _updateConfigurationSettings(): void {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
		this._accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	}

	private _updateDomAttributes(): void {
		const options = this._context.configuration.options;
		this._domNode.domNode.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		const tabSize = this._context.viewModel.model.getOptions().tabSize;
		const spaceWidth = options.get(EditorOption.fontInfo).spaceWidth;
		this._domNode.domNode.style.tabSize = `${tabSize * spaceWidth}px`;
	}

	public setAriaOptions(): void { }

	public writeScreenReaderContent(): void {
		const screenReaderContentInfo = this._getScreenReaderContentInfo();
		if (!screenReaderContentInfo) {
			return;
		}
		if (this._domNode.domNode.textContent !== screenReaderContentInfo.value) {
			this._domNode.domNode.textContent = screenReaderContentInfo.value;
		}
		this._setSelectionOfScreenReaderContent(screenReaderContentInfo.selectionOffsetStart, screenReaderContentInfo.selectionOffsetEnd);
		this._screenReaderContentInfo = screenReaderContentInfo;
	}

	private _getScreenReaderContentInfo(): ScreenReaderContentInfo | undefined {
		if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
			return;
		}
		const simpleModel: ISimpleModel = {
			getLineCount: (): number => {
				return this._context.viewModel.getLineCount();
			},
			getLineMaxColumn: (lineNumber: number): number => {
				return this._context.viewModel.getLineMaxColumn(lineNumber);
			},
			getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
				return this._context.viewModel.getValueInRange(range, eol);
			},
			getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => {
				return this._context.viewModel.getValueLengthInRange(range, eol);
			},
			modifyPosition: (position: Position, offset: number): Position => {
				return this._context.viewModel.modifyPosition(position, offset);
			}
		};
		return PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._primarySelection, this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
	}

	private _setSelectionOfScreenReaderContent(selectionOffsetStart: number, selectionOffsetEnd: number): void {
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (!activeDocumentSelection) {
			return;
		}
		const textContent = this._domNode.domNode.firstChild;
		if (!textContent) {
			return;
		}
		const range = new globalThis.Range();
		range.setStart(textContent, selectionOffsetStart);
		range.setEnd(textContent, selectionOffsetEnd);
		activeDocumentSelection.removeAllRanges();
		activeDocumentSelection.addRange(range);
	}

	/* Last rendered data needed for correct hit-testing and determining the mouse position.
	 * Without this, the selection will blink as incorrect mouse position is calculated */
	public getLastRenderData(): Position | null {
		return this._primarySelection.getPosition();
	}
}
