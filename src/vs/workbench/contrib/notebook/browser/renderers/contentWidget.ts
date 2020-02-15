/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/renderers/cellViewModel';
import { IWebviewService, WebviewElement } from 'vs/workbench/contrib/webview/browser/webview';
import * as DOM from 'vs/base/browser/dom';
import * as UUID from 'vs/base/common/uuid';
import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { WebviewResourceScheme } from 'vs/workbench/contrib/webview/common/resourceLoader';
import * as path from 'vs/base/common/path';
import { CELL_MARGIN } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

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

export interface IUpdatePreloadResourceMessage {
	type: 'preload';
	resources: string[];
}

type IMessage = IDimentionMessage | IScrollAckMessage;

let version = 0;
export class BackLayerWebView extends Disposable {
	element: HTMLElement;
	webview: WebviewElement;
	mapping: Map<string, { cell: CellViewModel, offset: number, top: number }> = new Map();
	outputMapping: Map<string, boolean> = new Map();
	preloadsCache: Map<string, boolean> = new Map();

	constructor(public webviewService: IWebviewService, public notebookService: INotebookService, public notebookHandler: INotebookEditor, public environmentSerice: IEnvironmentService) {
		super();
		this.element = document.createElement('div');

		this.element.style.width = `calc(100% - ${CELL_MARGIN * 2}px)`;
		this.element.style.height = '1400px';
		this.element.style.position = 'absolute';
		this.element.style.margin = '0px 0 0px 24px';

		const loader = URI.file(path.join(environmentSerice.appRoot, '/out/vs/loader.js')).with({ scheme: WebviewResourceScheme });

		let content = /* html */`
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<style>
					#container > div {
						width: 100%;
						padding: 0 8px;
						margin: 8px 0;
						background-color: var(--vscode-list-inactiveSelectionBackground);
					}
				</style>
			</head>
			<body style="overflow: hidden;">
				<script>
					self.require = {};
				</script>
				<script src="${loader}"></script>
				<div id="__vscode_preloads"></div>
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
					observers[i].disconnect();
				}

				observers = [];
				break;
			case 'preload':
				let resources = event.data.resources;
				let preloadsContainer = document.getElementById('__vscode_preloads');
				for (let i = 0; i < resources.length; i++) {
					let scriptTag = document.createElement('script');
					scriptTag.setAttribute('src', resources[i]);
					preloadsContainer.appendChild(scriptTag)
				}
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
			this.notebookHandler.triggerScroll(e);
		}));

		this._register(this.webview.onMessage((data: IMessage) => {
			if (data.type === 'dimension') {
				let cell = this.mapping.get(data.id)?.cell;
				let height = data.data.height;
				let outputHeight = height === 0 ? 0 : height + 16;
				if (cell) {
					const lineNum = cell.lineCount;
					const lineHeight = this.notebookHandler.getFontInfo()?.lineHeight ?? 18;
					const totalHeight = lineNum * lineHeight;
					cell.dynamicHeight = totalHeight + 32 /* code cell padding */ + outputHeight;
					this.notebookHandler.layoutNotebookCell(cell, totalHeight + 32 /* code cell padding */ + outputHeight);
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
			localResourceRoots: [...this.notebookService.getNotebookProviderResourceRoots(), URI.file(this.environmentSerice.appRoot)]
		});
		webview.html = content;
		return webview;
	}

	shouldRenderContentWidget(id: string, widgetTop: number) {
		let item = this.mapping.get(id);

		if (item && widgetTop + item.offset !== item.top) {
			return widgetTop + item.offset;
		}

		return undefined;
	}

	updateViewScrollTop(top: number, items: { top: number, id: string }[]) {
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

	createContentWidget(cell: CellViewModel, offset: number, shadowContent: string, initialTop: number, preloads: Set<number>) {
		this.updateRendererPreloads(preloads);

		let message: ICreationRequestMessage = {
			type: 'html',
			content: shadowContent,
			id: cell.id,
			top: initialTop
		};

		this.webview.sendMessage(message);
		this.mapping.set(cell.id, { cell: cell, offset, top: initialTop });
	}

	clearContentWidgets() {
		this.webview.sendMessage({
			type: 'clear'
		});

		this.mapping = new Map();
		this.outputMapping = new Map();
	}

	updateRendererPreloads(preloads: Set<number>) {
		let resources: string[] = [];
		preloads.forEach(preload => {
			let preloadResources = this.notebookService.getRendererPreloads(preload).map(preloadResource => preloadResource.with({ scheme: WebviewResourceScheme }));
			preloadResources.forEach(e => {
				if (!this.preloadsCache.has(e.toString())) {
					resources.push(e.toString());
					this.preloadsCache.set(e.toString(), true);
				}
			});
		});

		let message: IUpdatePreloadResourceMessage = {
			type: 'preload',
			resources: resources
		};

		this.webview.sendMessage(message);

		// @TODO, update allowed resources folder
	}

	clearPreloadsCache() {
		this.preloadsCache.clear();
	}
}
