/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../common/errors.js';
import { escapeDoubleQuotes, parseHrefAndDimensions, removeMarkdownEscapes } from '../common/htmlContent.js';
import { markdownEscapeEscapedIcons } from '../common/iconLabels.js';
import { defaultGenerator } from '../common/idGenerator.js';
import { DisposableStore } from '../common/lifecycle.js';
import * as marked from '../common/marked/marked.js';
import { parse } from '../common/marshalling.js';
import { FileAccess, Schemas } from '../common/network.js';
import { cloneAndChange } from '../common/objects.js';
import { basename as pathBasename } from '../common/path.js';
import { basename, dirname, resolvePath } from '../common/resources.js';
import { escape } from '../common/strings.js';
import { URI } from '../common/uri.js';
import * as DOM from './dom.js';
import * as domSanitize from './domSanitize.js';
import { convertTagToPlaintext } from './domSanitize.js';
import { StandardKeyboardEvent } from './keyboardEvent.js';
import { StandardMouseEvent } from './mouseEvent.js';
import { renderIcon, renderLabelWithIcons } from './ui/iconLabel/iconLabels.js';
/**
 * Returns a human-readable tooltip string for a link href.
 * For file:// URIs, converts to a decoded OS file system path to avoid
 * showing raw URL-encoded paths (e.g. "C:\Users\..." instead of "file:///c%3A/Users/...").
 */
function getLinkTitle(href) {
    try {
        const parsed = URI.parse(href);
        if (parsed.scheme === Schemas.file) {
            const path = parsed.fsPath;
            const fragment = parsed.fragment;
            return escapeDoubleQuotes(fragment ? `${path}#${fragment}` : path);
        }
    }
    catch {
        // fall through
    }
    return '';
}
const defaultMarkedRenderers = Object.freeze({
    image: ({ href, title, text }) => {
        let dimensions = [];
        let attributes = [];
        if (href) {
            ({ href, dimensions } = parseHrefAndDimensions(href));
            attributes.push(`src="${escapeDoubleQuotes(href)}"`);
        }
        if (text) {
            attributes.push(`alt="${escapeDoubleQuotes(text)}"`);
        }
        if (title) {
            attributes.push(`title="${escapeDoubleQuotes(title)}"`);
        }
        if (dimensions.length) {
            attributes = attributes.concat(dimensions);
        }
        return '<img ' + attributes.join(' ') + '>';
    },
    paragraph({ tokens }) {
        return `<p>${this.parser.parseInline(tokens)}</p>`;
    },
    link({ href, title, tokens }) {
        let text = this.parser.parseInline(tokens);
        if (typeof href !== 'string') {
            return '';
        }
        // Remove markdown escapes. Workaround for https://github.com/chjj/marked/issues/829
        if (href === text) { // raw link case
            text = removeMarkdownEscapes(text);
        }
        title = typeof title === 'string' ? escapeDoubleQuotes(removeMarkdownEscapes(title)) : '';
        href = removeMarkdownEscapes(href);
        // For file:// URIs without an explicit title, show the decoded OS path instead of
        // the raw URL-encoded URI (e.g. display "C:\Users\..." instead of "file:///c%3A/Users/...")
        if (!title && href.startsWith(`${Schemas.file}:`)) {
            title = getLinkTitle(href);
        }
        // HTML Encode href
        href = href.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        return `<a href="${href}" title="${title || href}" draggable="false">${text}</a>`;
    },
});
/**
 * Blockquote renderer that processes GitHub-style alert syntax.
 * Transforms blockquotes like "> [!NOTE]" into structured alert markup with icons.
 *
 * Based on GitHub's alert syntax: https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts
 */
function createAlertBlockquoteRenderer(fallbackRenderer) {
    return function (token) {
        const { tokens } = token;
        // Check if this blockquote starts with alert syntax [!TYPE]
        const firstToken = tokens[0];
        if (firstToken?.type !== 'paragraph') {
            return fallbackRenderer.call(this, token);
        }
        const paragraphTokens = firstToken.tokens;
        if (!paragraphTokens || paragraphTokens.length === 0) {
            return fallbackRenderer.call(this, token);
        }
        const firstTextToken = paragraphTokens[0];
        if (firstTextToken?.type !== 'text') {
            return fallbackRenderer.call(this, token);
        }
        const pattern = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*?\n*/i;
        const match = firstTextToken.raw.match(pattern);
        if (!match) {
            return fallbackRenderer.call(this, token);
        }
        // Remove the alert marker from the token
        firstTextToken.raw = firstTextToken.raw.replace(pattern, '');
        firstTextToken.text = firstTextToken.text.replace(pattern, '');
        const alertIcons = {
            'note': 'info',
            'tip': 'light-bulb',
            'important': 'comment',
            'warning': 'alert',
            'caution': 'stop'
        };
        const type = match[1];
        const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
        const severity = type.toLowerCase();
        const iconHtml = renderIcon({ id: alertIcons[severity] }).outerHTML;
        // Render the remaining content
        const content = this.parser.parse(tokens);
        // Return alert markup with icon and severity (skipping the first 3 characters: `<p>`)
        return `<blockquote data-severity="${severity}"><p><span>${iconHtml}${typeCapitalized}</span>${content.substring(3)}</blockquote>\n`;
    };
}
/**
 * Low-level way create a html element from a markdown string.
 *
 * **Note** that for most cases you should be using {@link import('../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js').MarkdownRenderer MarkdownRenderer}
 * which comes with support for pretty code block rendering and which uses the default way of handling links.
 */
export function renderMarkdown(markdown, options = {}, target) {
    const disposables = new DisposableStore();
    let isDisposed = false;
    const markedInstance = new marked.Marked(...(options.markedExtensions ?? []));
    const { renderer, codeBlocks, syncCodeBlocks } = createMarkdownRenderer(markedInstance, options, markdown);
    const value = preprocessMarkdownString(markdown);
    let renderedMarkdown;
    if (options.fillInIncompleteTokens) {
        // The defaults are applied by parse but not lexer()/parser(), and they need to be present
        const opts = {
            ...markedInstance.defaults,
            ...options.markedOptions,
            renderer
        };
        const tokens = markedInstance.lexer(value, opts);
        const newTokens = fillInIncompleteTokens(tokens);
        renderedMarkdown = markedInstance.parser(newTokens, opts);
    }
    else {
        renderedMarkdown = markedInstance.parse(value, { ...options?.markedOptions, renderer, async: false });
    }
    // Rewrite theme icons
    if (markdown.supportThemeIcons) {
        const elements = renderLabelWithIcons(renderedMarkdown);
        renderedMarkdown = elements.map(e => typeof e === 'string' ? e : e.outerHTML).join('');
    }
    const renderedContent = document.createElement('div');
    const sanitizerConfig = getDomSanitizerConfig(markdown, options.sanitizerConfig ?? {});
    domSanitize.safeSetInnerHtml(renderedContent, renderedMarkdown, sanitizerConfig);
    // Rewrite links and images before potentially inserting them into the real dom
    rewriteRenderedLinks(markdown, options, renderedContent);
    let outElement;
    if (target) {
        outElement = target;
        DOM.reset(target, ...renderedContent.childNodes);
    }
    else {
        outElement = renderedContent;
    }
    if (codeBlocks.length > 0) {
        Promise.all(codeBlocks).then((tuples) => {
            if (isDisposed) {
                return;
            }
            const renderedElements = new Map(tuples);
            // eslint-disable-next-line no-restricted-syntax
            const placeholderElements = outElement.querySelectorAll(`div[data-code]`);
            for (const placeholderElement of placeholderElements) {
                const renderedElement = renderedElements.get(placeholderElement.dataset['code'] ?? '');
                if (renderedElement) {
                    DOM.reset(placeholderElement, renderedElement);
                }
            }
            options.asyncRenderCallback?.();
        });
    }
    else if (syncCodeBlocks.length > 0) {
        const renderedElements = new Map(syncCodeBlocks);
        // eslint-disable-next-line no-restricted-syntax
        const placeholderElements = outElement.querySelectorAll(`div[data-code]`);
        for (const placeholderElement of placeholderElements) {
            const renderedElement = renderedElements.get(placeholderElement.dataset['code'] ?? '');
            if (renderedElement) {
                DOM.reset(placeholderElement, renderedElement);
            }
        }
    }
    // Signal size changes for image tags
    if (options.asyncRenderCallback) {
        // eslint-disable-next-line no-restricted-syntax
        for (const img of outElement.getElementsByTagName('img')) {
            const listener = disposables.add(DOM.addDisposableListener(img, 'load', () => {
                listener.dispose();
                options.asyncRenderCallback();
            }));
        }
    }
    // Add event listeners for links
    if (options.actionHandler) {
        const clickCb = (e) => {
            const mouseEvent = new StandardMouseEvent(DOM.getWindow(outElement), e);
            if (!mouseEvent.leftButton && !mouseEvent.middleButton) {
                return;
            }
            activateLink(markdown, options, mouseEvent);
        };
        disposables.add(DOM.addDisposableListener(outElement, 'click', clickCb));
        disposables.add(DOM.addDisposableListener(outElement, 'auxclick', clickCb));
        disposables.add(DOM.addDisposableListener(outElement, 'keydown', (e) => {
            const keyboardEvent = new StandardKeyboardEvent(e);
            if (!keyboardEvent.equals(10 /* KeyCode.Space */) && !keyboardEvent.equals(3 /* KeyCode.Enter */)) {
                return;
            }
            activateLink(markdown, options, keyboardEvent);
        }));
    }
    // Remove/disable inputs
    // eslint-disable-next-line no-restricted-syntax
    for (const input of [...outElement.getElementsByTagName('input')]) {
        if (input.attributes.getNamedItem('type')?.value === 'checkbox') {
            input.setAttribute('disabled', '');
        }
        else {
            if (options.sanitizerConfig?.replaceWithPlaintext) {
                const replacement = convertTagToPlaintext(input);
                if (replacement) {
                    input.parentElement?.replaceChild(replacement, input);
                }
                else {
                    input.remove();
                }
            }
            else {
                input.remove();
            }
        }
    }
    return {
        element: outElement,
        dispose: () => {
            isDisposed = true;
            disposables.dispose();
        }
    };
}
function rewriteRenderedLinks(markdown, options, root) {
    // eslint-disable-next-line no-restricted-syntax
    for (const el of root.querySelectorAll('img, audio, video, source')) {
        const src = el.getAttribute('src'); // Get the raw 'src' attribute value as text, not the resolved 'src'
        if (src) {
            let href = src;
            try {
                if (markdown.baseUri) { // absolute or relative local path, or file: uri
                    href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
                }
            }
            catch (err) { }
            el.setAttribute('src', massageHref(markdown, href, true));
            if (options.sanitizerConfig?.remoteImageIsAllowed) {
                const uri = URI.parse(href);
                if (uri.scheme !== Schemas.file && uri.scheme !== Schemas.data && !options.sanitizerConfig.remoteImageIsAllowed(uri)) {
                    el.replaceWith(DOM.$('', undefined, el.outerHTML));
                }
            }
        }
    }
    // eslint-disable-next-line no-restricted-syntax
    for (const el of root.querySelectorAll('a')) {
        const href = el.getAttribute('href'); // Get the raw 'href' attribute value as text, not the resolved 'href'
        el.setAttribute('href', ''); // Clear out href. We use the `data-href` for handling clicks instead
        if (!href
            || /^data:|javascript:/i.test(href)
            || (/^command:/i.test(href) && !markdown.isTrusted)
            || /^command:(\/\/\/)?_workbench\.downloadResource/i.test(href)) {
            // drop the link
            el.replaceWith(...el.childNodes);
        }
        else {
            let resolvedHref = massageHref(markdown, href, false);
            if (markdown.baseUri) {
                resolvedHref = resolveWithBaseUri(URI.from(markdown.baseUri), href);
            }
            el.dataset.href = resolvedHref;
        }
    }
}
function createMarkdownRenderer(marked, options, markdown) {
    const renderer = new marked.Renderer(options.markedOptions);
    renderer.image = defaultMarkedRenderers.image;
    renderer.link = defaultMarkedRenderers.link;
    renderer.paragraph = defaultMarkedRenderers.paragraph;
    if (markdown.supportAlertSyntax) {
        renderer.blockquote = createAlertBlockquoteRenderer(renderer.blockquote);
    }
    // Will collect [id, renderedElement] tuples
    const codeBlocks = [];
    const syncCodeBlocks = [];
    if (options.codeBlockRendererSync) {
        renderer.code = ({ text, lang, raw }) => {
            const id = defaultGenerator.nextId();
            const value = options.codeBlockRendererSync(postProcessCodeBlockLanguageId(lang), text, raw);
            syncCodeBlocks.push([id, value]);
            return `<div class="code" data-code="${id}">${escape(text)}</div>`;
        };
    }
    else if (options.codeBlockRenderer) {
        renderer.code = ({ text, lang }) => {
            const id = defaultGenerator.nextId();
            const value = options.codeBlockRenderer(postProcessCodeBlockLanguageId(lang), text);
            codeBlocks.push(value.then(element => [id, element]));
            return `<div class="code" data-code="${id}">${escape(text)}</div>`;
        };
    }
    if (!markdown.supportHtml) {
        // Note: we always pass the output through dompurify after this so that we don't rely on
        // marked for real sanitization.
        renderer.html = ({ text }) => {
            if (options.sanitizerConfig?.replaceWithPlaintext) {
                return escape(text);
            }
            const match = markdown.isTrusted ? text.match(/^(<span[^>]+>)|(<\/\s*span>)$/) : undefined;
            return match ? text : '';
        };
    }
    return { renderer, codeBlocks, syncCodeBlocks };
}
function preprocessMarkdownString(markdown) {
    let value = markdown.value;
    // values that are too long will freeze the UI
    if (value.length > 100_000) {
        value = `${value.substr(0, 100_000)}…`;
    }
    // escape theme icons
    if (markdown.supportThemeIcons) {
        value = markdownEscapeEscapedIcons(value);
    }
    return value;
}
function activateLink(mdStr, options, event) {
    const target = event.target.closest('a[data-href]');
    if (!DOM.isHTMLElement(target)) {
        return;
    }
    try {
        let href = target.dataset['href'];
        if (href) {
            if (mdStr.baseUri) {
                href = resolveWithBaseUri(URI.from(mdStr.baseUri), href);
            }
            options.actionHandler?.(href, mdStr);
        }
    }
    catch (err) {
        onUnexpectedError(err);
    }
    finally {
        event.preventDefault();
        event.stopPropagation();
    }
}
function uriMassage(markdown, part) {
    let data;
    try {
        data = parse(decodeURIComponent(part));
    }
    catch (e) {
        // ignore
    }
    if (!data) {
        return part;
    }
    data = cloneAndChange(data, value => {
        if (markdown.uris && markdown.uris[value]) {
            return URI.revive(markdown.uris[value]);
        }
        else {
            return undefined;
        }
    });
    return encodeURIComponent(JSON.stringify(data));
}
function massageHref(markdown, href, isDomUri) {
    const data = markdown.uris && markdown.uris[href];
    let uri = URI.revive(data);
    if (isDomUri) {
        if (href.startsWith(Schemas.data + ':')) {
            return href;
        }
        if (!uri) {
            uri = URI.parse(href);
        }
        // this URI will end up as "src"-attribute of a dom node
        // and because of that special rewriting needs to be done
        // so that the URI uses a protocol that's understood by
        // browsers (like http or https)
        return FileAccess.uriToBrowserUri(uri).toString(true);
    }
    if (!uri) {
        return href;
    }
    if (URI.parse(href).toString() === uri.toString()) {
        return href; // no transformation performed
    }
    if (uri.query) {
        uri = uri.with({ query: uriMassage(markdown, uri.query) });
    }
    return uri.toString();
}
function postProcessCodeBlockLanguageId(lang) {
    if (!lang) {
        return '';
    }
    const parts = lang.split(/[\s+|:|,|\{|\?]/, 1);
    if (parts.length) {
        return parts[0];
    }
    return lang;
}
function resolveWithBaseUri(baseUri, href) {
    const hasScheme = /^\w[\w\d+.-]*:/.test(href);
    if (hasScheme) {
        return href;
    }
    if (baseUri.path.endsWith('/')) {
        return resolvePath(baseUri, href).toString();
    }
    else {
        return resolvePath(dirname(baseUri), href).toString();
    }
}
function sanitizeRenderedMarkdown(renderedMarkdown, originalMdStrConfig, options = {}) {
    const sanitizerConfig = getDomSanitizerConfig(originalMdStrConfig, options);
    return domSanitize.sanitizeHtml(renderedMarkdown, sanitizerConfig);
}
export const allowedMarkdownHtmlTags = Object.freeze([
    ...domSanitize.basicMarkupHtmlTags,
    'input', // Allow inputs for rendering checkboxes. Other types of inputs are removed and the inputs are always disabled
]);
export const allowedMarkdownHtmlAttributes = Object.freeze([
    'align',
    'autoplay',
    'alt',
    'colspan',
    'controls',
    'draggable',
    'height',
    'href',
    'loop',
    'muted',
    'playsinline',
    'poster',
    'rowspan',
    'src',
    'target',
    'title',
    'type',
    'width',
    'start',
    // Input (For disabled inputs)
    'checked',
    'disabled',
    'value',
    // Custom markdown attributes
    'data-code',
    'data-href',
    'data-severity',
    // Only allow very specific styles
    {
        attributeName: 'style',
        shouldKeep: (element, data) => {
            if (element.tagName === 'SPAN') {
                if (data.attrName === 'style') {
                    return /^(color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(background-color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(border-radius:[0-9]+px;)?$/.test(data.attrValue);
                }
            }
            return false;
        }
    },
    // Only allow codicons for classes
    {
        attributeName: 'class',
        shouldKeep: (element, data) => {
            if (element.tagName === 'SPAN') {
                if (data.attrName === 'class') {
                    return /^codicon codicon-[a-z\-]+( codicon-modifier-[a-z\-]+)?$/.test(data.attrValue);
                }
            }
            return false;
        },
    },
]);
function getDomSanitizerConfig(mdStrConfig, options) {
    const isTrusted = mdStrConfig.isTrusted ?? false;
    const allowedLinkSchemes = [
        Schemas.http,
        Schemas.https,
        Schemas.mailto,
        Schemas.file,
        Schemas.vscodeFileResource,
        Schemas.vscodeRemote,
        Schemas.vscodeRemoteResource,
        Schemas.vscodeNotebookCell,
        // For links that are handled entirely by the action handler
        Schemas.internal,
    ];
    if (isTrusted) {
        allowedLinkSchemes.push(Schemas.command);
    }
    if (options.allowedLinkSchemes?.augment) {
        allowedLinkSchemes.push(...options.allowedLinkSchemes.augment);
    }
    return {
        // allowedTags should included everything that markdown renders to.
        // Since we have our own sanitize function for marked, it's possible we missed some tag so let dompurify make sure.
        // HTML tags that can result from markdown are from reading https://spec.commonmark.org/0.29/
        // HTML table tags that can result from markdown are from https://github.github.com/gfm/#tables-extension-
        allowedTags: {
            override: options.allowedTags?.override ?? allowedMarkdownHtmlTags
        },
        allowedAttributes: {
            override: options.allowedAttributes?.override ?? allowedMarkdownHtmlAttributes,
        },
        allowedLinkProtocols: {
            override: allowedLinkSchemes,
        },
        allowRelativeLinkPaths: !!mdStrConfig.baseUri,
        allowedMediaProtocols: {
            override: [
                Schemas.http,
                Schemas.https,
                Schemas.data,
                Schemas.file,
                Schemas.vscodeFileResource,
                Schemas.vscodeRemote,
                Schemas.vscodeRemoteResource,
            ]
        },
        allowRelativeMediaPaths: !!mdStrConfig.baseUri,
        replaceWithPlaintext: options.replaceWithPlaintext,
    };
}
/**
 * Renders `str` as plaintext, stripping out Markdown syntax if it's a {@link IMarkdownString}.
 *
 * For example `# Header` would be output as `Header`.
 */
export function renderAsPlaintext(str, options) {
    if (typeof str === 'string') {
        return str;
    }
    // values that are too long will freeze the UI
    let value = str.value ?? '';
    if (value.length > 100_000) {
        value = `${value.substr(0, 100_000)}…`;
    }
    const renderer = createPlainTextRenderer();
    if (options?.includeCodeBlocksFences) {
        renderer.code = codeBlockFences;
    }
    if (options?.useLinkFormatter) {
        renderer.link = linkFormatter;
    }
    const html = marked.parse(value, { async: false, renderer });
    return sanitizeRenderedMarkdown(html, { isTrusted: false }, {})
        .toString()
        .replace(/&(#\d+|[a-zA-Z]+);/g, m => unescapeInfo.get(m) ?? m)
        .trim();
}
const unescapeInfo = new Map([
    ['&quot;', '"'],
    ['&nbsp;', ' '],
    ['&amp;', '&'],
    ['&#39;', '\''],
    ['&lt;', '<'],
    ['&gt;', '>'],
]);
function createPlainTextRenderer() {
    const renderer = new marked.Renderer();
    renderer.code = ({ text }) => {
        return escape(text);
    };
    renderer.blockquote = ({ text }) => {
        return text + '\n';
    };
    renderer.html = (_) => {
        return '';
    };
    renderer.heading = function ({ tokens }) {
        return this.parser.parseInline(tokens) + '\n';
    };
    renderer.hr = () => {
        return '';
    };
    renderer.list = function ({ items }) {
        return items.map(x => this.listitem(x)).join('\n') + '\n';
    };
    renderer.listitem = ({ text }) => {
        return text + '\n';
    };
    renderer.paragraph = function ({ tokens }) {
        return this.parser.parseInline(tokens) + '\n';
    };
    renderer.table = function ({ header, rows }) {
        return header.map(cell => this.tablecell(cell)).join(' ') + '\n' + rows.map(cells => cells.map(cell => this.tablecell(cell)).join(' ')).join('\n') + '\n';
    };
    renderer.tablerow = ({ text }) => {
        return text;
    };
    renderer.tablecell = function ({ tokens }) {
        return this.parser.parseInline(tokens);
    };
    renderer.strong = ({ text }) => {
        return text;
    };
    renderer.em = ({ text }) => {
        return text;
    };
    renderer.codespan = ({ text }) => {
        return escape(text);
    };
    renderer.br = (_) => {
        return '\n';
    };
    renderer.del = ({ text }) => {
        return text;
    };
    renderer.image = (_) => {
        return '';
    };
    renderer.text = ({ text }) => {
        return text;
    };
    renderer.link = ({ text }) => {
        return text;
    };
    return renderer;
}
const codeBlockFences = ({ text }) => {
    return `\n\`\`\`\n${escape(text)}\n\`\`\`\n`;
};
const linkFormatter = ({ text, href }) => {
    try {
        if (href) {
            const uri = URI.parse(href);
            return text.trim() || basename(uri);
        }
    }
    catch (e) {
        return text.trim() || pathBasename(href);
    }
    return text;
};
function mergeRawTokenText(tokens) {
    let mergedTokenText = '';
    tokens.forEach(token => {
        mergedTokenText += token.raw;
    });
    return mergedTokenText;
}
function completeSingleLinePattern(token) {
    if (!token.tokens) {
        return undefined;
    }
    for (let i = token.tokens.length - 1; i >= 0; i--) {
        const subtoken = token.tokens[i];
        if (subtoken.type === 'text') {
            const lines = subtoken.raw.split('\n');
            const lastLine = lines[lines.length - 1];
            if (lastLine.includes('`')) {
                return completeCodespan(token);
            }
            else if (lastLine.includes('**')) {
                return completeDoublestar(token);
            }
            else if (lastLine.match(/\*\w/)) {
                return completeStar(token);
            }
            else if (lastLine.match(/(^|\s)__\w/)) {
                return completeDoubleUnderscore(token);
            }
            else if (lastLine.match(/(^|\s)_\w/)) {
                return completeUnderscore(token);
            }
            else if (
            // Text with start of link target
            hasLinkTextAndStartOfLinkTarget(lastLine) ||
                // This token doesn't have the link text, eg if it contains other markdown constructs that are in other subtokens.
                // But some preceding token does have an unbalanced [ at least
                hasStartOfLinkTargetAndNoLinkText(lastLine) && token.tokens.slice(0, i).some(t => t.type === 'text' && t.raw.match(/\[[^\]]*$/))) {
                const nextTwoSubTokens = token.tokens.slice(i + 1);
                // A markdown link can look like
                // [link text](https://microsoft.com "more text")
                // Where "more text" is a title for the link or an argument to a vscode command link
                if (
                // If the link was parsed as a link, then look for a link token and a text token with a quote
                nextTwoSubTokens[0]?.type === 'link' && nextTwoSubTokens[1]?.type === 'text' && nextTwoSubTokens[1].raw.match(/^ *"[^"]*$/) ||
                    // And if the link was not parsed as a link (eg command link), just look for a single quote in this token
                    lastLine.match(/^[^"]* +"[^"]*$/)) {
                    return completeLinkTargetArg(token);
                }
                return completeLinkTarget(token);
            }
            // Contains the start of link text, and no following tokens contain the link target
            else if (lastLine.match(/(^|\s)\[\w*[^\]]*$/)) {
                return completeLinkText(token);
            }
        }
    }
    return undefined;
}
function hasLinkTextAndStartOfLinkTarget(str) {
    return !!str.match(/(^|\s)\[.*\]\(\w*/);
}
function hasStartOfLinkTargetAndNoLinkText(str) {
    return !!str.match(/^[^\[]*\]\([^\)]*$/);
}
function completeListItemPattern(list) {
    // Patch up this one list item
    const lastListItem = list.items[list.items.length - 1];
    const lastListSubToken = lastListItem.tokens ? lastListItem.tokens[lastListItem.tokens.length - 1] : undefined;
    /*
    Example list token structures:

    list
        list_item
            text
                text
                codespan
                link
        list_item
            text
            code // Complete indented codeblock
        list_item
            text
            space
            text
                text // Incomplete indented codeblock
        list_item
            text
            list // Nested list
                list_item
                    text
                        text

    Contrast with paragraph:
    paragraph
        text
        codespan
    */
    const listEndsInHeading = (list) => {
        // A list item can be rendered as a heading for some reason when it has a subitem where we haven't rendered the text yet like this:
        // 1. list item
        //    -
        const lastItem = list.items.at(-1);
        const lastToken = lastItem?.tokens.at(-1);
        return lastToken?.type === 'heading' || lastToken?.type === 'list' && listEndsInHeading(lastToken);
    };
    let newToken;
    if (lastListSubToken?.type === 'text' && !('inRawBlock' in lastListItem)) { // Why does Tag have a type of 'text'
        newToken = completeSingleLinePattern(lastListSubToken);
    }
    else if (listEndsInHeading(list)) {
        const newList = marked.lexer(list.raw.trim() + ' &nbsp;')[0];
        if (newList.type !== 'list') {
            // Something went wrong
            return;
        }
        return newList;
    }
    if (!newToken || newToken.type !== 'paragraph') { // 'text' item inside the list item turns into paragraph
        // Nothing to fix, or not a pattern we were expecting
        return;
    }
    const previousListItemsText = mergeRawTokenText(list.items.slice(0, -1));
    // Grabbing the `- ` or `1. ` or `* ` off the list item because I can't find a better way to do this
    const lastListItemLead = lastListItem.raw.match(/^(\s*(-|\d+\.|\*) +)/)?.[0];
    if (!lastListItemLead) {
        // Is badly formatted
        return;
    }
    const newListItemText = lastListItemLead +
        mergeRawTokenText(lastListItem.tokens.slice(0, -1)) +
        newToken.raw;
    const newList = marked.lexer(previousListItemsText + newListItemText)[0];
    if (newList.type !== 'list') {
        // Something went wrong
        return;
    }
    return newList;
}
function completeHeading(token, fullRawText) {
    if (token.raw.match(/-\s*$/)) {
        return marked.lexer(fullRawText + ' &nbsp;');
    }
}
const maxIncompleteTokensFixRounds = 3;
export function fillInIncompleteTokens(tokens) {
    for (let i = 0; i < maxIncompleteTokensFixRounds; i++) {
        const newTokens = fillInIncompleteTokensOnce(tokens);
        if (newTokens) {
            tokens = newTokens;
        }
        else {
            break;
        }
    }
    return tokens;
}
function fillInIncompleteTokensOnce(tokens) {
    let i;
    let newTokens;
    for (i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'paragraph' && token.raw.match(/(\n|^)\|/)) {
            newTokens = completeTable(tokens.slice(i));
            break;
        }
    }
    const lastToken = tokens.at(-1);
    if (!newTokens && lastToken?.type === 'list') {
        const newListToken = completeListItemPattern(lastToken);
        if (newListToken) {
            newTokens = [newListToken];
            i = tokens.length - 1;
        }
    }
    if (!newTokens && lastToken?.type === 'paragraph') {
        // Only operates on a single token, because any newline that follows this should break these patterns
        const newToken = completeSingleLinePattern(lastToken);
        if (newToken) {
            newTokens = [newToken];
            i = tokens.length - 1;
        }
    }
    if (newTokens) {
        const newTokensList = [
            ...tokens.slice(0, i),
            ...newTokens
        ];
        newTokensList.links = tokens.links;
        return newTokensList;
    }
    if (lastToken?.type === 'heading') {
        const completeTokens = completeHeading(lastToken, mergeRawTokenText(tokens));
        if (completeTokens) {
            return completeTokens;
        }
    }
    return null;
}
function completeCodespan(token) {
    return completeWithString(token, '`');
}
function completeStar(tokens) {
    return completeWithString(tokens, '*');
}
function completeUnderscore(tokens) {
    return completeWithString(tokens, '_');
}
function completeLinkTarget(tokens) {
    return completeWithString(tokens, ')', false);
}
function completeLinkTargetArg(tokens) {
    return completeWithString(tokens, '")', false);
}
function completeLinkText(tokens) {
    return completeWithString(tokens, '](https://microsoft.com)', false);
}
function completeDoublestar(tokens) {
    return completeWithString(tokens, '**');
}
function completeDoubleUnderscore(tokens) {
    return completeWithString(tokens, '__');
}
function completeWithString(tokens, closingString, shouldTrim = true) {
    const mergedRawText = mergeRawTokenText(Array.isArray(tokens) ? tokens : [tokens]);
    // If it was completed correctly, this should be a single token.
    // Expecting either a Paragraph or a List
    const trimmedRawText = shouldTrim ? mergedRawText.trimEnd() : mergedRawText;
    return marked.lexer(trimmedRawText + closingString)[0];
}
function completeTable(tokens) {
    const mergedRawText = mergeRawTokenText(tokens);
    const lines = mergedRawText.split('\n');
    let numCols; // The number of line1 col headers
    let hasSeparatorRow = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (typeof numCols === 'undefined' && line.match(/^\s*\|/)) {
            const line1Matches = line.match(/(\|[^\|]+)(?=\||$)/g);
            if (line1Matches) {
                numCols = line1Matches.length;
            }
        }
        else if (typeof numCols === 'number') {
            if (line.match(/^\s*\|/)) {
                if (i !== lines.length - 1) {
                    // We got the line1 header row, and the line2 separator row, but there are more lines, and it wasn't parsed as a table!
                    // That's strange and means that the table is probably malformed in the source, so I won't try to patch it up.
                    return undefined;
                }
                // Got a line2 separator row- partial or complete, doesn't matter, we'll replace it with a correct one
                hasSeparatorRow = true;
            }
            else {
                // The line after the header row isn't a valid separator row, so the table is malformed, don't fix it up
                return undefined;
            }
        }
    }
    if (typeof numCols === 'number' && numCols > 0) {
        const prefixText = hasSeparatorRow ? lines.slice(0, -1).join('\n') : mergedRawText;
        const line1EndsInPipe = !!prefixText.match(/\|\s*$/);
        const newRawText = prefixText + (line1EndsInPipe ? '' : '|') + `\n|${' --- |'.repeat(numCols)}`;
        return marked.lexer(newRawText);
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25SZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxrQkFBa0IsRUFBaUQsc0JBQXNCLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUM1SixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sd0JBQXdCLENBQUM7QUFDdEUsT0FBTyxLQUFLLE1BQU0sTUFBTSw0QkFBNEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDakQsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUMzRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFFBQVEsSUFBSSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN4RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDOUMsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxrQkFBa0IsQ0FBQztBQUN0RCxPQUFPLEtBQUssR0FBRyxNQUFNLFVBQVUsQ0FBQztBQUNoQyxPQUFPLEtBQUssV0FBVyxNQUFNLGtCQUFrQixDQUFDO0FBQ2hELE9BQU8sRUFB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