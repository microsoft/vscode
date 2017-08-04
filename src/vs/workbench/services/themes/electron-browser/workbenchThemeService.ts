/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import nls = require('vs/nls');
import * as Paths from 'path';
import Json = require('vs/base/common/json');
import * as types from 'vs/base/common/types';
import * as objects from 'vs/base/common/objects';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { IWorkbenchThemeService, IColorTheme, ITokenColorCustomizations, IFileIconTheme, ExtensionData, IThemeExtensionPoint, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME, COLOR_THEME_SETTING, ICON_THEME_SETTING, CUSTOM_WORKBENCH_COLORS_SETTING, DEPRECATED_CUSTOM_COLORS_SETTING, CUSTOM_EDITOR_COLORS_SETTING, CUSTOM_EDITOR_SCOPE_COLORS_SETTING } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import errors = require('vs/base/common/errors');
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessageService } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import Severity from 'vs/base/common/severity';
import { ColorThemeData, fromStorageData, fromExtensionTheme, createUnloadedTheme } from './colorThemeData';
import { ITheme, Extensions as ThemingExtensions, IThemingRegistry } from 'vs/platform/theme/common/themeService';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';

import { $ } from 'vs/base/browser/builder';
import Event, { Emitter } from 'vs/base/common/event';

import pfs = require('vs/base/node/pfs');

import colorThemeSchema = require('vs/workbench/services/themes/common/colorThemeSchema');
import fileIconThemeSchema = require('vs/workbench/services/themes/common/fileIconThemeSchema');
import { IDisposable } from 'vs/base/common/lifecycle';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { IBroadcastService } from "vs/platform/broadcast/electron-browser/broadcastService";

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';
const DEFAULT_THEME_SETTING_VALUE = 'Default Dark+';

const PERSISTED_THEME_STORAGE_KEY = 'colorThemeData';

const defaultThemeExtensionId = 'vscode-theme-defaults';
const oldDefaultThemeExtensionId = 'vscode-theme-colorful-defaults';

const DEFAULT_ICON_THEME_SETTING_VALUE = 'vs-seti';
const fileIconsEnabledClass = 'file-icons-enabled';

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

let themesExtPoint = ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>('themes', [], {
	description: nls.localize('vscode.extension.contributes.themes', 'Contributes textmate color themes.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { label: '${1:label}', id: '${2:id}', uiTheme: VS_DARK_THEME, path: './themes/${3:id}.tmTheme.' } }],
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.themes.id', 'Id of the icon theme as used in the user settings.'),
				type: 'string'
			},
			label: {
				description: nls.localize('vscode.extension.contributes.themes.label', 'Label of the color theme as shown in the UI.'),
				type: 'string'
			},
			uiTheme: {
				description: nls.localize('vscode.extension.contributes.themes.uiTheme', 'Base theme defining the colors around the editor: \'vs\' is the light color theme, \'vs-dark\' is the dark color theme. \'hc-black\' is the dark high contrast theme.'),
				enum: [VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME]
			},
			path: {
				description: nls.localize('vscode.extension.contributes.themes.path', 'Path of the tmTheme file. The path is relative to the extension folder and is typically \'./themes/themeFile.tmTheme\'.'),
				type: 'string'
			}
		},
		required: ['path', 'uiTheme']
	}
});

let iconThemeExtPoint = ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>('iconThemes', [], {
	description: nls.localize('vscode.extension.contributes.iconThemes', 'Contributes file icon themes.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { id: '${1:id}', label: '${2:label}', path: './fileicons/${3:id}-icon-theme.json' } }],
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.iconThemes.id', 'Id of the icon theme as used in the user settings.'),
				type: 'string'
			},
			label: {
				description: nls.localize('vscode.extension.contributes.iconThemes.label', 'Label of the icon theme as shown in the UI.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.iconThemes.path', 'Path of the icon theme definition file. The path is relative to the extension folder and is typically \'./icons/awesome-icon-theme.json\'.'),
				type: 'string'
			}
		},
		required: ['path', 'id']
	}
});

interface IInternalIconThemeData extends IFileIconTheme {
	id: string;
	label: string;
	settingsId: string;
	description?: string;
	hasFileIcons?: boolean;
	hasFolderIcons?: boolean;
	isLoaded: boolean;
	path?: string;
	styleSheetContent?: string;
	extensionData: ExtensionData;
}

interface IconDefinition {
	iconPath: string;
	fontColor: string;
	fontCharacter: string;
	fontSize: string;
	fontId: string;
}

interface FontDefinition {
	id: string;
	weight: string;
	style: string;
	size: string;
	src: { path: string; format: string; }[];
}

interface IconsAssociation {
	folder?: string;
	file?: string;
	folderExpanded?: string;
	rootFolder?: string;
	rootFolderExpanded?: string;
	folderNames?: { [folderName: string]: string; };
	folderNamesExpanded?: { [folderName: string]: string; };
	fileExtensions?: { [extension: string]: string; };
	fileNames?: { [fileName: string]: string; };
	languageIds?: { [languageId: string]: string; };
}

interface IconThemeDocument extends IconsAssociation {
	iconDefinitions: { [key: string]: IconDefinition };
	fonts: FontDefinition[];
	light?: IconsAssociation;
	highContrast?: IconsAssociation;
}

export interface IColorCustomizations {
	[colorId: string]: string;
}

const noFileIconTheme: IFileIconTheme = {
	id: '',
	label: '',
	settingsId: null,
	hasFileIcons: false,
	hasFolderIcons: false,
	isLoaded: true,
	extensionData: null
};

export class WorkbenchThemeService implements IWorkbenchThemeService {
	_serviceBrand: any;

	private extensionsColorThemes: ColorThemeData[];
	private colorCustomizations: IColorCustomizations;
	private tokenColorCustomizations: ITokenColorCustomizations;
	private numberOfColorCustomizations: number;
	private currentColorTheme: ColorThemeData;
	private container: HTMLElement;
	private onColorThemeChange: Emitter<IColorTheme>;

	private knownIconThemes: IInternalIconThemeData[];
	private currentIconTheme: IFileIconTheme;
	private onFileIconThemeChange: Emitter<IFileIconTheme>;

	private themingParticipantChangeListener: IDisposable;
	private _configurationWriter: ConfigurationWriter;

	constructor(
		container: HTMLElement,
		@IExtensionService private extensionService: IExtensionService,
		@IStorageService private storageService: IStorageService,
		@IBroadcastService private broadcastService: IBroadcastService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IInstantiationService private instantiationService: IInstantiationService) {

		this.container = container;
		this.extensionsColorThemes = [];
		this.colorCustomizations = {};
		this.tokenColorCustomizations = {};
		this.onFileIconThemeChange = new Emitter<IFileIconTheme>();
		this.knownIconThemes = [];
		this.onColorThemeChange = new Emitter<IColorTheme>();

		this.currentIconTheme = {
			id: '',
			label: '',
			settingsId: null,
			isLoaded: false,
			hasFileIcons: false,
			hasFolderIcons: false,
			extensionData: null
		};

		this.updateColorCustomizations(false);

		// In order to avoid paint flashing for tokens, because
		// themes are loaded asynchronously, we need to initialize
		// a color theme document with good defaults until the theme is loaded
		let themeData = null;
		let persistedThemeData = this.storageService.get(PERSISTED_THEME_STORAGE_KEY);
		if (persistedThemeData) {
			themeData = fromStorageData(persistedThemeData);
		}
		if (!themeData) {
			let isLightTheme = (Array.prototype.indexOf.call(document.body.classList, 'vs') >= 0);
			themeData = createUnloadedTheme(isLightTheme ? VS_LIGHT_THEME : VS_DARK_THEME);
		}
		themeData.setCustomColors(this.colorCustomizations);
		themeData.setCustomTokenColors(this.tokenColorCustomizations);
		this.updateDynamicCSSRules(themeData);
		this.applyTheme(themeData, null, true);

		themesExtPoint.setHandler((extensions) => {
			for (let ext of extensions) {
				let extensionData = {
					extensionId: ext.description.id,
					extensionPublisher: ext.description.publisher,
					extensionName: ext.description.name,
					extensionIsBuiltin: ext.description.isBuiltin
				};
				this.onThemes(ext.description.extensionFolderPath, extensionData, ext.value, ext.collector);
			}
		});

		iconThemeExtPoint.setHandler((extensions) => {
			for (let ext of extensions) {
				let extensionData = {
					extensionId: ext.description.id,
					extensionPublisher: ext.description.publisher,
					extensionName: ext.description.name,
					extensionIsBuiltin: ext.description.isBuiltin
				};
				this.onIconThemes(ext.description.extensionFolderPath, extensionData, ext.value, ext.collector);
			}
		});

		this.migrate().then(_ => {
			this.initialize().then(null, errors.onUnexpectedError).then(_ => {
				this.installConfigurationListener();
			});
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
			};
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
				promise = this.findThemeData(legacyColorThemeId, DEFAULT_THEME_ID).then(theme => {
					let value = theme ? theme.settingsId : DEFAULT_THEME_SETTING_VALUE;
					return this.configurationWriter.writeConfiguration(COLOR_THEME_SETTING, value, ConfigurationTarget.USER).then(null, error => null);
				});
			}
			if (!types.isUndefined(legacyIconThemeId)) {
				this.storageService.remove('workbench.iconTheme', StorageScope.GLOBAL);
				promise = promise.then(_ => {
					return this._findIconThemeData(legacyIconThemeId).then(theme => {
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

	private initialize(): TPromise<IFileIconTheme> {

		this.updateColorCustomizations(false);

		let colorThemeSetting = this.configurationService.lookup<string>(COLOR_THEME_SETTING).value;
		let iconThemeSetting = this.configurationService.lookup<string>(ICON_THEME_SETTING).value || '';

		return Promise.join([
			this.findThemeDataBySettingsId(colorThemeSetting, DEFAULT_THEME_ID).then(theme => {
				return this.setColorTheme(theme && theme.id, null);
			}),
			this.findIconThemeBySettingsId(iconThemeSetting).then(theme => {
				return this.setFileIconTheme(theme && theme.id, null);
			}),
		]);
	}

	private installConfigurationListener() {
		this.configurationService.onDidUpdateConfiguration(e => {
			let colorThemeSetting = this.configurationService.lookup<string>(COLOR_THEME_SETTING).value;
			if (colorThemeSetting !== this.currentColorTheme.settingsId) {
				this.findThemeDataBySettingsId(colorThemeSetting, null).then(theme => {
					if (theme) {
						this.setColorTheme(theme.id, null);
					}
				});
			}

			let iconThemeSetting = this.configurationService.lookup<string>(ICON_THEME_SETTING).value || '';
			if (iconThemeSetting !== this.currentIconTheme.settingsId) {
				this.findIconThemeBySettingsId(iconThemeSetting).then(theme => {
					this.setFileIconTheme(theme && theme.id, null);
				});
			}

			this.updateColorCustomizations();
		});
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


		return this.findThemeData(themeId, DEFAULT_THEME_ID).then(themeData => {
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
		let cssRules = [];
		let hasRule = {};
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
			let background = newTheme.getColor(editorBackground).toRGBHex(); // only take RGB, its what is used in the initial CSS
			let data = { id: newTheme.id, background: background };
			this.broadcastService.broadcast({ channel: 'vscode:changeColorTheme', payload: JSON.stringify(data) });
		}
		// remember theme data for a quick restore
		this.storageService.store(PERSISTED_THEME_STORAGE_KEY, newTheme.toStorageData());

		return this.writeColorThemeConfiguration(settingsTarget);
	};

	private writeColorThemeConfiguration(settingsTarget: ConfigurationTarget): TPromise<IColorTheme> {
		if (!types.isUndefinedOrNull(settingsTarget)) {
			return this.configurationWriter.writeConfiguration(COLOR_THEME_SETTING, this.currentColorTheme.settingsId, settingsTarget).then(_ => this.currentColorTheme);
		}
		return TPromise.as(this.currentColorTheme);
	}

	public getColorTheme(): IColorTheme {
		return this.currentColorTheme;
	}

	private findThemeData(themeId: string, defaultId?: string): TPromise<ColorThemeData> {
		return this.getColorThemes().then(allThemes => {
			let defaultTheme: ColorThemeData = void 0;
			for (let t of allThemes) {
				if (t.id === themeId) {
					return <ColorThemeData>t;
				}
				if (t.id === defaultId) {
					defaultTheme = <ColorThemeData>t;
				}
			}
			return defaultTheme;
		});
	}

	public findThemeDataBySettingsId(settingsId: string, defaultId: string): TPromise<ColorThemeData> {
		return this.getColorThemes().then(allThemes => {
			let defaultTheme: ColorThemeData = void 0;
			for (let t of allThemes) {
				if (t.settingsId === settingsId) {
					return <ColorThemeData>t;
				}
				if (t.id === defaultId) {
					defaultTheme = <ColorThemeData>t;
				}
			}
			return defaultTheme;
		});
	}

	public getColorThemes(): TPromise<IColorTheme[]> {
		return this.extensionService.onReady().then(isReady => {
			return this.extensionsColorThemes;
		});
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
		let newColorCustomizations = this.configurationService.lookup<IColorCustomizations>(CUSTOM_WORKBENCH_COLORS_SETTING).value || {};
		let newColorIds = Object.keys(newColorCustomizations);
		if (newColorIds.length === 0) {
			newColorCustomizations = this.configurationService.lookup<IColorCustomizations>(DEPRECATED_CUSTOM_COLORS_SETTING).value || {};
			newColorIds = Object.keys(newColorCustomizations);
		}

		let newTokenColorCustomizations = this.configurationService.lookup<ITokenColorCustomizations>(CUSTOM_EDITOR_COLORS_SETTING).value || {};

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

	private onThemes(extensionFolderPath: string, extensionData: ExtensionData, themes: IThemeExtensionPoint[], collector: ExtensionMessageCollector): void {
		if (!Array.isArray(themes)) {
			collector.error(nls.localize(
				'reqarray',
				"Extension point `{0}` must be an array.",
				themesExtPoint.name
			));
			return;
		}
		themes.forEach(theme => {
			if (!theme.path || !types.isString(theme.path)) {
				collector.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					themesExtPoint.name,
					String(theme.path)
				));
				return;
			}
			let normalizedAbsolutePath = Paths.normalize(Paths.join(extensionFolderPath, theme.path));

			if (normalizedAbsolutePath.indexOf(Paths.normalize(extensionFolderPath)) !== 0) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", themesExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
			}
			let themeData = fromExtensionTheme(theme, normalizedAbsolutePath, extensionData);
			this.extensionsColorThemes.push(themeData);

			colorThemeSettingSchema.enum.push(themeData.settingsId);
			colorThemeSettingSchema.enumDescriptions.push(themeData.description || '');
		});
	}

	private onIconThemes(extensionFolderPath: string, extensionData: ExtensionData, iconThemes: IThemeExtensionPoint[], collector: ExtensionMessageCollector): void {
		if (!Array.isArray(iconThemes)) {
			collector.error(nls.localize(
				'reqarray',
				"Extension point `{0}` must be an array.",
				themesExtPoint.name
			));
			return;
		}
		iconThemes.forEach(iconTheme => {
			if (!iconTheme.path || !types.isString(iconTheme.path)) {
				collector.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					themesExtPoint.name,
					String(iconTheme.path)
				));
				return;
			}
			if (!iconTheme.id || !types.isString(iconTheme.id)) {
				collector.error(nls.localize(
					'reqid',
					"Expected string in `contributes.{0}.id`. Provided value: {1}",
					themesExtPoint.name,
					String(iconTheme.path)
				));
				return;
			}
			let normalizedAbsolutePath = Paths.normalize(Paths.join(extensionFolderPath, iconTheme.path));

			if (normalizedAbsolutePath.indexOf(Paths.normalize(extensionFolderPath)) !== 0) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", themesExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
			}

			let themeData = {
				id: extensionData.extensionId + '-' + iconTheme.id,
				label: iconTheme.label || Paths.basename(iconTheme.path),
				settingsId: iconTheme.id,
				description: iconTheme.description,
				path: normalizedAbsolutePath,
				extensionData: extensionData,
				isLoaded: false
			};
			this.knownIconThemes.push(themeData);

			iconThemeSettingSchema.enum.push(themeData.settingsId);
			iconThemeSettingSchema.enumDescriptions.push(themeData.description || '');
		});
	}

	private themeExtensionsActivated = new Map<string, boolean>();
	private sendTelemetry(themeId: string, themeData: ExtensionData, themeType: string) {
		if (themeData) {
			let key = themeType + themeData.extensionId;
			if (!this.themeExtensionsActivated.get(key)) {
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
		return this.extensionService.onReady().then(isReady => {
			return this.knownIconThemes;
		});
	}

	public getFileIconTheme() {
		return this.currentIconTheme;
	}

	public setFileIconTheme(iconTheme: string, settingsTarget: ConfigurationTarget): TPromise<IFileIconTheme> {
		iconTheme = iconTheme || '';
		if (iconTheme === this.currentIconTheme.id && this.currentIconTheme.isLoaded) {
			return this.writeFileIconConfiguration(settingsTarget);
		}
		let onApply = (newIconTheme: IInternalIconThemeData) => {
			if (newIconTheme) {
				this.currentIconTheme = newIconTheme;
			} else {
				this.currentIconTheme = noFileIconTheme;
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

		return this._findIconThemeData(iconTheme).then(iconThemeData => {
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

	private _findIconThemeData(iconTheme: string): TPromise<IInternalIconThemeData> {
		return this.getFileIconThemes().then(allIconSets => {
			for (let iconSet of allIconSets) {
				if (iconSet.id === iconTheme) {
					return <IInternalIconThemeData>iconSet;
				}
			}
			return null;
		});
	}

	private findIconThemeBySettingsId(settingsId: string): TPromise<IFileIconTheme> {
		return this.getFileIconThemes().then(allIconSets => {
			for (let iconSet of allIconSets) {
				if (iconSet.settingsId === settingsId) {
					return iconSet;
				}
			}
			return null;
		});
	}
}

function _applyIconTheme(data: IInternalIconThemeData, onApply: (theme: IInternalIconThemeData) => TPromise<IFileIconTheme>): TPromise<IFileIconTheme> {
	if (!data) {
		_applyRules('', iconThemeRulesClassName);
		return TPromise.as(onApply(data));
	}

	if (data.styleSheetContent) {
		_applyRules(data.styleSheetContent, iconThemeRulesClassName);
		return TPromise.as(onApply(data));
	}
	return _loadIconThemeDocument(data.path).then(iconThemeDocument => {
		let result = _processIconThemeDocument(data.id, data.path, iconThemeDocument);
		data.styleSheetContent = result.content;
		data.hasFileIcons = result.hasFileIcons;
		data.hasFolderIcons = result.hasFolderIcons;
		data.isLoaded = true;
		_applyRules(data.styleSheetContent, iconThemeRulesClassName);
		return onApply(data);
	}, error => {
		return TPromise.wrapError<IFileIconTheme>(new Error(nls.localize('error.cannotloadicontheme', "Unable to load {0}", data.path)));
	});
}

function _loadIconThemeDocument(fileSetPath: string): TPromise<IconThemeDocument> {
	return pfs.readFile(fileSetPath).then(content => {
		let errors: Json.ParseError[] = [];
		let contentValue = Json.parse(content.toString(), errors);
		if (errors.length > 0) {
			return TPromise.wrapError(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing file icons file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
		}
		return TPromise.as(contentValue);
	});
}

function _processIconThemeDocument(id: string, iconThemeDocumentPath: string, iconThemeDocument: IconThemeDocument): { content: string; hasFileIcons: boolean; hasFolderIcons: boolean; } {

	let result = { content: '', hasFileIcons: false, hasFolderIcons: false };

	if (!iconThemeDocument.iconDefinitions) {
		return result;
	}
	let selectorByDefinitionId: { [def: string]: string[] } = {};

	function resolvePath(path: string) {
		const uri = URI.file(Paths.join(Paths.dirname(iconThemeDocumentPath), path));
		return uri.toString();
	}

	function collectSelectors(associations: IconsAssociation, baseThemeClassName?: string) {
		function addSelector(selector: string, defId: string) {
			if (defId) {
				let list = selectorByDefinitionId[defId];
				if (!list) {
					list = selectorByDefinitionId[defId] = [];
				}
				list.push(selector);
			}
		}
		if (associations) {
			let qualifier = '.show-file-icons';
			if (baseThemeClassName) {
				qualifier = baseThemeClassName + ' ' + qualifier;
			}

			let expanded = '.monaco-tree-row.expanded'; // workaround for #11453

			if (associations.folder) {
				addSelector(`${qualifier} .folder-icon::before`, associations.folder);
				result.hasFolderIcons = true;
			}

			if (associations.folderExpanded) {
				addSelector(`${qualifier} ${expanded} .folder-icon::before`, associations.folderExpanded);
				result.hasFolderIcons = true;
			}

			let rootFolder = associations.rootFolder || associations.folder;
			let rootFolderExpanded = associations.rootFolderExpanded || associations.folderExpanded;

			if (rootFolder) {
				addSelector(`${qualifier} .rootfolder-icon::before`, rootFolder);
				result.hasFolderIcons = true;
			}

			if (rootFolderExpanded) {
				addSelector(`${qualifier} ${expanded} .rootfolder-icon::before`, rootFolderExpanded);
				result.hasFolderIcons = true;
			}

			if (associations.file) {
				addSelector(`${qualifier} .file-icon::before`, associations.file);
				result.hasFileIcons = true;
			}

			let folderNames = associations.folderNames;
			if (folderNames) {
				for (let folderName in folderNames) {
					addSelector(`${qualifier} .${escapeCSS(folderName.toLowerCase())}-name-folder-icon.folder-icon::before`, folderNames[folderName]);
					result.hasFolderIcons = true;
				}
			}
			let folderNamesExpanded = associations.folderNamesExpanded;
			if (folderNamesExpanded) {
				for (let folderName in folderNamesExpanded) {
					addSelector(`${qualifier} ${expanded} .${escapeCSS(folderName.toLowerCase())}-name-folder-icon.folder-icon::before`, folderNamesExpanded[folderName]);
					result.hasFolderIcons = true;
				}
			}

			let languageIds = associations.languageIds;
			if (languageIds) {
				for (let languageId in languageIds) {
					addSelector(`${qualifier} .${escapeCSS(languageId)}-lang-file-icon.file-icon::before`, languageIds[languageId]);
					result.hasFileIcons = true;
				}
			}
			let fileExtensions = associations.fileExtensions;
			if (fileExtensions) {
				for (let fileExtension in fileExtensions) {
					let selectors: string[] = [];
					let segments = fileExtension.toLowerCase().split('.');
					for (let i = 0; i < segments.length; i++) {
						selectors.push(`.${escapeCSS(segments.slice(i).join('.'))}-ext-file-icon`);
					}
					addSelector(`${qualifier} ${selectors.join('')}.file-icon::before`, fileExtensions[fileExtension]);
					result.hasFileIcons = true;
				}
			}
			let fileNames = associations.fileNames;
			if (fileNames) {
				for (let fileName in fileNames) {
					let selectors: string[] = [];
					fileName = fileName.toLowerCase();
					selectors.push(`.${escapeCSS(fileName)}-name-file-icon`);
					let segments = fileName.split('.');
					for (let i = 1; i < segments.length; i++) {
						selectors.push(`.${escapeCSS(segments.slice(i).join('.'))}-ext-file-icon`);
					}
					addSelector(`${qualifier} ${selectors.join('')}.file-icon::before`, fileNames[fileName]);
					result.hasFileIcons = true;
				}
			}
		}
	}
	collectSelectors(iconThemeDocument);
	collectSelectors(iconThemeDocument.light, '.vs');
	collectSelectors(iconThemeDocument.highContrast, '.hc-black');

	if (!result.hasFileIcons && !result.hasFolderIcons) {
		return result;
	}

	let cssRules: string[] = [];

	let fonts = iconThemeDocument.fonts;
	if (Array.isArray(fonts)) {
		fonts.forEach(font => {
			let src = font.src.map(l => `url('${resolvePath(l.path)}') format('${l.format}')`).join(', ');
			cssRules.push(`@font-face { src: ${src}; font-family: '${font.id}'; font-weigth: ${font.weight}; font-style: ${font.style}; }`);
		});
		cssRules.push(`.show-file-icons .file-icon::before, .show-file-icons .folder-icon::before, .show-file-icons .rootfolder-icon::before { font-family: '${fonts[0].id}'; font-size: ${fonts[0].size || '150%'}}`);
	}

	for (let defId in selectorByDefinitionId) {
		let selectors = selectorByDefinitionId[defId];
		let definition = iconThemeDocument.iconDefinitions[defId];
		if (definition) {
			if (definition.iconPath) {
				cssRules.push(`${selectors.join(', ')} { content: ' '; background-image: url("${resolvePath(definition.iconPath)}"); }`);
			}
			if (definition.fontCharacter || definition.fontColor) {
				let body = '';
				if (definition.fontColor) {
					body += ` color: ${definition.fontColor};`;
				}
				if (definition.fontCharacter) {
					body += ` content: '${definition.fontCharacter}';`;
				}
				if (definition.fontSize) {
					body += ` font-size: ${definition.fontSize};`;
				}
				if (definition.fontId) {
					body += ` font-family: ${definition.fontId};`;
				}
				cssRules.push(`${selectors.join(', ')} { ${body} }`);
			}
		}
	}
	result.content = cssRules.join('\n');
	return result;
}

function escapeCSS(str: string) {
	return window['CSS'].escape(str);
}

let colorThemeRulesClassName = 'contributedColorTheme';
let iconThemeRulesClassName = 'contributedIconTheme';

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
	constructor( @IConfigurationService private configurationService: IConfigurationService, @IConfigurationEditingService private configurationEditingService: IConfigurationEditingService) {
	}

	public writeConfiguration(key: string, value: any, settingsTarget: ConfigurationTarget): TPromise<void> {
		let settings = this.configurationService.lookup(key);
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
		return this.configurationEditingService.writeConfiguration(settingsTarget, { key, value });
	}
}

// Configuration: Themes
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const colorThemeSettingSchema: IJSONSchema = {
	type: 'string',
	description: nls.localize('colorTheme', "Specifies the color theme used in the workbench."),
	default: DEFAULT_THEME_SETTING_VALUE,
	enum: [],
	enumDescriptions: [],
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const iconThemeSettingSchema: IJSONSchema = {
	type: ['string', 'null'],
	default: DEFAULT_ICON_THEME_SETTING_VALUE,
	description: nls.localize('iconTheme', "Specifies the icon theme used in the workbench or 'null' to not show any file icons."),
	enum: [null],
	enumDescriptions: [nls.localize('noIconThemeDesc', 'No file icons')],
	errorMessage: nls.localize('iconThemeError', "File icon theme is unknown or not installed.")
};
const colorCustomizationsSchema: IJSONSchema = {
	type: ['object'],
	description: nls.localize('workbenchColors', "Overrides colors from the currently selected color theme."),
	properties: colorThemeSchema.colorsSchema.properties,
	default: {},
	defaultSnippets: [{
		body: {
			'statusBarBackground': '#666666',
			'panelBackground': '#555555',
			'sideBarBackground': '#444444'
		}
	}]
};

const deprecatedColorCustomizationsSchema: IJSONSchema = objects.mixin({
	deprecationMessage: nls.localize('workbenchColors.deprecated', "The setting is no longer experimental and has been renamed to 'workbench.colorCustomizations'"),
	description: nls.localize('workbenchColors.deprecatedDescription', "Use 'workbench.colorCustomizations' instead")
}, colorCustomizationsSchema, false);

configurationRegistry.registerConfiguration({
	id: 'workbench',
	order: 7.1,
	type: 'object',
	properties: {
		[COLOR_THEME_SETTING]: colorThemeSettingSchema,
		[ICON_THEME_SETTING]: iconThemeSettingSchema,
		[CUSTOM_WORKBENCH_COLORS_SETTING]: colorCustomizationsSchema,
		[DEPRECATED_CUSTOM_COLORS_SETTING]: deprecatedColorCustomizationsSchema
	}
});

const tokenGroupSettings = {
	anyOf: [
		{
			type: 'string',
			format: 'color'
		},
		colorThemeSchema.tokenColorizationSettingSchema
	]
};

configurationRegistry.registerConfiguration({
	id: 'editor',
	order: 7.2,
	type: 'object',
	properties: {
		[CUSTOM_EDITOR_COLORS_SETTING]: {
			description: nls.localize('editorColors', "Overrides editor colors and font style from the currently selected color theme."),
			properties: {
				comments: tokenGroupSettings,
				strings: tokenGroupSettings,
				keywords: tokenGroupSettings,
				numbers: tokenGroupSettings,
				types: tokenGroupSettings,
				functions: tokenGroupSettings,
				variables: tokenGroupSettings,
				[CUSTOM_EDITOR_SCOPE_COLORS_SETTING]: colorThemeSchema.tokenColorsSchema
			}
		}
	}
});

