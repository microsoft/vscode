/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../common/lifecycle.js';
import { Schemas } from '../common/network.js';
import dompurify from './dompurify/dompurify.js';


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
]);

export const defaultAllowedAttrs = Object.freeze([
	'href',
	'target',
	'src',
	'alt',
	'title',
	'for',
	'name',
	'role',
	'tabindex',
	'x-dispatch',
	'required',
	'checked',
	'placeholder',
	'type',
	'start',
	'width',
	'height',
	'align',
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
function hookDomPurifyHrefAndSrcSanitizer(allowedLinkProtocols: readonly string[] | '*', allowedMediaProtocols: readonly string[]): IDisposable {
	// https://github.com/cure53/DOMPurify/blob/main/demos/hooks-scheme-allowlist.html
	// build an anchor to map URLs to
	const anchor = document.createElement('a');

	function validateLink(value: string, allowedProtocols: readonly string[] | '*'): boolean {
		if (allowedProtocols === '*') {
			return true; // allow all protocols
		}

		anchor.href = value;
		return allowedProtocols.includes(anchor.protocol.replace(/:$/, ''));
	}

	dompurify.addHook('afterSanitizeAttributes', (node) => {
		// check all href/src attributes for validity
		for (const attr of ['href', 'src']) {
			if (node.hasAttribute(attr)) {
				const attrValue = node.getAttribute(attr) as string;
				if (attr === 'href') {

					if (!attrValue.startsWith('#') && !validateLink(attrValue, allowedLinkProtocols)) {
						node.removeAttribute(attr);
					}

				} else {// 'src'
					if (!validateLink(attrValue, allowedMediaProtocols)) {
						node.removeAttribute(attr);
					}
				}
			}
		}
	});

	return toDisposable(() => dompurify.removeHook('afterSanitizeAttributes'));
}

export interface DomSanitizerConfig {
	/**
	 * Configured the allowed html tags.
	 */
	readonly allowedTags?: {
		readonly override?: readonly string[];
		readonly augment?: readonly string[];
	};

	/**
	 * Configured the allowed html attributes.
	 */
	readonly allowedAttributes?: {
		readonly override?: readonly string[];
		readonly augment?: readonly string[];
	};

	/**
	 * List of allowed protocols for `href` attributes.
	 */
	readonly allowedLinkProtocols?: {
		readonly override?: readonly string[] | '*';
	};

	/**
	 * List of allowed protocols for `src` attributes.
	 */
	readonly allowedMediaProtocols?: {
		readonly override?: readonly string[];
	};

	// TODO: move these into more controlled api
	readonly _do_not_use_hooks?: {
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
export function sanitizeHtml(untrusted: string, config?: DomSanitizerConfig): TrustedHTML {
	const store = new DisposableStore();
	try {
		const resolvedConfig: dompurify.Config = { ...defaultDomPurifyConfig };

		if (config?.allowedTags) {
			if (config.allowedTags.override) {
				resolvedConfig.ALLOWED_TAGS = [...config.allowedTags.override];
			}

			if (config.allowedTags.augment) {
				resolvedConfig.ALLOWED_TAGS = [...(resolvedConfig.ALLOWED_TAGS ?? []), ...config.allowedTags.augment];
			}
		}

		if (config?.allowedAttributes) {
			if (config.allowedAttributes.override) {
				resolvedConfig.ALLOWED_ATTR = [...config.allowedAttributes.override];
			}

			if (config.allowedAttributes.augment) {
				resolvedConfig.ALLOWED_ATTR = [...(resolvedConfig.ALLOWED_ATTR ?? []), ...config.allowedAttributes.augment];
			}
		}

		store.add(hookDomPurifyHrefAndSrcSanitizer(
			config?.allowedLinkProtocols?.override ?? [Schemas.http, Schemas.https],
			config?.allowedMediaProtocols?.override ?? [Schemas.http, Schemas.https]));

		if (config?._do_not_use_hooks?.uponSanitizeElement) {
			store.add(addDompurifyHook('uponSanitizeElement', config?._do_not_use_hooks.uponSanitizeElement));
		}

		if (config?._do_not_use_hooks?.uponSanitizeAttribute) {
			store.add(addDompurifyHook('uponSanitizeAttribute', config._do_not_use_hooks.uponSanitizeAttribute));
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
export function safeSetInnerHtml(node: HTMLElement, untrusted: string, config?: DomSanitizerConfig): void {
	node.innerHTML = sanitizeHtml(untrusted, config) as any;
}
