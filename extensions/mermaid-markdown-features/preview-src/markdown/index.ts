/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import mermaid, { MermaidConfig } from 'mermaid';
import { loadExtensionConfig, registerMermaidAddons, renderMermaidBlocksInElement } from '../shared';
import { DiagramManager } from '../shared/diagramManager';
import { IDisposable } from '../shared/disposable';

let currentAbortController: AbortController | undefined;
let currentDisposables: IDisposable[] = [];
const diagramManager = new DiagramManager(loadExtensionConfig());

async function init() {
	for (const disposable of currentDisposables) {
		disposable.dispose();
	}
	currentDisposables = [];

	// Abort any in-progress render
	currentAbortController?.abort();
	currentAbortController = new AbortController();
	const signal = currentAbortController.signal;

	const extConfig = loadExtensionConfig();
	diagramManager.updateConfig(extConfig);

	const config: MermaidConfig = {
		startOnLoad: false,
		maxTextSize: extConfig.maxTextSize,
		theme: (document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')
			? extConfig.darkModeTheme
			: extConfig.lightModeTheme) as MermaidConfig['theme'],
	};

	mermaid.initialize(config);
	await registerMermaidAddons();

	const activeIds = new Set<string>();
	await renderMermaidBlocksInElement(document.body, (mermaidContainer, content) => {
		mermaidContainer.innerHTML = content;
		activeIds.add(mermaidContainer.id);
		currentDisposables.push(diagramManager.setup(mermaidContainer.id, mermaidContainer));
	}, signal);

	// Clean up saved states for diagrams that no longer exist
	diagramManager.retainStates(activeIds);
}

window.addEventListener('vscode.markdown.updateContent', init);
init();
