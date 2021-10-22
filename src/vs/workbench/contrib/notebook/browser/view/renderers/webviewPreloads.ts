/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from 'vs/base/common/event';
import type { IDisposable } from 'vs/base/common/lifecycle';
import { RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import type * as webviewMessages from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages';

// !! IMPORTANT !! everything must be in-line within the webviewPreloads
// function. Imports are not allowed. This is stringified and injected into
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


type Listener<T> = { fn: (evt: T) => void; thisArg: unknown; };

interface EmitterLike<T> {
	fire(data: T): void;
	event: Event<T>;
}

interface PreloadStyles {
	readonly outputNodePadding: number;
	readonly outputNodeLeftPadding: number;
}

export interface PreloadOptions {
	dragAndDropEnabled: boolean;
}

interface PreloadContext {
	readonly nonce: string;
	readonly style: PreloadStyles;
	readonly options: PreloadOptions;
	readonly rendererData: readonly RendererMetadata[];
	readonly isWorkspaceTrusted: boolean;
}

declare function __import(path: string): Promise<any>;

async function webviewPreloads(ctx: PreloadContext) {
	let currentOptions = ctx.options;
	let isWorkspaceTrusted = ctx.isWorkspaceTrusted;

	const acquireVsCodeApi = globalThis.acquireVsCodeApi;
	const vscode = acquireVsCodeApi();
	delete (globalThis as any).acquireVsCodeApi;

	const handleInnerClick = (event: MouseEvent) => {
		if (!event || !event.view || !event.view.document) {
			return;
		}

		for (const node of event.composedPath()) {
			if (node instanceof HTMLAnchorElement && node.href) {
				if (node.href.startsWith('blob:')) {
					handleBlobUrlClick(node.href, node.download);
				} else if (node.href.startsWith('data:')) {
					handleDataUrl(node.href, node.download);
				} else if (node.hash && node.getAttribute('href') === node.hash) {
					// Scrolling to location within current doc
					const targetId = node.hash.substr(1, node.hash.length - 1);

					// Check outer document first
					let scrollTarget: Element | null | undefined = event.view.document.getElementById(targetId);

					if (!scrollTarget) {
						// Fallback to checking preview shadow doms
						for (const preview of event.view.document.querySelectorAll('.preview')) {
							scrollTarget = preview.shadowRoot?.getElementById(targetId);
							if (scrollTarget) {
								break;
							}
						}
					}

					if (scrollTarget) {
						const scrollTop = scrollTarget.getBoundingClientRect().top + event.view.scrollY;
						postNotebookMessage<webviewMessages.IScrollToRevealMessage>('scroll-to-reveal', { scrollTop });
						return;
					}
				}

				event.preventDefault();
				return;
			}
		}
	};

	const handleDataUrl = async (data: string | ArrayBuffer | null, downloadName: string) => {
		postNotebookMessage<webviewMessages.IClickedDataUrlMessage>('clicked-data-url', {
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

	async function loadScriptSource(url: string, originalUri = url): Promise<string> {
		const res = await fetch(url);
		const text = await res.text();
		if (!res.ok) {
			throw new Error(`Unexpected ${res.status} requesting ${originalUri}: ${text || res.statusText}`);
		}

		return text;
	}

	interface RendererContext {
		getState<T>(): T | undefined;
		setState<T>(newState: T): void;
		getRenderer(id: string): Promise<any | undefined>;
		postMessage?(message: unknown): void;
		onDidReceiveMessage?: Event<unknown>;
		readonly workspace: { readonly isTrusted: boolean };
	}

	interface RendererModule {
		activate(ctx: RendererContext): Promise<RendererApi | undefined | any> | RendererApi | undefined | any;
	}

	interface KernelPreloadContext {
		readonly onDidReceiveKernelMessage: Event<unknown>;
		postKernelMessage(data: unknown): void;
	}

	interface KernelPreloadModule {
		activate(ctx: KernelPreloadContext): Promise<void> | void;
	}

	function createKernelContext(): KernelPreloadContext {
		return {
			onDidReceiveKernelMessage: onDidReceiveKernelMessage.event,
			postKernelMessage: (data: unknown) => postNotebookMessage('customKernelMessage', { message: data }),
		};
	}

	const invokeSourceWithGlobals = (functionSrc: string, globals: { [name: string]: unknown }) => {
		const args = Object.entries(globals);
		return new Function(...args.map(([k]) => k), functionSrc)(...args.map(([, v]) => v));
	};

	const runKernelPreload = async (url: string, originalUri: string): Promise<void> => {
		const text = await loadScriptSource(url, originalUri);
		const isModule = /\bexport\b.*\bactivate\b/.test(text);
		try {
			if (isModule) {
				const module: KernelPreloadModule = await __import(url);
				return module.activate(createKernelContext());
			} else {
				return invokeSourceWithGlobals(text, { ...kernelPreloadGlobals, scriptUrl: url });
			}
		} catch (e) {
			console.error(e);
			throw e;
		}
	};

	const dimensionUpdater = new class {
		private readonly pending = new Map<string, webviewMessages.DimensionUpdate>();

		updateHeight(id: string, height: number, options: { init?: boolean; isOutput?: boolean }) {
			if (!this.pending.size) {
				setTimeout(() => {
					this.updateImmediately();
				}, 0);
			}
			this.pending.set(id, {
				id,
				height,
				...options,
			});
		}

		updateImmediately() {
			if (!this.pending.size) {
				return;
			}

			postNotebookMessage<webviewMessages.IDimensionMessage>('dimension', {
				updates: Array.from(this.pending.values())
			});
			this.pending.clear();
		}
	};

	const resizeObserver = new class {

		private readonly _observer: ResizeObserver;

		private readonly _observedElements = new WeakMap<Element, { id: string, output: boolean, lastKnownHeight: number }>();

		constructor() {
			this._observer = new ResizeObserver(entries => {
				for (const entry of entries) {
					if (!document.body.contains(entry.target)) {
						continue;
					}

					const observedElementInfo = this._observedElements.get(entry.target);
					if (!observedElementInfo) {
						continue;
					}

					if (entry.target.id === observedElementInfo.id && entry.contentRect) {
						if (observedElementInfo.output) {
							if (entry.contentRect.height !== 0) {
								entry.target.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}px`;
							} else {
								entry.target.style.padding = `0px`;
							}
						}

						const offsetHeight = entry.target.offsetHeight;
						if (observedElementInfo.lastKnownHeight !== offsetHeight) {
							observedElementInfo.lastKnownHeight = offsetHeight;
							dimensionUpdater.updateHeight(observedElementInfo.id, offsetHeight, {
								isOutput: observedElementInfo.output
							});
						}
					}
				}
			});
		}

		public observe(container: Element, id: string, output: boolean) {
			if (this._observedElements.has(container)) {
				return;
			}

			this._observedElements.set(container, { id, output, lastKnownHeight: -1 });
			this._observer.observe(container);
		}
	};

	function scrollWillGoToParent(event: WheelEvent) {
		for (let node = event.target as Node | null; node; node = node.parentNode) {
			if (!(node instanceof Element) || node.id === 'container' || node.classList.contains('cell_container') || node.classList.contains('output_container')) {
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

	const handleWheel = (event: WheelEvent & { wheelDeltaX?: number, wheelDeltaY?: number, wheelDelta?: number }) => {
		if (event.defaultPrevented || scrollWillGoToParent(event)) {
			return;
		}
		postNotebookMessage<webviewMessages.IWheelMessage>('did-scroll-wheel', {
			payload: {
				deltaMode: event.deltaMode,
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				deltaZ: event.deltaZ,
				wheelDelta: event.wheelDelta,
				wheelDeltaX: event.wheelDeltaX,
				wheelDeltaY: event.wheelDeltaY,
				detail: event.detail,
				shiftKey: event.shiftKey,
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

	function createFocusSink(cellId: string, focusNext?: boolean) {
		const element = document.createElement('div');
		element.tabIndex = 0;
		element.addEventListener('focus', () => {
			postNotebookMessage<webviewMessages.IBlurOutputMessage>('focus-editor', {
				cellId: cellId,
				focusNext
			});
		});

		return element;
	}

	function addMouseoverListeners(element: HTMLElement, outputId: string): void {
		element.addEventListener('mouseenter', () => {
			postNotebookMessage<webviewMessages.IMouseEnterMessage>('mouseenter', {
				id: outputId,
			});
		});
		element.addEventListener('mouseleave', () => {
			postNotebookMessage<webviewMessages.IMouseLeaveMessage>('mouseleave', {
				id: outputId,
			});
		});
	}

	function isAncestor(testChild: Node | null, testAncestor: Node | null): boolean {
		while (testChild) {
			if (testChild === testAncestor) {
				return true;
			}
			testChild = testChild.parentNode;
		}

		return false;
	}

	class OutputFocusTracker {
		private _outputId: string;
		private _hasFocus: boolean = false;
		private _loosingFocus: boolean = false;
		private _element: HTMLElement | Window;
		constructor(element: HTMLElement | Window, outputId: string) {
			this._element = element;
			this._outputId = outputId;
			this._hasFocus = isAncestor(document.activeElement, <HTMLElement>element);
			this._loosingFocus = false;

			element.addEventListener('focus', this._onFocus.bind(this), true);
			element.addEventListener('blur', this._onBlur.bind(this), true);
		}

		private _onFocus() {
			this._loosingFocus = false;
			if (!this._hasFocus) {
				this._hasFocus = true;
				postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', {
					id: this._outputId,
				});
			}
		}

		private _onBlur() {
			if (this._hasFocus) {
				this._loosingFocus = true;
				window.setTimeout(() => {
					if (this._loosingFocus) {
						this._loosingFocus = false;
						this._hasFocus = false;
						postNotebookMessage<webviewMessages.IOutputBlurMessage>('outputBlur', {
							id: this._outputId,
						});
					}
				}, 0);
			}
		}

		dispose() {
			if (this._element) {
				this._element.removeEventListener('focus', this._onFocus, true);
				this._element.removeEventListener('blur', this._onBlur, true);
			}
		}
	}

	const outputFocusTrackers = new Map<string, OutputFocusTracker>();

	function addOutputFocusTracker(element: HTMLElement, outputId: string): void {
		if (outputFocusTrackers.has(outputId)) {
			outputFocusTrackers.get(outputId)?.dispose();
		}

		outputFocusTrackers.set(outputId, new OutputFocusTracker(element, outputId));
	}

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

	function showPreloadErrors(outputNode: HTMLElement, ...errors: readonly Error[]) {
		outputNode.innerText = `Error loading preloads:`;
		const errList = document.createElement('ul');
		for (const result of errors) {
			console.error(result);
			const item = document.createElement('li');
			item.innerText = result.message;
			errList.appendChild(item);
		}
		outputNode.appendChild(errList);
	}

	interface IOutputItem {
		readonly id: string;

		readonly mime: string;
		metadata: unknown;

		text(): string;
		json(): any;
		data(): Uint8Array;
		blob(): Blob;
	}

	class OutputItem implements IOutputItem {
		constructor(
			public readonly id: string,
			public readonly element: HTMLElement,
			public readonly mime: string,
			public readonly metadata: unknown,
			public readonly valueBytes: Uint8Array
		) { }

		data() {
			return this.valueBytes;
		}

		bytes() { return this.data(); }

		text() {
			return new TextDecoder().decode(this.valueBytes);
		}

		json() {
			return JSON.parse(this.text());
		}

		blob() {
			return new Blob([this.valueBytes], { type: this.mime });
		}
	}

	const onDidReceiveKernelMessage = createEmitter<unknown>();

	const kernelPreloadGlobals = {
		acquireVsCodeApi,
		onDidReceiveKernelMessage: onDidReceiveKernelMessage.event,
		postKernelMessage: (data: unknown) => postNotebookMessage('customKernelMessage', { message: data }),
	};

	const ttPolicy = window.trustedTypes?.createPolicy('notebookRenderer', {
		createHTML: value => value,
		createScript: value => value,
	});

	window.addEventListener('wheel', handleWheel);

	window.addEventListener('message', async rawEvent => {
		const event = rawEvent as ({ data: webviewMessages.ToWebviewMessage; });

		switch (event.data.type) {
			case 'initializeMarkup':
				await Promise.all(event.data.cells.map(info => viewModel.ensureMarkupCell(info)));
				dimensionUpdater.updateImmediately();
				postNotebookMessage('initializedMarkup', {});
				break;

			case 'createMarkupCell':
				viewModel.ensureMarkupCell(event.data.cell);
				break;

			case 'showMarkupCell':
				viewModel.showMarkupCell(event.data.id, event.data.top, event.data.content);
				break;

			case 'hideMarkupCells':
				for (const id of event.data.ids) {
					viewModel.hideMarkupCell(id);
				}
				break;

			case 'unhideMarkupCells':
				for (const id of event.data.ids) {
					viewModel.unhideMarkupCell(id);
				}
				break;

			case 'deleteMarkupCell':
				for (const id of event.data.ids) {
					viewModel.deleteMarkupCell(id);
				}
				break;

			case 'updateSelectedMarkupCells':
				viewModel.updateSelectedCells(event.data.selectedCellIds);
				break;

			case 'html': {
				const data = event.data;
				outputRunner.enqueue(data.outputId, (state) => {
					return viewModel.renderOutputCell(data, state);
				});
				break;
			}
			case 'view-scroll':
				{
					// const date = new Date();
					// console.log('----- will scroll ----  ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());

					event.data.widgets.forEach(widget => {
						outputRunner.enqueue(widget.outputId, () => {
							viewModel.updateOutputsScroll([widget]);
						});
					});
					viewModel.updateMarkupScrolls(event.data.markupCells);
					break;
				}
			case 'clear':
				renderers.clearAll();
				viewModel.clearAll();
				document.getElementById('container')!.innerText = '';

				outputFocusTrackers.forEach(ft => {
					ft.dispose();
				});
				outputFocusTrackers.clear();
				break;

			case 'clearOutput': {
				const { cellId, rendererId, outputId } = event.data;
				outputRunner.cancelOutput(outputId);
				viewModel.clearOutput(cellId, outputId, rendererId);
				break;
			}
			case 'hideOutput': {
				const { cellId, outputId } = event.data;
				outputRunner.enqueue(outputId, () => {
					viewModel.hideOutput(cellId);
				});
				break;
			}
			case 'showOutput': {
				const { outputId, cellTop, cellId } = event.data;
				outputRunner.enqueue(outputId, () => {
					viewModel.showOutput(cellId, outputId, cellTop);
				});
				break;
			}
			case 'ack-dimension': {
				for (const { cellId, outputId, height } of event.data.updates) {
					viewModel.updateOutputHeight(cellId, outputId, height);
				}
				break;
			}
			case 'preload':
				const resources = event.data.resources;
				for (const { uri, originalUri } of resources) {
					kernelPreloads.load(uri, originalUri);
				}
				break;
			case 'focus-output':
				focusFirstFocusableInCell(event.data.cellId);
				break;
			case 'decorations':
				{
					let outputContainer = document.getElementById(event.data.cellId);
					if (!outputContainer) {
						viewModel.ensureOutputCell(event.data.cellId, -100000);
						outputContainer = document.getElementById(event.data.cellId);
					}
					outputContainer?.classList.add(...event.data.addedClassNames);
					outputContainer?.classList.remove(...event.data.removedClassNames);
				}

				break;
			case 'customKernelMessage':
				onDidReceiveKernelMessage.fire(event.data.message);
				break;
			case 'customRendererMessage':
				renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
				break;
			case 'notebookStyles':
				const documentStyle = document.documentElement.style;

				for (let i = documentStyle.length - 1; i >= 0; i--) {
					const property = documentStyle[i];

					// Don't remove properties that the webview might have added separately
					if (property && property.startsWith('--notebook-')) {
						documentStyle.removeProperty(property);
					}
				}

				// Re-add new properties
				for (const variable of Object.keys(event.data.styles)) {
					documentStyle.setProperty(`--${variable}`, event.data.styles[variable]);
				}
				break;
			case 'notebookOptions':
				currentOptions = event.data.options;
				viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
				break;
			case 'updateWorkspaceTrust': {
				isWorkspaceTrusted = event.data.isTrusted;
				viewModel.rerender();
				break;
			}
		}
	});

	interface RendererApi {
		renderOutputItem: (outputItem: IOutputItem, element: HTMLElement) => void;
		disposeOutputItem?: (id?: string) => void;
	}

	class Renderer {
		constructor(
			public readonly data: RendererMetadata,
			private readonly loadExtension: (id: string) => Promise<void>,
		) { }

		private _onMessageEvent = createEmitter();
		private _loadPromise?: Promise<RendererApi | undefined>;
		private _api: RendererApi | undefined;

		public get api() { return this._api; }

		public load(): Promise<RendererApi | undefined> {
			if (!this._loadPromise) {
				this._loadPromise = this._load();
			}

			return this._loadPromise;
		}

		public receiveMessage(message: unknown) {
			this._onMessageEvent.fire(message);
		}

		private createRendererContext(): RendererContext {
			const { id, messaging } = this.data;
			const context: RendererContext = {
				setState: newState => vscode.setState({ ...vscode.getState(), [id]: newState }),
				getState: <T>() => {
					const state = vscode.getState();
					return typeof state === 'object' && state ? state[id] as T : undefined;
				},
				// TODO: This is async so that we can return a promise to the API in the future.
				// Currently the API is always resolved before we call `createRendererContext`.
				getRenderer: async (id: string) => renderers.getRenderer(id)?.api,
				workspace: {
					get isTrusted() { return isWorkspaceTrusted; }
				}
			};

			if (messaging) {
				context.onDidReceiveMessage = this._onMessageEvent.event;
				context.postMessage = message => postNotebookMessage('customRendererMessage', { rendererId: id, message });
			}

			return context;
		}

		/** Inner function cached in the _loadPromise(). */
		private async _load(): Promise<RendererApi | undefined> {
			const module: RendererModule = await __import(this.data.entrypoint);
			if (!module) {
				return;
			}

			const api = await module.activate(this.createRendererContext());
			this._api = api;

			// Squash any errors extends errors. They won't prevent the renderer
			// itself from working, so just log them.
			await Promise.all(ctx.rendererData
				.filter(d => d.extends === this.data.id)
				.map(d => this.loadExtension(d.id).catch(console.error)),
			);

			return api;
		}
	}

	const kernelPreloads = new class {
		private readonly preloads = new Map<string /* uri */, Promise<unknown>>();

		/**
		 * Returns a promise that resolves when the given preload is activated.
		 */
		public waitFor(uri: string) {
			return this.preloads.get(uri) || Promise.resolve(new Error(`Preload not ready: ${uri}`));
		}

		/**
		 * Loads a preload.
		 * @param uri URI to load from
		 * @param originalUri URI to show in an error message if the preload is invalid.
		 */
		public load(uri: string, originalUri: string) {
			const promise = Promise.all([
				runKernelPreload(uri, originalUri),
				this.waitForAllCurrent(),
			]);

			this.preloads.set(uri, promise);
			return promise;
		}

		/**
		 * Returns a promise that waits for all currently-registered preloads to
		 * activate before resolving.
		 */
		private waitForAllCurrent() {
			return Promise.all([...this.preloads.values()].map(p => p.catch(err => err)));
		}
	};

	const outputRunner = new class {
		private readonly outputs = new Map<string, { cancelled: boolean; queue: Promise<unknown> }>();

		/**
		 * Pushes the action onto the list of actions for the given output ID,
		 * ensuring that it's run in-order.
		 */
		public enqueue(outputId: string, action: (record: { cancelled: boolean }) => unknown) {
			const record = this.outputs.get(outputId);
			if (!record) {
				this.outputs.set(outputId, { cancelled: false, queue: new Promise(r => r(action({ cancelled: false }))) });
			} else {
				record.queue = record.queue.then(r => !record.cancelled && action(record));
			}
		}

		/**
		 * Cancels the rendering of all outputs.
		 */
		public cancelAll() {
			for (const record of this.outputs.values()) {
				record.cancelled = true;
			}
			this.outputs.clear();
		}

		/**
		 * Cancels any ongoing rendering out an output.
		 */
		public cancelOutput(outputId: string) {
			const output = this.outputs.get(outputId);
			if (output) {
				output.cancelled = true;
				this.outputs.delete(outputId);
			}
		}
	};

	const renderers = new class {
		private readonly _renderers = new Map</* id */ string, Renderer>();

		constructor() {
			for (const renderer of ctx.rendererData) {
				this._renderers.set(renderer.id, new Renderer(renderer, async (extensionId) => {
					const ext = this._renderers.get(extensionId);
					if (!ext) {
						throw new Error(`Could not find extending renderer: ${extensionId}`);
					}
					await ext.load();
				}));
			}
		}

		public getRenderer(id: string) {
			return this._renderers.get(id);
		}

		public async load(id: string) {
			const renderer = this._renderers.get(id);
			if (!renderer) {
				throw new Error('Could not find renderer');
			}

			return renderer.load();
		}

		public clearAll() {
			outputRunner.cancelAll();
			for (const renderer of this._renderers.values()) {
				renderer.api?.disposeOutputItem?.();
			}
		}

		public clearOutput(rendererId: string, outputId: string) {
			outputRunner.cancelOutput(outputId);
			this._renderers.get(rendererId)?.api?.disposeOutputItem?.(outputId);
		}

		public async render(info: IOutputItem, element: HTMLElement) {
			const renderers = Array.from(this._renderers.values())
				.filter(renderer => renderer.data.mimeTypes.includes(info.mime) && !renderer.data.extends);

			if (!renderers.length) {
				const errorContainer = document.createElement('div');

				const error = document.createElement('div');
				error.className = 'no-renderer-error';
				const errorText = (document.documentElement.style.getPropertyValue('--notebook-cell-renderer-not-found-error') || '').replace('$0', info.mime);
				error.innerText = errorText;

				const cellText = document.createElement('div');
				cellText.innerText = info.text();

				errorContainer.appendChild(error);
				errorContainer.appendChild(cellText);

				element.innerText = '';
				element.appendChild(errorContainer);

				return;
			}

			// De-prioritize built-in renderers
			renderers.sort((a, b) => +a.data.isBuiltin - +b.data.isBuiltin);

			(await renderers[0].load())?.renderOutputItem(info, element);
		}
	}();

	let hasPostedRenderedMathTelemetry = false;
	const unsupportedKatexTermsRegex = /(\\(?:abovewithdelims|array|Arrowvert|arrowvert|atopwithdelims|bbox|bracevert|buildrel|cancelto|cases|class|cssId|ddddot|dddot|DeclareMathOperator|definecolor|displaylines|enclose|eqalign|eqalignno|eqref|hfil|hfill|idotsint|iiiint|label|leftarrowtail|leftroot|leqalignno|lower|mathtip|matrix|mbox|mit|mmlToken|moveleft|moveright|mspace|newenvironment|Newextarrow|notag|oldstyle|overparen|overwithdelims|pmatrix|raise|ref|renewenvironment|require|root|Rule|scr|shoveleft|shoveright|sideset|skew|Space|strut|style|texttip|Tiny|toggle|underparen|unicode|uproot)\b)/gi;

	const viewModel = new class ViewModel {

		private readonly _markupCells = new Map<string, MarkupCell>();
		private readonly _outputCells = new Map<string, OutputCell>();

		public clearAll() {
			this._markupCells.clear();
			this._outputCells.clear();
		}

		public rerender() {
			this.rerenderMarkupCells();
			this.renderOutputCells();
		}

		private async createMarkupCell(init: webviewMessages.IMarkupCellInitialization, top: number, visible: boolean): Promise<MarkupCell> {
			const existing = this._markupCells.get(init.cellId);
			if (existing) {
				console.error(`Trying to create markup that already exists: ${init.cellId}`);
				return existing;
			}

			const cell = new MarkupCell(init.cellId, init.mime, init.content, top);
			cell.element.style.visibility = visible ? 'visible' : 'hidden';
			this._markupCells.set(init.cellId, cell);

			await cell.ready;
			return cell;
		}

		public async ensureMarkupCell(info: webviewMessages.IMarkupCellInitialization): Promise<void> {
			let cell = this._markupCells.get(info.cellId);
			if (cell) {
				cell.element.style.visibility = info.visible ? 'visible' : 'hidden';
				await cell.updateContentAndRender(info.content);
			} else {
				cell = await this.createMarkupCell(info, info.offset, info.visible);
			}
		}

		public deleteMarkupCell(id: string) {
			const cell = this.getExpectedMarkupCell(id);
			if (cell) {
				cell.remove();
				this._markupCells.delete(id);
			}
		}

		public async updateMarkupContent(id: string, newContent: string): Promise<void> {
			const cell = this.getExpectedMarkupCell(id);
			await cell?.updateContentAndRender(newContent);
		}

		public showMarkupCell(id: string, top: number, newContent: string | undefined): void {
			const cell = this.getExpectedMarkupCell(id);
			cell?.show(id, top, newContent);
		}

		public hideMarkupCell(id: string): void {
			const cell = this.getExpectedMarkupCell(id);
			cell?.hide();
		}

		public unhideMarkupCell(id: string): void {
			const cell = this.getExpectedMarkupCell(id);
			cell?.unhide();
		}

		private rerenderMarkupCells() {
			for (const cell of this._markupCells.values()) {
				cell.rerender();
			}
		}

		private getExpectedMarkupCell(id: string): MarkupCell | undefined {
			const cell = this._markupCells.get(id);
			if (!cell) {
				console.log(`Could not find markup cell '${id}'`);
				return undefined;
			}
			return cell;
		}

		public updateSelectedCells(selectedCellIds: readonly string[]) {
			const selectedCellSet = new Set<string>(selectedCellIds);
			for (const cell of this._markupCells.values()) {
				cell.setSelected(selectedCellSet.has(cell.id));
			}
		}

		public toggleDragDropEnabled(dragAndDropEnabled: boolean) {
			for (const cell of this._markupCells.values()) {
				cell.toggleDragDropEnabled(dragAndDropEnabled);
			}
		}

		public updateMarkupScrolls(markupCells: { id: string; top: number; }[]) {
			for (const { id, top } of markupCells) {
				const cell = this._markupCells.get(id);
				if (cell) {
					cell.element.style.top = `${top}px`;
				}
			}
		}

		private renderOutputCells() {
			for (const outputCell of this._outputCells.values()) {
				outputCell.rerender();
			}
		}

		public async renderOutputCell(data: webviewMessages.ICreationRequestMessage, state: { cancelled: boolean }): Promise<void> {
			const preloadsAndErrors = await Promise.all<unknown>([
				data.rendererId ? renderers.load(data.rendererId) : undefined,
				...data.requiredPreloads.map(p => kernelPreloads.waitFor(p.uri)),
			].map(p => p?.catch(err => err)));

			if (state.cancelled) {
				return;
			}

			const cellOutput = this.ensureOutputCell(data.cellId, data.cellTop);
			const outputNode = cellOutput.createOutputElement(data.outputId, data.outputOffset, data.left);
			outputNode.render(data.content, preloadsAndErrors);

			// don't hide until after this step so that the height is right
			cellOutput.element.style.visibility = data.initiallyHidden ? 'hidden' : 'visible';
		}

		public ensureOutputCell(cellId: string, cellTop: number): OutputCell {
			let cell = this._outputCells.get(cellId);
			if (!cell) {
				cell = new OutputCell(cellId);
				this._outputCells.set(cellId, cell);
			}

			cell.element.style.top = cellTop + 'px';
			return cell;
		}

		public clearOutput(cellId: string, outputId: string, rendererId: string | undefined) {
			const cell = this._outputCells.get(cellId);
			cell?.clearOutput(outputId, rendererId);
		}

		public showOutput(cellId: string, outputId: string, top: number) {
			const cell = this._outputCells.get(cellId);
			cell?.show(outputId, top);
		}

		public hideOutput(cellId: string) {
			const cell = this._outputCells.get(cellId);
			cell?.hide();
		}

		public updateOutputHeight(cellId: string, outputId: string, height: number) {
			const cell = this._outputCells.get(cellId);
			cell?.updateOutputHeight(outputId, height);
		}

		public updateOutputsScroll(updates: webviewMessages.IContentWidgetTopRequest[]) {
			for (const request of updates) {
				const cell = this._outputCells.get(request.cellId);
				cell?.updateScroll(request);
			}
		}
	}();

	class MarkupCell implements IOutputItem {

		public readonly ready: Promise<void>;

		public readonly element: HTMLElement;

		/// Internal field that holds text content
		private _content: string;

		constructor(id: string, mime: string, content: string, top: number) {
			this.id = id;
			this.mime = mime;
			this._content = content;

			let resolveReady: () => void;
			this.ready = new Promise<void>(r => resolveReady = r);

			const root = document.getElementById('container')!;

			this.element = document.createElement('div');
			this.element.id = this.id;
			this.element.classList.add('preview');
			this.element.style.position = 'absolute';
			this.element.style.top = top + 'px';
			this.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
			root.appendChild(this.element);

			this.addEventListeners();

			this.updateContentAndRender(this._content).then(() => {
				resizeObserver.observe(this.element, this.id, false);
				resolveReady();
			});
		}

		//#region IOutputItem
		public readonly id: string;
		public readonly mime: string;
		public readonly metadata = undefined;

		text() { return this._content; }
		json() { return undefined; }
		bytes() { return this.data(); }
		data() { return new TextEncoder().encode(this._content); }
		blob() { return new Blob([this.data()], { type: this.mime }); }
		//#endregion

		private addEventListeners() {
			this.element.addEventListener('dblclick', () => {
				postNotebookMessage<webviewMessages.IToggleMarkupPreviewMessage>('toggleMarkupPreview', { cellId: this.id });
			});

			this.element.addEventListener('click', e => {
				postNotebookMessage<webviewMessages.IClickMarkupCellMessage>('clickMarkupCell', {
					cellId: this.id,
					altKey: e.altKey,
					ctrlKey: e.ctrlKey,
					metaKey: e.metaKey,
					shiftKey: e.shiftKey,
				});
			});

			this.element.addEventListener('contextmenu', e => {
				postNotebookMessage<webviewMessages.IContextMenuMarkupCellMessage>('contextMenuMarkupCell', {
					cellId: this.id,
					clientX: e.clientX,
					clientY: e.clientY,
				});
			});

			this.element.addEventListener('mouseenter', () => {
				postNotebookMessage<webviewMessages.IMouseEnterMarkupCellMessage>('mouseEnterMarkupCell', { cellId: this.id });
			});

			this.element.addEventListener('mouseleave', () => {
				postNotebookMessage<webviewMessages.IMouseLeaveMarkupCellMessage>('mouseLeaveMarkupCell', { cellId: this.id });
			});

			this.element.addEventListener('dragstart', e => {
				markupCellDragManager.startDrag(e, this.id);
			});

			this.element.addEventListener('drag', e => {
				markupCellDragManager.updateDrag(e, this.id);
			});

			this.element.addEventListener('dragend', e => {
				markupCellDragManager.endDrag(e, this.id);
			});
		}

		public async updateContentAndRender(newContent: string): Promise<void> {
			this._content = newContent;

			await renderers.render(this, this.element);

			if (this.mime === 'text/markdown' || this.mime === 'text/latex') {
				const root = this.element.shadowRoot;
				if (root) {
					if (!hasPostedRenderedMathTelemetry) {
						const hasRenderedMath = root.querySelector('.katex');
						if (hasRenderedMath) {
							hasPostedRenderedMathTelemetry = true;
							postNotebookMessage<webviewMessages.ITelemetryFoundRenderedMarkdownMath>('telemetryFoundRenderedMarkdownMath', {});
						}
					}

					const innerText = root.querySelector<HTMLElement>('#preview')?.innerText;
					const matches = innerText?.match(unsupportedKatexTermsRegex);
					if (matches) {
						postNotebookMessage<webviewMessages.ITelemetryFoundUnrenderedMarkdownMath>('telemetryFoundUnrenderedMarkdownMath', {
							latexDirective: matches[0],
						});
					}
				}
			}

			const root = (this.element.shadowRoot ?? this.element);
			const html = [];
			for (const child of root.children) {
				switch (child.tagName) {
					case 'LINK':
					case 'SCRIPT':
					case 'STYLE':
						// not worth sending over since it will be stripped before rendering
						break;

					default:
						html.push(child.outerHTML);
						break;
				}
			}

			postNotebookMessage<webviewMessages.IRenderedMarkupMessage>('renderedMarkup', {
				cellId: this.id,
				html: html.join(''),
			});

			dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
				isOutput: false
			});
		}

		public show(id: string, top: number, newContent: string | undefined): void {
			this.element.style.visibility = 'visible';
			this.element.style.top = `${top}px`;
			if (typeof newContent === 'string') {
				this.updateContentAndRender(newContent);
			} else {
				this.updateMarkupDimensions();
			}
		}

		public hide() {
			this.element.style.visibility = 'hidden';
		}

		public unhide() {
			this.element.style.visibility = 'visible';
			this.updateMarkupDimensions();
		}

		public rerender() {
			this.updateContentAndRender(this._content);
		}

		public remove() {
			this.element.remove();
		}

		private async updateMarkupDimensions() {
			dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
				isOutput: false
			});
		}

		public setSelected(selected: boolean) {
			this.element.classList.toggle('selected', selected);
		}

		public toggleDragDropEnabled(enabled: boolean) {
			if (enabled) {
				this.element.classList.add('draggable');
				this.element.setAttribute('draggable', 'true');
			} else {
				this.element.classList.remove('draggable');
				this.element.removeAttribute('draggable');
			}
		}
	}

	class OutputCell {

		public readonly element: HTMLElement;

		private readonly outputElements = new Map</*outputId*/ string, OutputContainer>();

		constructor(cellId: string) {
			const container = document.getElementById('container')!;

			const upperWrapperElement = createFocusSink(cellId);
			container.appendChild(upperWrapperElement);

			this.element = document.createElement('div');
			this.element.style.position = 'absolute';

			this.element.id = cellId;
			this.element.classList.add('cell_container');

			container.appendChild(this.element);
			this.element = this.element;

			const lowerWrapperElement = createFocusSink(cellId, true);
			container.appendChild(lowerWrapperElement);
		}

		public createOutputElement(outputId: string, outputOffset: number, left: number): OutputElement {
			let outputContainer = this.outputElements.get(outputId);
			if (!outputContainer) {
				outputContainer = new OutputContainer(outputId);
				this.element.appendChild(outputContainer.element);
				this.outputElements.set(outputId, outputContainer);
			}

			return outputContainer.createOutputElement(outputId, outputOffset, left);
		}

		public clearOutput(outputId: string, rendererId: string | undefined) {
			this.outputElements.get(outputId)?.clear(rendererId);
			this.outputElements.delete(outputId);
		}

		public show(outputId: string, top: number) {
			const outputContainer = this.outputElements.get(outputId);
			if (!outputContainer) {
				return;
			}

			this.element.style.visibility = 'visible';
			this.element.style.top = `${top}px`;

			dimensionUpdater.updateHeight(outputId, outputContainer.element.offsetHeight, {
				isOutput: true,
			});
		}

		public hide() {
			this.element.style.visibility = 'hidden';
		}

		public rerender() {
			for (const outputElement of this.outputElements.values()) {
				outputElement.rerender();
			}
		}

		public updateOutputHeight(outputId: string, height: number) {
			this.outputElements.get(outputId)?.updateHeight(height);
		}

		public updateScroll(request: webviewMessages.IContentWidgetTopRequest) {
			this.element.style.top = `${request.cellTop}px`;

			this.outputElements.get(request.outputId)?.updateScroll(request.outputOffset);

			if (request.forceDisplay) {
				this.element.style.visibility = 'visible';
			}
		}
	}

	class OutputContainer {

		public readonly element: HTMLElement;

		private _outputNode?: OutputElement;

		constructor(
			private readonly outputId: string,
		) {
			this.element = document.createElement('div');
			this.element.classList.add('output_container');
			this.element.style.position = 'absolute';
			this.element.style.overflow = 'hidden';
		}

		public clear(rendererId: string | undefined) {
			if (rendererId) {
				renderers.clearOutput(rendererId, this.outputId);
			}
			this.element.remove();
		}

		public updateHeight(height: number) {
			this.element.style.maxHeight = `${height}px`;
			this.element.style.height = `${height}px`;
		}

		public updateScroll(outputOffset: number) {
			this.element.style.top = `${outputOffset}px`;
		}

		public createOutputElement(outputId: string, outputOffset: number, left: number): OutputElement {
			this.element.innerText = '';
			this.element.style.maxHeight = '0px';
			this.element.style.top = `${outputOffset}px`;

			this._outputNode = new OutputElement(outputId, left);
			this.element.appendChild(this._outputNode.element);
			return this._outputNode;
		}

		public rerender() {
			this._outputNode?.rerender();
		}
	}

	vscode.postMessage({
		__vscode_notebook_message: true,
		type: 'initialized'
	});

	function postNotebookMessage<T extends webviewMessages.FromWebviewMessage>(
		type: T['type'],
		properties: Omit<T, '__vscode_notebook_message' | 'type'>
	) {
		vscode.postMessage({
			__vscode_notebook_message: true,
			type,
			...properties
		});
	}

	class OutputElement {

		public readonly element: HTMLElement;

		private _content?: { content: webviewMessages.ICreationContent, preloadsAndErrors: unknown[] };
		private hasResizeObserver = false;

		constructor(
			private readonly outputId: string,
			left: number,
		) {
			this.element = document.createElement('div');
			this.element.id = outputId;
			this.element.classList.add('output');
			this.element.style.position = 'absolute';
			this.element.style.top = `0px`;
			this.element.style.left = left + 'px';
			this.element.style.padding = '0px';

			addMouseoverListeners(this.element, outputId);
			addOutputFocusTracker(this.element, outputId);
		}


		public render(content: webviewMessages.ICreationContent, preloadsAndErrors: unknown[]) {
			this._content = { content, preloadsAndErrors };
			if (content.type === RenderOutputType.Html) {
				const trustedHtml = ttPolicy?.createHTML(content.htmlContent) ?? content.htmlContent;
				this.element.innerHTML = trustedHtml as string;
				domEval(this.element);
			} else if (preloadsAndErrors.some(e => e instanceof Error)) {
				const errors = preloadsAndErrors.filter((e): e is Error => e instanceof Error);
				showPreloadErrors(this.element, ...errors);
			} else {
				const rendererApi = preloadsAndErrors[0] as RendererApi;
				try {
					rendererApi.renderOutputItem(new OutputItem(this.outputId, this.element, content.mimeType, content.metadata, content.valueBytes), this.element);
				} catch (e) {
					showPreloadErrors(this.element, e);
				}
			}

			if (!this.hasResizeObserver) {
				this.hasResizeObserver = true;
				resizeObserver.observe(this.element, this.outputId, true);
			}

			const offsetHeight = this.element.offsetHeight;
			const cps = document.defaultView!.getComputedStyle(this.element);
			if (offsetHeight !== 0 && cps.padding === '0px') {
				// we set padding to zero if the output height is zero (then we can have a zero-height output DOM node)
				// thus we need to ensure the padding is accounted when updating the init height of the output
				dimensionUpdater.updateHeight(this.outputId, offsetHeight + ctx.style.outputNodePadding * 2, {
					isOutput: true,
					init: true,
				});

				this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
			} else {
				dimensionUpdater.updateHeight(this.outputId, this.element.offsetHeight, {
					isOutput: true,
					init: true,
				});
			}
		}

		public rerender() {
			if (this._content) {
				this.render(this._content.content, this._content.preloadsAndErrors);
			}
		}
	}

	const markupCellDragManager = new class MarkupCellDragManager {

		private currentDrag: { cellId: string, clientY: number } | undefined;

		// Transparent overlay that prevents elements from inside the webview from eating
		// drag events.
		private dragOverlay?: HTMLElement;

		constructor() {
			document.addEventListener('dragover', e => {
				// Allow dropping dragged markup cells
				e.preventDefault();
			});

			document.addEventListener('drop', e => {
				e.preventDefault();

				const drag = this.currentDrag;
				if (!drag) {
					return;
				}

				this.currentDrag = undefined;
				postNotebookMessage<webviewMessages.ICellDropMessage>('cell-drop', {
					cellId: drag.cellId,
					ctrlKey: e.ctrlKey,
					altKey: e.altKey,
					dragOffsetY: e.clientY,
				});
			});
		}

		startDrag(e: DragEvent, cellId: string) {
			if (!e.dataTransfer) {
				return;
			}

			if (!currentOptions.dragAndDropEnabled) {
				return;
			}

			this.currentDrag = { cellId, clientY: e.clientY };

			const overlayZIndex = 9999;
			if (!this.dragOverlay) {
				this.dragOverlay = document.createElement('div');
				this.dragOverlay.style.position = 'absolute';
				this.dragOverlay.style.top = '0';
				this.dragOverlay.style.left = '0';
				this.dragOverlay.style.zIndex = `${overlayZIndex}`;
				this.dragOverlay.style.width = '100%';
				this.dragOverlay.style.height = '100%';
				this.dragOverlay.style.background = 'transparent';
				document.body.appendChild(this.dragOverlay);
			}
			(e.target as HTMLElement).style.zIndex = `${overlayZIndex + 1}`;
			(e.target as HTMLElement).classList.add('dragging');

			postNotebookMessage<webviewMessages.ICellDragStartMessage>('cell-drag-start', {
				cellId: cellId,
				dragOffsetY: e.clientY,
			});

			// Continuously send updates while dragging instead of relying on `updateDrag`.
			// This lets us scroll the list based on drag position.
			const trySendDragUpdate = () => {
				if (this.currentDrag?.cellId !== cellId) {
					return;
				}

				postNotebookMessage<webviewMessages.ICellDragMessage>('cell-drag', {
					cellId: cellId,
					dragOffsetY: this.currentDrag.clientY,
				});
				requestAnimationFrame(trySendDragUpdate);
			};
			requestAnimationFrame(trySendDragUpdate);
		}

		updateDrag(e: DragEvent, cellId: string) {
			if (cellId !== this.currentDrag?.cellId) {
				this.currentDrag = undefined;
			} else {
				this.currentDrag = { cellId, clientY: e.clientY };
			}
		}

		endDrag(e: DragEvent, cellId: string) {
			this.currentDrag = undefined;
			(e.target as HTMLElement).classList.remove('dragging');
			postNotebookMessage<webviewMessages.ICellDragEndMessage>('cell-drag-end', {
				cellId: cellId
			});

			if (this.dragOverlay) {
				document.body.removeChild(this.dragOverlay);
				this.dragOverlay = undefined;
			}

			(e.target as HTMLElement).style.zIndex = '';
		}
	}();
}

export interface RendererMetadata {
	readonly id: string;
	readonly entrypoint: string;
	readonly mimeTypes: readonly string[];
	readonly extends: string | undefined;
	readonly messaging: boolean;
	readonly isBuiltin: boolean;
}

export function preloadsScriptStr(styleValues: PreloadStyles, options: PreloadOptions, renderers: readonly RendererMetadata[], isWorkspaceTrusted: boolean, nonce: string) {
	const ctx: PreloadContext = {
		style: styleValues,
		options,
		rendererData: renderers,
		isWorkspaceTrusted,
		nonce,
	};
	// TS will try compiling `import()` in webviewPreloads, so use a helper function instead
	// of using `import(...)` directly
	return `
		const __import = (x) => import(x);
		(${webviewPreloads})(
			JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(ctx))}"))
		)\n//# sourceURL=notebookWebviewPreloads.js\n`;
}
