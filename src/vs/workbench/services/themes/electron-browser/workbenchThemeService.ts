/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchThemeService, IColorTheme, ITokenColorCustomizations, IFileIconTheme, ExtensionData, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME, COLOR_THEME_SETTING, ICON_THEME_SETTING, CUSTOM_WORKBENCH_COLORS_SETTING, CUSTOM_EDITOR_COLORS_SETTING, CUSTOM_EDITOR_SCOPE_COLORS_SETTING } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/registry/common/platform';
import errors = require('vs/base/common/errors');
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessageService } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import Severity from 'vs/base/common/severity';
import { ColorThemeData } from './colorThemeData';
import { ITheme, Extensions as ThemingExtensions, IThemingRegistry } from 'vs/platform/theme/common/themeService';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';

import { $ } from 'vs/base/browser/builder';
import Event, { Emitter } from 'vs/base/common/event';

import pfs = require('vs/base/node/pfs');

import colorThemeSchema = require('vs/workbench/services/themes/common/colorThemeSchema');
import fileIconThemeSchema = require('vs/workbench/services/themes/common/fileIconThemeSchema');
import { IDisposable } from 'vs/base/common/lifecycle';
import { IBroadcastService } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { ColorThemeStore } from 'vs/workbench/services/themes/electron-browser/colorThemeStore';
import { FileIconThemeStore } from 'vs/workbench/services/themes/electron-browser/fileIconThemeStore';
import { FileIconThemeData } from 'vs/workbench/services/themes/electron-browser/fileIconThemeData';

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';
const DEFAULT_THEME_SETTING_VALUE = 'Default Dark+';

const PERSISTED_THEME_STORAGE_KEY = 'colorThemeData';

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
	[colorId: string]: string;
}

export class WorkbenchThemeService implements IWorkbenchThemeService {
	_serviceBrand: any;

	private colorThemeStore: ColorThemeStore;
	private colorCustomizations: IColorCustomizations;
	private tokenColorCustomizations: ITokenColorCustomizations;
	private numberOfColorCustomizations: number;
	private currentColorTheme: ColorThemeData;
	private container: HTMLElement;
	private onColorThemeChange: Emitter<IColorTheme>;

	private iconThemeStore: FileIconThemeStore;
	private currentIconTheme: IFileIconTheme;
	private onFileIconThemeChange: Emitter<IFileIconTheme>;

	private themingParticipantChangeListener: IDisposable;
	private _configurationWriter: ConfigurationWriter;

	constructor(
		container: HTMLElement,
		// @ts-ignore unused injected service
		@IExtensionService private extensionService: IExtensionService,
		@IStorageService private storageService: IStorageService,
		@IBroadcastService private broadcastService: IBroadcastService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService) {

		this.container = container;
		this.colorThemeStore = new ColorThemeStore(extensionService);
		this.colorCustomizations = {};
		this.tokenColorCustomizations = {};
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

		this.updateColorCustomizations(false);

		// In order to avoid paint flashing for tokens, because
		// themes are loaded asynchronously, we need to initialize
		// a color theme document with good defaults until the theme is loaded
		let themeData = null;
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

		this.migrate().then(_ => {
			this.initialize().then(null, errors.onUnexpectedError).then(_ => {
				this.installConfigurationListener();
			});
		});

		// update settings schema setting
		this.colorThemeStore.onDidChange(themes => {
			colorThemeSettingSchema.enum = themes.map(t => t.settingsId);
			colorThemeSettingSchema.enumDescriptions = themes.map(t => themeData.description || '');
			configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
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

	private backupSettings(): TPromise<string> {
		let resource = this.environmentService.appSettingsPath;
		let backupFileLocation = resource + '-' + new Date().getTime() + '.backup';
		return pfs.readFile(resource).then(content => {
			return pfs.writeFile(backupFileLocation, content).then(_ => backupFileLocation);
		}, err => {
			if (err && err.code === 'ENOENT') {
				return TPromise.as<string>(null); // ignore, user config file doesn't exist yet
			}
			return TPromise.wrapError<string>(err);
		});
	}

	private migrate(): TPromise<void> {
		let legacyColorThemeId = this.storageService.get('workbench.theme', StorageScope.GLOBAL, void 0);
		let legacyIconThemeId = this.storageService.get('workbench.iconTheme', StorageScope.GLOBAL, void 0);
		if (types.isUndefined(legacyColorThemeId) && types.isUndefined(legacyIconThemeId)) {
			return TPromise.as(null);
		}
		return this.backupSettings().then(backupLocation => {
			let promise = TPromise.as(null);
			if (!types.isUndefined(legacyColorThemeId)) {
				this.storageService.remove('workbench.theme', StorageScope.GLOBAL);
				promise = this.colorThemeStore.findThemeData(legacyColorThemeId, DEFAULT_THEME_ID).then(theme => {
					let value = theme ? theme.settingsId : DEFAULT_THEME_SETTING_VALUE;
					return this.configurationWriter.writeConfiguration(COLOR_THEME_SETTING, value, ConfigurationTarget.USER).then(null, error => null);
				});
			}
			if (!types.isUndefined(legacyIconThemeId)) {
				this.storageService.remove('workbench.iconTheme', StorageScope.GLOBAL);
				promise = promise.then(_ => {
					return this.iconThemeStore.findThemeData(legacyIconThemeId).then(theme => {
						let value = theme ? theme.settingsId : null;
						return this.configurationWriter.writeConfiguration(ICON_THEME_SETTING, value, ConfigurationTarget.USER).then(null, error => null);
					});
				});
			}
			return promise.then(_ => {
				if (backupLocation) {
					let message = nls.localize('migration.completed', 'New theme settings have been added to the user settings. Backup available at {0}.', backupLocation);
					this.messageService.show(Severity.Info, message);
					console.log(message);
				}
			});
		});
	}

	private initialize(): TPromise<[IColorTheme, IFileIconTheme]> {

		this.updateColorCustomizations(false);

		let colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
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
			let colorThemeSetting = this.configurationService.getValue<string>(COLOR_THEME_SETTING);
			if (colorThemeSetting !== this.currentColorTheme.settingsId) {
				this.colorThemeStore.findThemeDataBySettingsId(colorThemeSetting, null).then(theme => {
					if (theme) {
						this.setColorTheme(theme.id, null);
					}
				});
			}

			let iconThemeSetting = this.configurationService.getValue<string>(ICON_THEME_SETTING) || '';
			if (iconThemeSetting !== this.currentIconTheme.settingsId) {
				this.iconThemeStore.findThemeBySettingsId(iconThemeSetting).then(theme => {
					this.setFileIconTheme(theme && theme.id, null);
				});
			}

			this.updateColorCustomizations();
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

	private hasCustomizationChanged(newColorCustomizations: IColorCustomizations, newColorIds: string[], newTokenColorCustomizations: ITokenColorCustomizations): boolean {
		if (newColorIds.length !== this.numberOfColorCustomizations) {
			return true;
		}
		for (let key of newColorIds) {
			let color = this.colorCustomizations[key];
			if (!color || color !== newColorCustomizations[key]) {
				return true;
			}
		}

		if (!objects.equals(newTokenColorCustomizations, this.tokenColorCustomizations)) {
			return true;
		}

		return false;
	}

	private updateColorCustomizations(notify = true): void {
		let newColorCustomizations = this.configurationService.getValue<IColorCustomizations>(CUSTOM_WORKBENCH_COLORS_SETTING) || {};
		let newColorIds = Object.keys(newColorCustomizations);

		let newTokenColorCustomizations = this.configurationService.getValue<ITokenColorCustomizations>(CUSTOM_EDITOR_COLORS_SETTING) || {};

		if (this.hasCustomizationChanged(newColorCustomizations, newColorIds, newTokenColorCustomizations)) {
			this.colorCustomizations = newColorCustomizations;
			this.numberOfColorCustomizations = newColorIds.length;
			this.tokenColorCustomizations = newTokenColorCustomizations;

			if (this.currentColorTheme) {
				this.currentColorTheme.setCustomColors(newColorCustomizations);
				this.currentColorTheme.setCustomTokenColors(newTokenColorCustomizations);
				if (notify) {
					this.updateDynamicCSSRules(this.currentColorTheme);
					this.onColorThemeChange.fire(this.currentColorTheme);
				}
			}
		}
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
						"isBuiltin": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"publisherDisplayName": { "classification": "PublicPersonalData", "purpose": "FeatureInsight" },
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
			if (newIconTheme) {
				this.currentIconTheme = newIconTheme;
			} else {
				this.currentIconTheme = FileIconThemeData.noIconTheme();
			}

			if (this.container) {
				if (newIconTheme) {
					$(this.container).addClass(fileIconsEnabledClass);
				} else {
					$(this.container).removeClass(fileIconsEnabledClass);
				}
			}
			if (newIconTheme) {
				this.sendTelemetry(newIconTheme.id, newIconTheme.extensionData, 'fileIcon');
			}
			this.onFileIconThemeChange.fire(this.currentIconTheme);
			return this.writeFileIconConfiguration(settingsTarget);
		};

		return this.iconThemeStore.findThemeData(iconTheme).then(iconThemeData => {
			return _applyIconTheme(iconThemeData, onApply);
		});
	}

	private writeFileIconConfiguration(settingsTarget: ConfigurationTarget): TPromise<IFileIconTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.configurationWriter.writeConfiguration(ICON_THEME_SETTING, this.currentIconTheme.settingsId, settingsTarget).then(_ => this.currentIconTheme);
		}
		return TPromise.as(this.currentIconTheme);
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
	if (!data) {
		_applyRules('', iconThemeRulesClassName);
		return TPromise.as(onApply(data));
	}
	return data.ensureLoaded(this).then(styleSheetContent => {
		_applyRules(styleSheetContent, iconThemeRulesClassName);
		return onApply(data);
	}, error => {
		return TPromise.wrapError<IFileIconTheme>(new Error(nls.localize('error.cannotloadicontheme', "Unable to load {0}", data.path)));
	});
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
	constructor( @IConfigurationService private configurationService: IConfigurationService) {
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
	type: ['object'],
	description: nls.localize('workbenchColors', "Overrides colors from the currently selected color theme."),
	properties: colorThemeSchema.colorsSchema.properties,
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

configurationRegistry.registerConfiguration({
	id: 'editor',
	order: 7.2,
	type: 'object',
	properties: {
		[CUSTOM_EDITOR_COLORS_SETTING]: {
			description: nls.localize('editorColors', "Overrides editor colors and font style from the currently selected color theme."),
			default: {},
			additionalProperties: false,
			properties: {
				comments: tokenGroupSettings(nls.localize('editorColors.comments', "Sets the colors and styles for comments")),
				strings: tokenGroupSettings(nls.localize('editorColors.strings', "Sets the colors and styles for strings literals.")),
				keywords: tokenGroupSettings(nls.localize('editorColors.keywords', "Sets the colors and styles for keywords.")),
				numbers: tokenGroupSettings(nls.localize('editorColors.numbers', "Sets the colors and styles for number literals.")),
				types: tokenGroupSettings(nls.localize('editorColors.types', "Sets the colors and styles for type declarations and references.")),
				functions: tokenGroupSettings(nls.localize('editorColors.functions', "Sets the colors and styles for functions declarations and references.")),
				variables: tokenGroupSettings(nls.localize('editorColors.variables', "Sets the colors and styles for variables declarations and references.")),
				[CUSTOM_EDITOR_SCOPE_COLORS_SETTING]: colorThemeSchema.tokenColorsSchema(nls.localize('editorColors.textMateRules', 'Sets colors and styles using textmate theming rules (advanced).'))
			}
		}
	}
});

