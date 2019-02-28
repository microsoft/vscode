/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { language } from 'vs/base/common/platform';
import { firstIndex } from 'vs/base/common/arrays';

export class ConfigureLocaleAction extends Action {
	public static readonly ID = 'workbench.action.configureLocale';
	public static readonly LABEL = localize('configureLocale', "Configure Display Language");

	constructor(id: string, label: string,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILocalizationsService private readonly localizationService: ILocalizationsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(id, label);
	}

	private async getLanguageOptions(): Promise<IQuickPickItem[]> {
		return this.localizationService.getLanguageIds().then(languages => {
			return languages.map(language => {
				return {
					label: language.toLowerCase()
				};
			});
		});
	}

	public async run(event?: any): Promise<void> {
		const languageOptions = await this.getLanguageOptions();
		const currentLanguageIndex = firstIndex(languageOptions, l => l.label === language);

		try {
			const selectedLanguage = await this.quickInputService.pick(languageOptions,
				{
					canPickMany: false,
					placeHolder: localize('chooseDisplayLanguage', "Select display language. VS Code will restart to apply the change"),
					activeItem: languageOptions[currentLanguageIndex]
				});

			if (selectedLanguage) {
				const file = URI.file(join(this.environmentService.appSettingsHome, 'locale.json'));
				await this.jsonEditingService.write(file, { key: 'locale', value: selectedLanguage.label }, true);
				this.windowsService.relaunch({});
			}
		} catch (e) {
			this.notificationService.error(e);
		}
	}
}
