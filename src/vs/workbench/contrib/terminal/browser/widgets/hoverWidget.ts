/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { Widget } from 'vs/base/browser/ui/widget';
import { Event, Emitter } from 'vs/base/common/event';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorHoverHighlight, editorHoverBackground, editorHoverBorder, textLinkForeground, editorHoverForeground, editorHoverStatusBarBackground, textCodeBlockBackground } from 'vs/platform/theme/common/colorRegistry';
import { $ } from 'vs/base/browser/dom';

export enum HorizontalAlignment {
	Left,
	Right
}

export enum VerticalAlignment {
	Top,
	Bottom
}

export interface IProposedAnchor {
	x: number;
	y: number;
	horizontalAlignment: HorizontalAlignment;
	verticalAlignment: VerticalAlignment;
}

/**
 * A target for a hover which can know about domain-specific locations.
 */
export interface IHoverTarget extends IDisposable {
	readonly targetElements: readonly HTMLElement[];
	proposeIdealAnchor(): IProposedAnchor;
	proposeSecondaryAnchor(): IProposedAnchor;
}

export class HoverWidget extends Widget {
	private readonly _domNode: HTMLElement;
	private readonly _messageListeners = new DisposableStore();
	private readonly _mouseTracker: CompositeMouseTracker;

	private _isDisposed: boolean = false;

	get isDisposed(): boolean { return this._isDisposed; }
	get domNode(): HTMLElement { return this._domNode; }

	private readonly _onDispose = new Emitter<void>();
	get onDispose(): Event<void> { return this._onDispose.event; }

	constructor(
		private _container: HTMLElement,
		private _target: IHoverTarget,
		private _text: IMarkdownString,
		private _linkHandler: (url: string) => void
	) {
		super();
		this._domNode = document.createElement('div');
		this._domNode.style.position = 'fixed';
		this._domNode.classList.add('terminal-message-widget', 'fadeIn', 'monaco-editor-hover');

		const rowElement = $('div.hover-row.markdown-hover');
		const contentsElement = $('div.hover-contents');
		const markdownElement = renderMarkdown(this._text, {
			actionHandler: {
				callback: this._linkHandler,
				disposeables: this._messageListeners
			}
		});
		contentsElement.appendChild(markdownElement);
		rowElement.appendChild(contentsElement);
		this._domNode.appendChild(rowElement);

		const statusBarElement = document.createElement('div');
		statusBarElement.classList.add('hover-row', 'status-bar');
		const actionsElements = $('div.actions');
		const actionsContainer = $('div.action-container');
		const action = $('a.action');
		action.textContent = 'Action example';
		actionsContainer.appendChild(action);
		actionsElements.appendChild(actionsContainer);
		statusBarElement.appendChild(actionsElements);
		this._domNode.appendChild(statusBarElement);

		this._mouseTracker = new CompositeMouseTracker([this._domNode, ..._target.targetElements]);
		this._register(this._mouseTracker.onMouseOut(() => this.dispose()));
		this._register(this._mouseTracker);

		this._container.appendChild(this._domNode);

		this.layout();
	}

	public layout(): void {
		const anchor = this._target.proposeIdealAnchor();
		console.log('anchor', anchor);
		this._domNode.style.maxWidth = `${document.documentElement.clientWidth - anchor.x - 1}px`;
		if (anchor.horizontalAlignment === HorizontalAlignment.Left) {
			this._domNode.style.left = `${anchor.x}px`;
		} else {
			this._domNode.style.right = `${anchor.x}px`;
		}
		// TODO: Go to secondary anchor if vertical gets clipped
		if (anchor.verticalAlignment === VerticalAlignment.Bottom) {
			this._domNode.style.bottom = `${anchor.y}px`;
		} else {
			this._domNode.style.top = `${anchor.y}px`;
		}
	}

	public dispose(): void {
		if (!this._isDisposed) {
			this._onDispose.fire();
			// this._domNode.parentElement?.removeChild(this.domNode);
			this._messageListeners.dispose();
			this._target.dispose();
			super.dispose();
		}
		this._isDisposed = true;
	}
}

class CompositeMouseTracker extends Widget {
	private _isMouseIn: boolean = false;
	private _mouseTimeout: number | undefined;

	private readonly _onMouseOut = new Emitter<void>();
	get onMouseOut(): Event<void> { return this._onMouseOut.event; }

	constructor(
		private _elements: HTMLElement[]
	) {
		super();
		this._elements.forEach(n => this.onmouseover(n, () => this._onTargetMouseOver()));
		this._elements.forEach(n => this.onnonbubblingmouseout(n, () => this._onTargetMouseOut()));
	}

	private _onTargetMouseOver(): void {
		this._isMouseIn = true;
		this._clearEvaluateMouseStateTimeout();
	}

	private _onTargetMouseOut(): void {
		this._isMouseIn = false;
		this._evaluateMouseState();
	}

	private _evaluateMouseState(): void {
		this._clearEvaluateMouseStateTimeout();
		// Evaluate whether the mouse is still outside asynchronously such that other mouse targets
		// have the opportunity to first their mouse in event.
		this._mouseTimeout = window.setTimeout(() => this._fireIfMouseOutside(), 0);
	}

	private _clearEvaluateMouseStateTimeout(): void {
		if (this._mouseTimeout) {
			clearTimeout(this._mouseTimeout);
			this._mouseTimeout = undefined;
		}
	}

	private _fireIfMouseOutside(): void {
		if (!this._isMouseIn) {
			this._onMouseOut.fire();
		}
	}
}


registerThemingParticipant((theme, collector) => {
	const editorHoverHighlightColor = theme.getColor(editorHoverHighlight);
	if (editorHoverHighlightColor) {
		collector.addRule(`.integrated-terminal .hoverHighlight { background-color: ${editorHoverHighlightColor}; }`);
	}
	const hoverBackground = theme.getColor(editorHoverBackground);
	if (hoverBackground) {
		collector.addRule(`.integrated-terminal .monaco-editor-hover { background-color: ${hoverBackground}; }`);
	}
	const hoverBorder = theme.getColor(editorHoverBorder);
	if (hoverBorder) {
		collector.addRule(`.integrated-terminal .monaco-editor-hover { border: 1px solid ${hoverBorder}; }`);
		collector.addRule(`.integrated-terminal .monaco-editor-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.integrated-terminal .monaco-editor-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
		collector.addRule(`.integrated-terminal .monaco-editor-hover hr { border-bottom: 0px solid ${hoverBorder.transparent(0.5)}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.integrated-terminal .monaco-editor-hover a { color: ${link}; }`);
	}
	const hoverForeground = theme.getColor(editorHoverForeground);
	if (hoverForeground) {
		collector.addRule(`.integrated-terminal .monaco-editor-hover { color: ${hoverForeground}; }`);
	}
	const actionsBackground = theme.getColor(editorHoverStatusBarBackground);
	if (actionsBackground) {
		collector.addRule(`.integrated-terminal .monaco-editor-hover .hover-row .actions { background-color: ${actionsBackground}; }`);
	}
	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.integrated-terminal .monaco-editor-hover code { background-color: ${codeBackground}; }`);
	}
});
