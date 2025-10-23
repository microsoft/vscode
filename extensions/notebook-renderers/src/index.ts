/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ActivationFunction, OutputItem, RendererContext } from 'vscode-notebook-renderer';
import { createOutputContent, appendOutput, scrollableClass } from './textHelper';
import { HtmlRenderingHook, IDisposable, IRichRenderContext, JavaScriptRenderingHook, OutputWithAppend, RenderOptions } from './rendererTypes';
import { ttPolicy } from './htmlHelper';
import { formatStackTrace } from './stackTraceHelper';

function clearContainer(container: HTMLElement) {
	while (container.firstChild) {
		container.firstChild.remove();
	}
}

function renderImage(outputInfo: OutputItem, element: HTMLElement): IDisposable {
	const blob = new Blob([outputInfo.data() as Uint8Array<ArrayBuffer>], { type: outputInfo.mime });
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
	const alt = getAltText(outputInfo);
	if (alt) {
		image.alt = alt;
	}
	image.setAttribute('data-vscode-context', JSON.stringify({
		webviewSection: 'image',
		outputId: outputInfo.id,
		'preventDefaultContextMenuItems': true
	}));
	const display = document.createElement('div');
	display.classList.add('display');
	display.appendChild(image);
	element.appendChild(display);

	return disposable;
}

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
				// eslint-disable-next-line local/code-no-any-casts
				scriptTag.setAttribute(key, val as any);
			}
		}

		// TODO@connor4312: should script with src not be removed?
		container.appendChild(scriptTag).parentNode!.removeChild(scriptTag);
	}
};

function getAltText(outputInfo: OutputItem) {
	const metadata = outputInfo.metadata;
	if (typeof metadata === 'object' && metadata && 'vscode_altText' in metadata && typeof metadata.vscode_altText === 'string') {
		return metadata.vscode_altText;
	}
	return undefined;
}

function fixUpSvgElement(outputInfo: OutputItem, element: HTMLElement) {
	if (outputInfo.mime.indexOf('svg') > -1) {
		const svgElement = element.querySelector('svg');
		const altText = getAltText(outputInfo);
		if (svgElement && altText) {
			const title = document.createElement('title');
			title.innerText = altText;
			svgElement.prepend(title);
		}

		if (svgElement) {
			svgElement.classList.add('output-image');

			svgElement.setAttribute('data-vscode-context', JSON.stringify({
				webviewSection: 'image',
				outputId: outputInfo.id,
				'preventDefaultContextMenuItems': true
			}));
		}
	}
}

async function renderHTML(outputInfo: OutputItem, container: HTMLElement, signal: AbortSignal, hooks: Iterable<HtmlRenderingHook>): Promise<void> {
	clearContainer(container);
	let element: HTMLElement = document.createElement('div');
	const htmlContent = outputInfo.text();
	const trustedHtml = ttPolicy?.createHTML(htmlContent) ?? htmlContent;
	element.innerHTML = trustedHtml as string;
	fixUpSvgElement(outputInfo, element);

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
	outputElement: HTMLElement,
	ctx: IRichRenderContext,
	trustHtml: boolean
): IDisposable {
	const disposableStore = createDisposableStore();

	clearContainer(outputElement);

	type ErrorLike = Partial<Error>;

	let err: ErrorLike;
	try {
		err = <ErrorLike>JSON.parse(outputInfo.text());
	} catch (e) {
		console.log(e);
		return disposableStore;
	}

	const headerMessage = err.name && err.message ? `${err.name}: ${err.message}` : err.name || err.message;

	if (err.stack) {
		const minimalError = ctx.settings.minimalError && !!headerMessage?.length;
		outputElement.classList.add('traceback');

		const { formattedStack, errorLocation } = formatStackTrace(err.stack, trustHtml);

		const outputScrolling = !minimalError && scrollingEnabled(outputInfo, ctx.settings);
		const lineLimit = minimalError ? 1000 : ctx.settings.lineLimit;
		const outputOptions = { linesLimit: lineLimit, scrollable: outputScrolling, trustHtml, linkifyFilePaths: false };

		const content = createOutputContent(outputInfo.id, formattedStack, outputOptions);
		const stackTraceElement = document.createElement('div');
		stackTraceElement.appendChild(content);
		outputElement.classList.toggle('word-wrap', ctx.settings.outputWordWrap);
		disposableStore.push(ctx.onDidChangeSettings(e => {
			outputElement.classList.toggle('word-wrap', e.outputWordWrap);
		}));

		if (minimalError) {
			createMinimalError(errorLocation, headerMessage, stackTraceElement, outputElement);
		} else {
			stackTraceElement.classList.toggle('scrollable', outputScrolling);
			outputElement.appendChild(stackTraceElement);
			initializeScroll(stackTraceElement, disposableStore);
		}
	} else {
		const header = document.createElement('div');
		if (headerMessage) {
			header.innerText = headerMessage;
			outputElement.appendChild(header);
		}
	}

	outputElement.classList.add('error');
	return disposableStore;
}

function createMinimalError(errorLocation: string | undefined, headerMessage: string, stackTrace: HTMLDivElement, outputElement: HTMLElement) {
	const outputDiv = document.createElement('div');
	const headerSection = document.createElement('div');
	headerSection.classList.add('error-output-header');

	if (errorLocation && errorLocation.indexOf('<a') === 0) {
		headerSection.innerHTML = errorLocation;
	}
	const header = document.createElement('span');
	header.innerText = headerMessage;
	headerSection.appendChild(header);
	outputDiv.appendChild(headerSection);

	function addButton(linkElement: HTMLElement) {
		const button = document.createElement('li');
		button.appendChild(linkElement);
		// the :hover css selector doesn't work in the webview,
		// so we need to add the hover class manually
		button.onmouseover = function () {
			button.classList.add('hover');
		};
		button.onmouseout = function () {
			button.classList.remove('hover');
		};
		return button;
	}

	const buttons = document.createElement('ul');
	buttons.classList.add('error-output-actions');
	outputDiv.appendChild(buttons);

	const toggleStackLink = document.createElement('a');
	toggleStackLink.innerText = 'Show Details';
	toggleStackLink.href = '#!';
	buttons.appendChild(addButton(toggleStackLink));

	toggleStackLink.onclick = (e) => {
		e.preventDefault();
		const hidden = stackTrace.style.display === 'none';
		stackTrace.style.display = hidden ? '' : 'none';
		toggleStackLink.innerText = hidden ? 'Hide Details' : 'Show Details';
	};

	outputDiv.appendChild(stackTrace);
	stackTrace.style.display = 'none';
	outputElement.appendChild(outputDiv);
}

function getPreviousMatchingContentGroup(outputElement: HTMLElement) {
	const outputContainer = outputElement.parentElement;
	let match: HTMLElement | undefined = undefined;

	let previous = outputContainer?.previousSibling;
	while (previous) {
		const outputElement = (previous.firstChild as HTMLElement | null);
		if (!outputElement || !outputElement.classList.contains('output-stream')) {
			break;
		}

		match = outputElement.firstChild as HTMLElement;
		previous = previous?.previousSibling;
	}

	return match;
}

function onScrollHandler(e: globalThis.Event) {
	const target = e.target as HTMLElement;
	if (target.scrollTop === 0) {
		target.classList.remove('more-above');
	} else {
		target.classList.add('more-above');
	}
}

function onKeypressHandler(e: KeyboardEvent) {
	if (e.ctrlKey || e.shiftKey) {
		return;
	}
	if (e.code === 'ArrowDown' || e.code === 'ArrowUp' ||
		e.code === 'End' || e.code === 'Home' ||
		e.code === 'PageUp' || e.code === 'PageDown') {
		// These should change the scroll position, not adjust the selected cell in the notebook
		e.stopPropagation();
	}
}

// if there is a scrollable output, it will be scrolled to the given value if provided or the bottom of the element
function initializeScroll(scrollableElement: HTMLElement, disposables: DisposableStore, scrollTop?: number) {
	if (scrollableElement.classList.contains(scrollableClass)) {
		const scrollbarVisible = scrollableElement.scrollHeight > scrollableElement.clientHeight;
		scrollableElement.classList.toggle('scrollbar-visible', scrollbarVisible);
		scrollableElement.scrollTop = scrollTop !== undefined ? scrollTop : scrollableElement.scrollHeight;
		if (scrollbarVisible) {
			scrollableElement.addEventListener('scroll', onScrollHandler);
			disposables.push({ dispose: () => scrollableElement.removeEventListener('scroll', onScrollHandler) });
			scrollableElement.addEventListener('keydown', onKeypressHandler);
			disposables.push({ dispose: () => scrollableElement.removeEventListener('keydown', onKeypressHandler) });
		}
	}
}

// Find the scrollTop of the existing scrollable output, return undefined if at the bottom or element doesn't exist
function findScrolledHeight(container: HTMLElement): number | undefined {
	const scrollableElement = container.querySelector('.' + scrollableClass);
	if (scrollableElement && scrollableElement.scrollHeight - scrollableElement.scrollTop - scrollableElement.clientHeight > 2) {
		// not scrolled to the bottom
		return scrollableElement.scrollTop;
	}
	return undefined;
}

function scrollingEnabled(output: OutputItem, options: RenderOptions) {
	const metadata = output.metadata;
	return (typeof metadata === 'object' && metadata
		&& 'scrollable' in metadata && typeof metadata.scrollable === 'boolean') ?
		metadata.scrollable : options.outputScrolling;
}

//  div.cell_container
//    div.output_container
//      div.output.output-stream		<-- outputElement parameter
//        div.scrollable? tabindex="0" 	<-- contentParent
//          div output-item-id="{guid}"	<-- content from outputItem parameter
function renderStream(outputInfo: OutputWithAppend, outputElement: HTMLElement, error: boolean, ctx: IRichRenderContext): IDisposable {
	const disposableStore = createDisposableStore();
	const outputScrolling = scrollingEnabled(outputInfo, ctx.settings);
	const outputOptions = { linesLimit: ctx.settings.lineLimit, scrollable: outputScrolling, trustHtml: false, error, linkifyFilePaths: ctx.settings.linkifyFilePaths };

	outputElement.classList.add('output-stream');

	const scrollTop = outputScrolling ? findScrolledHeight(outputElement) : undefined;

	const previousOutputParent = getPreviousMatchingContentGroup(outputElement);
	// If the previous output item for the same cell was also a stream, append this output to the previous
	if (previousOutputParent) {
		const existingContent = previousOutputParent.querySelector(`[output-item-id="${outputInfo.id}"]`) as HTMLElement | null;
		if (existingContent) {
			appendOutput(outputInfo, existingContent, outputOptions);
		} else {
			const newContent = createOutputContent(outputInfo.id, outputInfo.text(), outputOptions);
			previousOutputParent.appendChild(newContent);
		}
		previousOutputParent.classList.toggle('scrollbar-visible', previousOutputParent.scrollHeight > previousOutputParent.clientHeight);
		previousOutputParent.scrollTop = scrollTop !== undefined ? scrollTop : previousOutputParent.scrollHeight;
	} else {
		const existingContent = outputElement.querySelector(`[output-item-id="${outputInfo.id}"]`) as HTMLElement | null;
		let contentParent = existingContent?.parentElement;
		if (existingContent && contentParent) {
			appendOutput(outputInfo, existingContent, outputOptions);
		} else {
			const newContent = createOutputContent(outputInfo.id, outputInfo.text(), outputOptions);
			contentParent = document.createElement('div');
			contentParent.appendChild(newContent);
			while (outputElement.firstChild) {
				outputElement.firstChild.remove();
			}
			outputElement.appendChild(contentParent);
		}

		contentParent.classList.toggle('scrollable', outputScrolling);
		outputElement.classList.toggle('word-wrap', ctx.settings.outputWordWrap);
		disposableStore.push(ctx.onDidChangeSettings(e => {
			outputElement.classList.toggle('word-wrap', e.outputWordWrap);
		}));

		initializeScroll(contentParent, disposableStore, scrollTop);
	}

	return disposableStore;
}

function renderText(outputInfo: OutputItem, outputElement: HTMLElement, ctx: IRichRenderContext): IDisposable {
	const disposableStore = createDisposableStore();
	clearContainer(outputElement);

	const text = outputInfo.text();
	const outputScrolling = scrollingEnabled(outputInfo, ctx.settings);
	const outputOptions = { linesLimit: ctx.settings.lineLimit, scrollable: outputScrolling, trustHtml: false, linkifyFilePaths: ctx.settings.linkifyFilePaths };
	const content = createOutputContent(outputInfo.id, text, outputOptions);
	content.classList.add('output-plaintext');
	content.classList.toggle('word-wrap', ctx.settings.outputWordWrap);
	disposableStore.push(ctx.onDidChangeSettings(e => {
		content.classList.toggle('word-wrap', e.outputWordWrap);
	}));

	content.classList.toggle('scrollable', outputScrolling);
	outputElement.appendChild(content);
	initializeScroll(content, disposableStore);

	return disposableStore;
}

export const activate: ActivationFunction<void> = (ctx) => {
	const disposables = new Map<string, IDisposable>();
	const htmlHooks = new Set<HtmlRenderingHook>();
	const jsHooks = new Set<JavaScriptRenderingHook>();

	const latestContext = ctx as (RendererContext<void> & { readonly settings: RenderOptions; readonly onDidChangeSettings: Event<RenderOptions> });

	const style = document.createElement('style');
	style.textContent = `
	#container div.output.remove-padding {
		padding-left: 0;
		padding-right: 0;
	}
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
	#container div.output_container .word-wrap {
		white-space: pre-wrap;
	}
	#container div.output>div {
		padding-left: var(--notebook-output-node-left-padding);
		padding-right: var(--notebook-output-node-padding);
		box-sizing: border-box;
		border-width: 1px;
		border-style: solid;
		border-color: transparent;
	}
	#container div.output>div:focus {
		outline: 0;
		border-color: var(--theme-input-focus-border-color);
	}
	#container div.output .scrollable {
		overflow-y: auto;
		max-height: var(--notebook-cell-output-max-height);
	}
	#container div.output .scrollable.scrollbar-visible {
		border-color: var(--vscode-editorWidget-border);
	}
	#container div.output .scrollable.scrollbar-visible:focus {
		border-color: var(--theme-input-focus-border-color);
	}
	#container div.truncation-message {
		font-style: italic;
		font-family: var(--theme-font-family);
		padding-top: 4px;
	}
	#container div.output .scrollable div {
		cursor: text;
	}
	#container div.output .scrollable div a {
		cursor: pointer;
	}
	#container div.output .scrollable.more-above {
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
	#container ul.error-output-actions {
		margin: 0px;
		padding: 6px 0px 0px 6px;
		padding-inline-start: 0px;
	}
	#container .error-output-actions li {
		padding: 0px 4px 0px 4px;
		border-radius: 5px;
		height: 20px;
		display: inline-flex;
		cursor: pointer;
		border: solid 1px var(--vscode-notebook-cellToolbarSeparator);
	}
	#container .error-output-actions li.hover {
		background-color: var(--vscode-toolbar-hoverBackground);
	}
	#container .error-output-actions li:focus-within {
		border-color: var(--theme-input-focus-border-color);
	}
	#container .error-output-actions a:focus {
		outline: 0;
	}
	#container .error-output-actions li a {
		color: var(--vscode-foreground);
		text-decoration: none;
	}
	#container .error-output-header a {
		padding-right: 12px;
	}
	`;
	document.body.appendChild(style);

	return {
		renderOutputItem: async (outputInfo, element, signal?: AbortSignal) => {
			element.classList.add('remove-padding');
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
						const disposable = renderError(outputInfo, element, latestContext, ctx.workspace.isTrusted);
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
					if (outputInfo.mime.indexOf('text/') > -1) {
						disposables.get(outputInfo.id)?.dispose();
						const disposable = renderText(outputInfo, element, latestContext);
						disposables.set(outputInfo.id, disposable);
					}
					break;
			}
			if (element.querySelector('div')) {
				element.querySelector('div')!.tabIndex = 0;
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
