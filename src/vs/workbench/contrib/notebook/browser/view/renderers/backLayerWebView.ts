/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import * as path from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookService } from 'vs/workbench/contrib/notebook/browser/notebookService';
import { IOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IWebviewService, WebviewElement } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewResourceScheme } from 'vs/workbench/contrib/webview/common/resourceLoader';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookCellViewModel';
import { CELL_MARGIN } from 'vs/workbench/contrib/notebook/browser/constants';

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
	outputId: string;
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
	insetMapping: Map<IOutput, { outputId: string, cell: CellViewModel, cacheOffset: number | undefined }> = new Map();
	reversedInsetMapping: Map<string, IOutput> = new Map();
	preloadsCache: Map<string, boolean> = new Map();
	localResourceRootsCache: URI[] | undefined = undefined;
	rendererRootsCache: URI[] = [];

	constructor(public webviewService: IWebviewService, public notebookService: INotebookService, public notebookEditor: INotebookEditor, public environmentSerice: IEnvironmentService) {
		super();
		this.element = document.createElement('div');

		this.element.style.width = `calc(100% - ${CELL_MARGIN * 2}px)`;
		this.element.style.height = '1400px';
		this.element.style.position = 'absolute';
		this.element.style.margin = `0px 0 0px ${CELL_MARGIN}px`;

		const loader = URI.file(path.join(environmentSerice.appRoot, '/out/vs/loader.js')).with({ scheme: WebviewResourceScheme });

		let content = /* html */`
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<style>
					#container > div > div {
						width: 100%;
						padding: 0 8px;
						margin: 8px 0;
						background-color: var(--vscode-list-inactiveSelectionBackground);
					}
					body {
						padding: 0px;
						height: 100%;
						width: 100%;
					}
				</style>
			</head>
			<body style="overflow: hidden;">
				<script>
					self.require = {};
				</script>
				<script src="${loader}"></script>
				<div id="__vscode_preloads"></div>
				<div id='container' class="widgetarea" style="position: absolute;width:100%;top: 0px"></div>
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
					let outputId = event.data.outputId;
					if (!cellOutputContainer) {
						let newElement = document.createElement('div');

						newElement.id = id;
						document.getElementById('container').appendChild(newElement);
						cellOutputContainer = newElement;
					}

					let outputNode = document.createElement('div');
					outputNode.style.position = 'absolute';
					outputNode.style.top = event.data.top + 'px';

					outputNode.id = outputId;
					let content = event.data.content;
					outputNode.innerHTML = content;
					cellOutputContainer.appendChild(outputNode);

					// eval
					domEval(outputNode);
					resizeObserve(outputNode, outputId);

					vscode.postMessage({
						type: 'dimension',
						id: outputId,
						data: {
							height: outputNode.clientHeight
						}
					});
				}
				break;
			case 'view-scroll':
				{
					// const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());

					for (let i = 0; i < event.data.widgets.length; i++) {
						let widget = document.getElementById(event.data.widgets[i].id);
						widget.style.top = event.data.widgets[i].top + 'px';
					}
					break;
				}
			case 'clear':
				document.getElementById('container').innerHTML = '';
				for (let i = 0; i < observers.length; i++) {
					observers[i].disconnect();
				}

				observers = [];
				break;
			case 'clearOutput':
				let output = document.getElementById(id);
				output.parentNode.removeChild(output);
				// @TODO remove observer
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
			this.notebookEditor.triggerScroll(e);
		}));

		this._register(this.webview.onMessage((data: IMessage) => {
			if (data.type === 'dimension') {
				let output = this.reversedInsetMapping.get(data.id);

				if (!output) {
					return;
				}

				let cell = this.insetMapping.get(output)!.cell;
				let height = data.data.height;
				let outputHeight = height === 0 ? 0 : height + 16;

				if (cell) {
					let outputIndex = cell.outputs.indexOf(output);
					cell.updateOutputHeight(outputIndex, outputHeight);
					this.notebookEditor.layoutNotebookCell(cell, cell.getCellTotalHeight());
				}
			} else if (data.type === 'scroll-ack') {
				// const date = new Date();
				// const top = data.data.top;
				// console.log('ack top ', top, ' version: ', data.version, ' - ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
			}
		}));
	}

	private _createInset(webviewService: IWebviewService, content: string) {
		this.localResourceRootsCache = [...this.notebookService.getNotebookProviderResourceRoots(), URI.file(this.environmentSerice.appRoot)];
		const webview = webviewService.createWebviewElement('' + UUID.generateUuid(), {
			enableFindWidget: false,
		}, {
			allowScripts: true,
			localResourceRoots: this.localResourceRootsCache
		});
		webview.html = content;
		return webview;
	}

	shouldUpdateInset(cell: CellViewModel, output: IOutput, cellTop: number) {
		let outputCache = this.insetMapping.get(output)!;
		let outputIndex = cell.outputs.indexOf(output);

		let outputOffsetInOutputContainer = cell.getOutputOffset(outputIndex);
		let outputOffset = cellTop + cell.editorHeight + 16 /* editor padding */ + 8 + outputOffsetInOutputContainer;

		if (outputOffset === outputCache.cacheOffset) {
			return false;
		}

		return true;
	}

	updateViewScrollTop(top: number, items: { cell: CellViewModel, output: IOutput, cellTop: number }[]) {
		let widgets: IContentWidgetTopRequest[] = items.map(item => {
			let outputCache = this.insetMapping.get(item.output)!;
			let id = outputCache.outputId;
			let outputIndex = item.cell.outputs.indexOf(item.output);

			let outputOffsetInOutputContainer = item.cell.getOutputOffset(outputIndex);
			let outputOffset = item.cellTop + item.cell.editorHeight + 16 /* editor padding */ + 16 + outputOffsetInOutputContainer;
			outputCache.cacheOffset = outputOffset;

			return {
				id: id,
				top: outputOffset
			};
		});

		let message: IViewScrollTopRequestMessage = {
			top,
			type: 'view-scroll',
			version: version++,
			widgets: widgets
		};

		this.webview.sendMessage(message);
	}

	createInset(cell: CellViewModel, output: IOutput, cellTop: number, offset: number, shadowContent: string, preloads: Set<number>) {
		this.updateRendererPreloads(preloads);
		let initialTop = cellTop + offset;
		let outputId = UUID.generateUuid();

		let message: ICreationRequestMessage = {
			type: 'html',
			content: shadowContent,
			id: cell.id,
			outputId: outputId,
			top: initialTop
		};

		this.webview.sendMessage(message);
		this.insetMapping.set(output, { outputId: outputId, cell: cell, cacheOffset: initialTop });
		this.reversedInsetMapping.set(outputId, output);
	}

	removeInset(output: IOutput) {
		let outputCache = this.insetMapping.get(output);
		if (!outputCache) {
			return;
		}

		let id = outputCache.outputId;

		this.webview.sendMessage({
			type: 'clearOutput',
			id: id
		});
		this.insetMapping.delete(output);
		this.reversedInsetMapping.delete(id);
	}

	clearInsets() {
		this.webview.sendMessage({
			type: 'clear'
		});

		this.insetMapping = new Map();
		this.reversedInsetMapping = new Map();
	}

	updateRendererPreloads(preloads: Set<number>) {
		let resources: string[] = [];
		let extensionLocations: URI[] = [];
		preloads.forEach(preload => {
			let rendererInfo = this.notebookService.getRendererInfo(preload);

			if (rendererInfo) {
				let preloadResources = rendererInfo.preloads.map(preloadResource => preloadResource.with({ scheme: WebviewResourceScheme }));
				extensionLocations.push(rendererInfo.extensionLocation);
				preloadResources.forEach(e => {
					if (!this.preloadsCache.has(e.toString())) {
						resources.push(e.toString());
						this.preloadsCache.set(e.toString(), true);
					}
				});
			}
		});

		this.rendererRootsCache = extensionLocations;
		const mixedResourceRoots = [...(this.localResourceRootsCache || []), ...this.rendererRootsCache];

		this.webview.contentOptions = {
			allowScripts: true,
			enableCommandUris: true,
			localResourceRoots: mixedResourceRoots
		};

		let message: IUpdatePreloadResourceMessage = {
			type: 'preload',
			resources: resources
		};

		this.webview.sendMessage(message);
	}

	clearPreloadsCache() {
		this.preloadsCache.clear();
	}
}
