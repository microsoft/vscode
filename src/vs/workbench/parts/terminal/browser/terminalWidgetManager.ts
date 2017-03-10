/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalConfigHelper } from 'vs/workbench/parts/terminal/common/terminal';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class TerminalWidgetManager {
	private _container: HTMLElement;
	private _xtermViewport: HTMLElement;

	private _messageWidget: MessageWidget;
	private _messageListeners: IDisposable[] = [];

	constructor(
		private _configHelper: ITerminalConfigHelper,
		terminalWrapper: HTMLElement
	) {
		this._container = document.createElement('div');
		this._container.classList.add('terminal-widget-overlay');
		terminalWrapper.appendChild(this._container);

		this._initTerminalHeightWatcher(terminalWrapper);
	}

	private _initTerminalHeightWatcher(terminalWrapper: HTMLElement) {
		// Watch the xterm.js viewport for style changes and do a layout if it changes
		this._xtermViewport = <HTMLElement>terminalWrapper.querySelector('.xterm-viewport');
		const mutationObserver = new MutationObserver(() => this._refreshHeight());
		mutationObserver.observe(this._xtermViewport, { attributes: true, attributeFilter: ['style'] });
	}

	public showMessage(left: number, top: number, text: string): void {
		dispose(this._messageWidget);
		this._messageListeners = dispose(this._messageListeners);
		this._messageWidget = new MessageWidget(this._container, left, top, text);
	}

	public closeMessage(): void {
		this._messageListeners = dispose(this._messageListeners);
		if (this._messageWidget) {
			this._messageListeners.push(MessageWidget.fadeOut(this._messageWidget));
		}
	}

	private _refreshHeight(): void {
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
		let handle: number;
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
		this._domNode.style.bottom = `${_container.offsetHeight - _top}px`;
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
