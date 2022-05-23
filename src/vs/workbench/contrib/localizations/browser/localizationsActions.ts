/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { language } from 'vs/base/common/platform';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IProductService } from 'vs/platform/product/common/productService';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';

const installAdditionalLanguages = localize('installAdditionalLanguages', "Install Additional Languages...");

export class ConfigureLocaleAction extends Action2 {
	public static readonly ID = 'workbench.action.configureLocale';
	public static readonly LABEL = localize('configureLocale', "Configure Display Language");

	constructor() {
		super({
			id: ConfigureLocaleAction.ID,
			title: { original: 'Configure Display Language', value: ConfigureLocaleAction.LABEL },
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	private createQuickPickItem(languageItem: { locale: string; label?: string | undefined }): IQuickPickItem {
		const label = languageItem.label ?? languageItem.locale;
		let description: string | undefined = languageItem.locale !== languageItem.label ? languageItem.locale : undefined;
		if (languageItem.locale === language) {
			if (!description) {
				description = '';
			}
			description += localize('currentDisplayLanguage', " (Current)");
		}
		return {
			id: languageItem.locale,
			label,
			description
		};
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const environmentService: IEnvironmentService = accessor.get(IEnvironmentService);
		const localizationService: ILocalizationsService = accessor.get(ILocalizationsService);
		const quickInputService: IQuickInputService = accessor.get(IQuickInputService);
		const jsonEditingService: IJSONEditingService = accessor.get(IJSONEditingService);
		const hostService: IHostService = accessor.get(IHostService);
		const dialogService: IDialogService = accessor.get(IDialogService);
		const productService: IProductService = accessor.get(IProductService);
		const paneCompositeService: IPaneCompositePartService = accessor.get(IPaneCompositePartService);
		const extensionManagementService: IExtensionManagementService = accessor.get(IExtensionManagementService);

		const installedLanguages = await localizationService.getInstalledLanguages();

		const qp = quickInputService.createQuickPick<IQuickPickItem>();
		qp.placeholder = localize('chooseLocale', "Select Display Language");

		if (installedLanguages.length) {
			const items: Array<IQuickPickItem | IQuickPickSeparator> = [{ type: 'separator', label: localize('installed', "Installed languages") }];
			qp.items = items.concat(installedLanguages.map(installedLanguage => this.createQuickPickItem(installedLanguage)));
		}

		const disposables = new DisposableStore();
		const source = new CancellationTokenSource();
		disposables.add(qp.onDispose(() => {
			source.cancel();
			disposables.dispose();
		}));

		const installedSet = new Set<string>(installedLanguages.map(language => language.locale));
		localizationService.getAvailableLanguages().then(availableLanguages => {
			if (!availableLanguages.length) {
				qp.items = [
					...qp.items,
					{ label: installAdditionalLanguages }
				];
			}

			const newLanguages = availableLanguages
				.filter(l => !installedSet.has(l.locale))
				.map(availableLanguage => this.createQuickPickItem(availableLanguage));
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
			if (selectedLanguage.label === installAdditionalLanguages) {
				return paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar, true)
					.then(viewlet => viewlet?.getViewPaneContainer())
					.then(viewlet => {
						const extensionsViewlet = viewlet as IExtensionsViewPaneContainer;
						extensionsViewlet.search('@category:"language packs"');
						extensionsViewlet.focus();
					});
			}

			// window.localStorage.setItem('VSCODE_NLS_LOCALE', locale)

			if (!installedSet.has(selectedLanguage.id!)) {
				// install language pack
				await paneCompositeService.openPaneComposite(EXTENSIONS_VIEWLET_ID, ViewContainerLocation.Sidebar)
						.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
						.then(viewlet => viewlet.search(`@tag:lp-${selectedLanguage.id!}`))
						.then(() => extensionManagementService.installFromGallery({
							identifier: {
								id: selectedLanguage.
							}
						}))
						.then(() => undefined, err => this.notificationService.error(err));
			}
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
		}));

		qp.show();
		qp.busy = true;
	}
}
