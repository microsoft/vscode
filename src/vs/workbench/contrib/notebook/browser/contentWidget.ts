/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookHandler, ViewCell } from 'vs/workbench/contrib/notebook/browser/cellRenderer';
import { IWebviewService, WebviewElement } from 'vs/workbench/contrib/webview/browser/webview';
import * as DOM from 'vs/base/browser/dom';
import * as UUID from 'vs/base/common/uuid';
import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';


export interface IDimentionMessage {
	type: 'dimension';
	id: string;
	data: DOM.Dimension;
}


export interface IScrollAckMessage {
	type: 'scroll-ack';
	data: { top: number };
	version: number;
}

export interface IClearMessage {
	type: 'clear';
}

export interface ICreationRequestMessage {
	type: 'html';
	content: string;
	id: string;
	top: number;
}

export interface IContentWidgetTopRequest {
	id: string;
	top: number;
}

export interface IViewScrollTopRequestMessage {
	type: 'view-scroll';
	top?: number;
	widgets: IContentWidgetTopRequest[];
	version: number;
}

export interface IScrollRequestMessage {
	type: 'scroll';
	id: string;
	top: number;
	widgetTop?: number;
	version: number;
}

type IMessage = IDimentionMessage | IScrollAckMessage;

let version = 0;
export class BackLayerWebView extends Disposable {
	public element: HTMLElement;
	public webview: WebviewElement;
	public mapping: Map<string, { cell: ViewCell, offset: number, top: number }> = new Map();
	public outputMapping: Map<string, boolean> = new Map();

	constructor(public webviewService: IWebviewService, public notebookService: INotebookService, public notebookHandler: NotebookHandler) {
		super();
		this.element = document.createElement('div');
		this.element.style.width = 'calc(100% - 36px)';
		this.element.style.height = '1400px';
		this.element.style.position = 'absolute';
		this.element.style.margin = '0px 0 0px 24px';

		let content = /* html */`
		<html lang="en">
			<head>
				<meta charset="UTF-8">
			</head>
			<body style="overflow: hidden;">
				<div id='container' class="widgetarea" style="position: absolute;width:100%;"></div>
<script>
(function () {
	// eslint-disable-next-line no-undef
	const vscode = acquireVsCodeApi();

	const preservedScriptAttributes = {
		type: true,
		src: true,
		nonce: true,
		noModule: true,
		async: true
	};

	// derived from https://github.com/jquery/jquery/blob/d0ce00cdfa680f1f0c38460bc51ea14079ae8b07/src/core/DOMEval.js
	const domEval = (container) => {
		var arr = Array.from(container.getElementsByTagName('script'));
		for (let n = 0; n < arr.length; n++) {
			let node = arr[n];
			let scriptTag = document.createElement('script');
			scriptTag.text = node.innerText;
			for (let key in preservedScriptAttributes ) {
				const val = node[key] || node.getAttribute && node.getAttribute(key);
				if (val) {
					scriptTag.setAttribute(key, val);
				}
			}

			// TODO: should script with src not be removed?
			container.appendChild(scriptTag).parentNode.removeChild(scriptTag);
		}
	};

	let observers = [];

	const resizeObserve = (container, id) => {
		const resizeObserver = new ResizeObserver(entries => {
			for (let entry of entries) {
				if (entry.target.id === id && entry.contentRect) {
					vscode.postMessage({
							type: 'dimension',
							id: id,
							data: {
								height: entry.contentRect.height
							}
						});
				}
			}
		});

		resizeObserver.observe(container);
		observers.push(resizeObserver);
	}

	window.addEventListener('message', event => {
		let id = event.data.id;

		switch (event.data.type) {
			case 'html':
				{
					let cellOutputContainer = document.getElementById(id);
					if (!cellOutputContainer) {
						let newElement = document.createElement('div');
						newElement.style.position = 'absolute';
						newElement.style.top = event.data.top + 'px';
						newElement.id = id;
						document.getElementById('container').appendChild(newElement);
						cellOutputContainer = newElement;
					}

					let outputNode = document.createElement('div');
					let content = event.data.content;
					outputNode.innerHTML = content;
					cellOutputContainer.appendChild(outputNode);

					// eval
					domEval(outputNode);
					resizeObserve(cellOutputContainer, id);

					vscode.postMessage({
						type: 'dimension',
						id: id,
						data: {
							height: cellOutputContainer.clientHeight
						}
					});
				}
				break;
			case 'view-scroll':
				{
					const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());

					document.getElementById('container').style.top = event.data.top + 'px';
					for (let i = 0; i < event.data.widgets.length; i++) {
						let widget = document.getElementById(event.data.widgets[i].id);
						widget.style.top = event.data.widgets[i].top + 'px';
					}

					vscode.postMessage({
						type: 'scroll-ack',
						data: {
							top: event.data.top,
						},
						version: event.data.version
					});
					break;
				}
			case 'clear':
				document.getElementById('container').innerHTML = '';
				for (let i = 0; i < observers.length; i++) {
					observers[i].disconnect;
				}

				observers = [];
				break;
		}
	});
}());

</script>
</body>
`;

		this.webview = this._createInset(webviewService, content);
		this.webview.mountTo(this.element);

		this._register(this.webview.onDidWheel(e => {
			this.notebookHandler.triggerWheel(e);
		}));

		this._register(this.webview.onMessage((data: IMessage) => {
			if (data.type === 'dimension') {
				let cell = this.mapping.get(data.id)?.cell;
				let height = data.data.height;
				let outputHeight = height === 0 ? 0 : height + 32;
				if (cell) {
					const lineNum = cell.lineCount;
					const totalHeight = Math.max(lineNum + 1, 5) * 21;
					cell.setDynamicHeight(totalHeight + 8 /* code cell padding */ + outputHeight);
					this.notebookHandler.layoutElement(cell, totalHeight + 8 /* code cell padding */ + outputHeight);
				}
			} else if (data.type === 'scroll-ack') {
				// const date = new Date();
				// const top = data.data.top;
				// console.log('ack top ', top, ' version: ', data.version, ' - ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
			}
		}));
	}

	private _createInset(webviewService: IWebviewService, content: string) {
		const webview = webviewService.createWebview('' + UUID.generateUuid(), {
			enableFindWidget: false,
		}, {
			allowScripts: true,
			localResourceRoots: this.notebookService.getNotebookProviderResourceRoots()
		});
		webview.html = content;
		return webview;
	}

	public shouldRenderContentWidget(id: string, widgetTop: number) {
		let item = this.mapping.get(id);

		if (item && widgetTop + item.offset !== item.top) {
			return widgetTop + item.offset;
		}

		return undefined;
	}

	public updateViewScrollTop(top: number, items: { top: number, id: string }[]) {
		items.forEach(item => {
			if (this.mapping.has(item.id)) {
				this.mapping.get(item.id)!.top = item.top;
			}
		});

		let message: IViewScrollTopRequestMessage = {
			top,
			type: 'view-scroll',
			version: version++,
			widgets: items
		};

		this.webview.sendMessage(message);
	}

	public createContentWidget(cell: ViewCell, offset: number, shadowContent: string, initialTop: number) {
		let message: ICreationRequestMessage = {
			type: 'html',
			content: shadowContent,
			id: cell.id,
			top: initialTop
		};

		this.webview.sendMessage(message);
		this.mapping.set(cell.id, { cell: cell, offset, top: initialTop });
	}

	public clearContentWidgets() {
		this.webview.sendMessage({
			type: 'clear'
		});
	}
}
