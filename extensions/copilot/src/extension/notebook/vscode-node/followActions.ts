/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { INotebookService } from '../../../platform/notebook/common/notebookService';

const NOTEBOOK_FOLLOW_IN_SESSION_KEY = 'github.copilot.notebookFollowInSessionEnabled';

export class NotebookFollowCommands extends Disposable {

	private followSettingEnabled: boolean;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INotebookService private readonly _notebookService: INotebookService
	) {
		super();

		// get setting and set initial follower context state
		this.followSettingEnabled = this._configurationService.getConfig(ConfigKey.NotebookFollowCellExecution);
		this.updateFollowContext(this.followSettingEnabled);

		// config listener to disable if the setting changes
		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(ConfigKey.NotebookFollowCellExecution.fullyQualifiedId)) {
				this.followSettingEnabled = this._configurationService.getConfig(ConfigKey.NotebookFollowCellExecution);
				this.updateFollowContext(this.followSettingEnabled);
			}
		}));

		// commands to change context state
		this._register(vscode.commands.registerCommand('github.copilot.chat.notebook.enableFollowCellExecution', () => {
			this.updateFollowContext(true);
		}));

		this._register(vscode.commands.registerCommand('github.copilot.chat.notebook.disableFollowCellExecution', () => {
			this.updateFollowContext(false);
		}));
	}

	private updateFollowContext(value: boolean): void {
		vscode.commands.executeCommand('setContext', NOTEBOOK_FOLLOW_IN_SESSION_KEY, value);
		this._notebookService.setFollowState(value);

	}
}
