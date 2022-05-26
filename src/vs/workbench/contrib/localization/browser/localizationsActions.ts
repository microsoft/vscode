/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IQuickInputService, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/productService';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILanguagePackItem, ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { ILocaleService } from 'vs/workbench/services/localization/common/locale';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { isWeb } from 'vs/base/common/platform';

const restart = localize('restart', "&&Restart");

export class ConfigureDisplayLanguageAction extends Action2 {
	public static readonly ID = 'workbench.action.configureLocale';
	public static readonly LABEL = localize('configureLocale', "Configure Display Language");

	constructor() {
		super({
			id: ConfigureDisplayLanguageAction.ID,
			title: { original: 'Configure Display Language', value: ConfigureDisplayLanguageAction.LABEL },
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const languagePackService: ILanguagePackService = accessor.get(ILanguagePackService);
		const quickInputService: IQuickInputService = accessor.get(IQuickInputService);
		const hostService: IHostService = accessor.get(IHostService);
		const dialogService: IDialogService = accessor.get(IDialogService);
		const productService: IProductService = accessor.get(IProductService);
		const localeService: ILocaleService = accessor.get(ILocaleService);
		const extensionManagementService: IExtensionManagementService = accessor.get(IExtensionManagementService);
		const paneCompositePartService: IPaneCompositePartService = accessor.get(IPaneCompositePartService);
		const notificationService: INotificationService = accessor.get(INotificationService);

		const installedLanguages = await languagePackService.getInstalledLanguages();

		const qp = quickInputService.createQuickPick<ILanguagePackItem>();
		qp.placeholder = localize('chooseLocale', "Select Display Language");

		if (installedLanguages?.length) {
			const items: Array<ILanguagePackItem | IQuickPickSeparator> = [{ type: 'separator', label: localize('installed', "Installed languages") }];
			qp.items = items.concat(installedLanguages);
		}

		const disposables = new DisposableStore();
		const source = new CancellationTokenSource();
		disposables.add(qp.onDispose(() => {
			source.cancel();
			disposables.dispose();
		}));

		const installedSet = new Set<string>(installedLanguages?.map(language => language.id!) ?? []);
		languagePackService.getAvailableLanguages().then(availableLanguages => {
			const newLanguages = availableLanguages.filter(l => l.id && !installedSet.has(l.id));
			if (newLanguages.length) {
				qp.items = [
					...qp.items,
					{ type: 'separator', label: localize('available', "Available languages") },
					...newLanguages
				];
			}
			qp.busy = false;
		});

		disposables.add(qp.onDidAccept(async () => {
			const selectedLanguage = qp.activeItems[0];
			qp.hide();

			// Only Desktop has the concept of installing language packs so we only do this for Desktop
			// and only if the language pack is not installed
			if (!isWeb && !installedSet.has(selectedLanguage.id!)) {
				try {
					// Show the view so the user can see the language pack to be installed
					let viewlet = await paneCompositePartService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar);
					(viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer).search(`@id:${selectedLanguage.extensionId}`);

					// Only actually install a language pack from Microsoft
					if (selectedLanguage.galleryExtension?.publisher.toLowerCase() !== 'ms-ceintl') {
						return;
					}

					await extensionManagementService.installFromGallery(selectedLanguage.galleryExtension);
				} catch (err) {
					notificationService.error(err);
					return;
				}
			}

			if (await localeService.setLocale(selectedLanguage.id!)) {
				const restartDialog = await dialogService.confirm({
					type: 'info',
					message: localize('relaunchDisplayLanguageMessage', "A restart is required for the change in display language to take effect."),
					detail: localize('relaunchDisplayLanguageDetail', "Press the restart button to restart {0} and change the display language.", productService.nameLong),
					primaryButton: restart
				});

				if (restartDialog.confirmed) {
					hostService.restart();
				}
			}
		}));

		qp.show();
		qp.busy = true;
	}
}

export class ClearDisplayLanguageAction extends Action2 {
	public static readonly ID = 'workbench.action.clearLocalePreference';
	public static readonly LABEL = localize('clearDisplayLanguage', "Clear Display Language Preference");

	constructor() {
		super({
			id: ClearDisplayLanguageAction.ID,
			title: { original: 'Clear Display Language Preference', value: ClearDisplayLanguageAction.LABEL },
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const localeService: ILocaleService = accessor.get(ILocaleService);
		const dialogService: IDialogService = accessor.get(IDialogService);
		const productService: IProductService = accessor.get(IProductService);
		const hostService: IHostService = accessor.get(IHostService);

		if (await localeService.setLocale(undefined)) {
			const restartDialog = await dialogService.confirm({
				type: 'info',
				message: localize('relaunchAfterClearDisplayLanguageMessage', "A restart is required for the change in display language to take effect."),
				detail: localize('relaunchAfterClearDisplayLanguageDetail', "Press the restart button to restart {0} and change the display language.", productService.nameLong),
				primaryButton: restart
			});

			if (restartDialog.confirmed) {
				hostService.restart();
			}
		}
	}
}
