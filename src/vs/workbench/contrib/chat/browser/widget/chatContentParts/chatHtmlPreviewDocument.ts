/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { basicMarkupHtmlTags, sanitizeHtml } from '../../../../../../base/browser/domSanitize.js';
import { escapeDoubleQuotes } from '../../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { escape } from '../../../../../../base/common/strings.js';
import { localize } from '../../../../../../nls.js';
import { WebviewInitInfo, WebviewStyles } from '../../../../webview/browser/webview.js';

function sanitizeFragmentLink(node: Element, value: string): string | false {
	if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || node.localName !== 'a' || !value.startsWith('#')) {
		return false;
	}
	try {
		return '#' + encodeURIComponent(decodeURIComponent(value.slice(1)));
	} catch {
		return false;
	}
}

/** Builds the same script-free, offline document for inline, expanded, and exported previews. */
export function createHtmlPreviewDocument(html: string, theme?: { readonly styles: Readonly<WebviewStyles>; readonly activeTheme: string }): string {
	const content = sanitizeHtml(`<div>${html}</div>`, {
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
				'class', 'id', 'style', 'title', 'lang', 'dir', 'role', 'alt', 'width', 'height',
				'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
				{
					attributeName: 'src',
					shouldKeep: (node, attribute) => node.nodeName.toLowerCase() === 'img' && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(attribute.attrValue),
				},
				{
					attributeName: 'href',
					shouldKeep: (node, attribute) => sanitizeFragmentLink(node, attribute.attrValue),
				},
				'open', 'colspan', 'rowspan', 'scope', 'start', 'reversed',
				'viewBox', 'preserveAspectRatio', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
				'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
				'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'text-anchor', 'dominant-baseline',
				'dx', 'dy', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
				'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
			],
		},
		allowedLinkProtocols: { override: [] },
		allowedMediaProtocols: { override: [Schemas.data] },
	}).toString();

	const styles = `
		body { margin: 0; padding: 12px; overflow-wrap: anywhere; color: var(--vscode-editor-foreground, CanvasText); background: var(--vscode-editor-background, Canvas); font-family: var(--vscode-font-family, system-ui); font-size: var(--vscode-font-size, 13px); }
		img, svg { max-width: 100%; }
		a[href] { color: var(--vscode-textLink-foreground, LinkText); }
		:focus-visible { outline: 1px solid var(--vscode-focusBorder, Highlight); outline-offset: 2px; }
	`;
	const themeStyle = dom.$('div').style;
	if (theme) {
		const variables = new Set([...`${styles}${content}`.matchAll(/var\(\s*--(?<name>[\w-]+)/g)].map(match => match.groups!.name));
		for (const [name, value] of Object.entries(theme.styles)) {
			if (variables.has(name)) {
				themeStyle.setProperty(`--${name}`, String(value));
			}
		}
	}

	return `<!DOCTYPE html>
<html${theme ? ` style="${escapeDoubleQuotes(escape(themeStyle.cssText))}"` : ''}>
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
			disableScrollChaining: true,
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
