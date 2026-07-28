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
import { vsCodeMermaidTheme, VsCodeMermaidThemeTracker } from './vsCodeTheme';

/**
 * Creates the `<pre class="mermaid-error">` node shown when a diagram fails to render.
 */
export function createMermaidErrorElement(error: unknown): HTMLElement {
	const errorMessageNode = document.createElement('pre');
	errorMessageNode.className = 'mermaid-error';
	errorMessageNode.innerText = getErrorMessage(error);
	return errorMessageNode;
}

/**
 * Extracts a human readable message from a thrown value.
 *
 * Mermaid rejects parse/render failures with a plain object of the shape
 * `{ str, message, hash, error }` rather than a real `Error` instance, so a naive
 * `String(error)` renders the unhelpful `[object Object]` instead of the actual
 * syntax error. Prefer a `message` (or Mermaid's `str`) property when present
 * before falling back.
 */
function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; str?: unknown };
		if (typeof candidate.message === 'string' && candidate.message) {
			return candidate.message;
		}
		if (typeof candidate.str === 'string' && candidate.str) {
			return candidate.str;
		}
	}
	return String(error);
}

/**
 * Merges `mermaidError: true` into the element's `data-vscode-context` so that mermaid-specific
 * context menu commands that don't make sense on an unrendered diagram (like reset pan/zoom)
 * can be hidden.
 */
export function markVsCodeContextAsError(el: HTMLElement): void {
	let context: Record<string, unknown>;
	try {
		context = JSON.parse(el.dataset.vscodeContext || '{}');
	} catch {
		context = {};
	}
	el.dataset.vscodeContext = JSON.stringify({ ...context, mermaidError: true });
}

function renderMermaidElement(
	mermaidContainer: HTMLElement,
	usedIds: Set<string>,
	writeOut: (mermaidContainer: HTMLElement, content: string, isError: boolean) => void,
	signal: AbortSignal,
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
		preventDefaultContextMenuItems: true,
	});
	mermaidContainer.innerHTML = '';

	return {
		containerId,
		contentHash,
		p: (async () => {
			try {
				// Catch any parsing errors
				await mermaid.parse(source);
				if (signal.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				//  Render the diagram
				const renderResult = await mermaid.render(diagramId, source);
				if (signal.aborted) {
					throw new DOMException('Aborted', 'AbortError');
				}

				writeOut(mermaidContainer, renderResult.svg, false);
				renderResult.bindFunctions?.(mermaidContainer);
			} catch (error) {
				if (error instanceof Error && error.name !== 'AbortError') {
					markVsCodeContextAsError(mermaidContainer);
					writeOut(mermaidContainer, createMermaidErrorElement(error).outerHTML, true);
				}

				throw error;
			}
		})()
	};
}

export async function renderMermaidBlocksInElement(
	root: HTMLElement,
	writeOut: (mermaidContainer: HTMLElement, content: string, contentHash: string, isError: boolean) => void,
	signal: AbortSignal,
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
		const result = renderMermaidElement(mermaidContainer, usedIds, (container, content, isError) => {
			writeOut(container, content, result!.contentHash, isError);
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

export const defaultExtensionConfig: MermaidExtensionConfig = {
	darkModeTheme: vsCodeMermaidTheme,
	lightModeTheme: vsCodeMermaidTheme,
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
		return defaultExtensionConfig;
	}

	try {
		return { ...defaultExtensionConfig, ...JSON.parse(configAttr) };
	} catch {
		return defaultExtensionConfig;
	}
}

export function buildMermaidConfig(
	extensionConfig: MermaidExtensionConfig,
	vsCodeThemeTracker: VsCodeMermaidThemeTracker,
): MermaidConfig {
	return {
		startOnLoad: false,
		...vsCodeThemeTracker.resolveMermaidTheme(extensionConfig),
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
