/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import type * as MarkdownItToken from 'markdown-it/lib/token';
import type { ActivationFunction } from 'vscode-notebook-renderer';

const allowedHtmlTags = Object.freeze(['a',
	'abbr',
	'b',
	'bdo',
	'blockquote',
	'br',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'dd',
	'del',
	'details',
	'dfn',
	'div',
	'dl',
	'dt',
	'em',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'i',
	'img',
	'ins',
	'kbd',
	'label',
	'li',
	'mark',
	'ol',
	'p',
	'pre',
	'q',
	'rp',
	'rt',
	'ruby',
	'samp',
	'small',
	'small',
	'source',
	'span',
	'strike',
	'strong',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'time',
	'tr',
	'tt',
	'u',
	'ul',
	'var',
	'video',
	'wbr',
]);

const allowedSvgTags = Object.freeze([
	'svg',
	'a',
	'altglyph',
	'altglyphdef',
	'altglyphitem',
	'animatecolor',
	'animatemotion',
	'animatetransform',
	'circle',
	'clippath',
	'defs',
	'desc',
	'ellipse',
	'filter',
	'font',
	'g',
	'glyph',
	'glyphref',
	'hkern',
	'image',
	'line',
	'lineargradient',
	'marker',
	'mask',
	'metadata',
	'mpath',
	'path',
	'pattern',
	'polygon',
	'polyline',
	'radialgradient',
	'rect',
	'stop',
	'style',
	'switch',
	'symbol',
	'text',
	'textpath',
	'title',
	'tref',
	'tspan',
	'view',
	'vkern',
]);

const sanitizerOptions: DOMPurify.Config = {
	ALLOWED_TAGS: [
		...allowedHtmlTags,
		...allowedSvgTags,
	],
};

export const activate: ActivationFunction<void> = (ctx) => {
	const markdownIt: MarkdownIt = new MarkdownIt({
		html: true,
		linkify: true,
		highlight: (str: string, lang?: string) => {
			if (lang) {
				return `<div class="vscode-code-block" data-vscode-code-block-lang="${markdownIt.utils.escapeHtml(lang)}">${markdownIt.utils.escapeHtml(str)}</div>`;
			}
			return markdownIt.utils.escapeHtml(str);
		}
	});
	markdownIt.linkify.set({ fuzzyLink: false });

	addNamedHeaderRendering(markdownIt);
	addLinkRenderer(markdownIt);

	const style = document.createElement('style');
	style.textContent = `
		.emptyMarkdownCell::before {
			content: "${document.documentElement.style.getPropertyValue('--notebook-cell-markup-empty-content')}";
			font-style: italic;
			opacity: 0.6;
		}

		img {
			max-width: 100%;
			max-height: 100%;
		}

		a {
			text-decoration: none;
		}

		a:hover {
			text-decoration: underline;
		}

		a:focus,
		input:focus,
		select:focus,
		textarea:focus {
			outline: 1px solid -webkit-focus-ring-color;
			outline-offset: -1px;
		}

		hr {
			border: 0;
			height: 2px;
			border-bottom: 2px solid;
		}

		h2, h3, h4, h5, h6 {
			font-weight: normal;
		}

		h1 {
			font-size: 2.3em;
		}

		h2 {
			font-size: 2em;
		}

		h3 {
			font-size: 1.7em;
		}

		h3 {
			font-size: 1.5em;
		}

		h4 {
			font-size: 1.3em;
		}

		h5 {
			font-size: 1.2em;
		}

		h1,
		h2,
		h3 {
			font-weight: normal;
		}

		div {
			width: 100%;
		}

		/* Adjust margin of first item in markdown cell */
		*:first-child {
			margin-top: 0px;
		}

		/* h1 tags don't need top margin */
		h1:first-child {
			margin-top: 0;
		}

		/* Removes bottom margin when only one item exists in markdown cell */
		#preview > *:only-child,
		#preview > *:last-child {
			margin-bottom: 0;
			padding-bottom: 0;
		}

		/* makes all markdown cells consistent */
		div {
			min-height: var(--notebook-markdown-min-height);
		}

		table {
			border-collapse: collapse;
			border-spacing: 0;
		}

		table th,
		table td {
			border: 1px solid;
		}

		table > thead > tr > th {
			text-align: left;
			border-bottom: 1px solid;
		}

		table > thead > tr > th,
		table > thead > tr > td,
		table > tbody > tr > th,
		table > tbody > tr > td {
			padding: 5px 10px;
		}

		table > tbody > tr + tr > td {
			border-top: 1px solid;
		}

		blockquote {
			margin: 0 7px 0 5px;
			padding: 0 16px 0 10px;
			border-left-width: 5px;
			border-left-style: solid;
		}

		code {
			font-size: 1em;
			font-family: var(--vscode-editor-font-family);
		}

		pre code {
			line-height: 1.357em;
			white-space: pre-wrap;
			padding: 0;
		}

		li p {
			margin-bottom: 0.7em;
		}

		ul,
		ol {
			margin-bottom: 0.7em;
		}
	`;
	const template = document.createElement('template');
	template.classList.add('markdown-style');
	template.content.appendChild(style);
	document.head.appendChild(template);

	return {
		renderOutputItem: (outputInfo, element) => {
			let previewNode: HTMLElement;
			if (!element.shadowRoot) {
				const previewRoot = element.attachShadow({ mode: 'open' });

				// Insert styles into markdown preview shadow dom so that they are applied.
				// First add default webview style
				const defaultStyles = document.getElementById('_defaultStyles') as HTMLStyleElement;
				previewRoot.appendChild(defaultStyles.cloneNode(true));

				// And then contributed styles
				for (const element of document.getElementsByClassName('markdown-style')) {
					if (element instanceof HTMLTemplateElement) {
						previewRoot.appendChild(element.content.cloneNode(true));
					} else {
						previewRoot.appendChild(element.cloneNode(true));
					}
				}

				previewNode = document.createElement('div');
				previewNode.id = 'preview';
				previewRoot.appendChild(previewNode);
			} else {
				previewNode = element.shadowRoot.getElementById('preview')!;
			}

			const text = outputInfo.text();
			if (text.trim().length === 0) {
				previewNode.innerText = '';
				previewNode.classList.add('emptyMarkdownCell');
			} else {
				previewNode.classList.remove('emptyMarkdownCell');
				const markdownText = outputInfo.mime.startsWith('text/x-') ? `\`\`\`${outputInfo.mime.substr(7)}\n${text}\n\`\`\``
					: (outputInfo.mime.startsWith('application/') ? `\`\`\`${outputInfo.mime.substr(12)}\n${text}\n\`\`\`` : text);
				const unsanitizedRenderedMarkdown = markdownIt.render(markdownText, {
					outputItem: outputInfo,
				});
				previewNode.innerHTML = (ctx.workspace.isTrusted
					? unsanitizedRenderedMarkdown
					: DOMPurify.sanitize(unsanitizedRenderedMarkdown, sanitizerOptions)) as string;
			}
		},
		extendMarkdownIt: (f: (md: typeof markdownIt) => void) => {
			try {
				f(markdownIt);
			} catch (err) {
				console.error('Error extending markdown-it', err);
			}
		}
	};
};


function addNamedHeaderRendering(md: InstanceType<typeof MarkdownIt>): void {
	const slugCounter = new Map<string, number>();

	const originalHeaderOpen = md.renderer.rules.heading_open;
	md.renderer.rules.heading_open = (tokens: MarkdownItToken[], idx: number, options, env, self) => {
		const title = tokens[idx + 1].children!.reduce<string>((acc, t) => acc + t.content, '');
		let slug = slugify(title);

		if (slugCounter.has(slug)) {
			const count = slugCounter.get(slug)!;
			slugCounter.set(slug, count + 1);
			slug = slugify(slug + '-' + (count + 1));
		} else {
			slugCounter.set(slug, 0);
		}

		tokens[idx].attrSet('id', slug);

		if (originalHeaderOpen) {
			return originalHeaderOpen(tokens, idx, options, env, self);
		} else {
			return self.renderToken(tokens, idx, options);
		}
	};

	const originalRender = md.render;
	md.render = function () {
		slugCounter.clear();
		// eslint-disable-next-line local/code-no-any-casts
		return originalRender.apply(this, arguments as any);
	};
}

function addLinkRenderer(md: MarkdownIt): void {
	const original = md.renderer.rules.link_open;

	md.renderer.rules.link_open = (tokens: MarkdownItToken[], idx: number, options, env, self) => {
		const token = tokens[idx];
		const href = token.attrGet('href');
		if (typeof href === 'string' && href.startsWith('#')) {
			token.attrSet('href', '#' + slugify(href.slice(1)));
		}
		if (original) {
			return original(tokens, idx, options, env, self);
		} else {
			return self.renderToken(tokens, idx, options);
		}
	};
}

function slugify(text: string): string {
	const slugifiedHeading = encodeURI(
		text.trim()
			.toLowerCase()
			.replace(/\s+/g, '-') // Replace whitespace with -
			// allow-any-unicode-next-line
			.replace(/[\]\[\!\/\'\"\#\$\%\&\(\)\*\+\,\.\/\:\;\<\=\>\?\@\\\^\{\|\}\~\`。，、；：？！…—·ˉ¨‘’“”々～‖∶＂＇｀｜〃〔〕〈〉《》「」『』．〖〗【】（）［］｛｝]/g, '') // Remove known punctuators
			.replace(/^\-+/, '') // Remove leading -
			.replace(/\-+$/, '') // Remove trailing -
	);
	return slugifiedHeading;
}
