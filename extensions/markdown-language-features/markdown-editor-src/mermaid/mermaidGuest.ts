/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebEditorClient } from '@vscode/web-editors';
import mermaid from 'mermaid';

const container = document.querySelector('main')!;

function showError(error: unknown): void {
	console.error('Markdown Mermaid rendering failed', error);
	const message = document.createElement('pre');
	message.setAttribute('role', 'alert');
	message.textContent = `Failed to render Mermaid diagram: ${error instanceof Error ? error.message : String(error)}`;
	container.replaceChildren(message);
	container.setAttribute('aria-busy', 'false');
}

async function main(): Promise<void> {
	mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict', suppressErrorRendering: true });
	const client = await WebEditorClient.connect({ connection: 'windowParent' });
	let revision = 0;
	let disposed = false;
	let reportedHeight: number | undefined;
	const reportSize = () => {
		const svg = container.querySelector('svg');
		if (!svg) { return; }
		const bounds = svg.viewBox.baseVal;
		if (bounds.width <= 0 || bounds.height <= 0) { return; }
		const height = Math.ceil(container.clientWidth * bounds.height / bounds.width);
		if (height !== reportedHeight) {
			reportedHeight = height;
			client.reportSize(height);
		}
	};
	const render = async () => {
		const current = ++revision;
		const content = client.getContent();
		container.setAttribute('aria-busy', 'true');
		try {
			if (typeof content !== 'string') { throw new Error('Mermaid content must be text.'); }
			const { svg } = await mermaid.render(`mermaid-${current}`, content);
			if (disposed || current !== revision) { return; }
			container.innerHTML = svg;
			container.setAttribute('aria-busy', 'false');
			reportSize();
		} catch (error) {
			if (!disposed && current === revision) {
				showError(error);
			}
		}
	};
	const subscription = client.onDidChangeContent(() => { void render(); });
	const observer = new ResizeObserver(reportSize);
	observer.observe(container);
	void render();
	window.addEventListener('pagehide', () => {
		disposed = true;
		subscription.dispose();
		observer.disconnect();
		client.dispose();
	}, { once: true });
}

void main().catch(showError);
