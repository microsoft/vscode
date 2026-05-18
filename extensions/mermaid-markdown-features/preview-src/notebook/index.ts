/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import type { RendererContext } from 'vscode-notebook-renderer';
import { extendMarkdownItWithMermaid } from '../../src/markdownMermaid/markdownIt';
import { loadExtensionConfig, loadMermaidConfig, registerMermaidAddons, renderMermaidBlocksInElement } from '../shared';
import { DiagramManager } from '../shared/diagramManager';

interface MarkdownItRenderer {
	extendMarkdownIt(fn: (md: MarkdownIt) => void): void;
}

export async function activate(ctx: RendererContext<void>) {
	const markdownItRenderer = await ctx.getRenderer('vscode.markdown-it-renderer') as MarkdownItRenderer | undefined;
	if (!markdownItRenderer) {
		throw new Error(`Could not load 'vscode.markdown-it-renderer'`);
	}

	mermaid.initialize(loadMermaidConfig());
	await registerMermaidAddons();

	markdownItRenderer.extendMarkdownIt((md: MarkdownIt) => {
		extendMarkdownItWithMermaid(md, { languageIds: () => ['mermaid'] });

		const diagramManager = new DiagramManager(loadExtensionConfig());

		const render = md.renderer.render;
		md.renderer.render = function (tokens, options, env) {
			const result = render.call(this, tokens, options, env);
			const shadowRoot = document.getElementById(env?.outputItem.id)?.shadowRoot;

			diagramManager.updateConfig(loadExtensionConfig());

			const temp = document.createElement('div');
			temp.innerHTML = result;
			renderMermaidBlocksInElement(temp, (mermaidContainer, content) => {
				const liveEl = shadowRoot?.getElementById(mermaidContainer.id);
				if (liveEl) {
					liveEl.dataset.vscodeContext = mermaidContainer.dataset.vscodeContext ?? '';
					liveEl.innerHTML = content;
					diagramManager.setup(liveEl.id, liveEl);
				} else {
					console.warn('Could not find live element to render mermaid to');
				}
			});
			return temp.innerHTML;
		};
		return md;
	});
}
