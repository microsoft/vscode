/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, languages, LanguageStatusItem, LanguageStatusSeverity, window, workspace } from 'vscode';
import { IDisposable } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotConfigPrefix } from '../../lib/src/constants';
import { CMDQuotaExceeded } from '../../lib/src/openai/fetch';
import { StatusChangedEvent, StatusReporter } from '../../lib/src/progress';
import { isCompletionEnabled, isInlineSuggestEnabled } from './config';
import { CMDToggleStatusMenuChat } from './constants';
import { ICompletionsExtensionStatus } from './extensionStatus';
import { Icon } from './icon';

export class CopilotStatusBar extends StatusReporter implements IDisposable {
	readonly item!: LanguageStatusItem;
	showingMessage = false;
	private disposables: Disposable[] = [];

	constructor(
		id: string,
		@ICompletionsExtensionStatus readonly extensionStatusService: ICompletionsExtensionStatus,
		@IInstantiationService readonly instantiationService: IInstantiationService,

	) {
		super();

		this.item = languages.createLanguageStatusItem(id, '*');
		this.disposables.push(this.item);

		this.updateStatusBarIndicator();

		this.disposables.push(
			window.onDidChangeActiveTextEditor(() => {
				this.updateStatusBarIndicator();
			})
		);

		this.disposables.push(
			workspace.onDidCloseTextDocument(() => {
				this.updateStatusBarIndicator();
			})
		);

		this.disposables.push(
			workspace.onDidOpenTextDocument(() => {
				this.updateStatusBarIndicator();
			})
		);

		this.disposables.push(
			workspace.onDidChangeConfiguration(e => {
				if (!e.affectsConfiguration(CopilotConfigPrefix)) { return; }
				this.updateStatusBarIndicator();
			})
		);
	}

	override didChange(event: StatusChangedEvent): void {
		this.extensionStatusService.kind = event.kind;
		this.extensionStatusService.message = event.message;
		this.extensionStatusService.command = event.command;
		this.updateStatusBarIndicator();
	}

	private checkEnabledForLanguage(): boolean {
		return this.instantiationService.invokeFunction(isCompletionEnabled) ?? true;
	}

	protected updateStatusBarIndicator() {
		if (this.isDisposed()) {
			return;
		}
		void commands.executeCommand(
			'setContext',
			'github.copilot.completions.quotaExceeded',
			this.extensionStatusService.command?.command === CMDQuotaExceeded
		);
		const enabled = this.checkEnabledForLanguage();
		void commands.executeCommand('setContext', 'github.copilot.completions.enabled', enabled);
		this.item.command = { command: CMDToggleStatusMenuChat, title: 'View Details' };
		switch (this.extensionStatusService.kind) {
			case 'Error':
				this.item.severity = LanguageStatusSeverity.Error;
				this.item.text = `${Icon.Warning} Completions`;
				this.item.detail = 'Error';
				break;
			case 'Warning':
				this.item.severity = LanguageStatusSeverity.Warning;
				this.item.text = `${Icon.Warning} Completions`;
				this.item.detail = 'Temporary issues';
				break;
			case 'Inactive':
				this.item.severity = LanguageStatusSeverity.Information;
				this.item.text = `${Icon.Blocked} Completions`;
				this.item.detail = 'Inactive';
				break;
			case 'Normal':
				this.item.severity = LanguageStatusSeverity.Information;
				if (!isInlineSuggestEnabled()) {
					this.item.text = `${Icon.NotConnected} Completions`;
					this.item.detail = 'VS Code inline suggestions disabled';
				} else if (!enabled) {
					this.item.text = `${Icon.NotConnected} Completions`;
					this.item.detail = 'Disabled';
				} else {
					this.item.text = `${Icon.Logo} Completions`;
					this.item.detail = '';
				}
				this.item.command.title = 'Open Menu';
				break;
		}
		this.item.accessibilityInformation = {
			label: 'Inline Suggestions',
		};
		if (this.extensionStatusService.command) {
			this.item.command = this.extensionStatusService.command;
			this.item.detail = this.extensionStatusService.message;
		}
	}

	dispose() {
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}

	private isDisposed() {
		return this.disposables.length === 0;
	}
}
