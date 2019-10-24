/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose, DisposableStore } from 'vs/base/common/lifecycle';

const WIDGET_HEIGHT = 29;

export class TerminalWidgetManager implements IDisposable {
	private _container: HTMLElement | undefined;
	private _xtermViewport: HTMLElement | undefined;

	private _messageWidget: MessageWidget | undefined;
	private readonly _messageListeners = new DisposableStore();

	constructor(
		terminalWrapper: HTMLElement
	) {
		this._container = document.createElement('div');
		this._container.classList.add('terminal-widget-overlay');
		terminalWrapper.appendChild(this._container);

		this._initTerminalHeightWatcher(terminalWrapper);
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

	public showMessage(left: number, top: number, text: string): void {
		if (!this._container) {
			return;
		}
		dispose(this._messageWidget);
		this._messageListeners.clear();
		this._messageWidget = new MessageWidget(this._container, left, top, text);
	}

	public closeMessage(): void {
		this._messageListeners.clear();
		if (this._messageWidget) {
			this._messageListeners.add(MessageWidget.fadeOut(this._messageWidget));
		}
	}

	private _refreshHeight(): void {
		if (!this._container || !this._xtermViewport) {
			return;
		}
		this._container.style.height = this._xtermViewport.style.height;
	}
}

class MessageWidget {
	private _domNode: HTMLDivElement;

	public get left(): number { return this._left; }
	public get top(): number { return this._top; }
	public get text(): string { return this._text; }
	public get domNode(): HTMLElement { return this._domNode; }

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
		private _top: number,
		private _text: string
	) {
		this._domNode = document.createElement('div');
		this._domNode.style.position = 'absolute';
		this._domNode.style.left = `${_left}px`;
		this._domNode.style.bottom = `${_container.offsetHeight - Math.max(_top, WIDGET_HEIGHT)}px`;
		this._domNode.classList.add('terminal-message-widget', 'fadeIn');
		this._domNode.textContent = _text;
		this._container.appendChild(this._domNode);
	}

	public dispose(): void {
		if (this.domNode.parentElement === this._container) {
			this._container.removeChild(this.domNode);
		}
	}
}
