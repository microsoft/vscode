/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

import { ContentSecurityPolicyArbiter, getMarkdownUri, MDDocumentContentProvider } from './previewContentProvider';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class ExtensionContentSecurityPolicyArbiter implements ContentSecurityPolicyArbiter {
	private readonly key = 'trusted_preview_workspace:';

	constructor(
		private globalState: vscode.Memento
	) { }

	public isEnhancedSecurityDisableForWorkspace(): boolean {
		return this.globalState.get<boolean>(this.key + vscode.workspace.rootPath, false);
	}

	public addTrustedWorkspace(rootPath: string): Thenable<void> {
		return this.globalState.update(this.key + rootPath, true);
	}

	public removeTrustedWorkspace(rootPath: string): Thenable<void> {
		return this.globalState.update(this.key + rootPath, false);
	}
}

enum PreviewSecuritySelection {
	None,
	DisableEnhancedSecurityForWorkspace,
	EnableEnhancedSecurityForWorkspace
}

interface PreviewSecurityPickItem extends vscode.QuickPickItem {
	id: PreviewSecuritySelection;
}

export class PreviewSecuritySelector {

	public constructor(
		private cspArbiter: ContentSecurityPolicyArbiter,
		private contentProvider: MDDocumentContentProvider
	) { }

	public showSecutitySelectorForWorkspace(resource: string | undefined): void {
		const workspacePath = vscode.workspace.rootPath || resource;
		if (!workspacePath) {
			return;
		}

		let sourceUri: vscode.Uri | null = null;
		if (resource) {
			sourceUri = vscode.Uri.parse(decodeURIComponent(resource));
		}

		if (!sourceUri && vscode.window.activeTextEditor) {
			const activeDocument = vscode.window.activeTextEditor.document;
			if (activeDocument.uri.scheme === 'markdown') {
				sourceUri = activeDocument.uri;
			} else {
				sourceUri = getMarkdownUri(activeDocument.uri);
			}
		}

		vscode.window.showQuickPick<PreviewSecurityPickItem>(
			[
				{
					id: PreviewSecuritySelection.EnableEnhancedSecurityForWorkspace,
					label: localize(
						'preview.showPreviewSecuritySelector.disallowScriptsForWorkspaceTitle',
						'Disable script execution in markdown previews for this workspace'),
					description: '',
					detail: this.cspArbiter.isEnhancedSecurityDisableForWorkspace()
						? ''
						: localize('preview.showPreviewSecuritySelector.currentSelection', 'Current setting')
				}, {
					id: PreviewSecuritySelection.DisableEnhancedSecurityForWorkspace,
					label: localize(
						'preview.showPreviewSecuritySelector.allowScriptsForWorkspaceTitle',
						'Enable script execution in markdown previews for this workspace'),
					description: '',
					detail: this.cspArbiter.isEnhancedSecurityDisableForWorkspace()
						? localize('preview.showPreviewSecuritySelector.currentSelection', 'Current setting')
						: ''
				},
			], {
				placeHolder: localize('preview.showPreviewSecuritySelector.title', 'Change security settings for the Markdown preview'),
			}).then(selection => {
				if (!workspacePath) {
					return false;
				}
				switch (selection && selection.id) {
					case PreviewSecuritySelection.DisableEnhancedSecurityForWorkspace:
						return this.cspArbiter.addTrustedWorkspace(workspacePath).then(() => true);

					case PreviewSecuritySelection.EnableEnhancedSecurityForWorkspace:
						return this.cspArbiter.removeTrustedWorkspace(workspacePath).then(() => true);
				}
				return false;
			}).then(shouldUpdate => {
				if (shouldUpdate && sourceUri) {
					this.contentProvider.update(sourceUri);
				}
			});
	}
}
