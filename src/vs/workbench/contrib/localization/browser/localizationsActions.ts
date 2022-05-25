/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { language } from 'vs/base/common/platform';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/productService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class ConfigureLocaleAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.configureLocale',
			title: { original: 'Configure Display Language', value: localize('configureLocale', "Configure Display Language") },
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	private async getLanguageOptions(localizationService: ILanguagePackService): Promise<IQuickPickItem[]> {
		const availableLanguages = await localizationService.getInstalledLanguages();
		availableLanguages.sort();

		return availableLanguages
			.map(language => { return { label: language }; })
			.concat({ label: localize('installAdditionalLanguages', "Install Additional Languages...") });
	}

	public override async run(accessor: ServicesAccessor): Promise<void> {
		const environmentService: IEnvironmentService = accessor.get(IEnvironmentService);
		const languagePackService: ILanguagePackService = accessor.get(ILanguagePackService);
		const quickInputService: IQuickInputService = accessor.get(IQuickInputService);
		const jsonEditingService: IJSONEditingService = accessor.get(IJSONEditingService);
		const hostService: IHostService = accessor.get(IHostService);
		const notificationService: INotificationService = accessor.get(INotificationService);
		const paneCompositeService: IPaneCompositePartService = accessor.get(IPaneCompositePartService);
		const dialogService: IDialogService = accessor.get(IDialogService);
		const productService: IProductService = accessor.get(IProductService);

		const languageOptions = await this.getLanguageOptions(languagePackService);
		const currentLanguageIndex = languageOptions.findIndex(l => l.label === language);

		try {
			const selectedLanguage = await quickInputService.pick(languageOptions,
				{
					canPickMany: false,
					placeHolder: localize('chooseDisplayLanguage', "Select Display Language"),
					activeItem: languageOptions[currentLanguageIndex]
				});

			if (selectedLanguage === languageOptions[languageOptions.length - 1]) {
				return paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, true)
					.then(viewlet => viewlet?.getViewPaneContainer())
					.then(viewlet => {
						const extensionsViewlet = viewlet as IExtensionsViewPaneContainer;
						extensionsViewlet.search('@category:"language packs"');
						extensionsViewlet.focus();
					});
			}

			if (selectedLanguage) {
				await jsonEditingService.write(environmentService.argvResource, [{ path: ['locale'], value: selectedLanguage.label }], true);
				const restart = await dialogService.confirm({
					type: 'info',
					message: localize('relaunchDisplayLanguageMessage', "A restart is required for the change in display language to take effect."),
					detail: localize('relaunchDisplayLanguageDetail', "Press the restart button to restart {0} and change the display language.", productService.nameLong),
					primaryButton: localize('restart', "&&Restart")
				});

				if (restart.confirmed) {
					hostService.restart();
				}
			}
		} catch (e) {
			notificationService.error(e);
		}
	}
}
