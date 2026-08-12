/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import mermaid, { MermaidConfig } from 'mermaid';
import { buildMermaidConfig, loadExtensionConfig, registerMermaidAddons, renderMermaidBlocksInElement } from '../shared';
import { DiagramManager } from '../shared/diagramManager';
import { IDisposable } from '../shared/disposable';
import { VsCodeMermaidThemeTracker } from '../shared/vsCodeTheme';

let currentAbortController: AbortController | undefined;
let currentDisposables: IDisposable[] = [];
const diagramManager = new DiagramManager(loadExtensionConfig());
const themeTracker = new VsCodeMermaidThemeTracker();

async function init() {
	for (const disposable of currentDisposables) {
		disposable.dispose();
	}
	currentDisposables = [];

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
		mermaidContainer.innerHTML = content;
		if (isError) {
			return;
		}
		activeIds.add(mermaidContainer.id);
		currentDisposables.push(diagramManager.setup(mermaidContainer.id, mermaidContainer));
	}, signal);

	// Clean up saved states for diagrams that no longer exist
	diagramManager.retainStates(activeIds);
}

window.addEventListener('vscode.markdown.updateContent', init);
init();
