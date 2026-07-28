/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, QuickPick, QuickPickItem, QuickPickItemKind, commands, l10n, window } from 'vscode';
import { isWeb } from '../../../../../util/vs/base/common/platform';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsModelManagerService } from '../../lib/src/openai/model';
import { isCompletionEnabled, isInlineSuggestEnabled } from './config';
import { CMDCollectDiagnosticsChat, CMDDisableCompletionsChat, CMDEnableCompletionsChat, CMDOpenDocumentationClient, CMDOpenLogsClient, CMDOpenModelPickerClient, CMDOpenPanelClient } from './constants';
import { ICompletionsExtensionStatus } from './extensionStatus';
import { Icon } from './icon';

export class CopilotStatusBarPickMenu {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICompletionsExtensionStatus private readonly extensionStatusService: ICompletionsExtensionStatus,
		@ICompletionsModelManagerService private readonly modelManagerService: ICompletionsModelManagerService,
	) { }

	showStatusMenu() {
		const quickpickList = window.createQuickPick();
		quickpickList.placeholder = l10n.t('Select an option');
		quickpickList.title = l10n.t('Configure Inline Suggestions');
		quickpickList.items = this.collectQuickPickItems();
		const listeners = Disposable.from(
			quickpickList.onDidAccept(() => this.handleItemSelection(quickpickList)),
			quickpickList.onDidHide(() => {
				listeners.dispose();
				quickpickList.dispose();
			})
		);
		quickpickList.show();
		return quickpickList;
	}

	async handleItemSelection(quickpickList: QuickPick<QuickPickItem>): Promise<void> {
		const selection = quickpickList.selectedItems[0];
		if (selection === undefined) { return; }

		if ('command' in selection) {
			const commandSelection = selection as CommandQuickItem;
			await commands.executeCommand(commandSelection.command, ...commandSelection.commandArgs);
			quickpickList.hide();
		} else {
			throw new Error('Unexpected Copilot quick picker selection');
		}
	}

	private collectQuickPickItems() {
		return [
			this.newStatusItem(),
			this.newSeparator(),
			...this.collectLanguageSpecificItems(),
			this.newKeyboardItem(),
			this.newSettingsItem(),
			...this.collectDiagnosticsItems(),
			this.newOpenLogsItem(),
			this.newSeparator(),
			this.newDocsItem(),
			//this.newForumItem(),
		];
	}

	private collectLanguageSpecificItems() {
		const items: QuickPickItem[] = [];
		if (!this.hasActiveStatus()) { return items; }

		const editor = window.activeTextEditor;
		if (!isWeb && editor) { items.push(this.newPanelItem()); }
		if (!isWeb && this.hasMultipleModels()) { items.push(this.newChangeModelItem()); }
		if (editor) { items.push(...this.newEnableLanguageItem()); }
		if (items.length) { items.push(this.newSeparator()); }

		return items;
	}

	private hasActiveStatus() {
		return ['Normal'].includes(this.extensionStatusService.kind);
	}

	private hasMultipleModels() {
		return this.modelManagerService.getGenericCompletionModels().length > 1;
	}

	private isCompletionEnabled() {
		return isInlineSuggestEnabled() && this.instantiationService.invokeFunction(isCompletionEnabled);
	}

	private newEnableLanguageItem() {
		const isEnabled = this.isCompletionEnabled();
		if (isEnabled) {
			return [this.newCommandItem(l10n.t('Disable Inline Suggestions'), CMDDisableCompletionsChat)];
		} else if (isEnabled === false) {
			return [this.newCommandItem(l10n.t('Enable Inline Suggestions'), CMDEnableCompletionsChat)];
		} else {
			return [];
		}
	}

	private newStatusItem() {
		let statusText;
		let statusIcon = Icon.Logo;
		switch (this.extensionStatusService.kind) {
			case 'Normal':
				statusText = l10n.t('Ready');
				if (isInlineSuggestEnabled() === false) {
					statusText += ` (${l10n.t('VS Code inline suggestions disabled')})`;
				} else if (this.instantiationService.invokeFunction(isCompletionEnabled) === false) {
					statusText += ` (${l10n.t('Disabled')})`;
				}
				break;
			case 'Inactive':
				statusText = this.extensionStatusService.message || l10n.t('Copilot is currently inactive');
				statusIcon = Icon.Blocked;
				break;
			default:
				statusText = this.extensionStatusService.message || l10n.t('Copilot has encountered an error');
				statusIcon = Icon.NotConnected;
				break;
		}
		return this.newCommandItem(`${statusIcon} ${l10n.t('Status')}: ${statusText}`, CMDOpenLogsClient);
	}

	private newOpenLogsItem() {
		return this.newCommandItem(l10n.t('Open Logs...'), CMDOpenLogsClient);
	}

	private collectDiagnosticsItems() {
		if (isWeb) { return []; }
		return [this.newCommandItem(l10n.t('Show Diagnostics...'), CMDCollectDiagnosticsChat)];
	}

	private newKeyboardItem() {
		return this.newCommandItem(l10n.t('$(keyboard) Edit Keyboard Shortcuts...'), 'workbench.action.openGlobalKeybindings', [
			'copilot',
		]);
	}

	private newSettingsItem() {
		return this.newCommandItem(l10n.t('$(settings-gear) Edit Settings...'), 'workbench.action.openSettings', [
			'GitHub Copilot',
		]);
	}

	private newPanelItem() {
		return this.newCommandItem(l10n.t('Open Completions Panel...'), CMDOpenPanelClient);
	}

	private newChangeModelItem() {
		return this.newCommandItem(l10n.t('Change Completions Model...'), CMDOpenModelPickerClient);
	}

	private newDocsItem() {
		return this.newCommandItem(
			l10n.t('$(remote-explorer-documentation) View Copilot Documentation...'),
			CMDOpenDocumentationClient
		);
	}

	private newCommandItem(label: string, command: string, commandArgs?: string[]): CommandQuickItem {
		return new CommandQuickItem(label, command, commandArgs || []);
	}

	private newSeparator(): QuickPickItem {
		return {
			label: '',
			kind: QuickPickItemKind.Separator,
		};
	}
}

class CommandQuickItem implements QuickPickItem {
	constructor(
		readonly label: string,
		readonly command: string,
		readonly commandArgs: string[]
	) { }
}
