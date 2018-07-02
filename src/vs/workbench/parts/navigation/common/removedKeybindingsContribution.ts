/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { localize } from 'vs/nls';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

// TODO@Sandeep remove me after a while
export class HistoryNavigationKeybindingsChangedContribution implements IWorkbenchContribution {

	private previousCommands: string[] = [

		'search.history.showNextIncludePattern',
		'search.history.showPreviousIncludePattern',
		'search.history.showNextExcludePattern',
		'search.history.showPreviousExcludePattern',
		'search.history.showNext',
		'search.history.showPrevious',
		'search.replaceHistory.showNext',
		'search.replaceHistory.showPrevious',

		'find.history.showPrevious',
		'find.history.showNext',

		'workbench.action.terminal.findWidget.history.showNext',
		'workbench.action.terminal.findWidget.history.showPrevious',

		'editor.action.extensioneditor.showNextFindTerm',
		'editor.action.extensioneditor.showPreviousFindTerm',

		'editor.action.webvieweditor.showNextFindTerm',
		'editor.action.webvieweditor.showPreviousFindTerm',

		'repl.action.historyNext',
		'repl.action.historyPrevious'
	];

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IStorageService private readonly storageService: IStorageService
	) {
		this.showRemovedWarning();
	}

	private showRemovedWarning(): void {
		const key = 'donotshow.historyNavigation.warning';
		if (!this.storageService.getBoolean(key, StorageScope.GLOBAL, false)) {
			const keybindingsToRemove = this.keybindingService.getKeybindings().filter(keybinding => !keybinding.isDefault && this.previousCommands.indexOf(keybinding.command) !== -1);
			if (keybindingsToRemove.length) {
				const message = localize('showDeprecatedWarningMessage', "History navigation commands have changed. Please update your keybindings to use following new commands: 'history.showPrevious' and 'history.showNext'");
				this.notificationService.prompt(Severity.Warning, message, [
					{
						label: localize('Open Keybindings', "Open Keybindings File"),
						run: () => this.preferencesService.openGlobalKeybindingSettings(true)
					},
					{
						label: localize('more information', "More Information..."),
						run: () => null
					},
					{
						label: localize('Do not show again', "Don't show again"),
						isSecondary: true,
						run: () => this.storageService.store(key, true, StorageScope.GLOBAL)
					}
				]);
			}
		}
	}
}
