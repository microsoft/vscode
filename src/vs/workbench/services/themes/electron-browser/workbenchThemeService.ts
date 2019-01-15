/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchThemeService, IColorTheme, ITokenColorCustomizations, IFileIconTheme, ExtensionData, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME, COLOR_THEME_SETTING, ICON_THEME_SETTING, CUSTOM_WORKBENCH_COLORS_SETTING, CUSTOM_EDITOR_COLORS_SETTING, CUSTOM_EDITOR_SCOPE_COLORS_SETTING, DETECT_HC_SETTING, HC_THEME_ID } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/registry/common/platform';
import * as errors from 'vs/base/common/errors';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ColorThemeData } from './colorThemeData';
import { ITheme, Extensions as ThemingExtensions, IThemingRegistry } from 'vs/platform/theme/common/themeService';
import { Event, Emitter } from 'vs/base/common/event';
import * as colorThemeSchema from 'vs/workbench/services/themes/common/colorThemeSchema';
import * as fileIconThemeSchema from 'vs/workbench/services/themes/common/fileIconThemeSchema';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ColorThemeStore } from 'vs/workbench/services/themes/electron-browser/colorThemeStore';
import { FileIconThemeStore } from 'vs/workbench/services/themes/electron-browser/fileIconThemeStore';
import { FileIconThemeData } from 'vs/workbench/services/themes/electron-browser/fileIconThemeData';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { removeClasses, addClasses } from 'vs/base/browser/dom';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';
const DEFAULT_THEME_SETTING_VALUE = 'Default Dark+';

const PERSISTED_THEME_STORAGE_KEY = 'colorThemeData';
const PERSISTED_ICON_THEME_STORAGE_KEY = 'iconThemeData';

const defaultThemeExtensionId = 'vscode-theme-defaults';
const oldDefaultThemeExtensionId = 'vscode-theme-colorful-defaults';

const DEFAULT_ICON_THEME_SETTING_VALUE = 'vs-seti';
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

export interface IColorCustomizations {
	[colorIdOrThemeSettingsId: string]: string | IColorCustomizations;
}

export class WorkbenchThemeService implements IWorkbenchThemeService {
	_serviceBrand: any;

	private fileService: IFileService;

	private colorThemeStore: ColorThemeStore;
	private currentColorTheme: ColorThemeData;
	private container: HTMLElement;
	private readonly onColorThemeChange: Emitter<IColorTheme>;

	private iconThemeStore: FileIconThemeStore;
	private currentIconTheme: IFileIconTheme;
	private readonly onFileIconThemeChange: Emitter<IFileIconTheme>;

	private themingParticipantChangeListener: IDisposable;
	private _configurationWriter: ConfigurationWriter;

	private get colorCustomizations(): IColorCustomizations {
		return this.configurationService.getValue<IColorCustomizations>(CUSTOM_WORKBENCH_COLORS_SETTING) || {};
	}

	private get tokenColorCustomizations(): ITokenColorCustomizations {
		return this.configurationService.getValue<ITokenColorCustomizations>(CUSTOM_EDITOR_COLORS_SETTING) || {};
	}

	constructor(
		container: HTMLElement,
		@IExtensionService extensionService: IExtensionService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWindowService private readonly windowService: IWindowService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {

		this.container = container;
		this.colorThemeStore = new ColorThemeStore(extensionService, ColorThemeData.createLoadedEmptyTheme(DEFAULT_THEME_ID, DEFAULT_THEME_SETTING_VALUE));
		this.onFileIconThemeChange = new Emitter<IFileIconTheme>();
		this.iconThemeStore = new FileIconThemeStore(extensionService);
		this.onColorThemeChange = new Emitter<IColorTheme>();

		this.currentIconTheme = {
			id: '',
			label: '',
			settingsId: null,
			isLoaded: false,
			hasFileIcons: false,
			hasFolderIcons: false,
			hidesExplorerArrows: false,
			extensionData: null
		};

		// In order to avoid paint flashing for tokens, because
		// themes are loaded asynchronously, we need to initialize
		// a color theme document with good defaults until the theme is loaded
		let themeData: ColorThemeData | null = null;
		let persistedThemeData = this.storageService.get(PERSISTED_THEME_STORAGE_KEY, StorageScope.GLOBAL);
		if (persistedThemeData) {
			themeData = ColorThemeData.fromStorageData(persistedThemeData);
		}
		let containerBaseTheme = this.getBaseThemeFromContainer();
		if (!themeData || themeData && themeData.baseTheme !== containerBaseTheme) {
			themeData = ColorThemeData.createUnloadedTheme(containerBaseTheme);
		}
		themeData.setCustomColors(this.colorCustomizations);
		themeData.setCustomTokenColors(this.tokenColorCustomizations);
		this.updateDynamicCSSRules(themeData);
		this.applyTheme(themeData, null, true);

		let iconData: FileIconThemeData | null = null;
		let persistedIconThemeData = this.storageService.get(PERSISTED_ICON_THEME_STORAGE_KEY, StorageScope.GLOBAL);
		if (persistedIconThemeData) {
			iconData = FileIconThemeData.fromStorageData(persistedIconThemeData);
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

		// update settings schema setting
		this.colorThemeStore.onDidChange(themes => {
			const enumDescription = themeData.description || '';

			colorCustomizationsSchema.properties = colorThemeSchema.colorsSchema.properties;
			const copyColorCustomizationsSchema = { ...colorCustomizationsSchema };
			copyColorCustomizationsSchema.properties = { ...colorThemeSchema.colorsSchema.properties };

			customEditorColorSchema.properties = customEditorColorConfigurationProperties;
			const copyCustomEditorColorSchema = { ...customEditorColorSchema };
			copyCustomEditorColorSchema.properties = { ...customEditorColorConfigurationProperties };

			themes.forEach(t => {
				colorThemeSettingSchema.enum.push(t.settingsId);
				colorThemeSettingSchema.enumDescriptions.push(enumDescription);
				const themeId = `[${t.settingsId}]`;
				colorCustomizationsSchema.properties[themeId] = copyColorCustomizationsSchema;
				customEditorColorSchema.properties[themeId] = copyCustomEditorColorSchema;
			});

			configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
			configurationRegistry.notifyConfigurationSchemaUpdated(customEditorColorConfiguration);
		});
		this.iconThemeStore.onDidChange(themes => {
			iconThemeSettingSchema.enum = [null, ...themes.map(t => t.settingsId)];
			iconThemeSettingSchema.enumDescriptions = [iconThemeSettingSchema.enumDescriptions[0], ...themes.map(t => themeData.description || '')];
			configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
		});
	}

	acquireFileService(fileService: IFileService): void {
		this.fileService = fileService;
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

	private initialize(): Promise<[IColorTheme, IFileIconTheme]> {
		let detectHCThemeSetting = this.configurationService.getValue<boolean>(DETECT_HC_SETTING);

		let colorThemeSetting: string;
		if (this.windowService.getConfiguration().highContrast && detectHCThemeSetting) {
			colorThemeSetting = HC_THEME_ID;
		} else {
			colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
		}

		let iconThemeSetting = this.configurationService.getValue<string>(ICON_THEME_SETTING) || '';

		return Promise.all([
			this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, DEFAULT_THEME_ID).then(theme => {
				return this.setColorTheme(theme && theme.id, null);
			}),
			this.iconThemeStore.findThemeBySettingsId(iconThemeSetting).then(theme => {
				return this.setFileIconTheme(theme && theme.id, null);
			}),
		]);
	}

	private installConfigurationListener() {
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(COLOR_THEME_SETTING)) {
				let colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
				if (colorThemeSetting !== this.currentColorTheme.settingsId) {
					this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, null).then(theme => {
						if (theme) {
							this.setColorTheme(theme.id, null);
						}
					});
				}
			}
			if (e.affectsConfiguration(ICON_THEME_SETTING)) {
				let iconThemeSetting = this.configurationService.getValue<string>(ICON_THEME_SETTING) || '';
				if (iconThemeSetting !== this.currentIconTheme.settingsId) {
					this.iconThemeStore.findThemeBySettingsId(iconThemeSetting).then(theme => {
						this.setFileIconTheme(theme && theme.id, null);
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

	public setColorTheme(themeId: string, settingsTarget: ConfigurationTarget | null): Promise<IColorTheme | null> {
		if (!themeId) {
			return Promise.resolve(null);
		}
		if (themeId === this.currentColorTheme.id && this.currentColorTheme.isLoaded) {
			return this.writeColorThemeConfiguration(settingsTarget);
		}

		themeId = validateThemeId(themeId); // migrate theme ids

		return this.colorThemeStore.findThemeData(themeId, DEFAULT_THEME_ID).then(themeData => {
			if (themeData) {
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
					return Promise.reject(new Error(nls.localize('error.cannotloadtheme', "Unable to load {0}: {1}", themeData.location.toString(), error.message)));
				});
			}
			return null;
		});
	}

	public restoreColorTheme() {
		let colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
		if (colorThemeSetting !== this.currentColorTheme.settingsId) {
			this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, null).then(theme => {
				if (theme) {
					this.setColorTheme(theme.id, null);
				}
			});
		}
	}

	private updateDynamicCSSRules(themeData: ITheme) {
		let cssRules: string[] = [];
		let hasRule: { [rule: string]: boolean } = {};
		let ruleCollector = {
			addRule: (rule: string) => {
				if (!hasRule[rule]) {
					cssRules.push(rule);
					hasRule[rule] = true;
				}
			}
		};
		themingRegistry.getThemingParticipants().forEach(p => p(themeData, ruleCollector, this.environmentService));
		_applyRules(cssRules.join('\n'), colorThemeRulesClassName);
	}

	private applyTheme(newTheme: ColorThemeData, settingsTarget: ConfigurationTarget, silent = false): Promise<IColorTheme | null> {
		if (this.container) {
			if (this.currentColorTheme) {
				removeClasses(this.container, this.currentColorTheme.id);
			} else {
				removeClasses(this.container, VS_DARK_THEME, VS_LIGHT_THEME, VS_HC_THEME);
			}
			addClasses(this.container, newTheme.id);
		}
		this.currentColorTheme = newTheme;
		if (!this.themingParticipantChangeListener) {
			this.themingParticipantChangeListener = themingRegistry.onThemingParticipantAdded(p => this.updateDynamicCSSRules(this.currentColorTheme));
		}

		this.sendTelemetry(newTheme.id, newTheme.extensionData, 'color');

		if (silent) {
			return Promise.resolve(null);
		}

		this.onColorThemeChange.fire(this.currentColorTheme);

		// remember theme data for a quick restore
		this.storageService.store(PERSISTED_THEME_STORAGE_KEY, newTheme.toStorageData(), StorageScope.GLOBAL);

		return this.writeColorThemeConfiguration(settingsTarget);
	}

	private writeColorThemeConfiguration(settingsTarget: ConfigurationTarget): Promise<IColorTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.configurationWriter.writeConfiguration(COLOR_THEME_SETTING, this.currentColorTheme.settingsId, settingsTarget).then(_ => this.currentColorTheme);
		}
		return Promise.resolve(this.currentColorTheme);
	}

	private themeExtensionsActivated = new Map<string, boolean>();
	private sendTelemetry(themeId: string, themeData: ExtensionData, themeType: string) {
		if (themeData) {
			let key = themeType + themeData.extensionId;
			if (!this.themeExtensionsActivated.get(key)) {
				/* __GDPR__
					"activatePlugin" : {
						"id" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
						"name": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
						"isBuiltin": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"publisherDisplayName": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"themeId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('activatePlugin', {
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

	public setFileIconTheme(iconTheme: string, settingsTarget: ConfigurationTarget): Promise<IFileIconTheme> {
		iconTheme = iconTheme || '';
		if (iconTheme === this.currentIconTheme.id && this.currentIconTheme.isLoaded) {
			return this.writeFileIconConfiguration(settingsTarget);
		}
		let onApply = (newIconTheme: FileIconThemeData) => {
			this.doSetFileIconTheme(newIconTheme);

			// remember theme data for a quick restore
			this.storageService.store(PERSISTED_ICON_THEME_STORAGE_KEY, newIconTheme.toStorageData(), StorageScope.GLOBAL);

			return this.writeFileIconConfiguration(settingsTarget);
		};

		return this.iconThemeStore.findThemeData(iconTheme).then(iconThemeData => {
			if (!iconThemeData) {
				iconThemeData = FileIconThemeData.noIconTheme();
			}
			return iconThemeData.ensureLoaded(this.fileService).then(_ => {
				return _applyIconTheme(iconThemeData, onApply);
			});
		});
	}

	private doSetFileIconTheme(iconThemeData: FileIconThemeData): void {
		this.currentIconTheme = iconThemeData;

		if (this.container) {
			if (iconThemeData.id) {
				addClasses(this.container, fileIconsEnabledClass);
			} else {
				removeClasses(this.container, fileIconsEnabledClass);
			}
		}
		if (iconThemeData.id) {
			this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, 'fileIcon');
		}
		this.onFileIconThemeChange.fire(this.currentIconTheme);

	}

	private writeFileIconConfiguration(settingsTarget: ConfigurationTarget): Promise<IFileIconTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.configurationWriter.writeConfiguration(ICON_THEME_SETTING, this.currentIconTheme.settingsId, settingsTarget).then(_ => this.currentIconTheme);
		}
		return Promise.resolve(this.currentIconTheme);
	}

	private get configurationWriter(): ConfigurationWriter {
		// separate out the ConfigurationWriter to avoid a dependency of the IConfigurationEditingService
		if (!this._configurationWriter) {
			this._configurationWriter = this.instantiationService.createInstance(ConfigurationWriter);
		}
		return this._configurationWriter;
	}

	private getBaseThemeFromContainer() {
		if (this.container) {
			for (let i = this.container.classList.length - 1; i >= 0; i--) {
				const item = document.body.classList.item(i);
				if (item === VS_LIGHT_THEME || item === VS_DARK_THEME || item === VS_HC_THEME) {
					return item;
				}
			}
		}
		return VS_DARK_THEME;
	}
}

function _applyIconTheme(data: FileIconThemeData, onApply: (theme: FileIconThemeData) => Promise<IFileIconTheme>): Promise<IFileIconTheme> {
	_applyRules(data.styleSheetContent, iconThemeRulesClassName);
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

colorThemeSchema.register();
fileIconThemeSchema.register();

class ConfigurationWriter {
	constructor(@IConfigurationService private readonly configurationService: IConfigurationService) {
	}

	public writeConfiguration(key: string, value: any, settingsTarget: ConfigurationTarget): Promise<void> {
		let settings = this.configurationService.inspect(key);
		if (settingsTarget === ConfigurationTarget.USER) {
			if (value === settings.user) {
				return Promise.resolve(undefined); // nothing to do
			} else if (value === settings.default) {
				if (types.isUndefined(settings.user)) {
					return Promise.resolve(undefined); // nothing to do
				}
				value = undefined; // remove configuration from user settings
			}
		} else if (settingsTarget === ConfigurationTarget.WORKSPACE) {
			if (value === settings.value) {
				return Promise.resolve(undefined); // nothing to do
			}
		}
		return this.configurationService.updateValue(key, value, settingsTarget);
	}
}

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
	properties: {},
	additionalProperties: false,
	default: {},
	defaultSnippets: [{
		body: {
			'statusBar.background': '#666666',
			'panel.background': '#555555',
			'sideBar.background': '#444444'
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
			colorThemeSchema.tokenColorizationSettingSchema
		]
	};
}

const customEditorColorConfigurationProperties = {
	comments: tokenGroupSettings(nls.localize('editorColors.comments', "Sets the colors and styles for comments")),
	strings: tokenGroupSettings(nls.localize('editorColors.strings', "Sets the colors and styles for strings literals.")),
	keywords: tokenGroupSettings(nls.localize('editorColors.keywords', "Sets the colors and styles for keywords.")),
	numbers: tokenGroupSettings(nls.localize('editorColors.numbers', "Sets the colors and styles for number literals.")),
	types: tokenGroupSettings(nls.localize('editorColors.types', "Sets the colors and styles for type declarations and references.")),
	functions: tokenGroupSettings(nls.localize('editorColors.functions', "Sets the colors and styles for functions declarations and references.")),
	variables: tokenGroupSettings(nls.localize('editorColors.variables', "Sets the colors and styles for variables declarations and references.")),
	[CUSTOM_EDITOR_SCOPE_COLORS_SETTING]: colorThemeSchema.tokenColorsSchema(nls.localize('editorColors.textMateRules', 'Sets colors and styles using textmate theming rules (advanced).'))
};
const customEditorColorSchema: IConfigurationPropertySchema = {
	description: nls.localize('editorColors', "Overrides editor colors and font style from the currently selected color theme."),
	default: {},
	additionalProperties: false,
	properties: {}
};
const customEditorColorConfiguration: IConfigurationNode = {
	id: 'editor',
	order: 7.2,
	type: 'object',
	properties: {
		[CUSTOM_EDITOR_COLORS_SETTING]: customEditorColorSchema
	}
};
configurationRegistry.registerConfiguration(customEditorColorConfiguration);

