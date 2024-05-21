/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TsServerLogLevel } from '../configuration/configuration';
import { Disposable } from '../utils/dispose';


export class LogLevelMonitor extends Disposable {

	private static readonly logLevelConfigKey = 'typescript.tsserver.log';
	private static readonly logLevelChangedStorageKey = 'typescript.tsserver.logLevelChanged';
	private static readonly doNotPromptLogLevelStorageKey = 'typescript.tsserver.doNotPromptLogLevel';

	constructor(private readonly context: vscode.ExtensionContext) {
		super();

		this._register(vscode.workspace.onDidChangeConfiguration(this.onConfigurationChange, this, this._disposables));

		if (this.shouldNotifyExtendedLogging()) {
			this.notifyExtendedLogging();
		}
	}

	private onConfigurationChange(event: vscode.ConfigurationChangeEvent) {
		const logLevelChanged = event.affectsConfiguration(LogLevelMonitor.logLevelConfigKey);
		if (!logLevelChanged) {
			return;
		}
		this.context.globalState.update(LogLevelMonitor.logLevelChangedStorageKey, new Date());
	}

	private get logLevel(): TsServerLogLevel {
		return TsServerLogLevel.fromString(vscode.workspace.getConfiguration().get<string>(LogLevelMonitor.logLevelConfigKey, 'off'));
	}

	/**
	 * Last date change if it exists and can be parsed as a date,
	 * otherwise undefined.
	 */
	private get lastLogLevelChange(): Date | undefined {
		const lastChange = this.context.globalState.get<string | undefined>(LogLevelMonitor.logLevelChangedStorageKey);

		if (lastChange) {
			const date = new Date(lastChange);
			if (date instanceof Date && !isNaN(date.valueOf())) {
				return date;
			}
		}
		return undefined;
	}

	private get doNotPrompt(): boolean {
		return this.context.globalState.get<boolean | undefined>(LogLevelMonitor.doNotPromptLogLevelStorageKey) || false;
	}

	private shouldNotifyExtendedLogging(): boolean {
		const lastChangeMilliseconds = this.lastLogLevelChange ? new Date(this.lastLogLevelChange).valueOf() : 0;
		const lastChangePlusOneWeek = new Date(lastChangeMilliseconds + /* 7 days in milliseconds */ 86400000 * 7);

		if (!this.doNotPrompt && this.logLevel !== TsServerLogLevel.Off && lastChangePlusOneWeek.valueOf() < Date.now()) {
			return true;
		}
		return false;
	}

	private notifyExtendedLogging() {
		const enum Choice {
			DisableLogging = 0,
			DoNotShowAgain = 1
		}
		interface Item extends vscode.MessageItem {
			readonly choice: Choice;
		}

		vscode.window.showInformationMessage<Item>(
			vscode.l10n.t("TS Server logging is currently enabled which may impact performance."),
			{
				title: vscode.l10n.t("Disable logging"),
				choice: Choice.DisableLogging
			},
			{
				title: vscode.l10n.t("Don't show again"),
				choice: Choice.DoNotShowAgain
			})
			.then(selection => {
				if (!selection) {
					return;
				}
				if (selection.choice === Choice.DisableLogging) {
					return vscode.workspace.getConfiguration().update(LogLevelMonitor.logLevelConfigKey, 'off', true);
				} else if (selection.choice === Choice.DoNotShowAgain) {
					return this.context.globalState.update(LogLevelMonitor.doNotPromptLogLevelStorageKey, true);
				}
				return;
			});
	}
}
