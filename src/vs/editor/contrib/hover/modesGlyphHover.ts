/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray } from 'vs/base/common/arrays';
import { IMarkdownString, isEmptyMarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { IModeService } from 'vs/editor/common/services/modeService';
import { HoverOperation, HoverStartMode, IHoverComputer } from 'vs/editor/contrib/hover/hoverOperation';
import { Widget } from 'vs/base/browser/ui/widget';
import { IOpenerService, NullOpenerService } from 'vs/platform/opener/common/opener';
import { HoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';

const $ = dom.$;

export interface IHoverMessage {
	value: IMarkdownString;
}

class MarginComputer implements IHoverComputer<IHoverMessage[]> {

	private readonly _editor: ICodeEditor;
	private _lineNumber: number;
	private _result: IHoverMessage[];

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._lineNumber = -1;
		this._result = [];
	}

	public setLineNumber(lineNumber: number): void {
		this._lineNumber = lineNumber;
		this._result = [];
	}

	public clearResult(): void {
		this._result = [];
	}

	public computeSync(): IHoverMessage[] {

		const toHoverMessage = (contents: IMarkdownString): IHoverMessage => {
			return {
				value: contents
			};
		};

		const lineDecorations = this._editor.getLineDecorations(this._lineNumber);

		const result: IHoverMessage[] = [];
		if (!lineDecorations) {
			return result;
		}

		for (const d of lineDecorations) {
			if (!d.options.glyphMarginClassName) {
				continue;
			}

			const hoverMessage = d.options.glyphMarginHoverMessage;
			if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			result.push(...asArray(hoverMessage).map(toHoverMessage));
		}

		return result;
	}

	public onResult(result: IHoverMessage[], isFromSynchronousComputation: boolean): void {
		this._result = this._result.concat(result);
	}

	public getResult(): IHoverMessage[] {
		return this._result;
	}

	public getResultWithLoadingMessage(): IHoverMessage[] {
		return this.getResult();
	}
}

export class ModesGlyphHoverWidget extends Widget implements IOverlayWidget {

	public static readonly ID = 'editor.contrib.modesGlyphHoverWidget';

	private readonly _editor: ICodeEditor;
	private readonly _hover: HoverWidget;

	private _isVisible: boolean;
	private _messages: IHoverMessage[];
	private _lastLineNumber: number;

	private readonly _markdownRenderer: MarkdownRenderer;
	private readonly _computer: MarginComputer;
	private readonly _hoverOperation: HoverOperation<IHoverMessage[]>;
	private readonly _renderDisposeables = this._register(new DisposableStore());

	constructor(
		editor: ICodeEditor,
		modeService: IModeService,
		openerService: IOpenerService = NullOpenerService,
	) {
		super();
		this._editor = editor;

		this._isVisible = false;
		this._messages = [];
		this._lastLineNumber = -1;

		this._hover = this._register(new HoverWidget());
		this._hover.containerDomNode.classList.toggle('hidden', !this._isVisible);

		this._markdownRenderer = this._register(new MarkdownRenderer({ editor: this._editor }, modeService, openerService));
		this._computer = new MarginComputer(this._editor);
		this._hoverOperation = new HoverOperation(
			this._computer,
			(result: IHoverMessage[]) => this._withResult(result),
			undefined,
			(result: any) => this._withResult(result),
			300
		);

		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._updateFont();
			}
		}));

		this._editor.addOverlayWidget(this);
	}

	public override dispose(): void {
		this._hoverOperation.cancel();
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return ModesGlyphHoverWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._hover.containerDomNode;
	}

	public getPosition(): IOverlayWidgetPosition | null {
		return null;
	}

	private _showAt(lineNumber: number): void {
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

		this._hover.containerDomNode.style.left = `${editorLayout.glyphMarginLeft + editorLayout.glyphMarginWidth}px`;
		this._hover.containerDomNode.style.top = `${Math.max(Math.round(top), 0)}px`;
	}

	private _updateFont(): void {
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName('code'));
		codeClasses.forEach(node => this._editor.applyFontInfo(node));
	}

	private _updateContents(node: Node): void {
		this._hover.contentsDomNode.textContent = '';
		this._hover.contentsDomNode.appendChild(node);
		this._updateFont();
	}

	public onModelDecorationsChanged(): void {
		if (this._isVisible) {
			// The decorations have changed and the hover is visible,
			// we need to recompute the displayed text
			this._hoverOperation.cancel();
			this._computer.clearResult();
			this._hoverOperation.start(HoverStartMode.Delayed);
		}
	}

	public startShowingAt(lineNumber: number): void {
		if (this._lastLineNumber === lineNumber) {
			// We have to show the widget at the exact same line number as before, so no work is needed
			return;
		}

		this._hoverOperation.cancel();

		this.hide();

		this._lastLineNumber = lineNumber;
		this._computer.setLineNumber(lineNumber);
		this._hoverOperation.start(HoverStartMode.Delayed);
	}

	public hide(): void {
		this._lastLineNumber = -1;
		this._hoverOperation.cancel();
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._hover.containerDomNode.classList.toggle('hidden', !this._isVisible);
	}

	private _withResult(result: IHoverMessage[]): void {
		this._messages = result;

		if (this._messages.length > 0) {
			this._renderMessages(this._lastLineNumber, this._messages);
		} else {
			this.hide();
		}
	}

	private _renderMessages(lineNumber: number, messages: IHoverMessage[]): void {
		this._renderDisposeables.clear();

		const fragment = document.createDocumentFragment();

		for (const msg of messages) {
			const markdownHoverElement = $('div.hover-row.markdown-hover');
			const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
			const renderedContents = this._renderDisposeables.add(this._markdownRenderer.render(msg.value));
			hoverContentsElement.appendChild(renderedContents.element);
			fragment.appendChild(markdownHoverElement);
		}

		this._updateContents(fragment);
		this._showAt(lineNumber);
	}
}
