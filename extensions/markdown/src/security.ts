/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

import { getMarkdownUri, MDDocumentContentProvider } from './previewContentProvider';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export enum MarkdownPreviewSecurityLevel {
	Strict = 0,
	AllowInsecureContent = 1,
	AllowScriptsAndAllContent = 2
}

export interface ContentSecurityPolicyArbiter {
	getSecurityLevelForResource(resource: vscode.Uri): MarkdownPreviewSecurityLevel;

	setSecurityLevelForResource(resource: vscode.Uri, level: MarkdownPreviewSecurityLevel): Thenable<void>;

	shouldAllowSvgsForResource(resource: vscode.Uri): void;
}

export class ExtensionContentSecurityPolicyArbiter implements ContentSecurityPolicyArbiter {
	private readonly old_trusted_workspace_key = 'trusted_preview_workspace:';
	private readonly security_level_key = 'preview_security_level:';

	constructor(
		private globalState: vscode.Memento
	) { }

	public getSecurityLevelForResource(resource: vscode.Uri): MarkdownPreviewSecurityLevel {
		// Use new security level setting first
		const level = this.globalState.get<MarkdownPreviewSecurityLevel | undefined>(this.security_level_key + this.getRoot(resource), undefined);
		if (typeof level !== 'undefined') {
			return level;
		}

		// Fallback to old trusted workspace setting
		if (this.globalState.get<boolean>(this.old_trusted_workspace_key + this.getRoot(resource), false)) {
			return MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent;
		}
		return MarkdownPreviewSecurityLevel.Strict;
	}

	public setSecurityLevelForResource(resource: vscode.Uri, level: MarkdownPreviewSecurityLevel): Thenable<void> {
		return this.globalState.update(this.security_level_key + this.getRoot(resource), level);
	}

	public shouldAllowSvgsForResource(resource: vscode.Uri) {
		const securityLevel = this.getSecurityLevelForResource(resource);
		return securityLevel === MarkdownPreviewSecurityLevel.AllowInsecureContent || securityLevel === MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent;
	}

	private getRoot(resource: vscode.Uri): vscode.Uri {
		if (vscode.workspace.workspaceFolders) {
			const folderForResource = vscode.workspace.getWorkspaceFolder(resource);
			if (folderForResource) {
				return folderForResource.uri;
			}

			if (vscode.workspace.workspaceFolders.length) {
				return vscode.workspace.workspaceFolders[0].uri;
			}
		}

		return resource;
	}
}


interface PreviewSecurityPickItem extends vscode.QuickPickItem {
	level: MarkdownPreviewSecurityLevel;
}

export class PreviewSecuritySelector {

	public constructor(
		private cspArbiter: ContentSecurityPolicyArbiter,
		private contentProvider: MDDocumentContentProvider
	) { }

	public async showSecutitySelectorForResource(resource: vscode.Uri): Promise<void> {
		function markActiveWhen(when: boolean): string {
			return when ? '• ' : '';
		}

		const currentSecurityLevel = this.cspArbiter.getSecurityLevelForResource(resource);
		const selection = await vscode.window.showQuickPick<PreviewSecurityPickItem>(
			[
				{
					level: MarkdownPreviewSecurityLevel.Strict,
					label: markActiveWhen(currentSecurityLevel === MarkdownPreviewSecurityLevel.Strict) + localize('strict.title', 'Strict'),
					description: localize('strict.description', 'Only load secure content'),
				}, {
					level: MarkdownPreviewSecurityLevel.AllowInsecureContent,
					label: markActiveWhen(currentSecurityLevel === MarkdownPreviewSecurityLevel.AllowInsecureContent) + localize('insecureContent.title', 'Allow insecure content'),
					description: localize('insecureContent.description', 'Enable loading content over http'),
				}, {
					level: MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent,
					label: markActiveWhen(currentSecurityLevel === MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent) + localize('disable.title', 'Disable'),
					description: localize('disable.description', 'Allow all content and script execution. Not recommended'),
				},
			], {
				placeHolder: localize(
					'preview.showPreviewSecuritySelector.title',
					'Select security settings for Markdown previews in this workspace'),
			});

		if (!selection) {
			return;
		}

		await this.cspArbiter.setSecurityLevelForResource(resource, selection.level);

		const sourceUri = getMarkdownUri(resource);

		await vscode.commands.executeCommand('_workbench.htmlPreview.updateOptions',
			sourceUri,
			{
				allowScripts: true,
				allowSvgs: this.cspArbiter.shouldAllowSvgsForResource(resource)
			});

		this.contentProvider.update(sourceUri);
	}
}
