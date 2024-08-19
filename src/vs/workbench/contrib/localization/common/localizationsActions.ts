/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from 'vs/nls';
import { IQuickInputService, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILanguagePackItem, ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { ILocaleService } from 'vs/workbench/services/localization/common/locale';
import { IExtensionsWorkbenchService } from 'vs/workbench/contrib/extensions/common/extensions';

export class ConfigureDisplayLanguageAction extends Action2 {
	public static readonly ID = 'workbench.action.configureLocale';

	constructor() {
		super({
			id: ConfigureDisplayLanguageAction.ID,
			title: localize2('configureLocale', "Configure Display Language"),
			menu: {
				id: MenuId.CommandPalette
			},
			metadata: {
				description: localize2('configureLocaleDescription', "Changes the locale of VS Code based on installed language packs. Common languages include French, Chinese, Spanish, Japanese, German, Korean, and more.")
			}
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const languagePackService: ILanguagePackService = accessor.get(ILanguagePackService);
		const quickInputService: IQuickInputService = accessor.get(IQuickInputService);
		const localeService: ILocaleService = accessor.get(ILocaleService);
		const extensionWorkbenchService: IExtensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);

		const installedLanguages = await languagePackService.getInstalledLanguages();

		const disposables = new DisposableStore();
		const qp = disposables.add(quickInputService.createQuickPick<ILanguagePackItem>({ useSeparators: true }));
		qp.matchOnDescription = true;
		qp.placeholder = localize('chooseLocale', "Select Display Language");

		if (installedLanguages?.length) {
			const items: Array<ILanguagePackItem | IQuickPickSeparator> = [{ type: 'separator', label: localize('installed', "Installed") }];
			qp.items = items.concat(this.withMoreInfoButton(installedLanguages));
		}

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
					{ type: 'separator', label: localize('available', "Available") },
					...this.withMoreInfoButton(newLanguages)
				];
			}
			qp.busy = false;
		});

		disposables.add(qp.onDidAccept(async () => {
			const selectedLanguage = qp.activeItems[0] as ILanguagePackItem | undefined;
			if (selectedLanguage) {
				qp.hide();
				await localeService.setLocale(selectedLanguage);
			}
		}));

		disposables.add(qp.onDidTriggerItemButton(async e => {
			qp.hide();
			if (e.item.extensionId) {
				await extensionWorkbenchService.open(e.item.extensionId);
			}
		}));

		qp.show();
		qp.busy = true;
	}

	private withMoreInfoButton(items: ILanguagePackItem[]): ILanguagePackItem[] {
		for (const item of items) {
			if (item.extensionId) {
				item.buttons = [{
					tooltip: localize('moreInfo', "More Info"),
					iconClass: 'codicon-info'
				}];
			}
		}
		return items;
	}
}

export class ClearDisplayLanguageAction extends Action2 {
	public static readonly ID = 'workbench.action.clearLocalePreference';
	public static readonly LABEL = localize2('clearDisplayLanguage', "Clear Display Language Preference");

	constructor() {
		super({
			id: ClearDisplayLanguageAction.ID,
			title: ClearDisplayLanguageAction.LABEL,
			menu: {
				id: MenuId.CommandPalette
			}
		});
	}

	public async run(accessor: ServicesAccessor): Promise<void> {
		const localeService: ILocaleService = accessor.get(ILocaleService);
		await localeService.clearLocalePreference();
	}
}
