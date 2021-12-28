/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { URI } from 'vs/base/common/uri';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ILanguageService } from 'vs/editor/common/services/languageService';
import * as nls from 'vs/nls';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export class ConfigureLanguageBasedSettingsAction extends Action {

	static readonly ID = 'workbench.action.configureLanguageBasedSettings';
	static readonly LABEL = { value: nls.localize('configureLanguageBasedSettings', "Configure Language Specific Settings..."), original: 'Configure Language Specific Settings...' };

	constructor(
		id: string,
		label: string,
		@IModelService private readonly modelService: IModelService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const languages = this.languageService.getRegisteredLanguageNames();
		const picks: IQuickPickItem[] = languages.sort().map((lang, index) => {
			const languageId = this.languageService.getLanguageIdForLanguageName(lang)!;
			const description: string = nls.localize('languageDescriptionConfigured', "({0})", languageId);
			// construct a fake resource to be able to show nice icons if any
			let fakeResource: URI | undefined;
			const extensions = this.languageService.getExtensions(lang);
			if (extensions && extensions.length) {
				fakeResource = URI.file(extensions[0]);
			} else {
				const filenames = this.languageService.getFilenamesForLanguageId(languageId);
				if (filenames && filenames.length) {
					fakeResource = URI.file(filenames[0]);
				}
			}
			return {
				label: lang,
				iconClasses: getIconClasses(this.modelService, this.languageService, fakeResource),
				description
			} as IQuickPickItem;
		});

		await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language") })
			.then(pick => {
				if (pick) {
					const languageId = this.languageService.getLanguageIdForLanguageName(pick.label);
					if (typeof languageId === 'string') {
						return this.preferencesService.openUserSettings({ jsonEditor: true, revealSetting: { key: `[${languageId}]`, edit: true } });
					}
				}
				return undefined;
			});

	}
}
