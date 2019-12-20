/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookHandler, ViewCell } from 'vs/workbench/contrib/notebook/browser/cellRenderer';
import { IWebviewService, WebviewElement } from 'vs/workbench/contrib/webview/browser/webview';
import * as DOM from 'vs/base/browser/dom';
import * as UUID from 'vs/base/common/uuid';


export interface IDimentionMessage {
	type: 'dimension';
	id: string;
	data: DOM.Dimension;
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

export interface IScrollRequestMessage {
	type: 'scroll';
	id: string;
	top: number;
}

type IMessage = IDimentionMessage;

export class BackLayerWebView {
	public element: HTMLElement;
	public webview: WebviewElement;
	public mapping: Map<string, { cell: ViewCell, offset: number }> = new Map();

	constructor(public webviewService: IWebviewService, public notebookHandler: NotebookHandler) {
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
				<div id='container' style="overflow: hidden;"></div>
<script>
(function () {
	const vscode = acquireVsCodeApi();
	console.log('a');

	window.addEventListener('message', event => {
		let id = event.data.id;

		switch (event.data.type) {
			case 'html':
				{
					let content = event.data.content;
					let newElement = document.createElement('div');
					newElement.style.position = 'absolute';
					newElement.style.top = event.data.top + 'px';
					newElement.id = id;
					document.getElementById('container').appendChild(newElement);
					newElement.innerHTML = content;
					var arr = newElement.getElementsByTagName('script');
					for (let n = 0; n < arr.length; n++) {
						eval(arr[n].innerHTML); //run script inside div
					}
					vscode.postMessage({
						type: 'dimension',
						id: id,
						data: {
							height: newElement.clientHeight
						}
					});
				}
				break;
			case 'scroll':
				{
					let top = event.data.top;
					let element = document.getElementById(id);
					element.style.top = top + 'px';
				}
				break;
			case 'clear':
				document.getElementById('container').innerHTML = '';
				break;
		}
	});
}());

</script>
</body>
`;

		this.webview = this._createInset(webviewService, content);
		this.webview.mountTo(this.element);

		this.webview.onDidWheel(e => {
			this.notebookHandler.triggerWheel(e);
		});

		this.webview.onMessage((data: IMessage) => {
			if (data.type === 'dimension') {
				let cell = this.mapping.get(data.id)?.cell;
				let height = data.data.height;
				if (cell) {
					const lineNum = cell.lineCount;
					const totalHeight = Math.max(lineNum + 1, 5) * 21;
					cell.setDynamicHeight(totalHeight + 32 + height);
					this.notebookHandler.layoutElement(cell, totalHeight + 32 + height);
				}
			}
		});
	}

	private _createInset(webviewService: IWebviewService, content: string) {
		const webview = webviewService.createWebview('' + UUID.generateUuid(), {
			enableFindWidget: false,
		}, {
			allowScripts: true
		});
		webview.html = content;
		return webview;
	}

	public updateContentWidgetTop(id: string, top: number) {
		let item = this.mapping.get(id);
		if (item) {
			let message: IScrollRequestMessage = {
				type: 'scroll',
				id: id,
				top: item.offset + top
			};
			this.webview.sendMessage(message);
		}
	}

	public createContentWidget(cell: ViewCell, offset: number, shadowContent: string, initialTop: number) {
		let message: ICreationRequestMessage = {
			type: 'html',
			content: shadowContent,
			id: cell.id,
			top: initialTop
		};

		this.webview.sendMessage(message);
		this.mapping.set(cell.id, { cell: cell, offset });
	}

	public clearContentWidgets() {
		this.webview.sendMessage({
			type: 'clear'
		});
	}
}
