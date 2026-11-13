/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { basicMarkupHtmlTags, safeSetInnerHtml } from '../../../../../../base/browser/domSanitize.js';
import { escapeDoubleQuotes } from '../../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { escape } from '../../../../../../base/common/strings.js';
import { localize } from '../../../../../../nls.js';
import { WebviewInitInfo, WebviewStyles } from '../../../../webview/browser/webview.js';

const htmlPreviewIdPrefix = 'vscode-html-preview-';

function sanitizeFragmentLink(node: Element, value: string, namespaceId: (id: string) => string): string | false {
	if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.localName !== 'a' || !value.startsWith('#')) {
		return false;
	}
	try {
		const id = decodeURIComponent(value.slice(1));
		return id ? '#' + encodeURIComponent(namespaceId(id)) : '#';
	} catch {
		return false;
	}
}

function namespaceCssReferences(css: string, namespaceId: (id: string) => string): string {
	// Consume comments and quoted literals without interpreting their text as ID selectors.
	const tokens = /\/\*[\s\S]*?(?:\*\/|$)|(?<urlPrefix>url\(\s*["']?#)(?<urlId>(?:\\(?:[\da-f]{1,6}\s?|[^\r\n])|[\w%\u0080-\uFFFF-])+)(?<urlSuffix>["']?\s*\))|(?<hrefPrefix>\[\s*href\s*=\s*["']?#)(?<hrefId>[\w%\u0080-\uFFFF-]+)(?<hrefSuffix>["']?\s*(?:[is]\s*)?\])|(?<attributePrefix>\[\s*id\s*=\s*["']?)(?<attributeId>[\w\u0080-\uFFFF-]+)(?<attributeSuffix>["']?\s*(?:[is]\s*)?\])|"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|#(?<id>(?:\\(?:[\da-f]{1,6}\s?|[^\r\n])|[\w\u0080-\uFFFF-])+)/gi;
	let result = '';
	let offset = 0;
	for (const match of css.matchAll(tokens)) {
		const groups = match.groups!;
		const id = groups.id ?? groups.urlId ?? groups.hrefId ?? groups.attributeId;
		if (!id) {
			continue;
		}
		let decodedId = id.replace(/\\(?<hex>[\da-f]{1,6})\s?|\\(?<escaped>.)/gi, (escaped: string, hex: string | undefined, character: string | undefined) => {
			const codePoint = hex ? parseInt(hex, 16) : undefined;
			return codePoint !== undefined ? (codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\uFFFD') : character ?? escaped;
		});
		if (groups.urlId || groups.hrefId) {
			try {
				decodedId = decodeURIComponent(decodedId);
			} catch {
				continue;
			}
		}
		const namespacedId = namespaceId(decodedId);
		if (namespacedId !== decodedId) {
			const prefix = groups.urlPrefix ?? groups.hrefPrefix ?? groups.attributePrefix ?? '#';
			const suffix = groups.urlSuffix ?? groups.hrefSuffix ?? groups.attributeSuffix ?? '';
			const rewritten = prefix + (groups.hrefId ? encodeURIComponent(namespacedId) : htmlPreviewIdPrefix + id) + suffix;
			const replacement = /i\s*\]$/i.test(suffix) ? `:is(${match[0]},${rewritten})` : rewritten;
			result += css.slice(offset, match.index) + replacement;
			offset = match.index + match[0].length;
		}
	}
	return result + css.slice(offset);
}

/** Builds script-free, offline previews, with a transparent, unpadded surface when inline. */
export function createHtmlPreviewDocument(html: string, theme?: { readonly styles: Readonly<WebviewStyles>; readonly activeTheme: string }, presentation: 'document' | 'inline' = 'document'): string {
	const form = dom.$('form');
	const namespaceId = (id: string) => id.startsWith(htmlPreviewIdPrefix) || Reflect.has(form.ownerDocument, id) || Reflect.has(form, id) ? htmlPreviewIdPrefix + id : id;
	const contentRoot = dom.$('div');
	safeSetInnerHtml(contentRoot, `<body>${html}</body>`, {
		allowedTags: {
			override: [
				...basicMarkupHtmlTags.filter(tag => tag !== 'source' && tag !== 'video'),
				'style', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'address',
				'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
				'defs', 'marker', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc',
			],
		},
		allowedAttributes: {
			override: [
				'class', 'title', 'lang', 'dir', 'role', 'alt', 'width', 'height', 'aria-label', 'aria-hidden',
				{ attributeName: 'id', shouldKeep: (_node, attribute) => namespaceId(attribute.attrValue) },
				{ attributeName: 'style', shouldKeep: (_node, attribute) => namespaceCssReferences(attribute.attrValue, namespaceId) },
				...['aria-labelledby', 'aria-describedby'].map(attributeName => ({
					attributeName,
					shouldKeep: (_node: Element, attribute: { readonly attrValue: string }) => attribute.attrValue.replace(/\S+/g, namespaceId),
				})),
				{
					attributeName: 'src',
					shouldKeep: (node, attribute) => node.nodeName.toLowerCase() === 'img' && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(attribute.attrValue),
				},
				{
					attributeName: 'href',
					shouldKeep: (node, attribute) => sanitizeFragmentLink(node, attribute.attrValue, namespaceId),
				},
				'open', 'colspan', 'rowspan', 'scope', 'start', 'reversed',
				'viewBox', 'preserveAspectRatio', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
				'points', 'transform', 'fill-opacity', 'fill-rule', 'stroke-width', 'stroke-opacity',
				'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'text-anchor', 'dominant-baseline',
				'dx', 'dy', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
				'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
				...['fill', 'stroke', 'marker-start', 'marker-mid', 'marker-end'].map(attributeName => ({
					attributeName,
					shouldKeep: (_node: Element, attribute: { readonly attrValue: string }) => namespaceCssReferences(attribute.attrValue, namespaceId),
				})),
			],
		},
		allowedLinkProtocols: { override: [] },
		allowedMediaProtocols: { override: [Schemas.data] },
	});
	const walker = contentRoot.ownerDocument.createTreeWalker(contentRoot, NodeFilter.SHOW_ELEMENT);
	for (let element = walker.nextNode(); element; element = walker.nextNode()) {
		if (element.nodeName.toLowerCase() === 'style') {
			element.textContent = namespaceCssReferences(element.textContent ?? '', namespaceId);
		}
	}
	const content = contentRoot.innerHTML;

	const styles = `
		body { display: flow-root; box-sizing: border-box; margin: 0; padding: ${presentation === 'inline' ? '0' : '12px'}; overflow-wrap: anywhere; color: var(--vscode-${presentation === 'inline' ? 'foreground' : 'editor-foreground'}, CanvasText); background: ${presentation === 'inline' ? 'transparent' : 'var(--vscode-editor-background, Canvas)'}; font-family: var(--vscode-font-family, system-ui); font-size: var(--vscode-font-size, 13px); ${presentation === 'inline' ? 'line-height: 1.5;' : ''} }
		img, svg { max-width: 100%; }
		a[href] { color: var(--vscode-textLink-foreground, LinkText); }
		:focus-visible { outline: 1px solid var(--vscode-focusBorder, Highlight); outline-offset: 2px; }
	`;
	const documentStyle = dom.$('div').style;
	if (theme) {
		const variables = new Set([...`${styles}${content}`.matchAll(/var\(\s*--(?<name>[\w-]+)/g)].map(match => match.groups!.name));
		for (const [name, value] of Object.entries(theme.styles)) {
			if (variables.has(name)) {
				documentStyle.setProperty(`--${name}`, String(value));
			}
		}
	}

	return `<!DOCTYPE html>
<html style="${escapeDoubleQuotes(escape(documentStyle.cssText))}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escape(localize('chat.htmlPreview.documentTitle', "HTML Preview"))}</title>
	<style>${styles}</style>
</head>
<body${theme ? ` class="${escapeDoubleQuotes(escape(theme.activeTheme))}"` : ''}>${content}</body>
</html>`;
}

export function getHtmlPreviewWebviewOptions(title: string): WebviewInitInfo {
	return {
		title,
		providedViewType: 'vscode.chat.htmlPreview',
		options: {
			disableServiceWorker: true,
			includeHorizontalScrollbarInContentHeight: true,
			tryRestoreScrollPosition: false,
		},
		contentOptions: {
			allowScripts: false,
			allowForms: false,
			enableCommandUris: false,
			localResourceRoots: [],
		},
		extension: undefined,
	};
}
