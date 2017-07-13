/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { TypeScriptVersionProvider, TypeScriptVersion } from "./versionProvider";
import { Memento, commands, Uri, window, QuickPickItem } from "vscode";

const localize = nls.loadMessageBundle();

const useWorkspaceTsdkStorageKey = 'typescript.useWorkspaceTsdk';

interface MyQuickPickItem extends QuickPickItem {
	id: MessageAction;
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
			const localVersion = this.versionProvider.localVersion;
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

	public show(firstRun?: boolean): Thenable<{ oldVersion?: TypeScriptVersion, newVersion?: TypeScriptVersion }> {
		const useWorkspaceVersionSetting = this.workspaceState.get<boolean>(useWorkspaceTsdkStorageKey, false);
		const shippedVersion = this.versionProvider.defaultVersion;
		const localVersion = this.versionProvider.localVersion;

		const pickOptions: MyQuickPickItem[] = [];

		pickOptions.push({
			label: localize('useVSCodeVersionOption', 'Use VSCode\'s Version'),
			description: shippedVersion.version.versionString,
			detail: this.currentVersion.path === shippedVersion.path && (this.currentVersion.path !== (localVersion && localVersion.path) || !useWorkspaceVersionSetting) ? localize('activeVersion', 'Currently active') : '',
			id: MessageAction.useBundled
		});

		if (localVersion) {
			pickOptions.push({
				label: localize('useWorkspaceVersionOption', 'Use Workspace Version'),
				description: localVersion.version.versionString,
				detail: this.currentVersion.path === localVersion.path && (this.currentVersion.path !== shippedVersion.path || useWorkspaceVersionSetting) ? localize('activeVersion', 'Currently active') : '',
				id: MessageAction.useLocal
			});
		}

		pickOptions.push({
			label: localize('learnMore', 'Learn More'),
			description: '',
			id: MessageAction.learnMore
		});

		return window.showQuickPick<MyQuickPickItem>(pickOptions, {
			placeHolder: localize(
				'selectTsVersion',
				'Select the TypeScript version used for JavaScript and TypeScript language features'),
			ignoreFocusOut: firstRun
		})
			.then(selected => {
				if (!selected) {
					return { oldVersion: this.currentVersion };
				}
				switch (selected.id) {
					case MessageAction.useLocal:
						return this.workspaceState.update(useWorkspaceTsdkStorageKey, true)
							.then(_ => {
								if (localVersion) {
									const previousVersion = this.currentVersion;

									this._currentVersion = localVersion;
									return { oldVersion: previousVersion, newVersion: localVersion };
								}
								return { oldVersion: this.currentVersion };
							});

					case MessageAction.useBundled:
						return this.workspaceState.update(useWorkspaceTsdkStorageKey, false)
							.then(_ => {
								const previousVersion = this.currentVersion;
								this._currentVersion = shippedVersion;
								return { oldVersion: previousVersion, newVersion: shippedVersion };
							});

					case MessageAction.learnMore:
						commands.executeCommand('vscode.open', Uri.parse('https://go.microsoft.com/fwlink/?linkid=839919'));
						return { oldVersion: this.currentVersion };

					default:
						return { oldVersion: this.currentVersion };
				}
			});

	}
}