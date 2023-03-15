/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ActivationFunction, OutputItem, RendererContext } from 'vscode-notebook-renderer';
import { insertOutput, scrollableClass } from './textHelper';

interface IDisposable {
	dispose(): void;
}

interface HtmlRenderingHook {
	/**
	 * Invoked after the output item has been rendered but before it has been appended to the document.
	 *
	 * @return A new `HTMLElement` or `undefined` to continue using the provided element.
	 */
	postRender(outputItem: OutputItem, element: HTMLElement, signal: AbortSignal): HTMLElement | undefined | Promise<HTMLElement | undefined>;
}

interface JavaScriptRenderingHook {
	/**
	 * Invoked before the script is evaluated.
	 *
	 * @return A new string of JavaScript or `undefined` to continue using the provided string.
	 */
	preEvaluate(outputItem: OutputItem, element: HTMLElement, script: string, signal: AbortSignal): string | undefined | Promise<string | undefined>;
}

interface RenderOptions {
	readonly lineLimit: number;
	readonly outputScrolling: boolean;
	readonly outputWordWrap: boolean;
}

function clearContainer(container: HTMLElement) {
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}
}

function renderImage(outputInfo: OutputItem, element: HTMLElement): IDisposable {
	const blob = new Blob([outputInfo.data()], { type: outputInfo.mime });
	const src = URL.createObjectURL(blob);
	const disposable = {
		dispose: () => {
			URL.revokeObjectURL(src);
		}
	};

	if (element.firstChild) {
		const display = element.firstChild as HTMLElement;
		if (display.firstChild && display.firstChild.nodeName === 'IMG' && display.firstChild instanceof HTMLImageElement) {
			display.firstChild.src = src;
			return disposable;
		}
	}

	const image = document.createElement('img');
	image.src = src;
	const display = document.createElement('div');
	display.classList.add('display');
	display.appendChild(image);
	element.appendChild(display);

	return disposable;
}

const ttPolicy = window.trustedTypes?.createPolicy('notebookRenderer', {
	createHTML: value => value,
	createScript: value => value,
});

const preservedScriptAttributes: (keyof HTMLScriptElement)[] = [
	'type', 'src', 'nonce', 'noModule', 'async',
];

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

async function renderHTML(outputInfo: OutputItem, container: HTMLElement, signal: AbortSignal, hooks: Iterable<HtmlRenderingHook>): Promise<void> {
	clearContainer(container);
	let element: HTMLElement = document.createElement('div');
	const htmlContent = outputInfo.text();
	const trustedHtml = ttPolicy?.createHTML(htmlContent) ?? htmlContent;
	element.innerHTML = trustedHtml as string;

	for (const hook of hooks) {
		element = (await hook.postRender(outputInfo, element, signal)) ?? element;
		if (signal.aborted) {
			return;
		}
	}

	container.appendChild(element);
	domEval(element);
}

async function renderJavascript(outputInfo: OutputItem, container: HTMLElement, signal: AbortSignal, hooks: Iterable<JavaScriptRenderingHook>): Promise<void> {
	let scriptText = outputInfo.text();

	for (const hook of hooks) {
		scriptText = (await hook.preEvaluate(outputInfo, container, scriptText, signal)) ?? scriptText;
		if (signal.aborted) {
			return;
		}
	}

	const script = document.createElement('script');
	script.type = 'module';
	script.textContent = scriptText;

	const element = document.createElement('div');
	const trustedHtml = ttPolicy?.createHTML(script.outerHTML) ?? script.outerHTML;
	element.innerHTML = trustedHtml as string;
	container.appendChild(element);
	domEval(element);
}

interface Event<T> {
	(listener: (e: T) => any, thisArgs?: any, disposables?: IDisposable[]): IDisposable;
}

type IRichRenderContext = RendererContext<void> & { readonly settings: RenderOptions; readonly onDidChangeSettings: Event<RenderOptions> };

function createDisposableStore(): { push(...disposables: IDisposable[]): void; dispose(): void } {
	const localDisposables: IDisposable[] = [];
	const disposable = {
		push: (...disposables: IDisposable[]) => {
			localDisposables.push(...disposables);
		},
		dispose: () => {
			localDisposables.forEach(d => d.dispose());
		}
	};

	return disposable;
}

type DisposableStore = ReturnType<typeof createDisposableStore>;

function renderError(
	outputInfo: OutputItem,
	container: HTMLElement,
	ctx: IRichRenderContext
): IDisposable {
	const disposableStore = createDisposableStore();

	clearContainer(container);

	const element = document.createElement('div');
	container.appendChild(element);
	type ErrorLike = Partial<Error>;

	let err: ErrorLike;
	try {
		err = <ErrorLike>JSON.parse(outputInfo.text());
	} catch (e) {
		console.log(e);
		return disposableStore;
	}

	if (err.stack) {
		const stack = document.createElement('span');
		stack.classList.add('traceback');
		if (ctx.settings.outputWordWrap) {
			stack.classList.add('wordWrap');
		}
		disposableStore.push(ctx.onDidChangeSettings(e => {
			stack.classList.toggle('wordWrap', e.outputWordWrap);
		}));

		insertOutput(outputInfo.id, [err.stack ?? ''], ctx.settings.lineLimit, ctx.settings.outputScrolling, stack, true);
		appendChildAndScroll(container, stack, disposableStore);
	} else {
		const header = document.createElement('div');
		const headerMessage = err.name && err.message ? `${err.name}: ${err.message}` : err.name || err.message;
		if (headerMessage) {
			header.innerText = headerMessage;
			container.appendChild(header);
		}
	}

	container.classList.add('error');
	return disposableStore;
}

function getPreviousOutputWithMatchingMimeType(container: HTMLElement, mimeType: string) {
	const outputContainer = container.parentElement;

	const previous = outputContainer?.previousSibling;
	if (previous) {
		const outputElement = (previous.firstChild as HTMLElement | null);
		if (outputElement && outputElement.getAttribute('output-mime-type') === mimeType) {
			return outputElement;
		}
	}
	return undefined;
}

function onScrollHandler(e: globalThis.Event) {
	const target = e.target as HTMLElement;
	if (target.scrollTop === 0) {
		target.classList.remove('more-above');
	} else {
		target.classList.add('more-above');
	}
}

// if there is a scrollable output, it will be scrolled to the given value if provided or the bottom of the element
function appendChildAndScroll(container: HTMLElement, child: HTMLElement, disposables: DisposableStore, scrollTop?: number) {
	container.appendChild(child);
	const scrollableElement = child.querySelector(`.${scrollableClass}`);
	if (scrollableElement instanceof HTMLElement) {
		scrollableElement.scrollTop = scrollTop !== undefined ? scrollTop : scrollableElement.scrollHeight;
		scrollableElement.addEventListener('scroll', onScrollHandler);
		disposables.push({ dispose: () => scrollableElement.removeEventListener('scroll', onScrollHandler) });
	}
}

// Find the scrollTop of the existing scrollable output, return undefined if at the bottom or element doesn't exist
function findScrolledHeight(outputContainer: HTMLElement, outputId: string): number | undefined {
	const scrollableElement = outputContainer.querySelector(`[output-item-id="${outputId}"] .${scrollableClass}`);
	if (scrollableElement && scrollableElement.scrollHeight - scrollableElement.scrollTop - scrollableElement.clientHeight > 2) {
		// not scrolled to the bottom
		return scrollableElement.scrollTop;
	}
	return undefined;
}

function renderStream(outputInfo: OutputItem, container: HTMLElement, error: boolean, ctx: IRichRenderContext): IDisposable {
	const disposableStore = createDisposableStore();
	const outputScrolling = ctx.settings.outputScrolling;

	// If the previous output item for the same cell was also a stream, append this output to the previous
	const outputElement = getPreviousOutputWithMatchingMimeType(container, outputInfo.mime);
	if (outputElement) {
		// find child with same id
		const existing = outputElement.querySelector(`[output-item-id="${outputInfo.id}"]`) as HTMLElement | null;
		if (existing) {
			clearContainer(existing);
		}

		const text = outputInfo.text();
		const element = existing ?? document.createElement('span');
		element.classList.add('output-stream');
		element.classList.toggle('wordWrap', ctx.settings.outputWordWrap);
		disposableStore.push(ctx.onDidChangeSettings(e => {
			element.classList.toggle('wordWrap', e.outputWordWrap);
		}));
		element.setAttribute('output-item-id', outputInfo.id);
		insertOutput(outputInfo.id, [text], ctx.settings.lineLimit, outputScrolling, element, false);
		appendChildAndScroll(outputElement, element, disposableStore);
		return disposableStore;
	}

	const element = document.createElement('span');
	element.classList.add('output-stream');
	element.classList.toggle('wordWrap', ctx.settings.outputWordWrap);
	disposableStore.push(ctx.onDidChangeSettings(e => {
		element.classList.toggle('wordWrap', e.outputWordWrap);
	}));
	element.setAttribute('output-item-id', outputInfo.id);

	const text = outputInfo.text();
	insertOutput(outputInfo.id, [text], ctx.settings.lineLimit, outputScrolling, element, false);
	const scrollTop = outputScrolling ? findScrolledHeight(container, outputInfo.id) : undefined;
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}
	appendChildAndScroll(container, element, disposableStore, scrollTop);
	container.setAttribute('output-mime-type', outputInfo.mime);
	if (error) {
		container.classList.add('error');
	}

	return disposableStore;
}

function renderText(outputInfo: OutputItem, container: HTMLElement, ctx: IRichRenderContext): IDisposable {
	const disposableStore = createDisposableStore();

	clearContainer(container);
	const contentNode = document.createElement('div');
	contentNode.classList.add('output-plaintext');
	if (ctx.settings.outputWordWrap) {
		contentNode.classList.add('wordWrap');
	}
	const text = outputInfo.text();
	insertOutput(outputInfo.id, [text], ctx.settings.lineLimit, ctx.settings.outputScrolling, contentNode, false);
	appendChildAndScroll(container, contentNode, disposableStore);
	return disposableStore;
}

export const activate: ActivationFunction<void> = (ctx) => {
	const disposables = new Map<string, IDisposable>();
	const htmlHooks = new Set<HtmlRenderingHook>();
	const jsHooks = new Set<JavaScriptRenderingHook>();

	const latestContext = ctx as (RendererContext<void> & { readonly settings: RenderOptions; readonly onDidChangeSettings: Event<RenderOptions> });

	const style = document.createElement('style');
	style.textContent = `
	.output-plaintext,
	.output-stream,
	.traceback {
		display: inline-block;
		width: 100%;
		line-height: var(--notebook-cell-output-line-height);
		font-family: var(--notebook-cell-output-font-family);
		font-size: var(--notebook-cell-output-font-size);
		user-select: text;
		-webkit-user-select: text;
		-ms-user-select: text;
		cursor: auto;
		word-wrap: break-word;
		/* text/stream output container should scroll but preserve newline character */
		white-space: pre;
	}
	/* When wordwrap turned on, force it to pre-wrap */
	.output-plaintext.wordWrap span,
	.output-stream.wordWrap span,
	.traceback.wordWrap span {
		white-space: pre-wrap;
	}
	.output .scrollable {
		overflow-y: scroll;
		max-height: var(--notebook-cell-output-max-height);
		border: var(--vscode-editorWidget-border);
		border-style: solid;
		padding-left: 4px;
		box-sizing: border-box;
		border-width: 1px;
	}
	.output .scrollable.more-above {
		box-shadow: var(--vscode-scrollbar-shadow) 0 6px 6px -6px inset
	}
	.output-plaintext .code-bold,
	.output-stream .code-bold,
	.traceback .code-bold {
		font-weight: bold;
	}
	.output-plaintext .code-italic,
	.output-stream .code-italic,
	.traceback .code-italic {
		font-style: italic;
	}
	.output-plaintext .code-strike-through,
	.output-stream .code-strike-through,
	.traceback .code-strike-through {
		text-decoration: line-through;
	}
	.output-plaintext .code-underline,
	.output-stream .code-underline,
	.traceback .code-underline {
		text-decoration: underline;
	}
	`;
	document.body.appendChild(style);

	return {
		renderOutputItem: async (outputInfo, element, signal?: AbortSignal) => {
			switch (outputInfo.mime) {
				case 'text/html':
				case 'image/svg+xml': {
					if (!ctx.workspace.isTrusted) {
						return;
					}

					await renderHTML(outputInfo, element, signal!, htmlHooks);
					break;
				}
				case 'application/javascript': {
					if (!ctx.workspace.isTrusted) {
						return;
					}

					renderJavascript(outputInfo, element, signal!, jsHooks);
					break;
				}
				case 'image/gif':
				case 'image/png':
				case 'image/jpeg':
				case 'image/git':
					{
						disposables.get(outputInfo.id)?.dispose();
						const disposable = renderImage(outputInfo, element);
						disposables.set(outputInfo.id, disposable);
					}
					break;
				case 'application/vnd.code.notebook.error':
					{
						disposables.get(outputInfo.id)?.dispose();
						const disposable = renderError(outputInfo, element, latestContext);
						disposables.set(outputInfo.id, disposable);
					}
					break;
				case 'application/vnd.code.notebook.stdout':
				case 'application/x.notebook.stdout':
				case 'application/x.notebook.stream':
					{
						disposables.get(outputInfo.id)?.dispose();
						const disposable = renderStream(outputInfo, element, false, latestContext);
						disposables.set(outputInfo.id, disposable);
					}
					break;
				case 'application/vnd.code.notebook.stderr':
				case 'application/x.notebook.stderr':
					{
						disposables.get(outputInfo.id)?.dispose();
						const disposable = renderStream(outputInfo, element, true, latestContext);
						disposables.set(outputInfo.id, disposable);
					}
					break;
				case 'text/plain':
					{
						disposables.get(outputInfo.id)?.dispose();
						const disposable = renderText(outputInfo, element, latestContext);
						disposables.set(outputInfo.id, disposable);
					}
					break;
				default:
					break;
			}
		},
		disposeOutputItem: (id: string | undefined) => {
			if (id) {
				disposables.get(id)?.dispose();
			} else {
				disposables.forEach(d => d.dispose());
			}
		},
		experimental_registerHtmlRenderingHook: (hook: HtmlRenderingHook): IDisposable => {
			htmlHooks.add(hook);
			return {
				dispose: () => {
					htmlHooks.delete(hook);
				}
			};
		},
		experimental_registerJavaScriptRenderingHook: (hook: JavaScriptRenderingHook): IDisposable => {
			jsHooks.add(hook);
			return {
				dispose: () => {
					jsHooks.delete(hook);
				}
			};
		}
	};
};
