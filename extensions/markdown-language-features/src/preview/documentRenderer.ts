/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as uri from 'vscode-uri';
import { ILogger } from '../logging';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { escapeAttribute } from '../util/dom';
import { WebviewResourceProvider } from '../util/resources';
import { generateUuid } from '../util/uuid';
import { MarkdownPreviewConfiguration, MarkdownPreviewConfigurationManager } from './previewConfig';
import { ContentSecurityPolicyArbiter, MarkdownPreviewSecurityLevel } from './security';
import type { DiffScrollSyncData, MarkdownPreviewInnerChange, MarkdownPreviewLineChanges } from '../../types/previewMessaging';


/**
 * Strings used inside the markdown preview.
 *
 * Stored here and then injected in the preview so that they
 * can be localized using our normal localization process.
 */
const previewStrings = {
	cspAlertMessageText: vscode.l10n.t("Some content has been disabled in this document"),

	cspAlertMessageTitle: vscode.l10n.t("Potentially unsafe or insecure content has been disabled in the Markdown preview. Change the Markdown preview security setting to allow insecure content or enable scripts"),

	cspAlertMessageLabel: vscode.l10n.t("Content Disabled Security Warning")
};

export interface MarkdownContentProviderOutput {
	html: string;
	containingImages: Set<string>;
}

export interface ImageInfo {
	readonly id: string;
	readonly width: number;
	readonly height: number;
}

export class MdDocumentRenderer {

	readonly #engine: MarkdownItEngine;
	readonly #context: vscode.ExtensionContext;
	readonly #cspArbiter: ContentSecurityPolicyArbiter;
	readonly #contributionProvider: MarkdownContributionProvider;
	readonly #logger: ILogger;

	constructor(
		engine: MarkdownItEngine,
		context: vscode.ExtensionContext,
		cspArbiter: ContentSecurityPolicyArbiter,
		contributionProvider: MarkdownContributionProvider,
		logger: ILogger
	) {
		this.#engine = engine;
		this.#context = context;
		this.#cspArbiter = cspArbiter;
		this.#contributionProvider = contributionProvider;
		this.#logger = logger;
		this.iconPath = {
			dark: vscode.Uri.joinPath(this.#context.extensionUri, 'media', 'preview-dark.svg'),
			light: vscode.Uri.joinPath(this.#context.extensionUri, 'media', 'preview-light.svg'),
		};
	}

	public readonly iconPath: { light: vscode.Uri; dark: vscode.Uri };

	public async renderDocument(
		markdownDocument: vscode.TextDocument,
		resourceProvider: WebviewResourceProvider,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		initialLine: number | undefined,
		selectedLine: number | undefined,
		state: any | undefined,
		imageInfo: readonly ImageInfo[],
		lineChanges: MarkdownPreviewLineChanges | undefined,
		diffScrollSync: DiffScrollSyncData | undefined,
		token: vscode.CancellationToken
	): Promise<MarkdownContentProviderOutput> {
		const sourceUri = markdownDocument.uri;
		const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
		const initialData = {
			source: sourceUri.toString(),
			fragment: state?.fragment || markdownDocument.uri.fragment || undefined,
			line: initialLine,
			selectedLine,
			lineChanges,
			diffScrollSync,
			scrollPreviewWithEditor: config.scrollPreviewWithEditor,
			scrollEditorWithPreview: config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
			disableSecurityWarnings: this.#cspArbiter.shouldDisableSecurityWarnings(),
			webviewResourceRoot: resourceProvider.asWebviewUri(markdownDocument.uri).toString(),
		};

		this.#logger.trace('DocumentRenderer', `provideTextDocumentContent - ${markdownDocument.uri}`, initialData);

		// Content Security Policy
		const nonce = generateUuid();
		const csp = this.#getCsp(resourceProvider, sourceUri, nonce);

		const body = await this.renderBody(markdownDocument, resourceProvider, lineChanges);
		if (token.isCancellationRequested) {
			return { html: '', containingImages: new Set() };
		}

		const html = `<!DOCTYPE html>
			<html style="${escapeAttribute(this.#getSettingsOverrideStyles(config))}">
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}">
				<meta id="vscode-markdown-preview-data"
					data-settings="${escapeAttribute(JSON.stringify(initialData))}"
					data-strings="${escapeAttribute(JSON.stringify(previewStrings))}"
					data-state="${escapeAttribute(JSON.stringify(state || {}))}"
					data-initial-md-content="${escapeAttribute(body.html)}">
				<script src="${this.#extensionResourcePath(resourceProvider, 'pre.js')}" nonce="${nonce}"></script>
				${this.#getStyles(resourceProvider, sourceUri, config, imageInfo)}
				<base href="${resourceProvider.asWebviewUri(markdownDocument.uri)}">
			</head>
			<body class="vscode-body ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
				${this.#getScripts(resourceProvider, nonce)}
			</body>
			</html>`;
		return {
			html,
			containingImages: body.containingImages,
		};
	}

	public async renderBody(
		markdownDocument: vscode.TextDocument,
		resourceProvider: WebviewResourceProvider,
		lineChanges?: MarkdownPreviewLineChanges,
	): Promise<MarkdownContentProviderOutput> {
		const innerChanges = lineChanges?.innerChanges;

		// If there are inner changes, inject empty marker spans into the source text
		// before rendering. The webview uses the CSS Custom Highlight API to create
		// highlights between each marker pair, which works across HTML tag boundaries.
		const input: vscode.TextDocument | string = innerChanges?.length
			? injectInnerChangeMarkers(markdownDocument.getText(), innerChanges)
			: markdownDocument;

		const rendered = await this.#engine.render(input, resourceProvider);
		const html = `<div class="markdown-body" dir="auto">${rendered.html}<div class="code-line" data-line="${markdownDocument.lineCount}"></div></div>`;
		return {
			html,
			containingImages: rendered.containingImages
		};
	}

	public renderFileNotFoundDocument(resource: vscode.Uri): string {
		const resourcePath = uri.Utils.basename(resource);
		const body = vscode.l10n.t('{0} cannot be found', resourcePath);
		return `<!DOCTYPE html>
			<html>
			<body class="vscode-body">
				${body}
			</body>
			</html>`;
	}

	#extensionResourcePath(resourceProvider: WebviewResourceProvider, mediaFile: string): string {
		const webviewResource = resourceProvider.asWebviewUri(
			vscode.Uri.joinPath(this.#context.extensionUri, 'media', mediaFile));
		return webviewResource.toString();
	}

	#fixHref(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, href: string): string {
		if (!href) {
			return href;
		}

		if (href.startsWith('http:') || href.startsWith('https:') || href.startsWith('file:')) {
			return href;
		}

		// Assume it must be a local file
		if (href.startsWith('/') || /^[a-z]:\\/i.test(href)) {
			return resourceProvider.asWebviewUri(vscode.Uri.file(href)).toString();
		}

		// Use a workspace relative path if there is a workspace
		const root = vscode.workspace.getWorkspaceFolder(resource);
		if (root) {
			return resourceProvider.asWebviewUri(vscode.Uri.joinPath(root.uri, href)).toString();
		}

		// Otherwise look relative to the markdown file
		return resourceProvider.asWebviewUri(vscode.Uri.joinPath(uri.Utils.dirname(resource), href)).toString();
	}

	#computeCustomStyleSheetIncludes(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: MarkdownPreviewConfiguration): string {
		if (!Array.isArray(config.styles)) {
			return '';
		}
		const out: string[] = [];
		for (const style of config.styles) {
			out.push(`<link rel="stylesheet" class="code-user-style" data-source="${escapeAttribute(style)}" href="${escapeAttribute(this.#fixHref(resourceProvider, resource, style))}" type="text/css" media="screen">`);
		}
		return out.join('\n');
	}

	#getSettingsOverrideStyles(config: MarkdownPreviewConfiguration): string {
		return [
			config.fontFamily ? `--markdown-font-family: ${config.fontFamily};` : '',
			isNaN(config.fontSize) ? '' : `--markdown-font-size: ${config.fontSize}px;`,
			isNaN(config.lineHeight) ? '' : `--markdown-line-height: ${config.lineHeight};`,
		].join(' ');
	}

	#getImageStabilizerStyles(imageInfo: readonly ImageInfo[]): string {
		if (!imageInfo.length) {
			return '';
		}

		let ret = '<style>\n';
		for (const imgInfo of imageInfo) {
			ret += `#${imgInfo.id}.loading {
					height: ${imgInfo.height}px;
					width: ${imgInfo.width}px;
				}\n`;
		}
		ret += '</style>\n';

		return ret;
	}

	#getStyles(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: MarkdownPreviewConfiguration, imageInfo: readonly ImageInfo[]): string {
		const baseStyles: string[] = [];
		for (const resource of this.#contributionProvider.contributions.previewStyles) {
			baseStyles.push(`<link rel="stylesheet" type="text/css" href="${escapeAttribute(resourceProvider.asWebviewUri(resource))}">`);
		}

		return `${baseStyles.join('\n')}
			${this.#computeCustomStyleSheetIncludes(resourceProvider, resource, config)}
			${this.#getImageStabilizerStyles(imageInfo)}`;
	}

	#getScripts(resourceProvider: WebviewResourceProvider, nonce: string): string {
		const out: string[] = [];
		for (const resource of this.#contributionProvider.contributions.previewScripts) {
			out.push(`<script async
				src="${escapeAttribute(resourceProvider.asWebviewUri(resource))}"
				nonce="${nonce}"
				charset="UTF-8"></script>`);
		}
		return out.join('\n');
	}

	#getCsp(
		provider: WebviewResourceProvider,
		resource: vscode.Uri,
		nonce: string
	): string {
		const rule = provider.cspSource.split(';')[0];
		switch (this.#cspArbiter.getSecurityLevelForResource(resource)) {
			case MarkdownPreviewSecurityLevel.AllowInsecureContent:
				return `default-src 'none'; img-src 'self' ${rule} http: https: data:; media-src 'self' ${rule} http: https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' http: https: data:; font-src 'self' ${rule} http: https: data:;`;

			case MarkdownPreviewSecurityLevel.AllowInsecureLocalContent:
				return `default-src 'none'; img-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; media-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*;`;

			case MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent:
				return ``;

			case MarkdownPreviewSecurityLevel.Strict:
			default:
				return `default-src 'none'; img-src 'self' ${rule} https: data:; media-src 'self' ${rule} https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' https: data:; font-src 'self' ${rule} https: data:;`;
		}
	}
}

/**
 * Injects empty marker `<span>` elements into the markdown source text at inner change positions.
 */
function injectInnerChangeMarkers(text: string, innerChanges: readonly MarkdownPreviewInnerChange[]): string {
	const lines = text.split('\n');

	// Group inner changes by line
	const changesByLine = new Map<number, { index: number; change: MarkdownPreviewInnerChange }[]>();
	for (let i = 0; i < innerChanges.length; i++) {
		const change = innerChanges[i];
		let lineChanges = changesByLine.get(change.line);
		if (!lineChanges) {
			lineChanges = [];
			changesByLine.set(change.line, lineChanges);
		}
		lineChanges.push({ index: i, change });
	}

	for (const [lineNum, changes] of changesByLine) {
		if (lineNum < 0 || lineNum >= lines.length) {
			continue;
		}

		let line = lines[lineNum];

		// Sort by startColumn descending so that insertions don't shift earlier positions
		changes.sort((a, b) => b.change.startColumn - a.change.startColumn);

		for (const { index, change } of changes) {
			const start = Math.min(change.startColumn, line.length);
			const end = Math.min(change.endColumn, line.length);
			if (start >= end) {
				continue;
			}

			const endMarker = `<span data-diff-end="${index}"></span>`;
			const startMarker = `<span data-diff-start="${index}"></span>`;
			line = line.slice(0, start) + startMarker + line.slice(start, end) + endMarker + line.slice(end);
		}

		lines[lineNum] = line;
	}

	return lines.join('\n');
}
