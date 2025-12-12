/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from '../../../../../../base/common/event.js';
import type { IDisposable } from '../../../../../../base/common/lifecycle.js';
import type * as webviewMessages from './webviewMessages.js';
import type { NotebookCellMetadata } from '../../../common/notebookCommon.js';
import type * as rendererApi from 'vscode-notebook-renderer';
import type { NotebookCellOutputTransferData } from '../../../../../../platform/dnd/browser/dnd.js';

// !! IMPORTANT !! ----------------------------------------------------------------------------------
// import { RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
// We can ONLY IMPORT as type in this module. This also applies to const enums that would evaporate
// in normal compiles but remain a dependency in transpile-only compiles
// !! IMPORTANT !! ----------------------------------------------------------------------------------

// !! IMPORTANT !! everything must be in-line within the webviewPreloads
// function. Imports are not allowed. This is stringified and injected into
// the webview.

declare namespace globalThis {
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
	readonly event: Event<T>;
}

interface PreloadStyles {
	readonly outputNodePadding: number;
	readonly outputNodeLeftPadding: number;
	readonly tokenizationCss: string;
}

export interface PreloadOptions {
	dragAndDropEnabled: boolean;
}

export interface RenderOptions {
	readonly lineLimit: number;
	readonly outputScrolling: boolean;
	readonly outputWordWrap: boolean;
	readonly linkifyFilePaths: boolean;
	readonly minimalError: boolean;
}

interface PreloadContext {
	readonly nonce: string;
	readonly style: PreloadStyles;
	readonly options: PreloadOptions;
	readonly renderOptions: RenderOptions;
	readonly rendererData: readonly webviewMessages.RendererMetadata[];
	readonly staticPreloadsData: readonly webviewMessages.StaticPreloadMetadata[];
	readonly isWorkspaceTrusted: boolean;
}

declare function requestIdleCallback(callback: (args: IdleDeadline) => void, options?: { timeout: number }): number;
declare function cancelIdleCallback(handle: number): void;

declare function __import(path: string): Promise<any>;

async function webviewPreloads(ctx: PreloadContext) {

	/* eslint-disable no-restricted-globals, no-restricted-syntax */

	// The use of global `window` should be fine in this context, even
	// with aux windows. This code is running from within an `iframe`
	// where there is only one `window` object anyway.

	const userAgent = navigator.userAgent;
	const isChrome = (userAgent.indexOf('Chrome') >= 0);
	const textEncoder = new TextEncoder();
	const textDecoder = new TextDecoder();

	function promiseWithResolvers<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (err?: any) => void } {
		let resolve: (value: T | PromiseLike<T>) => void;
		let reject: (reason?: any) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve: resolve!, reject: reject! };
	}

	let currentOptions = ctx.options;
	const isWorkspaceTrusted = ctx.isWorkspaceTrusted;
	let currentRenderOptions = ctx.renderOptions;
	const settingChange: EmitterLike<RenderOptions> = createEmitter<RenderOptions>();

	const acquireVsCodeApi = globalThis.acquireVsCodeApi;
	const vscode = acquireVsCodeApi();
	delete (globalThis as { acquireVsCodeApi: unknown }).acquireVsCodeApi;

	const tokenizationStyle = new CSSStyleSheet();
	tokenizationStyle.replaceSync(ctx.style.tokenizationCss);

	const runWhenIdle: (callback: (idle: IdleDeadline) => void, timeout?: number) => IDisposable = (typeof requestIdleCallback !== 'function' || typeof cancelIdleCallback !== 'function')
		? (runner) => {
			setTimeout(() => {
				if (disposed) {
					return;
				}
				const end = Date.now() + 15; // one frame at 64fps
				runner(Object.freeze({
					didTimeout: true,
					timeRemaining() {
						return Math.max(0, end - Date.now());
					}
				}));
			});
			let disposed = false;
			return {
				dispose() {
					if (disposed) {
						return;
					}
					disposed = true;
				}
			};
		}
		: (runner, timeout?) => {
			const handle: number = requestIdleCallback(runner, typeof timeout === 'number' ? { timeout } : undefined);
			let disposed = false;
			return {
				dispose() {
					if (disposed) {
						return;
					}
					disposed = true;
					cancelIdleCallback(handle);
				}
			};
		};
	function getOutputContainer(event: FocusEvent | MouseEvent) {
		for (const node of event.composedPath()) {
			if (node instanceof HTMLElement && node.classList.contains('output')) {
				return {
					id: node.id
				};
			}
		}
		return;
	}
	let lastFocusedOutput: { id: string } | undefined = undefined;
	const handleOutputFocusOut = (event: FocusEvent) => {
		const outputFocus = event && getOutputContainer(event);
		if (!outputFocus) {
			return;
		}
		// Possible we're tabbing through the elements of the same output.
		// Lets see if focus is set back to the same output.
		lastFocusedOutput = undefined;
		setTimeout(() => {
			if (lastFocusedOutput?.id === outputFocus.id) {
				return;
			}
			postNotebookMessage<webviewMessages.IOutputBlurMessage>('outputBlur', outputFocus);
		}, 0);
	};

	const hasActiveEditableElement = (
		parent: Node | DocumentFragment,
		root: ShadowRoot | Document = document
	): boolean => {
		const element = root.activeElement;
		return !!(element && parent.contains(element)
			&& (element.matches(':read-write') || element.tagName.toLowerCase() === 'select'
				|| (element.shadowRoot && hasActiveEditableElement(element.shadowRoot, element.shadowRoot)))
		);
	};

	// check if an input element is focused within the output element
	const checkOutputInputFocus = (e: FocusEvent) => {
		lastFocusedOutput = getOutputContainer(e);
		const activeElement = window.document.activeElement;
		if (!activeElement) {
			return;
		}

		const id = lastFocusedOutput?.id;
		if (id && (hasActiveEditableElement(activeElement, window.document))) {
			postNotebookMessage<webviewMessages.IOutputInputFocusMessage>('outputInputFocus', { inputFocused: true, id });

			activeElement.addEventListener('blur', () => {
				postNotebookMessage<webviewMessages.IOutputInputFocusMessage>('outputInputFocus', { inputFocused: false, id });
			}, { once: true });
		}
	};

	const handleInnerClick = (event: MouseEvent) => {
		if (!event || !event.view || !event.view.document) {
			return;
		}

		const outputFocus = lastFocusedOutput = getOutputContainer(event);
		for (const node of event.composedPath()) {
			if (node instanceof HTMLAnchorElement && node.href) {
				if (node.href.startsWith('blob:')) {
					if (outputFocus) {
						postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', outputFocus);
					}

					handleBlobUrlClick(node.href, node.download);
				} else if (node.href.startsWith('data:')) {
					if (outputFocus) {
						postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', outputFocus);
					}
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
						if (href.startsWith('command:') && outputFocus) {
							postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', outputFocus);
						}
						postNotebookMessage<webviewMessages.IClickedLinkMessage>('clicked-link', { href });
					}
				}

				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}

		if (outputFocus) {
			postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', outputFocus);
		}
	};

	const blurOutput = () => {
		const selection = window.getSelection();
		if (!selection) {
			return;
		}
		selection.removeAllRanges();
	};

	const selectOutputContents = (cellOrOutputId: string) => {
		const selection = window.getSelection();
		if (!selection) {
			return;
		}
		const cellOutputContainer = window.document.getElementById(cellOrOutputId);
		if (!cellOutputContainer) {
			return;
		}
		selection.removeAllRanges();
		const range = document.createRange();
		range.selectNode(cellOutputContainer);
		selection.addRange(range);

	};

	const selectInputContents = (cellOrOutputId: string) => {
		const cellOutputContainer = window.document.getElementById(cellOrOutputId);
		if (!cellOutputContainer) {
			return;
		}
		const activeElement = window.document.activeElement;
		if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
			(activeElement as HTMLInputElement).select();
		}
	};

	const onPageUpDownSelectionHandler = (e: KeyboardEvent) => {
		if (!lastFocusedOutput?.id || !e.shiftKey) {
			return;
		}

		// If we're pressing `Shift+Up/Down` then we want to select a line at a time.
		if (e.shiftKey && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
			e.stopPropagation(); // We don't want the notebook to handle this, default behavior is what we need.
			return;
		}

		// We want to handle just `Shift + PageUp/PageDown` & `Shift + Cmd + ArrowUp/ArrowDown` (for mac)
		if (!(e.code === 'PageUp' || e.code === 'PageDown') && !(e.metaKey && (e.code === 'ArrowDown' || e.code === 'ArrowUp'))) {
			return;
		}
		const outputContainer = window.document.getElementById(lastFocusedOutput.id);
		const selection = window.getSelection();
		if (!outputContainer || !selection?.anchorNode) {
			return;
		}
		const activeElement = window.document.activeElement;
		if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
			// Leave for default behavior.
			return;
		}

		// These should change the scroll position, not adjust the selected cell in the notebook
		e.stopPropagation(); // We don't want the notebook to handle this.
		e.preventDefault(); // We will handle selection.

		const { anchorNode, anchorOffset } = selection;
		const range = document.createRange();
		if (e.code === 'PageDown' || e.code === 'ArrowDown') {
			range.setStart(anchorNode, anchorOffset);
			range.setEnd(outputContainer, 1);
		}
		else {
			range.setStart(outputContainer, 0);
			range.setEnd(anchorNode, anchorOffset);
		}
		selection.removeAllRanges();
		selection.addRange(range);
	};

	const disableNativeSelectAll = (e: KeyboardEvent) => {
		if (!lastFocusedOutput?.id) {
			return;
		}
		const activeElement = window.document.activeElement;
		if (activeElement && hasActiveEditableElement(activeElement, window.document)) {
			// The input element will handle this.
			return;
		}

		if ((e.key === 'a' && e.ctrlKey) || (e.metaKey && e.key === 'a')) {
			e.preventDefault(); // We will handle selection in editor code.
			return;
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

	window.document.body.addEventListener('click', handleInnerClick);
	window.document.body.addEventListener('focusin', checkOutputInputFocus);
	window.document.body.addEventListener('focusout', handleOutputFocusOut);
	window.document.body.addEventListener('keydown', onPageUpDownSelectionHandler);
	window.document.body.addEventListener('keydown', disableNativeSelectAll);

	interface RendererContext extends rendererApi.RendererContext<unknown> {
		readonly onDidChangeSettings: Event<RenderOptions>;
		readonly settings: RenderOptions;
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
		return Object.freeze({
			onDidReceiveKernelMessage: onDidReceiveKernelMessage.event,
			postKernelMessage: (data: unknown) => postNotebookMessage('customKernelMessage', { message: data }),
		});
	}

	async function runKernelPreload(url: string): Promise<void> {
		try {
			return await activateModuleKernelPreload(url);
		} catch (e) {
			console.error(e);
			throw e;
		}
	}

	async function activateModuleKernelPreload(url: string) {
		const module: KernelPreloadModule = await __import(url);
		if (!module.activate) {
			console.error(`Notebook preload '${url}' was expected to be a module but it does not export an 'activate' function`);
			return;
		}
		return module.activate(createKernelContext());
	}

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
					isOutput: update.isOutput
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

	function elementHasContent(height: number) {
		// we need to account for a potential 1px top and bottom border on a child within the output container
		return height > 2.1;
	}

	const resizeObserver = new class {

		private readonly _observer: ResizeObserver;

		private readonly _observedElements = new WeakMap<Element, IObservedElement>();
		private _outputResizeTimer: Timeout | undefined;

		constructor() {
			this._observer = new ResizeObserver(entries => {
				for (const entry of entries) {
					if (!window.document.body.contains(entry.target)) {
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

					const hasContent = elementHasContent(entry.contentRect.height);
					const shouldUpdatePadding =
						(hasContent && observedElementInfo.lastKnownPadding === 0) ||
						(!hasContent && observedElementInfo.lastKnownPadding !== 0);

					if (shouldUpdatePadding) {
						// Do not update dimension in resize observer
						window.requestAnimationFrame(() => {
							if (hasContent) {
								entry.target.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}px`;
							} else {
								entry.target.style.padding = `0px`;
							}
							this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
						});
					} else {
						this.updateHeight(observedElementInfo, hasContent ? entry.target.offsetHeight : 0);
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

	let previousDelta: number | undefined;
	let scrollTimeout: Timeout | undefined;
	let scrolledElement: Element | undefined;
	let lastTimeScrolled: number | undefined;
	function flagRecentlyScrolled(node: Element, deltaY?: number) {
		scrolledElement = node;
		if (deltaY === undefined) {
			lastTimeScrolled = Date.now();
			previousDelta = undefined;
			node.setAttribute('recentlyScrolled', 'true');
			clearTimeout(scrollTimeout);
			scrollTimeout = setTimeout(() => { scrolledElement?.removeAttribute('recentlyScrolled'); }, 300);
			return true;
		}

		if (node.hasAttribute('recentlyScrolled')) {
			if (lastTimeScrolled && Date.now() - lastTimeScrolled > 400) {
				// it has been a while since we actually scrolled
				// if scroll velocity increases significantly, it's likely a new scroll event
				if (!!previousDelta && deltaY < 0 && deltaY < previousDelta - 8) {
					clearTimeout(scrollTimeout);
					scrolledElement?.removeAttribute('recentlyScrolled');
					return false;
				} else if (!!previousDelta && deltaY > 0 && deltaY > previousDelta + 8) {
					clearTimeout(scrollTimeout);
					scrolledElement?.removeAttribute('recentlyScrolled');
					return false;
				}

				// the tail end of a smooth scrolling event (from a trackpad) can go on for a while
				// so keep swallowing it, but we can shorten the timeout since the events occur rapidly
				clearTimeout(scrollTimeout);
				scrollTimeout = setTimeout(() => { scrolledElement?.removeAttribute('recentlyScrolled'); }, 50);
			} else {
				clearTimeout(scrollTimeout);
				scrollTimeout = setTimeout(() => { scrolledElement?.removeAttribute('recentlyScrolled'); }, 300);
			}

			previousDelta = deltaY;
			return true;
		}

		return false;
	}

	function eventTargetShouldHandleScroll(event: WheelEvent) {
		for (let node = event.target as Node | null; node; node = node.parentNode) {
			if (!(node instanceof Element) || node.id === 'container' || node.classList.contains('cell_container') || node.classList.contains('markup') || node.classList.contains('output_container')) {
				return false;
			}

			// scroll up
			if (event.deltaY < 0 && node.scrollTop > 0) {
				// there is still some content to scroll
				flagRecentlyScrolled(node);
				return true;
			}

			// scroll down
			if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
				// per https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
				// scrollTop is not rounded but scrollHeight and clientHeight are
				// so we need to check if the difference is less than some threshold
				if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
					continue;
				}

				// if the node is not scrollable, we can continue. We don't check the computed style always as it's expensive
				if (window.getComputedStyle(node).overflowY === 'hidden' || window.getComputedStyle(node).overflowY === 'visible') {
					continue;
				}

				flagRecentlyScrolled(node);
				return true;
			}

			if (flagRecentlyScrolled(node, event.deltaY)) {
				return true;
			}
		}

		return false;
	}

	const handleWheel = (event: WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number; wheelDelta?: number }) => {
		if (event.defaultPrevented || eventTargetShouldHandleScroll(event)) {
			return;
		}
		postNotebookMessage<webviewMessages.IWheelMessage>('did-scroll-wheel', {
			payload: {
				deltaMode: event.deltaMode,
				deltaX: event.deltaX,
				deltaY: event.deltaY,
				deltaZ: event.deltaZ,
				// Refs https://github.com/microsoft/vscode/issues/146403#issuecomment-1854538928
				wheelDelta: event.wheelDelta && isChrome ? (event.wheelDelta / window.devicePixelRatio) : event.wheelDelta,
				wheelDeltaX: event.wheelDeltaX && isChrome ? (event.wheelDeltaX / window.devicePixelRatio) : event.wheelDeltaX,
				wheelDeltaY: event.wheelDeltaY && isChrome ? (event.wheelDeltaY / window.devicePixelRatio) : event.wheelDeltaY,
				detail: event.detail,
				shiftKey: event.shiftKey,
				type: event.type
			}
		});
	};

	function focusFirstFocusableOrContainerInOutput(cellOrOutputId: string, alternateId?: string) {
		const cellOutputContainer = window.document.getElementById(cellOrOutputId) ??
			(alternateId ? window.document.getElementById(alternateId) : undefined);
		if (cellOutputContainer) {
			if (cellOutputContainer.contains(window.document.activeElement)) {
				return;
			}
			const id = cellOutputContainer.id;
			let focusableElement = cellOutputContainer.querySelector('[tabindex="0"], [href], button, input, option, select, textarea') as HTMLElement | null;
			if (!focusableElement) {
				focusableElement = cellOutputContainer;
				focusableElement.tabIndex = -1;
				postNotebookMessage<webviewMessages.IOutputInputFocusMessage>('outputInputFocus', { inputFocused: false, id });
			} else {
				const inputFocused = hasActiveEditableElement(focusableElement, focusableElement.ownerDocument);
				postNotebookMessage<webviewMessages.IOutputInputFocusMessage>('outputInputFocus', { inputFocused, id });
			}

			lastFocusedOutput = cellOutputContainer;
			postNotebookMessage<webviewMessages.IOutputFocusMessage>('outputFocus', { id: cellOutputContainer.id });
			focusableElement.focus();
		}
	}

	function createFocusSink(cellId: string, focusNext?: boolean) {
		const element = document.createElement('div');
		element.id = `focus-sink-${cellId}`;
		element.tabIndex = 0;
		element.addEventListener('focus', () => {
			postNotebookMessage<webviewMessages.IFocusEditorMessage>('focus-editor', {
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
				highlightElement.replaceWith(highlightElement.firstChild!);
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
						window.document.execCommand('removeFormat', false, undefined);
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
						window.document.execCommand('removeFormat', false, undefined);
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

	function showRenderError(errorText: string, outputNode: HTMLElement, errors: readonly Error[]) {
		outputNode.innerText = errorText;
		const errList = document.createElement('ul');
		for (const result of errors) {
			console.error(result);
			const item = document.createElement('li');
			item.innerText = result.message;
			errList.appendChild(item);
		}
		outputNode.appendChild(errList);
	}

	const outputItemRequests = new class {
		private _requestPool = 0;
		private readonly _requests = new Map</*requestId*/number, { resolve: (x: webviewMessages.OutputItemEntry | undefined) => void }>();

		getOutputItem(outputId: string, mime: string) {
			const requestId = this._requestPool++;

			const { promise, resolve } = promiseWithResolvers<webviewMessages.OutputItemEntry | undefined>();
			this._requests.set(requestId, { resolve });

			postNotebookMessage<webviewMessages.IGetOutputItemMessage>('getOutputItem', { requestId, outputId, mime });
			return promise;
		}

		resolveOutputItem(requestId: number, output: webviewMessages.OutputItemEntry | undefined) {
			const request = this._requests.get(requestId);
			if (!request) {
				return;
			}

			this._requests.delete(requestId);
			request.resolve(output);
		}
	};

	interface AdditionalOutputItemInfo {
		readonly mime: string;
		getItem(): Promise<rendererApi.OutputItem | undefined>;
	}

	interface ExtendedOutputItem extends rendererApi.OutputItem {
		readonly _allOutputItems: ReadonlyArray<AdditionalOutputItemInfo>;
		appendedText?(): string | undefined;
	}

	let hasWarnedAboutAllOutputItemsProposal = false;

	function createOutputItem(
		id: string,
		mime: string,
		metadata: unknown,
		valueBytes: Uint8Array,
		allOutputItemData: ReadonlyArray<{ readonly mime: string }>,
		appended?: { valueBytes: Uint8Array; previousVersion: number }
	): ExtendedOutputItem {

		function create(
			id: string,
			mime: string,
			metadata: unknown,
			valueBytes: Uint8Array,
			appended?: { valueBytes: Uint8Array; previousVersion: number }
		): ExtendedOutputItem {
			return Object.freeze<ExtendedOutputItem>({
				id,
				mime,
				metadata,

				appendedText(): string | undefined {
					if (appended) {
						return textDecoder.decode(appended.valueBytes);
					}
					return undefined;
				},

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
					return new Blob([valueBytes as Uint8Array<ArrayBuffer>], { type: this.mime });
				},

				get _allOutputItems() {
					if (!hasWarnedAboutAllOutputItemsProposal) {
						hasWarnedAboutAllOutputItemsProposal = true;
						console.warn(`'_allOutputItems' is proposed API. DO NOT ship an extension that depends on it!`);
					}
					return allOutputItemList;
				},
			});
		}

		const allOutputItemCache = new Map</*mime*/string, Promise<(rendererApi.OutputItem & ExtendedOutputItem) | undefined>>();
		const allOutputItemList = Object.freeze(allOutputItemData.map(outputItem => {
			const mime = outputItem.mime;
			return Object.freeze({
				mime,
				getItem() {
					const existingTask = allOutputItemCache.get(mime);
					if (existingTask) {
						return existingTask;
					}

					const task = outputItemRequests.getOutputItem(id, mime).then(item => {
						return item ? create(id, item.mime, metadata, item.valueBytes) : undefined;
					});
					allOutputItemCache.set(mime, task);

					return task;
				}
			});
		}));

		const item = create(id, mime, metadata, valueBytes, appended);
		allOutputItemCache.set(mime, Promise.resolve(item));
		return item;
	}

	const onDidReceiveKernelMessage = createEmitter<unknown>();

	const ttPolicy = window.trustedTypes?.createPolicy('notebookRenderer', {
		createHTML: value => value, // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
		createScript: value => value, // CodeQL [SM03712] The rendered content is provided by renderer extensions, which are responsible for sanitizing their content themselves. The notebook webview is also sandboxed.
	});

	window.addEventListener('wheel', handleWheel);

	interface IFindMatch {
		type: 'preview' | 'output';
		id: string;
		cellId: string;
		container: Node;
		originalRange: Range;
		isShadow: boolean;
		searchPreviewInfo?: ISearchPreviewInfo;
		highlightResult?: IHighlightResult;
	}

	interface ISearchPreviewInfo {
		line: string;
		range: {
			start: number;
			end: number;
		};
	}

	interface IHighlighter {
		addHighlights(matches: IFindMatch[], ownerID: string): void;
		removeHighlights(ownerID: string): void;
		highlightCurrentMatch(index: number, ownerID: string): void;
		unHighlightCurrentMatch(index: number, ownerID: string): void;
		dispose(): void;
	}

	interface IHighlightInfo {
		matches: IFindMatch[];
		currentMatchIndex: number;
	}

	const matchColor = window.getComputedStyle(window.document.getElementById('_defaultColorPalatte')!).color;
	const currentMatchColor = window.getComputedStyle(window.document.getElementById('_defaultColorPalatte')!).backgroundColor;

	class JSHighlighter implements IHighlighter {
		private _activeHighlightInfo: Map<string, IHighlightInfo>;

		constructor(
		) {
			this._activeHighlightInfo = new Map();
		}

		addHighlights(matches: IFindMatch[], ownerID: string): void {
			for (let i = matches.length - 1; i >= 0; i--) {
				const match = matches[i];
				const ret = highlightRange(match.originalRange, true, 'mark', match.isShadow ? {
					'style': 'background-color: ' + matchColor + ';',
				} : {
					'class': 'find-match'
				});
				match.highlightResult = ret;
			}

			const highlightInfo: IHighlightInfo = {
				matches,
				currentMatchIndex: -1
			};
			this._activeHighlightInfo.set(ownerID, highlightInfo);
		}

		removeHighlights(ownerID: string): void {
			this._activeHighlightInfo.get(ownerID)?.matches.forEach(match => {
				match.highlightResult?.dispose();
			});
			this._activeHighlightInfo.delete(ownerID);
		}

		highlightCurrentMatch(index: number, ownerID: string) {
			const highlightInfo = this._activeHighlightInfo.get(ownerID);
			if (!highlightInfo) {
				console.error('Modified current highlight match before adding highlight list.');
				return;
			}
			const oldMatch = highlightInfo.matches[highlightInfo.currentMatchIndex];
			oldMatch?.highlightResult?.update(matchColor, oldMatch.isShadow ? undefined : 'find-match');

			const match = highlightInfo.matches[index];
			highlightInfo.currentMatchIndex = index;
			const sel = window.getSelection();
			if (!!match && !!sel && match.highlightResult) {
				let offset = 0;
				try {
					const outputOffset = window.document.getElementById(match.id)!.getBoundingClientRect().top;
					const tempRange = document.createRange();
					tempRange.selectNode(match.highlightResult.range.startContainer);

					match.highlightResult.range.startContainer.parentElement?.scrollIntoView({ behavior: 'auto', block: 'end', inline: 'nearest' });

					const rangeOffset = tempRange.getBoundingClientRect().top;
					tempRange.detach();

					offset = rangeOffset - outputOffset;
				} catch (e) {
					console.error(e);
				}

				match.highlightResult?.update(currentMatchColor, match.isShadow ? undefined : 'current-find-match');

				window.document.getSelection()?.removeAllRanges();
				postNotebookMessage('didFindHighlightCurrent', {
					offset
				});
			}
		}

		unHighlightCurrentMatch(index: number, ownerID: string) {
			const highlightInfo = this._activeHighlightInfo.get(ownerID);
			if (!highlightInfo) {
				return;
			}
			const oldMatch = highlightInfo.matches[index];
			if (oldMatch && oldMatch.highlightResult) {
				oldMatch.highlightResult.update(matchColor, oldMatch.isShadow ? undefined : 'find-match');
			}
		}

		dispose() {
			window.document.getSelection()?.removeAllRanges();
			this._activeHighlightInfo.forEach(highlightInfo => {
				highlightInfo.matches.forEach(match => {
					match.highlightResult?.dispose();
				});
			});
		}
	}

	class CSSHighlighter implements IHighlighter {
		private _activeHighlightInfo: Map<string, IHighlightInfo>;
		private _matchesHighlight: Highlight;
		private _currentMatchesHighlight: Highlight;

		constructor() {
			this._activeHighlightInfo = new Map();
			this._matchesHighlight = new Highlight();
			this._matchesHighlight.priority = 1;
			this._currentMatchesHighlight = new Highlight();
			this._currentMatchesHighlight.priority = 2;
			CSS.highlights?.set(`find-highlight`, this._matchesHighlight);
			CSS.highlights?.set(`current-find-highlight`, this._currentMatchesHighlight);
		}

		_refreshRegistry(updateMatchesHighlight = true) {
			// for performance reasons, only update the full list of highlights when we need to
			if (updateMatchesHighlight) {
				this._matchesHighlight.clear();
			}

			this._currentMatchesHighlight.clear();

			this._activeHighlightInfo.forEach((highlightInfo) => {

				if (updateMatchesHighlight) {
					for (let i = 0; i < highlightInfo.matches.length; i++) {
						this._matchesHighlight.add(highlightInfo.matches[i].originalRange);
					}
				}
				if (highlightInfo.currentMatchIndex < highlightInfo.matches.length && highlightInfo.currentMatchIndex >= 0) {
					this._currentMatchesHighlight.add(highlightInfo.matches[highlightInfo.currentMatchIndex].originalRange);
				}
			});
		}

		addHighlights(
			matches: IFindMatch[],
			ownerID: string
		) {

			for (let i = 0; i < matches.length; i++) {
				this._matchesHighlight.add(matches[i].originalRange);
			}

			const newEntry: IHighlightInfo = {
				matches,
				currentMatchIndex: -1,
			};

			this._activeHighlightInfo.set(ownerID, newEntry);
		}

		highlightCurrentMatch(index: number, ownerID: string): void {
			const highlightInfo = this._activeHighlightInfo.get(ownerID);
			if (!highlightInfo) {
				console.error('Modified current highlight match before adding highlight list.');
				return;
			}

			highlightInfo.currentMatchIndex = index;
			const match = highlightInfo.matches[index];

			if (match) {
				let offset = 0;
				try {
					const outputOffset = window.document.getElementById(match.id)!.getBoundingClientRect().top;
					match.originalRange.startContainer.parentElement?.scrollIntoView({ behavior: 'auto', block: 'end', inline: 'nearest' });
					const rangeOffset = match.originalRange.getBoundingClientRect().top;
					offset = rangeOffset - outputOffset;
					postNotebookMessage('didFindHighlightCurrent', {
						offset
					});
				} catch (e) {
					console.error(e);
				}
			}
			this._refreshRegistry(false);
		}

		unHighlightCurrentMatch(index: number, ownerID: string): void {
			const highlightInfo = this._activeHighlightInfo.get(ownerID);
			if (!highlightInfo) {
				return;
			}

			highlightInfo.currentMatchIndex = -1;
		}

		removeHighlights(ownerID: string) {
			this._activeHighlightInfo.delete(ownerID);
			this._refreshRegistry();
		}

		dispose(): void {
			window.document.getSelection()?.removeAllRanges();
			this._currentMatchesHighlight.clear();
			this._matchesHighlight.clear();
		}
	}

	const _highlighter = (CSS.highlights) ? new CSSHighlighter() : new JSHighlighter();

	function extractSelectionLine(selection: Selection): ISearchPreviewInfo {
		const range = selection.getRangeAt(0);

		// we need to keep a reference to the old selection range to re-apply later
		const oldRange = range.cloneRange();
		const captureLength = selection.toString().length;

		// use selection API to modify selection to get entire line (the first line if multi-select)

		// collapse selection to start so that the cursor position is at beginning of match
		selection.collapseToStart();

		// extend selection in both directions to select the line
		selection.modify('move', 'backward', 'lineboundary');
		selection.modify('extend', 'forward', 'lineboundary');

		const line = selection.toString();

		// using the original range and the new range, we can find the offset of the match from the line start.
		const rangeStart = getStartOffset(selection.getRangeAt(0), oldRange);

		// line range for match
		const lineRange = {
			start: rangeStart,
			end: rangeStart + captureLength,
		};

		// re-add the old range so that the selection is restored
		selection.removeAllRanges();
		selection.addRange(oldRange);

		return { line, range: lineRange };
	}

	function getStartOffset(lineRange: Range, originalRange: Range) {
		// sometimes, the old and new range are in different DOM elements (ie: when the match is inside of <b></b>)
		// so we need to find the first common ancestor DOM element and find the positions of the old and new range relative to that.
		const firstCommonAncestor = findFirstCommonAncestor(lineRange.startContainer, originalRange.startContainer);

		const selectionOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, lineRange.startContainer) + lineRange.startOffset;
		const textOffset = getSelectionOffsetRelativeTo(firstCommonAncestor, originalRange.startContainer) + originalRange.startOffset;
		return textOffset - selectionOffset;
	}

	// modified from https://stackoverflow.com/a/68583466/16253823
	function findFirstCommonAncestor(nodeA: Node, nodeB: Node) {
		const range = new Range();
		range.setStart(nodeA, 0);
		range.setEnd(nodeB, 0);
		return range.commonAncestorContainer;
	}

	function getTextContentLength(node: Node): number {
		let length = 0;

		if (node.nodeType === Node.TEXT_NODE) {
			length += node.textContent?.length || 0;
		} else {
			for (const childNode of node.childNodes) {
				length += getTextContentLength(childNode);
			}
		}

		return length;
	}

	// modified from https://stackoverflow.com/a/48812529/16253823
	function getSelectionOffsetRelativeTo(parentElement: Node, currentNode: Node | null): number {
		if (!currentNode) {
			return 0;
		}
		let offset = 0;

		if (currentNode === parentElement || !parentElement.contains(currentNode)) {
			return offset;
		}


		// count the number of chars before the current dom elem and the start of the dom
		let prevSibling = currentNode.previousSibling;
		while (prevSibling) {
			offset += getTextContentLength(prevSibling);
			prevSibling = prevSibling.previousSibling;
		}

		return offset + getSelectionOffsetRelativeTo(parentElement, currentNode.parentNode);
	}

	const find = (query: string, options: { wholeWord?: boolean; caseSensitive?: boolean; includeMarkup: boolean; includeOutput: boolean; shouldGetSearchPreviewInfo: boolean; ownerID: string; findIds: string[] }) => {
		let find = true;
		let matches: IFindMatch[] = [];

		const range = document.createRange();
		range.selectNodeContents(window.document.getElementById('findStart')!);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);

		viewModel.toggleDragDropEnabled(false);

		try {
			document.designMode = 'On';

			while (find && matches.length < 500) {
				find = (window as unknown as { find: (query: string, caseSensitive: boolean, backwards: boolean, wrapAround: boolean, wholeWord: boolean, searchInFrames: boolean, includeMarkup: boolean) => boolean }).find(query, /* caseSensitive*/ !!options.caseSensitive,
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

					// Markdown preview are rendered in a shadow DOM.
					if (options.includeMarkup && selection.rangeCount > 0 && selection.getRangeAt(0).startContainer.nodeType === 1
						&& (selection.getRangeAt(0).startContainer as Element).classList.contains('markup')) {
						// markdown preview container
						const preview = (selection.anchorNode?.firstChild as Element);
						const root = preview.shadowRoot as ShadowRoot & { getSelection: () => Selection };
						const shadowSelection = root?.getSelection ? root?.getSelection() : null;
						// find the match in the shadow dom by checking the selection inside the shadow dom
						if (shadowSelection && shadowSelection.anchorNode) {
							matches.push({
								type: 'preview',
								id: preview.id,
								cellId: preview.id,
								container: preview,
								isShadow: true,
								originalRange: shadowSelection.getRangeAt(0),
								searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : undefined,
							});
						}
					}

					// Outputs might be rendered inside a shadow DOM.
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
								originalRange: shadowSelection.getRangeAt(0),
								searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(shadowSelection) : undefined,
							});
						}
					}

					const anchorNode = selection.anchorNode?.parentElement;

					if (anchorNode) {
						const lastEl: any = matches.length ? matches[matches.length - 1] : null;

						// Optimization: avoid searching for the output container
						if (lastEl && lastEl.container.contains(anchorNode) && options.includeOutput) {
							matches.push({
								type: lastEl.type,
								id: lastEl.id,
								cellId: lastEl.cellId,
								container: lastEl.container,
								isShadow: false,
								originalRange: selection.getRangeAt(0),
								searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : undefined,
							});

						} else {
							// Traverse up the DOM to find the container
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
											originalRange: selection.getRangeAt(0),
											searchPreviewInfo: options.shouldGetSearchPreviewInfo ? extractSelectionLine(selection) : undefined,
										});
									}
									break;
								}

								if (node.id === 'container' || node === window.document.body) {
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


		matches = matches.filter(match => options.findIds.length ? options.findIds.includes(match.cellId) : true);
		_highlighter.addHighlights(matches, options.ownerID);
		window.document.getSelection()?.removeAllRanges();

		viewModel.toggleDragDropEnabled(currentOptions.dragAndDropEnabled);

		document.designMode = 'Off';

		postNotebookMessage('didFind', {
			matches: matches.map((match, index) => ({
				type: match.type,
				id: match.id,
				cellId: match.cellId,
				index,
				searchPreviewInfo: match.searchPreviewInfo,
			}))
		});
	};

	const copyOutputImage = async (outputId: string, altOutputId: string, textAlternates?: { mimeType: string; content: string }[], retries = 5) => {
		if (!window.document.hasFocus() && retries > 0) {
			// copyImage can be called from outside of the webview, which means this function may be running whilst the webview is gaining focus.
			// Since navigator.clipboard.write requires the document to be focused, we need to wait for focus.
			// We cannot use a listener, as there is a high chance the focus is gained during the setup of the listener resulting in us missing it.
			setTimeout(() => { copyOutputImage(outputId, altOutputId, textAlternates, retries - 1); }, 50);
			return;
		}

		try {
			const outputElement = window.document.getElementById(outputId)
				?? window.document.getElementById(altOutputId);

			let image = outputElement?.querySelector('img');

			if (!image) {
				const svgImage = outputElement?.querySelector('svg.output-image') ??
					outputElement?.querySelector('div.svgContainerStyle > svg');

				if (svgImage) {
					image = new Image();
					image.src = 'data:image/svg+xml,' + encodeURIComponent(svgImage.outerHTML);
				}
			}

			if (image) {
				const ensureImageLoaded = (img: HTMLImageElement): Promise<HTMLImageElement> => {
					return new Promise((resolve, reject) => {
						if (img.complete && img.naturalWidth > 0) {
							resolve(img);
						} else {
							img.onload = () => resolve(img);
							img.onerror = () => reject(new Error('Failed to load image'));
							setTimeout(() => reject(new Error('Image load timeout')), 5000);
						}
					});
				};
				const imageToCopy = await ensureImageLoaded(image);

				// Build clipboard data with both image and text formats
				const clipboardData: Record<string, any> = {
					'image/png': new Promise((resolve) => {
						const canvas = document.createElement('canvas');
						canvas.width = imageToCopy.naturalWidth;
						canvas.height = imageToCopy.naturalHeight;
						const context = canvas.getContext('2d');
						context!.drawImage(imageToCopy, 0, 0);

						canvas.toBlob((blob) => {
							if (blob) {
								resolve(blob);
							} else {
								console.error('No blob data to write to clipboard');
							}
							canvas.remove();
						}, 'image/png');
					})
				};

				// Add text alternates if provided
				if (textAlternates) {
					for (const alternate of textAlternates) {
						clipboardData[alternate.mimeType] = alternate.content;
					}
				}

				await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
			} else {
				console.error('Could not find image element to copy for output with id', outputId);
			}
		} catch (e) {
			console.error('Could not copy image:', e);
		}
	};

	window.addEventListener('message', async rawEvent => {
		const event = rawEvent as ({ data: webviewMessages.ToWebviewMessage });

		switch (event.data.type) {
			case 'initializeMarkup': {
				try {
					await Promise.all(event.data.cells.map(info => viewModel.ensureMarkupCell(info)));
				} finally {
					dimensionUpdater.updateImmediately();
					postNotebookMessage('initializedMarkup', { requestId: event.data.requestId });
				}
				break;
			}
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
				if (data.createOnIdle) {
					outputRunner.enqueueIdle(data.outputId, signal => {
						// cancel the idle callback if it exists
						return viewModel.renderOutputCell(data, signal);
					});
				} else {
					outputRunner.enqueue(data.outputId, signal => {
						// cancel the idle callback if it exists
						return viewModel.renderOutputCell(data, signal);
					});
				}
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
				window.document.getElementById('container')!.innerText = '';
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
			case 'copyImage': {
				await copyOutputImage(event.data.outputId, event.data.altOutputId, event.data.textAlternates);
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
				for (const { uri } of resources) {
					kernelPreloads.load(uri);
				}
				break;
			}
			case 'updateRenderers': {
				const { rendererData } = event.data;
				renderers.updateRendererData(rendererData);
				break;
			}
			case 'focus-output':
				focusFirstFocusableOrContainerInOutput(event.data.cellOrOutputId, event.data.alternateId);
				break;
			case 'blur-output':
				blurOutput();
				break;
			case 'select-output-contents':
				selectOutputContents(event.data.cellOrOutputId);
				break;
			case 'select-input-contents':
				selectInputContents(event.data.cellOrOutputId);
				break;
			case 'decorations': {
				let outputContainer = window.document.getElementById(event.data.cellId);
				if (!outputContainer) {
					viewModel.ensureOutputCell(event.data.cellId, -100000, true);
					outputContainer = window.document.getElementById(event.data.cellId);
				}
				outputContainer?.classList.add(...event.data.addedClassNames);
				outputContainer?.classList.remove(...event.data.removedClassNames);
				break;
			}
			case 'markupDecorations': {
				const markupCell = window.document.getElementById(event.data.cellId);
				// The cell may not have been added yet if it is out of view.
				// Decorations will be added when the cell is shown.
				if (markupCell) {
					markupCell?.classList.add(...event.data.addedClassNames);
					markupCell?.classList.remove(...event.data.removedClassNames);
				}
				break;
			}
			case 'customKernelMessage':
				onDidReceiveKernelMessage.fire(event.data.message);
				break;
			case 'customRendererMessage':
				renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
				break;
			case 'notebookStyles': {
				const documentStyle = window.document.documentElement.style;

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
				currentRenderOptions = event.data.renderOptions;
				settingChange.fire(currentRenderOptions);
				break;
			case 'tokenizedCodeBlock': {
				const { codeBlockId, html } = event.data;
				MarkdownCodeBlock.highlightCodeBlock(codeBlockId, html);
				break;
			}
			case 'tokenizedStylesChanged': {
				tokenizationStyle.replaceSync(event.data.css);
				break;
			}
			case 'find': {
				_highlighter.removeHighlights(event.data.options.ownerID);
				find(event.data.query, event.data.options);
				break;
			}
			case 'findHighlightCurrent': {
				_highlighter?.highlightCurrentMatch(event.data.index, event.data.ownerID);
				break;
			}
			case 'findUnHighlightCurrent': {
				_highlighter?.unHighlightCurrentMatch(event.data.index, event.data.ownerID);
				break;
			}
			case 'findStop': {
				_highlighter.removeHighlights(event.data.ownerID);
				break;
			}
			case 'returnOutputItem': {
				outputItemRequests.resolveOutputItem(event.data.requestId, event.data.output);
			}
		}
	});

	const renderFallbackErrorName = 'vscode.fallbackToNextRenderer';

	class Renderer {

		private _onMessageEvent = createEmitter();
		private _loadPromise?: Promise<rendererApi.RendererApi | undefined>;
		private _api: rendererApi.RendererApi | undefined;

		constructor(
			public readonly data: webviewMessages.RendererMetadata,
		) { }

		public receiveMessage(message: unknown) {
			this._onMessageEvent.fire(message);
		}

		public async renderOutputItem(item: rendererApi.OutputItem, element: HTMLElement, signal: AbortSignal): Promise<void> {
			try {
				await this.load();
			} catch (e) {
				if (!signal.aborted) {
					showRenderError(`Error loading renderer '${this.data.id}'`, element, e instanceof Error ? [e] : []);
				}
				return;
			}

			if (!this._api) {
				if (!signal.aborted) {
					showRenderError(`Renderer '${this.data.id}' does not implement renderOutputItem`, element, []);
				}
				return;
			}

			try {
				const renderStart = performance.now();
				await this._api.renderOutputItem(item, element, signal);
				this.postDebugMessage('Rendered output item', { id: item.id, duration: `${performance.now() - renderStart}ms` });

			} catch (e) {
				if (signal.aborted) {
					return;
				}

				if (e instanceof Error && e.name === renderFallbackErrorName) {
					throw e;
				}

				showRenderError(`Error rendering output item using '${this.data.id}'`, element, e instanceof Error ? [e] : []);
				this.postDebugMessage('Rendering output item failed', { id: item.id, error: e + '' });
			}
		}

		public disposeOutputItem(id?: string): void {
			this._api?.disposeOutputItem?.(id);
		}

		private createRendererContext(): RendererContext {
			const { id, messaging } = this.data;
			const context: RendererContext = {
				setState: newState => vscode.setState({ ...vscode.getState(), [id]: newState }),
				getState: <T>() => {
					const state = vscode.getState();
					return typeof state === 'object' && state ? state[id] as T : undefined;
				},
				getRenderer: async (id: string) => {
					const renderer = renderers.getRenderer(id);
					if (!renderer) {
						return undefined;
					}
					if (renderer._api) {
						return renderer._api;
					}
					return renderer.load();
				},
				workspace: {
					get isTrusted() { return isWorkspaceTrusted; }
				},
				settings: {
					get lineLimit() { return currentRenderOptions.lineLimit; },
					get outputScrolling() { return currentRenderOptions.outputScrolling; },
					get outputWordWrap() { return currentRenderOptions.outputWordWrap; },
					get linkifyFilePaths() { return currentRenderOptions.linkifyFilePaths; },
					get minimalError() { return currentRenderOptions.minimalError; },
				},
				get onDidChangeSettings() { return settingChange.event; }
			};

			if (messaging) {
				context.onDidReceiveMessage = this._onMessageEvent.event;
				context.postMessage = message => postNotebookMessage('customRendererMessage', { rendererId: id, message });
			}

			return Object.freeze(context);
		}

		private load(): Promise<rendererApi.RendererApi | undefined> {
			this._loadPromise ??= this._load();
			return this._loadPromise;
		}

		/** Inner function cached in the _loadPromise(). */
		private async _load(): Promise<rendererApi.RendererApi | undefined> {
			this.postDebugMessage('Start loading renderer');

			try {
				// Preloads need to be loaded before loading renderers.
				await kernelPreloads.waitForAllCurrent();

				const importStart = performance.now();
				const module: RendererModule = await __import(this.data.entrypoint.path);
				this.postDebugMessage('Imported renderer', { duration: `${performance.now() - importStart}ms` });

				if (!module) {
					return;
				}

				this._api = await module.activate(this.createRendererContext());
				this.postDebugMessage('Activated renderer', { duration: `${performance.now() - importStart}ms` });

				const dependantRenderers = ctx.rendererData
					.filter(d => d.entrypoint.extends === this.data.id);

				if (dependantRenderers.length) {
					this.postDebugMessage('Activating dependant renderers', { dependents: dependantRenderers.map(x => x.id).join(', ') });
				}

				// Load all renderers that extend this renderer
				await Promise.all(dependantRenderers.map(async d => {
					const renderer = renderers.getRenderer(d.id);
					if (!renderer) {
						throw new Error(`Could not find extending renderer: ${d.id}`);
					}

					try {
						return await renderer.load();
					} catch (e) {
						// Squash any errors extends errors. They won't prevent the renderer
						// itself from working, so just log them.
						console.error(e);
						this.postDebugMessage('Activating dependant renderer failed', { dependent: d.id, error: e + '' });
						return undefined;
					}
				}));

				return this._api;
			} catch (e) {
				this.postDebugMessage('Loading renderer failed');
				throw e;
			}
		}

		private postDebugMessage(msg: string, data?: Record<string, string>) {
			postNotebookMessage<webviewMessages.ILogRendererDebugMessage>('logRendererDebugMessage', {
				message: `[renderer ${this.data.id}] - ${msg}`,
				data
			});
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
		public load(uri: string) {
			const promise = Promise.all([
				runKernelPreload(uri),
				this.waitForAllCurrent(),
			]);

			this.preloads.set(uri, promise);
			return promise;
		}

		/**
		 * Returns a promise that waits for all currently-registered preloads to
		 * activate before resolving.
		 */
		public waitForAllCurrent() {
			return Promise.all([...this.preloads.values()].map(p => p.catch(err => err)));
		}
	};

	const outputRunner = new class {
		private readonly outputs = new Map<string, { abort: AbortController; queue: Promise<unknown> }>();

		/**
		 * Pushes the action onto the list of actions for the given output ID,
		 * ensuring that it's run in-order.
		 */
		public enqueue(outputId: string, action: (cancelSignal: AbortSignal) => unknown) {
			this.pendingOutputCreationRequest.get(outputId)?.dispose();
			this.pendingOutputCreationRequest.delete(outputId);

			const record = this.outputs.get(outputId);
			if (!record) {
				const controller = new AbortController();
				this.outputs.set(outputId, { abort: controller, queue: new Promise(r => r(action(controller.signal))) });
			} else {
				record.queue = record.queue.then(async r => {
					if (!record.abort.signal.aborted) {
						await action(record.abort.signal);
					}
				});
			}
		}

		private pendingOutputCreationRequest: Map<string, IDisposable> = new Map();

		public enqueueIdle(outputId: string, action: (cancelSignal: AbortSignal) => unknown) {
			this.pendingOutputCreationRequest.get(outputId)?.dispose();
			outputRunner.pendingOutputCreationRequest.set(outputId, runWhenIdle(() => {
				outputRunner.enqueue(outputId, action);
				outputRunner.pendingOutputCreationRequest.delete(outputId);
			}));
		}

		/**
		 * Cancels the rendering of all outputs.
		 */
		public cancelAll() {
			// Delete all pending idle requests
			this.pendingOutputCreationRequest.forEach(r => r.dispose());
			this.pendingOutputCreationRequest.clear();

			for (const { abort } of this.outputs.values()) {
				abort.abort();
			}
			this.outputs.clear();
		}

		/**
		 * Cancels any ongoing rendering out an output.
		 */
		public cancelOutput(outputId: string) {
			// Delete the pending idle request if it exists
			this.pendingOutputCreationRequest.get(outputId)?.dispose();
			this.pendingOutputCreationRequest.delete(outputId);

			const output = this.outputs.get(outputId);
			if (output) {
				output.abort.abort();
				this.outputs.delete(outputId);
			}
		}
	};

	const renderers = new class {
		private readonly _renderers = new Map</* id */ string, Renderer>();

		constructor() {
			for (const renderer of ctx.rendererData) {
				this.addRenderer(renderer);
			}
		}

		public getRenderer(id: string): Renderer | undefined {
			return this._renderers.get(id);
		}

		private rendererEqual(a: webviewMessages.RendererMetadata, b: webviewMessages.RendererMetadata) {
			if (a.id !== b.id || a.entrypoint.path !== b.entrypoint.path || a.entrypoint.extends !== b.entrypoint.extends || a.messaging !== b.messaging) {
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

				this.addRenderer(renderer);
			}

			for (const key of oldKeys) {
				if (!newKeys.has(key)) {
					this._renderers.delete(key);
				}
			}
		}

		private addRenderer(renderer: webviewMessages.RendererMetadata) {
			this._renderers.set(renderer.id, new Renderer(renderer));
		}

		public clearAll() {
			outputRunner.cancelAll();
			for (const renderer of this._renderers.values()) {
				renderer.disposeOutputItem();
			}
		}

		public clearOutput(rendererId: string, outputId: string) {
			outputRunner.cancelOutput(outputId);
			this._renderers.get(rendererId)?.disposeOutputItem(outputId);
		}

		public async render(item: ExtendedOutputItem, preferredRendererId: string | undefined, element: HTMLElement, signal: AbortSignal): Promise<void> {
			const primaryRenderer = this.findRenderer(preferredRendererId, item);
			if (!primaryRenderer) {
				const errorMessage = (window.document.documentElement.style.getPropertyValue('--notebook-cell-renderer-not-found-error') || '').replace('$0', () => item.mime);
				this.showRenderError(item, element, errorMessage);
				return;
			}

			// Try primary renderer first
			if (!(await this._doRender(item, element, primaryRenderer, signal)).continue) {
				return;
			}

			// Primary renderer failed in an expected way. Fallback to render the next mime types
			for (const additionalItemData of item._allOutputItems) {
				if (additionalItemData.mime === item.mime) {
					continue;
				}

				const additionalItem = await additionalItemData.getItem();
				if (signal.aborted) {
					return;
				}

				if (additionalItem) {
					const renderer = this.findRenderer(undefined, additionalItem);
					if (renderer) {
						if (!(await this._doRender(additionalItem, element, renderer, signal)).continue) {
							return; // We rendered successfully
						}
					}
				}
			}

			// All renderers have failed and there is nothing left to fallback to
			const errorMessage = (window.document.documentElement.style.getPropertyValue('--notebook-cell-renderer-fallbacks-exhausted') || '').replace('$0', () => item.mime);
			this.showRenderError(item, element, errorMessage);
		}

		private async _doRender(item: rendererApi.OutputItem, element: HTMLElement, renderer: Renderer, signal: AbortSignal): Promise<{ continue: boolean }> {
			try {
				await renderer.renderOutputItem(item, element, signal);
				return { continue: false }; // We rendered successfully
			} catch (e) {
				if (signal.aborted) {
					return { continue: false };
				}

				if (e instanceof Error && e.name === renderFallbackErrorName) {
					return { continue: true };
				} else {
					throw e; // Bail and let callers handle unknown errors
				}
			}
		}

		private findRenderer(preferredRendererId: string | undefined, info: rendererApi.OutputItem) {
			let renderer: Renderer | undefined;

			if (typeof preferredRendererId === 'string') {
				renderer = Array.from(this._renderers.values())
					.find((renderer) => renderer.data.id === preferredRendererId);
			} else {
				const renderers = Array.from(this._renderers.values())
					.filter((renderer) => renderer.data.mimeTypes.includes(info.mime) && !renderer.data.entrypoint.extends);

				if (renderers.length) {
					// De-prioritize built-in renderers
					renderers.sort((a, b) => +a.data.isBuiltin - +b.data.isBuiltin);

					// Use first renderer we find in sorted list
					renderer = renderers[0];
				}
			}
			return renderer;
		}

		private showRenderError(info: rendererApi.OutputItem, element: HTMLElement, errorMessage: string) {
			const errorContainer = document.createElement('div');

			const error = document.createElement('div');
			error.className = 'no-renderer-error';
			error.innerText = errorMessage;

			const cellText = document.createElement('div');
			cellText.innerText = info.text();

			errorContainer.appendChild(error);
			errorContainer.appendChild(cellText);

			element.innerText = '';
			element.appendChild(errorContainer);
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

		private async createMarkupCell(init: webviewMessages.IMarkupCellInitialization, top: number, visible: boolean): Promise<MarkupCell> {
			const existing = this._markupCells.get(init.cellId);
			if (existing) {
				console.error(`Trying to create markup that already exists: ${init.cellId}`);
				return existing;
			}

			const cell = new MarkupCell(init.cellId, init.mime, init.content, top, init.metadata);
			cell.element.style.visibility = visible ? '' : 'hidden';
			this._markupCells.set(init.cellId, cell);

			await cell.ready;
			return cell;
		}

		public async ensureMarkupCell(info: webviewMessages.IMarkupCellInitialization): Promise<void> {
			let cell = this._markupCells.get(info.cellId);
			if (cell) {
				cell.element.style.visibility = info.visible ? '' : 'hidden';
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

		public async renderOutputCell(data: webviewMessages.ICreationRequestMessage, signal: AbortSignal): Promise<void> {
			const preloadErrors = await Promise.all<undefined | Error>(
				data.requiredPreloads.map(p => kernelPreloads.waitFor(p.uri).then(() => undefined, err => err))
			);
			if (signal.aborted) {
				return;
			}

			const cellOutput = this.ensureOutputCell(data.cellId, data.cellTop, false);
			return cellOutput.renderOutputElement(data, preloadErrors, signal);
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
			el.innerHTML = trustedHtml as string; // CodeQL [SM03712] The rendered content comes from VS Code's tokenizer and is considered safe
			const root = el.getRootNode();
			if (root instanceof ShadowRoot) {
				if (!root.adoptedStyleSheets.includes(tokenizationStyle)) {
					root.adoptedStyleSheets.push(tokenizationStyle);
				}
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

		private readonly outputItem: ExtendedOutputItem;

		/// Internal field that holds text content
		private _content: { readonly value: string; readonly version: number; readonly metadata: NotebookCellMetadata };

		private _isDisposed = false;
		private renderTaskAbort?: AbortController;

		constructor(id: string, mime: string, content: string, top: number, metadata: NotebookCellMetadata) {
			const self = this;
			this.id = id;
			this._content = { value: content, version: 0, metadata: metadata };

			const { promise, resolve, reject } = promiseWithResolvers<void>();
			this.ready = promise;

			let cachedData: { readonly version: number; readonly value: Uint8Array } | undefined;
			this.outputItem = Object.freeze<ExtendedOutputItem>({
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
					return new Blob([this.data() as Uint8Array<ArrayBuffer>], { type: this.mime });
				},

				_allOutputItems: [{
					mime,
					getItem: async () => this.outputItem,
				}]
			});

			const root = window.document.getElementById('container')!;
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
				if (!this._isDisposed) {
					resizeObserver.observe(this.element, this.id, false, this.id);
				}
				resolve();
			}, () => reject());
		}

		public dispose() {
			this._isDisposed = true;
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
				await renderers.render(this.outputItem, undefined, this.element, this.renderTaskAbort.signal);
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
			this.element.style.visibility = '';
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
			this.element.style.visibility = '';
			this.updateMarkupDimensions();
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
			const container = window.document.getElementById('container')!;

			const upperWrapperElement = createFocusSink(cellId);
			container.appendChild(upperWrapperElement);

			this.element = document.createElement('div');
			this.element.style.position = 'absolute';
			this.element.style.outline = '0';

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

		private createOutputElement(data: webviewMessages.ICreationRequestMessage): OutputElement {
			let outputContainer = this.outputElements.get(data.outputId);
			if (!outputContainer) {
				outputContainer = new OutputContainer(data.outputId);
				this.element.appendChild(outputContainer.element);
				this.outputElements.set(data.outputId, outputContainer);
			}

			return outputContainer.createOutputElement(data.outputId, data.outputOffset, data.left, data.cellId);
		}

		public async renderOutputElement(data: webviewMessages.ICreationRequestMessage, preloadErrors: ReadonlyArray<Error | undefined>, signal: AbortSignal) {
			const startTime = Date.now();
			const outputElement /** outputNode */ = this.createOutputElement(data);
			await outputElement.render(data.content, data.rendererId, preloadErrors, signal);

			// don't hide until after this step so that the height is right
			outputElement/** outputNode */.element.style.visibility = data.initiallyHidden ? 'hidden' : '';

			if (!!data.executionId && !!data.rendererId) {
				let outputSize: number | undefined = undefined;
				if (data.content.type === 1 /* extension */) {
					outputSize = data.content.output.valueBytes.length;
				}

				// Only send performance messages for non-empty outputs up to a certain size
				if (outputSize !== undefined && outputSize > 0 && outputSize < 100 * 1024) {
					postNotebookMessage<webviewMessages.IPerformanceMessage>('notebookPerformanceMessage', {
						cellId: data.cellId,
						executionId: data.executionId,
						duration: Date.now() - startTime,
						rendererId: data.rendererId,
						outputSize
					});
				}
			}
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

			this.element.style.visibility = '';
			this.element.style.top = `${top}px`;
		}

		public hide() {
			this.element.style.visibility = 'hidden';
		}

		public updateContentAndRerender(outputId: string, content: webviewMessages.ICreationContent) {
			this.outputElements.get(outputId)?.updateContentAndRender(content);
		}

		public updateOutputHeight(outputId: string, height: number) {
			this.outputElements.get(outputId)?.updateHeight(height);
		}

		public updateScroll(request: webviewMessages.IContentWidgetTopRequest) {
			this.element.style.top = `${request.cellTop}px`;

			const outputElement = this.outputElements.get(request.outputId);
			if (outputElement) {
				outputElement.updateScroll(request.outputOffset);

				if (request.forceDisplay && outputElement.outputNode) {
					// TODO @rebornix @mjbvz, there is a misalignment here.
					// We set output visibility on cell container, other than output container or output node itself.
					outputElement.outputNode.element.style.visibility = '';
				}
			}

			if (request.forceDisplay) {
				this.element.style.visibility = '';
			}
		}
	}

	class OutputContainer {

		public readonly element: HTMLElement;

		private _outputNode?: OutputElement;

		get outputNode() {
			return this._outputNode;
		}

		constructor(
			private readonly outputId: string,
		) {
			this.element = document.createElement('div');
			this.element.classList.add('output_container');
			this.element.setAttribute('data-vscode-context', JSON.stringify({ 'preventDefaultContextMenuItems': true }));
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

		public updateContentAndRender(content: webviewMessages.ICreationContent) {
			this._outputNode?.updateAndRerender(content);
		}
	}

	vscode.postMessage({
		__vscode_notebook_message: true,
		type: 'initialized'
	});

	for (const preload of ctx.staticPreloadsData) {
		kernelPreloads.load(preload.entrypoint);
	}

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
		private _content?: {
			readonly preferredRendererId: string | undefined;
			readonly preloadErrors: ReadonlyArray<Error | undefined>;
		};
		private hasResizeObserver = false;

		private renderTaskAbort?: AbortController;
		private isImageOutput = false;

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

			// Add drag handler
			this.element.addEventListener('dragstart', (e: DragEvent) => {
				if (!e.dataTransfer) {
					return;
				}

				const outputData: NotebookCellOutputTransferData = {
					outputId: this.outputId,
				};

				e.dataTransfer.setData('notebook-cell-output', JSON.stringify(outputData));
			});

			// Add alt key handlers
			window.addEventListener('keydown', (e) => {
				if (e.altKey) {
					this.element.draggable = true;
				}
			});

			window.addEventListener('keyup', (e) => {
				if (!e.altKey) {
					this.element.draggable = this.isImageOutput;
				}
			});

			// Handle window blur to reset draggable state
			window.addEventListener('blur', () => {
				this.element.draggable = this.isImageOutput;
			});
		}

		public dispose() {
			this.renderTaskAbort?.abort();
			this.renderTaskAbort = undefined;
		}

		public async render(content: webviewMessages.ICreationContent, preferredRendererId: string | undefined, preloadErrors: ReadonlyArray<Error | undefined>, signal?: AbortSignal) {
			this.renderTaskAbort?.abort();
			this.renderTaskAbort = undefined;

			this._content = { preferredRendererId, preloadErrors };
			if (content.type === 0 /* RenderOutputType.Html */) {
				const trustedHtml = ttPolicy?.createHTML(content.htmlContent) ?? content.htmlContent;
				this.element.innerHTML = trustedHtml as string;  // CodeQL [SM03712] The content comes from renderer extensions, not from direct user input.
			} else if (preloadErrors.some(e => e instanceof Error)) {
				const errors = preloadErrors.filter((e): e is Error => e instanceof Error);
				showRenderError(`Error loading preloads`, this.element, errors);
			} else {

				const imageMimeTypes = ['image/png', 'image/jpeg', 'image/svg'];
				this.isImageOutput = imageMimeTypes.includes(content.output.mime);
				this.element.draggable = this.isImageOutput;

				const item = createOutputItem(this.outputId, content.output.mime, content.metadata, content.output.valueBytes, content.allOutputs, content.output.appended);

				const controller = new AbortController();
				this.renderTaskAbort = controller;

				// Abort rendering if caller aborts
				signal?.addEventListener('abort', () => controller.abort());

				try {
					await renderers.render(item, preferredRendererId, this.element, controller.signal);
				} finally {
					if (this.renderTaskAbort === controller) {
						this.renderTaskAbort = undefined;
					}
				}
			}

			if (!this.hasResizeObserver) {
				this.hasResizeObserver = true;
				resizeObserver.observe(this.element, this.outputId, true, this.cellId);
			}

			const offsetHeight = this.element.offsetHeight;
			const cps = document.defaultView!.getComputedStyle(this.element);
			const verticalPadding = parseFloat(cps.paddingTop) + parseFloat(cps.paddingBottom);
			const contentHeight = offsetHeight - verticalPadding;
			if (elementHasContent(contentHeight) && cps.padding === '0px') {
				// we set padding to zero if the output has no content (then we can have a zero-height output DOM node)
				// thus we need to ensure the padding is accounted when updating the init height of the output
				dimensionUpdater.updateHeight(this.outputId, offsetHeight + ctx.style.outputNodePadding * 2, {
					isOutput: true,
					init: true
				});

				this.element.style.padding = `${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodePadding}px ${ctx.style.outputNodeLeftPadding}`;
			} else if (elementHasContent(contentHeight)) {
				dimensionUpdater.updateHeight(this.outputId, this.element.offsetHeight, {
					isOutput: true,
					init: true
				});
				this.element.style.padding = `0 ${ctx.style.outputNodePadding}px 0 ${ctx.style.outputNodeLeftPadding}`;
			} else {
				// we have a zero-height output DOM node
				dimensionUpdater.updateHeight(this.outputId, 0, {
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

		public updateAndRerender(content: webviewMessages.ICreationContent) {
			if (this._content) {
				this.render(content, this._content.preferredRendererId, this._content.preloadErrors);
			}
		}
	}

	const markupCellDragManager = new class MarkupCellDragManager {

		private currentDrag: { cellId: string; clientY: number } | undefined;

		// Transparent overlay that prevents elements from inside the webview from eating
		// drag events.
		private dragOverlay?: HTMLElement;

		constructor() {
			window.document.addEventListener('dragover', e => {
				// Allow dropping dragged markup cells
				e.preventDefault();
			});

			window.document.addEventListener('drop', e => {
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
				window.document.body.appendChild(this.dragOverlay);
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
				window.requestAnimationFrame(trySendDragUpdate);
			};
			window.requestAnimationFrame(trySendDragUpdate);
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
				this.dragOverlay.remove();
				this.dragOverlay = undefined;
			}

			(e.target as HTMLElement).style.zIndex = '';
		}
	}();
}

export function preloadsScriptStr(styleValues: PreloadStyles, options: PreloadOptions, renderOptions: RenderOptions, renderers: readonly webviewMessages.RendererMetadata[], preloads: readonly webviewMessages.StaticPreloadMetadata[], isWorkspaceTrusted: boolean, nonce: string) {
	const ctx: PreloadContext = {
		style: styleValues,
		options,
		renderOptions,
		rendererData: renderers,
		staticPreloadsData: preloads,
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
