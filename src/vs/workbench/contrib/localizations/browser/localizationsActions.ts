/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILocalizationsService, LanguageType } from 'vs/platform/localizations/common/localizations';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { language } from 'vs/base/common/platform';
import { firstIndex } from 'vs/base/common/arrays';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

export class ConfigureLocaleAction extends Action {
	public static readonly ID = 'workbench.action.configureLocale';
	public static readonly LABEL = localize('configureLocale', "Configure Display Language");

	constructor(id: string, label: string,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILocalizationsService private readonly localizationService: ILocalizationsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IViewletService private readonly viewletService: IViewletService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super(id, label);
	}

	private async getLanguageOptions(): Promise<IQuickPickItem[]> {
		// Contributed languages are those installed via extension packs, so does not include English
		const availableLanguages = ['en', ...await this.localizationService.getLanguageIds(LanguageType.Contributed)];
		availableLanguages.sort();

		return availableLanguages
			.map(language => { return { label: language }; })
			.concat({ label: localize('installAdditionalLanguages', "Install additional languages...") });
	}

	public async run(event?: any): Promise<void> {
		const languageOptions = await this.getLanguageOptions();
		const currentLanguageIndex = firstIndex(languageOptions, l => l.label === language);

		try {
			const selectedLanguage = await this.quickInputService.pick(languageOptions,
				{
					canPickMany: false,
					placeHolder: localize('chooseDisplayLanguage', "Select Display Language"),
					activeItem: languageOptions[currentLanguageIndex]
				});

			if (selectedLanguage === languageOptions[languageOptions.length - 1]) {
				return this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true)
					.then((viewlet: IExtensionsViewlet) => {
						viewlet.search('@category:"language packs"');
						viewlet.focus();
					});
			}

			if (selectedLanguage) {
				await this.jsonEditingService.write(this.environmentService.localeResource, { key: 'locale', value: selectedLanguage.label }, true);
				const restart = await this.dialogService.confirm({
					type: 'info',
					message: localize('relaunchDisplayLanguageMessage', "A restart is required for the change in display language to take effect."),
					detail: localize('relaunchDisplayLanguageDetail', "Press the restart button to restart {0} and change the display language.", this.environmentService.appNameLong),
					primaryButton: localize('restart', "&&Restart")
				});

				if (restart.confirmed) {
					this.windowsService.relaunch({});
				}
			}
		} catch (e) {
			this.notificationService.error(e);
		}
	}
}
