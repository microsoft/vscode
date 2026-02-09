/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypeScriptServiceConfiguration } from '../configuration/configuration';
import { tsNativeExtensionId } from '../commands/useTsgo';
import { setImmediate } from '../utils/async';
import { Disposable } from '../utils/dispose';
import { ITypeScriptVersionProvider, TypeScriptVersion } from './versionProvider';


const useWorkspaceTsdkStorageKey = 'typescript.useWorkspaceTsdk';
const suppressPromptWorkspaceTsdkStorageKey = 'typescript.suppressPromptWorkspaceTsdk';

interface QuickPickItem extends vscode.QuickPickItem {
	run(): void;
}

export class TypeScriptVersionManager extends Disposable {

	private _currentVersion: TypeScriptVersion;

	public constructor(
		private configuration: TypeScriptServiceConfiguration,
		private readonly versionProvider: ITypeScriptVersionProvider,
		private readonly workspaceState: vscode.Memento
	) {
		super();

		this._currentVersion = this.versionProvider.defaultVersion;

		if (this.useWorkspaceTsdkSetting) {
			if (vscode.workspace.isTrusted) {
				const localVersion = this.versionProvider.localVersion;
				if (localVersion) {
					this._currentVersion = localVersion;
				}
			} else {
				this._disposables.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
					if (this.versionProvider.localVersion) {
						this.updateActiveVersion(this.versionProvider.localVersion);
					}
				}));
			}
		}

		if (this.isInPromptWorkspaceTsdkState(configuration)) {
			setImmediate(() => {
				this.promptUseWorkspaceTsdk();
			});
		}

	}

	private readonly _onDidPickNewVersion = this._register(new vscode.EventEmitter<void>());
	public readonly onDidPickNewVersion = this._onDidPickNewVersion.event;

	public updateConfiguration(nextConfiguration: TypeScriptServiceConfiguration) {
		const lastConfiguration = this.configuration;
		this.configuration = nextConfiguration;

		if (
			!this.isInPromptWorkspaceTsdkState(lastConfiguration)
			&& this.isInPromptWorkspaceTsdkState(nextConfiguration)
		) {
			this.promptUseWorkspaceTsdk();
		}
	}

	public get currentVersion(): TypeScriptVersion {
		return this._currentVersion;
	}

	public reset(): void {
		this._currentVersion = this.versionProvider.bundledVersion;
	}

	public async promptUserForVersion(): Promise<void> {
		const nativePreviewItem = this.getNativePreviewPickItem();
		const items: QuickPickItem[] = [
			this.getBundledPickItem(),
			...this.getLocalPickItems(),
		];

		if (nativePreviewItem) {
			items.push(nativePreviewItem);
		}

		items.push(
			{
				kind: vscode.QuickPickItemKind.Separator,
				label: '',
				run: () => { /* noop */ },
			},
			LearnMorePickItem,
		);

		const selected = await vscode.window.showQuickPick<QuickPickItem>(items, {
			placeHolder: vscode.l10n.t("Select the TypeScript version used for JavaScript and TypeScript language features"),
		});

		return selected?.run();
	}

	private getBundledPickItem(): QuickPickItem {
		const bundledVersion = this.versionProvider.defaultVersion;
		return {
			label: (!this.useWorkspaceTsdkSetting || !vscode.workspace.isTrusted
				? '• '
				: '') + vscode.l10n.t("Use VS Code's Version"),
			description: bundledVersion.displayName,
			detail: bundledVersion.pathLabel,
			run: async () => {
				await this.workspaceState.update(useWorkspaceTsdkStorageKey, false);
				this.updateActiveVersion(bundledVersion);
			},
		};
	}

	private getLocalPickItems(): QuickPickItem[] {
		return this.versionProvider.localVersions.map(version => {
			return {
				label: (this.useWorkspaceTsdkSetting && vscode.workspace.isTrusted && this.currentVersion.eq(version)
					? '• '
					: '') + vscode.l10n.t("Use Workspace Version"),
				description: version.displayName,
				detail: version.pathLabel,
				run: async () => {
					const trusted = await vscode.workspace.requestWorkspaceTrust();
					if (trusted) {
						await this.workspaceState.update(useWorkspaceTsdkStorageKey, true);
						const tsConfig = vscode.workspace.getConfiguration('typescript');
						await tsConfig.update('tsdk', version.pathLabel, false);
						this.updateActiveVersion(version);
					}
				},
			};
		});
	}

	private getNativePreviewPickItem(): QuickPickItem | undefined {
		const nativePreviewExtension = vscode.extensions.getExtension(tsNativeExtensionId);
		if (!nativePreviewExtension) {
			return undefined;
		}

		const tsConfig = vscode.workspace.getConfiguration('typescript');
		const isUsingTsgo = tsConfig.get<boolean>('experimental.useTsgo', false);

		return {
			label: (isUsingTsgo ? '• ' : '') + vscode.l10n.t("Use TypeScript Native Preview (Experimental)"),
			description: nativePreviewExtension.packageJSON.version,
			run: async () => {
				await vscode.commands.executeCommand('typescript.native-preview.enable');
			},
		};
	}

	private async promptUseWorkspaceTsdk(): Promise<void> {
		const workspaceVersion = this.versionProvider.localVersion;

		if (workspaceVersion === undefined) {
			throw new Error('Could not prompt to use workspace TypeScript version because no workspace version is specified');
		}

		const allowIt = vscode.l10n.t("Allow");
		const dismissPrompt = vscode.l10n.t("Dismiss");
		const suppressPrompt = vscode.l10n.t("Never in this Workspace");

		const result = await vscode.window.showInformationMessage(vscode.l10n.t("This workspace contains a TypeScript version. Would you like to use the workspace TypeScript version for TypeScript and JavaScript language features?"),
			allowIt,
			dismissPrompt,
			suppressPrompt
		);

		if (result === allowIt) {
			await this.workspaceState.update(useWorkspaceTsdkStorageKey, true);
			this.updateActiveVersion(workspaceVersion);
		} else if (result === suppressPrompt) {
			await this.workspaceState.update(suppressPromptWorkspaceTsdkStorageKey, true);
		}
	}

	private updateActiveVersion(pickedVersion: TypeScriptVersion) {
		const oldVersion = this.currentVersion;
		this._currentVersion = pickedVersion;
		if (!oldVersion.eq(pickedVersion)) {
			this._onDidPickNewVersion.fire();
		}
	}

	private get useWorkspaceTsdkSetting(): boolean {
		return this.workspaceState.get<boolean>(useWorkspaceTsdkStorageKey, false);
	}

	private get suppressPromptWorkspaceTsdkSetting(): boolean {
		return this.workspaceState.get<boolean>(suppressPromptWorkspaceTsdkStorageKey, false);
	}

	private isInPromptWorkspaceTsdkState(configuration: TypeScriptServiceConfiguration) {
		return (
			configuration.localTsdk !== null
			&& configuration.enablePromptUseWorkspaceTsdk === true
			&& this.suppressPromptWorkspaceTsdkSetting === false
			&& this.useWorkspaceTsdkSetting === false
		);
	}
}

const LearnMorePickItem: QuickPickItem = {
	label: vscode.l10n.t("Learn more about managing TypeScript versions"),
	description: '',
	run: () => {
		vscode.env.openExternal(vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=839919'));
	}
};
