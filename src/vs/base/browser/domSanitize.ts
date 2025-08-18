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

/**
 * Predicate that checks if an attribute should be kept or removed.
 *
 * @returns A boolean indicating whether the attribute should be kept or a string with the sanitized value (which implicitly keeps the attribute)
 */
export type SanitizeAttributePredicate = (node: Element, data: { readonly attrName: string; readonly attrValue: string }) => boolean | string;

export interface SanitizeAttributeRule {
	readonly attributeName: string;
	shouldKeep: SanitizeAttributePredicate;
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
		readonly override?: ReadonlyArray<string | SanitizeAttributeRule>;
		readonly augment?: ReadonlyArray<string | SanitizeAttributeRule>;
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

	/**
	 * If set, replaces unsupported tags with their plaintext representation instead of removing them.
	 *
	 * For example, <p><bad>"text"</bad></p> becomes <p>"<bad>text</bad>"</p>.
	 */
	readonly replaceWithPlaintext?: boolean;
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

		let resolvedAttributes: Array<string | SanitizeAttributeRule> = [...defaultAllowedAttrs];
		if (config?.allowedAttributes) {
			if (config.allowedAttributes.override) {
				resolvedAttributes = [...config.allowedAttributes.override];
			}

			if (config.allowedAttributes.augment) {
				resolvedAttributes = [...resolvedAttributes, ...config.allowedAttributes.augment];
			}
		}

		const allowedAttrNames = new Set(resolvedAttributes.map(attr => typeof attr === 'string' ? attr : attr.attributeName));
		const allowedAttrPredicates = new Map<string, SanitizeAttributeRule>();
		for (const attr of resolvedAttributes) {
			if (typeof attr === 'string') {
				// New string attribute value clears previously set predicates
				allowedAttrPredicates.delete(attr);
			} else {
				allowedAttrPredicates.set(attr.attributeName, attr);
			}
		}

		resolvedConfig.ALLOWED_ATTR = Array.from(allowedAttrNames);

		store.add(hookDomPurifyHrefAndSrcSanitizer(
			config?.allowedLinkProtocols?.override ?? [Schemas.http, Schemas.https],
			config?.allowedMediaProtocols?.override ?? [Schemas.http, Schemas.https]));

		if (config?.replaceWithPlaintext) {
			store.add(addDompurifyHook('uponSanitizeElement', replaceWithPlainTextHook));
		}

		if (allowedAttrPredicates.size) {
			store.add(addDompurifyHook('uponSanitizeAttribute', (node, e) => {
				const predicate = allowedAttrPredicates.get(e.attrName);
				if (predicate) {
					const result = predicate.shouldKeep(node, e);
					if (typeof result === 'string') {
						e.keepAttr = true;
						e.attrValue = result;
					} else {
						e.keepAttr = result;
					}
				} else {
					e.keepAttr = allowedAttrNames.has(e.attrName);
				}
			}));
		}

		return dompurify.sanitize(untrusted, {
			...resolvedConfig,
			RETURN_TRUSTED_TYPE: true
		});
	} finally {
		store.dispose();
	}
}

const selfClosingTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

function replaceWithPlainTextHook(element: Element, data: dompurify.SanitizeElementHookEvent, _config: dompurify.Config) {
	if (!data.allowedTags[data.tagName] && data.tagName !== 'body') {
		const replacement = convertTagToPlaintext(element);
		if (element.nodeType === Node.COMMENT_NODE) {
			// Workaround for https://github.com/cure53/DOMPurify/issues/1005
			// The comment will be deleted in the next phase. However if we try to remove it now, it will cause
			// an exception. Instead we insert the text node before the comment.
			element.parentElement?.insertBefore(replacement, element);
		} else {
			element.parentElement?.replaceChild(replacement, element);
		}
	}
}

export function convertTagToPlaintext(element: Element): DocumentFragment {
	let startTagText: string;
	let endTagText: string | undefined;
	if (element.nodeType === Node.COMMENT_NODE) {
		startTagText = `<!--${element.textContent}-->`;
	} else {
		const tagName = element.tagName.toLowerCase();
		const isSelfClosing = selfClosingTags.includes(tagName);
		const attrString = element.attributes.length ?
			' ' + Array.from(element.attributes)
				.map(attr => `${attr.name}="${attr.value}"`)
				.join(' ')
			: '';
		startTagText = `<${tagName}${attrString}>`;
		if (!isSelfClosing) {
			endTagText = `</${tagName}>`;
		}
	}

	const fragment = document.createDocumentFragment();
	const textNode = element.ownerDocument.createTextNode(startTagText);
	fragment.appendChild(textNode);
	while (element.firstChild) {
		fragment.appendChild(element.firstChild);
	}

	const endTagTextNode = endTagText ? element.ownerDocument.createTextNode(endTagText) : undefined;
	if (endTagTextNode) {
		fragment.appendChild(endTagTextNode);
	}

	return fragment;
}

/**
 * Sanitizes the given `value` and reset the given `node` with it.
 */
export function safeSetInnerHtml(node: HTMLElement, untrusted: string, config?: DomSanitizerConfig): void {
	node.innerHTML = sanitizeHtml(untrusted, config) as any;
}
