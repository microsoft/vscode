/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import elkLayouts from '@mermaid-js/layout-elk';
import tidyTreeLayouts from '@mermaid-js/layout-tidy-tree';
import zenuml from '@mermaid-js/mermaid-zenuml';
import mermaid, { MermaidConfig } from 'mermaid';
import { iconPacks } from './iconPackConfig';
import { ClickDragMode, MermaidExtensionConfig, ShowControlsMode } from './config';

function renderMermaidElement(
	mermaidContainer: HTMLElement,
	usedIds: Set<string>,
	writeOut: (mermaidContainer: HTMLElement, content: string) => void,
	signal?: AbortSignal,
): {
	containerId: string;
	contentHash: string;
	p: Promise<void>;
} | undefined {
	const source = (mermaidContainer.textContent ?? '').trim();
	if (!source) {
		return;
	}

	const contentHash = hashString(source);
	const containerId = generateContentId(source, usedIds);
	const diagramId = `d${containerId}`;

	mermaidContainer.id = containerId;
	mermaidContainer.dataset.vscodeContext = JSON.stringify({
		webviewSection: 'mermaid',
		mermaidSource: source,
	});
	mermaidContainer.innerHTML = '';

	return {
		containerId,
		contentHash,
		p: (async () => {
			try {
				// Catch any parsing errors
				await mermaid.parse(source);
				if (signal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				//  Render the diagram
				const renderResult = await mermaid.render(diagramId, source);
				if (signal?.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				writeOut(mermaidContainer, renderResult.svg);
				renderResult.bindFunctions?.(mermaidContainer);
			} catch (error) {
				if (error instanceof Error && error.name !== 'AbortError') {
					const errorMessageNode = document.createElement('pre');
					errorMessageNode.className = 'mermaid-error';
					errorMessageNode.innerText = error.message;
					writeOut(mermaidContainer, errorMessageNode.outerHTML);
				}

				throw error;
			}
		})()
	};
}

export async function renderMermaidBlocksInElement(
	root: HTMLElement,
	writeOut: (mermaidContainer: HTMLElement, content: string, contentHash: string) => void,
	signal?: AbortSignal
): Promise<void> {
	// Track used IDs for this render pass
	const usedIds = new Set<string>();

	// Delete existing mermaid outputs
	for (const el of root.querySelectorAll('.mermaid > svg')) {
		el.remove();
	}
	for (const svg of root.querySelectorAll('svg')) {
		if (svg.parentElement?.id.startsWith('dmermaid')) {
			svg.parentElement.remove();
		}
	}

	// We need to generate all the container ids sync, but then do the actual rendering async
	const renderPromises: Array<Promise<void>> = [];
	for (const mermaidContainer of root.querySelectorAll<HTMLElement>('.mermaid')) {
		const result = renderMermaidElement(mermaidContainer, usedIds, (container, content) => {
			writeOut(container, content, result!.contentHash);
		}, signal);
		if (result) {
			renderPromises.push(result.p);
		}
	}

	await Promise.all(renderPromises);
}

export async function registerMermaidAddons() {
	mermaid.registerIconPacks(iconPacks);
	mermaid.registerLayoutLoaders(elkLayouts);
	mermaid.registerLayoutLoaders(tidyTreeLayouts);
	await mermaid.registerExternalDiagrams([zenuml]);
}

const defaultConfig: MermaidExtensionConfig = {
	darkModeTheme: 'dark',
	lightModeTheme: 'default',
	maxTextSize: 50000,
	clickDrag: ClickDragMode.Alt,
	showControls: ShowControlsMode.OnHoverOrFocus,
	resizable: true,
	maxHeight: '',
};

export function loadExtensionConfig(): MermaidExtensionConfig {
	const configSpan = document.getElementById('markdown-mermaid');
	const configAttr = configSpan?.dataset.config;
	if (!configAttr) {
		return defaultConfig;
	}

	try {
		return { ...defaultConfig, ...JSON.parse(configAttr) };
	} catch {
		return defaultConfig;
	}
}

export function loadMermaidConfig(): MermaidConfig {
	const config = loadExtensionConfig();
	return {
		startOnLoad: false,
		theme: (document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')
			? config.darkModeTheme
			: config.lightModeTheme) as MermaidConfig['theme'],
	};
}

/**
 * Generate a simple hash from a string for content-based IDs.
 * Uses a fast non-cryptographic hash suitable for deduplication.
 */
function hashString(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	// Convert to hex and ensure positive
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function generateContentId(source: string, usedIds: Set<string>): string {
	const hash = hashString(source);
	let id = `mermaid-${hash}`;
	let counter = 0;

	// Handle collisions by appending a counter
	while (usedIds.has(id)) {
		counter++;
		id = `mermaid-${hash}-${counter}`;
	}

	usedIds.add(id);
	return id;
}
