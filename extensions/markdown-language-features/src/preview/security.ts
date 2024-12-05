/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MarkdownPreviewManager } from './previewManager';


export const enum MarkdownPreviewSecurityLevel {
	Strict = 0,
	AllowInsecureContent = 1,
	AllowScriptsAndAllContent = 2,
	AllowInsecureLocalContent = 3
}

export interface ContentSecurityPolicyArbiter {
	getSecurityLevelForResource(resource: vscode.Uri): MarkdownPreviewSecurityLevel;

	setSecurityLevelForResource(resource: vscode.Uri, level: MarkdownPreviewSecurityLevel): Thenable<void>;

	shouldAllowSvgsForResource(resource: vscode.Uri): void;

	shouldDisableSecurityWarnings(): boolean;

	setShouldDisableSecurityWarning(shouldShow: boolean): Thenable<void>;
}

export class ExtensionContentSecurityPolicyArbiter implements ContentSecurityPolicyArbiter {
	private readonly _old_trusted_workspace_key = 'trusted_preview_workspace:';
	private readonly _security_level_key = 'preview_security_level:';
	private readonly _should_disable_security_warning_key = 'preview_should_show_security_warning:';

	constructor(
		private readonly _globalState: vscode.Memento,
		private readonly _workspaceState: vscode.Memento
	) { }

	public getSecurityLevelForResource(resource: vscode.Uri): MarkdownPreviewSecurityLevel {
		// Use new security level setting first
		const level = this._globalState.get<MarkdownPreviewSecurityLevel | undefined>(this._security_level_key + this._getRoot(resource), undefined);
		if (typeof level !== 'undefined') {
			return level;
		}

		// Fallback to old trusted workspace setting
		if (this._globalState.get<boolean>(this._old_trusted_workspace_key + this._getRoot(resource), false)) {
			return MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent;
		}
		return MarkdownPreviewSecurityLevel.Strict;
	}

	public setSecurityLevelForResource(resource: vscode.Uri, level: MarkdownPreviewSecurityLevel): Thenable<void> {
		return this._globalState.update(this._security_level_key + this._getRoot(resource), level);
	}

	public shouldAllowSvgsForResource(resource: vscode.Uri) {
		const securityLevel = this.getSecurityLevelForResource(resource);
		return securityLevel === MarkdownPreviewSecurityLevel.AllowInsecureContent || securityLevel === MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent;
	}

	public shouldDisableSecurityWarnings(): boolean {
		return this._workspaceState.get<boolean>(this._should_disable_security_warning_key, false);
	}

	public setShouldDisableSecurityWarning(disabled: boolean): Thenable<void> {
		return this._workspaceState.update(this._should_disable_security_warning_key, disabled);
	}

	private _getRoot(resource: vscode.Uri): vscode.Uri {
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

export class PreviewSecuritySelector {

	public constructor(
		private readonly _cspArbiter: ContentSecurityPolicyArbiter,
		private readonly _webviewManager: MarkdownPreviewManager
	) { }

	public async showSecuritySelectorForResource(resource: vscode.Uri): Promise<void> {
		interface PreviewSecurityPickItem extends vscode.QuickPickItem {
			readonly type: 'moreinfo' | 'toggle' | MarkdownPreviewSecurityLevel;
		}

		function markActiveWhen(when: boolean): string {
			return when ? '• ' : '';
		}

		const currentSecurityLevel = this._cspArbiter.getSecurityLevelForResource(resource);
		const selection = await vscode.window.showQuickPick<PreviewSecurityPickItem>(
			[
				{
					type: MarkdownPreviewSecurityLevel.Strict,
					label: markActiveWhen(currentSecurityLevel === MarkdownPreviewSecurityLevel.Strict) + vscode.l10n.t("Strict"),
					description: vscode.l10n.t("Only load secure content"),
				}, {
					type: MarkdownPreviewSecurityLevel.AllowInsecureLocalContent,
					label: markActiveWhen(currentSecurityLevel === MarkdownPreviewSecurityLevel.AllowInsecureLocalContent) + vscode.l10n.t("Allow insecure local content"),
					description: vscode.l10n.t("Enable loading content over http served from localhost"),
				}, {
					type: MarkdownPreviewSecurityLevel.AllowInsecureContent,
					label: markActiveWhen(currentSecurityLevel === MarkdownPreviewSecurityLevel.AllowInsecureContent) + vscode.l10n.t("Allow insecure content"),
					description: vscode.l10n.t("Enable loading content over http"),
				}, {
					type: MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent,
					label: markActiveWhen(currentSecurityLevel === MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent) + vscode.l10n.t("Disable"),
					description: vscode.l10n.t("Allow all content and script execution. Not recommended"),
				}, {
					type: 'moreinfo',
					label: vscode.l10n.t("More Information"),
					description: ''
				}, {
					type: 'toggle',
					label: this._cspArbiter.shouldDisableSecurityWarnings()
						? vscode.l10n.t("Enable preview security warnings in this workspace")
						: vscode.l10n.t("Disable preview security warning in this workspace"),
					description: vscode.l10n.t("Does not affect the content security level")
				},
			], {
			placeHolder: vscode.l10n.t("Select security settings for Markdown previews in this workspace"),
		});
		if (!selection) {
			return;
		}

		if (selection.type === 'moreinfo') {
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=854414'));
			return;
		}

		if (selection.type === 'toggle') {
			this._cspArbiter.setShouldDisableSecurityWarning(!this._cspArbiter.shouldDisableSecurityWarnings());
			this._webviewManager.refresh();
			return;
		} else {
			await this._cspArbiter.setSecurityLevelForResource(resource, selection.type);
		}
		this._webviewManager.refresh();
	}
}
