/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { MarkdownEngine } from '../markdownEngine';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { Logger } from '../logger';
import { ContentSecurityPolicyArbiter, MarkdownPreviewSecurityLevel } from '../security';
import { MarkdownPreviewConfigurationManager, MarkdownPreviewConfiguration } from './previewConfig';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { toResoruceUri } from '../util/resources';

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
		'Potentially unsafe or insecure content has been disabled in the markdown preview. Change the Markdown preview security setting to allow insecure content or enable scripts'),

	cspAlertMessageLabel: localize(
		'preview.securityMessage.label',
		'Content Disabled Security Warning')
};

function escapeAttribute(value: string): string {
	return value.replace(/"/g, '&quot;');
}

export class MarkdownContentProvider {
	constructor(
		private readonly engine: MarkdownEngine,
		private readonly context: vscode.ExtensionContext,
		private readonly cspArbiter: ContentSecurityPolicyArbiter,
		private readonly contributionProvider: MarkdownContributionProvider,
		private readonly logger: Logger
	) { }

	public async provideTextDocumentContent(
		markdownDocument: vscode.TextDocument,
		webviewResourceRoot: string,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		initialLine: number | undefined = undefined,
		state?: any
	): Promise<string> {
		const sourceUri = markdownDocument.uri;
		const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
		const initialData = {
			source: sourceUri.toString(),
			line: initialLine,
			lineCount: markdownDocument.lineCount,
			scrollPreviewWithEditor: config.scrollPreviewWithEditor,
			scrollEditorWithPreview: config.scrollEditorWithPreview,
			doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
			disableSecurityWarnings: this.cspArbiter.shouldDisableSecurityWarnings(),
			webviewResourceRoot: webviewResourceRoot,
		};

		this.logger.log('provideTextDocumentContent', initialData);

		// Content Security Policy
		const nonce = new Date().getTime() + '' + new Date().getMilliseconds();
		const csp = this.getCspForResource(webviewResourceRoot, sourceUri, nonce);

		const body = await this.engine.render(markdownDocument);
		return `<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				${csp}
				<meta id="vscode-markdown-preview-data"
					data-settings="${escapeAttribute(JSON.stringify(initialData))}"
					data-strings="${escapeAttribute(JSON.stringify(previewStrings))}"
					data-state="${escapeAttribute(JSON.stringify(state || {}))}">
				<script src="${this.extensionResourcePath(webviewResourceRoot, 'pre.js')}" nonce="${nonce}"></script>
				${this.getStyles(webviewResourceRoot, sourceUri, nonce, config, state)}
				<base href="${toResoruceUri(webviewResourceRoot, markdownDocument.uri)}">
			</head>
			<body class="vscode-body ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
				${body}
				<div class="code-line" data-line="${markdownDocument.lineCount}"></div>
				${this.getScripts(webviewResourceRoot, nonce)}
			</body>
			</html>`;
	}

	public provideFileNotFoundContent(
		resource: vscode.Uri,
	): string {
		const resourcePath = path.basename(resource.fsPath);
		const body = localize('preview.notFound', '{0} cannot be found', resourcePath);
		return `<!DOCTYPE html>
			<html>
			<body class="vscode-body">
				${body}
			</body>
			</html>`;
	}

	private extensionResourcePath(webviewResourceRoot: string, mediaFile: string): string {
		return toResoruceUri(webviewResourceRoot, vscode.Uri.file(this.context.asAbsolutePath(path.join('media', mediaFile))))
			.toString();
	}

	private fixHref(webviewResourceRoot: string, resource: vscode.Uri, href: string): string {
		if (!href) {
			return href;
		}

		if (href.startsWith('http:') || href.startsWith('https:') || href.startsWith('file:')) {
			return href;
		}

		// Assume it must be a local file
		if (path.isAbsolute(href)) {
			return toResoruceUri(webviewResourceRoot, vscode.Uri.file(href)).toString();
		}

		// Use a workspace relative path if there is a workspace
		const root = vscode.workspace.getWorkspaceFolder(resource);
		if (root) {
			return toResoruceUri(webviewResourceRoot, vscode.Uri.file(path.join(root.uri.fsPath, href))).toString();
		}

		// Otherwise look relative to the markdown file
		return toResoruceUri(webviewResourceRoot, vscode.Uri.file(path.join(path.dirname(resource.fsPath), href))).toString();
	}

	private computeCustomStyleSheetIncludes(webviewResourceRoot: string, resource: vscode.Uri, config: MarkdownPreviewConfiguration): string {
		if (Array.isArray(config.styles)) {
			return config.styles.map(style => {
				return `<link rel="stylesheet" class="code-user-style" data-source="${escapeAttribute(style)}" href="${escapeAttribute(this.fixHref(webviewResourceRoot, resource, style))}" type="text/css" media="screen">`;
			}).join('\n');
		}
		return '';
	}

	private getSettingsOverrideStyles(nonce: string, config: MarkdownPreviewConfiguration): string {
		return `<style nonce="${nonce}">
			html, body {
				${config.fontFamily ? `font-family: ${config.fontFamily};` : ''}
				${isNaN(config.fontSize) ? '' : `font-size: ${config.fontSize}px;`}
				${isNaN(config.lineHeight) ? '' : `line-height: ${config.lineHeight};`}
			}
		</style>`;
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

	private getStyles(webviewResourceRoot: string, resource: vscode.Uri, nonce: string, config: MarkdownPreviewConfiguration, state?: any): string {
		const baseStyles = this.contributionProvider.contributions.previewStyles
			.map(resource => `<link rel="stylesheet" type="text/css" href="${escapeAttribute(toResoruceUri(webviewResourceRoot, resource).toString())}">`)
			.join('\n');

		return `${baseStyles}
			${this.getSettingsOverrideStyles(nonce, config)}
			${this.computeCustomStyleSheetIncludes(webviewResourceRoot, resource, config)}
			${this.getImageStabilizerStyles(state)}`;
	}

	private getScripts(resourceRoot: string, nonce: string): string {
		return this.contributionProvider.contributions.previewScripts
			.map(resource => `<script async src="${escapeAttribute(toResoruceUri(resourceRoot, resource).toString())}" nonce="${nonce}" charset="UTF-8"></script>`)
			.join('\n');
	}

	private getCspForResource(
		webviewResourceRoot: string,
		resource: vscode.Uri,
		nonce: string
	): string {
		switch (this.cspArbiter.getSecurityLevelForResource(resource)) {
			case MarkdownPreviewSecurityLevel.AllowInsecureContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${webviewResourceRoot} http: https: data:; media-src 'self' ${webviewResourceRoot} http: https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${webviewResourceRoot} 'unsafe-inline' http: https: data:; font-src 'self' ${webviewResourceRoot} http: https: data:;">`;

			case MarkdownPreviewSecurityLevel.AllowInsecureLocalContent:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${webviewResourceRoot} https: data: http://localhost:* http://127.0.0.1:*; media-src 'self' ${webviewResourceRoot} https: data: http://localhost:* http://127.0.0.1:*; script-src 'nonce-${nonce}'; style-src 'self' ${webviewResourceRoot} 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src 'self' ${webviewResourceRoot} https: data: http://localhost:* http://127.0.0.1:*;">`;

			case MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent:
				return '';

			case MarkdownPreviewSecurityLevel.Strict:
			default:
				return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' ${webviewResourceRoot} https: data:; media-src 'self' ${webviewResourceRoot} https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${webviewResourceRoot} 'unsafe-inline' https: data:; font-src 'self' ${webviewResourceRoot} https: data:;">`;
		}
	}
}
