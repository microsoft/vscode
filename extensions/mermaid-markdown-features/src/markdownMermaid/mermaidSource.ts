/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal container surface used to recover Mermaid source after preview rerenders.
 *
 * After the first render, morphdom may leave SVG (and its embedded `<style>`) inside
 * `.mermaid`, so `textContent` is no longer safe to feed back into Mermaid.
 */
export interface MermaidSourceContainer {
	textContent: string | null;
	dataset: {
		vscodeMermaidSource?: string;
		vscodeContext?: string;
	};
	querySelector(selectors: string): unknown;
}

export function hasRenderedMermaidOutput(mermaidContainer: MermaidSourceContainer): boolean {
	return !!mermaidContainer.querySelector(':scope > svg, :scope > .mermaid-error');
}

/**
 * Resolve the canonical Mermaid source for a container.
 *
 * Preference order:
 * 1. Live text when the container has not yet been rendered (or was replaced with fresh Markdown HTML)
 * 2. `data-vscode-mermaid-source` persisted from a prior successful resolution / markdown-it
 * 3. `mermaidSource` embedded in `data-vscode-context` (clipboard / context-menu path)
 */
export function resolveMermaidSource(mermaidContainer: MermaidSourceContainer): string {
	const rawText = (mermaidContainer.textContent ?? '').trim();

	if (rawText && !hasRenderedMermaidOutput(mermaidContainer)) {
		mermaidContainer.dataset.vscodeMermaidSource = rawText;
		return rawText;
	}

	const canonicalSource = (mermaidContainer.dataset.vscodeMermaidSource ?? '').trim();
	if (canonicalSource) {
		return canonicalSource;
	}

	try {
		const context = JSON.parse(mermaidContainer.dataset.vscodeContext || '{}') as { mermaidSource?: string };
		if (typeof context.mermaidSource === 'string') {
			const source = context.mermaidSource.trim();
			if (source) {
				mermaidContainer.dataset.vscodeMermaidSource = source;
				return source;
			}
		}
	} catch {
		// fall through
	}

	return '';
}
