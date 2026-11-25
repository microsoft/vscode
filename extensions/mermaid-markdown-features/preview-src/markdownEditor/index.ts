/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { WebEditorClient } from '@vscode/web-editors';
import mermaid from 'mermaid';
import { buildMermaidConfig, createMermaidErrorElement, loadExtensionConfig, registerMermaidAddons, renderMermaidBlocksInElement } from '../shared';
import { placeSubgraphTitlesIn } from '../shared/subgraphTitles';
import { VsCodeMermaidThemeTracker } from '../shared/vsCodeTheme';

// Renders one `mermaid` code block inside the Markdown editor, like the Markdown preview renders it.

const root = document.querySelector('main')!;
const extensionConfig = loadExtensionConfig();
const themeTracker = new VsCodeMermaidThemeTracker();

/**
 * The Markdown editor injects the VS Code theme as CSS variables and a `color-scheme`, but not VS Code's
 * body classes, from which the theme tracker reads whether the theme is dark.
 */
function applyThemeKind(): void {
	const dark = getComputedStyle(document.documentElement).colorScheme.split(/\s+/)[0] === 'dark';
	document.body.classList.toggle('vscode-dark', dark);
	document.body.classList.toggle('vscode-light', !dark);
}

async function main(): Promise<void> {
	applyThemeKind();
	await registerMermaidAddons();
	const client = await WebEditorClient.connect({ connection: 'windowParent' });

	let reportedHeight: number | undefined;
	/**
	 * Reports the diagram's natural height, which depends on the frame width but not on its height. Measured at the
	 * full frame width: a scrollbar would narrow the diagram and shrink the height, so the frame would keep it.
	 */
	const reportSize = () => {
		const diagram = root.firstElementChild;
		if (!diagram) {
			return;
		}
		const svg = diagram.querySelector('svg');
		const viewBox = svg?.viewBox.baseVal;
		const height = Math.ceil(Math.round(100 * (svg && viewBox && viewBox.width > 0
			? Math.min(parseFloat(svg.style.maxWidth) || viewBox.width, document.documentElement.clientWidth) * viewBox.height / viewBox.width
			: diagram.getBoundingClientRect().height)) / 100);
		if (height > 0 && height !== reportedHeight) {
			reportedHeight = height;
			client.reportSize(height);
		}
	};
	const sizeObserver = new ResizeObserver(reportSize);
	sizeObserver.observe(document.documentElement);

	let currentRender: AbortController | undefined;
	const render = async () => {
		currentRender?.abort();
		const abort = currentRender = new AbortController();
		const content = client.getContent();
		mermaid.initialize({ ...buildMermaidConfig(extensionConfig, themeTracker), maxTextSize: extensionConfig.maxTextSize });

		// Render detached and swap in the result, so the previous diagram stays visible while rendering.
		const diagram = document.createElement('div');
		diagram.className = 'mermaid';
		diagram.textContent = typeof content === 'string' ? content : '';
		const staging = document.createElement('div');
		staging.append(diagram);
		root.setAttribute('aria-busy', 'true');
		try {
			await renderMermaidBlocksInElement(staging, (element, html, _contentHash, isError) => {
				element.innerHTML = html;
				if (!isError) {
					placeSubgraphTitlesIn(element);
				}
			}, abort.signal);
		} catch (error) {
			if (abort.signal.aborted) {
				return;
			}
			if (!diagram.hasChildNodes()) {
				diagram.replaceChildren(createMermaidErrorElement(error));
			}
		}
		if (abort.signal.aborted) {
			return;
		}
		// Like the preview: natural width (at most the frame width), height following the aspect ratio.
		diagram.querySelector('svg')?.removeAttribute('height');
		diagram.querySelector('.mermaid-error')?.setAttribute('role', 'alert');
		root.replaceChildren(diagram);
		root.setAttribute('aria-busy', 'false');
		reportSize();
	};

	const contentListener = client.onDidChangeContent(() => { void render(); });
	const themeObserver = new MutationObserver(() => {
		applyThemeKind();
		if (themeTracker.refresh()) {
			void render();
		}
	});
	themeObserver.observe(document.head, { subtree: true, childList: true, characterData: true });
	void render();

	window.addEventListener('pagehide', () => {
		currentRender?.abort();
		contentListener.dispose();
		themeObserver.disconnect();
		sizeObserver.disconnect();
		client.dispose();
	}, { once: true });
}

void main().catch(error => {
	console.error('Mermaid code block editor failed', error);
	const message = createMermaidErrorElement(error);
	message.setAttribute('role', 'alert');
	root.replaceChildren(message);
	root.setAttribute('aria-busy', 'false');
});
