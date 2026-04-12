/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../common/network.js';
import { reset } from './dom.js';
// eslint-disable-next-line no-restricted-imports
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
    's',
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
const fakeRelativeUrlProtocol = 'vscode-relative-path';
function validateLink(value, allowedProtocols) {
    if (allowedProtocols.override === '*') {
        return true; // allow all protocols
    }
    try {
        const url = new URL(value, fakeRelativeUrlProtocol + '://');
        if (allowedProtocols.override.includes(url.protocol.replace(/:$/, ''))) {
            return true;
        }
        if (allowedProtocols.allowRelativePaths
            && url.protocol === fakeRelativeUrlProtocol + ':'
            && !value.trim().toLowerCase().startsWith(fakeRelativeUrlProtocol)) {
            return true;
        }
        return false;
    }
    catch (e) {
        return false;
    }
}
/**
 * Hooks dompurify using `afterSanitizeAttributes` to check that all `href` and `src`
 * attributes are valid.
 */
function hookDomPurifyHrefAndSrcSanitizer(allowedLinkProtocols, allowedMediaProtocols) {
    dompurify.addHook('afterSanitizeAttributes', (node) => {
        // check all href/src attributes for validity
        for (const attr of ['href', 'src']) {
            if (node.hasAttribute(attr)) {
                const attrValue = node.getAttribute(attr);
                if (attr === 'href') {
                    if (!attrValue.startsWith('#') && !validateLink(attrValue, allowedLinkProtocols)) {
                        node.removeAttribute(attr);
                    }
                }
                else { // 'src'
                    if (!validateLink(attrValue, allowedMediaProtocols)) {
                        node.removeAttribute(attr);
                    }
                }
            }
        }
    });
}
const defaultDomPurifyConfig = Object.freeze({
    ALLOWED_TAGS: [...basicMarkupHtmlTags],
    ALLOWED_ATTR: [...defaultAllowedAttrs],
    // We sanitize the src/href attributes later if needed
    ALLOW_UNKNOWN_PROTOCOLS: true,
});
/**
 * Sanitizes an html string.
 *
 * @param untrusted The HTML string to sanitize.
 * @param config Optional configuration for sanitization. If not provided, defaults to a safe configuration.
 *
 * @returns A sanitized string of html.
 */
export function sanitizeHtml(untrusted, config) {
    return doSanitizeHtml(untrusted, config, 'trusted');
}
function doSanitizeHtml(untrusted, config, outputType) {
    try {
        const resolvedConfig = { ...defaultDomPurifyConfig };
        if (config?.allowedTags) {
            if (config.allowedTags.override) {
                resolvedConfig.ALLOWED_TAGS = [...config.allowedTags.override];
            }
            if (config.allowedTags.augment) {
                resolvedConfig.ALLOWED_TAGS = [...(resolvedConfig.ALLOWED_TAGS ?? []), ...config.allowedTags.augment];
            }
        }
        let resolvedAttributes = [...defaultAllowedAttrs];
        if (config?.allowedAttributes) {
            if (config.allowedAttributes.override) {
                resolvedAttributes = [...config.allowedAttributes.override];
            }
            if (config.allowedAttributes.augment) {
                resolvedAttributes = [...resolvedAttributes, ...config.allowedAttributes.augment];
            }
        }
        // All attr names are lower-case in the sanitizer hooks
        resolvedAttributes = resolvedAttributes.map((attr) => {
            if (typeof attr === 'string') {
                return attr.toLowerCase();
            }
            return {
                attributeName: attr.attributeName.toLowerCase(),
                shouldKeep: attr.shouldKeep,
            };
        });
        const allowedAttrNames = new Set(resolvedAttributes.map(attr => typeof attr === 'string' ? attr : attr.attributeName));
        const allowedAttrPredicates = new Map();
        for (const attr of resolvedAttributes) {
            if (typeof attr === 'string') {
                // New string attribute value clears previously set predicates
                allowedAttrPredicates.delete(attr);
            }
            else {
                allowedAttrPredicates.set(attr.attributeName, attr);
            }
        }
        resolvedConfig.ALLOWED_ATTR = Array.from(allowedAttrNames);
        hookDomPurifyHrefAndSrcSanitizer({
            override: config?.allowedLinkProtocols?.override ?? [Schemas.http, Schemas.https],
            allowRelativePaths: config?.allowRelativeLinkPaths ?? false
        }, {
            override: config?.allowedMediaProtocols?.override ?? [Schemas.http, Schemas.https],
            allowRelativePaths: config?.allowRelativeMediaPaths ?? false
        });
        if (config?.replaceWithPlaintext) {
            dompurify.addHook('uponSanitizeElement', replaceWithPlainTextHook);
        }
        if (allowedAttrPredicates.size) {
            dompurify.addHook('uponSanitizeAttribute', (node, e) => {
                const predicate = allowedAttrPredicates.get(e.attrName);
                if (predicate) {
                    const result = predicate.shouldKeep(node, e);
                    if (typeof result === 'string') {
                        e.keepAttr = true;
                        e.attrValue = result;
                    }
                    else {
                        e.keepAttr = result;
                    }
                }
                else {
                    e.keepAttr = allowedAttrNames.has(e.attrName);
                }
            });
        }
        if (outputType === 'dom') {
            return dompurify.sanitize(untrusted, {
                ...resolvedConfig,
                RETURN_DOM_FRAGMENT: true
            });
        }
        else {
            return dompurify.sanitize(untrusted, {
                ...resolvedConfig,
                RETURN_TRUSTED_TYPE: true
            }); // Cast from lib TrustedHTML to global TrustedHTML
        }
    }
    finally {
        dompurify.removeAllHooks();
    }
}
const selfClosingTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
const replaceWithPlainTextHook = (node, data, _config) => {
    if (!data.allowedTags[data.tagName] && data.tagName !== 'body') {
        const replacement = convertTagToPlaintext(node);
        if (replacement) {
            if (node.nodeType === Node.COMMENT_NODE) {
                // Workaround for https://github.com/cure53/DOMPurify/issues/1005
                // The comment will be deleted in the next phase. However if we try to remove it now, it will cause
                // an exception. Instead we insert the text node before the comment.
                node.parentElement?.insertBefore(replacement, node);
            }
            else {
                node.parentElement?.replaceChild(replacement, node);
            }
        }
    }
};
export function convertTagToPlaintext(node) {
    if (!node.ownerDocument) {
        return;
    }
    let startTagText;
    let endTagText;
    if (node.nodeType === Node.COMMENT_NODE) {
        startTagText = `<!--${node.textContent}-->`;
    }
    else if (node instanceof Element) {
        const tagName = node.tagName.toLowerCase();
        const isSelfClosing = selfClosingTags.includes(tagName);
        const attrString = node.attributes.length ?
            ' ' + Array.from(node.attributes)
                .map(attr => `${attr.name}="${attr.value}"`)
                .join(' ')
            : '';
        startTagText = `<${tagName}${attrString}>`;
        if (!isSelfClosing) {
            endTagText = `</${tagName}>`;
        }
    }
    else {
        return;
    }
    const fragment = document.createDocumentFragment();
    const textNode = node.ownerDocument.createTextNode(startTagText);
    fragment.appendChild(textNode);
    while (node.firstChild) {
        fragment.appendChild(node.firstChild);
    }
    const endTagTextNode = endTagText ? node.ownerDocument.createTextNode(endTagText) : undefined;
    if (endTagTextNode) {
        fragment.appendChild(endTagTextNode);
    }
    return fragment;
}
/**
 * Sanitizes the given `value` and reset the given `node` with it.
 */
export function safeSetInnerHtml(node, untrusted, config) {
    const fragment = doSanitizeHtml(untrusted, config, 'dom');
    reset(node, fragment);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9tU2FuaXRpemUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvZG9tU2FuaXRpemUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDakMsaURBQWlEO0FBQ2pELE9BQU8sU0FBOEIsTUFBTSwwQkFBMEIsQ0FBQztBQUV0RTs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDaEQsR0FBRztJQUNILE1BQU07SUFDTixHQUFHO0lBQ0gsS0FBSztJQUNMLFlBQVk7SUFDWixJQUFJO0lBQ0osU0FBUztJQUNULE1BQU07SUFDTixNQUFNO0lBQ04sS0FBSztJQUNMLFVBQVU7SUFDVixJQUFJO0lBQ0osS0FBSztJQUNMLFNBQVM7SUFDVCxLQUFLO0lBQ0wsS0FBSztJQUNMLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLFlBQVk7SUFDWixRQUFRO0lBQ1IsSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLElBQUk7SUFDSixJQUFJO0lBQ0osSUFBSTtJQUNKLEdBQUc7SUFDSCxLQUFLO0lBQ0wsS0FBSztJQUNMLEtBQUs7SUFDTCxPQUFPO0lBQ1AsSUFBSTtJQUNKLE1BQU07SUFDTixJQUFJO0lBQ0osR0FBRztJQUNILEtBQUs7SUFDTCxHQUFHO0lBQ0gsSUFBSTtJQUNKLElBQUk7SUFDSixNQUFNO0lBQ04sR0FBRztJQUNILE1BQU07SUFDTixPQUFPO0lBQ1AsT0FBTztJQUNQLFFBQVE7SUFDUixNQUFNO0lBQ04sUUFBUTtJQUNSLFFBQVE7SUFDUixLQUFLO0lBQ0wsU0FBUztJQUNULEtBQUs7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