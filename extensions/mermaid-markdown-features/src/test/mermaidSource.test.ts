/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { describe, it } from 'node:test';
import { hasRenderedMermaidOutput, MermaidSourceContainer, resolveMermaidSource } from '../markdownMermaid/mermaidSource';

function createContainer(options: {
	text?: string;
	canonical?: string;
	contextSource?: string;
	child?: 'svg' | 'error' | 'none';
}): MermaidSourceContainer {
	const dataset: MermaidSourceContainer['dataset'] = {};
	if (options.canonical) {
		dataset.vscodeMermaidSource = options.canonical;
	}
	if (options.contextSource) {
		dataset.vscodeContext = JSON.stringify({ mermaidSource: options.contextSource });
	}

	return {
		textContent: options.text ?? '',
		dataset,
		querySelector(_selectors: string) {
			if (options.child === 'svg' || options.child === 'error') {
				return {};
			}
			return null;
		},
	};
}

describe('resolveMermaidSource', () => {
	it('uses clean text on first render and persists it', () => {
		const container = createContainer({ text: 'flowchart TD\n  A --> B' });
		assert.strictEqual(resolveMermaidSource(container), 'flowchart TD\n  A --> B');
		assert.strictEqual(container.dataset.vscodeMermaidSource, 'flowchart TD\n  A --> B');
	});

	it('does not treat valid source containing flowchartTitleText as rendered output', () => {
		const container = createContainer({
			text: 'flowchart TD\nflowchartTitleText --> B',
			child: 'none',
		});
		assert.strictEqual(hasRenderedMermaidOutput(container), false);
		assert.strictEqual(resolveMermaidSource(container), 'flowchart TD\nflowchartTitleText --> B');
	});

	it('falls back to data-vscode-mermaid-source when SVG pollutes textContent', () => {
		const container = createContainer({
			text: '#dmermaid-abc @keyframes flash { from { opacity: 0 } }',
			canonical: 'flowchart TD\n  A --> B',
			child: 'svg',
		});
		assert.strictEqual(resolveMermaidSource(container), 'flowchart TD\n  A --> B');
	});

	it('falls back to vscodeContext.mermaidSource when dataset is missing', () => {
		const container = createContainer({
			text: '#dmermaid-abc @keyframes flash { from { opacity: 0 } }',
			contextSource: 'sequenceDiagram\n  A->>B: hi',
			child: 'svg',
		});
		assert.strictEqual(resolveMermaidSource(container), 'sequenceDiagram\n  A->>B: hi');
		assert.strictEqual(container.dataset.vscodeMermaidSource, 'sequenceDiagram\n  A->>B: hi');
	});

	it('does not overwrite canonical source with mermaid-error text', () => {
		const container = createContainer({
			text: 'No diagram type detected matching given configuration for text: #dmermaid-…',
			canonical: 'flowchart TD\n  A --> B',
			child: 'error',
		});
		assert.strictEqual(resolveMermaidSource(container), 'flowchart TD\n  A --> B');
	});

	it('returns empty string when no source can be recovered', () => {
		const container = createContainer({
			text: '#dmermaid-abc @keyframes flash',
			child: 'svg',
		});
		assert.strictEqual(resolveMermaidSource(container), '');
	});
});
