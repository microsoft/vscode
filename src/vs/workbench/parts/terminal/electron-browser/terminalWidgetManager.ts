/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { ITerminalInstance } from 'vs/workbench/parts/terminal/common/terminal';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';

export class TerminalWidgetManager {
	private _container: HTMLElement;
	private _xtermViewport: HTMLElement;

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

	public showMessage(left: number, bottom: number, text: string): void {
		// const font = this._configHelper.getFont();
		new TerminalMessage(this._container, left, bottom, text);
	}

	public refreshHeight(): void {
		console.log('refreshHeight', this._xtermViewport);
		console.log('refreshHeight', this._xtermViewport.style.height);
		this._container.style.height = this._xtermViewport.style.height;
	}
}

class TerminalMessage {
	// private _editor: ICodeEditor;
	// private _position: editorCommon.IPosition;
	private _domNode: HTMLDivElement;

	// static fadeOut(messageWidget: MessageWidget): IDisposable {
	// 	let handle: number;
	// 	const dispose = () => {
	// 		messageWidget.dispose();
	// 		clearTimeout(handle);
	// 		messageWidget.getDomNode().removeEventListener('animationend', dispose);
	// 	};
	// 	handle = setTimeout(dispose, 110);
	// 	messageWidget.getDomNode().addEventListener('animationend', dispose);
	// 	messageWidget.getDomNode().classList.add('fadeOut');
	// 	return { dispose };
	// }

	constructor(container: HTMLElement, left: number, top: number, text: string) {
		this._domNode = document.createElement('div');
		this._domNode.style.position = 'absolute';
		this._domNode.style.left = `${left}px`;
		this._domNode.style.bottom = `${container.offsetHeight - top}px`;
		this._domNode.classList.add('terminal-overlaymessage');

		const message = document.createElement('div');
		message.classList.add('message');
		message.textContent = text;
		this._domNode.appendChild(message);

		const anchor = document.createElement('div');
		anchor.classList.add('anchor');
		this._domNode.appendChild(anchor);

		// this._editor.addContentWidget(this);
		container.appendChild(this._domNode);
		this._domNode.classList.add('fadeIn');
	}

	dispose() {
		// this._editor.removeContentWidget(this);
	}
}
