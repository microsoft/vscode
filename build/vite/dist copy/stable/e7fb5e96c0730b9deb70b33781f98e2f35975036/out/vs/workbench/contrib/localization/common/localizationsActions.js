/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ILanguagePackService } from '../../../../platform/languagePacks/common/languagePacks.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
export class ConfigureDisplayLanguageAction extends Action2 {
    static { this.ID = 'workbench.action.configureLocale'; }
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
    async run(accessor) {
        const languagePackService = accessor.get(ILanguagePackService);
        const quickInputService = accessor.get(IQuickInputService);
        const localeService = accessor.get(ILocaleService);
        const extensionWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const installedLanguages = await languagePackService.getInstalledLanguages();
        const disposables = new DisposableStore();
        const qp = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
        qp.matchOnDescription = true;
        qp.placeholder = localize('chooseLocale', "Select Display Language");
        if (installedLanguages?.length) {
            const items = [{ type: 'separator', label: localize('installed', "Installed") }];
            qp.items = items.concat(this.withMoreInfoButton(installedLanguages));
        }
        disposables.add(qp.onDidHide(() => {
            disposables.dispose();
        }));
        const installedSet = new Set(installedLanguages?.map(language => language.id) ?? []);
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
            const selectedLanguage = qp.activeItems[0];
            if (selectedLanguage) {
                qp.hide();
                await localeService.setLocale(selectedLanguage);
            }
        }));
        disposables.add(qp.onDidTriggerItemButton(async (e) => {
            qp.hide();
            if (e.item.extensionId) {
                await extensionWorkbenchService.open(e.item.extensionId);
            }
        }));
        qp.show();
        qp.busy = true;
    }
    withMoreInfoButton(items) {
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
    static { this.ID = 'workbench.action.clearLocalePreference'; }
    static { this.LABEL = localize2('clearDisplayLanguage', "Clear Display Language Preference"); }
    constructor() {
        super({
            id: ClearDisplayLanguageAction.ID,
            title: ClearDisplayLanguageAction.LABEL,
            menu: {
                id: MenuId.CommandPalette
            }
        });
    }
    async run(accessor) {
        const localeService = accessor.get(ILocaleService);
        await localeService.clearLocalePreference();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxpemF0aW9uc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9sb2NhbGl6YXRpb24vY29tbW9uL2xvY2FsaXphdGlvbnNBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLGtCQUFrQixFQUF1QixNQUFNLHNEQUFzRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWpGLE9BQU8sRUFBcUIsb0JBQW9CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDakYsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFcEYsTUFBTSxPQUFPLDhCQUErQixTQUFRLE9BQU87YUFDbkMsT0FBRSxHQUFHLGtDQUFrQyxDQUFDO0lBRS9EO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLDhCQUE4QixDQUFDLEVBQUU7WUFDckMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSw0QkFBNEIsQ0FBQztZQUNqRSxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxjQUFjO2FBQ3pCO1lBQ0QsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSxTQUFTLENBQUMsNEJBQTRCLEVBQUUseUpBQXlKLENBQUM7YUFDL007U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU0sS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUMxQyxNQUFN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