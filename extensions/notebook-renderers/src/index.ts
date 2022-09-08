/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ActivationFunction, OutputItem, RendererContext } from 'vscode-notebook-renderer';
import { truncatedArrayOfString } from './textHelper';

interface IDisposable {
	dispose(): void;
}

interface HtmlRenderingHook {
	/**
	 * Invoked after the output item has been rendered but before it has been appended to the document.
	 *
	 * @return A new `HTMLElement` or `undefined` to continue using the provided element.
	 */
	postRender(outputItem: OutputItem, element: HTMLElement): HTMLElement | undefined;
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

function renderHTML(outputInfo: OutputItem, container: HTMLElement, hooks: Iterable<HtmlRenderingHook>): void {
	clearContainer(container);
	let element: HTMLElement = document.createElement('div');
	const htmlContent = outputInfo.text();
	const trustedHtml = ttPolicy?.createHTML(htmlContent) ?? htmlContent;
	element.innerHTML = trustedHtml as string;

	for (const hook of hooks) {
		element = hook.postRender(outputInfo, element) ?? element;
	}

	container.appendChild(element);
	domEval(element);
}

function renderJavascript(outputInfo: OutputItem, container: HTMLElement): void {
	const script = document.createElement('script');
	script.type = 'module';
	script.textContent = outputInfo.text();

	const element = document.createElement('div');
	const trustedHtml = ttPolicy?.createHTML(script.outerHTML) ?? script.outerHTML;
	element.innerHTML = trustedHtml as string;
	container.appendChild(element);
	domEval(element);
}

function renderError(outputInfo: OutputItem, container: HTMLElement, ctx: RendererContext<void> & { readonly settings: { readonly lineLimit: number } }): void {
	const element = document.createElement('div');
	container.appendChild(element);
	type ErrorLike = Partial<Error>;

	let err: ErrorLike;
	try {
		err = <ErrorLike>JSON.parse(outputInfo.text());
	} catch (e) {
		console.log(e);
		return;
	}

	if (err.stack) {
		const stack = document.createElement('pre');
		stack.classList.add('traceback');
		stack.style.margin = '8px 0';
		const element = document.createElement('span');
		truncatedArrayOfString(outputInfo.id, [err.stack ?? ''], ctx.settings.lineLimit, element);
		stack.appendChild(element);
		container.appendChild(stack);
	} else {
		const header = document.createElement('div');
		const headerMessage = err.name && err.message ? `${err.name}: ${err.message}` : err.name || err.message;
		if (headerMessage) {
			header.innerText = headerMessage;
			container.appendChild(header);
		}
	}

	container.classList.add('error');
}

function renderStream(outputInfo: OutputItem, container: HTMLElement, error: boolean, ctx: RendererContext<void> & { readonly settings: { readonly lineLimit: number } }): void {
	const outputContainer = container.parentElement;
	if (!outputContainer) {
		// should never happen
		return;
	}

	const prev = outputContainer.previousSibling;
	if (prev) {
		// OutputItem in the same cell
		// check if the previous item is a stream
		const outputElement = (prev.firstChild as HTMLElement | null);
		if (outputElement && outputElement.getAttribute('output-mime-type') === outputInfo.mime) {
			// same stream
			const text = outputInfo.text();

			const element = document.createElement('span');
			truncatedArrayOfString(outputInfo.id, [text], ctx.settings.lineLimit, element);
			outputElement.appendChild(element);
			return;
		}
	}

	const element = document.createElement('span');
	element.classList.add('output-stream');

	const text = outputInfo.text();
	truncatedArrayOfString(outputInfo.id, [text], ctx.settings.lineLimit, element);
	while (container.firstChild) {
		container.removeChild(container.firstChild);
	}
	container.appendChild(element);
	container.setAttribute('output-mime-type', outputInfo.mime);
	if (error) {
		container.classList.add('error');
	}
}

function renderText(outputInfo: OutputItem, container: HTMLElement, ctx: RendererContext<void> & { readonly settings: { readonly lineLimit: number } }): void {
	clearContainer(container);
	const contentNode = document.createElement('div');
	contentNode.classList.add('output-plaintext');
	const text = outputInfo.text();
	truncatedArrayOfString(outputInfo.id, [text], ctx.settings.lineLimit, contentNode);
	container.appendChild(contentNode);

}

export const activate: ActivationFunction<void> = (ctx) => {
	const disposables = new Map<string, IDisposable>();
	const htmlHooks = new Set<HtmlRenderingHook>();

	const latestContext = ctx as (RendererContext<void> & { readonly settings: { readonly lineLimit: number } });

	const style = document.createElement('style');
	style.textContent = `
	.output-plaintext,
	.output-stream,
	.traceback {
		line-height: var(--notebook-cell-output-line-height);
		font-family: var(--notebook-cell-output-font-family);
		white-space: pre-wrap;
		word-wrap: break-word;

		font-size: var(--notebook-cell-output-font-size);
		user-select: text;
		-webkit-user-select: text;
		-ms-user-select: text;
		cursor: auto;
	}
	span.output-stream {
		display: inline-block;
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
		renderOutputItem: (outputInfo, element) => {
			switch (outputInfo.mime) {
				case 'text/html':
				case 'image/svg+xml':
					{
						if (!ctx.workspace.isTrusted) {
							return;
						}

						renderHTML(outputInfo, element, htmlHooks);
					}
					break;
				case 'application/javascript':
					{
						if (!ctx.workspace.isTrusted) {
							return;
						}

						renderJavascript(outputInfo, element);
					}
					break;
				case 'image/gif':
				case 'image/png':
				case 'image/jpeg':
				case 'image/git':
					{
						const disposable = renderImage(outputInfo, element);
						disposables.set(outputInfo.id, disposable);
					}
					break;
				case 'application/vnd.code.notebook.error':
					{
						renderError(outputInfo, element, latestContext);
					}
					break;
				case 'application/vnd.code.notebook.stdout':
				case 'application/x.notebook.stdout':
				case 'application/x.notebook.stream':
					{
						renderStream(outputInfo, element, false, latestContext);
					}
					break;
				case 'application/vnd.code.notebook.stderr':
				case 'application/x.notebook.stderr':
					{
						renderStream(outputInfo, element, true, latestContext);
					}
					break;
				case 'text/plain':
					{
						renderText(outputInfo, element, latestContext);
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
		}
	};
};
