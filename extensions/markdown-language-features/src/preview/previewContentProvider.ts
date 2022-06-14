/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as uri from 'vscode-uri';
import { Logger } from '../logger';
import { MarkdownEngine } from '../markdownEngine';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { WebviewResourceProvider } from '../util/resources';
import { MarkdownPreviewConfiguration, MarkdownPreviewConfigurationManager } from './previewConfig';
import { ContentSecurityPolicyArbiter, MarkdownPreviewSecurityLevel } from './security';

const localize = nls.loadMessageBundle();

/**
 * Strings used inside the markdown preview.
 *
 * Stored here and then injected in the preview so that they
 * can be localized using our normal localization process.
 */
const previewStrings = {
	cspAlertMessageText: localize(
		'preview.securityMessage.text',
		'Some content has been disabled in this document'),

	cspAlertMessageTitle: localize(
		'preview.securityMessage.title',
		'Potentially unsafe or insecure content has been disabled in the Markdown preview. Change the Markdown preview security setting to allow insecure content or enable scripts'),

	cspAlertMessageLabel: localize(
		'preview.securityMessage.label',
		'Content Disabled Security Warning')
};

function escapeAttribute(value: string | vscode.Uri): string {
	return value.toString().replace(/"/g, '&quot;');
}

export interface MarkdownContentProviderOutput {
	html: string;
	containingImages: { src: string }[];
}


export class MarkdownContentProvider {
	constructor(
		private readonly engine: MarkdownEngine,
		private readonly context: vscode.ExtensionContext,
		private readonly cspArbiter: ContentSecurityPolicyArbiter,
		private readonly contributionProvider: MarkdownContributionProvider,
		private readonly logger: Logger
	) {
		this.iconPath = {
			dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview-dark.svg'),
			light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'preview-light.svg'),
		};
	}

	public readonly iconPath: { light: vscode.Uri; dark: vscode.Uri };

	public async provideTextDocumentContent(
		markdownDocument: vscode.TextDocument,
		resourceProvider: WebviewResourceProvider,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		initialLine: number | undefined = undefined,
		state: any | undefined,
		token: vscode.CancellationToken
	): Promise<MarkdownContentProviderOutput> {
		const sourceUri = markdownDocument.uri;
		const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
		const initialData = {
			source: sourceUri.toString(),
			fragment: state?.fragment || markdownDocument.uri.fragment || undefined,
			line: initialLine,
			lineCount: markdownDocument.lineCount,
			scrollPreviewWithEditor: config.scrollPreviewWithEditor,
			scrollEditorWithPreview: config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
			disableSecurityWarnings: this.cspArbiter.shouldDisableSecurityWarnings(),
			webviewResourceRoot: resourceProvider.asWebviewUri(markdownDocument.uri).toString(),
		};

		this.logger.log('provideTextDocumentContent', initialData);

		// Content Security Policy
		const nonce = getNonce();
		const csp = this.getCsp(resourceProvider, sourceUri, nonce);

		const body = await this.markdownBody(markdownDocument, resourceProvider);
		if (token.isCancellationRequested) {
			return { html: '', containingImages: [] };
		}

		const html = `<!DOCTYPE html>
			<html style="${escapeAttribute(this.getSettingsOverrideStyles(config))}">
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				${csp}
				<meta id="vscode-markdown-preview-data"
					data-settings="${escapeAttribute(JSON.stringify(initialData))}"
					data-strings="${escapeAttribute(JSON.stringify(previewStrings))}"
					data-state="${escapeAttribute(JSON.stringify(state || {}))}">
				<script src="${this.extensionResourcePath(resourceProvider, 'pre.js')}" nonce="${nonce}"></script>
				${this.getStyles(resourceProvider, sourceUri, config, state)}
				<base href="${resourceProvider.asWebviewUri(markdownDocument.uri)}">
			</head>
			<body class="vscode-body ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
				${body.html}
				${this.getScripts(resourceProvider, nonce)}
			</body>
			</html>`;
		return {
			html,
			containingImages: body.containingImages,
		};
	}

	public async markdownBody(
		markdownDocument: vscode.TextDocument,
		resourceProvider: WebviewResourceProvider,
	): Promise<MarkdownContentProviderOutput> {
		const rendered = await this.engine.render(markdownDocument, resourceProvider);
		const html = `<div class="markdown-body" dir="auto">${rendered.html}<div class="code-line" data-line="${markdownDocument.lineCount}"></div></div>`;
		return {
			html,
			containingImages: rendered.containingImages
		};
	}

	public provideFileNotFoundContent(
		resource: vscode.Uri,
	): string {
		const resourcePath = uri.Utils.basename(resource);
		const body = localize('preview.notFound', '{0} cannot be found', resourcePath);
		return `<!DOCTYPE html>
			<html>
			<body class="vscode-body">
				${body}
			</body>
			</html>`;
	}

	private extensionResourcePath(resourceProvider: WebviewResourceProvider, mediaFile: string): string {
		const webviewResource = resourceProvider.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', mediaFile));
		return webviewResource.toString();
	}

	private fixHref(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, href: string): string {
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

	private computeCustomStyleSheetIncludes(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: MarkdownPreviewConfiguration): string {
		if (!Array.isArray(config.styles)) {
			return '';
		}
		const out: string[] = [];
		for (const style of config.styles) {
			out.push(`<link rel="stylesheet" class="code-user-style" data-source="${escapeAttribute(style)}" href="${escapeAttribute(this.fixHref(resourceProvider, resource, style))}" type="text/css" media="screen">`);
		}
		return out.join('\n');
	}

	private getSettingsOverrideStyles(config: MarkdownPreviewConfiguration): string {
		return [
			config.fontFamily ? `--markdown-font-family: ${config.fontFamily};` : '',
			isNaN(config.fontSize) ? '' : `--markdown-font-size: ${config.fontSize}px;`,
			isNaN(config.lineHeight) ? '' : `--markdown-line-height: ${config.lineHeight};`,
		].join(' ');
	}

	private getImageStabilizerStyles(state?: any) {
		let ret = '<style>\n';
		if (state && state.imageInfo) {
			state.imageInfo.forEach((imgInfo: any) => {
				ret += `#${imgInfo.id}.loading {
					height: ${imgInfo.height}px;
					width: ${imgInfo.width}px;
				}\n`;
			});
		}
		ret += '</style>\n';

		return ret;
	}

	private getStyles(resourceProvider: WebviewResourceProvider, resource: vscode.Uri, config: MarkdownPreviewConfiguration, state?: any): string {
		const baseStyles: string[] = [];
		for (const resource of this.contributionProvider.contributions.previewStyles) {
			baseStyles.push(`<link rel="stylesheet" type="text/css" href="${escapeAttribute(resourceProvider.asWebviewUri(resource))}">`);
		}

		return `${baseStyles.join('\n')}
			${this.computeCustomStyleSheetIncludes(resourceProvider, resource, config)}
			${this.getImageStabilizerStyles(state)}`;
	}

	private getScripts(resourceProvider: WebviewResourceProvider, nonce: string): string {
		const out: string[] = [];
		for (const resource of this.contributionProvider.contributions.previewScripts) {
			out.push(`<script async
				src="${escapeAttribute(resourceProvider.asWebviewUri(resource))}"
				nonce="${nonce}"
				charset="UTF-8"></script>`);
		}
		return out.join('\n');
	}

	private getCsp(
		provider: WebviewResourceProvider,
		resource: vscode.Uri,
		nonce: string
	): string {
		const rule = provider.cspSource;
		switch (this.cspArbiter.getSecurityLevelForResource(resource)) {
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

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 64; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
