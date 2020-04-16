/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Widget } from 'vs/base/browser/ui/widget';
import { IViewportRange } from 'xterm';
import { getDomNodePagePosition } from 'vs/base/browser/dom';

export enum WidgetVerticalAlignment {
	Bottom,
	Top
}

const WIDGET_HEIGHT = 29;

export class TerminalWidgetManager implements IDisposable {
	private _container: HTMLElement | undefined;
	private _xtermViewport: HTMLElement | undefined;

	private _hoverWidget: HoverWidget | undefined;
	private _hoverOverlayWidget: OverlayWidget | undefined;
	private readonly _hoverListeners = new DisposableStore();

	private _environmentVariableInfo: IEnvironmentVariableInfo | undefined;

	constructor() {
	}

	public attachToElement(terminalWrapper: HTMLElement) {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('terminal-widget-container');
			terminalWrapper.appendChild(this._container);
			this._initTerminalHeightWatcher(terminalWrapper);
		}
	}

	public dispose(): void {
		if (this._container && this._container.parentElement) {
			this._container.parentElement.removeChild(this._container);
			this._container = undefined;
		}
		this._xtermViewport = undefined;
		this._hoverListeners.dispose();
	}

	private _initTerminalHeightWatcher(terminalWrapper: HTMLElement) {
		// Watch the xterm.js viewport for style changes and do a layout if it changes
		this._xtermViewport = <HTMLElement>terminalWrapper.querySelector('.xterm-viewport');
		if (!this._xtermViewport) {
			return;
		}
		const mutationObserver = new MutationObserver(() => this._refreshHeight());
		mutationObserver.observe(this._xtermViewport, { attributes: true, attributeFilter: ['style'] });
	}

	public showEnvironmentVariableInfo(info: IEnvironmentVariableInfo): IDisposable {
		this._environmentVariableInfo = info;
		return {
			dispose: () => {
				if (this._environmentVariableInfo === info) {
					this._environmentVariableInfo = undefined;
				}
			}
		};
	}

	public showHover(
		location: IViewportRange,
		cellDimensions: { width: number, height: number },
		terminalDimensions: { width: number, height: number },
		text: IMarkdownString,
		linkHandler: (url: string) => void
	): void {
		if (!this._container || !this._xtermViewport || this._hoverWidget?.isMouseOver) {
			return;
		}
		dispose(this._hoverWidget);
		this._hoverListeners.clear();

		// TODO: Determine whether the tooltip should show on the bottom or top
		const left = location.start.x * cellDimensions.width;
		const top = location.start.y * cellDimensions.height;
		this._hoverWidget = new HoverWidget(this._xtermViewport, this._container, left, top, text, WidgetVerticalAlignment.Bottom, linkHandler);
		// TODO: Fill in target length
		this._hoverOverlayWidget = new OverlayWidget(this._container, left, top, 50, 20);
	}

	public closeHover(): void {
		console.log('closeHover');
		this._hoverListeners.clear();
		// const currentWidget = this._hoverWidget;
		this._hoverWidget?.dispose();
		this._hoverOverlayWidget?.dispose();
		// setTimeout(() => {
		// 	if (this._hoverWidget && !this._hoverWidget.mouseOver && this._hoverWidget === currentWidget) {
		// 		this._hoverListeners.add(HoverWidget.fadeOut(this._hoverWidget));
		// 	}
		// }, 50);
	}

	private _refreshHeight(): void {
		if (!this._container || !this._xtermViewport) {
			return;
		}
		this._container.style.height = this._xtermViewport.style.height;
	}
}

class HoverWidget extends Widget {
	private readonly _domNode: HTMLElement;
	private readonly _messageListeners = new DisposableStore();

	private _isMouseOver = false;

	public get left(): number { return this._left; }
	public get row(): number { return this._y; }
	public get text(): IMarkdownString { return this._text; }
	public get domNode(): HTMLElement { return this._domNode; }
	public get verticalAlignment(): WidgetVerticalAlignment { return this._verticalAlignment; }
	public get isMouseOver(): boolean { return this._isMouseOver; }

	// public static fadeOut(messageWidget: HoverWidget): IDisposable {
	// 	let handle: any;
	// 	const dispose = () => {
	// 		messageWidget.dispose();
	// 		clearTimeout(handle);
	// 		messageWidget.domNode.removeEventListener('animationend', dispose);
	// 	};
	// 	handle = setTimeout(dispose, 110);
	// 	messageWidget.domNode.addEventListener('animationend', dispose);
	// 	messageWidget.domNode.classList.add('fadeOut');
	// 	return { dispose };
	// }

	constructor(
		relativeElement: HTMLElement,
		private _container: HTMLElement,
		private _left: number,
		private _y: number,
		private _text: IMarkdownString,
		private _verticalAlignment: WidgetVerticalAlignment,
		private _linkHandler: (url: string) => void
	) {
		super();
		this._domNode = renderMarkdown(this._text, {
			actionHandler: {
				callback: this._linkHandler,
				disposeables: this._messageListeners
			}
		});
		this._domNode.style.position = 'fixed';
		const relativePosition = getDomNodePagePosition(relativeElement);
		this._domNode.style.left = `${relativePosition.left + this._left}px`;

		// if (this.verticalAlignment === WidgetVerticalAlignment.Top) {
		// 	// Y position is to the top of the widget
		// 	// this._domNode.style.bottom = `${Math.max(_y, WIDGET_HEIGHT) - WIDGET_HEIGHT}px`;
		// 	// this._domNode.style.top =
		// } else {
		// 	// Y position is to the bottom of the widget
		// 	// this._domNode.style.bottom = `${Math.min(_y, _container.offsetHeight - WIDGET_HEIGHT)}px`;
		// 	this._domNode.style.bottom = `${_y}px`;
		// }
		this._domNode.style.top = `${relativePosition.top + this._y - WIDGET_HEIGHT}px`;

		this._domNode.classList.add('terminal-message-widget', 'fadeIn');

		this.onmouseover(this._domNode, () => this._isMouseOver = true);
		this.onnonbubblingmouseout(this._domNode, () => {
			console.log('mouseout');
			this._isMouseOver = false;
			this.dispose();
			// this._messageListeners.add(HoverWidget.fadeOut(this));
		});

		this._container.appendChild(this._domNode);
	}

	public dispose(): void {
		console.log('dispose');
		if (this.domNode.parentElement === this._container) {
			this._container.removeChild(this.domNode);
		}

		this._messageListeners.dispose();
	}
}

class OverlayWidget extends Widget {
	private _domNode: HTMLElement;

	constructor(
		private readonly _container: HTMLElement,
		x: number,
		y: number,
		width: number,
		height: number
	) {
		super();
		this._domNode = document.createElement('div');
		this._domNode.classList.add('terminal-overlay-widget');
		this._domNode.style.left = `${x}px`;
		this._domNode.style.top = `${y}px`;
		this._domNode.style.width = `${width}px`;
		this._domNode.style.height = `${height}px`;
		this._container.appendChild(this._domNode);
	}

	get domNode() { return this._domNode; }
}
