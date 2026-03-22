/** @jsxImportSource preact */

import { useLayoutEffect } from 'preact/hooks';
import type { FromWebviewMessage, RenderableBlock } from '../../src/protocol/types';
import { SelectionCommentPlus } from './SelectionCommentPlus';

interface VsApi {
	postMessage(message: FromWebviewMessage): void;
}

export interface MarkdownPreviewPanelProps {
	readonly blocks: readonly RenderableBlock[];
	readonly vscode: VsApi;
}

let mermaidInitialized = false;

function vscodeThemeIsDark(): boolean {
	if (typeof document === 'undefined') {
		return false;
	}
	return (
		document.body.classList.contains('vscode-dark') ||
		document.body.classList.contains('vscode-high-contrast') ||
		document.documentElement.classList.contains('vscode-dark')
	);
}

/**
 * Markdown-it renders ```mermaid as `<pre><code class="language-mermaid">`. Mermaid expects
 * `<div class="mermaid">` (or `<pre class="mermaid">`). Convert, then run the bundled renderer.
 */
function useMermaidAfterBlocks(blocks: readonly RenderableBlock[]): void {
	useLayoutEffect(() => {
		let cancelled = false;
		void (async () => {
			const mermaid = (await import('mermaid')).default;
			if (cancelled) {
				return;
			}
			if (!mermaidInitialized) {
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: 'loose',
					theme: vscodeThemeIsDark() ? 'dark' : 'default',
				});
				mermaidInitialized = true;
			}
			const root = document.querySelector('.forge-md-document');
			if (!root) {
				return;
			}
			const candidates = root.querySelectorAll('pre > code');
			for (const code of candidates) {
				const cls = code.className || '';
				if (!/\blanguage-mermaid\b/i.test(cls)) {
					continue;
				}
				const text = code.textContent?.trim() ?? '';
				if (!text) {
					continue;
				}
				const pre = code.parentElement;
				if (!pre || pre.tagName !== 'PRE') {
					continue;
				}
				const div = document.createElement('div');
				div.className = 'mermaid forge-md-mermaid';
				div.textContent = text;
				pre.replaceWith(div);
			}
			await mermaid.run({ querySelector: '.forge-md-document .forge-md-mermaid', suppressErrors: true });
		})();
		return () => {
			cancelled = true;
		};
	}, [blocks]);
}

export function MarkdownPreviewPanel(props: MarkdownPreviewPanelProps): preact.JSX.Element {
	const { blocks, vscode } = props;
	useMermaidAfterBlocks(blocks);

	return (
		<div class="forge-cmd-preview-panel">
			<div class="forge-cmd-preview-scroll">
				<div class="forge-cmd-preview-reading">
					<article class="forge-md-document forge-md-prose" aria-label="Markdown preview">
						{blocks.map(block => (
							<div
								key={block.blockIndex}
								class="forge-md-frag"
								data-block-index={String(block.blockIndex)}
								dangerouslySetInnerHTML={{ __html: block.html }}
							/>
						))}
					</article>
				</div>
			</div>
			<SelectionCommentPlus vscode={vscode} blocks={blocks} />
		</div>
	);
}
