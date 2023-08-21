/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypeScriptServiceConfiguration } from '../configuration/configuration';
import { setImmediate } from '../utils/async';
import { Disposable } from '../utils/dispose';


const useWorkspaceNodeStorageKey = 'typescript.useWorkspaceNode';

export class NodeVersionManager extends Disposable {
	private _currentVersion: string | undefined;

	public constructor(
		private configuration: TypeScriptServiceConfiguration,
		private readonly workspaceState: vscode.Memento
	) {
		super();

		this._currentVersion = this.configuration.globalNodePath || undefined;
		if (vscode.workspace.isTrusted) {
			if (this.configuration.localNodePath) {
				if (this.useWorkspaceNodeSetting === undefined) {
					setImmediate(() => {
						this.promptAndSetWorkspaceNode();
					});
				}
				else if (this.useWorkspaceNodeSetting) {
					this._currentVersion = this.configuration.localNodePath;
				}
			}
		}
		else {
			this._disposables.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
				if (this.configuration.localNodePath) {
					if (this.useWorkspaceNodeSetting === undefined) {
						setImmediate(() => {
							this.promptAndSetWorkspaceNode();
						});
					}
					else if (this.useWorkspaceNodeSetting) {
						this.updateActiveVersion(this.configuration.localNodePath);
					}
				}
			}));
		}
	}

	private readonly _onDidPickNewVersion = this._register(new vscode.EventEmitter<void>());
	public readonly onDidPickNewVersion = this._onDidPickNewVersion.event;

	public async updateConfiguration(nextConfiguration: TypeScriptServiceConfiguration) {
		const oldConfiguration = this.configuration;
		this.configuration = nextConfiguration;
		if (oldConfiguration.globalNodePath !== nextConfiguration.globalNodePath
			|| oldConfiguration.localNodePath !== nextConfiguration.localNodePath) {
			await this.computeNewVersion();
		}
	}

	private async computeNewVersion() {
		let version = this.configuration.globalNodePath || undefined;
		if (vscode.workspace.isTrusted && this.configuration.localNodePath) {
			if (this.useWorkspaceNodeSetting === undefined) {
				version = await this.promptUseWorkspaceNode();
			}
			else if (this.useWorkspaceNodeSetting) {
				version = this.configuration.localNodePath;
			}
		}
		this.updateActiveVersion(version);
	}

	public get currentVersion(): string | undefined {
		return this._currentVersion;
	}

	private async promptUseWorkspaceNode(): Promise<string | undefined> {
		const workspaceVersion = this.configuration.localNodePath;

		if (workspaceVersion === null) {
			throw new Error('Could not prompt to use workspace Node version because no workspace Node install is specified');
		}

		const allowIt = vscode.l10n.t("Allow");
		const dismissPrompt = vscode.l10n.t("Dismiss");
		const alwaysAllow = vscode.l10n.t("Always allow");
		const neverAllow = vscode.l10n.t("Never allow");

		const result = await vscode.window.showInformationMessage(vscode.l10n.t("This workspace contains a Node install to run TS Server. Would you like to use the workspace Node install to run TS Server?"),
			allowIt,
			dismissPrompt,
			alwaysAllow,
			neverAllow
		);

		let version = undefined;
		switch (result) {
			case alwaysAllow:
				await this.workspaceState.update(useWorkspaceNodeStorageKey, true);
			case allowIt:
				version = workspaceVersion;
				break;
			case neverAllow:
				await this.workspaceState.update(useWorkspaceNodeStorageKey, false);
		}
		return version;
	}

	private async promptAndSetWorkspaceNode(): Promise<void> {
		const version = await this.promptUseWorkspaceNode();
		if (version !== undefined) {
			this.updateActiveVersion(version);
		}
	}

	private updateActiveVersion(pickedVersion: string | undefined): void {
		const oldVersion = this.currentVersion;
		this._currentVersion = pickedVersion;
		if (oldVersion !== pickedVersion) {
			this._onDidPickNewVersion.fire();
		}
	}

	private get useWorkspaceNodeSetting(): boolean | undefined {
		return this.workspaceState.get<boolean>(useWorkspaceNodeStorageKey);
	}
}
