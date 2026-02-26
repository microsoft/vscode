/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { ICodeEditor, IEditorMouseEvent, IOverlayWidget, IOverlayWidgetPosition, MouseTargetType } from '../../../browser/editorBrowser.js';
import { ConfigurationChangedEvent, EditorOption } from '../../../common/config/editorOptions.js';
import { HoverOperation, HoverResult, HoverStartMode } from './hoverOperation.js';
import { HoverWidget } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IHoverWidget } from './hoverTypes.js';
import { IHoverMessage, LaneOrLineNumber, GlyphHoverComputer, GlyphHoverComputerOptions } from './glyphHoverComputer.js';
import { isMousePositionWithinElement } from './hoverUtils.js';

const $ = dom.$;

export class GlyphHoverWidget extends Disposable implements IOverlayWidget, IHoverWidget {

	public static readonly ID = 'editor.contrib.modesGlyphHoverWidget';
	public readonly allowEditorOverflow = true;

	private readonly _editor: ICodeEditor;
	private readonly _hover: HoverWidget;

	private _isVisible: boolean;
	private _messages: IHoverMessage[];

	private readonly _hoverOperation: HoverOperation<GlyphHoverComputerOptions, IHoverMessage>;
	private readonly _renderDisposeables = this._register(new DisposableStore());

	private _hoverComputerOptions: GlyphHoverComputerOptions | undefined;

	constructor(
		editor: ICodeEditor,
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
	) {
		super();
		this._editor = editor;

		this._isVisible = false;
		this._messages = [];

		this._hover = this._register(new HoverWidget(true));
		this._hover.containerDomNode.classList.toggle('hidden', !this._isVisible);

		this._hoverOperation = this._register(new HoverOperation(this._editor, new GlyphHoverComputer(this._editor)));
		this._register(this._hoverOperation.onResult((result) => this._withResult(result)));

		this._register(this._editor.onDidChangeModelDecorations(() => this._onModelDecorationsChanged()));
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));
		this._register(dom.addStandardDisposableListener(this._hover.containerDomNode, 'mouseleave', (e) => {
			this._onMouseLeave(e);
		}));
		this._editor.addOverlayWidget(this);
	}

	public override dispose(): void {
		this._hoverComputerOptions = undefined;
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return GlyphHoverWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._hover.containerDomNode;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		return null;
	}

	private _updateFont(): void {
		// eslint-disable-next-line no-restricted-syntax
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	private _onModelDecorationsChanged(): void {
		if (this._isVisible && this._hoverComputerOptions) {
			// The decorations have changed and the hover is visible,
			// we need to recompute the displayed text
			this._hoverOperation.cancel();
			this._hoverOperation.start(HoverStartMode.Delayed, this._hoverComputerOptions);
		}
	}

	public showsOrWillShow(mouseEvent: IEditorMouseEvent): boolean {
		const target = mouseEvent.target;
		if (target.type === MouseTargetType.GUTTER_GLYPH_MARGIN && target.detail.glyphMarginLane) {
			this._startShowingAt(target.position.lineNumber, target.detail.glyphMarginLane);
			return true;
		}
		if (target.type === MouseTargetType.GUTTER_LINE_NUMBERS) {
			this._startShowingAt(target.position.lineNumber, 'lineNo');
			return true;
		}
		return false;
	}

	private _startShowingAt(lineNumber: number, laneOrLine: LaneOrLineNumber): void {
		if (this._hoverComputerOptions
			&& this._hoverComputerOptions.lineNumber === lineNumber
			&& this._hoverComputerOptions.laneOrLine === laneOrLine) {
			// We have to show the widget at the exact same line number as before, so no work is needed
			return;
		}
		this._hoverOperation.cancel();
		this.hide();
		this._hoverComputerOptions = { lineNumber, laneOrLine };
		this._hoverOperation.start(HoverStartMode.Delayed, this._hoverComputerOptions);
	}

	public hide(): void {
		this._hoverComputerOptions = undefined;
		this._hoverOperation.cancel();
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._hover.containerDomNode.classList.toggle('hidden', !this._isVisible);
	}

	private _withResult(result: HoverResult<GlyphHoverComputerOptions, IHoverMessage>): void {
		this._messages = result.value;

		if (this._messages.length > 0) {
			this._renderMessages(result.options.lineNumber, result.options.laneOrLine, this._messages);
		} else {
			this.hide();
		}
	}

	private _renderMessages(lineNumber: number, laneOrLine: LaneOrLineNumber, messages: IHoverMessage[]): void {
		this._renderDisposeables.clear();

		const fragment = document.createDocumentFragment();

		for (const msg of messages) {
			const markdownHoverElement = $('div.hover-row.markdown-hover');
			const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
			const renderedContents = this._renderDisposeables.add(this._markdownRendererService.render(msg.value, { context: this._editor }));
			hoverContentsElement.appendChild(renderedContents.element);
			fragment.appendChild(markdownHoverElement);
		}

		this._updateContents(fragment);
		this._showAt(lineNumber, laneOrLine);
	}

	private _updateContents(node: Node): void {
		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this._updateFont();
	}

	private _showAt(lineNumber: number, laneOrLine: LaneOrLineNumber): void {
		if (!this._isVisible) {
			this._isVisible = true;
			this._hover.containerDomNode.classList.toggle('hidden', !this._isVisible);
		}

		const editorLayout = this._editor.getLayoutInfo();
		const topForLineNumber = this._editor.getTopForLineNumber(lineNumber);
		const editorScrollTop = this._editor.getScrollTop();
		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const nodeHeight = this._hover.containerDomNode.clientHeight;
		const top = topForLineNumber - editorScrollTop - ((nodeHeight - lineHeight) / 2);
		const left = editorLayout.glyphMarginLeft + editorLayout.glyphMarginWidth + (laneOrLine === 'lineNo' ? editorLayout.lineNumbersWidth : 0);

		// Constrain the hover widget to stay within the editor bounds
		const editorHeight = editorLayout.height;
		const maxTop = editorHeight - nodeHeight;
		const constrainedTop = Math.max(0, Math.min(Math.round(top), maxTop));

		const fixedOverflowWidgets = this._editor.getOption(EditorOption.fixedOverflowWidgets);
		if (fixedOverflowWidgets) {
			// Use fixed positioning relative to the viewport
			const editorDomNode = this._editor.getDomNode();
			if (editorDomNode) {
				const editorRect = dom.getDomNodePagePosition(editorDomNode);
				this._hover.containerDomNode.style.position = 'fixed';
				this._hover.containerDomNode.style.left = `${editorRect.left + left}px`;
				this._hover.containerDomNode.style.top = `${editorRect.top + constrainedTop}px`;
			}
		} else {
			// Use absolute positioning relative to the editor
			this._hover.containerDomNode.style.position = 'absolute';
			this._hover.containerDomNode.style.left = `${left}px`;
			this._hover.containerDomNode.style.top = `${constrainedTop}px`;
		}
		this._hover.containerDomNode.style.zIndex = '11'; // 1 more than the zone widget at 10 (#233819)
	}

	private _onMouseLeave(e: MouseEvent): void {
		const editorDomNode = this._editor.getDomNode();
		const isMousePositionOutsideOfEditor = !editorDomNode || !isMousePositionWithinElement(editorDomNode, e.x, e.y);
		if (isMousePositionOutsideOfEditor) {
			this.hide();
		}
	}
}
