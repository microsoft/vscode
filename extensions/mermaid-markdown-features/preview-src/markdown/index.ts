/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import mermaid, { MermaidConfig } from 'mermaid';
import { buildMermaidConfig, loadExtensionConfig, registerMermaidAddons, renderMermaidBlocksInElement } from '../shared';
import { DiagramManager } from '../shared/diagramManager';
import { IDisposable } from '../shared/disposable';
import { placeSubgraphTitlesIn } from '../shared/subgraphTitles';
import { VsCodeMermaidThemeTracker } from '../shared/vsCodeTheme';

let currentAbortController: AbortController | undefined;
let currentDisposables: IDisposable[] = [];
const diagramManager = new DiagramManager(loadExtensionConfig());
const themeTracker = new VsCodeMermaidThemeTracker();

/**
 * The height that the rendered diagram of each diagram block takes up.
 */
const renderedHeights = new WeakMap<Element, number>();

/**
 * Keeps diagram blocks at the height of their last rendered diagram until the diagram is rendered again.
 *
 * The preview resets every block to its source text when its content updates. A block that collapsed until its diagram
 * was ready would move the rest of the page, and with it the preview's scroll position, on every update.
 */
function reserveRenderedHeights(): void {
	for (const mermaidContainer of document.querySelectorAll<HTMLElement>('.mermaid')) {
		const height = mermaidContainer.parentElement && renderedHeights.get(mermaidContainer.parentElement);
		// A block without source is not rendered again, so nothing would release its height.
		if (height && mermaidContainer.textContent?.trim()) {
			mermaidContainer.style.minHeight = `${height}px`;
		}
	}
}

function rememberRenderedHeight(block: Element, mermaidContainer: HTMLElement): void {
	if (!block.contains(mermaidContainer)) {
		// The preview updated its content again before the diagram was sized.
		return;
	}
	const rendered = mermaidContainer.closest<HTMLElement>('.mermaid-wrapper') ?? mermaidContainer;
	const style = getComputedStyle(rendered);
	renderedHeights.set(block, rendered.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom));
}

async function init() {
	for (const disposable of currentDisposables) {
		disposable.dispose();
	}
	currentDisposables = [];
	reserveRenderedHeights();

	// Abort any in-progress render
	currentAbortController?.abort();
	currentAbortController = new AbortController();
	const signal = currentAbortController.signal;

	// `vscode.markdown.updateContent` fires after theme switches refresh the preview, so resolve
	// the theme variables from the live CSS variables before rebuilding mermaid's config.
	themeTracker.refresh();

	const extConfig = loadExtensionConfig();
	diagramManager.updateConfig(extConfig);

	const config: MermaidConfig = {
		...buildMermaidConfig(extConfig, themeTracker),
		maxTextSize: extConfig.maxTextSize,
	};

	mermaid.initialize(config);
	await registerMermaidAddons();

	const activeIds = new Set<string>();
	await renderMermaidBlocksInElement(document.body, (mermaidContainer, content, _contentHash, isError) => {
		const block = mermaidContainer.parentElement;
		mermaidContainer.style.minHeight = '';
		mermaidContainer.innerHTML = content;
		if (!isError) {
			placeSubgraphTitlesIn(mermaidContainer);
			activeIds.add(mermaidContainer.id);
			currentDisposables.push(diagramManager.setup(mermaidContainer.id, mermaidContainer));
		}
		if (block) {
			// The diagram manager sizes the diagram in the next frame.
			requestAnimationFrame(() => rememberRenderedHeight(block, mermaidContainer));
		}
	}, signal);

	// Clean up saved states for diagrams that no longer exist
	diagramManager.retainStates(activeIds);
}

window.addEventListener('vscode.markdown.updateContent', init);
init();
