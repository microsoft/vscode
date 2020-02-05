/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchThemeService, IColorTheme, ITokenColorCustomizations, IFileIconTheme, ExtensionData, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME, COLOR_THEME_SETTING, ICON_THEME_SETTING, CUSTOM_WORKBENCH_COLORS_SETTING, CUSTOM_EDITOR_COLORS_SETTING, IColorCustomizations, CUSTOM_EDITOR_TOKENSTYLES_SETTING, IExperimentalTokenStyleCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/registry/common/platform';
import * as errors from 'vs/base/common/errors';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { ITheme, Extensions as ThemingExtensions, IThemingRegistry, ThemeType, LIGHT, DARK, HIGH_CONTRAST } from 'vs/platform/theme/common/themeService';
import { Event, Emitter } from 'vs/base/common/event';
import { registerFileIconThemeSchemas } from 'vs/workbench/services/themes/common/fileIconThemeSchema';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ColorThemeStore } from 'vs/workbench/services/themes/common/colorThemeStore';
import { FileIconThemeStore } from 'vs/workbench/services/themes/browser/fileIconThemeStore';
import { FileIconThemeData } from 'vs/workbench/services/themes/browser/fileIconThemeData';
import { removeClasses, addClasses } from 'vs/base/browser/dom';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import * as resources from 'vs/base/common/resources';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { textmateColorsSchemaId, registerColorThemeSchemas, textmateColorGroupSchemaId } from 'vs/workbench/services/themes/common/colorThemeSchema';
import { workbenchColorsSchemaId } from 'vs/platform/theme/common/colorRegistry';
import { tokenStylingSchemaId } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';

// settings

const PREFERRED_DARK_THEME_SETTING = 'workbench.preferredDarkColorTheme';
const PREFERRED_LIGHT_THEME_SETTING = 'workbench.preferredLightColorTheme';
const PREFERRED_HC_THEME_SETTING = 'workbench.preferredHighContrastColorTheme';
const DETECT_COLOR_SCHEME_SETTING = 'window.autoDetectColorScheme';
const DETECT_HC_SETTING = 'window.autoDetectHighContrast';

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';
const DEFAULT_THEME_SETTING_VALUE = 'Default Dark+';
const DEFAULT_THEME_DARK_SETTING_VALUE = 'Default Dark+';
const DEFAULT_THEME_LIGHT_SETTING_VALUE = 'Default Light+';
const DEFAULT_THEME_HC_SETTING_VALUE = 'Default High Contrast';

const PERSISTED_THEME_STORAGE_KEY = 'colorThemeData';
const PERSISTED_ICON_THEME_STORAGE_KEY = 'iconThemeData';
const PERSISTED_OS_COLOR_SCHEME = 'osColorScheme';

const defaultThemeExtensionId = 'vscode-theme-defaults';
const oldDefaultThemeExtensionId = 'vscode-theme-colorful-defaults';

const DEFAULT_ICON_THEME_SETTING_VALUE = 'vs-seti';
const DEFAULT_ICON_THEME_ID = 'vscode.vscode-theme-seti-vs-seti';
const fileIconsEnabledClass = 'file-icons-enabled';

const colorThemeRulesClassName = 'contributedColorTheme';
const iconThemeRulesClassName = 'contributedIconTheme';

const themingRegistry = Registry.as<IThemingRegistry>(ThemingExtensions.ThemingContribution);

function validateThemeId(theme: string): string {
	// migrations
	switch (theme) {
		case VS_LIGHT_THEME: return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
		case VS_DARK_THEME: return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
		case VS_HC_THEME: return `hc-black ${defaultThemeExtensionId}-themes-hc_black-json`;
		case `vs ${oldDefaultThemeExtensionId}-themes-light_plus-tmTheme`: return `vs ${defaultThemeExtensionId}-themes-light_plus-json`;
		case `vs-dark ${oldDefaultThemeExtensionId}-themes-dark_plus-tmTheme`: return `vs-dark ${defaultThemeExtensionId}-themes-dark_plus-json`;
	}
	return theme;
}

export class WorkbenchThemeService implements IWorkbenchThemeService {
	_serviceBrand: undefined;

	private colorThemeStore: ColorThemeStore;
	private currentColorTheme: ColorThemeData;
	private container: HTMLElement;
	private readonly onColorThemeChange: Emitter<IColorTheme>;
	private watchedColorThemeLocation: URI | undefined;
	private watchedColorThemeDisposable: IDisposable | undefined;

	private iconThemeStore: FileIconThemeStore;
	private currentIconTheme: FileIconThemeData;
	private readonly onFileIconThemeChange: Emitter<IFileIconTheme>;
	private watchedIconThemeLocation: URI | undefined;
	private watchedIconThemeDisposable: IDisposable | undefined;

	private themingParticipantChangeListener: IDisposable | undefined;

	private get colorCustomizations(): IColorCustomizations {
		return this.configurationService.getValue<IColorCustomizations>(CUSTOM_WORKBENCH_COLORS_SETTING) || {};
	}

	private get tokenColorCustomizations(): ITokenColorCustomizations {
		return this.configurationService.getValue<ITokenColorCustomizations>(CUSTOM_EDITOR_COLORS_SETTING) || {};
	}

	private get tokenStylesCustomizations(): IExperimentalTokenStyleCustomizations {
		return this.configurationService.getValue<IExperimentalTokenStyleCustomizations>(CUSTOM_EDITOR_TOKENSTYLES_SETTING) || {};
	}

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IWorkbenchLayoutService readonly layoutService: IWorkbenchLayoutService
	) {

		this.container = layoutService.getWorkbenchContainer();
		this.colorThemeStore = new ColorThemeStore(extensionService);
		this.onFileIconThemeChange = new Emitter<IFileIconTheme>();
		this.iconThemeStore = new FileIconThemeStore(extensionService);
		this.onColorThemeChange = new Emitter<IColorTheme>({ leakWarningThreshold: 400 });

		this.currentColorTheme = ColorThemeData.createUnloadedTheme('');
		this.currentIconTheme = FileIconThemeData.createUnloadedTheme('');

		// In order to avoid paint flashing for tokens, because
		// themes are loaded asynchronously, we need to initialize
		// a color theme document with good defaults until the theme is loaded
		let themeData: ColorThemeData | undefined = undefined;
		let persistedThemeData = this.storageService.get(PERSISTED_THEME_STORAGE_KEY, StorageScope.GLOBAL);
		if (persistedThemeData) {
			themeData = ColorThemeData.fromStorageData(persistedThemeData);
		}
		let containerBaseTheme = this.getBaseThemeFromContainer();
		if (!themeData || themeData.baseTheme !== containerBaseTheme) {
			themeData = ColorThemeData.createUnloadedTheme(containerBaseTheme);
		}
		themeData.setCustomColors(this.colorCustomizations);
		themeData.setCustomTokenColors(this.tokenColorCustomizations);
		themeData.setCustomTokenStyleRules(this.tokenStylesCustomizations);
		this.updateDynamicCSSRules(themeData);
		this.applyTheme(themeData, undefined, true);

		let persistedIconThemeData = this.storageService.get(PERSISTED_ICON_THEME_STORAGE_KEY, StorageScope.GLOBAL);
		if (persistedIconThemeData) {
			const iconData = FileIconThemeData.fromStorageData(persistedIconThemeData);
			if (iconData) {
				_applyIconTheme(iconData, () => {
					this.doSetFileIconTheme(iconData);
					return Promise.resolve(iconData);
				});
			}
		}

		this.initialize().then(undefined, errors.onUnexpectedError).then(_ => {
			this.installConfigurationListener();
			this.installPreferredSchemeListener();
		});

		let prevColorId: string | undefined = undefined;

		// update settings schema setting for theme specific settings
		this.colorThemeStore.onDidChange(async event => {
			// updates enum for the 'workbench.colorTheme` setting
			colorThemeSettingEnum.splice(0, colorThemeSettingEnum.length, ...event.themes.map(t => t.settingsId));
			colorThemeSettingEnumDescriptions.splice(0, colorThemeSettingEnumDescriptions.length, ...event.themes.map(t => t.description || ''));

			const themeSpecificWorkbenchColors: IJSONSchema = { properties: {} };
			const themeSpecificTokenColors: IJSONSchema = { properties: {} };
			const themeSpecificTokenStyling: IJSONSchema = { properties: {} };

			const workbenchColors = { $ref: workbenchColorsSchemaId, additionalProperties: false };
			const tokenColors = { properties: tokenColorSchema.properties, additionalProperties: false };
			const tokenStyling = { $ref: tokenStylingSchemaId, additionalProperties: false };
			for (let t of event.themes) {
				// add theme specific color customization ("[Abyss]":{ ... })
				const themeId = `[${t.settingsId}]`;
				themeSpecificWorkbenchColors.properties![themeId] = workbenchColors;
				themeSpecificTokenColors.properties![themeId] = tokenColors;
				themeSpecificTokenStyling.properties![themeId] = tokenStyling;
			}

			colorCustomizationsSchema.allOf![1] = themeSpecificWorkbenchColors;
			tokenColorCustomizationSchema.allOf![1] = themeSpecificTokenColors;
			experimentalTokenStylingCustomizationSchema.allOf![1] = themeSpecificTokenStyling;

			configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration, tokenColorCustomizationConfiguration);

			let colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
			if (colorThemeSetting !== this.currentColorTheme.settingsId) {
				const theme = await this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, undefined);
				if (theme) {
					this.setColorTheme(theme.id, undefined);
					return;
				}
			}

			if (this.currentColorTheme.isLoaded) {
				const themeData = await this.colorThemeStore.findThemeData(this.currentColorTheme.id);
				if (!themeData) {
					// current theme is no longer available
					prevColorId = this.currentColorTheme.id;
					this.setColorTheme(DEFAULT_THEME_ID, 'auto');
				} else {
					if (this.currentColorTheme.id === DEFAULT_THEME_ID && !types.isUndefined(prevColorId) && await this.colorThemeStore.findThemeData(prevColorId)) {
						// restore color
						this.setColorTheme(prevColorId, 'auto');
						prevColorId = undefined;
					} else {
						this.reloadCurrentColorTheme();
					}
				}
			}
		});

		let prevFileIconId: string | undefined = undefined;
		this.iconThemeStore.onDidChange(async event => {
			iconThemeSettingSchema.enum = [null, ...event.themes.map(t => t.settingsId)];
			iconThemeSettingSchema.enumDescriptions = [iconThemeSettingSchema.enumDescriptions![0], ...event.themes.map(t => t.description || '')];
			configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);

			let iconThemeSetting = this.configurationService.getValue<string | null>(ICON_THEME_SETTING);
			if (iconThemeSetting !== this.currentIconTheme.settingsId) {
				const theme = await this.iconThemeStore.findThemeBySettingsId(iconThemeSetting);
				if (theme) {
					this.setFileIconTheme(theme.id, undefined);
					return;
				}
			}

			if (this.currentIconTheme.isLoaded) {
				const theme = await this.iconThemeStore.findThemeData(this.currentIconTheme.id);
				if (!theme) {
					// current theme is no longer available
					prevFileIconId = this.currentIconTheme.id;
					this.setFileIconTheme(DEFAULT_ICON_THEME_ID, 'auto');
				} else {
					// restore color
					if (this.currentIconTheme.id === DEFAULT_ICON_THEME_ID && !types.isUndefined(prevFileIconId) && await this.iconThemeStore.findThemeData(prevFileIconId)) {
						this.setFileIconTheme(prevFileIconId, 'auto');
						prevFileIconId = undefined;
					} else {
						this.reloadCurrentFileIconTheme();
					}
				}
			}
		});

		this.fileService.onFileChanges(async e => {
			if (this.watchedColorThemeLocation && this.currentColorTheme && e.contains(this.watchedColorThemeLocation, FileChangeType.UPDATED)) {
				this.reloadCurrentColorTheme();
			}
			if (this.watchedIconThemeLocation && this.currentIconTheme && e.contains(this.watchedIconThemeLocation, FileChangeType.UPDATED)) {
				this.reloadCurrentFileIconTheme();
			}
		});
	}

	public get onDidColorThemeChange(): Event<IColorTheme> {
		return this.onColorThemeChange.event;
	}

	public get onDidFileIconThemeChange(): Event<IFileIconTheme> {
		return this.onFileIconThemeChange.event;
	}

	public get onIconThemeChange(): Event<IFileIconTheme> {
		return this.onFileIconThemeChange.event;
	}

	public get onThemeChange(): Event<ITheme> {
		return this.onColorThemeChange.event;
	}

	private initialize(): Promise<[IColorTheme | null, IFileIconTheme | null]> {
		const colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
		const iconThemeSetting = this.configurationService.getValue<string | null>(ICON_THEME_SETTING);

		const extDevLocs = this.environmentService.extensionDevelopmentLocationURI;

		const initializeColorTheme = async () => {
			if (extDevLocs && extDevLocs.length === 1) { // in dev mode, switch to a theme provided by the extension under dev.
				const devThemes = await this.colorThemeStore.findThemeDataByExtensionLocation(extDevLocs[0]);
				if (devThemes.length) {
					return this.setColorTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
				}
			}
			let theme = await this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, DEFAULT_THEME_ID);

			const persistedColorScheme = this.storageService.get(PERSISTED_OS_COLOR_SCHEME, StorageScope.GLOBAL);
			const preferredColorScheme = this.getPreferredColorScheme();
			if (persistedColorScheme && preferredColorScheme && persistedColorScheme !== preferredColorScheme) {
				return this.applyPreferredColorTheme(preferredColorScheme);
			}
			return this.setColorTheme(theme && theme.id, undefined);
		};

		const initializeIconTheme = async () => {
			if (extDevLocs && extDevLocs.length === 1) { // in dev mode, switch to a theme provided by the extension under dev.
				const devThemes = await this.iconThemeStore.findThemeDataByExtensionLocation(extDevLocs[0]);
				if (devThemes.length) {
					return this.setFileIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
				}
			}
			const theme = await this.iconThemeStore.findThemeBySettingsId(iconThemeSetting);
			return this.setFileIconTheme(theme ? theme.id : DEFAULT_ICON_THEME_ID, undefined);
		};

		return Promise.all([initializeColorTheme(), initializeIconTheme()]);
	}

	private installConfigurationListener() {
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(COLOR_THEME_SETTING)) {
				let colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
				if (colorThemeSetting !== this.currentColorTheme.settingsId) {
					this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, undefined).then(theme => {
						if (theme) {
							this.setColorTheme(theme.id, undefined);
						}
					});
				}
			}
			if (e.affectsConfiguration(DETECT_COLOR_SCHEME_SETTING)) {
				this.handlePreferredSchemeUpdated();
			}
			if (e.affectsConfiguration(PREFERRED_DARK_THEME_SETTING) && this.getPreferredColorScheme() === DARK) {
				this.applyPreferredColorTheme(DARK);
			}
			if (e.affectsConfiguration(PREFERRED_LIGHT_THEME_SETTING) && this.getPreferredColorScheme() === LIGHT) {
				this.applyPreferredColorTheme(LIGHT);
			}
			if (e.affectsConfiguration(PREFERRED_HC_THEME_SETTING) && this.getPreferredColorScheme() === HIGH_CONTRAST) {
				this.applyPreferredColorTheme(HIGH_CONTRAST);
			}
			if (e.affectsConfiguration(ICON_THEME_SETTING)) {
				let iconThemeSetting = this.configurationService.getValue<string | null>(ICON_THEME_SETTING);
				if (iconThemeSetting !== this.currentIconTheme.settingsId) {
					this.iconThemeStore.findThemeBySettingsId(iconThemeSetting).then(theme => {
						this.setFileIconTheme(theme ? theme.id : DEFAULT_ICON_THEME_ID, undefined);
					});
				}
			}
			if (this.currentColorTheme) {
				let hasColorChanges = false;
				if (e.affectsConfiguration(CUSTOM_WORKBENCH_COLORS_SETTING)) {
					this.currentColorTheme.setCustomColors(this.colorCustomizations);
					hasColorChanges = true;
				}
				if (e.affectsConfiguration(CUSTOM_EDITOR_COLORS_SETTING)) {
					this.currentColorTheme.setCustomTokenColors(this.tokenColorCustomizations);
					hasColorChanges = true;
				}
				if (e.affectsConfiguration(CUSTOM_EDITOR_TOKENSTYLES_SETTING)) {
					this.currentColorTheme.setCustomTokenStyleRules(this.tokenStylesCustomizations);
					hasColorChanges = true;
				}
				if (hasColorChanges) {
					this.updateDynamicCSSRules(this.currentColorTheme);
					this.onColorThemeChange.fire(this.currentColorTheme);
				}
			}
		});
	}

	// preferred scheme handling

	private installPreferredSchemeListener() {
		window.matchMedia('(prefers-color-scheme: dark)').addListener(async () => this.handlePreferredSchemeUpdated());
	}

	private async handlePreferredSchemeUpdated() {
		const scheme = this.getPreferredColorScheme();
		this.storageService.store(PERSISTED_OS_COLOR_SCHEME, scheme, StorageScope.GLOBAL);
		if (scheme) {
			return this.applyPreferredColorTheme(scheme);
		}
		return undefined;
	}

	private getPreferredColorScheme(): ThemeType | undefined {
		let detectHCThemeSetting = this.configurationService.getValue<boolean>(DETECT_HC_SETTING);
		if (this.environmentService.configuration.highContrast && detectHCThemeSetting) {
			return HIGH_CONTRAST;
		}
		if (this.configurationService.getValue<boolean>(DETECT_COLOR_SCHEME_SETTING)) {
			if (window.matchMedia(`(prefers-color-scheme: light)`).matches) {
				return LIGHT;
			} else if (window.matchMedia(`(prefers-color-scheme: dark)`).matches) {
				return DARK;
			}
		}
		return undefined;
	}

	private async applyPreferredColorTheme(type: ThemeType): Promise<IColorTheme | null> {
		const settingId = type === DARK ? PREFERRED_DARK_THEME_SETTING : type === LIGHT ? PREFERRED_LIGHT_THEME_SETTING : PREFERRED_HC_THEME_SETTING;
		const themeSettingId = this.configurationService.getValue<string>(settingId);
		if (themeSettingId) {
			const theme = await this.colorThemeStore.findThemeDataBySettingsId(themeSettingId, undefined);
			if (theme) {
				return this.setColorTheme(theme.id, 'auto');
			}
		}
		return null;
	}

	public getColorTheme(): IColorTheme {
		return this.currentColorTheme;
	}

	public getColorThemes(): Promise<IColorTheme[]> {
		return this.colorThemeStore.getColorThemes();
	}

	public getTheme(): ITheme {
		return this.getColorTheme();
	}

	public setColorTheme(themeId: string | undefined, settingsTarget: ConfigurationTarget | undefined | 'auto'): Promise<IColorTheme | null> {
		if (!themeId) {
			return Promise.resolve(null);
		}
		if (themeId === this.currentColorTheme.id && this.currentColorTheme.isLoaded) {
			return this.writeColorThemeConfiguration(settingsTarget);
		}

		themeId = validateThemeId(themeId); // migrate theme ids

		return this.colorThemeStore.findThemeData(themeId, DEFAULT_THEME_ID).then(themeData => {
			if (!themeData) {
				return null;
			}
			return themeData.ensureLoaded(this.extensionResourceLoaderService).then(_ => {
				if (themeId === this.currentColorTheme.id && !this.currentColorTheme.isLoaded && this.currentColorTheme.hasEqualData(themeData)) {
					this.currentColorTheme.clearCaches();
					// the loaded theme is identical to the perisisted theme. Don't need to send an event.
					this.currentColorTheme = themeData;
					themeData.setCustomColors(this.colorCustomizations);
					themeData.setCustomTokenColors(this.tokenColorCustomizations);
					themeData.setCustomTokenStyleRules(this.tokenStylesCustomizations);
					return Promise.resolve(themeData);
				}
				themeData.setCustomColors(this.colorCustomizations);
				themeData.setCustomTokenColors(this.tokenColorCustomizations);
				themeData.setCustomTokenStyleRules(this.tokenStylesCustomizations);
				this.updateDynamicCSSRules(themeData);
				return this.applyTheme(themeData, settingsTarget);
			}, error => {
				return Promise.reject(new Error(nls.localize('error.cannotloadtheme', "Unable to load {0}: {1}", themeData.location!.toString(), error.message)));
			});
		});
	}

	private async reloadCurrentColorTheme() {
		await this.currentColorTheme.reload(this.extensionResourceLoaderService);
		this.currentColorTheme.setCustomColors(this.colorCustomizations);
		this.currentColorTheme.setCustomTokenColors(this.tokenColorCustomizations);
		this.currentColorTheme.setCustomTokenStyleRules(this.tokenStylesCustomizations);
		this.updateDynamicCSSRules(this.currentColorTheme);
		this.applyTheme(this.currentColorTheme, undefined, false);
	}

	public restoreColorTheme() {
		let colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
		if (colorThemeSetting !== this.currentColorTheme.settingsId) {
			this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, undefined).then(theme => {
				if (theme) {
					this.setColorTheme(theme.id, undefined);
				}
			});
		}
	}

	private updateDynamicCSSRules(themeData: ITheme) {
		const cssRules = new Set<string>();
		const ruleCollector = {
			addRule: (rule: string) => {
				if (!cssRules.has(rule)) {
					cssRules.add(rule);
				}
			}
		};
		themingRegistry.getThemingParticipants().forEach(p => p(themeData, ruleCollector, this.environmentService));
		_applyRules([...cssRules].join('\n'), colorThemeRulesClassName);
	}

	private applyTheme(newTheme: ColorThemeData, settingsTarget: ConfigurationTarget | undefined | 'auto', silent = false): Promise<IColorTheme | null> {
		if (this.currentColorTheme.id) {
			removeClasses(this.container, this.currentColorTheme.id);
		} else {
			removeClasses(this.container, VS_DARK_THEME, VS_LIGHT_THEME, VS_HC_THEME);
		}
		addClasses(this.container, newTheme.id);

		this.currentColorTheme.clearCaches();
		this.currentColorTheme = newTheme;
		if (!this.themingParticipantChangeListener) {
			this.themingParticipantChangeListener = themingRegistry.onThemingParticipantAdded(_ => this.updateDynamicCSSRules(this.currentColorTheme));
		}

		if (this.fileService && !resources.isEqual(newTheme.location, this.watchedColorThemeLocation)) {
			dispose(this.watchedColorThemeDisposable);
			this.watchedColorThemeLocation = undefined;

			if (newTheme.location && (newTheme.watch || !!this.environmentService.extensionDevelopmentLocationURI)) {
				this.watchedColorThemeLocation = newTheme.location;
				this.watchedColorThemeDisposable = this.fileService.watch(newTheme.location);
			}
		}

		this.sendTelemetry(newTheme.id, newTheme.extensionData, 'color');

		if (silent) {
			return Promise.resolve(null);
		}

		this.onColorThemeChange.fire(this.currentColorTheme);

		// remember theme data for a quick restore
		if (newTheme.isLoaded) {
			this.storageService.store(PERSISTED_THEME_STORAGE_KEY, newTheme.toStorageData(), StorageScope.GLOBAL);
		}

		return this.writeColorThemeConfiguration(settingsTarget);
	}

	private writeColorThemeConfiguration(settingsTarget: ConfigurationTarget | undefined | 'auto'): Promise<IColorTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.writeConfiguration(COLOR_THEME_SETTING, this.currentColorTheme.settingsId, settingsTarget).then(_ => this.currentColorTheme);
		}
		return Promise.resolve(this.currentColorTheme);
	}

	private themeExtensionsActivated = new Map<string, boolean>();
	private sendTelemetry(themeId: string, themeData: ExtensionData | undefined, themeType: string) {
		if (themeData) {
			let key = themeType + themeData.extensionId;
			if (!this.themeExtensionsActivated.get(key)) {
				type ActivatePluginClassification = {
					id: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
					name: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
					isBuiltin: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
					publisherDisplayName: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
					themeId: { classification: 'PublicNonPersonalData', purpose: 'FeatureInsight' };
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

	public getFileIconThemes(): Promise<IFileIconTheme[]> {
		return this.iconThemeStore.getFileIconThemes();
	}

	public getFileIconTheme() {
		return this.currentIconTheme;
	}

	public getIconTheme() {
		return this.currentIconTheme;
	}

	public setFileIconTheme(iconTheme: string | undefined, settingsTarget: ConfigurationTarget | undefined | 'auto'): Promise<IFileIconTheme> {
		iconTheme = iconTheme || '';
		if (iconTheme === this.currentIconTheme.id && this.currentIconTheme.isLoaded) {
			return this.writeFileIconConfiguration(settingsTarget);
		}
		let onApply = (newIconTheme: FileIconThemeData) => {
			this.doSetFileIconTheme(newIconTheme);

			// remember theme data for a quick restore
			if (newIconTheme.isLoaded && (!newIconTheme.location || !getRemoteAuthority(newIconTheme.location))) {
				this.storageService.store(PERSISTED_ICON_THEME_STORAGE_KEY, newIconTheme.toStorageData(), StorageScope.GLOBAL);
			}

			return this.writeFileIconConfiguration(settingsTarget);
		};

		return this.iconThemeStore.findThemeData(iconTheme).then(data => {
			const iconThemeData = data || FileIconThemeData.noIconTheme();
			return iconThemeData.ensureLoaded(this.fileService).then(_ => {
				return _applyIconTheme(iconThemeData, onApply);
			});
		});
	}

	private async reloadCurrentFileIconTheme() {
		await this.currentIconTheme.reload(this.fileService);
		_applyIconTheme(this.currentIconTheme, () => {
			this.doSetFileIconTheme(this.currentIconTheme);
			return Promise.resolve(this.currentIconTheme);
		});
	}

	public restoreFileIconTheme() {
		let fileIconThemeSetting = this.configurationService.getValue<string | null>(ICON_THEME_SETTING);
		if (fileIconThemeSetting !== this.currentIconTheme.settingsId) {
			this.iconThemeStore.findThemeBySettingsId(fileIconThemeSetting).then(theme => {
				if (theme) {
					this.setFileIconTheme(theme.id, undefined);
				}
			});
		}
	}

	private doSetFileIconTheme(iconThemeData: FileIconThemeData): void {
		this.currentIconTheme = iconThemeData;

		if (iconThemeData.id) {
			addClasses(this.container, fileIconsEnabledClass);
		} else {
			removeClasses(this.container, fileIconsEnabledClass);
		}

		if (this.fileService && !resources.isEqual(iconThemeData.location, this.watchedIconThemeLocation)) {
			dispose(this.watchedIconThemeDisposable);
			this.watchedIconThemeLocation = undefined;

			if (iconThemeData.location && (iconThemeData.watch || !!this.environmentService.extensionDevelopmentLocationURI)) {
				this.watchedIconThemeLocation = iconThemeData.location;
				this.watchedIconThemeDisposable = this.fileService.watch(iconThemeData.location);
			}
		}

		if (iconThemeData.id) {
			this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, 'fileIcon');
		}
		this.onFileIconThemeChange.fire(this.currentIconTheme);

	}

	private writeFileIconConfiguration(settingsTarget: ConfigurationTarget | undefined | 'auto'): Promise<IFileIconTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.writeConfiguration(ICON_THEME_SETTING, this.currentIconTheme.settingsId, settingsTarget).then(_ => this.currentIconTheme);
		}
		return Promise.resolve(this.currentIconTheme);
	}

	public writeConfiguration(key: string, value: any, settingsTarget: ConfigurationTarget | 'auto'): Promise<void> {
		let settings = this.configurationService.inspect(key);
		if (settingsTarget === 'auto') {
			if (!types.isUndefined(settings.workspaceFolderValue)) {
				settingsTarget = ConfigurationTarget.WORKSPACE_FOLDER;
			} else if (!types.isUndefined(settings.workspaceValue)) {
				settingsTarget = ConfigurationTarget.WORKSPACE;
			} else {
				settingsTarget = ConfigurationTarget.USER;
			}
		}

		if (settingsTarget === ConfigurationTarget.USER) {
			if (value === settings.userValue) {
				return Promise.resolve(undefined); // nothing to do
			} else if (value === settings.defaultValue) {
				if (types.isUndefined(settings.userValue)) {
					return Promise.resolve(undefined); // nothing to do
				}
				value = undefined; // remove configuration from user settings
			}
		} else if (settingsTarget === ConfigurationTarget.WORKSPACE || settingsTarget === ConfigurationTarget.WORKSPACE_FOLDER) {
			if (value === settings.value) {
				return Promise.resolve(undefined); // nothing to do
			}
		}
		return this.configurationService.updateValue(key, value, settingsTarget);
	}

	private getBaseThemeFromContainer() {
		for (let i = this.container.classList.length - 1; i >= 0; i--) {
			const item = this.container.classList.item(i);
			if (item === VS_LIGHT_THEME || item === VS_DARK_THEME || item === VS_HC_THEME) {
				return item;
			}
		}
		return VS_DARK_THEME;
	}
}

function _applyIconTheme(data: FileIconThemeData, onApply: (theme: FileIconThemeData) => Promise<IFileIconTheme>): Promise<IFileIconTheme> {
	_applyRules(data.styleSheetContent!, iconThemeRulesClassName);
	return onApply(data);
}

function _applyRules(styleSheetContent: string, rulesClassName: string) {
	let themeStyles = document.head.getElementsByClassName(rulesClassName);
	if (themeStyles.length === 0) {
		let elStyle = document.createElement('style');
		elStyle.type = 'text/css';
		elStyle.className = rulesClassName;
		elStyle.innerHTML = styleSheetContent;
		document.head.appendChild(elStyle);
	} else {
		(<HTMLStyleElement>themeStyles[0]).innerHTML = styleSheetContent;
	}
}

registerColorThemeSchemas();
registerFileIconThemeSchemas();

// Configuration: Themes
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const colorThemeSettingEnum: string[] = [];
const colorThemeSettingEnumDescriptions: string[] = [];

const colorThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	description: nls.localize('colorTheme', "Specifies the color theme used in the workbench."),
	default: DEFAULT_THEME_SETTING_VALUE,
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredDarkThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	description: nls.localize('preferredDarkColorTheme', 'Specifies the preferred color theme for dark OS appearance when \'{0}\' is enabled.', DETECT_COLOR_SCHEME_SETTING),
	default: DEFAULT_THEME_DARK_SETTING_VALUE,
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredLightThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	description: nls.localize('preferredLightColorTheme', 'Specifies the preferred color theme for light OS appearance when \'{0}\' is enabled.', DETECT_COLOR_SCHEME_SETTING),
	default: DEFAULT_THEME_LIGHT_SETTING_VALUE,
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredHCThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	description: nls.localize('preferredHCColorTheme', 'Specifies the preferred color theme used in high contrast mode when \'{0}\' is enabled.', DETECT_HC_SETTING),
	default: DEFAULT_THEME_HC_SETTING_VALUE,
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const detectColorSchemeSettingSchema: IConfigurationPropertySchema = {
	type: 'boolean',
	description: nls.localize('detectColorScheme', 'If set, automatically switch to the preferred color theme based on the OS appearance.'),
	default: false
};

const iconThemeSettingSchema: IConfigurationPropertySchema = {
	type: ['string', 'null'],
	default: DEFAULT_ICON_THEME_SETTING_VALUE,
	description: nls.localize('iconTheme', "Specifies the icon theme used in the workbench or 'null' to not show any file icons."),
	enum: [null],
	enumDescriptions: [nls.localize('noIconThemeDesc', 'No file icons')],
	errorMessage: nls.localize('iconThemeError', "File icon theme is unknown or not installed.")
};
const colorCustomizationsSchema: IConfigurationPropertySchema = {
	type: 'object',
	description: nls.localize('workbenchColors', "Overrides colors from the currently selected color theme."),
	allOf: [{ $ref: workbenchColorsSchemaId }],
	default: {},
	defaultSnippets: [{
		body: {
		}
	}]
};

const themeSettingsConfiguration: IConfigurationNode = {
	id: 'workbench',
	order: 7.1,
	type: 'object',
	properties: {
		[COLOR_THEME_SETTING]: colorThemeSettingSchema,
		[PREFERRED_DARK_THEME_SETTING]: preferredDarkThemeSettingSchema,
		[PREFERRED_LIGHT_THEME_SETTING]: preferredLightThemeSettingSchema,
		[PREFERRED_HC_THEME_SETTING]: preferredHCThemeSettingSchema,
		[DETECT_COLOR_SCHEME_SETTING]: detectColorSchemeSettingSchema,
		[ICON_THEME_SETTING]: iconThemeSettingSchema,
		[CUSTOM_WORKBENCH_COLORS_SETTING]: colorCustomizationsSchema
	}
};
configurationRegistry.registerConfiguration(themeSettingsConfiguration);

function tokenGroupSettings(description: string): IJSONSchema {
	return {
		description,
		$ref: textmateColorGroupSchemaId
	};
}

const tokenColorSchema: IJSONSchema = {
	properties: {
		comments: tokenGroupSettings(nls.localize('editorColors.comments', "Sets the colors and styles for comments")),
		strings: tokenGroupSettings(nls.localize('editorColors.strings', "Sets the colors and styles for strings literals.")),
		keywords: tokenGroupSettings(nls.localize('editorColors.keywords', "Sets the colors and styles for keywords.")),
		numbers: tokenGroupSettings(nls.localize('editorColors.numbers', "Sets the colors and styles for number literals.")),
		types: tokenGroupSettings(nls.localize('editorColors.types', "Sets the colors and styles for type declarations and references.")),
		functions: tokenGroupSettings(nls.localize('editorColors.functions', "Sets the colors and styles for functions declarations and references.")),
		variables: tokenGroupSettings(nls.localize('editorColors.variables', "Sets the colors and styles for variables declarations and references.")),
		textMateRules: {
			description: nls.localize('editorColors.textMateRules', 'Sets colors and styles using textmate theming rules (advanced).'),
			$ref: textmateColorsSchemaId
		}
	}
};
const tokenColorCustomizationSchema: IConfigurationPropertySchema = {
	description: nls.localize('editorColors', "Overrides editor colors and font style from the currently selected color theme."),
	default: {},
	allOf: [tokenColorSchema]
};
const experimentalTokenStylingCustomizationSchema: IConfigurationPropertySchema = {
	description: nls.localize('editorColorsTokenStyles', "Overrides token color and styles from the currently selected color theme."),
	default: {},
	allOf: [{ $ref: tokenStylingSchemaId }]
};
const tokenColorCustomizationConfiguration: IConfigurationNode = {
	id: 'editor',
	order: 7.2,
	type: 'object',
	properties: {
		[CUSTOM_EDITOR_COLORS_SETTING]: tokenColorCustomizationSchema,
		[CUSTOM_EDITOR_TOKENSTYLES_SETTING]: experimentalTokenStylingCustomizationSchema
	}
};
configurationRegistry.registerConfiguration(tokenColorCustomizationConfiguration);

registerSingleton(IWorkbenchThemeService, WorkbenchThemeService);
