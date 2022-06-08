/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { language } from 'vs/base/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ILocaleService } from 'vs/workbench/contrib/localization/common/locale';
import { ILanguagePackItem, ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';

export class NativeLocaleService implements ILocaleService {
	_serviceBrand: undefined;

	constructor(
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILanguagePackService private readonly languagePackService: ILanguagePackService,
		@IPaneCompositePartService private readonly paneCompositePartService: IPaneCompositePartService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
	) { }

	private async writeLocaleValue(locale: string | undefined): Promise<void> {
		await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['locale'], value: locale }], true);
	}

	async setLocale(languagePackItem: ILanguagePackItem): Promise<boolean> {
		const locale = languagePackItem.id;
		if (locale === language || (!locale && language === 'en')) {
			return false;
		}
		const installedLanguages = await this.languagePackService.getInstalledLanguages();
		try {

			// Only Desktop has the concept of installing language packs so we only do this for Desktop
			// and only if the language pack is not installed
			if (!installedLanguages.some(installedLanguage => installedLanguage.id === languagePackItem.id)) {
				// Show the view so the user can see the language pack to be installed
				const viewlet = await this.paneCompositePartService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar);
				(viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer).search(`@id:${languagePackItem.extensionId}`);

				// Only actually install a language pack from Microsoft
				if (languagePackItem.galleryExtension?.publisher.toLowerCase() !== 'ms-ceintl') {
					return false;
				}

				await this.extensionManagementService.installFromGallery(languagePackItem.galleryExtension);
			}

			await this.writeLocaleValue(locale);
			return true;
		} catch (err) {
			this.notificationService.error(err);
			return false;
		}
	}

	async clearLocalePreference(): Promise<boolean> {
		if (language === 'en') {
			return false;
		}
		try {
			await this.writeLocaleValue(undefined);
			return true;
		} catch (err) {
			this.notificationService.error(err);
			return false;
		}
	}
}

registerSingleton(ILocaleService, NativeLocaleService, true);
