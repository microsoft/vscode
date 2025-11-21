/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import mermaid, { MermaidConfig } from 'mermaid';

function getMermaidTheme() {
	return document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')
		? 'dark'
		: 'default';
}

type State = {
	readonly diagramText: string;
	readonly theme: 'dark' | 'default';
};

let state: State | undefined = undefined;

function init() {
	const diagram = document.querySelector('.mermaid');
	if (!diagram) {
		return;
	}

	const theme = getMermaidTheme();
	state = {
		diagramText: diagram.textContent ?? '',
		theme
	};

	const config: MermaidConfig = {
		startOnLoad: true,
		theme,
	};
	mermaid.initialize(config);
}

function tryUpdate() {
	const newTheme = getMermaidTheme();
	if (state?.theme === newTheme) {
		return;
	}

	const diagramNode = document.querySelector('.mermaid');
	if (!diagramNode || !(diagramNode instanceof HTMLElement)) {
		return;
	}

	state = {
		diagramText: state?.diagramText ?? '',
		theme: newTheme
	};

	// Re-render
	diagramNode.textContent = state?.diagramText ?? '';
	delete diagramNode.dataset.processed;

	mermaid.initialize({
		theme: newTheme,
	});
	mermaid.run({
		nodes: [diagramNode]
	});
}

// Update when theme changes
new MutationObserver(() => {
	tryUpdate();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

init();

