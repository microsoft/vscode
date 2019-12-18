/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookHandler, ViewCell } from 'vs/workbench/contrib/notebook/browser/cellRenderer';
import { IWebviewService, WebviewElement } from 'vs/workbench/contrib/webview/browser/webview';
import * as DOM from 'vs/base/browser/dom';
import * as UUID from 'vs/base/common/uuid';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';

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
		if (event.data.type === 'html') {
			let id = event.data.id;
			let content = event.data.content;
			let newElement = document.createElement('div');
			newElement.style.position = 'absolute';
			newElement.style.top = event.data.top + 'px';
			newElement.id = id;
			document.getElementById('container').appendChild(newElement);
			newElement.innerHTML = content;
			var arr = newElement.getElementsByTagName('script')
			for (let n = 0; n < arr.length; n++) {
				eval(arr[n].innerHTML)//run script inside div
			}
			vscode.postMessage({
				type: 'dimension',
				id: id,
				data: {
					height: newElement.clientHeight
				}
			});
		} else if (event.data.type === 'scroll') {
			let id = event.data.id;
			let top = event.data.top;
			let element = document.getElementById(id);
			element.style.top = top;
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

		this.webview.onMessage(data => {
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

	public updateTop(id: string, top: number) {
		let item = this.mapping.get(id);
		if (item) {
			let real = `${item.offset + top}px`;
			this.webview.sendMessage({
				type: 'scroll',
				id: id,
				top: real
			});
		}
	}

	public createContentWidget(shadowElement: HTMLElement, cell: ViewCell, offset: number, shadowContent: string, initialTop: number) {
		this.webview.sendMessage({
			type: 'html',
			content: shadowContent,
			id: cell.id,
			top: initialTop
		});

		this.mapping.set(cell.id, { cell: cell, offset });
	}
}

export class WebviewContentWidget extends Disposable {
	public element: HTMLElement;
	public webview: WebviewElement;
	private _dimension: DOM.Dimension | null = null;
	private readonly _localStore = new DisposableStore();
	private _detachedFromViewEvents: boolean = false;

	get detachedFromViewEvents() {
		return this._detachedFromViewEvents;
	}

	set detachedFromViewEvents(newState: boolean) {
		this._detachedFromViewEvents = newState;
		this._localStore.clear();
	}


	constructor(public shadowElement: HTMLElement, public cell: ViewCell, public offset: number, public webviewService: IWebviewService, shadowContent: string, public notebookHandler: NotebookHandler) {
		super();

		this.element = document.createElement('div');
		this.element.style.width = 'calc(100% - 36px)';
		this.element.style.height = '700px';
		this.element.style.position = 'absolute';
		this.element.style.margin = '0px 24px 0px 24px';
		this.webview = this._createInset(webviewService, shadowContent);
		this.webview.mountTo(this.element);
		this._localStore.add(this.webview.onDidSetInitialDimension(dimension => {
			this._dimension = dimension;
			this.shadowElement.style.height = `${dimension.height}px`;
			this.shadowElement.style.maxWidth = '100%';
			this.shadowElement.style.maxHeight = '700px';
			this.element.style.height = `${dimension.height}px`;
			this.element.style.maxWidth = '100%';
			this.element.style.maxHeight = '700px';
			const lineNum = cell.lineCount;
			const totalHeight = Math.max(lineNum + 1, 5) * 21;
			cell.setDynamicHeight(totalHeight + 32 + dimension.height);
			notebookHandler.layoutElement(cell, totalHeight + 32 + dimension.height);
		}));

		this._localStore.add(this.webview.onDidWheel(e => {
			this.notebookHandler.triggerWheel(e);
		}));
	}

	updateInitialization(shadowElement: HTMLElement, cell: ViewCell, offset: number, shadowContent: string) {
		this._localStore.clear();
		this.shadowElement = shadowElement;
		this.cell = cell;
		this.offset = offset;

		this.element.style.height = '700px';
		this.element.style.width = 'calc(100% - 36px)';

		this.webview.html = shadowContent;

		this._localStore.add(this.webview.onDidSetInitialDimension(dimension => {
			this._dimension = dimension;
			this.shadowElement.style.height = `${dimension.height}px`;
			this.shadowElement.style.maxWidth = '100%';
			this.shadowElement.style.maxHeight = '700px';
			this.element.style.height = `${dimension.height}px`;
			this.element.style.maxWidth = '100%';
			this.element.style.maxHeight = '700px';
			const lineNum = cell.lineCount;
			const totalHeight = Math.max(lineNum + 1, 5) * 21;
			cell.setDynamicHeight(totalHeight + 32 + dimension.height);
			this.notebookHandler.layoutElement(cell, totalHeight + 32 + dimension.height);
		}));

		this._localStore.add(this.webview.onDidWheel(e => {
			this.notebookHandler.triggerWheel(e);
		}));
	}

	public updateShadowElement(element: HTMLElement) {
		this.shadowElement = element;
		if (this._dimension) {
			this.shadowElement.style.minWidth = `${this._dimension.width}px`;
			this.shadowElement.style.height = `${this._dimension.height}px`;
			this.shadowElement.style.maxWidth = '100%';
			this.shadowElement.style.maxHeight = '700px';
			const lineNum = this.cell.lineCount;
			const totalHeight = Math.max(lineNum + 1, 5) * 21;
			this.cell.setDynamicHeight(totalHeight + 32 + this._dimension.height);
			this.notebookHandler.layoutElement(this.cell, totalHeight + 32 + this._dimension.height);
		}
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
}
