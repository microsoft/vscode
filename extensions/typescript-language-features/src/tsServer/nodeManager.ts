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

	public get currentVersion(): string | undefined {
		return this._currentVersion;
	}

	public reset(): void {
		this._currentVersion = undefined;
	}

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

	private async promptUseWorkspaceNode(): Promise<string | undefined> {
		const workspaceVersion = this.configuration.localNodePath;

		if (workspaceVersion === null) {
			throw new Error('Could not prompt to use workspace Node installation because no workspace Node installation is specified');
		}

		const allow = vscode.l10n.t("Allow");
		const dismiss = vscode.l10n.t("Dismiss");
		const neverAllow = vscode.l10n.t("Never in this workspace");

		const result = await vscode.window.showInformationMessage(vscode.l10n.t("This workspace specifies a custom Node installation to run TS Server. Would you like to use this workspace's custom Node installation to run TS Server?"),
			allow,
			dismiss,
			neverAllow
		);

		let version = undefined;
		if (result === allow) {
			await this.workspaceState.update(useWorkspaceNodeStorageKey, true);
			version = workspaceVersion;
		} else if (result === neverAllow) {
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
