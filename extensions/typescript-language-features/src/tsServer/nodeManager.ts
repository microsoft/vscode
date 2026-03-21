/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypeScriptServiceConfiguration } from '../configuration/configuration';
import { setImmediate } from '../utils/async';
import { Disposable } from '../utils/dispose';


const useWorkspaceNodeStorageKey = 'typescript.useWorkspaceNode';
const lastKnownWorkspaceNodeStorageKey = 'typescript.lastKnownWorkspaceNode';
type UseWorkspaceNodeState = undefined | boolean;
type LastKnownWorkspaceNodeState = undefined | string;

export class NodeVersionManager extends Disposable {
	private _currentVersion: string | undefined;

	public constructor(
		private configuration: TypeScriptServiceConfiguration,
		private readonly workspaceState: vscode.Memento
	) {
		super();

		this._currentVersion = this.configuration.globalNodePath?.path || undefined;
		if (vscode.workspace.isTrusted) {
			const workspaceNodeConfiguration = this.configuration.localNodePath;
			if (workspaceNodeConfiguration) {
				if (workspaceNodeConfiguration.isTrusted) {
					this._currentVersion = workspaceNodeConfiguration.path;
				} else {
					const useWorkspaceNode = this.canUseWorkspaceNode(workspaceNodeConfiguration.path);
					if (useWorkspaceNode === undefined) {
						setImmediate(() => {
							this.promptAndSetWorkspaceNode();
						});
					}
					else if (useWorkspaceNode) {
						this._currentVersion = workspaceNodeConfiguration.path;
					}
				}
			}
		}
		else {
			this._disposables.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
				const workspaceNodeConfiguration = this.configuration.localNodePath;
				if (workspaceNodeConfiguration) {
					if (workspaceNodeConfiguration.isTrusted) {
						this.updateActiveVersion(workspaceNodeConfiguration.path);
					} else {
						const useWorkspaceNode = this.canUseWorkspaceNode(workspaceNodeConfiguration.path);
						if (useWorkspaceNode === undefined) {
							setImmediate(() => {
								this.promptAndSetWorkspaceNode();
							});
						}
						else if (useWorkspaceNode) {
							this.updateActiveVersion(workspaceNodeConfiguration.path);
						}
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

	public async updateConfiguration(nextConfiguration: TypeScriptServiceConfiguration) {
		const oldConfiguration = this.configuration;
		this.configuration = nextConfiguration;
		if (oldConfiguration.globalNodePath?.path !== nextConfiguration.globalNodePath?.path
			|| oldConfiguration.localNodePath?.path !== nextConfiguration.localNodePath?.path) {
			await this.computeNewVersion();
		}
	}

	private async computeNewVersion() {
		let version = this.configuration.globalNodePath?.path || undefined;
		const workspaceNodeConfiguration = this.configuration.localNodePath;
		if (vscode.workspace.isTrusted && workspaceNodeConfiguration) {
			if (workspaceNodeConfiguration.isTrusted) {
				version = workspaceNodeConfiguration.path;
			} else {
				const useWorkspaceNode = this.canUseWorkspaceNode(workspaceNodeConfiguration.path);
				if (useWorkspaceNode === undefined) {
					const result = await this.promptUseWorkspaceNode();
					version = result || version;
				}
				else if (useWorkspaceNode) {
					version = workspaceNodeConfiguration.path;
				}
			}
		}
		this.updateActiveVersion(version);
	}

	private async promptUseWorkspaceNode(): Promise<string | undefined> {
		const workspaceNodeConfiguration = this.configuration.localNodePath;
		const workspaceVersion = workspaceNodeConfiguration?.path;
		if (workspaceVersion === undefined) {
			throw new Error('Could not prompt to use workspace Node installation because no workspace Node installation is specified');
		}

		const allow = vscode.l10n.t("Yes");
		const disallow = vscode.l10n.t("No");
		const dismiss = vscode.l10n.t("Not now");

		const result = await vscode.window.showInformationMessage(vscode.l10n.t("This workspace wants to use the Node installation at '{0}' to run TS Server. Would you like to use it?", workspaceVersion),
			allow,
			disallow,
			dismiss,
		);

		let version = undefined;
		switch (result) {
			case allow:
				await this.setUseWorkspaceNodeState(true, workspaceVersion);
				version = workspaceVersion;
				break;
			case disallow:
				await this.setUseWorkspaceNodeState(false, workspaceVersion);
				break;
			case dismiss:
				await this.setUseWorkspaceNodeState(undefined, workspaceVersion);
				break;
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

	private canUseWorkspaceNode(nodeVersion: string): boolean | undefined {
		const lastKnownWorkspaceNode = this.workspaceState.get<LastKnownWorkspaceNodeState>(lastKnownWorkspaceNodeStorageKey);
		if (lastKnownWorkspaceNode === nodeVersion) {
			return this.workspaceState.get<UseWorkspaceNodeState>(useWorkspaceNodeStorageKey);
		}
		return undefined;
	}

	private async setUseWorkspaceNodeState(allow: boolean | undefined, nodeVersion: string) {
		await this.workspaceState.update(lastKnownWorkspaceNodeStorageKey, nodeVersion);
		await this.workspaceState.update(useWorkspaceNodeStorageKey, allow);
	}
}
