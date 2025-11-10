/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as types from '../../../../base/common/types.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IWorkbenchThemeService, IWorkbenchColorTheme, IWorkbenchFileIconTheme, ExtensionData, ThemeSettings, IWorkbenchProductIconTheme, ThemeSettingTarget, ThemeSettingDefaults, COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS } from '../common/workbenchThemeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import * as errors from '../../../../base/common/errors.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ColorThemeData } from '../common/colorThemeData.js';
import { IColorTheme, Extensions as ThemingExtensions, IThemingRegistry } from '../../../../platform/theme/common/themeService.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { registerFileIconThemeSchemas } from '../common/fileIconThemeSchema.js';
import { IDisposable, Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileIconThemeData, FileIconThemeLoader } from './fileIconThemeData.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IFileService, FileChangeType } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import * as resources from '../../../../base/common/resources.js';
import { registerColorThemeSchemas } from '../common/colorThemeSchema.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
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
import { asCssVariableName, getColorRegistry } from '../../../../platform/theme/common/colorRegistry.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { mainWindow } from '../../../../base/browser/window.js';

// implementation

const defaultThemeExtensionId = 'vscode-theme-defaults';

const DEFAULT_FILE_ICON_THEME_ID = 'vscode.vscode-theme-seti-vs-seti';
const fileIconsEnabledClass = 'file-icons-enabled';

const colorThemeRulesClassName = 'contributedColorTheme';
const fileIconThemeRulesClassName = 'contributedFileIconTheme';
const productIconThemeRulesClassName = 'contributedProductIconTheme';

const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);

function validateThemeId(theme: string): string {
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

export class WorkbenchThemeService extends Disposable implements IWorkbenchThemeService {
	declare readonly _serviceBrand: undefined;

	private readonly container: HTMLElement;
	private settings: ThemeConfiguration;

	private readonly colorThemeRegistry: ThemeRegistry<ColorThemeData>;
	private currentColorTheme: ColorThemeData;
	private readonly onColorThemeChange: Emitter<IWorkbenchColorTheme>;
	private readonly colorThemeWatcher: ThemeFileWatcher;
	private colorThemingParticipantChangeListener: IDisposable | undefined;
	private readonly colorThemeSequencer: Sequencer;

	private readonly fileIconThemeRegistry: ThemeRegistry<FileIconThemeData>;
	private currentFileIconTheme: FileIconThemeData;
	private readonly onFileIconThemeChange: Emitter<IWorkbenchFileIconTheme>;
	private readonly fileIconThemeLoader: FileIconThemeLoader;
	private readonly fileIconThemeWatcher: ThemeFileWatcher;
	private readonly fileIconThemeSequencer: Sequencer;

	private readonly productIconThemeRegistry: ThemeRegistry<ProductIconThemeData>;
	private currentProductIconTheme: ProductIconThemeData;
	private readonly onProductIconThemeChange: Emitter<IWorkbenchProductIconTheme>;
	private readonly productIconThemeWatcher: ThemeFileWatcher;
	private readonly productIconThemeSequencer: Sequencer;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ILogService private readonly logService: ILogService,
		@IHostColorSchemeService private readonly hostColorService: IHostColorSchemeService,
		@IUserDataInitializationService private readonly userDataInitializationService: IUserDataInitializationService,
		@ILanguageService private readonly languageService: ILanguageService
	) {
		super();
		this.container = layoutService.mainContainer;
		this.settings = new ThemeConfiguration(configurationService, hostColorService);

		this.colorThemeRegistry = this._register(new ThemeRegistry(colorThemesExtPoint, ColorThemeData.fromExtensionTheme));
		this.colorThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentColorTheme.bind(this)));
		this.onColorThemeChange = new Emitter<IWorkbenchColorTheme>({ leakWarningThreshold: 400 });
		this.currentColorTheme = ColorThemeData.createUnloadedTheme('');
		this.colorThemeSequencer = new Sequencer();

		this.fileIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentFileIconTheme.bind(this)));
		this.fileIconThemeRegistry = this._register(new ThemeRegistry(fileIconThemesExtPoint, FileIconThemeData.fromExtensionTheme, true, FileIconThemeData.noIconTheme));
		this.fileIconThemeLoader = new FileIconThemeLoader(extensionResourceLoaderService, languageService);
		this.onFileIconThemeChange = new Emitter<IWorkbenchFileIconTheme>({ leakWarningThreshold: 400 });
		this.currentFileIconTheme = FileIconThemeData.createUnloadedTheme('');
		this.fileIconThemeSequencer = new Sequencer();

		this.productIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentProductIconTheme.bind(this)));
		this.productIconThemeRegistry = this._register(new ThemeRegistry(productIconThemesExtPoint, ProductIconThemeData.fromExtensionTheme, true, ProductIconThemeData.defaultTheme));
		this.onProductIconThemeChange = new Emitter<IWorkbenchProductIconTheme>();
		this.currentProductIconTheme = ProductIconThemeData.createUnloadedTheme('');
		this.productIconThemeSequencer = new Sequencer();

		this._register(this.onDidColorThemeChange(theme => getColorRegistry().notifyThemeUpdate(theme)));

		// In order to avoid paint flashing for tokens, because
		// themes are loaded asynchronously, we need to initialize
		// a color theme document with good defaults until the theme is loaded
		let themeData: ColorThemeData | undefined = ColorThemeData.fromStorageData(this.storageService);
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
			this.initialize().catch(errors.onUnexpectedError);
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

	private initialize(): Promise<[IWorkbenchColorTheme | null, IWorkbenchFileIconTheme | null, IWorkbenchProductIconTheme | null]> {
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
				return this.setFileIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
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
				return this.setProductIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
			}
			let theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
			if (!theme) {
				// If the current theme is not available, first make sure setting sync is complete
				await this.userDataInitializationService.whenInitializationFinished();
				theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
			}
			return this.setProductIconTheme(theme ? theme.id : DEFAULT_PRODUCT_ICON_THEME_ID, undefined);
		};


		return Promise.all([initializeColorTheme(), initializeFileIconTheme(), initializeProductIconTheme()]);
	}

	private installConfigurationListener() {
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ThemeSettings.COLOR_THEME)
				|| e.affectsConfiguration(ThemeSettings.PREFERRED_DARK_THEME)
				|| e.affectsConfiguration(ThemeSettings.PREFERRED_LIGHT_THEME)
				|| e.affectsConfiguration(ThemeSettings.PREFERRED_HC_DARK_THEME)
				|| e.affectsConfiguration(ThemeSettings.PREFERRED_HC_LIGHT_THEME)
				|| e.affectsConfiguration(ThemeSettings.DETECT_COLOR_SCHEME)
				|| e.affectsConfiguration(ThemeSettings.DETECT_HC)
				|| e.affectsConfiguration(ThemeSettings.SYSTEM_COLOR_THEME)
			) {
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

	private installRegistryListeners(): Promise<void> {

		let prevColorId: string | undefined = undefined;

		// update settings schema setting for theme specific settings
		this._register(this.colorThemeRegistry.onDidChange(async event => {
			updateColorThemeConfigurationSchemas(event.themes);
			if (await this.restoreColorTheme()) { // checks if theme from settings exists and is set
				// restore theme
				if (this.currentColorTheme.settingsId === ThemeSettingDefaults.COLOR_THEME_DARK && !types.isUndefined(prevColorId) && await this.colorThemeRegistry.findThemeById(prevColorId)) {
					await this.setColorTheme(prevColorId, 'auto');
					prevColorId = undefined;
				} else if (event.added.some(t => t.settingsId === this.currentColorTheme.settingsId)) {
					await this.reloadCurrentColorTheme();
				}
			} else if (event.removed.some(t => t.settingsId === this.currentColorTheme.settingsId)) {
				// current theme is no longer available
				prevColorId = this.currentColorTheme.id;
				const defaultTheme = this.colorThemeRegistry.findThemeBySettingsId(ThemeSettingDefaults.COLOR_THEME_DARK);
				await this.setColorTheme(defaultTheme, 'auto');
			}
		}));

		let prevFileIconId: string | undefined = undefined;
		this._register(this._register(this.fileIconThemeRegistry.onDidChange(async event => {
			updateFileIconThemeConfigurationSchemas(event.themes);
			if (await this.restoreFileIconTheme()) { // checks if theme from settings exists and is set
				// restore theme
				if (this.currentFileIconTheme.id === DEFAULT_FILE_ICON_THEME_ID && !types.isUndefined(prevFileIconId) && this.fileIconThemeRegistry.findThemeById(prevFileIconId)) {
					await this.setFileIconTheme(prevFileIconId, 'auto');
					prevFileIconId = undefined;
				} else if (event.added.some(t => t.settingsId === this.currentFileIconTheme.settingsId)) {
					await this.reloadCurrentFileIconTheme();
				}
			} else if (event.removed.some(t => t.settingsId === this.currentFileIconTheme.settingsId)) {
				// current theme is no longer available
				prevFileIconId = this.currentFileIconTheme.id;
				await this.setFileIconTheme(DEFAULT_FILE_ICON_THEME_ID, 'auto');
			}

		})));

		let prevProductIconId: string | undefined = undefined;
		this._register(this.productIconThemeRegistry.onDidChange(async event => {
			updateProductIconThemeConfigurationSchemas(event.themes);
			if (await this.restoreProductIconTheme()) { // checks if theme from settings exists and is set
				// restore theme
				if (this.currentProductIconTheme.id === DEFAULT_PRODUCT_ICON_THEME_ID && !types.isUndefined(prevProductIconId) && this.productIconThemeRegistry.findThemeById(prevProductIconId)) {
					await this.setProductIconTheme(prevProductIconId, 'auto');
					prevProductIconId = undefined;
				} else if (event.added.some(t => t.settingsId === this.currentProductIconTheme.settingsId)) {
					await this.reloadCurrentProductIconTheme();
				}
			} else if (event.removed.some(t => t.settingsId === this.currentProductIconTheme.settingsId)) {
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

	private installPreferredSchemeListener() {
		this._register(this.hostColorService.onDidChangeColorScheme(() => {
			if (this.settings.isDetectingColorScheme()) {
				this.restoreColorTheme();
			}
		}));
	}

	public getColorTheme(): IWorkbenchColorTheme {
		return this.currentColorTheme;
	}

	public async getColorThemes(): Promise<IWorkbenchColorTheme[]> {
		return this.colorThemeRegistry.getThemes();
	}

	public getPreferredColorScheme(): ColorScheme | undefined {
		return this.settings.getPreferredColorScheme();
	}

	public async getMarketplaceColorThemes(publisher: string, name: string, version: string): Promise<IWorkbenchColorTheme[]> {
		const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, 'extension');
		if (extensionLocation) {
			try {
				const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, 'package.json'));
				return this.colorThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
			} catch (e) {
				this.logService.error('Problem loading themes from marketplace', e);
			}
		}
		return [];
	}

	public get onDidColorThemeChange(): Event<IWorkbenchColorTheme> {
		return this.onColorThemeChange.event;
	}

	public setColorTheme(themeIdOrTheme: string | undefined | IWorkbenchColorTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchColorTheme | null> {
		return this.colorThemeSequencer.queue(async () => {
			return this.internalSetColorTheme(themeIdOrTheme, settingsTarget);
		});
	}

	private async internalSetColorTheme(themeIdOrTheme: string | undefined | IWorkbenchColorTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchColorTheme | null> {
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
			} else {
				return null;
			}
		}
		try {
			await themeData.ensureLoaded(this.extensionResourceLoaderService);
			themeData.setCustomizations(this.settings);
			return this.applyTheme(themeData, settingsTarget);
		} catch (error) {
			throw new Error(nls.localize('error.cannotloadtheme', "Unable to load {0}: {1}", themeData.location?.toString(), error.message));
		}

	}

	private reloadCurrentColorTheme() {
		return this.colorThemeSequencer.queue(async () => {
			try {
				const theme = this.colorThemeRegistry.findThemeBySettingsId(this.currentColorTheme.settingsId) || this.currentColorTheme;
				await theme.reload(this.extensionResourceLoaderService);
				theme.setCustomizations(this.settings);
				await this.applyTheme(theme, undefined, false);
			} catch (error) {
				this.logService.info('Unable to reload {0}: {1}', this.currentColorTheme.location?.toString());
			}
		});
	}

	public async restoreColorTheme(): Promise<boolean> {
		return this.colorThemeSequencer.queue(async () => {
			const settingId = this.settings.colorTheme;
			const theme = this.colorThemeRegistry.findThemeBySettingsId(settingId);
			if (theme) {
				if (settingId !== this.currentColorTheme.settingsId) {
					await this.internalSetColorTheme(theme.id, undefined);
				} else if (theme !== this.currentColorTheme) {
					await theme.ensureLoaded(this.extensionResourceLoaderService);
					theme.setCustomizations(this.settings);
					await this.applyTheme(theme, undefined, true);
				}
				return true;
			}
			return false;
		});
	}

	private updateDynamicCSSRules(themeData: IColorTheme) {
		const cssRules = new Set<string>();
		const ruleCollector = {
			addRule: (rule: string) => {
				if (!cssRules.has(rule)) {
					cssRules.add(rule);
				}
			}
		};
		ruleCollector.addRule(`.monaco-workbench { forced-color-adjust: none; }`);
		themingRegistry.getThemingParticipants().forEach(p => p(themeData, ruleCollector, this.environmentService));

		const colorVariables: string[] = [];
		for (const item of getColorRegistry().getColors()) {
			const color = themeData.getColor(item.id, true);
			if (color) {
				colorVariables.push(`${asCssVariableName(item.id)}: ${color.toString()};`);
			}
		}
		ruleCollector.addRule(`.monaco-workbench { ${colorVariables.join('\n')} }`);

		_applyRules([...cssRules].join('\n'), colorThemeRulesClassName);
	}

	private applyTheme(newTheme: ColorThemeData, settingsTarget: ThemeSettingTarget, silent = false): Promise<IWorkbenchColorTheme | null> {
		this.updateDynamicCSSRules(newTheme);

		if (this.currentColorTheme.id) {
			this.container.classList.remove(...this.currentColorTheme.classNames);
		} else {
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


	private themeExtensionsActivated = new Map<string, boolean>();
	private sendTelemetry(themeId: string, themeData: ExtensionData | undefined, themeType: string) {
		if (themeData) {
			const key = themeType + themeData.extensionId;
			if (!this.themeExtensionsActivated.get(key)) {
				type ActivatePluginClassification = {
					owner: 'aeschli';
					comment: 'An event is fired when an color theme extension is first used as it provides the currently shown color theme.';
					id: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The extension id.' };
					name: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The extension name.' };
					isBuiltin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the extension is a built-in extension.' };
					publisherDisplayName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension publisher id.' };
					themeId: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The id of the theme that triggered the first extension use.' };
				};
				type ActivatePluginEvent = {
					id: string;
					name: string;
					isBuiltin: boolean;
					publisherDisplayName: string;
					themeId: string;
				};
				this.telemetryService.publicLog2<ActivatePluginEvent, ActivatePluginClassification>('activatePlugin', {
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

	public async getFileIconThemes(): Promise<IWorkbenchFileIconTheme[]> {
		return this.fileIconThemeRegistry.getThemes();
	}

	public getFileIconTheme() {
		return this.currentFileIconTheme;
	}

	public get onDidFileIconThemeChange(): Event<IWorkbenchFileIconTheme> {
		return this.onFileIconThemeChange.event;
	}

	public async setFileIconTheme(iconThemeOrId: string | undefined | IWorkbenchFileIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchFileIconTheme> {
		return this.fileIconThemeSequencer.queue(async () => {
			return this.internalSetFileIconTheme(iconThemeOrId, settingsTarget);
		});
	}

	private async internalSetFileIconTheme(iconThemeOrId: string | undefined | IWorkbenchFileIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchFileIconTheme> {
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

	public async getMarketplaceFileIconThemes(publisher: string, name: string, version: string): Promise<IWorkbenchFileIconTheme[]> {
		const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, 'extension');
		if (extensionLocation) {
			try {
				const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, 'package.json'));
				return this.fileIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
			} catch (e) {
				this.logService.error('Problem loading themes from marketplace', e);
			}
		}
		return [];
	}

	private async reloadCurrentFileIconTheme() {
		return this.fileIconThemeSequencer.queue(async () => {
			await this.currentFileIconTheme.reload(this.fileIconThemeLoader);
			this.applyAndSetFileIconTheme(this.currentFileIconTheme);
		});
	}

	public async restoreFileIconTheme(): Promise<boolean> {
		return this.fileIconThemeSequencer.queue(async () => {
			const settingId = this.settings.fileIconTheme;
			const theme = this.fileIconThemeRegistry.findThemeBySettingsId(settingId);
			if (theme) {
				if (settingId !== this.currentFileIconTheme.settingsId) {
					await this.internalSetFileIconTheme(theme.id, undefined);
				} else if (theme !== this.currentFileIconTheme) {
					await theme.ensureLoaded(this.fileIconThemeLoader);
					this.applyAndSetFileIconTheme(theme, true);
				}
				return true;
			}
			return false;
		});
	}

	private applyAndSetFileIconTheme(iconThemeData: FileIconThemeData, silent = false): void {
		this.currentFileIconTheme = iconThemeData;

		_applyRules(iconThemeData.styleSheetContent!, fileIconThemeRulesClassName);

		if (iconThemeData.id) {
			this.container.classList.add(fileIconsEnabledClass);
		} else {
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

	public async getProductIconThemes(): Promise<IWorkbenchProductIconTheme[]> {
		return this.productIconThemeRegistry.getThemes();
	}

	public getProductIconTheme() {
		return this.currentProductIconTheme;
	}

	public get onDidProductIconThemeChange(): Event<IWorkbenchProductIconTheme> {
		return this.onProductIconThemeChange.event;
	}

	public async setProductIconTheme(iconThemeOrId: string | undefined | IWorkbenchProductIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchProductIconTheme> {
		return this.productIconThemeSequencer.queue(async () => {
			return this.internalSetProductIconTheme(iconThemeOrId, settingsTarget);
		});
	}

	private async internalSetProductIconTheme(iconThemeOrId: string | undefined | IWorkbenchProductIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchProductIconTheme> {
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

	public async getMarketplaceProductIconThemes(publisher: string, name: string, version: string): Promise<IWorkbenchProductIconTheme[]> {
		const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, 'extension');
		if (extensionLocation) {
			try {
				const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, 'package.json'));
				return this.productIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
			} catch (e) {
				this.logService.error('Problem loading themes from marketplace', e);
			}
		}
		return [];
	}

	private async reloadCurrentProductIconTheme() {
		return this.productIconThemeSequencer.queue(async () => {
			await this.currentProductIconTheme.reload(this.extensionResourceLoaderService, this.logService);
			this.applyAndSetProductIconTheme(this.currentProductIconTheme);
		});
	}

	public async restoreProductIconTheme(): Promise<boolean> {
		return this.productIconThemeSequencer.queue(async () => {
			const settingId = this.settings.productIconTheme;
			const theme = this.productIconThemeRegistry.findThemeBySettingsId(settingId);
			if (theme) {
				if (settingId !== this.currentProductIconTheme.settingsId) {
					await this.internalSetProductIconTheme(theme.id, undefined);
				} else if (theme !== this.currentProductIconTheme) {
					await theme.ensureLoaded(this.extensionResourceLoaderService, this.logService);
					this.applyAndSetProductIconTheme(theme, true);
				}
				return true;
			}
			return false;
		});
	}

	private applyAndSetProductIconTheme(iconThemeData: ProductIconThemeData, silent = false): void {

		this.currentProductIconTheme = iconThemeData;

		_applyRules(iconThemeData.styleSheetContent!, productIconThemeRulesClassName);

		this.productIconThemeWatcher.update(iconThemeData);

		if (iconThemeData.id) {
			this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, 'productIcon');
		}
		if (!silent) {
			this.onProductIconThemeChange.fire(this.currentProductIconTheme);
		}
	}
}

class ThemeFileWatcher {

	private watchedLocation: URI | undefined;
	private readonly watcherDisposables = new DisposableStore();

	constructor(
		private readonly fileService: IFileService,
		private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		private readonly onUpdate: () => void
	) { }

	update(theme: { location?: URI; watch?: boolean }) {
		if (!resources.isEqual(theme.location, this.watchedLocation)) {
			this.watchedLocation = undefined;
			this.watcherDisposables.clear();

			if (theme.location && (theme.watch || this.environmentService.isExtensionDevelopment)) {
				this.watchedLocation = theme.location;
				this.watcherDisposables.add(this.fileService.watch(theme.location));
				this.watcherDisposables.add(this.fileService.onDidFilesChange(e => {
					if (this.watchedLocation && e.contains(this.watchedLocation, FileChangeType.UPDATED)) {
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

function _applyRules(styleSheetContent: string, rulesClassName: string) {
	// eslint-disable-next-line no-restricted-syntax
	const themeStyles = mainWindow.document.head.getElementsByClassName(rulesClassName);
	if (themeStyles.length === 0) {
		const elStyle = createStyleSheet();
		elStyle.className = rulesClassName;
		elStyle.textContent = styleSheetContent;
	} else {
		(<HTMLStyleElement>themeStyles[0]).textContent = styleSheetContent;
	}
}

registerColorThemeSchemas();
registerFileIconThemeSchemas();
registerProductIconThemeSchemas();

// The WorkbenchThemeService should stay eager as the constructor restores the
// last used colors / icons from storage. This needs to happen as quickly as possible
// for a flicker-free startup experience.
registerSingleton(IWorkbenchThemeService, WorkbenchThemeService, InstantiationType.Eager);
