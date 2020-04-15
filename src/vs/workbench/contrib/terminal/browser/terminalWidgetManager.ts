/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IEnvironmentVariableInfo } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Widget } from 'vs/base/browser/ui/widget';

export enum WidgetVerticalAlignment {
	Bottom,
	Top
}

const WIDGET_HEIGHT = 29;

export class TerminalWidgetManager implements IDisposable {
	private _container: HTMLElement | undefined;
	private _xtermViewport: HTMLElement | undefined;

	private _messageWidget: MessageWidget | undefined;
	private readonly _messageListeners = new DisposableStore();

	private _environmentVariableInfo: IEnvironmentVariableInfo | undefined;

	constructor() {
	}

	public attachToElement(terminalWrapper: HTMLElement) {
		if (!this._container) {
			this._container = document.createElement('div');
			this._container.classList.add('terminal-widget-overlay');
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
		this._messageListeners.dispose();
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
		left: number,
		row: number,
		text: IMarkdownString,
		verticalAlignment: WidgetVerticalAlignment = WidgetVerticalAlignment.Bottom,
		linkHandler: (url: string) => void
	): void {
		if (!this._container || this._messageWidget?.mouseOver) {
			return;
		}
		dispose(this._messageWidget);
		this._messageListeners.clear();
		this._messageWidget = new MessageWidget(this._container, left, row, text, verticalAlignment, linkHandler);
	}

	public closeHover(): void {
		this._messageListeners.clear();
		const currentWidget = this._messageWidget;
		setTimeout(() => {
			if (this._messageWidget && !this._messageWidget.mouseOver && this._messageWidget === currentWidget) {
				this._messageListeners.add(MessageWidget.fadeOut(this._messageWidget));
			}
		}, 50);
	}

	private _refreshHeight(): void {
		if (!this._container || !this._xtermViewport) {
			return;
		}
		this._container.style.height = this._xtermViewport.style.height;
	}
}

class MessageWidget extends Widget {
	private _domNode: HTMLElement;
	private _mouseOver = false;
	private readonly _messageListeners = new DisposableStore();

	public get left(): number { return this._left; }
	public get y(): number { return this._y; }
	public get text(): IMarkdownString { return this._text; }
	public get domNode(): HTMLElement { return this._domNode; }
	public get verticalAlignment(): WidgetVerticalAlignment { return this._verticalAlignment; }
	public get mouseOver(): boolean { return this._mouseOver; }

	public static fadeOut(messageWidget: MessageWidget): IDisposable {
		let handle: any;
		const dispose = () => {
			messageWidget.dispose();
			clearTimeout(handle);
			messageWidget.domNode.removeEventListener('animationend', dispose);
		};
		handle = setTimeout(dispose, 110);
		messageWidget.domNode.addEventListener('animationend', dispose);
		messageWidget.domNode.classList.add('fadeOut');
		return { dispose };
	}

	constructor(
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
		this._domNode.style.position = 'absolute';
		this._domNode.style.left = `${_left}px`;

		if (this.verticalAlignment === WidgetVerticalAlignment.Top) {
			// Y position is to the top of the widget
			this._domNode.style.bottom = `${Math.max(_y, WIDGET_HEIGHT) - WIDGET_HEIGHT}px`;
		} else {
			// Y position is to the bottom of the widget
			this._domNode.style.bottom = `${Math.min(_y, _container.offsetHeight - WIDGET_HEIGHT)}px`;
		}

		this._domNode.classList.add('terminal-message-widget', 'fadeIn');

		this.onmouseover(this._domNode, () => this._mouseOver = true);
		this.onnonbubblingmouseout(this._domNode, () => {
			this._mouseOver = false;
			this._messageListeners.add(MessageWidget.fadeOut(this));
		});

		this._container.appendChild(this._domNode);
	}

	public dispose(): void {
		if (this.domNode.parentElement === this._container) {
			this._container.removeChild(this.domNode);
		}

		this._messageListeners.dispose();
	}
}
