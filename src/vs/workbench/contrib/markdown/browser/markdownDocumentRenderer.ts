/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hookDomPurifyHrefAndSrcSanitizer, basicMarkupHtmlTags } from 'vs/base/browser/dom';
import * as dompurify from 'vs/base/browser/dompurify/dompurify';
import { allowedMarkdownAttr } from 'vs/base/browser/markdownRenderer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { marked } from 'vs/base/common/marked/marked';
import { Schemas } from 'vs/base/common/network';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { tokenizeToString } from 'vs/editor/common/languages/textToHtmlTokenizer';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { escape } from 'vs/base/common/strings';

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

const allowedProtocols = [Schemas.http, Schemas.https, Schemas.command];
function sanitize(documentContent: string, allowUnknownProtocols: boolean): string {

	const hook = hookDomPurifyHrefAndSrcSanitizer(allowedProtocols, true);

	try {
		return dompurify.sanitize(documentContent, {
			...{
				ALLOWED_TAGS: [
					...basicMarkupHtmlTags,
					'checkbox',
					'checklist',
				],
				ALLOWED_ATTR: [
					...allowedMarkdownAttr,
					'data-command', 'name', 'id', 'role', 'tabindex',
					'x-dispatch',
					'required', 'checked', 'placeholder', 'when-checked', 'checked-on',
				],
			},
			...(allowUnknownProtocols ? { ALLOW_UNKNOWN_PROTOCOLS: true } : {}),
		});
	} finally {
		hook.dispose();
	}
}

interface IRenderMarkdownDocumentOptions {
	readonly shouldSanitize?: boolean;
	readonly allowUnknownProtocols?: boolean;
	readonly renderer?: marked.Renderer;
	readonly token?: CancellationToken;
}

/**
 * Renders a string of markdown as a document.
 *
 * Uses VS Code's syntax highlighting code blocks.
 */
export async function renderMarkdownDocument(
	text: string,
	extensionService: IExtensionService,
	languageService: ILanguageService,
	options?: IRenderMarkdownDocumentOptions
): Promise<string> {

	const highlight = (code: string, lang: string | undefined, callback: ((error: any, code: string) => void) | undefined): any => {
		if (!callback) {
			return code;
		}

		if (typeof lang !== 'string') {
			callback(null, escape(code));
			return '';
		}

		extensionService.whenInstalledExtensionsRegistered().then(async () => {
			if (options?.token?.isCancellationRequested) {
				callback(null, '');
				return;
			}

			const languageId = languageService.getLanguageIdByLanguageName(lang) ?? languageService.getLanguageIdByLanguageName(lang.split(/\s+|:|,|(?!^)\{|\?]/, 1)[0]);
			const html = await tokenizeToString(languageService, code, languageId);
			callback(null, html);
		});
		return '';
	};

	return new Promise<string>((resolve, reject) => {
		marked(text, { highlight, renderer: options?.renderer }, (err, value) => err ? reject(err) : resolve(value));
	}).then(raw => {
		if (options?.shouldSanitize ?? true) {
			return sanitize(raw, options?.allowUnknownProtocols ?? false);
		} else {
			return raw;
		}
	});
}
