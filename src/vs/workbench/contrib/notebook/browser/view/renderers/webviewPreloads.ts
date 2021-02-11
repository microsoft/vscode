/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from 'vs/base/common/event';
import type { IDisposable } from 'vs/base/common/lifecycle';
import { ICellDragEndMessage, ICellDragMessage, ICellDragStartMessage, ToWebviewMessage } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';
import { RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

// !! IMPORTANT !! everything must be in-line within the webviewPreloads
// function. Imports are not allowed. This is stringifies and injected into
// the webview.

declare module globalThis {
	const acquireVsCodeApi: () => ({
		getState(): { [key: string]: unknown; };
		setState(data: { [key: string]: unknown; }): void;
		postMessage: (msg: unknown) => void;
	});
}

declare class ResizeObserver {
	constructor(onChange: (entries: { target: HTMLElement, contentRect?: ClientRect; }[]) => void);
	observe(element: Element): void;
	disconnect(): void;
}

declare const __outputNodePadding__: number;
declare const __outputNodeLeftPadding__: number;

type Listener<T> = { fn: (evt: T) => void; thisArg: unknown; };

interface EmitterLike<T> {
	fire(data: T): void;
	event: Event<T>;
}

function webviewPreloads() {
	const acquireVsCodeApi = globalThis.acquireVsCodeApi;
	const vscode = acquireVsCodeApi();
	delete (globalThis as any).acquireVsCodeApi;

	const handleInnerClick = (event: MouseEvent) => {
		if (!event || !event.view || !event.view.document) {
			return;
		}

		for (let node = event.target as HTMLElement | null; node; node = node.parentNode as HTMLElement) {
			if (node instanceof HTMLAnchorElement && node.href) {
				if (node.href.startsWith('blob:')) {
					handleBlobUrlClick(node.href, node.download);
				} else if (node.href.startsWith('data:')) {
					handleDataUrl(node.href, node.download);
				}
				event.preventDefault();
				break;
			}
		}
	};

	const handleDataUrl = async (data: string | ArrayBuffer | null, downloadName: string) => {
		vscode.postMessage({
			__vscode_notebook_message: true,
			type: 'clicked-data-url',
			data,
			downloadName
		});
	};

	const handleBlobUrlClick = async (url: string, downloadName: string) => {
		try {
			const response = await fetch(url);
			const blob = await response.blob();
			const reader = new FileReader();
			reader.addEventListener('load', () => {
				handleDataUrl(reader.result, downloadName);
			});
			reader.readAsDataURL(blob);
		} catch (e) {
			console.error(e.message);
		}
	};

	document.body.addEventListener('click', handleInnerClick);

	const preservedScriptAttributes: (keyof HTMLScriptElement)[] = [
		'type', 'src', 'nonce', 'noModule', 'async',
	];

	// derived from https://github.com/jquery/jquery/blob/d0ce00cdfa680f1f0c38460bc51ea14079ae8b07/src/core/DOMEval.js
	const domEval = (container: Element) => {
		const arr = Array.from(container.getElementsByTagName('script'));
		for (let n = 0; n < arr.length; n++) {
			const node = arr[n];
			const scriptTag = document.createElement('script');
			const trustedScript = ttPolicy?.createScript(node.innerText) ?? node.innerText;
			scriptTag.text = trustedScript as string;
			for (const key of preservedScriptAttributes) {
				const val = node[key] || node.getAttribute && node.getAttribute(key);
				if (val) {
					scriptTag.setAttribute(key, val as any);
				}
			}

			// TODO@connor4312: should script with src not be removed?
			container.appendChild(scriptTag).parentNode!.removeChild(scriptTag);
		}
	};

	const runScript = async (url: string, originalUri: string, globals: { [name: string]: unknown } = {}): Promise<() => (PreloadResult)> => {
		let text: string;
		try {
			const res = await fetch(url);
			text = await res.text();
			if (!res.ok) {
				throw new Error(`Unexpected ${res.status} requesting ${originalUri}: ${text || res.statusText}`);
			}

			globals.scriptUrl = url;
		} catch (e) {
			return () => ({ state: PreloadState.Error, error: e.message });
		}

		const args = Object.entries(globals);
		return () => {
			try {
				new Function(...args.map(([k]) => k), text)(...args.map(([, v]) => v));
				return { state: PreloadState.Ok };
			} catch (e) {
				console.error(e);
				return { state: PreloadState.Error, error: e.message };
			}
		};
	};

	const outputObservers = new Map<string, ResizeObserver>();

	const resizeObserve = (container: Element, id: string, output: boolean) => {
		const resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				if (!document.body.contains(entry.target)) {
					return;
				}

				if (entry.target.id === id && entry.contentRect) {
					if (entry.contentRect.height !== 0) {
						entry.target.style.padding = `${__outputNodePadding__}px ${__outputNodePadding__}px ${__outputNodePadding__}px ${__outputNodeLeftPadding__}px`;
						vscode.postMessage({
							__vscode_notebook_message: true,
							type: 'dimension',
							id: id,
							data: {
								height: entry.contentRect.height + __outputNodePadding__ * 2
							},
							isOutput: output
						});
					} else {
						entry.target.style.padding = `0px`;
						vscode.postMessage({
							__vscode_notebook_message: true,
							type: 'dimension',
							id: id,
							data: {
								height: entry.contentRect.height
							},
							isOutput: output
						});
					}
				}
			}
		});

		resizeObserver.observe(container);
		if (outputObservers.has(id)) {
			outputObservers.get(id)?.disconnect();
		}

		outputObservers.set(id, resizeObserver);
	};

	function scrollWillGoToParent(event: WheelEvent) {
		for (let node = event.target as Node | null; node; node = node.parentNode) {
			if (!(node instanceof Element) || node.id === 'container') {
				return false;
			}

			if (event.deltaY < 0 && node.scrollTop > 0) {
				return true;
			}

			if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
				return true;
			}
		}

		return false;
	}

	const handleWheel = (event: WheelEvent) => {
		if (event.defaultPrevented || scrollWillGoToParent(event)) {
			return;
		}

		vscode.postMessage({
			__vscode_notebook_message: true,
			type: 'did-scroll-wheel',
			payload: {
				deltaMode: event.deltaMode,
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				deltaZ: event.deltaZ,
				detail: event.detail,
				type: event.type
			}
		});
	};

	function focusFirstFocusableInCell(cellId: string) {
		const cellOutputContainer = document.getElementById(cellId);
		if (cellOutputContainer) {
			const focusableElement = cellOutputContainer.querySelector('[tabindex="0"], [href], button, input, option, select, textarea') as HTMLElement | null;
			focusableElement?.focus();
		}
	}

	function createFocusSink(cellId: string, outputId: string, focusNext?: boolean) {
		const element = document.createElement('div');
		element.tabIndex = 0;
		element.addEventListener('focus', () => {
			vscode.postMessage({
				__vscode_notebook_message: true,
				type: 'focus-editor',
				id: outputId,
				focusNext
			});

			setTimeout(() => { // Wait a tick to prevent the focus indicator blinking before webview blurs
				// Move focus off the focus sink - single use
				focusFirstFocusableInCell(cellId);
			}, 50);
		});

		return element;
	}

	function addMouseoverListeners(element: HTMLElement, outputId: string): void {
		element.addEventListener('mouseenter', () => {
			vscode.postMessage({
				__vscode_notebook_message: true,
				type: 'mouseenter',
				id: outputId,
				data: {}
			});
		});
		element.addEventListener('mouseleave', () => {
			vscode.postMessage({
				__vscode_notebook_message: true,
				type: 'mouseleave',
				id: outputId,
				data: {}
			});
		});
	}

	const dontEmit = Symbol('dontEmit');

	function createEmitter<T>(listenerChange: (listeners: Set<Listener<T>>) => void = () => undefined): EmitterLike<T> {
		const listeners = new Set<Listener<T>>();
		return {
			fire(data) {
				for (const listener of [...listeners]) {
					listener.fn.call(listener.thisArg, data);
				}
			},
			event(fn, thisArg, disposables) {
				const listenerObj = { fn, thisArg };
				const disposable: IDisposable = {
					dispose: () => {
						listeners.delete(listenerObj);
						listenerChange(listeners);
					},
				};

				listeners.add(listenerObj);
				listenerChange(listeners);

				if (disposables instanceof Array) {
					disposables.push(disposable);
				} else if (disposables) {
					disposables.add(disposable);
				}

				return disposable;
			},
		};
	}

	// Maps the events in the given emitter, invoking mapFn on each one. mapFn can return
	// the dontEmit symbol to skip emission.
	function mapEmitter<T, R>(emitter: EmitterLike<T>, mapFn: (data: T) => R | typeof dontEmit) {
		let listener: IDisposable;
		const mapped = createEmitter(listeners => {
			if (listeners.size && !listener) {
				listener = emitter.event(data => {
					const v = mapFn(data);
					if (v !== dontEmit) {
						mapped.fire(v);
					}
				});
			} else if (listener && !listeners.size) {
				listener.dispose();
			}
		});

		return mapped.event;
	}

	interface ICreateCellInfo {
		outputId: string;
		output?: unknown;
		mimeType?: string;
		element: HTMLElement;
	}
	interface ICreateMarkdownInfo {
		readonly content: string;
		readonly element: HTMLElement;
	}

	interface IDestroyCellInfo {
		outputId: string;
	}

	const onWillDestroyOutput = createEmitter<[string | undefined /* namespace */, IDestroyCellInfo | undefined /* cell uri */]>();
	const onDidCreateOutput = createEmitter<[string | undefined /* namespace */, ICreateCellInfo]>();
	const onDidCreateMarkdown = createEmitter<[string | undefined /* namespace */, ICreateMarkdownInfo]>();
	const onDidReceiveMessage = createEmitter<[string, unknown]>();

	const matchesNs = (namespace: string, query: string | undefined) => namespace === '*' || query === namespace || query === 'undefined';

	(window as any).acquireNotebookRendererApi = <T>(namespace: string) => {
		if (!namespace || typeof namespace !== 'string') {
			throw new Error(`acquireNotebookRendererApi should be called your renderer type as a string, got: ${namespace}.`);
		}

		return {
			postMessage(message: unknown) {
				vscode.postMessage({
					__vscode_notebook_message: true,
					type: 'customRendererMessage',
					rendererId: namespace,
					message,
				});
			},
			setState(newState: T) {
				vscode.setState({ ...vscode.getState(), [namespace]: newState });
			},
			getState(): T | undefined {
				const state = vscode.getState();
				return typeof state === 'object' && state ? state[namespace] as T : undefined;
			},
			onDidReceiveMessage: mapEmitter(onDidReceiveMessage, ([ns, data]) => ns === namespace ? data : dontEmit),
			onWillDestroyOutput: mapEmitter(onWillDestroyOutput, ([ns, data]) => matchesNs(namespace, ns) ? data : dontEmit),
			onDidCreateOutput: mapEmitter(onDidCreateOutput, ([ns, data]) => matchesNs(namespace, ns) ? data : dontEmit),
			onDidCreateMarkdown: mapEmitter(onDidCreateMarkdown, ([ns, data]) => data),
		};
	};

	const enum PreloadState {
		Ok,
		Error
	}

	type PreloadResult = { state: PreloadState.Ok } | { state: PreloadState.Error, error: string };

	/**
	 * Map of preload resource URIs to promises that resolve one the resource
	 * loads or errors.
	 */
	const preloadPromises = new Map<string, Promise<PreloadResult>>();
	const queuedOuputActions = new Map<string, Promise<void>>();

	/**
	 * Enqueues an action that affects a output. This blocks behind renderer load
	 * requests that affect the same output. This should be called whenever you
	 * do something that affects output to ensure it runs in
	 * the correct order.
	 */
	const enqueueOutputAction = <T extends { outputId: string; }>(event: T, fn: (event: T) => Promise<void> | void) => {
		const queued = queuedOuputActions.get(event.outputId);
		const maybePromise = queued ? queued.then(() => fn(event)) : fn(event);
		if (typeof maybePromise === 'undefined') {
			return; // a synchonrously-called function, we're done
		}

		const promise = maybePromise.then(() => {
			if (queuedOuputActions.get(event.outputId) === promise) {
				queuedOuputActions.delete(event.outputId);
			}
		});

		queuedOuputActions.set(event.outputId, promise);
	};

	const ttPolicy = window.trustedTypes?.createPolicy('notebookOutputRenderer', {
		createHTML: value => value,
		createScript: value => value,
	});

	window.addEventListener('wheel', handleWheel);

	window.addEventListener('message', rawEvent => {
		const event = rawEvent as ({ data: ToWebviewMessage; });

		switch (event.data.type) {
			case 'initializeMarkdownPreview':
				for (const cell of event.data.cells) {
					createMarkdownPreview(cell.cellId, cell.content, -10000);
				}

				vscode.postMessage({
					__vscode_notebook_message: true,
					type: 'initializedMarkdownPreview',
				});
				break;
			case 'createMarkdownPreview':
				createMarkdownPreview(event.data.id, event.data.content, event.data.top);
				break;
			case 'showMarkdownPreview':
				{
					const data = event.data;
					let cellContainer = document.getElementById(data.id);
					if (cellContainer) {
						cellContainer.style.display = 'block';
					}
					const previewNode = document.getElementById(`${data.id}_container`);
					if (previewNode) {
						previewNode.style.top = `${data.top}px`;
					}
					updateMarkdownPreview(data.id, data.content);
				}
				break;
			case 'hideMarkdownPreview':
				{
					const data = event.data;
					let cellContainer = document.getElementById(data.id);
					if (cellContainer) {
						cellContainer.style.display = 'none';
					}
				}
				break;
			case 'removeMarkdownPreview':
				{
					const data = event.data;
					let cellContainer = document.getElementById(data.id);
					if (cellContainer) {
						cellContainer?.parentElement?.removeChild(cellContainer);
					}
				}
				break;
			case 'html':
				enqueueOutputAction(event.data, async data => {
					const preloadResults = await Promise.all(data.requiredPreloads.map(p => preloadPromises.get(p.uri)));
					if (!queuedOuputActions.has(data.outputId)) { // output was cleared while loading
						return;
					}

					let cellOutputContainer = document.getElementById(data.cellId);
					const outputId = data.outputId;
					if (!cellOutputContainer) {
						const container = document.getElementById('container')!;

						const upperWrapperElement = createFocusSink(data.cellId, outputId);
						container.appendChild(upperWrapperElement);

						const newElement = document.createElement('div');

						newElement.id = data.cellId;
						container.appendChild(newElement);
						cellOutputContainer = newElement;

						const lowerWrapperElement = createFocusSink(data.cellId, outputId, true);
						container.appendChild(lowerWrapperElement);
					}

					const outputNode = document.createElement('div');
					outputNode.classList.add('output');
					outputNode.style.position = 'absolute';
					outputNode.style.top = data.top + 'px';
					outputNode.style.left = data.left + 'px';
					outputNode.style.width = 'calc(100% - ' + data.left + 'px)';
					// outputNode.style.minHeight = '32px';
					outputNode.style.padding = '0px';
					outputNode.id = outputId;

					addMouseoverListeners(outputNode, outputId);
					const content = data.content;
					if (content.type === RenderOutputType.Html) {
						const trustedHtml = ttPolicy?.createHTML(content.htmlContent) ?? content.htmlContent;
						outputNode.innerHTML = trustedHtml as string;
						cellOutputContainer.appendChild(outputNode);
						domEval(outputNode);
					} else if (preloadResults.some(e => e?.state === PreloadState.Error)) {
						outputNode.innerText = `Error loading preloads:`;
						const errList = document.createElement('ul');
						for (const result of preloadResults) {
							if (result?.state === PreloadState.Error) {
								const item = document.createElement('li');
								item.innerText = result.error;
								errList.appendChild(item);
							}
						}
						outputNode.appendChild(errList);
						cellOutputContainer.appendChild(outputNode);
					} else {
						onDidCreateOutput.fire([data.apiNamespace, {
							element: outputNode,
							output: content.output,
							mimeType: content.mimeType,
							outputId
						}]);
						cellOutputContainer.appendChild(outputNode);
					}

					resizeObserve(outputNode, outputId, true);

					vscode.postMessage({
						__vscode_notebook_message: true,
						type: 'dimension',
						id: outputId,
						init: true,
						data: {
							height: outputNode.clientHeight
						}
					});

					// don't hide until after this step so that the height is right
					cellOutputContainer.style.display = data.initiallyHidden ? 'none' : 'block';
				});
				break;
			case 'view-scroll':
				{
					// const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());

					for (let i = 0; i < event.data.widgets.length; i++) {
						const widget = document.getElementById(event.data.widgets[i].id)!;
						if (widget) {
							widget.style.top = event.data.widgets[i].top + 'px';
							if (event.data.forceDisplay) {
								widget.parentElement!.style.display = 'block';
							}
						}
					}
					break;
				}
			case 'view-scroll-markdown':
				{
					// const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
					event.data.cells.map(cell => {
						const widget = document.getElementById(`${cell.id}_preview`)!;

						if (widget) {
							widget.style.top = `${cell.top}px`;
						}

					});

					break;
				}
			case 'clear':
				queuedOuputActions.clear(); // stop all loading outputs
				onWillDestroyOutput.fire([undefined, undefined]);
				document.getElementById('container')!.innerText = '';

				outputObservers.forEach(ob => {
					ob.disconnect();
				});
				outputObservers.clear();
				break;
			case 'clearOutput':
				const output = document.getElementById(event.data.outputId);
				queuedOuputActions.delete(event.data.outputId); // stop any in-progress rendering
				if (output && output.parentNode) {
					onWillDestroyOutput.fire([event.data.apiNamespace, { outputId: event.data.outputId }]);
					output.parentNode.removeChild(output);
				}
				break;
			case 'hideOutput':
				enqueueOutputAction(event.data, ({ outputId }) => {
					const container = document.getElementById(outputId)?.parentElement;
					if (container) {
						container.style.display = 'none';
					}
				});
				break;
			case 'showOutput':
				enqueueOutputAction(event.data, ({ outputId, top }) => {
					const output = document.getElementById(outputId);
					if (output) {
						output.parentElement!.style.display = 'block';
						output.style.top = top + 'px';

						vscode.postMessage({
							__vscode_notebook_message: true,
							type: 'dimension',
							id: outputId,
							data: {
								height: output.clientHeight
							}
						});
					}
				});
				break;
			case 'preload':
				const resources = event.data.resources;
				const globals = event.data.type === 'preload' ? { acquireVsCodeApi } : {};
				let queue: Promise<PreloadResult> = Promise.resolve({ state: PreloadState.Ok });
				for (const { uri, originalUri } of resources) {
					// create the promise so that the scripts download in parallel, but
					// only invoke them in series within the queue
					const promise = runScript(uri, originalUri, globals);
					queue = queue.then(() => promise.then(fn => {
						const result = fn();
						if (result.state === PreloadState.Error) {
							console.error(result.error);
						}

						return result;
					}));
					preloadPromises.set(uri, queue);
				}
				break;
			case 'focus-output':
				focusFirstFocusableInCell(event.data.cellId);
				break;
			case 'decorations':
				{
					const outputContainer = document.getElementById(event.data.cellId);
					event.data.addedClassNames.forEach(n => {
						outputContainer?.classList.add(n);
					});

					event.data.removedClassNames.forEach(n => {
						outputContainer?.classList.remove(n);
					});
				}

				break;
			case 'customRendererMessage':
				onDidReceiveMessage.fire([event.data.rendererId, event.data.message]);
				break;
		}
	});

	vscode.postMessage({
		__vscode_notebook_message: true,
		type: 'initialized'
	});

	document.addEventListener('dragover', e => {
		// Allow dropping dragged markdown cells
		e.preventDefault();
	});

	const markdownCellDragDataType = 'x-vscode-markdown-cell-drag';

	document.addEventListener('drop', e => {
		const data = e.dataTransfer?.getData(markdownCellDragDataType);
		if (!data) {
			return;
		}
		e.preventDefault();

		const { cellId } = JSON.parse(data);
		const msg: ICellDragEndMessage = {
			__vscode_notebook_message: true,
			type: 'cell-drag-end',
			cellId: cellId,
			ctrlKey: e.ctrlKey,
			altKey: e.altKey,
			position: { clientX: e.clientX, clientY: e.clientY },
		};
		vscode.postMessage(msg);
	});

	function createMarkdownPreview(cellId: string, content: string, top: number) {
		let cellContainer = document.getElementById(cellId);
		if (!cellContainer) {
			const container = document.getElementById('container')!;
			const newElement = document.createElement('div');

			newElement.id = `${cellId}`;
			container.appendChild(newElement);
			cellContainer = newElement;

			const previewContainerNode = document.createElement('div');
			previewContainerNode.style.position = 'absolute';
			previewContainerNode.style.top = top + 'px';
			previewContainerNode.id = `${cellId}_preview`;
			previewContainerNode.classList.add('preview');
			previewContainerNode.addEventListener('dblclick', () => {
				vscode.postMessage({
					__vscode_notebook_message: true,
					type: 'toggleMarkdownPreview',
					cellId,
				});
			});

			previewContainerNode.setAttribute('draggable', 'true');

			previewContainerNode.addEventListener('dragstart', e => {
				if (!e.dataTransfer) {
					return;
				}
				e.dataTransfer.setData(markdownCellDragDataType, JSON.stringify({ cellId }));

				(e.target as HTMLElement).classList.add('dragging');

				const msg: ICellDragStartMessage = {
					__vscode_notebook_message: true,
					type: 'cell-drag-start',
					cellId: cellId,
					position: { clientX: e.clientX, clientY: e.clientY },
				};
				vscode.postMessage(msg);
			});

			previewContainerNode.addEventListener('drag', e => {
				const msg: ICellDragMessage = {
					__vscode_notebook_message: true,
					type: 'cell-drag',
					cellId: cellId,
					position: { clientX: e.clientX, clientY: e.clientY },
				};
				vscode.postMessage(msg);
			});

			previewContainerNode.addEventListener('dragend', e => {
				(e.target as HTMLElement).classList.remove('dragging');
			});

			cellContainer.appendChild(previewContainerNode);

			const previewNode = document.createElement('div');
			previewContainerNode.appendChild(previewNode);

			// TODO: handle namespace
			onDidCreateMarkdown.fire([undefined /* data.apiNamespace */, {
				element: previewNode,
				content: content
			}]);

			resizeObserve(previewContainerNode, `${cellId}_preview`, false);

			vscode.postMessage({
				__vscode_notebook_message: true,
				type: 'dimension',
				id: `${cellId}_preview`,
				init: true,
				data: {
					height: previewContainerNode.clientHeight
				},
				isOutput: false
			});
		} else {
			updateMarkdownPreview(cellId, content);
		}
	}

	function updateMarkdownPreview(cellId: string, content: string) {
		const previewNode = document.getElementById(`${cellId}_preview`);
		if (previewNode) {
			// TODO: handle namespace
			onDidCreateMarkdown.fire([undefined /* data.apiNamespace */, {
				element: previewNode,
				content: content
			}]);
		}
	}
}

export const preloadsScriptStr = (outputNodePadding: number, outputNodeLeftPadding: number) => `(${webviewPreloads})()`.replace(/__outputNodePadding__/g, `${outputNodePadding}`).replace(/__outputNodeLeftPadding__/g, `${outputNodeLeftPadding}`);
