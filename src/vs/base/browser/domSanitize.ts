/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../common/lifecycle.js';
import { Schemas } from '../common/network.js';
import dompurify from './dompurify/dompurify.js';

const defaultSafeProtocols = [
	Schemas.http,
	Schemas.https,
	Schemas.command,
];

/**
 * List of safe, non-input html tags.
 */
export const basicMarkupHtmlTags = Object.freeze([
	'a',
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

	// TODO: Move these out of the default
	'select',
	'input',
]);

export const defaultAllowedAttrs = Object.freeze([
	'href',
	'target',
	'title',
	'name',
	'src',
	'alt',
	'role',
	'tabindex',
	'width',
	'height',
	'align',
	'x-dispatch',
	'required',
	'checked',
	'placeholder',
	'type',
	'start',

	// TODO: See if we can move these out of the default
	'for',
	'role',
	'data-href',
	'data-command',
	'data-code',
	'id',
	'class',
	'style',
]);


type UponSanitizeElementCb = (currentNode: Element, data: dompurify.SanitizeElementHookEvent, config: dompurify.Config) => void;
type UponSanitizeAttributeCb = (currentNode: Element, data: dompurify.SanitizeAttributeHookEvent, config: dompurify.Config) => void;

function addDompurifyHook(hook: 'uponSanitizeElement', cb: UponSanitizeElementCb): IDisposable;
function addDompurifyHook(hook: 'uponSanitizeAttribute', cb: UponSanitizeAttributeCb): IDisposable;
function addDompurifyHook(hook: 'uponSanitizeElement' | 'uponSanitizeAttribute', cb: any): IDisposable {
	dompurify.addHook(hook, cb);
	return toDisposable(() => dompurify.removeHook(hook));
}

/**
 * Hooks dompurify using `afterSanitizeAttributes` to check that all `href` and `src`
 * attributes are valid.
 */
function hookDomPurifyHrefAndSrcSanitizer(allowedProtocols: readonly string[] | '*', allowDataImages = false): IDisposable {
	// https://github.com/cure53/DOMPurify/blob/main/demos/hooks-scheme-allowlist.html
	// build an anchor to map URLs to
	const anchor = document.createElement('a');

	dompurify.addHook('afterSanitizeAttributes', (node) => {
		// check all href/src attributes for validity
		for (const attr of ['href', 'src']) {
			if (node.hasAttribute(attr)) {
				const attrValue = node.getAttribute(attr) as string;
				if (attr === 'href' && attrValue.startsWith('#')) {
					// Allow fragment links
					continue;
				}

				anchor.href = attrValue;
				if (allowedProtocols !== '*' && !allowedProtocols.includes(anchor.protocol.replace(/:$/, ''))) {
					if (allowDataImages && attr === 'src' && anchor.href.startsWith('data:')) {
						continue;
					}

					node.removeAttribute(attr);
				}
			}
		}
	});

	return toDisposable(() => dompurify.removeHook('afterSanitizeAttributes'));
}

export interface SanitizeOptions {
	readonly overrideAllowedTags?: readonly string[];
	readonly overrideAllowedAttributes?: readonly string[];

	/**
	 * List of allowed protocols for `href` and `src` attributes.
	 *
	 * If this is
	 */
	readonly overrideAllowedProtocols?: readonly string[] | '*';
	readonly allowDataImages?: boolean;

	readonly hooks?: {
		readonly uponSanitizeElement?: UponSanitizeElementCb;
		readonly uponSanitizeAttribute?: UponSanitizeAttributeCb;
	};
}

const defaultDomPurifyConfig = Object.freeze({
	ALLOWED_TAGS: [...basicMarkupHtmlTags],
	ALLOWED_ATTR: [...defaultAllowedAttrs],
	RETURN_DOM: false,
	RETURN_DOM_FRAGMENT: false,
	RETURN_TRUSTED_TYPE: true,
	// We sanitize the src/href attributes later if needed
	ALLOW_UNKNOWN_PROTOCOLS: true,
} satisfies dompurify.Config);

/**
 * Sanitizes an html string.
 *
 * @param untrusted The HTML string to sanitize.
 * @param config Optional configuration for sanitization. If not provided, defaults to a safe configuration.
 *
 * @returns A sanitized string of html.
 */
export function sanitizeHtml(untrusted: string, config?: SanitizeOptions): TrustedHTML {
	const store = new DisposableStore();
	try {
		const resolvedConfig: dompurify.Config = { ...defaultDomPurifyConfig };

		if (config?.overrideAllowedTags) {
			resolvedConfig.ALLOWED_TAGS = [...config.overrideAllowedTags];
		}

		if (config?.overrideAllowedAttributes) {
			resolvedConfig.ALLOWED_ATTR = [...config.overrideAllowedAttributes];
		}

		const allowedProtocols = config?.overrideAllowedProtocols ?? defaultSafeProtocols;
		store.add(hookDomPurifyHrefAndSrcSanitizer(allowedProtocols, config?.allowDataImages));

		if (config?.hooks?.uponSanitizeElement) {
			store.add(addDompurifyHook('uponSanitizeElement', config?.hooks.uponSanitizeElement));
		}

		if (config?.hooks?.uponSanitizeAttribute) {
			store.add(addDompurifyHook('uponSanitizeAttribute', config.hooks.uponSanitizeAttribute));
		}

		return dompurify.sanitize(untrusted, {
			...resolvedConfig,
			RETURN_TRUSTED_TYPE: true
		});
	} finally {
		store.dispose();
	}
}

/**
 * Sanitizes the given `value` and reset the given `node` with it.
 */
export function safeInnerHtml(node: HTMLElement, untrusted: string, config?: SanitizeOptions): void {
	node.innerHTML = sanitizeHtml(untrusted, config) as any;
}
