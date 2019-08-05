/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchThemeService, IColorTheme, ITokenColorCustomizations, IFileIconTheme, ExtensionData, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME, COLOR_THEME_SETTING, ICON_THEME_SETTING, CUSTOM_WORKBENCH_COLORS_SETTING, CUSTOM_EDITOR_COLORS_SETTING, DETECT_HC_SETTING, HC_THEME_ID, IColorCustomizations } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/registry/common/platform';
import * as errors from 'vs/base/common/errors';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { ITheme, Extensions as ThemingExtensions, IThemingRegistry } from 'vs/platform/theme/common/themeService';
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
import { textmateColorsSchemaId, registerColorThemeSchemas, textmateColorSettingsSchemaId } from 'vs/workbench/services/themes/common/colorThemeSchema';
import { workbenchColorsSchemaId } from 'vs/platform/theme/common/colorRegistry';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { getRemoteAuthority } from 'vs/platform/remote/common/remoteHosts';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';
const DEFAULT_THEME_SETTING_VALUE = 'Default Dark+';

const PERSISTED_THEME_STORAGE_KEY = 'colorThemeData';
const PERSISTED_ICON_THEME_STORAGE_KEY = 'iconThemeData';

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
	_serviceBrand: any;

	private colorThemeStore: ColorThemeStore;
	private currentColorTheme: ColorThemeData;
	private container: HTMLElement;
	private readonly onColorThemeChange: Emitter<IColorTheme>;
	private watchedColorThemeLocation: URI | undefined;
	private watchedColorThemeDisposable: IDisposable;

	private iconThemeStore: FileIconThemeStore;
	private currentIconTheme: FileIconThemeData;
	private readonly onFileIconThemeChange: Emitter<IFileIconTheme>;
	private watchedIconThemeLocation: URI | undefined;
	private watchedIconThemeDisposable: IDisposable;

	private themingParticipantChangeListener: IDisposable;

	private get colorCustomizations(): IColorCustomizations {
		return this.configurationService.getValue<IColorCustomizations>(CUSTOM_WORKBENCH_COLORS_SETTING) || {};
	}

	private get tokenColorCustomizations(): ITokenColorCustomizations {
		return this.configurationService.getValue<ITokenColorCustomizations>(CUSTOM_EDITOR_COLORS_SETTING) || {};
	}

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchLayoutService readonly layoutService: IWorkbenchLayoutService
	) {

		this.container = layoutService.getWorkbenchContainer();
		this.colorThemeStore = new ColorThemeStore(extensionService, ColorThemeData.createLoadedEmptyTheme(DEFAULT_THEME_ID, DEFAULT_THEME_SETTING_VALUE));
		this.onFileIconThemeChange = new Emitter<IFileIconTheme>();
		this.iconThemeStore = new FileIconThemeStore(extensionService);
		this.onColorThemeChange = new Emitter<IColorTheme>({ leakWarningThreshold: 400 });

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
		});

		let prevColorId: string | undefined = undefined;

		// update settings schema setting for theme specific settings
		this.colorThemeStore.onDidChange(async event => {
			// updates enum for the 'workbench.colorTheme` setting
			colorThemeSettingSchema.enum = event.themes.map(t => t.settingsId);
			colorThemeSettingSchema.enumDescriptions = event.themes.map(t => t.description || '');

			const themeSpecificWorkbenchColors: IJSONSchema = { properties: {} };
			const themeSpecificTokenColors: IJSONSchema = { properties: {} };

			const workbenchColors = { $ref: workbenchColorsSchemaId, additionalProperties: false };
			const tokenColors = { properties: tokenColorSchema.properties, additionalProperties: false };
			for (let t of event.themes) {
				// add theme specific color customization ("[Abyss]":{ ... })
				const themeId = `[${t.settingsId}]`;
				themeSpecificWorkbenchColors.properties![themeId] = workbenchColors;
				themeSpecificTokenColors.properties![themeId] = tokenColors;
			}

			colorCustomizationsSchema.allOf![1] = themeSpecificWorkbenchColors;
			tokenColorCustomizationSchema.allOf![1] = themeSpecificTokenColors;

			configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration, tokenColorCustomizationConfiguration);

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
					}
				}
			}
		});

		let prevFileIconId: string | undefined = undefined;
		this.iconThemeStore.onDidChange(async event => {
			iconThemeSettingSchema.enum = [null, ...event.themes.map(t => t.settingsId)];
			iconThemeSettingSchema.enumDescriptions = [iconThemeSettingSchema.enumDescriptions![0], ...event.themes.map(t => t.description || '')];
			configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);

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
					}
				}
			}
		});

		this.fileService.onFileChanges(async e => {
			if (this.watchedColorThemeLocation && this.currentColorTheme && e.contains(this.watchedColorThemeLocation, FileChangeType.UPDATED)) {
				await this.currentColorTheme.reload(this.fileService);
				this.currentColorTheme.setCustomColors(this.colorCustomizations);
				this.currentColorTheme.setCustomTokenColors(this.tokenColorCustomizations);
				this.updateDynamicCSSRules(this.currentColorTheme);
				this.applyTheme(this.currentColorTheme, undefined, false);
			}
			if (this.watchedIconThemeLocation && this.currentIconTheme && e.contains(this.watchedIconThemeLocation, FileChangeType.UPDATED)) {
				await this.currentIconTheme.reload(this.fileService);
				_applyIconTheme(this.currentIconTheme, () => {
					this.doSetFileIconTheme(this.currentIconTheme);
					return Promise.resolve(this.currentIconTheme);
				});
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
		let detectHCThemeSetting = this.configurationService.getValue<boolean>(DETECT_HC_SETTING);

		let colorThemeSetting: string;
		if (this.environmentService.configuration.highContrast && detectHCThemeSetting) {
			colorThemeSetting = HC_THEME_ID;
		} else {
			colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
		}

		let iconThemeSetting = this.configurationService.getValue<string | null>(ICON_THEME_SETTING);

		const extDevLocs = this.environmentService.extensionDevelopmentLocationURI;
		let uri: URI | undefined;
		if (extDevLocs && extDevLocs.length > 0) {
			// if there are more than one ext dev paths, use first
			uri = extDevLocs[0];
		}

		return Promise.all([
			this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, DEFAULT_THEME_ID).then(theme => {
				return this.colorThemeStore.findThemeDataByParentLocation(uri).then(devThemes => {
					if (devThemes.length) {
						return this.setColorTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
					} else {
						return this.setColorTheme(theme && theme.id, undefined);
					}
				});
			}),
			this.iconThemeStore.findThemeBySettingsId(iconThemeSetting).then(theme => {
				return this.iconThemeStore.findThemeDataByParentLocation(uri).then(devThemes => {
					if (devThemes.length) {
						return this.setFileIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
					} else {
						return this.setFileIconTheme(theme ? theme.id : DEFAULT_ICON_THEME_ID, undefined);
					}
				});
			}),
		]);
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
				if (hasColorChanges) {
					this.updateDynamicCSSRules(this.currentColorTheme);
					this.onColorThemeChange.fire(this.currentColorTheme);
				}
			}
		});
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

		return this.colorThemeStore.findThemeData(themeId, DEFAULT_THEME_ID).then(data => {
			if (!data) {
				return null;
			}
			const themeData = data;
			return themeData.ensureLoaded(this.fileService).then(_ => {
				if (themeId === this.currentColorTheme.id && !this.currentColorTheme.isLoaded && this.currentColorTheme.hasEqualData(themeData)) {
					// the loaded theme is identical to the perisisted theme. Don't need to send an event.
					this.currentColorTheme = themeData;
					themeData.setCustomColors(this.colorCustomizations);
					themeData.setCustomTokenColors(this.tokenColorCustomizations);
					return Promise.resolve(themeData);
				}
				themeData.setCustomColors(this.colorCustomizations);
				themeData.setCustomTokenColors(this.tokenColorCustomizations);
				this.updateDynamicCSSRules(themeData);
				return this.applyTheme(themeData, settingsTarget);
			}, error => {
				return Promise.reject(new Error(nls.localize('error.cannotloadtheme', "Unable to load {0}: {1}", themeData.location!.toString(), error.message)));
			});
		});
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
		if (this.currentColorTheme) {
			removeClasses(this.container, this.currentColorTheme.id);
		} else {
			removeClasses(this.container, VS_DARK_THEME, VS_LIGHT_THEME, VS_HC_THEME);
		}
		addClasses(this.container, newTheme.id);

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
			if (!types.isUndefined(settings.workspaceFolder)) {
				settingsTarget = ConfigurationTarget.WORKSPACE_FOLDER;
			} else if (!types.isUndefined(settings.workspace)) {
				settingsTarget = ConfigurationTarget.WORKSPACE;
			} else {
				settingsTarget = ConfigurationTarget.USER;
			}
		}

		if (settingsTarget === ConfigurationTarget.USER) {
			if (value === settings.user) {
				return Promise.resolve(undefined); // nothing to do
			} else if (value === settings.default) {
				if (types.isUndefined(settings.user)) {
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

const colorThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	description: nls.localize('colorTheme', "Specifies the color theme used in the workbench."),
	default: DEFAULT_THEME_SETTING_VALUE,
	enum: [],
	enumDescriptions: [],
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
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
		[ICON_THEME_SETTING]: iconThemeSettingSchema,
		[CUSTOM_WORKBENCH_COLORS_SETTING]: colorCustomizationsSchema
	}
};
configurationRegistry.registerConfiguration(themeSettingsConfiguration);

function tokenGroupSettings(description: string) {
	return {
		description,
		default: '#FF0000',
		anyOf: [
			{
				type: 'string',
				format: 'color-hex'
			},
			{
				$ref: textmateColorSettingsSchemaId
			}
		]
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
const tokenColorCustomizationConfiguration: IConfigurationNode = {
	id: 'editor',
	order: 7.2,
	type: 'object',
	properties: {
		[CUSTOM_EDITOR_COLORS_SETTING]: tokenColorCustomizationSchema
	}
};
configurationRegistry.registerConfiguration(tokenColorCustomizationConfiguration);

registerSingleton(IWorkbenchThemeService, WorkbenchThemeService);
