/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { TypeScriptVersionProvider, TypeScriptVersion } from "./versionProvider";
import { Memento, commands, Uri, window, QuickPickItem, workspace } from "vscode";

const localize = nls.loadMessageBundle();

const useWorkspaceTsdkStorageKey = 'typescript.useWorkspaceTsdk';

interface MyQuickPickItem extends QuickPickItem {
	id: MessageAction;
	version?: TypeScriptVersion;
}

enum MessageAction {
	useLocal,
	useBundled,
	learnMore
}

export class TypeScriptVersionPicker {
	private _currentVersion: TypeScriptVersion;

	public constructor(
		private readonly versionProvider: TypeScriptVersionProvider,
		private readonly workspaceState: Memento
	) {
		this._currentVersion = this.versionProvider.defaultVersion;

		if (workspaceState.get<boolean>(useWorkspaceTsdkStorageKey, false)) {
			const localVersion = this.versionProvider.localTsdkVersion;
			if (localVersion) {
				this._currentVersion = localVersion;
			}
		}
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
			label: (this.currentVersion.path === shippedVersion.path
				? '• '
				: '') + localize('useVSCodeVersionOption', 'Use VSCode\'s Version'),
			description: shippedVersion.version.versionString,
			detail: shippedVersion.label,
			id: MessageAction.useBundled
		});

		for (const version of this.versionProvider.localVersions) {
			pickOptions.push({
				label: (this.currentVersion.path === version.path
					? '• '
					: '') + localize('useWorkspaceVersionOption', 'Use Workspace Version'),
				description: version.version.versionString,
				detail: version.label,
				id: MessageAction.useLocal,
				version: version
			});
		}

		pickOptions.push({
			label: localize('learnMore', 'Learn More'),
			description: '',
			id: MessageAction.learnMore
		});

		const selected = await window.showQuickPick<MyQuickPickItem>(pickOptions, {
			placeHolder: localize(
				'selectTsVersion',
				'Select the TypeScript version used for JavaScript and TypeScript language features'),
			ignoreFocusOut: firstRun
		});

		if (!selected) {
			return { oldVersion: this.currentVersion };
		}

		switch (selected.id) {
			case MessageAction.useLocal:
				await this.workspaceState.update(useWorkspaceTsdkStorageKey, true);
				if (selected.version) {
					const tsConfig = workspace.getConfiguration('typescript');
					await tsConfig.update('tsdk', selected.version.label, false);

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
				commands.executeCommand('vscode.open', Uri.parse('https://go.microsoft.com/fwlink/?linkid=839919'));
				return { oldVersion: this.currentVersion };

			default:
				return { oldVersion: this.currentVersion };
		}
	}
}