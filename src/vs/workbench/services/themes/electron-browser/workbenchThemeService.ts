/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchThemeService, IColorTheme, ITokenColorCustomizations, IFileIconTheme, ExtensionData, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME, COLOR_THEME_SETTING, ICON_THEME_SETTING, CUSTOM_WORKBENCH_COLORS_SETTING, CUSTOM_EDITOR_COLORS_SETTING, CUSTOM_EDITOR_SCOPE_COLORS_SETTING, DETECT_HC_SETTING, HC_THEME_ID } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/registry/common/platform';
import * as errors from 'vs/base/common/errors';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ColorThemeData } from './colorThemeData';
import { ITheme, Extensions as ThemingExtensions, IThemingRegistry } from 'vs/platform/theme/common/themeService';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';

import { $ } from 'vs/base/browser/builder';
import { Event, Emitter } from 'vs/base/common/event';

import * as colorThemeSchema from 'vs/workbench/services/themes/common/colorThemeSchema';
import * as fileIconThemeSchema from 'vs/workbench/services/themes/common/fileIconThemeSchema';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IBroadcastService } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { ColorThemeStore } from 'vs/workbench/services/themes/electron-browser/colorThemeStore';
import { FileIconThemeStore } from 'vs/workbench/services/themes/electron-browser/fileIconThemeStore';
import { FileIconThemeData } from 'vs/workbench/services/themes/electron-browser/fileIconThemeData';
import { IWindowService } from 'vs/platform/windows/common/windows';

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
		@IStorageService private storageService: IStorageService,
		@IBroadcastService private broadcastService: IBroadcastService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWindowService private windowService: IWindowService,
		@IInstantiationService private instantiationService: IInstantiationService) {

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
		let themeData: ColorThemeData = null;
		let persistedThemeData = this.storageService.get(PERSISTED_THEME_STORAGE_KEY);
		if (persistedThemeData) {
			themeData = ColorThemeData.fromStorageData(persistedThemeData);
		}
		if (!themeData) {
			let isLightTheme = (Array.prototype.indexOf.call(document.body.classList, 'vs') >= 0);
			themeData = ColorThemeData.createUnloadedTheme(isLightTheme ? VS_LIGHT_THEME : VS_DARK_THEME);
		}
		themeData.setCustomColors(this.colorCustomizations);
		themeData.setCustomTokenColors(this.tokenColorCustomizations);
		this.updateDynamicCSSRules(themeData);
		this.applyTheme(themeData, null, true);

		let iconData: FileIconThemeData = null;
		let persistedIconThemeData = this.storageService.get(PERSISTED_ICON_THEME_STORAGE_KEY);
		if (persistedIconThemeData) {
			iconData = FileIconThemeData.fromStorageData(persistedIconThemeData);
			if (iconData) {
				_applyIconTheme(iconData, () => {
					this.doSetFileIconTheme(iconData);
					return TPromise.wrap(iconData);
				});
			}
		}

		this.initialize().then(null, errors.onUnexpectedError).then(_ => {
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

	public get onDidColorThemeChange(): Event<IColorTheme> {
		return this.onColorThemeChange.event;
	}

	public get onDidFileIconThemeChange(): Event<IFileIconTheme> {
		return this.onFileIconThemeChange.event;
	}

	public get onThemeChange(): Event<ITheme> {
		return this.onColorThemeChange.event;
	}

	private initialize(): TPromise<[IColorTheme, IFileIconTheme]> {
		let detectHCThemeSetting = this.configurationService.getValue<boolean>(DETECT_HC_SETTING);

		let colorThemeSetting: string;
		if (this.windowService.getConfiguration().highContrast && detectHCThemeSetting) {
			colorThemeSetting = HC_THEME_ID;
		} else {
			colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
		}

		let iconThemeSetting = this.configurationService.getValue<string>(ICON_THEME_SETTING) || '';

		return Promise.join([
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

	public getColorThemes(): TPromise<IColorTheme[]> {
		return this.colorThemeStore.getColorThemes();
	}

	public getTheme(): ITheme {
		return this.getColorTheme();
	}

	public setColorTheme(themeId: string, settingsTarget: ConfigurationTarget): TPromise<IColorTheme> {
		if (!themeId) {
			return TPromise.as(null);
		}
		if (themeId === this.currentColorTheme.id && this.currentColorTheme.isLoaded) {
			return this.writeColorThemeConfiguration(settingsTarget);
		}

		themeId = validateThemeId(themeId); // migrate theme ids

		return this.colorThemeStore.findThemeData(themeId, DEFAULT_THEME_ID).then(themeData => {
			if (themeData) {
				return themeData.ensureLoaded(this).then(_ => {
					if (themeId === this.currentColorTheme.id && !this.currentColorTheme.isLoaded && this.currentColorTheme.hasEqualData(themeData)) {
						// the loaded theme is identical to the perisisted theme. Don't need to send an event.
						this.currentColorTheme = themeData;
						themeData.setCustomColors(this.colorCustomizations);
						themeData.setCustomTokenColors(this.tokenColorCustomizations);
						return TPromise.as(themeData);
					}
					themeData.setCustomColors(this.colorCustomizations);
					themeData.setCustomTokenColors(this.tokenColorCustomizations);
					this.updateDynamicCSSRules(themeData);
					return this.applyTheme(themeData, settingsTarget);
				}, error => {
					return TPromise.wrapError<IColorTheme>(new Error(nls.localize('error.cannotloadtheme', "Unable to load {0}: {1}", themeData.path, error.message)));
				});
			}
			return null;
		});
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
		themingRegistry.getThemingParticipants().forEach(p => p(themeData, ruleCollector));
		_applyRules(cssRules.join('\n'), colorThemeRulesClassName);
	}

	private applyTheme(newTheme: ColorThemeData, settingsTarget: ConfigurationTarget, silent = false): TPromise<IColorTheme> {
		if (this.container) {
			if (this.currentColorTheme) {
				$(this.container).removeClass(this.currentColorTheme.id);
			} else {
				$(this.container).removeClass(VS_DARK_THEME, VS_LIGHT_THEME, VS_HC_THEME);
			}
			$(this.container).addClass(newTheme.id);
		}
		this.currentColorTheme = newTheme;
		if (!this.themingParticipantChangeListener) {
			this.themingParticipantChangeListener = themingRegistry.onThemingParticipantAdded(p => this.updateDynamicCSSRules(this.currentColorTheme));
		}

		this.sendTelemetry(newTheme.id, newTheme.extensionData, 'color');

		if (silent) {
			return TPromise.as(null);
		}

		this.onColorThemeChange.fire(this.currentColorTheme);

		if (settingsTarget !== ConfigurationTarget.WORKSPACE) {
			let background = Color.Format.CSS.formatHex(newTheme.getColor(editorBackground)); // only take RGB, its what is used in the initial CSS
			let data = { id: newTheme.id, background: background };
			this.broadcastService.broadcast({ channel: 'vscode:changeColorTheme', payload: JSON.stringify(data) });
		}
		// remember theme data for a quick restore
		this.storageService.store(PERSISTED_THEME_STORAGE_KEY, newTheme.toStorageData());

		return this.writeColorThemeConfiguration(settingsTarget);
	}

	private writeColorThemeConfiguration(settingsTarget: ConfigurationTarget): TPromise<IColorTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.configurationWriter.writeConfiguration(COLOR_THEME_SETTING, this.currentColorTheme.settingsId, settingsTarget).then(_ => this.currentColorTheme);
		}
		return TPromise.as(this.currentColorTheme);
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
						"galleryPublisherDisplayName": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
						"themeId": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('activatePlugin', {
					id: themeData.extensionId,
					name: themeData.extensionName,
					isBuiltin: themeData.extensionIsBuiltin,
					galleryPublisherDisplayName: themeData.extensionPublisher,
					themeId: themeId
				});
				this.themeExtensionsActivated.set(key, true);
			}
		}
	}

	public getFileIconThemes(): TPromise<IFileIconTheme[]> {
		return this.iconThemeStore.getFileIconThemes();
	}

	public getFileIconTheme() {
		return this.currentIconTheme;
	}

	public setFileIconTheme(iconTheme: string, settingsTarget: ConfigurationTarget): TPromise<IFileIconTheme> {
		iconTheme = iconTheme || '';
		if (iconTheme === this.currentIconTheme.id && this.currentIconTheme.isLoaded) {
			return this.writeFileIconConfiguration(settingsTarget);
		}
		let onApply = (newIconTheme: FileIconThemeData) => {
			this.doSetFileIconTheme(newIconTheme);

			// remember theme data for a quick restore
			this.storageService.store(PERSISTED_ICON_THEME_STORAGE_KEY, newIconTheme.toStorageData());

			return this.writeFileIconConfiguration(settingsTarget);
		};

		return this.iconThemeStore.findThemeData(iconTheme).then(iconThemeData => {
			if (!iconThemeData) {
				iconThemeData = FileIconThemeData.noIconTheme();
			}
			return iconThemeData.ensureLoaded(this).then(_ => {
				return _applyIconTheme(iconThemeData, onApply);
			});
		});
	}

	private doSetFileIconTheme(iconThemeData: FileIconThemeData): void {
		this.currentIconTheme = iconThemeData;

		if (this.container) {
			if (iconThemeData.id) {
				$(this.container).addClass(fileIconsEnabledClass);
			} else {
				$(this.container).removeClass(fileIconsEnabledClass);
			}
		}
		if (iconThemeData.id) {
			this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, 'fileIcon');
		}
		this.onFileIconThemeChange.fire(this.currentIconTheme);

	}

	private writeFileIconConfiguration(settingsTarget: ConfigurationTarget): TPromise<IFileIconTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.configurationWriter.writeConfiguration(ICON_THEME_SETTING, this.currentIconTheme.settingsId, settingsTarget).then(_ => this.currentIconTheme);
		}
		return TPromise.wrap(this.currentIconTheme);
	}

	private get configurationWriter(): ConfigurationWriter {
		// separate out the ConfigurationWriter to avoid a dependency of the IConfigurationEditingService
		if (!this._configurationWriter) {
			this._configurationWriter = this.instantiationService.createInstance(ConfigurationWriter);
		}
		return this._configurationWriter;
	}
}

function _applyIconTheme(data: FileIconThemeData, onApply: (theme: FileIconThemeData) => TPromise<IFileIconTheme>): TPromise<IFileIconTheme> {
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
	constructor(@IConfigurationService private configurationService: IConfigurationService) {
	}

	public writeConfiguration(key: string, value: any, settingsTarget: ConfigurationTarget): TPromise<void> {
		let settings = this.configurationService.inspect(key);
		if (settingsTarget === ConfigurationTarget.USER) {
			if (value === settings.user) {
				return TPromise.as(null); // nothing to do
			} else if (value === settings.default) {
				if (types.isUndefined(settings.user)) {
					return TPromise.as(null); // nothing to do
				}
				value = void 0; // remove configuration from user settings
			}
		} else if (settingsTarget === ConfigurationTarget.WORKSPACE) {
			if (value === settings.value) {
				return TPromise.as(null); // nothing to do
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

