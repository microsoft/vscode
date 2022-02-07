/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ActivationFunction, OutputItem } from 'vscode-notebook-renderer';

interface IDisposable {
	dispose(): void;
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

function renderHTML(outputInfo: OutputItem, container: HTMLElement): void {
	const htmlContent = outputInfo.text();
	const element = document.createElement('div');
	const trustedHtml = ttPolicy?.createHTML(htmlContent) ?? htmlContent;
	element.innerHTML = trustedHtml as string;
	container.appendChild(element);
	domEval(element);
}

function renderJavascript(outputInfo: OutputItem, container: HTMLElement): void {
	const str = outputInfo.text();
	const scriptVal = `<script type="application/javascript">${str}</script>`;
	const element = document.createElement('div');
	const trustedHtml = ttPolicy?.createHTML(scriptVal) ?? scriptVal;
	element.innerHTML = trustedHtml as string;
	container.appendChild(element);
	domEval(element);
}

export const activate: ActivationFunction<void> = (ctx) => {
	const disposables = new Map<string, IDisposable>();

	return {
		renderOutputItem: (outputInfo, element) => {
			switch (outputInfo.mime) {
				case 'text/html':
				case 'image/svg+xml':
					{
						if (!ctx.workspace.isTrusted) {
							return;
						}

						renderHTML(outputInfo, element);
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
					{
						const disposable = renderImage(outputInfo, element);
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
		}
	};
};
