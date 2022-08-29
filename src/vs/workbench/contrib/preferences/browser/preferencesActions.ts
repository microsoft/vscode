/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { URI } from 'vs/base/common/uri';
import { getIconClasses } from 'vs/editor/common/services/getIconClasses';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
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
		const languages = this.languageService.getSortedRegisteredLanguageNames();
		const picks: IQuickPickItem[] = languages.map(({ languageName, languageId }) => {
			const description: string = nls.localize('languageDescriptionConfigured', "({0})", languageId);
			// construct a fake resource to be able to show nice icons if any
			let fakeResource: URI | undefined;
			const extensions = this.languageService.getExtensions(languageId);
			if (extensions.length) {
				fakeResource = URI.file(extensions[0]);
			} else {
				const filenames = this.languageService.getFilenames(languageId);
				if (filenames.length) {
					fakeResource = URI.file(filenames[0]);
				}
			}
			return {
				label: languageName,
				iconClasses: getIconClasses(this.modelService, this.languageService, fakeResource),
				description
			} as IQuickPickItem;
		});

		await this.quickInputService.pick(picks, { placeHolder: nls.localize('pickLanguage', "Select Language") })
			.then(pick => {
				if (pick) {
					const languageId = this.languageService.getLanguageIdByLanguageName(pick.label);
					if (typeof languageId === 'string') {
						return this.preferencesService.openLanguageSpecificSettings(languageId);
					}
				}
				return undefined;
			});

	}
}
