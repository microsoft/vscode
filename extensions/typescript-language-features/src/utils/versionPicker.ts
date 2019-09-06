/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { TypeScriptVersion, TypeScriptVersionProvider } from './versionProvider';

const localize = nls.loadMessageBundle();

const useWorkspaceTsdkStorageKey = 'typescript.useWorkspaceTsdk';

interface MyQuickPickItem extends vscode.QuickPickItem {
	id: MessageAction;
	version?: TypeScriptVersion;
}

enum MessageAction {
	useLocal,
	useBundled,
	learnMore,
}

export class TypeScriptVersionPicker {
	private _currentVersion: TypeScriptVersion;

	public constructor(
		private readonly versionProvider: TypeScriptVersionProvider,
		private readonly workspaceState: vscode.Memento
	) {
		this._currentVersion = this.versionProvider.defaultVersion;

		if (this.useWorkspaceTsdkSetting) {
			const localVersion = this.versionProvider.localVersion;
			if (localVersion) {
				this._currentVersion = localVersion;
			}
		}
	}

	public get useWorkspaceTsdkSetting(): boolean {
		return this.workspaceState.get<boolean>(useWorkspaceTsdkStorageKey, false);
	}

	public get currentVersion(): TypeScriptVersion {
		return this._currentVersion;
	}

	public useBundledVersion(): void {
		this._currentVersion = this.versionProvider.bundledVersion;
	}

	public async show(firstRun?: boolean): Promise<{ oldVersion?: TypeScriptVersion, newVersion?: TypeScriptVersion }> {
		const pickOptions: MyQuickPickItem[] = [];

		const shippedVersion = this.versionProvider.defaultVersion;
		pickOptions.push({
			label: (!this.useWorkspaceTsdkSetting
				? '• '
				: '') + localize('useVSCodeVersionOption', 'Use VS Code\'s Version'),
			description: shippedVersion.versionString,
			detail: shippedVersion.pathLabel,
			id: MessageAction.useBundled,
		});

		for (const version of this.versionProvider.localVersions) {
			pickOptions.push({
				label: (this.useWorkspaceTsdkSetting && this.currentVersion.path === version.path
					? '• '
					: '') + localize('useWorkspaceVersionOption', 'Use Workspace Version'),
				description: version.versionString,
				detail: version.pathLabel,
				id: MessageAction.useLocal,
				version
			});
		}

		pickOptions.push({
			label: localize('learnMore', 'Learn More'),
			description: '',
			id: MessageAction.learnMore
		});

		const selected = await vscode.window.showQuickPick<MyQuickPickItem>(pickOptions, {
			placeHolder: localize(
				'selectTsVersion',
				'Select the TypeScript version used for JavaScript and TypeScript language features'),
			ignoreFocusOut: firstRun,
		});

		if (!selected) {
			return { oldVersion: this.currentVersion };
		}

		switch (selected.id) {
			case MessageAction.useLocal:
				await this.workspaceState.update(useWorkspaceTsdkStorageKey, true);
				if (selected.version) {
					const tsConfig = vscode.workspace.getConfiguration('typescript');
					await tsConfig.update('tsdk', selected.version.pathLabel, false);

					const previousVersion = this.currentVersion;
					this._currentVersion = selected.version;
					return { oldVersion: previousVersion, newVersion: selected.version };
				}
				return { oldVersion: this.currentVersion };

			case MessageAction.useBundled:
				await this.workspaceState.update(useWorkspaceTsdkStorageKey, false);
				const previousVersion = this.currentVersion;
				this._currentVersion = shippedVersion;
				return { oldVersion: previousVersion, newVersion: shippedVersion };

			case MessageAction.learnMore:
				vscode.env.openExternal(vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=839919'));
				return { oldVersion: this.currentVersion };

			default:
				return { oldVersion: this.currentVersion };
		}
	}
}