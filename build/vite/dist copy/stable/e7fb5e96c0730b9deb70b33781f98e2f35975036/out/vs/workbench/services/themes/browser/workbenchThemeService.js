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
var WorkbenchThemeService_1;
import * as nls from '../../../../nls.js';
import * as types from '../../../../base/common/types.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IWorkbenchThemeService, ExtensionData, ThemeSettings, ThemeSettingDefaults, COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS, migrateThemeSettingsId } from '../common/workbenchThemeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import * as errors from '../../../../base/common/errors.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ColorThemeData } from '../common/colorThemeData.js';
import { Extensions as ThemingExtensions } from '../../../../platform/theme/common/themeService.js';
import { Emitter } from '../../../../base/common/event.js';
import { registerFileIconThemeSchemas } from '../common/fileIconThemeSchema.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileIconThemeData, FileIconThemeLoader } from './fileIconThemeData.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import * as resources from '../../../../base/common/resources.js';
import { registerColorThemeSchemas } from '../common/colorThemeSchema.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { getRemoteAuthority } from '../../../../platform/remote/common/remoteHosts.js';
import { IWorkbenchLayoutService } from '../../layout/browser/layoutService.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { ThemeRegistry, registerColorThemeExtensionPoint, registerFileIconThemeExtensionPoint, registerProductIconThemeExtensionPoint } from '../common/themeExtensionPoints.js';
import { updateColorThemeConfigurationSchemas, updateFileIconThemeConfigurationSchemas, ThemeConfiguration, updateProductIconThemeConfigurationSchemas } from '../common/themeConfiguration.js';
import { ProductIconThemeData, DEFAULT_PRODUCT_ICON_THEME_ID } from './productIconThemeData.js';
import { registerProductIconThemeSchemas } from '../common/productIconThemeSchema.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ColorScheme, ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';
import { IHostColorSchemeService } from '../common/hostColorSchemeService.js';
import { RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { IUserDataInitializationService } from '../../userData/browser/userDataInit.js';
import { getIconsStyleSheet } from '../../../../platform/theme/browser/iconsStyleSheet.js';
import { getColorRegistry } from '../../../../platform/theme/common/colorRegistry.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { generateColorThemeCSS } from './colorThemeCss.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IHostService } from '../../host/browser/host.js';
import { toAction } from '../../../../base/common/actions.js';
// implementation
const defaultThemeExtensionId = 'vscode-theme-defaults';
const DEFAULT_FILE_ICON_THEME_ID = 'vscode.vscode-theme-seti-vs-seti';
const fileIconsEnabledClass = 'file-icons-enabled';
const colorThemeRulesClassName = 'contributedColorTheme';
const fileIconThemeRulesClassName = 'contributedFileIconTheme';
const productIconThemeRulesClassName = 'contributedProductIconTheme';
const themingRegistry = Registry.as(ThemingExtensions.ThemingContribution);
function validateThemeId(theme) {
    // migrations
    switch (theme) {
        case ThemeTypeSelector.VS: return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
        case ThemeTypeSelector.VS_DARK: return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
        case ThemeTypeSelector.HC_BLACK: return `hc-black ${defaultThemeExtensionId}-themes-hc_black-json`;
        case ThemeTypeSelector.HC_LIGHT: return `hc-light ${defaultThemeExtensionId}-themes-hc_light-json`;
    }
    return theme;
}
const colorThemesExtPoint = registerColorThemeExtensionPoint();
const fileIconThemesExtPoint = registerFileIconThemeExtensionPoint();
const productIconThemesExtPoint = registerProductIconThemeExtensionPoint();
let WorkbenchThemeService = class WorkbenchThemeService extends Disposable {
    static { WorkbenchThemeService_1 = this; }
    constructor(extensionService, storageService, configurationService, telemetryService, environmentService, fileService, extensionResourceLoaderService, layoutService, logService, hostColorService, userDataInitializationService, languageService, notificationService, hostService) {
        super();
        this.storageService = storageService;
        this.configurationService = configurationService;
        this.telemetryService = telemetryService;
        this.environmentService = environmentService;
        this.extensionResourceLoaderService = extensionResourceLoaderService;
        this.logService = logService;
        this.hostColorService = hostColorService;
        this.userDataInitializationService = userDataInitializationService;
        this.languageService = languageService;
        this.notificationService = notificationService;
        this.hostService = hostService;
        this.themeExtensionsActivated = new Map();
        this.container = layoutService.mainContainer;
        this.settings = new ThemeConfiguration(configurationService, hostColorService);
        this.colorThemeRegistry = this._register(new ThemeRegistry(colorThemesExtPoint, ColorThemeData.fromExtensionTheme));
        this.colorThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentColorTheme.bind(this)));
        this.onColorThemeChange = this._register(new Emitter({ leakWarningThreshold: 400 }));
        this.currentColorTheme = ColorThemeData.createUnloadedTheme('');
        this.colorThemeSequencer = new Sequencer();
        this.fileIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentFileIconTheme.bind(this)));
        this.fileIconThemeRegistry = this._register(new ThemeRegistry(fileIconThemesExtPoint, FileIconThemeData.fromExtensionTheme, true, FileIconThemeData.noIconTheme));
        this.fileIconThemeLoader = new FileIconThemeLoader(extensionResourceLoaderService, languageService);
        this.onFileIconThemeChange = this._register(new Emitter({ leakWarningThreshold: 400 }));
        this.currentFileIconTheme = FileIconThemeData.createUnloadedTheme('');
        this.fileIconThemeSequencer = new Sequencer();
        this.productIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentProductIconTheme.bind(this)));
        this.productIconThemeRegistry = this._register(new ThemeRegistry(productIconThemesExtPoint, ProductIconThemeData.fromExtensionTheme, true, ProductIconThemeData.defaultTheme));
        this.onProductIconThemeChange = this._register(new Emitter());
        this.currentProductIconTheme = ProductIconThemeData.createUnloadedTheme('');
        this.productIconThemeSequencer = new Sequencer();
        this._register(this.onDidColorThemeChange(theme => getColorRegistry().notifyThemeUpdate(theme)));
        // In order to avoid paint flashing for tokens, because
        // themes are loaded asynchronously, we need to initialize
        // a color theme document with good defaults until the theme is loaded
        let themeData = ColorThemeData.fromStorageData(this.storageService);
        const previousColorThemeSetting = themeData?.settingsId;
        const colorThemeSetting = this.settings.colorTheme;
        if (themeData && colorThemeSetting !== themeData.settingsId) {
            themeData = undefined;
        }
        const defaultColorMap = colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_LIGHT ? COLOR_THEME_LIGHT_INITIAL_COLORS : colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_DARK ? COLOR_THEME_DARK_INITIAL_COLORS : undefined;
        if (!themeData) {
            const initialColorTheme = environmentService.options?.initialColorTheme;
            if (initialColorTheme) {
                themeData = ColorThemeData.createUnloadedThemeForThemeType(initialColorTheme.themeType, initialColorTheme.colors ?? defaultColorMap);
            }
        }
        if (!themeData) {
            const colorScheme = this.settings.getPreferredColorScheme() ?? (isWeb ? ColorScheme.LIGHT : ColorScheme.DARK);
            themeData = ColorThemeData.createUnloadedThemeForThemeType(colorScheme, defaultColorMap);
        }
        themeData.setCustomizations(this.settings);
        this.applyTheme(themeData, undefined, true);
        const fileIconData = FileIconThemeData.fromStorageData(this.storageService);
        if (fileIconData) {
            this.applyAndSetFileIconTheme(fileIconData, true);
        }
        const productIconData = ProductIconThemeData.fromStorageData(this.storageService);
        if (productIconData) {
            this.applyAndSetProductIconTheme(productIconData, true);
        }
        extensionService.whenInstalledExtensionsRegistered().then(_ => {
            this.installConfigurationListener();
            this.installPreferredSchemeListener();
            this.installRegistryListeners();
            this.initialize(previousColorThemeSetting).catch(errors.onUnexpectedError);
        });
        const codiconStyleSheet = createStyleSheet();
        codiconStyleSheet.id = 'codiconStyles';
        const iconsStyleSheet = this._register(getIconsStyleSheet(this));
        function updateAll() {
            codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
        }
        const delayer = this._register(new RunOnceScheduler(updateAll, 0));
        this._register(iconsStyleSheet.onDidChange(() => delayer.schedule()));
        delayer.schedule();
    }
    async initialize(themePreviousSettingsId) {
        const extDevLocs = this.environmentService.extensionDevelopmentLocationURI;
        const extDevLoc = extDevLocs && extDevLocs.length === 1 ? extDevLocs[0] : undefined; // in dev mode, switch to a theme provided by the extension under dev.
        const initializeColorTheme = async () => {
            const devThemes = this.colorThemeRegistry.findThemeByExtensionLocation(extDevLoc);
            if (devThemes.length) {
                const matchedColorTheme = devThemes.find(theme => theme.type === this.currentColorTheme.type);
                return this.setColorTheme(matchedColorTheme ? matchedColorTheme.id : devThemes[0].id, undefined);
            }
            let theme = this.colorThemeRegistry.findThemeBySettingsId(this.settings.colorTheme, undefined);
            if (!theme) {
                // If the current theme is not available, first make sure setting sync is complete
                await this.userDataInitializationService.whenInitializationFinished();
                // try to get the theme again, now with a fallback to the default themes
                const fallbackTheme = this.currentColorTheme.type === ColorScheme.LIGHT ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
                theme = this.colorThemeRegistry.findThemeBySettingsId(this.settings.colorTheme, fallbackTheme);
            }
            return this.setColorTheme(theme && theme.id, undefined);
        };
        const initializeFileIconTheme = async () => {
            const devThemes = this.fileIconThemeRegistry.findThemeByExtensionLocation(extDevLoc);
            if (devThemes.length) {
                return this.setFileIconTheme(devThemes[0].id, 8 /* ConfigurationTarget.MEMORY */);
            }
            let theme = this.fileIconThemeRegistry.findThemeBySettingsId(this.settings.fileIconTheme);
            if (!theme) {
                // If the current theme is not available, first make sure setting sync is complete
                await this.userDataInitializationService.whenInitializationFinished();
                theme = this.fileIconThemeRegistry.findThemeBySettingsId(this.settings.fileIconTheme);
            }
            return this.setFileIconTheme(theme ? theme.id : DEFAULT_FILE_ICON_THEME_ID, undefined);
        };
        const initializeProductIconTheme = async () => {
            const devThemes = this.productIconThemeRegistry.findThemeByExtensionLocation(extDevLoc);
            if (devThemes.length) {
                return this.setProductIconTheme(devThemes[0].id, 8 /* ConfigurationTarget.MEMORY */);
            }
            let theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
            if (!theme) {
                // If the current theme is not available, first make sure setting sync is complete
                await this.userDataInitializationService.whenInitializationFinished();
                theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
            }
            return this.setProductIconTheme(theme ? theme.id : DEFAULT_PRODUCT_ICON_THEME_ID, undefined);
        };
        this.migrateColorThemeSettings();
        const result = await Promise.all([initializeColorTheme(), initializeFileIconTheme(), initializeProductIconTheme()]);
        await this.showNewDefaultThemeNotification(themePreviousSettingsId);
        return result;
    }
    static { this.NEW_THEME_NOTIFICATION_KEY = 'workbench.newDefaultThemeNotification'; }
    async showNewDefaultThemeNotification(previousSettingsId) {
        if (this.storageService.getBoolean(WorkbenchThemeService_1.NEW_THEME_NOTIFICATION_KEY, -1 /* StorageScope.APPLICATION */)) {
            return; // already shown
        }
        if (!(await this.hostService.hadLastFocus()) || this.environmentService.isSessionsWindow) {
            return;
        }
        try {
            if (!this.settings.isDefaultColorTheme() || !previousSettingsId) {
                return;
            }
            previousSettingsId = migrateThemeSettingsId(previousSettingsId);
            if (!['Dark Modern', 'Light Modern'].includes(previousSettingsId)) {
                return;
            }
            if (![ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT].includes(this.settings.colorTheme)) {
                return;
            }
        }
        finally {
            // remeber to not show the dialog again
            this.storageService.store(WorkbenchThemeService_1.NEW_THEME_NOTIFICATION_KEY, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        }
        const keepTheme = await new Promise(resolve => {
            this.notificationService.prompt(Severity.Info, nls.localize({ key: 'themeUpdatedNotification', comment: ['{0} is the name of the new default theme'] }, "VS Code has a new default theme: '{0}'.", this.getColorTheme().label), [
                toAction({
                    id: 'themeUpdated.tryItOut',
                    label: nls.localize('tryNewTheme', "Keep It"),
                    run: () => resolve(true)
                }),
                toAction({
                    id: 'themeUpdated.noThanks',
                    label: nls.localize('noThanks', "No Thanks"),
                    run: () => resolve(false)
                })
            ], {
                onCancel: () => resolve(false)
            });
        });
        if (!keepTheme) {
            const previousTheme = this.colorThemeRegistry.findThemeBySettingsId(previousSettingsId);
            if (previousTheme) {
                this.setColorTheme(previousTheme.id, 'auto');
            }
        }
    }
    /**
     * Migrates legacy theme setting values to their current equivalents,
     * writing back the migrated value so settings sync distributes the correct ID.
     */
    migrateColorThemeSettings() {
        const themeSettings = [
            ThemeSettings.COLOR_THEME,
            ThemeSettings.PREFERRED_DARK_THEME,
            ThemeSettings.PREFERRED_LIGHT_THEME,
            ThemeSettings.PREFERRED_HC_DARK_THEME,
            ThemeSettings.PREFERRED_HC_LIGHT_THEME,
        ];
        for (const key of themeSettings) {
            const inspection = this.configurationService.inspect(key);
            for (const [target, value] of [
                [2 /* ConfigurationTarget.USER */, inspection.userValue],
                [4 /* ConfigurationTarget.USER_REMOTE */, inspection.userRemoteValue],
                [5 /* ConfigurationTarget.WORKSPACE */, inspection.workspaceValue],
            ]) {
                if (value) {
                    const migrated = migrateThemeSettingsId(value);
                    if (migrated !== value) {
                        this.configurationService.updateValue(key, migrated, target);
                    }
                }
            }
        }
    }
    installConfigurationListener() {
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(ThemeSettings.COLOR_THEME)
                || e.affectsConfiguration(ThemeSettings.PREFERRED_DARK_THEME)
                || e.affectsConfiguration(ThemeSettings.PREFERRED_LIGHT_THEME)
                || e.affectsConfiguration(ThemeSettings.PREFERRED_HC_DARK_THEME)
                || e.affectsConfiguration(ThemeSettings.PREFERRED_HC_LIGHT_THEME)
                || e.affectsConfiguration(ThemeSettings.DETECT_COLOR_SCHEME)
                || e.affectsConfiguration(ThemeSettings.DETECT_HC)
                || e.affectsConfiguration(ThemeSettings.SYSTEM_COLOR_THEME)) {
                this.restoreColorTheme();
            }
            if (e.affectsConfiguration(ThemeSettings.FILE_ICON_THEME)) {
                this.restoreFileIconTheme();
            }
            if (e.affectsConfiguration(ThemeSettings.PRODUCT_ICON_THEME)) {
                this.restoreProductIconTheme();
            }
            if (this.currentColorTheme) {
                let hasColorChanges = false;
                if (e.affectsConfiguration(ThemeSettings.COLOR_CUSTOMIZATIONS)) {
                    this.currentColorTheme.setCustomColors(this.settings.colorCustomizations);
                    hasColorChanges = true;
                }
                if (e.affectsConfiguration(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS)) {
                    this.currentColorTheme.setCustomTokenColors(this.settings.tokenColorCustomizations);
                    hasColorChanges = true;
                }
                if (e.affectsConfiguration(ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS)) {
                    this.currentColorTheme.setCustomSemanticTokenColors(this.settings.semanticTokenColorCustomizations);
                    hasColorChanges = true;
                }
                if (hasColorChanges) {
                    this.updateDynamicCSSRules(this.currentColorTheme);
                    this.onColorThemeChange.fire(this.currentColorTheme);
                }
            }
        }));
    }
    installRegistryListeners() {
        let prevColorId = undefined;
        // update settings schema setting for theme specific settings
        this._register(this.colorThemeRegistry.onDidChange(async (event) => {
            updateColorThemeConfigurationSchemas(event.themes);
            if (await this.restoreColorTheme()) { // checks if theme from settings exists and is set
                // restore theme
                if (this.currentColorTheme.settingsId === ThemeSettingDefaults.COLOR_THEME_DARK && !types.isUndefined(prevColorId) && await this.colorThemeRegistry.findThemeById(prevColorId)) {
                    await this.setColorTheme(prevColorId, 'auto');
                    prevColorId = undefined;
                }
                else if (event.added.some(t => t.settingsId === this.currentColorTheme.settingsId)) {
                    await this.reloadCurrentColorTheme();
                }
            }
            else if (event.removed.some(t => t.settingsId === this.currentColorTheme.settingsId)) {
                // current theme is no longer available
                prevColorId = this.currentColorTheme.id;
                const defaultTheme = this.colorThemeRegistry.findThemeBySettingsId(ThemeSettingDefaults.COLOR_THEME_DARK);
                await this.setColorTheme(defaultTheme, 'auto');
            }
        }));
        let prevFileIconId = undefined;
        this._register(this._register(this.fileIconThemeRegistry.onDidChange(async (event) => {
            updateFileIconThemeConfigurationSchemas(event.themes);
            if (await this.restoreFileIconTheme()) { // checks if theme from settings exists and is set
                // restore theme
                if (this.currentFileIconTheme.id === DEFAULT_FILE_ICON_THEME_ID && !types.isUndefined(prevFileIconId) && this.fileIconThemeRegistry.findThemeById(prevFileIconId)) {
                    await this.setFileIconTheme(prevFileIconId, 'auto');
                    prevFileIconId = undefined;
                }
                else if (event.added.some(t => t.settingsId === this.currentFileIconTheme.settingsId)) {
                    await this.reloadCurrentFileIconTheme();
                }
            }
            else if (event.removed.some(t => t.settingsId === this.currentFileIconTheme.settingsId)) {
                // current theme is no longer available
                prevFileIconId = this.currentFileIconTheme.id;
                await this.setFileIconTheme(DEFAULT_FILE_ICON_THEME_ID, 'auto');
            }
        })));
        let prevProductIconId = undefined;
        this._register(this.productIconThemeRegistry.onDidChange(async (event) => {
            updateProductIconThemeConfigurationSchemas(event.themes);
            if (await this.restoreProductIconTheme()) { // checks if theme from settings exists and is set
                // restore theme
                if (this.currentProductIconTheme.id === DEFAULT_PRODUCT_ICON_THEME_ID && !types.isUndefined(prevProductIconId) && this.productIconThemeRegistry.findThemeById(prevProductIconId)) {
                    await this.setProductIconTheme(prevProductIconId, 'auto');
                    prevProductIconId = undefined;
                }
                else if (event.added.some(t => t.settingsId === this.currentProductIconTheme.settingsId)) {
                    await this.reloadCurrentProductIconTheme();
                }
            }
            else if (event.removed.some(t => t.settingsId === this.currentProductIconTheme.settingsId)) {
                // current theme is no longer available
                prevProductIconId = this.currentProductIconTheme.id;
                await this.setProductIconTheme(DEFAULT_PRODUCT_ICON_THEME_ID, 'auto');
            }
        }));
        this._register(this.languageService.onDidChange(() => this.reloadCurrentFileIconTheme()));
        return Promise.all([this.getColorThemes(), this.getFileIconThemes(), this.getProductIconThemes()]).then(([ct, fit, pit]) => {
            updateColorThemeConfigurationSchemas(ct);
            updateFileIconThemeConfigurationSchemas(fit);
            updateProductIconThemeConfigurationSchemas(pit);
        });
    }
    // preferred scheme handling
    installPreferredSchemeListener() {
        this._register(this.hostColorService.onDidChangeColorScheme(() => {
            if (this.settings.isDetectingColorScheme()) {
                this.restoreColorTheme();
            }
        }));
    }
    getColorTheme() {
        return this.currentColorTheme;
    }
    async getColorThemes() {
        return this.colorThemeRegistry.getThemes();
    }
    getPreferredColorScheme() {
        return this.settings.getPreferredColorScheme();
    }
    async getMarketplaceColorThemes(publisher, name, version) {
        const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, 'extension');
        if (extensionLocation) {
            try {
                const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, 'package.json'));
                return this.colorThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
            }
            catch (e) {
                this.logService.error('Problem loading themes from marketplace', e);
            }
        }
        return [];
    }
    get onDidColorThemeChange() {
        return this.onColorThemeChange.event;
    }
    setColorTheme(themeIdOrTheme, settingsTarget) {
        return this.colorThemeSequencer.queue(async () => {
            return this.internalSetColorTheme(themeIdOrTheme, settingsTarget);
        });
    }
    async internalSetColorTheme(themeIdOrTheme, settingsTarget) {
        if (!themeIdOrTheme) {
            return null;
        }
        const themeId = types.isString(themeIdOrTheme) ? validateThemeId(themeIdOrTheme) : themeIdOrTheme.id;
        if (this.currentColorTheme.isLoaded && themeId === this.currentColorTheme.id) {
            if (settingsTarget !== 'preview') {
                this.currentColorTheme.toStorage(this.storageService);
            }
            return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
        }
        let themeData = this.colorThemeRegistry.findThemeById(themeId);
        if (!themeData) {
            if (themeIdOrTheme instanceof ColorThemeData) {
                themeData = themeIdOrTheme;
            }
            else {
                return null;
            }
        }
        try {
            await themeData.ensureLoaded(this.extensionResourceLoaderService);
            themeData.setCustomizations(this.settings);
            return this.applyTheme(themeData, settingsTarget);
        }
        catch (error) {
            throw new Error(nls.localize('error.cannotloadtheme', "Unable to load {0}: {1}", themeData.location?.toString(), error.message));
        }
    }
    reloadCurrentColorTheme() {
        return this.colorThemeSequencer.queue(async () => {
            try {
                const theme = this.colorThemeRegistry.findThemeBySettingsId(this.currentColorTheme.settingsId) || this.currentColorTheme;
                await theme.reload(this.extensionResourceLoaderService);
                theme.setCustomizations(this.settings);
                await this.applyTheme(theme, undefined, false);
            }
            catch (error) {
                this.logService.info('Unable to reload {0}: {1}', this.currentColorTheme.location?.toString());
            }
        });
    }
    async restoreColorTheme() {
        return this.colorThemeSequencer.queue(async () => {
            const settingId = this.settings.colorTheme;
            const theme = this.colorThemeRegistry.findThemeBySettingsId(settingId);
            if (theme) {
                if (settingId !== this.currentColorTheme.settingsId) {
                    await this.internalSetColorTheme(theme.id, undefined);
                }
                else if (theme !== this.currentColorTheme) {
                    await theme.ensureLoaded(this.extensionResourceLoaderService);
                    theme.setCustomizations(this.settings);
                    await this.applyTheme(theme, undefined, true);
                }
                return true;
            }
            return false;
        });
    }
    updateDynamicCSSRules(themeData) {
        const css = generateColorThemeCSS(themeData, '.monaco-workbench', themingRegistry.getThemingParticipants(), this.environmentService);
        _applyRules(css.code, colorThemeRulesClassName);
    }
    applyTheme(newTheme, settingsTarget, silent = false) {
        this.updateDynamicCSSRules(newTheme);
        if (this.currentColorTheme.id) {
            this.container.classList.remove(...this.currentColorTheme.classNames);
        }
        else {
            this.container.classList.remove(ThemeTypeSelector.VS, ThemeTypeSelector.VS_DARK, ThemeTypeSelector.HC_BLACK, ThemeTypeSelector.HC_LIGHT);
        }
        this.container.classList.add(...newTheme.classNames);
        this.currentColorTheme.clearCaches();
        this.currentColorTheme = newTheme;
        if (!this.colorThemingParticipantChangeListener) {
            this.colorThemingParticipantChangeListener = themingRegistry.onThemingParticipantAdded(_ => this.updateDynamicCSSRules(this.currentColorTheme));
        }
        this.colorThemeWatcher.update(newTheme);
        this.sendTelemetry(newTheme.id, newTheme.extensionData, 'color');
        if (silent) {
            return Promise.resolve(null);
        }
        this.onColorThemeChange.fire(this.currentColorTheme);
        // remember theme data for a quick restore
        if (newTheme.isLoaded && settingsTarget !== 'preview') {
            newTheme.toStorage(this.storageService);
        }
        return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
    }
    sendTelemetry(themeId, themeData, themeType) {
        if (themeData) {
            const key = themeType + themeData.extensionId;
            if (!this.themeExtensionsActivated.get(key)) {
                this.telemetryService.publicLog2('activateThemeExtension', {
                    id: themeData.extensionId,
                    name: themeData.extensionName,
                    isBuiltin: themeData.extensionIsBuiltin,
                    publisherDisplayName: themeData.extensionPublisher,
                    themeId: themeId
                });
                this.themeExtensionsActivated.set(key, true);
            }
        }
    }
    async getFileIconThemes() {
        return this.fileIconThemeRegistry.getThemes();
    }
    getFileIconTheme() {
        return this.currentFileIconTheme;
    }
    get onDidFileIconThemeChange() {
        return this.onFileIconThemeChange.event;
    }
    async setFileIconTheme(iconThemeOrId, settingsTarget) {
        return this.fileIconThemeSequencer.queue(async () => {
            return this.internalSetFileIconTheme(iconThemeOrId, settingsTarget);
        });
    }
    async internalSetFileIconTheme(iconThemeOrId, settingsTarget) {
        if (iconThemeOrId === undefined) {
            iconThemeOrId = '';
        }
        const themeId = types.isString(iconThemeOrId) ? iconThemeOrId : iconThemeOrId.id;
        if (themeId !== this.currentFileIconTheme.id || !this.currentFileIconTheme.isLoaded) {
            let newThemeData = this.fileIconThemeRegistry.findThemeById(themeId);
            if (!newThemeData && iconThemeOrId instanceof FileIconThemeData) {
                newThemeData = iconThemeOrId;
            }
            if (!newThemeData) {
                newThemeData = FileIconThemeData.noIconTheme;
            }
            await newThemeData.ensureLoaded(this.fileIconThemeLoader);
            this.applyAndSetFileIconTheme(newThemeData); // updates this.currentFileIconTheme
        }
        const themeData = this.currentFileIconTheme;
        // remember theme data for a quick restore
        if (themeData.isLoaded && settingsTarget !== 'preview' && (!themeData.location || !getRemoteAuthority(themeData.location))) {
            themeData.toStorage(this.storageService);
        }
        await this.settings.setFileIconTheme(this.currentFileIconTheme, settingsTarget);
        return themeData;
    }
    async getMarketplaceFileIconThemes(publisher, name, version) {
        const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, 'extension');
        if (extensionLocation) {
            try {
                const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, 'package.json'));
                return this.fileIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
            }
            catch (e) {
                this.logService.error('Problem loading themes from marketplace', e);
            }
        }
        return [];
    }
    async reloadCurrentFileIconTheme() {
        return this.fileIconThemeSequencer.queue(async () => {
            await this.currentFileIconTheme.reload(this.fileIconThemeLoader);
            this.applyAndSetFileIconTheme(this.currentFileIconTheme);
        });
    }
    async restoreFileIconTheme() {
        return this.fileIconThemeSequencer.queue(async () => {
            const settingId = this.settings.fileIconTheme;
            const theme = this.fileIconThemeRegistry.findThemeBySettingsId(settingId);
            if (theme) {
                if (settingId !== this.currentFileIconTheme.settingsId) {
                    await this.internalSetFileIconTheme(theme.id, undefined);
                }
                else if (theme !== this.currentFileIconTheme) {
                    await theme.ensureLoaded(this.fileIconThemeLoader);
                    this.applyAndSetFileIconTheme(theme, true);
                }
                return true;
            }
            return false;
        });
    }
    applyAndSetFileIconTheme(iconThemeData, silent = false) {
        this.currentFileIconTheme = iconThemeData;
        _applyRules(iconThemeData.styleSheetContent, fileIconThemeRulesClassName);
        if (iconThemeData.id) {
            this.container.classList.add(fileIconsEnabledClass);
        }
        else {
            this.container.classList.remove(fileIconsEnabledClass);
        }
        this.fileIconThemeWatcher.update(iconThemeData);
        if (iconThemeData.id) {
            this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, 'fileIcon');
        }
        if (!silent) {
            this.onFileIconThemeChange.fire(this.currentFileIconTheme);
        }
    }
    async getProductIconThemes() {
        return this.productIconThemeRegistry.getThemes();
    }
    getProductIconTheme() {
        return this.currentProductIconTheme;
    }
    get onDidProductIconThemeChange() {
        return this.onProductIconThemeChange.event;
    }
    async setProductIconTheme(iconThemeOrId, settingsTarget) {
        return this.productIconThemeSequencer.queue(async () => {
            return this.internalSetProductIconTheme(iconThemeOrId, settingsTarget);
        });
    }
    async internalSetProductIconTheme(iconThemeOrId, settingsTarget) {
        if (iconThemeOrId === undefined) {
            iconThemeOrId = '';
        }
        const themeId = types.isString(iconThemeOrId) ? iconThemeOrId : iconThemeOrId.id;
        if (themeId !== this.currentProductIconTheme.id || !this.currentProductIconTheme.isLoaded) {
            let newThemeData = this.productIconThemeRegistry.findThemeById(themeId);
            if (!newThemeData && iconThemeOrId instanceof ProductIconThemeData) {
                newThemeData = iconThemeOrId;
            }
            if (!newThemeData) {
                newThemeData = ProductIconThemeData.defaultTheme;
            }
            await newThemeData.ensureLoaded(this.extensionResourceLoaderService, this.logService);
            this.applyAndSetProductIconTheme(newThemeData); // updates this.currentProductIconTheme
        }
        const themeData = this.currentProductIconTheme;
        // remember theme data for a quick restore
        if (themeData.isLoaded && settingsTarget !== 'preview' && (!themeData.location || !getRemoteAuthority(themeData.location))) {
            themeData.toStorage(this.storageService);
        }
        await this.settings.setProductIconTheme(this.currentProductIconTheme, settingsTarget);
        return themeData;
    }
    async getMarketplaceProductIconThemes(publisher, name, version) {
        const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, 'extension');
        if (extensionLocation) {
            try {
                const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, 'package.json'));
                return this.productIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
            }
            catch (e) {
                this.logService.error('Problem loading themes from marketplace', e);
            }
        }
        return [];
    }
    async reloadCurrentProductIconTheme() {
        return this.productIconThemeSequencer.queue(async () => {
            await this.currentProductIconTheme.reload(this.extensionResourceLoaderService, this.logService);
            this.applyAndSetProductIconTheme(this.currentProductIconTheme);
        });
    }
    async restoreProductIconTheme() {
        return this.productIconThemeSequencer.queue(async () => {
            const settingId = this.settings.productIconTheme;
            const theme = this.productIconThemeRegistry.findThemeBySettingsId(settingId);
            if (theme) {
                if (settingId !== this.currentProductIconTheme.settingsId) {
                    await this.internalSetProductIconTheme(theme.id, undefined);
                }
                else if (theme !== this.currentProductIconTheme) {
                    await theme.ensureLoaded(this.extensionResourceLoaderService, this.logService);
                    this.applyAndSetProductIconTheme(theme, true);
                }
                return true;
            }
            return false;
        });
    }
    applyAndSetProductIconTheme(iconThemeData, silent = false) {
        this.currentProductIconTheme = iconThemeData;
        _applyRules(iconThemeData.styleSheetContent, productIconThemeRulesClassName);
        this.productIconThemeWatcher.update(iconThemeData);
        if (iconThemeData.id) {
            this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, 'productIcon');
        }
        if (!silent) {
            this.onProductIconThemeChange.fire(this.currentProductIconTheme);
        }
    }
};
WorkbenchThemeService = WorkbenchThemeService_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IStorageService),
    __param(2, IConfigurationService),
    __param(3, ITelemetryService),
    __param(4, IBrowserWorkbenchEnvironmentService),
    __param(5, IFileService),
    __param(6, IExtensionResourceLoaderService),
    __param(7, IWorkbenchLayoutService),
    __param(8, ILogService),
    __param(9, IHostColorSchemeService),
    __param(10, IUserDataInitializationService),
    __param(11, ILanguageService),
    __param(12, INotificationService),
    __param(13, IHostService)
], WorkbenchThemeService);
export { WorkbenchThemeService };
class ThemeFileWatcher {
    constructor(fileService, environmentService, onUpdate) {
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.onUpdate = onUpdate;
        this.watcherDisposables = new DisposableStore();
    }
    update(theme) {
        if (!resources.isEqual(theme.location, this.watchedLocation)) {
            this.watchedLocation = undefined;
            this.watcherDisposables.clear();
            if (theme.location && (theme.watch || this.environmentService.isExtensionDevelopment)) {
                this.watchedLocation = theme.location;
                this.watcherDisposables.add(this.fileService.watch(theme.location));
                this.watcherDisposables.add(this.fileService.onDidFilesChange(e => {
                    if (this.watchedLocation && e.contains(this.watchedLocation, 0 /* FileChangeType.UPDATED */)) {
                        this.onUpdate();
                    }
                }));
            }
        }
    }
    dispose() {
        this.watcherDisposables.dispose();
        this.watchedLocation = undefined;
    }
}
function _applyRules(styleSheetContent, rulesClassName) {
    // eslint-disable-next-line no-restricted-syntax
    const themeStyles = mainWindow.document.head.getElementsByClassName(rulesClassName);
    if (themeStyles.length === 0) {
        const elStyle = createStyleSheet();
        elStyle.className = rulesClassName;
        elStyle.textContent = styleSheetContent;
    }
    else {
        themeStyles[0].textContent = styleSheetContent;
    }
}
registerColorThemeSchemas();
registerFileIconThemeSchemas();
registerProductIconThemeSchemas();
// The WorkbenchThemeService should stay eager as the constructor restores the
// last used colors / icons from storage. This needs to happen as quickly as possible
// for a flicker-free startup experience.
registerSingleton(IWorkbenchThemeService, WorkbenchThemeService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy9icm93c2VyL3dvcmtiZW5jaFRoZW1lU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssS0FBSyxNQUFNLGtDQUFrQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxzQkFBc0IsRUFBaUQsYUFBYSxFQUFFLGFBQWEsRUFBa0Qsb0JBQW9CLEVBQUUsK0JBQStCLEVBQUUsZ0NBQWdDLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxVCxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxxQkFBcUIsRUFBdUIsTUFBTSw0REFBNEQsQ0FBQztBQUN4SCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDN0QsT0FBTyxFQUFlLFVBQVUsSUFBSSxpQkFBaUIsRUFBb0IsTUFBTSxtREFBbUQsQ0FBQztBQUNuSSxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEYsT0FBTyxFQUFlLFVBQVUsRUFBRSxlQUFlLEVBQUUs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