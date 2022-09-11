/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from 'vs/base/common/event';
import type { IDisposable } from 'vs/base/common/lifecycle';
import type * as webviewMessages from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewMessages';
import type { NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import type * as rendererApi from 'vscode-notebook-renderer';

// !! IMPORTANT !! ----------------------------------------------------------------------------------
// import { RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
// We can ONLY IMPORT as type in this module. This also applies to const enums that would evaporate
// in normal compiles but remain a dependency in transpile-only compiles
// !! IMPORTANT !! ----------------------------------------------------------------------------------

// !! IMPORTANT !! everything must be in-line within the webviewPreloads
// function. Imports are not allowed. This is stringified and injected into
// the webview.

declare module globalThis {
	const acquireVsCodeApi: () => ({
		getState(): { [key: string]: unknown };
		setState(data: { [key: string]: unknown }): void;
		postMessage: (msg: unknown) => void;
	});
}

declare class ResizeObserver {
	constructor(onChange: (entries: { target: HTMLElement; contentRect?: ClientRect }[]) => void);
	observe(element: Element): void;
	disconnect(): void;
}

declare class Highlight {
	constructor();
	add(range: AbstractRange): void;
	clear(): void;
	priority: number;
}

interface CSSHighlights {
	set(rule: string, highlight: Highlight): void;
}
declare namespace CSS {
	let highlights: CSSHighlights | undefined;
}


type Listener<T> = { fn: (evt: T) => void; thisArg: unknown };

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
	readonly rendererData: readonly webviewMessages.RendererMetadata[];
	readonly isWorkspaceTrusted: boolean;
	readonly lineLimit: number;
}

declare function __import(path: string): Promise<any>;

async function webviewPreloads(ctx: PreloadContext) {
	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	let currentOptions = ctx.options;
	let isWorkspaceTrusted = ctx.isWorkspaceTrusted;
	const lineLimit = ctx.lineLimit;

	const acquireVsCodeApi = globalThis.acquireVsCodeApi;
	const vscode = acquireVsCodeApi();
	delete (globalThis as any).acquireVsCodeApi;

	const tokenizationStyleElement = document.querySelector('style#vscode-tokenization-styles');

	const handleInnerClick = (event: MouseEvent) => {
		if (!event || !event.view || !event.view.document) {
			return;
		}

		for (const node of event.composedPath()) {
			if (node instanceof HTMLElement && node.classList.contains('output')) {
				// output
				postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', {
					id: node.id,
				});
				break;
			}
		}

		for (const node of event.composedPath()) {
			if (node instanceof HTMLAnchorElement && node.href) {
				if (node.href.startsWith('blob:')) {
					handleBlobUrlClick(node.href, node.download);
				} else if (node.href.startsWith('data:')) {
					handleDataUrl(node.href, node.download);
				} else if (node.getAttribute('href')?.trim().startsWith('#')) {
					// Scrolling to location within current doc

					if (!node.hash) {
						postNotebookMessage<webviewMessages.IScrollToRevealMessage>('scroll-to-reveal', { scrollTop: 0 });
						return;
					}

					const targetId = node.hash.substring(1);

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
				} else {
					const href = node.getAttribute('href');
					if (href) {
						postNotebookMessage<webviewMessages.IClickedLinkMessage>('clicked-link', { href });
					}
				}

				event.preventDefault();
				event.stopPropagation();
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
		readonly settings: { readonly lineLimit: number };
	}

	interface RendererModule {
		readonly activate: rendererApi.ActivationFunction;
	}

	interface KernelPreloadContext {
		readonly onDidReceiveKernelMessage: Event<unknown>;
		postKernelMessage(data: unknown): void;
	}

	interface KernelPreloadModule {
		activate(ctx: KernelPreloadContext): Promise<void> | void;
	}

	interface IObservedElement {
		id: string;
		output: boolean;
		lastKnownPadding: number;
		lastKnownHeight: number;
		cellId: string;
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
				if (!module.activate) {
					console.error(`Notebook preload (${url}) looks like a module but does not export an activate function`);
					return;
				}
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
			const update = this.pending.get(id);
			if (update && update.isOutput) {
				this.pending.set(id, {
					id,
					height,
					init: update.init,
					isOutput: update.isOutput,
				});
			} else {
				this.pending.set(id, {
					id,
					height,
					...options,
				});
			}
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

		private readonly _observedElements = new WeakMap<Element, IObservedElement>();
		private _outputResizeTimer: any;

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

					this.postResizeMessage(observedElementInfo.cellId);

					if (entry.target.id !== observedElementInfo.id) {
						continue;
					}

					if (!entry.contentRect) {
						continue;
					}

					if (!observedElementInfo.output) {
						// markup, update directly
						this.updateHeight(observedElementInfo, entry.target.offsetHeight);
						continue;
					}

					const newHeight = entry.contentRect.height;
					const shouldUpdatePadding =
						(newHeight !== 0 && observedElementInfo.lastKnownPadding === 0) ||
						(newHeight === 0 && observedElementInfo.lastKnownPadding !== 0);

					if (shouldUpdatePadding) {
						// Do not update dimension in resize observer
						window.requestAnimationFrame(() => {
							if (newHeight !== 0) {
								entry.target.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}px`;
							} else {
								entry.target.style.padding = `0px`;
							}
							this.updateHeight(observedElementInfo, entry.target.offsetHeight);
						});
					} else {
						this.updateHeight(observedElementInfo, entry.target.offsetHeight);
					}
				}
			});
		}

		private updateHeight(observedElementInfo: IObservedElement, offsetHeight: number) {
			if (observedElementInfo.lastKnownHeight !== offsetHeight) {
				observedElementInfo.lastKnownHeight = offsetHeight;
				dimensionUpdater.updateHeight(observedElementInfo.id, offsetHeight, {
					isOutput: observedElementInfo.output
				});
			}
		}

		public observe(container: Element, id: string, output: boolean, cellId: string) {
			if (this._observedElements.has(container)) {
				return;
			}

			this._observedElements.set(container, { id, output, lastKnownPadding: ctx.style.outputNodePadding, lastKnownHeight: -1, cellId });
			this._observer.observe(container);
		}

		private postResizeMessage(cellId: string) {
			// Debounce this callback to only happen after
			// 250 ms. Don't need resize events that often.
			clearTimeout(this._outputResizeTimer);
			this._outputResizeTimer = setTimeout(() => {
				postNotebookMessage('outputResized', {
					cellId
				});
			}, 250);

		}
	};

	function scrollWillGoToParent(event: WheelEvent) {
		for (let node = event.target as Node | null; node; node = node.parentNode) {
			if (!(node instanceof Element) || node.id === 'container' || node.classList.contains('cell_container') || node.classList.contains('markup') || node.classList.contains('output_container')) {
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

	const handleWheel = (event: WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number; wheelDelta?: number }) => {
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
			if (cellOutputContainer.contains(document.activeElement)) {
				return;
			}

			const focusableElement = cellOutputContainer.querySelector('[tabindex="0"], [href], button, input, option, select, textarea') as HTMLElement | null;
			focusableElement?.focus();
		}
	}

	function createFocusSink(cellId: string, focusNext?: boolean) {
		const element = document.createElement('div');
		element.id = `focus-sink-${cellId}`;
		element.tabIndex = 0;
		element.addEventListener('focus', () => {
			postNotebookMessage<webviewMessages.IBlurOutputMessage>('focus-editor', {
				cellId: cellId,
				focusNext
			});
		});

		return element;
	}

	function _internalHighlightRange(range: Range, tagName = 'mark', attributes = {}) {
		// derived from https://github.com/Treora/dom-highlight-range/blob/master/highlight-range.js

		// Return an array of the text nodes in the range. Split the start and end nodes if required.
		function _textNodesInRange(range: Range): Text[] {
			if (!range.startContainer.ownerDocument) {
				return [];
			}

			// If the start or end node is a text node and only partly in the range, split it.
			if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
				const startContainer = range.startContainer as Text;
				const endOffset = range.endOffset; // (this may get lost when the splitting the node)
				const createdNode = startContainer.splitText(range.startOffset);
				if (range.endContainer === startContainer) {
					// If the end was in the same container, it will now be in the newly created node.
					range.setEnd(createdNode, endOffset - range.startOffset);
				}

				range.setStart(createdNode, 0);
			}

			if (
				range.endContainer.nodeType === Node.TEXT_NODE
				&& range.endOffset < (range.endContainer as Text).length
			) {
				(range.endContainer as Text).splitText(range.endOffset);
			}

			// Collect the text nodes.
			const walker = range.startContainer.ownerDocument.createTreeWalker(
				range.commonAncestorContainer,
				NodeFilter.SHOW_TEXT,
				node => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
			);

			walker.currentNode = range.startContainer;

			// // Optimise by skipping nodes that are explicitly outside the range.
			// const NodeTypesWithCharacterOffset = [
			//  Node.TEXT_NODE,
			//  Node.PROCESSING_INSTRUCTION_NODE,
			//  Node.COMMENT_NODE,
			// ];
			// if (!NodeTypesWithCharacterOffset.includes(range.startContainer.nodeType)) {
			//   if (range.startOffset < range.startContainer.childNodes.length) {
			//     walker.currentNode = range.startContainer.childNodes[range.startOffset];
			//   } else {
			//     walker.nextSibling(); // TODO verify this is correct.
			//   }
			// }

			const nodes: Text[] = [];
			if (walker.currentNode.nodeType === Node.TEXT_NODE) {
				nodes.push(walker.currentNode as Text);
			}

			while (walker.nextNode() && range.comparePoint(walker.currentNode, 0) !== 1) {
				if (walker.currentNode.nodeType === Node.TEXT_NODE) {
					nodes.push(walker.currentNode as Text);
				}
			}

			return nodes;
		}

		// Replace [node] with <tagName ...attributes>[node]</tagName>
		function wrapNodeInHighlight(node: Text, tagName: string, attributes: any) {
			const highlightElement = node.ownerDocument.createElement(tagName);
			Object.keys(attributes).forEach(key => {
				highlightElement.setAttribute(key, attributes[key]);
			});
			const tempRange = node.ownerDocument.createRange();
			tempRange.selectNode(node);
			tempRange.surroundContents(highlightElement);
			return highlightElement;
		}

		if (range.collapsed) {
			return {
				remove: () => { },
				update: () => { }
			};
		}

		// First put all nodes in an array (splits start and end nodes if needed)
		const nodes = _textNodesInRange(range);

		// Highlight each node
		const highlightElements: Element[] = [];
		for (const nodeIdx in nodes) {
			const highlightElement = wrapNodeInHighlight(nodes[nodeIdx], tagName, attributes);
			highlightElements.push(highlightElement);
		}

		// Remove a highlight element created with wrapNodeInHighlight.
		function _removeHighlight(highlightElement: Element) {
			if (highlightElement.childNodes.length === 1) {
				highlightElement.parentNode?.replaceChild(highlightElement.firstChild!, highlightElement);
			} else {
				// If the highlight somehow contains multiple nodes now, move them all.
				while (highlightElement.firstChild) {
					highlightElement.parentNode?.insertBefore(highlightElement.firstChild, highlightElement);
				}
				highlightElement.remove();
			}
		}

		// Return a function that cleans up the highlightElements.
		function _removeHighlights() {
			// Remove each of the created highlightElements.
			for (const highlightIdx in highlightElements) {
				_removeHighlight(highlightElements[highlightIdx]);
			}
		}

		function _updateHighlight(highlightElement: Element, attributes: any = {}) {
			Object.keys(attributes).forEach(key => {
				highlightElement.setAttribute(key, attributes[key]);
			});
		}

		function updateHighlights(attributes: any) {
			for (const highlightIdx in highlightElements) {
				_updateHighlight(highlightElements[highlightIdx], attributes);
			}
		}

		return {
			remove: _removeHighlights,
			update: updateHighlights
		};
	}

	interface ICommonRange {
		collapsed: boolean;
		commonAncestorContainer: Node;
		endContainer: Node;
		endOffset: number;
		startContainer: Node;
		startOffset: number;

	}

	interface IHighlightResult {
		range: ICommonRange;
		dispose: () => void;
		update: (color: string | undefined, className: string | undefined) => void;
	}

	function selectRange(_range: ICommonRange) {
		const sel = window.getSelection();
		if (sel) {
			try {
				sel.removeAllRanges();
				const r = document.createRange();
				r.setStart(_range.startContainer, _range.startOffset);
				r.setEnd(_range.endContainer, _range.endOffset);
				sel.addRange(r);
			} catch (e) {
				console.log(e);
			}
		}
	}

	function highlightRange(range: Range, useCustom: boolean, tagName = 'mark', attributes = {}): IHighlightResult {
		if (useCustom) {
			const ret = _internalHighlightRange(range, tagName, attributes);
			return {
				range: range,
				dispose: ret.remove,
				update: (color: string | undefined, className: string | undefined) => {
					if (className === undefined) {
						ret.update({
							'style': `background-color: ${color}`
						});
					} else {
						ret.update({
							'class': className
						});
					}
				}
			};
		} else {
			window.document.execCommand('hiliteColor', false, matchColor);
			const cloneRange = window.getSelection()!.getRangeAt(0).cloneRange();
			const _range = {
				collapsed: cloneRange.collapsed,
				commonAncestorContainer: cloneRange.commonAncestorContainer,
				endContainer: cloneRange.endContainer,
				endOffset: cloneRange.endOffset,
				startContainer: cloneRange.startContainer,
				startOffset: cloneRange.startOffset
			};
			return {
				range: _range,
				dispose: () => {
					selectRange(_range);
					try {
						document.designMode = 'On';
						document.execCommand('removeFormat', false, undefined);
						document.designMode = 'Off';
						window.getSelection()?.removeAllRanges();
					} catch (e) {
						console.log(e);
					}
				},
				update: (color: string | undefined, className: string | undefined) => {
					selectRange(_range);
					try {
						document.designMode = 'On';
						document.execCommand('removeFormat', false, undefined);
						window.document.execCommand('hiliteColor', false, color);
						document.designMode = 'Off';
						window.getSelection()?.removeAllRanges();
					} catch (e) {
						console.log(e);
					}
				}
			};
		}
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

	function createOutputItem(
		id: string,
		mime: string,
		metadata: unknown,
		valueBytes: Uint8Array
	): rendererApi.OutputItem {
		return Object.freeze<rendererApi.OutputItem>({
			id,
			mime,
			metadata,

			data(): Uint8Array {
				return valueBytes;
			},

			text(): string {
				return textDecoder.decode(valueBytes);
			},

			json() {
				return JSON.parse(this.text());
			},

			blob(): Blob {
				return new Blob([valueBytes], { type: this.mime });
			}
		});
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

	interface IFindMatch {
		type: 'preview' | 'output';
		id: string;
		cellId: string;
		container: Node;
		originalRange: Range;
		isShadow: boolean;
		highlightResult?: IHighlightResult;
	}

	interface IHighlighter {
		highlightCurrentMatch(index: number): void;
		unHighlightCurrentMatch(index: number): void;
		dispose(): void;
	}

	let _highlighter: IHighlighter | null = null;
	const matchColor = window.getComputedStyle(document.getElementById('_defaultColorPalatte')!).color;
	const currentMatchColor = window.getComputedStyle(document.getElementById('_defaultColorPalatte')!).backgroundColor;

	class JSHighlighter implements IHighlighter {
		private _findMatchIndex = -1;

		constructor(
			readonly matches: IFindMatch[],
		) {
			for (let i = matches.length - 1; i >= 0; i--) {
				const match = matches[i];
				const ret = highlightRange(match.originalRange, true, 'mark', match.isShadow ? {
					'style': 'background-color: ' + matchColor + ';',
				} : {
					'class': 'find-match'
				});
				match.highlightResult = ret;
			}
		}

		highlightCurrentMatch(index: number) {
			const oldMatch = this.matches[this._findMatchIndex];
			oldMatch?.highlightResult?.update(matchColor, oldMatch.isShadow ? undefined : 'find-match');

			const match = this.matches[index];
			this._findMatchIndex = index;
			const sel = window.getSelection();
			if (!!match && !!sel && match.highlightResult) {
				let offset = 0;
				try {
					const outputOffset = document.getElementById(match.id)!.getBoundingClientRect().top;
					const tempRange = document.createRange();
					tempRange.selectNode(match.highlightResult.range.startContainer);
					const rangeOffset = tempRange.getBoundingClientRect().top;
					tempRange.detach();
					offset = rangeOffset - outputOffset;
				} catch (e) {
				}

				match.highlightResult?.update(currentMatchColor, match.isShadow ? undefined : 'current-find-match');

				document.getSelection()?.removeAllRanges();
				postNotebookMessage('didFindHighlight', {
					offset
				});
			}
		}

		unHighlightCurrentMatch(index: number) {
			const oldMatch = this.matches[index];
			if (oldMatch && oldMatch.highlightResult) {
				oldMatch.highlightResult.update(matchColor, oldMatch.isShadow ? undefined : 'find-match');
			}
		}

		dispose() {
			document.getSelection()?.removeAllRanges();

			this.matches.forEach(match => {
				match.highlightResult?.dispose();
			});
		}
	}

	class CSSHighlighter implements IHighlighter {
		private _matchesHighlight: Highlight;
		private _currentMatchesHighlight: Highlight;
		private _findMatchIndex = -1;

		constructor(
			readonly matches: IFindMatch[],
		) {
			this._matchesHighlight = new Highlight();
			this._matchesHighlight.priority = 1;
			this._currentMatchesHighlight = new Highlight();
			this._currentMatchesHighlight.priority = 2;

			for (let i = 0; i < matches.length; i++) {
				this._matchesHighlight.add(matches[i].originalRange);
			}
			CSS.highlights?.set('find-highlight', this._matchesHighlight);
			CSS.highlights?.set('current-find-highlight', this._currentMatchesHighlight);
		}

		highlightCurrentMatch(index: number): void {
			this._findMatchIndex = index;
			const match = this.matches[this._findMatchIndex];
			const range = match.originalRange;

			if (match) {
				let offset = 0;
				try {
					const outputOffset = document.getElementById(match.id)!.getBoundingClientRect().top;
					const rangeOffset = match.originalRange.getBoundingClientRect().top;
					offset = rangeOffset - outputOffset;
					postNotebookMessage('didFindHighlight', {
						offset
					});
				} catch (e) {
				}
			}

			this._currentMatchesHighlight.clear();
			this._currentMatchesHighlight.add(range);
		}

		unHighlightCurrentMatch(index: number): void {
			this._currentMatchesHighlight.clear();
		}

		dispose(): void {
			document.getSelection()?.removeAllRanges();
			this._currentMatchesHighlight.clear();
			this._matchesHighlight.clear();
		}
	}

	const find = (query: string, options: { wholeWord?: boolean; caseSensitive?: boolean; includeMarkup: boolean; includeOutput: boolean }) => {
		let find = true;
		const matches: IFindMatch[] = [];

		const range = document.createRange();
		range.selectNodeContents(document.getElementById('findStart')!);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);

		viewModel.toggleDragDropEnabled(false);

		try {
			document.designMode = 'On';

			while (find && matches.length < 500) {
				find = (window as any).find(query, /* caseSensitive*/ !!options.caseSensitive,
				/* backwards*/ false,
				/* wrapAround*/ false,
				/* wholeWord */ !!options.wholeWord,
				/* searchInFrames*/ true,
					false);

				if (find) {
					const selection = window.getSelection();
					if (!selection) {
						console.log('no selection');
						break;
					}

					if (options.includeMarkup && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1
						&& (selection.getRangeAt(0).startContainer as Element).classList.contains('markup')) {
						// markdown preview container
						const preview = (selection.anchorNode?.firstChild as Element);
						const root = preview.shadowRoot as ShadowRoot & { getSelection: () => Selection };
						const shadowSelection = root?.getSelection ? root?.getSelection() : null;
						if (shadowSelection && shadowSelection.anchorNode) {
							matches.push({
								type: 'preview',
								id: preview.id,
								cellId: preview.id,
								container: preview,
								isShadow: true,
								originalRange: shadowSelection.getRangeAt(0)
							});
						}
					}

					if (options.includeOutput && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1
						&& (selection.getRangeAt(0).startContainer as Element).classList.contains('output_container')) {
						// output container
						const cellId = selection.getRangeAt(0).startContainer.parentElement!.id;
						const outputNode = (selection.anchorNode?.firstChild as Element);
						const root = outputNode.shadowRoot as ShadowRoot & { getSelection: () => Selection };
						const shadowSelection = root?.getSelection ? root?.getSelection() : null;
						if (shadowSelection && shadowSelection.anchorNode) {
							matches.push({
								type: 'output',
								id: outputNode.id,
								cellId: cellId,
								container: outputNode,
								isShadow: true,
								originalRange: shadowSelection.getRangeAt(0)
							});
						}
					}

					const anchorNode = selection?.anchorNode?.parentElement;

					if (anchorNode) {
						const lastEl: any = matches.length ? matches[matches.length - 1] : null;

						if (lastEl && lastEl.container.contains(anchorNode) && options.includeOutput) {
							matches.push({
								type: lastEl.type,
								id: lastEl.id,
								cellId: lastEl.cellId,
								container: lastEl.container,
								isShadow: false,
								originalRange: window.getSelection()!.getRangeAt(0)
							});

						} else {
							for (let node = anchorNode as Element | null; node; node = node.parentElement) {
								if (!(node instanceof Element)) {
									break;
								}

								if (node.classList.contains('output') && options.includeOutput) {
									// inside output
									const cellId = node.parentElement?.parentElement?.id;
									if (cellId) {
										matches.push({
											type: 'output',
											id: node.id,
											cellId: cellId,
											container: node,
											isShadow: false,
											originalRange: window.getSelection()!.getRangeAt(0)
										});
									}
									break;
								}

								if (node.id === 'container' || node === document.body) {
									break;
								}
							}
						}

					} else {
						break;
					}
				}
			}
		} catch (e) {
			console.log(e);
		}

		if (matches.length && CSS.highlights) {
			_highlighter = new CSSHighlighter(matches);
		} else {
			_highlighter = new JSHighlighter(matches);
		}

		document.getSelection()?.removeAllRanges();

		viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);

		postNotebookMessage('didFind', {
			matches: matches.map((match, index) => ({
				type: match.type,
				id: match.id,
				cellId: match.cellId,
				index
			}))
		});
	};

	window.addEventListener('message', async rawEvent => {
		const event = rawEvent as ({ data: webviewMessages.ToWebviewMessage });

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
				viewModel.showMarkupCell(event.data.id, event.data.top, event.data.content, event.data.metadata);
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
				const { outputId, cellTop, cellId, content } = event.data;
				outputRunner.enqueue(outputId, () => {
					viewModel.showOutput(cellId, outputId, cellTop);
					if (content) {
						viewModel.updateAndRerender(cellId, outputId, content);
					}
				});
				break;
			}
			case 'ack-dimension': {
				for (const { cellId, outputId, height } of event.data.updates) {
					viewModel.updateOutputHeight(cellId, outputId, height);
				}
				break;
			}
			case 'preload': {
				const resources = event.data.resources;
				for (const { uri, originalUri } of resources) {
					kernelPreloads.load(uri, originalUri);
				}
				break;
			}
			case 'updateRenderers': {
				const { rendererData } = event.data;
				renderers.updateRendererData(rendererData);
				break;
			}
			case 'focus-output':
				focusFirstFocusableInCell(event.data.cellId);
				break;
			case 'decorations': {
				let outputContainer = document.getElementById(event.data.cellId);
				if (!outputContainer) {
					viewModel.ensureOutputCell(event.data.cellId, -100000, true);
					outputContainer = document.getElementById(event.data.cellId);
				}
				outputContainer?.classList.add(...event.data.addedClassNames);
				outputContainer?.classList.remove(...event.data.removedClassNames);
				break;
			}
			case 'customKernelMessage':
				onDidReceiveKernelMessage.fire(event.data.message);
				break;
			case 'customRendererMessage':
				renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
				break;
			case 'notebookStyles': {
				const documentStyle = document.documentElement.style;

				for (let i = documentStyle.length - 1; i >= 0; i--) {
					const property = documentStyle[i];

					// Don't remove properties that the webview might have added separately
					if (property && property.startsWith('--notebook-')) {
						documentStyle.removeProperty(property);
					}
				}

				// Re-add new properties
				for (const [name, value] of Object.entries(event.data.styles)) {
					documentStyle.setProperty(`--${name}`, value);
				}
				break;
			}
			case 'notebookOptions':
				currentOptions = event.data.options;
				viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
				break;
			case 'updateWorkspaceTrust': {
				isWorkspaceTrusted = event.data.isTrusted;
				viewModel.rerender();
				break;
			}
			case 'tokenizedCodeBlock': {
				const { codeBlockId, html } = event.data;
				MarkdownCodeBlock.highlightCodeBlock(codeBlockId, html);
				break;
			}
			case 'tokenizedStylesChanged': {
				if (tokenizationStyleElement) {
					tokenizationStyleElement.textContent = event.data.css;
				}
				break;
			}
			case 'find': {
				_highlighter?.dispose();
				find(event.data.query, event.data.options);
				break;
			}
			case 'findHighlight': {
				_highlighter?.highlightCurrentMatch(event.data.index);
				break;
			}
			case 'findUnHighlight': {
				_highlighter?.unHighlightCurrentMatch(event.data.index);
				break;
			}
			case 'findStop': {
				_highlighter?.dispose();
				break;
			}
		}
	});

	class Renderer {
		constructor(
			public readonly data: webviewMessages.RendererMetadata,
			private readonly loadExtension: (id: string) => Promise<void>,
		) { }

		private _onMessageEvent = createEmitter();
		private _loadPromise?: Promise<rendererApi.RendererApi | undefined>;
		private _api: rendererApi.RendererApi | undefined;

		public get api() { return this._api; }

		public load(): Promise<rendererApi.RendererApi | undefined> {
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
				},
				settings: {
					get lineLimit() { return lineLimit; },
				}
			};

			if (messaging) {
				context.onDidReceiveMessage = this._onMessageEvent.event;
				context.postMessage = message => postNotebookMessage('customRendererMessage', { rendererId: id, message });
			}

			return context;
		}

		/** Inner function cached in the _loadPromise(). */
		private async _load(): Promise<rendererApi.RendererApi | undefined> {
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

	type ExtendedRendererApi = rendererApi.RendererApi & {
		renderOutputItem(outputItem: rendererApi.OutputItem, element: HTMLElement, signal: AbortSignal): void | Promise<void>;
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

		private rendererEqual(a: webviewMessages.RendererMetadata, b: webviewMessages.RendererMetadata) {
			if (a.entrypoint !== b.entrypoint || a.id !== b.id || a.extends !== b.extends || a.messaging !== b.messaging) {
				return false;
			}

			if (a.mimeTypes.length !== b.mimeTypes.length) {
				return false;
			}

			for (let i = 0; i < a.mimeTypes.length; i++) {
				if (a.mimeTypes[i] !== b.mimeTypes[i]) {
					return false;
				}
			}

			return true;
		}

		public updateRendererData(rendererData: readonly webviewMessages.RendererMetadata[]) {
			const oldKeys = new Set(this._renderers.keys());
			const newKeys = new Set(rendererData.map(d => d.id));

			for (const renderer of rendererData) {
				const existing = this._renderers.get(renderer.id);
				if (existing && this.rendererEqual(existing.data, renderer)) {
					continue;
				}

				this._renderers.set(renderer.id, new Renderer(renderer, async (extensionId) => {
					const ext = this._renderers.get(extensionId);
					if (!ext) {
						throw new Error(`Could not find extending renderer: ${extensionId}`);
					}
					await ext.load();
				}));
			}

			for (const key of oldKeys) {
				if (!newKeys.has(key)) {
					this._renderers.delete(key);
				}
			}
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

		public async render(info: rendererApi.OutputItem, element: HTMLElement, signal: AbortSignal): Promise<void> {
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

			const renderer = await renderers[0].load();
			if (renderer) {
				await (renderer as ExtendedRendererApi).renderOutputItem(info, element, signal);
			}
		}
	}();

	const viewModel = new class ViewModel {

		private readonly _markupCells = new Map<string, MarkupCell>();
		private readonly _outputCells = new Map<string, OutputCell>();

		public clearAll() {
			for (const cell of this._markupCells.values()) {
				cell.dispose();
			}
			this._markupCells.clear();

			for (const output of this._outputCells.values()) {
				output.dispose();
			}
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

			const cell = new MarkupCell(init.cellId, init.mime, init.content, top, init.metadata);
			cell.element.style.visibility = visible ? 'visible' : 'hidden';
			this._markupCells.set(init.cellId, cell);

			await cell.ready;
			return cell;
		}

		public async ensureMarkupCell(info: webviewMessages.IMarkupCellInitialization): Promise<void> {
			let cell = this._markupCells.get(info.cellId);
			if (cell) {
				cell.element.style.visibility = info.visible ? 'visible' : 'hidden';
				await cell.updateContentAndRender(info.content, info.metadata);
			} else {
				cell = await this.createMarkupCell(info, info.offset, info.visible);
			}
		}

		public deleteMarkupCell(id: string) {
			const cell = this.getExpectedMarkupCell(id);
			if (cell) {
				cell.remove();
				cell.dispose();
				this._markupCells.delete(id);
			}
		}

		public async updateMarkupContent(id: string, newContent: string, metadata: NotebookCellMetadata): Promise<void> {
			const cell = this.getExpectedMarkupCell(id);
			await cell?.updateContentAndRender(newContent, metadata);
		}

		public showMarkupCell(id: string, top: number, newContent: string | undefined, metadata: NotebookCellMetadata | undefined): void {
			const cell = this.getExpectedMarkupCell(id);
			cell?.show(top, newContent, metadata);
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

		public updateMarkupScrolls(markupCells: readonly webviewMessages.IMarkupCellScrollTops[]) {
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

			const cellOutput = this.ensureOutputCell(data.cellId, data.cellTop, false);
			const outputNode = cellOutput.createOutputElement(data.outputId, data.outputOffset, data.left, data.cellId);
			outputNode.render(data.content, preloadsAndErrors);

			// don't hide until after this step so that the height is right
			cellOutput.element.style.visibility = data.initiallyHidden ? 'hidden' : 'visible';
		}

		public ensureOutputCell(cellId: string, cellTop: number, skipCellTopUpdateIfExist: boolean): OutputCell {
			let cell = this._outputCells.get(cellId);
			const existed = !!cell;
			if (!cell) {
				cell = new OutputCell(cellId);
				this._outputCells.set(cellId, cell);
			}

			if (existed && skipCellTopUpdateIfExist) {
				return cell;
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

		public updateAndRerender(cellId: string, outputId: string, content: webviewMessages.ICreationContent) {
			const cell = this._outputCells.get(cellId);
			cell?.updateContentAndRerender(outputId, content);
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

	class MarkdownCodeBlock {
		private static pendingCodeBlocksToHighlight = new Map<string, HTMLElement>();

		public static highlightCodeBlock(id: string, html: string) {
			const el = MarkdownCodeBlock.pendingCodeBlocksToHighlight.get(id);
			if (!el) {
				return;
			}
			const trustedHtml = ttPolicy?.createHTML(html) ?? html;
			el.innerHTML = trustedHtml as string;
			if (tokenizationStyleElement) {
				el.insertAdjacentElement('beforebegin', tokenizationStyleElement.cloneNode(true) as HTMLElement);
			}
		}

		public static requestHighlightCodeBlock(root: HTMLElement | ShadowRoot) {
			const codeBlocks: Array<{ value: string; lang: string; id: string }> = [];
			let i = 0;
			for (const el of root.querySelectorAll('.vscode-code-block')) {
				const lang = el.getAttribute('data-vscode-code-block-lang');
				if (el.textContent && lang) {
					const id = `${Date.now()}-${i++}`;
					codeBlocks.push({ value: el.textContent, lang: lang, id });
					MarkdownCodeBlock.pendingCodeBlocksToHighlight.set(id, el as HTMLElement);
				}
			}

			return codeBlocks;
		}
	}

	class MarkupCell {

		public readonly ready: Promise<void>;

		public readonly id: string;
		public readonly element: HTMLElement;

		private readonly outputItem: rendererApi.OutputItem;

		/// Internal field that holds text content
		private _content: { readonly value: string; readonly version: number; readonly metadata: NotebookCellMetadata };

		private renderTaskAbort?: AbortController;

		constructor(id: string, mime: string, content: string, top: number, metadata: NotebookCellMetadata) {
			const self = this;
			this.id = id;
			this._content = { value: content, version: 0, metadata: metadata };

			let resolveReady: () => void;
			this.ready = new Promise<void>(r => resolveReady = r);

			let cachedData: { readonly version: number; readonly value: Uint8Array } | undefined;
			this.outputItem = Object.freeze(<rendererApi.OutputItem>{
				id,
				mime,

				get metadata(): NotebookCellMetadata {
					return self._content.metadata;
				},

				text: (): string => {
					return this._content.value;
				},

				json: () => {
					return undefined;
				},

				data: (): Uint8Array => {
					if (cachedData?.version === this._content.version) {
						return cachedData.value;
					}

					const data = textEncoder.encode(this._content.value);
					cachedData = { version: this._content.version, value: data };
					return data;
				},

				blob(): Blob {
					return new Blob([this.data()], { type: this.mime });
				}
			});

			const root = document.getElementById('container')!;
			const markupCell = document.createElement('div');
			markupCell.className = 'markup';
			markupCell.style.position = 'absolute';
			markupCell.style.width = '100%';

			this.element = document.createElement('div');
			this.element.id = this.id;
			this.element.classList.add('preview');
			this.element.style.position = 'absolute';
			this.element.style.top = top + 'px';
			this.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);
			markupCell.appendChild(this.element);
			root.appendChild(markupCell);

			this.addEventListeners();

			this.updateContentAndRender(this._content.value, this._content.metadata).then(() => {
				resizeObserver.observe(this.element, this.id, false, this.id);
				resolveReady();
			});
		}

		public dispose() {
			this.renderTaskAbort?.abort();
			this.renderTaskAbort = undefined;
		}

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

		public async updateContentAndRender(newContent: string, metadata: NotebookCellMetadata): Promise<void> {
			this._content = { value: newContent, version: this._content.version + 1, metadata };

			this.renderTaskAbort?.abort();

			const controller = new AbortController();
			this.renderTaskAbort = controller;
			try {
				await renderers.render(this.outputItem, this.element, this.renderTaskAbort.signal);
			} finally {
				if (this.renderTaskAbort === controller) {
					this.renderTaskAbort = undefined;
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

			const codeBlocks: Array<{ value: string; lang: string; id: string }> = MarkdownCodeBlock.requestHighlightCodeBlock(root);

			postNotebookMessage<webviewMessages.IRenderedMarkupMessage>('renderedMarkup', {
				cellId: this.id,
				html: html.join(''),
				codeBlocks
			});

			dimensionUpdater.updateHeight(this.id, this.element.offsetHeight, {
				isOutput: false
			});
		}

		public show(top: number, newContent: string | undefined, metadata: NotebookCellMetadata | undefined): void {
			this.element.style.visibility = 'visible';
			this.element.style.top = `${top}px`;
			if (typeof newContent === 'string' || metadata) {
				this.updateContentAndRender(newContent ?? this._content.value, metadata ?? this._content.metadata);
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
			this.updateContentAndRender(this._content.value, this._content.metadata);
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

		public dispose() {
			for (const output of this.outputElements.values()) {
				output.dispose();
			}
			this.outputElements.clear();
		}

		public createOutputElement(outputId: string, outputOffset: number, left: number, cellId: string): OutputElement {
			let outputContainer = this.outputElements.get(outputId);
			if (!outputContainer) {
				outputContainer = new OutputContainer(outputId);
				this.element.appendChild(outputContainer.element);
				this.outputElements.set(outputId, outputContainer);
			}

			return outputContainer.createOutputElement(outputId, outputOffset, left, cellId);
		}

		public clearOutput(outputId: string, rendererId: string | undefined) {
			const output = this.outputElements.get(outputId);
			output?.clear(rendererId);
			output?.dispose();
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

		public updateContentAndRerender(outputId: string, content: webviewMessages.ICreationContent) {
			this.outputElements.get(outputId)?.updateContentAndRender(content);
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

		public dispose() {
			this._outputNode?.dispose();
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

		public createOutputElement(outputId: string, outputOffset: number, left: number, cellId: string): OutputElement {
			this.element.innerText = '';
			this.element.style.maxHeight = '0px';
			this.element.style.top = `${outputOffset}px`;

			this._outputNode?.dispose();
			this._outputNode = new OutputElement(outputId, left, cellId);
			this.element.appendChild(this._outputNode.element);
			return this._outputNode;
		}

		public rerender() {
			this._outputNode?.rerender();
		}

		public updateContentAndRender(content: webviewMessages.ICreationContent) {
			this._outputNode?.updateAndRerender(content);
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
		private _content?: { content: webviewMessages.ICreationContent; preloadsAndErrors: unknown[] };
		private hasResizeObserver = false;

		private renderTaskAbort?: AbortController;

		constructor(
			private readonly outputId: string,
			left: number,
			public readonly cellId: string
		) {
			this.element = document.createElement('div');
			this.element.id = outputId;
			this.element.classList.add('output');
			this.element.style.position = 'absolute';
			this.element.style.top = `0px`;
			this.element.style.left = left + 'px';
			this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;

			this.element.addEventListener('mouseenter', () => {
				postNotebookMessage<webviewMessages.IMouseEnterMessage>('mouseenter', { id: outputId });
			});
			this.element.addEventListener('mouseleave', () => {
				postNotebookMessage<webviewMessages.IMouseLeaveMessage>('mouseleave', { id: outputId });
			});
		}

		public dispose() {
			this.renderTaskAbort?.abort();
			this.renderTaskAbort = undefined;
		}

		public async render(content: webviewMessages.ICreationContent, preloadsAndErrors: unknown[]) {
			this.renderTaskAbort?.abort();
			this.renderTaskAbort = undefined;

			this._content = { content, preloadsAndErrors };
			if (content.type === 0 /* RenderOutputType.Html */) {
				const trustedHtml = ttPolicy?.createHTML(content.htmlContent) ?? content.htmlContent;
				this.element.innerHTML = trustedHtml as string;
				domEval(this.element);
			} else if (preloadsAndErrors.some(e => e instanceof Error)) {
				const errors = preloadsAndErrors.filter((e): e is Error => e instanceof Error);
				showPreloadErrors(this.element, ...errors);
			} else {
				const rendererApi = preloadsAndErrors[0] as ExtendedRendererApi;
				try {
					const item = createOutputItem(this.outputId, content.mimeType, content.metadata, content.valueBytes);

					const controller = new AbortController();
					this.renderTaskAbort = controller;
					try {
						await rendererApi.renderOutputItem(item, this.element, this.renderTaskAbort.signal);
					} finally {
						if (this.renderTaskAbort === controller) {
							this.renderTaskAbort = undefined;
						}
					}
				} catch (e) {
					showPreloadErrors(this.element, e);
				}
			}

			if (!this.hasResizeObserver) {
				this.hasResizeObserver = true;
				resizeObserver.observe(this.element, this.outputId, true, this.cellId);
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

			const root = this.element.shadowRoot ?? this.element;
			const codeBlocks: Array<{ value: string; lang: string; id: string }> = MarkdownCodeBlock.requestHighlightCodeBlock(root);

			if (codeBlocks.length > 0) {
				postNotebookMessage<webviewMessages.IRenderedCellOutputMessage>('renderedCellOutput', {
					codeBlocks
				});
			}
		}

		public rerender() {
			if (this._content) {
				this.render(this._content.content, this._content.preloadsAndErrors);
			}
		}

		public updateAndRerender(content: webviewMessages.ICreationContent) {
			if (this._content) {
				this._content.content = content;
				this.render(this._content.content, this._content.preloadsAndErrors);
			}
		}
	}

	const markupCellDragManager = new class MarkupCellDragManager {

		private currentDrag: { cellId: string; clientY: number } | undefined;

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

export function preloadsScriptStr(styleValues: PreloadStyles, options: PreloadOptions, renderers: readonly webviewMessages.RendererMetadata[], isWorkspaceTrusted: boolean, lineLimit: number, nonce: string) {
	const ctx: PreloadContext = {
		style: styleValues,
		options,
		rendererData: renderers,
		isWorkspaceTrusted,
		lineLimit,
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
