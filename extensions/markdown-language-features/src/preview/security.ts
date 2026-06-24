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
	readonly #old_trusted_workspace_key = 'trusted_preview_workspace:';
	readonly #security_level_key = 'preview_security_level:';
	readonly #should_disable_security_warning_key = 'preview_should_show_security_warning:';

	readonly #globalState: vscode.Memento;
	readonly #workspaceState: vscode.Memento;

	constructor(
		globalState: vscode.Memento,
		workspaceState: vscode.Memento
	) {
		this.#globalState = globalState;
		this.#workspaceState = workspaceState;
	}

	public getSecurityLevelForResource(resource: vscode.Uri): MarkdownPreviewSecurityLevel {
		// Use new security level setting first
		const level = this.#globalState.get<MarkdownPreviewSecurityLevel | undefined>(this.#security_level_key + this.#getRoot(resource), undefined);
		if (typeof level !== 'undefined') {
			return level;
		}

		// Fallback to old trusted workspace setting
		if (this.#globalState.get<boolean>(this.#old_trusted_workspace_key + this.#getRoot(resource), false)) {
			return MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent;
		}
		return MarkdownPreviewSecurityLevel.Strict;
	}

	public setSecurityLevelForResource(resource: vscode.Uri, level: MarkdownPreviewSecurityLevel): Thenable<void> {
		return this.#globalState.update(this.#security_level_key + this.#getRoot(resource), level);
	}

	public shouldAllowSvgsForResource(resource: vscode.Uri) {
		const securityLevel = this.getSecurityLevelForResource(resource);
		return securityLevel === MarkdownPreviewSecurityLevel.AllowInsecureContent || securityLevel === MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent;
	}

	public shouldDisableSecurityWarnings(): boolean {
		return this.#workspaceState.get<boolean>(this.#should_disable_security_warning_key, false);
	}

	public setShouldDisableSecurityWarning(disabled: boolean): Thenable<void> {
		return this.#workspaceState.update(this.#should_disable_security_warning_key, disabled);
	}

	#getRoot(resource: vscode.Uri): vscode.Uri {
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

	readonly #cspArbiter: ContentSecurityPolicyArbiter;
	readonly #webviewManager: MarkdownPreviewManager;

	public constructor(
		cspArbiter: ContentSecurityPolicyArbiter,
		webviewManager: MarkdownPreviewManager
	) {
		this.#cspArbiter = cspArbiter;
		this.#webviewManager = webviewManager;
	}

	public async showSecuritySelectorForResource(resource: vscode.Uri): Promise<void> {
		interface PreviewSecurityPickItem extends vscode.QuickPickItem {
			readonly type: 'moreinfo' | 'toggle' | MarkdownPreviewSecurityLevel;
		}

		function markActiveWhen(when: boolean): string {
			return when ? '• ' : '';
		}

		const currentSecurityLevel = this.#cspArbiter.getSecurityLevelForResource(resource);
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
					label: this.#cspArbiter.shouldDisableSecurityWarnings()
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
			this.#cspArbiter.setShouldDisableSecurityWarning(!this.#cspArbiter.shouldDisableSecurityWarnings());
			this.#webviewManager.refresh();
			return;
		} else {
			await this.#cspArbiter.setSecurityLevelForResource(resource, selection.type);
		}
		this.#webviewManager.refresh();
	}
}
