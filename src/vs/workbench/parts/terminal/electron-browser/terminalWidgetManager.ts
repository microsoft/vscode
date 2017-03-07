/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { setDisposableTimeout } from 'vs/base/common/async';

export class TerminalWidgetManager {
	private _container: HTMLElement;
	private _xtermViewport: HTMLElement;

	private _messageWidget: MessageWidget;
	private _messageListeners: IDisposable[] = [];

	constructor(
		// private _instance: ITerminalInstance,
		private _configHelper: TerminalConfigHelper,
		terminalWrapper: HTMLElement
	) {
		this._container = document.createElement('div');
		this._container.classList.add('terminal-widget-overlay');
		this._initTerminalHeightWatcher(terminalWrapper);
		terminalWrapper.appendChild(this._container);
	}

	private _initTerminalHeightWatcher(terminalWrapper: HTMLElement) {
		// Watch the xterm.js viewport for style changes and do a layout if it changes
		this._xtermViewport = <HTMLElement>terminalWrapper.querySelector('.xterm-viewport');
		const mutationObserver = new MutationObserver(() => this.refreshHeight());
		mutationObserver.observe(this._xtermViewport, { attributes: true, attributeFilter: ['style'] });
	}

	public showMessage(left: number, top: number, text: string): void {
		dispose(this._messageWidget);
		this._messageListeners = dispose(this._messageListeners);

		this._messageWidget = new MessageWidget(this._container, left, top, text);

		// close after 3s
		this._messageListeners.push(setDisposableTimeout(() => this.closeMessage(), 3000));
	}

	closeMessage(): void {
		this._messageListeners = dispose(this._messageListeners);
		this._messageListeners.push(MessageWidget.fadeOut(this._messageWidget));
	}

	public refreshHeight(): void {
		console.log('refreshHeight', this._xtermViewport);
		console.log('refreshHeight', this._xtermViewport.style.height);
		this._container.style.height = this._xtermViewport.style.height;
	}
}

class MessageWidget {
	private _domNode: HTMLDivElement;

	public get left(): number { return this._left; }
	public get top(): number { return this._top; }
	public get text(): string { return this._text; }
	public get domNode(): HTMLElement { return this._domNode; }

	static fadeOut(messageWidget: MessageWidget): IDisposable {
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
		this._domNode.classList.add('terminal-message-widget');

		const message = document.createElement('div');
		message.classList.add('message');
		message.textContent = _text;
		this._domNode.appendChild(message);

		const anchor = document.createElement('div');
		anchor.classList.add('anchor');
		this._domNode.appendChild(anchor);

		// this._editor.addContentWidget(this);
		this._container.appendChild(this._domNode);
		this._domNode.classList.add('fadeIn');
	}

	dispose() {
		if (this.domNode.parentElement === this._container) {
			this._container.removeChild(this.domNode);
		}
	}
}
