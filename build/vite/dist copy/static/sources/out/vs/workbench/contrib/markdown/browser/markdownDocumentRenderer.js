/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { sanitizeHtml } from '../../../../base/browser/domSanitize.js';
import { allowedMarkdownHtmlAttributes, allowedMarkdownHtmlTags } from '../../../../base/browser/markdownRenderer.js';
import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../base/common/network.js';
import { escape } from '../../../../base/common/strings.js';
import { tokenizeToString } from '../../../../editor/common/languages/textToHtmlTokenizer.js';
import { markedGfmHeadingIdPlugin } from './markedGfmHeadingIdPlugin.js';
export const DEFAULT_MARKDOWN_STYLES = `
body {
	padding: 10px 20px;
	line-height: 22px;
	max-width: 882px;
	margin: 0 auto;
}

body *:last-child {
	margin-bottom: 0;
}

img {
	max-width: 100%;
	max-height: 100%;
}

a {
	text-decoration: var(--text-link-decoration);
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

h1 {
	padding-bottom: 0.3em;
	line-height: 1.2;
	border-bottom-width: 1px;
	border-bottom-style: solid;
}

h1, h2, h3 {
	font-weight: normal;
}

table {
	border-collapse: collapse;
}

th {
	text-align: left;
	border-bottom: 1px solid;
}

th,
td {
	padding: 5px 10px;
}

table > tbody > tr + tr > td {
	border-top-width: 1px;
	border-top-style: solid;
}

blockquote {
	margin: 0 7px 0 5px;
	padding: 0 16px 0 10px;
	border-left-width: 5px;
	border-left-style: solid;
}

code {
	font-family: "SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace;
}

pre {
	padding: 16px;
	border-radius: 3px;
	overflow: auto;
}

pre code {
	font-family: var(--vscode-editor-font-family);
	font-weight: var(--vscode-editor-font-weight);
	font-size: var(--vscode-editor-font-size);
	line-height: 1.5;
	color: var(--vscode-editor-foreground);
	tab-size: 4;
}

.monaco-tokenized-source {
	white-space: pre;
}

/** Theming */

.pre {
	background-color: var(--vscode-textCodeBlock-background);
}

.vscode-high-contrast h1 {
	border-color: rgb(0, 0, 0);
}

.vscode-light th {
	border-color: rgba(0, 0, 0, 0.69);
}

.vscode-dark th {
	border-color: rgba(255, 255, 255, 0.69);
}

.vscode-light h1,
.vscode-light hr,
.vscode-light td {
	border-color: rgba(0, 0, 0, 0.18);
}

.vscode-dark h1,
.vscode-dark hr,
.vscode-dark td {
	border-color: rgba(255, 255, 255, 0.18);
}

@media (forced-colors: active) and (prefers-color-scheme: light){
	body {
		forced-color-adjust: none;
	}
}

@media (forced-colors: active) and (prefers-color-scheme: dark){
	body {
		forced-color-adjust: none;
	}
}
`;
const defaultAllowedLinkProtocols = Object.freeze([
    Schemas.http,
    Schemas.https,
]);
function sanitize(documentContent, sanitizerConfig) {
    return sanitizeHtml(documentContent, {
        allowedLinkProtocols: {
            override: sanitizerConfig?.allowedLinkProtocols?.override ?? defaultAllowedLinkProtocols,
        },
        allowRelativeLinkPaths: sanitizerConfig?.allowRelativeLinkPaths,
        allowedMediaProtocols: sanitizerConfig?.allowedMediaProtocols,
        allowRelativeMediaPaths: sanitizerConfig?.allowRelativeMediaPaths,
        allowedTags: {
            override: allowedMarkdownHtmlTags,
            augment: sanitizerConfig?.allowedTags?.augment
        },
        allowedAttributes: {
            override: [
                ...allowedMarkdownHtmlAttributes,
                'name',
                'id',
                'class',
                'role',
                'tabindex',
                'placeholder',
            ],
            augment: sanitizerConfig?.allowedAttributes?.augment ?? [],
        }
    });
}
/**
 * Renders a string of markdown for use in an external document context.
 *
 * Uses VS Code's syntax highlighting code blocks. Also does not attach all the hooks and customization that normal
 * markdown renderer.
 */
export async function renderMarkdownDocument(text, extensionService, languageService, options, token = CancellationToken.None) {
    const m = new marked.Marked(MarkedHighlight.markedHighlight({
        async: true,
        async highlight(code, lang) {
            if (typeof lang !== 'string') {
                return escape(code);
            }
            await extensionService.whenInstalledExtensionsRegistered();
            if (token?.isCancellationRequested) {
                return '';
            }
            const languageId = languageService.getLanguageIdByLanguageName(lang) ?? languageService.getLanguageIdByLanguageName(lang.split(/\s+|:|,|(?!^)\{|\?]/, 1)[0]);
            return tokenizeToString(languageService, code, languageId);
        }
    }), markedGfmHeadingIdPlugin(), ...(options?.markedExtensions ?? []));
    const raw = await raceCancellationError(m.parse(text, { async: true }), token ?? CancellationToken.None);
    return sanitize(raw, options?.sanitizerConfig);
}
var MarkedHighlight;
(function (MarkedHighlight) {
    // Copied from https://github.com/markedjs/marked-highlight/blob/main/src/index.js
    function markedHighlight(options) {
        if (typeof options === 'function') {
            options = {
                highlight: options,
            };
        }
        if (!options || typeof options.highlight !== 'function') {
            throw new Error('Must provide highlight function');
        }
        return {
            async: !!options.async,
            walkTokens(token) {
                if (token.type !== 'code') {
                    return;
                }
                if (options.async) {
                    return Promise.resolve(options.highlight(token.text, token.lang)).then(updateToken(token));
                }
                const code = options.highlight(token.text, token.lang);
                if (code instanceof Promise) {
                    throw new Error('markedHighlight is not set to async but the highlight function is async. Set the async option to true on markedHighlight to await the async highlight function.');
                }
                updateToken(token)(code);
            },
            renderer: {
                code({ text, lang, escaped }) {
                    const classAttr = lang
                        ? ` class="language-${escape(lang)}"`
                        : '';
                    text = text.replace(/\n$/, '');
                    return `<pre><code${classAttr}>${escaped ? text : escape(text, true)}\n</code></pre>`;
                },
            },
        };
    }
    MarkedHighlight.markedHighlight = markedHighlight;
    function updateToken(token) {
        return (code) => {
            if (typeof code === 'string' && code !== token.text) {
                token.escaped = true;
                token.text = code;
            }
        };
    }
    // copied from marked helpers
    const escapeTest = /[&<>"']/;
    const escapeReplace = new RegExp(escapeTest.source, 'g');
    const escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
    const escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, 'g');
    const escapeReplacement = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        [`'`]: '&#39;',
    };
    const getEscapeReplacement = (ch) => escapeReplacement[ch];
    function escape(html, encode) {
        if (encode) {
            if (escapeTest.test(html)) {
                return html.replace(escapeReplace, getEscapeReplacement);
            }
        }
        else {
            if (escapeTestNoEncode.test(html)) {
                return html.replace(escapeReplaceNoEncode, getEscapeReplacement);
            }
        }
        return html;
    }
})(MarkedHighlight || (MarkedHighlight = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25Eb2N1bWVudFJlbmRlcmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93bkRvY3VtZW50UmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sS0FBSyxNQUFNLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU5RixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV6RSxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0E0SXRDLENBQUM7QUFFRixNQUFNLDJCQUEyQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDakQsT0FBTyxDQUFDLElBQUk7SUFDWixPQUFPLENBQUMsS0FBSztDQUNiLENB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