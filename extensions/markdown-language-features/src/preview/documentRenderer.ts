/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as uri from 'vscode-uri';
import { ILogger } from '../logging';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { escapeAttribute, getNonce } from '../util/dom';
import { WebviewResourceProvider } from '../util/resources';
import { MarkdownPreviewConfiguration, MarkdownPreviewConfigurationManager } from './previewConfig';
import { ContentSecurityPolicyArbiter, MarkdownPreviewSecurityLevel } from './security';


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
	constructor(
		private readonly _engine: MarkdownItEngine,
		private readonly _context: vscode.ExtensionContext,
		private readonly _cspArbiter: ContentSecurityPolicyArbiter,
		private readonly _contributionProvider: MarkdownContributionProvider,
		private readonly _logger: ILogger
	) {
		this.iconPath = {
			dark: vscode.Uri.joinPath(this._context.extensionUri, 'media', 'preview-dark.svg'),
			light: vscode.Uri.joinPath(this._context.extensionUri, 'media', 'preview-light.svg'),
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
		token: vscode.CancellationToken
	): Promise<MarkdownContentProviderOutput> {
		const sourceUri = markdownDocument.uri;
		const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
		const initialData = {
			source: sourceUri.toString(),
			fragment: state?.fragment || markdownDocument.uri.fragment || undefined,
			line: initialLine,
			selectedLine,
			scrollPreviewWithEditor: config.scrollPreviewWithEditor,
			scrollEditorWithPreview: config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
			disableSecurityWarnings: this._cspArbiter.shouldDisableSecurityWarnings(),
			webviewResourceRoot: resourceProvider.asWebviewUri(markdownDocument.uri).toString(),
		};

		this._logger.verbose('DocumentRenderer', `provideTextDocumentContent - ${markdownDocument.uri}`, initialData);

		// Content Security Policy
		const nonce = getNonce();
		const csp = this._getCsp(resourceProvider, sourceUri, nonce);

		const body = await this.renderBody(markdownDocument, resourceProvider);
		if (token.isCancellationRequested) {
			return { html: '', containingImages: new Set() };
		}

		const html = `<!DOCTYPE html>
			<html style="${escapeAttribute(this._getSettingsOverrideStyles(config))}">
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				${csp}
				<meta id="vscode-markdown-preview-data"
					data-settings="${escapeAttribute(JSON.stringify(initialData))}"
					data-strings="${escapeAttribute(JSON.stringify(previewStrings))}"
					data-state="${escapeAttribute(JSON.stringify(state || {}))}">
				<script src="${this._extensionResourcePath(resourceProvider, 'pre.js')}" nonce="${nonce}"></script>
				${this._getStyles(resourceProvider, sourceUri, config, imageInfo)}
				<base href="${resourceProvider.asWebviewUri(markdownDocument.uri)}">
			</head>
			<body class="vscode-body style="overscroll-behavior-x: none;" ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
				${body.html}
				${this._getScripts(resourceProvider, nonce)}
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
	): Promise<MarkdownContentProviderOutput> {
		const rendered = await this._engine.render(markdownDocument, resourceProvider);
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

	private _extensionResourcePath(resourceProvider: WebviewResourceProvider, mediaFile: string): string {
		const webviewResource = resourceProvider.asWebviewUri(
			vscode.Uri.joinPath(this._context.extensionUri, 'media', mediaFile));
		return webviewResource.toString();
	}

	private _fixHref(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, href: string): string {
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

	private _computeCustomStyleSheetIncludes(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: MarkdownPreviewConfiguration): string {
		if (!Array.isArray(config.styles)) {
			return '';
		}
		const out: string[] = [];
		for (const style of config.styles) {
			out.push(`<link rel="stylesheet" class="code-user-style" data-source="${escapeAttribute(style)}" href="${escapeAttribute(this._fixHref(resourceProvider, resource, style))}" type="text/css" media="screen">`);
		}
		return out.join('\n');
	}

	private _getSettingsOverrideStyles(config: MarkdownPreviewConfiguration): string {
		return [
			config.fontFamily ? `--markdown-font-family: ${config.fontFamily};` : '',
			isNaN(config.fontSize) ? '' : `--markdown-font-size: ${config.fontSize}px;`,
			isNaN(config.lineHeight) ? '' : `--markdown-line-height: ${config.lineHeight};`,
		].join(' ');
	}

	private _getImageStabilizerStyles(imageInfo: readonly ImageInfo[]): string {
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

	private _getStyles(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: MarkdownPreviewConfiguration, imageInfo: readonly ImageInfo[]): string {
		const baseStyles: string[] = [];
		for (const resource of this._contributionProvider.contributions.previewStyles) {
			baseStyles.push(`<link rel="stylesheet" type="text/css" href="${escapeAttribute(resourceProvider.asWebviewUri(resource))}">`);
		}

		return `${baseStyles.join('\n')}
			${this._computeCustomStyleSheetIncludes(resourceProvider, resource, config)}
			${this._getImageStabilizerStyles(imageInfo)}`;
	}

	private _getScripts(resourceProvider: WebviewResourceProvider, nonce: string): string {
		const out: string[] = [];
		for (const resource of this._contributionProvider.contributions.previewScripts) {
			out.push(`<script async
				src="${escapeAttribute(resourceProvider.asWebviewUri(resource))}"
				nonce="${nonce}"
				charset="UTF-8"></script>`);
		}
		return out.join('\n');
	}

	private _getCsp(
		provider: WebviewResourceProvider,
		resource: vscode.Uri,
		nonce: string
	): string {
		const rule = provider.cspSource;
		switch (this._cspArbiter.getSecurityLevelForResource(resource)) {
			case MarkdownPreviewSecurityLevel.AllowInsecureContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${rule} http: https: data:; media-src 'self' ${rule} http: https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' http: https: data:; font-src 'self' ${rule} http: https: data:;">`;

			case MarkdownPreviewSecurityLevel.AllowInsecureLocalContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; media-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*;">`;

			case MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent:
				return '<meta http-equiv="Content-Security-Policy" content="">';

			case MarkdownPreviewSecurityLevel.Strict:
			default:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${rule} https: data:; media-src 'self' ${rule} https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' https: data:; font-src 'self' ${rule} https: data:;">`;
		}
	}
}
