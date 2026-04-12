/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize, localize2 } from '../../../../nls.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { MenuRegistry, MenuId, Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IWorkbenchThemeService, ThemeSettings, ThemeSettingDefaults } from '../../../services/themes/common/workbenchThemeService.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { Extensions as ColorRegistryExtensions } from '../../../../platform/theme/common/colorRegistry.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Color } from '../../../../base/common/color.js';
import { ColorScheme, isHighContrast } from '../../../../platform/theme/common/theme.js';
import { colorThemeSchemaId } from '../../../services/themes/common/colorThemeSchema.js';
import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { IQuickInputService, QuickInputButtonLocation } from '../../../../platform/quickinput/common/quickInput.js';
import { DEFAULT_PRODUCT_ICON_THEME_ID, ProductIconThemeData } from '../../../services/themes/browser/productIconThemeData.js';
import { ThrottledDelayer } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Emitter } from '../../../../base/common/event.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { FileIconThemeData } from '../../../services/themes/browser/fileIconThemeData.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
export const manageExtensionIcon = registerIcon('theme-selection-manage-extension', Codicon.gear, localize('manageExtensionIcon', 'Icon for the \'Manage\' action in the theme selection quick pick.'));
var ConfigureItem;
(function (ConfigureItem) {
    ConfigureItem["BROWSE_GALLERY"] = "marketplace";
    ConfigureItem["EXTENSIONS_VIEW"] = "extensions";
    ConfigureItem["CUSTOM_TOP_ENTRY"] = "customTopEntry";
})(ConfigureItem || (ConfigureItem = {}));
let MarketplaceThemesPicker = class MarketplaceThemesPicker {
    constructor(getMarketplaceColorThemes, marketplaceQuery, extensionGalleryService, extensionManagementService, quickInputService, logService, progressService, extensionsWorkbenchService, dialogService) {
        this.getMarketplaceColorThemes = getMarketplaceColorThemes;
        this.marketplaceQuery = marketplaceQuery;
        this.extensionGalleryService = extensionGalleryService;
        this.extensionManagementService = extensionManagementService;
        this.quickInputService = quickInputService;
        this.logService = logService;
        this.progressService = progressService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.dialogService = dialogService;
        this._marketplaceExtensions = new Set();
        this._marketplaceThemes = [];
        this._searchOngoing = false;
        this._searchError = undefined;
        this._onDidChange = new Emitter();
        this._queryDelayer = new ThrottledDelayer(200);
        this._installedExtensions = extensionManagementService.getInstalled().then(installed => {
            const result = new Set();
            for (const ext of installed) {
                result.add(ext.identifier.id);
            }
            return result;
        });
    }
    get themes() {
        return this._marketplaceThemes;
    }
    get onDidChange() {
        return this._onDidChange.event;
    }
    trigger(value) {
        if (this._tokenSource) {
            this._tokenSource.cancel();
            this._tokenSource = undefined;
        }
        this._queryDelayer.trigger(() => {
            this._tokenSource = new CancellationTokenSource();
            return this.doSearch(value, this._tokenSource.token);
        });
    }
    async doSearch(value, token) {
        this._searchOngoing = true;
        this._onDidChange.fire();
        try {
            const installedExtensions = await this._installedExtensions;
            const options = { text: `${this.marketplaceQuery} ${value}`, pageSize: 20 };
            const pager = await this.extensionGalleryService.query(options, token);
            for (let i = 0; i < pager.total && i < 1; i++) { // loading multiple pages is turned of for now to avoid flickering
                if (token.isCancellationRequested) {
                    break;
                }
                const nThemes = this._marketplaceThemes.length;
                const gallery = i === 0 ? pager.firstPage : await pager.getPage(i, token);
                const promises = [];
                const promisesGalleries = [];
                for (let i = 0; i < gallery.length; i++) {
                    if (token.isCancellationRequested) {
                        break;
                    }
                    const ext = gallery[i];
                    if (!installedExtensions.has(ext.identifier.id) && !this._marketplaceExtensions.has(ext.identifier.id)) {
                        this._marketplaceExtensions.add(ext.identifier.id);
                        promises.push(this.getMarketplaceColorThemes(ext.publisher, ext.name, ext.version));
                        promisesGalleries.push(ext);
                    }
                }
                const allThemes = await Promise.all(promises);
                for (let i = 0; i < allThemes.length; i++) {
                    const ext = promisesGalleries[i];
                    for (const theme of allThemes[i]) {
                        this._marketplaceThemes.push({ id: theme.id, theme: theme, label: theme.label, description: `${ext.displayName} · ${ext.publisherDisplayName}`, galleryExtension: ext, buttons: [configureButton] });
                    }
                }
                if (nThemes !== this._marketplaceThemes.length) {
                    this._marketplaceThemes.sort((t1, t2) => t1.label.localeCompare(t2.label));
                    this._onDidChange.fire();
                }
            }
        }
        catch (e) {
            if (!isCancellationError(e)) {
                this.logService.error(`Error while searching for themes:`, e);
                this._searchError = 'message' in e ? e.message : String(e);
            }
        }
        finally {
            this._searchOngoing = false;
            this._onDidChange.fire();
        }
    }
    openQuickPick(value, currentTheme, selectTheme) {
        let result = undefined;
        const disposables = new DisposableStore();
        return new Promise((s, _) => {
            const quickpick = disposables.add(this.quickInputService.createQuickPick());
            quickpick.items = [];
            quickpick.sortByLabel = false;
            quickpick.matchOnDescription = true;
            quickpick.buttons = [this.quickInputService.backButton];
            quickpick.title = 'Marketplace Themes';
            quickpick.placeholder = localize('themes.selectMarketplaceTheme', "Type to Search More. Select to Install. Up/Down Keys to Preview");
            quickpick.canSelectMany = false;
            disposables.add(quickpick.onDidChangeValue(() => this.trigger(quickpick.value)));
            disposables.add(quickpick.onDidAccept(async (_) => {
                const themeItem = quickpick.selectedItems[0];
                if (themeItem?.galleryExtension) {
                    result = 'selected';
                    quickpick.hide();
                    const success = await this.installExtension(themeItem.galleryExtension);
                    if (success) {
                        selectTheme(themeItem.theme, true);
                    }
                    else {
                        selectTheme(currentTheme, true);
                    }
                }
            }));
            disposables.add(quickpick.onDidTriggerItemButton(e => {
                if (isItem(e.item)) {
                    const extensionId = e.item.theme?.extensionData?.extensionId;
                    if (extensionId) {
                        this.extensionsWorkbenchService.openSearch(`@id:${extensionId}`);
                    }
                    else {
                        this.extensionsWorkbenchService.openSearch(`${this.marketplaceQuery} ${quickpick.value}`);
                    }
                }
            }));
            disposables.add(quickpick.onDidChangeActive(themes => {
                if (result === undefined) {
                    selectTheme(themes[0]?.theme, false);
                }
            }));
            disposables.add(quickpick.onDidHide(() => {
                if (result === undefined) {
                    selectTheme(currentTheme, true);
                    result = 'cancelled';
                }
                s(result);
            }));
            disposables.add(quickpick.onDidTriggerButton(e => {
                if (e === this.quickInputService.backButton) {
                    result = 'back';
                    quickpick.hide();
                }
            }));
            disposables.add(this.onDidChange(() => {
                let items = this.themes;
                if (this._searchOngoing) {
                    items = items.concat({ label: '$(loading~spin) Searching for themes...', id: undefined, alwaysShow: true });
                }
                else if (items.length === 0 && this._searchError) {
                    items = [{ label: `$(error) ${localize('search.error', 'Error while searching for themes: {0}', this._searchError)}`, id: undefined, alwaysShow: true }];
                }
                const activeItemId = quickpick.activeItems[0]?.id;
                const newActiveItem = activeItemId ? items.find(i => isItem(i) && i.id === activeItemId) : undefined;
                quickpick.items = items;
                if (newActiveItem) {
                    quickpick.activeItems = [newActiveItem];
                }
            }));
            this.trigger(value);
            quickpick.show();
        }).finally(() => {
            disposables.dispose();
        });
    }
    async installExtension(galleryExtension) {
        this.extensionsWorkbenchService.openSearch(`@id:${galleryExtension.identifier.id}`);
        const result = await this.dialogService.confirm({
            message: localize('installExtension.confirm', "This will install extension '{0}' published by '{1}'. Do you want to continue?", galleryExtension.displayName, galleryExtension.publisherDisplayName),
            primaryButton: localize('installExtension.button.ok', "OK")
        });
        if (!result.confirmed) {
            return false;
        }
        try {
            await this.progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: localize('installing extensions', "Installing Extension {0}...", galleryExtension.displayName)
            }, async () => {
                await this.extensionManagementService.installFromGallery(galleryExtension, {
                    // Setting this to false is how you get the extension to be synced with Settings Sync (if enabled).
                    isMachineScoped: false,
                });
            });
            return true;
        }
        catch (e) {
            this.logService.error(`Problem installing extension ${galleryExtension.identifier.id}`, e);
            return false;
        }
    }
    dispose() {
        if (this._tokenSource) {
            this._tokenSource.cancel();
            this._tokenSource = undefined;
        }
        this._queryDelayer.dispose();
        this._marketplaceExtensions.clear();
        this._marketplaceThemes.length = 0;
        this._onDidChange.dispose();
    }
};
MarketplaceThemesPicker = __decorate([
    __param(2, IExtensionGalleryService),
    __param(3, IExtensionManagementService),
    __param(4, IQuickInputService),
    __param(5, ILogService),
    __param(6, IProgressService),
    __param(7, IExtensionsWorkbenchService),
    __param(8, IDialogService)
], MarketplaceThemesPicker);
let InstalledThemesPicker = class InstalledThemesPicker {
    constructor(options, setTheme, getMarketplaceColorThemes, quickInputService, extensionGalleryService, extensionsWorkbenchService, extensionResourceLoaderService, instantiationService) {
        this.options = options;
        this.setTheme = setTheme;
        this.getMarketplaceColorThemes = getMarketplaceColorThemes;
        this.quickInputService = quickInputService;
        this.extensionGalleryService = extensionGalleryService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionResourceLoaderService = extensionResourceLoaderService;
        this.instantiationService = instantiationService;
    }
    async openQuickPick(picks, currentTheme) {
        let marketplaceThemePicker;
        if (this.extensionGalleryService.isEnabled()) {
            if (await this.extensionResourceLoaderService.supportsExtensionGalleryResources() && this.options.browseMessage) {
                marketplaceThemePicker = this.instantiationService.createInstance(MarketplaceThemesPicker, this.getMarketplaceColorThemes.bind(this), this.options.marketplaceTag);
                picks = [configurationEntry(this.options.browseMessage, ConfigureItem.BROWSE_GALLERY), ...picks];
            }
            else {
                picks = [...picks, { type: 'separator' }, configurationEntry(this.options.installMessage, ConfigureItem.EXTENSIONS_VIEW)];
            }
        }
        let selectThemeTimeout;
        const selectTheme = (theme, applyTheme) => {
            if (selectThemeTimeout) {
                clearTimeout(selectThemeTimeout);
            }
            selectThemeTimeout = mainWindow.setTimeout(() => {
                selectThemeTimeout = undefined;
                const newTheme = (theme ?? currentTheme);
                this.setTheme(newTheme, applyTheme ? 'auto' : 'preview').then(undefined, err => {
                    onUnexpectedError(err);
                    this.setTheme(currentTheme, undefined);
                });
            }, applyTheme ? 0 : 200);
        };
        const pickInstalledThemes = (activeItemId) => {
            const disposables = new DisposableStore();
            return new Promise((s, _) => {
                let isCompleted = false;
                const autoFocusIndex = picks.findIndex(p => isItem(p) && p.id === activeItemId);
                const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
                quickpick.items = picks;
                quickpick.title = this.options.title;
                quickpick.description = this.options.description;
                quickpick.placeholder = this.options.placeholderMessage;
                quickpick.activeItems = [picks[autoFocusIndex]];
                quickpick.canSelectMany = false;
                quickpick.buttons = this.options.buttons ?? [];
                disposables.add(quickpick.onDidTriggerButton(button => this.options.onButton?.(button, quickpick)));
                quickpick.matchOnDescription = true;
                disposables.add(quickpick.onDidAccept(async (_) => {
                    isCompleted = true;
                    const theme = quickpick.selectedItems[0];
                    if (!theme || theme.configureItem) { // 'pick in marketplace' entry
                        if (!theme || theme.configureItem === ConfigureItem.EXTENSIONS_VIEW) {
                            this.extensionsWorkbenchService.openSearch(`${this.options.marketplaceTag} ${quickpick.value}`);
                        }
                        else if (theme.configureItem === ConfigureItem.BROWSE_GALLERY) {
                            if (marketplaceThemePicker) {
                                const res = await marketplaceThemePicker.openQuickPick(quickpick.value, currentTheme, selectTheme);
                                if (res === 'back') {
                                    await pickInstalledThemes(undefined);
                                }
                            }
                        }
                    }
                    else {
                        selectTheme(theme.theme, true);
                    }
                    quickpick.hide();
                    s();
                }));
                disposables.add(quickpick.onDidChangeActive(themes => selectTheme(themes[0]?.theme, false)));
                disposables.add(quickpick.onDidHide(() => {
                    if (!isCompleted) {
                        selectTheme(currentTheme, true);
                        s();
                    }
                    quickpick.dispose();
                }));
                disposables.add(quickpick.onDidTriggerItemButton(e => {
                    if (isItem(e.item)) {
                        const extensionId = e.item.theme?.extensionData?.extensionId;
                        if (extensionId) {
                            this.extensionsWorkbenchService.openSearch(`@id:${extensionId}`);
                        }
                        else {
                            this.extensionsWorkbenchService.openSearch(`${this.options.marketplaceTag} ${quickpick.value}`);
                        }
                    }
                }));
                quickpick.show();
            }).finally(() => {
                disposables.dispose();
            });
        };
        await pickInstalledThemes(currentTheme.id);
        marketplaceThemePicker?.dispose();
    }
};
InstalledThemesPicker = __decorate([
    __param(3, IQuickInputService),
    __param(4, IExtensionGalleryService),
    __param(5, IExtensionsWorkbenchService),
    __param(6, IExtensionResourceLoaderService),
    __param(7, IInstantiationService)
], InstalledThemesPicker);
const SelectColorThemeCommandId = 'workbench.action.selectTheme';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SelectColorThemeCommandId,
            title: localize2('selectTheme.label', 'Color Theme'),
            category: Categories.Preferences,
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 50 /* KeyCode.KeyT */)
            }
        });
    }
    getTitle(colorScheme) {
        switch (colorScheme) {
            case ColorScheme.DARK: return localize('themes.selectTheme.darkScheme', "Select Color Theme for System Dark Mode");
            case ColorScheme.LIGHT: return localize('themes.selectTheme.lightScheme', "Select Color Theme for System Light Mode");
            case ColorScheme.HIGH_CONTRAST_DARK: return localize('themes.selectTheme.darkHC', "Select Color Theme for High Contrast Dark Mode");
            case ColorScheme.HIGH_CONTRAST_LIGHT: return localize('themes.selectTheme.lightHC', "Select Color Theme for High Contrast Light Mode");
            default:
                return localize('themes.selectTheme.default', "Select Color Theme (detect system color mode disabled)");
        }
    }
    async run(accessor) {
        const themeService = accessor.get(IWorkbenchThemeService);
        const preferencesService = accessor.get(IPreferencesService);
        const preferredColorScheme = themeService.getPreferredColorScheme();
        const modeConfigureButton = {
            tooltip: preferredColorScheme
                ? localize('themes.configure.switchingEnabled', 'Detect system color mode enabled. Click to configure.')
                : localize('themes.configure.switchingDisabled', 'Detect system color mode disabled. Click to configure.'),
            iconClass: ThemeIcon.asClassName(Codicon.colorMode),
            location: QuickInputButtonLocation.Inline
        };
        const options = {
            installMessage: localize('installColorThemes', "Install Additional Color Themes..."),
            browseMessage: '$(plus) ' + localize('browseColorThemes', "Browse Additional Color Themes..."),
            placeholderMessage: this.getTitle(preferredColorScheme),
            marketplaceTag: 'category:themes',
            buttons: [modeConfigureButton],
            onButton: async (_button, picker) => {
                picker.hide();
                await preferencesService.openSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
            }
        };
        const setTheme = (theme, settingsTarget) => themeService.setColorTheme(theme, settingsTarget);
        const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceColorThemes(publisher, name, version);
        const instantiationService = accessor.get(IInstantiationService);
        const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
        const themes = await themeService.getColorThemes();
        const currentTheme = themeService.getColorTheme();
        const lightEntries = toEntries(themes.filter(t => t.type === ColorScheme.LIGHT), localize('themes.category.light', "light themes"));
        const darkEntries = toEntries(themes.filter(t => t.type === ColorScheme.DARK), localize('themes.category.dark', "dark themes"));
        const hcEntries = toEntries(themes.filter(t => isHighContrast(t.type)), localize('themes.category.hc', "high contrast themes"));
        let picks;
        switch (preferredColorScheme) {
            case ColorScheme.DARK:
                picks = [...darkEntries, ...lightEntries, ...hcEntries];
                break;
            case ColorScheme.HIGH_CONTRAST_DARK:
            case ColorScheme.HIGH_CONTRAST_LIGHT:
                picks = [...hcEntries, ...lightEntries, ...darkEntries];
                break;
            case ColorScheme.LIGHT:
            default:
                picks = [...lightEntries, ...darkEntries, ...hcEntries];
                break;
        }
        await picker.openQuickPick(picks, currentTheme);
    }
});
const SelectFileIconThemeCommandId = 'workbench.action.selectIconTheme';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SelectFileIconThemeCommandId,
            title: localize2('selectIconTheme.label', 'File Icon Theme'),
            category: Categories.Preferences,
            f1: true
        });
    }
    async run(accessor) {
        const themeService = accessor.get(IWorkbenchThemeService);
        const options = {
            installMessage: localize('installIconThemes', "Install Additional File Icon Themes..."),
            placeholderMessage: localize('themes.selectIconTheme', "Select File Icon Theme (Up/Down Keys to Preview)"),
            marketplaceTag: 'tag:icon-theme'
        };
        const setTheme = (theme, settingsTarget) => themeService.setFileIconTheme(theme, settingsTarget);
        const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceFileIconThemes(publisher, name, version);
        const instantiationService = accessor.get(IInstantiationService);
        const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
        const picks = [
            { type: 'separator', label: localize('fileIconThemeCategory', 'file icon themes') },
            { id: '', theme: FileIconThemeData.noIconTheme, label: localize('noIconThemeLabel', 'None'), description: localize('noIconThemeDesc', 'Disable File Icons') },
            ...toEntries(await themeService.getFileIconThemes()),
        ];
        await picker.openQuickPick(picks, themeService.getFileIconTheme());
    }
});
const SelectProductIconThemeCommandId = 'workbench.action.selectProductIconTheme';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: SelectProductIconThemeCommandId,
            title: localize2('selectProductIconTheme.label', 'Product Icon Theme'),
            category: Categories.Preferences,
            f1: true
        });
    }
    async run(accessor) {
        const themeService = accessor.get(IWorkbenchThemeService);
        const options = {
            installMessage: localize('installProductIconThemes', "Install Additional Product Icon Themes..."),
            browseMessage: '$(plus) ' + localize('browseProductIconThemes', "Browse Additional Product Icon Themes..."),
            placeholderMessage: localize('themes.selectProductIconTheme', "Select Product Icon Theme (Up/Down Keys to Preview)"),
            marketplaceTag: 'tag:product-icon-theme'
        };
        const setTheme = (theme, settingsTarget) => themeService.setProductIconTheme(theme, settingsTarget);
        const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceProductIconThemes(publisher, name, version);
        const instantiationService = accessor.get(IInstantiationService);
        const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
        const picks = [
            { type: 'separator', label: localize('productIconThemeCategory', 'product icon themes') },
            { id: DEFAULT_PRODUCT_ICON_THEME_ID, theme: ProductIconThemeData.defaultTheme, label: localize('defaultProductIconThemeLabel', 'Default') },
            ...toEntries(await themeService.getProductIconThemes()),
        ];
        await picker.openQuickPick(picks, themeService.getProductIconTheme());
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.tryNewDefaultThemes',
            title: localize2('tryNewDefaultThemes', "Try New Default Themes"),
            category: Categories.Preferences,
            f1: true,
        });
    }
    async run(accessor) {
        const themeService = accessor.get(IWorkbenchThemeService);
        const quickInputService = accessor.get(IQuickInputService);
        const configurationService = accessor.get(IConfigurationService);
        const previousTheme = themeService.getColorTheme();
        const allThemes = await themeService.getColorThemes();
        const newThemeSettingsIds = new Set([ThemeSettingDefaults.COLOR_THEME_LIGHT, ThemeSettingDefaults.COLOR_THEME_DARK]);
        const themes = allThemes.filter(t => newThemeSettingsIds.has(t.settingsId));
        const items = themes.map(t => ({
            id: t.id,
            label: t.label,
            description: t.description,
        }));
        const disposables = new DisposableStore();
        const picker = disposables.add(quickInputService.createQuickPick());
        picker.items = items;
        picker.placeholder = localize('pickNewTheme', "Pick a new default theme");
        picker.canSelectMany = false;
        const preferredId = (previousTheme.type === ColorScheme.LIGHT || previousTheme.type === ColorScheme.HIGH_CONTRAST_LIGHT) ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
        const activeItem = items.find(i => themes.find(t => t.id === i.id)?.settingsId === preferredId);
        if (activeItem) {
            picker.activeItems = [activeItem];
        }
        disposables.add(picker.onDidChangeActive(selected => {
            if (selected[0]) {
                const theme = themes.find(t => t.id === selected[0].id);
                if (theme) {
                    themeService.setColorTheme(theme, 'preview');
                }
            }
        }));
        disposables.add(picker.onDidAccept(() => {
            const selected = picker.activeItems[0];
            const theme = selected ? themes.find(t => t.id === selected.id) : undefined;
            picker.hide();
            if (!theme) {
                return;
            }
            (async () => {
                try {
                    await themeService.setColorTheme(theme, 'auto');
                    await configurationService.updateValue(ThemeSettings.PREFERRED_LIGHT_THEME, ThemeSettingDefaults.COLOR_THEME_LIGHT);
                    await configurationService.updateValue(ThemeSettings.PREFERRED_DARK_THEME, ThemeSettingDefaults.COLOR_THEME_DARK);
                }
                catch (error) {
                    if (!isCancellationError(error)) {
                        onUnexpectedError(error);
                    }
                }
            })();
        }));
        const result = new Promise(resolve => {
            disposables.add(picker.onDidHide(() => {
                if (!picker.selectedItems.length) {
                    themeService.setColorTheme(previousTheme, undefined);
                }
                resolve();
            }));
        }).finally(() => disposables.dispose());
        picker.show();
        return result;
    }
});
CommandsRegistry.registerCommand('workbench.action.previewColorTheme', async function (accessor, extension, themeSettingsId) {
    const themeService = accessor.get(IWorkbenchThemeService);
    let themes = findBuiltInThemes(await themeService.getColorThemes(), extension);
    if (themes.length === 0) {
        themes = await themeService.getMarketplaceColorThemes(extension.publisher, extension.name, extension.version);
    }
    for (const theme of themes) {
        if (!themeSettingsId || theme.settingsId === themeSettingsId) {
            await themeService.setColorTheme(theme, 'preview');
            return theme.settingsId;
        }
    }
    return undefined;
});
function findBuiltInThemes(themes, extension) {
    return themes.filter(({ extensionData }) => extensionData && extensionData.extensionIsBuiltin && equalsIgnoreCase(extensionData.extensionPublisher, extension.publisher) && equalsIgnoreCase(extensionData.extensionName, extension.name));
}
function configurationEntry(label, configureItem) {
    return {
        id: undefined,
        label: label,
        alwaysShow: true,
        buttons: [configureButton],
        configureItem: configureItem
    };
}
function isItem(i) {
    // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
    return i['type'] !== 'separator';
}
const defaultThemeDescriptions = {
    [ThemeSettingDefaults.COLOR_THEME_LIGHT]: localize('defaultLight', "Default Light"),
    [ThemeSettingDefaults.COLOR_THEME_DARK]: localize('defaultDark', "Default Dark"),
};
function toEntry(theme) {
    const settingId = theme.settingsId ?? undefined;
    const item = {
        id: theme.id,
        theme: theme,
        label: theme.label,
        description: defaultThemeDescriptions[settingId ?? ''] ?? theme.description ?? (theme.label === settingId ? undefined : settingId),
    };
    if (theme.extensionData) {
        item.buttons = [configureButton];
    }
    return item;
}
function toEntries(themes, label) {
    const pinnedIds = new Set([ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT]);
    const sorter = (t1, t2) => {
        const pin1 = pinnedIds.has(t1.theme?.settingsId ?? '');
        const pin2 = pinnedIds.has(t2.theme?.settingsId ?? '');
        if (pin1 !== pin2) {
            return pin1 ? -1 : 1;
        }
        return t1.label.localeCompare(t2.label);
    };
    const entries = themes.map(toEntry).sort(sorter);
    if (entries.length > 0 && label) {
        entries.unshift({ type: 'separator', label });
    }
    return entries;
}
const configureButton = {
    iconClass: ThemeIcon.asClassName(manageExtensionIcon),
    tooltip: localize('manage extension', "Manage Extension"),
};
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.generateColorTheme',
            title: localize2('generateColorTheme.label', 'Generate Color Theme From Current Settings'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const themeService = accessor.get(IWorkbenchThemeService);
        const theme = themeService.getColorTheme();
        const colors = Registry.as(ColorRegistryExtensions.ColorContribution).getColors();
        const colorIds = colors.filter(c => !c.deprecationMessage).map(c => c.id).sort();
        const resultingColors = {};
        const inherited = [];
        for (const colorId of colorIds) {
            const color = theme.getColor(colorId, false);
            if (color) {
                resultingColors[colorId] = Color.Format.CSS.formatHexA(color, true);
            }
            else {
                inherited.push(colorId);
            }
        }
        const nullDefaults = [];
        for (const id of inherited) {
            const color = theme.getColor(id);
            if (color) {
                resultingColors['__' + id] = Color.Format.CSS.formatHexA(color, true);
            }
            else {
                nullDefaults.push(id);
            }
        }
        for (const id of nullDefaults) {
            resultingColors['__' + id] = null;
        }
        let contents = JSON.stringify({
            '$schema': colorThemeSchemaId,
            type: theme.type,
            colors: resultingColors,
            tokenColors: theme.tokenColors.filter(t => !!t.scope)
        }, null, '\t');
        contents = contents.replace(/\"__/g, '//"');
        const editorService = accessor.get(IEditorService);
        return editorService.openEditor({ resource: undefined, contents, languageId: 'jsonc', options: { pinned: true } });
    }
});
const toggleLightDarkThemesCommandId = 'workbench.action.toggleLightDarkThemes';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: toggleLightDarkThemesCommandId,
            title: localize2('toggleLightDarkThemes.label', 'Toggle between Light/Dark Themes'),
            category: Categories.Preferences,
            f1: true,
        });
    }
    async run(accessor) {
        const themeService = accessor.get(IWorkbenchThemeService);
        const configurationService = accessor.get(IConfigurationService);
        const notificationService = accessor.get(INotificationService);
        const preferencesService = accessor.get(IPreferencesService);
        if (configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
            const message = localize({ key: 'cannotToggle', comment: ['{0} is a setting name'] }, "Cannot toggle between light and dark themes when `{0}` is enabled in settings.", ThemeSettings.DETECT_COLOR_SCHEME);
            notificationService.prompt(Severity.Info, message, [
                {
                    label: localize('goToSetting', "Open Settings"),
                    run: () => {
                        return preferencesService.openUserSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
                    }
                }
            ]);
            return;
        }
        const currentTheme = themeService.getColorTheme();
        let newSettingsId = ThemeSettings.PREFERRED_DARK_THEME;
        switch (currentTheme.type) {
            case ColorScheme.LIGHT:
                newSettingsId = ThemeSettings.PREFERRED_DARK_THEME;
                break;
            case ColorScheme.DARK:
                newSettingsId = ThemeSettings.PREFERRED_LIGHT_THEME;
                break;
            case ColorScheme.HIGH_CONTRAST_LIGHT:
                newSettingsId = ThemeSettings.PREFERRED_HC_DARK_THEME;
                break;
            case ColorScheme.HIGH_CONTRAST_DARK:
                newSettingsId = ThemeSettings.PREFERRED_HC_LIGHT_THEME;
                break;
        }
        const themeSettingId = configurationService.getValue(newSettingsId);
        if (themeSettingId && typeof themeSettingId === 'string') {
            const theme = (await themeService.getColorThemes()).find(t => t.settingsId === themeSettingId);
            if (theme) {
                themeService.setColorTheme(theme.id, 'auto');
            }
        }
    }
});
const browseColorThemesInMarketplaceCommandId = 'workbench.action.browseColorThemesInMarketplace';
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: browseColorThemesInMarketplaceCommandId,
            title: localize2('browseColorThemeInMarketPlace.label', 'Browse Color Themes in Marketplace'),
            category: Categories.Preferences,
            f1: true,
        });
    }
    async run(accessor) {
        const marketplaceTag = 'category:themes';
        const themeService = accessor.get(IWorkbenchThemeService);
        const extensionGalleryService = accessor.get(IExtensionGalleryService);
        const extensionResourceLoaderService = accessor.get(IExtensionResourceLoaderService);
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const instantiationService = accessor.get(IInstantiationService);
        if (!extensionGalleryService.isEnabled()) {
            return;
        }
        if (!await extensionResourceLoaderService.supportsExtensionGalleryResources()) {
            await extensionsWorkbenchService.openSearch(marketplaceTag);
            return;
        }
        const currentTheme = themeService.getColorTheme();
        const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceColorThemes(publisher, name, version);
        let selectThemeTimeout;
        const selectTheme = (theme, applyTheme) => {
            if (selectThemeTimeout) {
                clearTimeout(selectThemeTimeout);
            }
            selectThemeTimeout = mainWindow.setTimeout(() => {
                selectThemeTimeout = undefined;
                const newTheme = (theme ?? currentTheme);
                themeService.setColorTheme(newTheme, applyTheme ? 'auto' : 'preview').then(undefined, err => {
                    onUnexpectedError(err);
                    themeService.setColorTheme(currentTheme, undefined);
                });
            }, applyTheme ? 0 : 200);
        };
        const marketplaceThemePicker = instantiationService.createInstance(MarketplaceThemesPicker, getMarketplaceColorThemes, marketplaceTag);
        await marketplaceThemePicker.openQuickPick('', themeService.getColorTheme(), selectTheme).then(undefined, onUnexpectedError);
    }
});
const ThemesSubMenu = new MenuId('ThemesSubMenu');
MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
    title: localize('themes', "Themes"),
    submenu: ThemesSubMenu,
    group: '2_configuration',
    order: 7
});
MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
    title: localize({ key: 'miSelectTheme', comment: ['&& denotes a mnemonic'] }, "&&Themes"),
    submenu: ThemesSubMenu,
    group: '2_configuration',
    order: 7
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
    command: {
        id: SelectColorThemeCommandId,
        title: localize('selectTheme.label', 'Color Theme')
    },
    order: 1
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
    command: {
        id: SelectFileIconThemeCommandId,
        title: localize('themes.selectIconTheme.label', "File Icon Theme")
    },
    order: 2
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
    command: {
        id: SelectProductIconThemeCommandId,
        title: localize('themes.selectProductIconTheme.label', "Product Icon Theme")
    },
    order: 3
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVzLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3RoZW1lcy9icm93c2VyL3RoZW1lcy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQVUsUUFBUSxFQUFXLE1BQU0scUNBQXFDLENBQUM7QUFDaEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBZ0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxzQkFBc0IsRUFBa0gsYUFBYSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDdlAsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLDJCQUEyQixFQUFxQixNQUFNLHdFQUF3RSxDQUFDO0FBQ2xLLE9BQU8sRUFBa0IsVUFBVSxJQUFJLHVCQUF1QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDM0gsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3pGLE9BQU8sRUFB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