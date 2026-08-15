/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../log/common/logService';
import { IGitExtensionService } from '../common/gitExtensionService';
import { API, GitExtension } from './git';

export class GitExtensionServiceImpl implements IGitExtensionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = new vscode.EventEmitter<{ enabled: boolean }>();
	readonly onDidChange: vscode.Event<{ enabled: boolean }> = this._onDidChange.event;

	private _api: API | undefined;
	private _extensionEnablement: boolean | undefined = undefined;

	getExtensionApi(): API | undefined {
		return this._api;
	}

	private readonly _disposables: vscode.Disposable[] = [];

	constructor(@ILogService private readonly _logService: ILogService) {
		this._logService.info('[GitExtensionServiceImpl] Initializing Git extension service.');

		this._disposables.push(...this._initializeExtensionApi());
	}

	get extensionAvailable(): boolean {
		if (this._extensionEnablement === undefined) {
			return !!vscode.extensions.getExtension<GitExtension>('vscode.git');
		} else {
			return this._extensionEnablement;
		}
	}

	private _initializeExtensionApi(): vscode.Disposable[] {
		const disposables: vscode.Disposable[] = [];
		let gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');

		const initialize = async () => {
			let extension: GitExtension;
			try {
				extension = await gitExtension!.activate();
				this._logService.info('[GitExtensionServiceImpl] Successfully activated the vscode.git extension.');
			} catch (e) {
				this._logService.error(e, '[GitExtensionServiceImpl] Failed to activate the vscode.git extension.');
				return;
			}

			const onDidChangeGitExtensionEnablement = (enabled: boolean) => {
				this._logService.info(`[GitExtensionServiceImpl] Enablement state of the vscode.git extension: ${enabled}.`);
				this._extensionEnablement = enabled;
				if (enabled) {
					this._api = extension.getAPI(1);
					this._onDidChange.fire({ enabled: true });

					this._logService.info('[GitExtensionServiceImpl] Successfully registered Git commit message provider.');
				} else {
					this._api = undefined;
					this._onDidChange.fire({ enabled: false });
				}
			};

			disposables.push(extension.onDidChangeEnablement(onDidChangeGitExtensionEnablement));
			onDidChangeGitExtensionEnablement(extension.enabled);
		};

		if (gitExtension) {
			initialize();
		} else {
			this._logService.info('[GitExtensionServiceImpl] vscode.git extension is not yet activated.');

			const listener = vscode.extensions.onDidChange(() => {
				if (!gitExtension && vscode.extensions.getExtension<GitExtension>('vscode.git')) {
					gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
					initialize();

					listener.dispose();
				}
			});
		}

		return disposables;
	}

}
