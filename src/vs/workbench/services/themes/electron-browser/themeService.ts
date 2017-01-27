/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import Paths = require('vs/base/common/paths');
import Json = require('vs/base/common/json');
import { IThemeExtensionPoint } from 'vs/platform/theme/common/themeExtensionPoint';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { IThemeService, IThemeSetting, IColorTheme, IFileIconTheme, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME } from 'vs/workbench/services/themes/common/themeService';
import { EditorStylesContribution, SearchViewStylesContribution, TerminalStylesContribution } from 'vs/workbench/services/themes/electron-browser/stylesContributions';
import { getBaseThemeId } from 'vs/platform/theme/common/themes';
import { IWindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/platform';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

import { $ } from 'vs/base/browser/builder';
import Event, { Emitter } from 'vs/base/common/event';

import * as plist from 'fast-plist';
import pfs = require('vs/base/node/pfs');

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';

const COLOR_THEME_CHANNEL = 'vscode:changeColorTheme';
const ICON_THEME_CHANNEL = 'vscode:changeIconTheme';
const COLOR_THEME_PREF = 'workbench.theme';
const ICON_THEME_PREF = 'workbench.iconTheme';

let defaultBaseTheme = getBaseThemeId(DEFAULT_THEME_ID);

const defaultThemeExtensionId = 'vscode-theme-defaults';
const oldDefaultThemeExtensionId = 'vscode-theme-colorful-defaults';

const fileIconsEnabledClass = 'file-icons-enabled';

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
		defaultSnippets: [{ body: { label: '${1:label}', uiTheme: VS_DARK_THEME, path: './themes/${2:id}.tmTheme.' } }],
		properties: {
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

class IInternalColorThemeData implements IColorTheme {
	id: string;
	label: string;
	description?: string;
	settings?: IThemeSetting[];
	isLoaded: boolean;
	path?: string;
	styleSheetContent?: string;
	extensionData: ExtensionData;
}

class IInternalIconThemeData implements IFileIconTheme {
	id: string;
	label: string;
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

interface ExtensionData {
	extensionId: string;
	extensionPublisher: string;
	extensionName: string;
	extensionIsBuiltin: boolean;
}

const noFileIconTheme: IFileIconTheme = {
	id: '',
	label: '',
	hasFileIcons: false,
	hasFolderIcons: false,
	isLoaded: true
};

let defaultThemeColors: { [baseTheme: string]: IThemeSetting[] } = {
	'vs': [
		{ scope: 'token.info-token', settings: { foreground: '#316bcd' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#cd3131' } },
		{ scope: 'token.debug-token', settings: { foreground: 'purple' } }
	],
	'vs-dark': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#cd9731' } },
		{ scope: 'token.error-token', settings: { foreground: '#f44747' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	],
	'hc-black': [
		{ scope: 'token.info-token', settings: { foreground: '#6796e6' } },
		{ scope: 'token.warn-token', settings: { foreground: '#008000' } },
		{ scope: 'token.error-token', settings: { foreground: '#FF0000' } },
		{ scope: 'token.debug-token', settings: { foreground: '#b267e6' } }
	],
};

export class ThemeService implements IThemeService {
	_serviceBrand: any;

	private knownColorThemes: IInternalColorThemeData[];
	private currentColorTheme: IColorTheme;
	private container: HTMLElement;
	private onColorThemeChange: Emitter<IColorTheme>;

	private knownIconThemes: IInternalIconThemeData[];
	private currentIconTheme: IFileIconTheme;
	private onFileIconThemeChange: Emitter<IFileIconTheme>;

	constructor(
		@IExtensionService private extensionService: IExtensionService,
		@IWindowIPCService private windowService: IWindowIPCService,
		@IStorageService private storageService: IStorageService,
		@ITelemetryService private telemetryService: ITelemetryService) {

		this.knownColorThemes = [];

		// In order to avoid paint flashing for tokens, because
		// themes are loaded asynchronously, we need to initialize
		// a color theme document with good defaults until the theme is loaded
		let isLightTheme = (Array.prototype.indexOf.call(document.body.classList, 'vs') >= 0);
		let foreground = isLightTheme ? '#000000' : '#D4D4D4';
		let background = isLightTheme ? '#ffffff' : '#1E1E1E';
		this.currentColorTheme = {
			id: this.storageService.get(COLOR_THEME_PREF, StorageScope.GLOBAL, DEFAULT_THEME_ID),
			label: '',
			isLoaded: false,
			settings: [{
				settings: {
					foreground: foreground,
					background: background
				}
			}]
		};

		this.onColorThemeChange = new Emitter<IColorTheme>();
		this.knownIconThemes = [];
		this.currentIconTheme = {
			id: '',
			label: '',
			isLoaded: false,
			hasFileIcons: false,
			hasFolderIcons: false
		};
		this.onFileIconThemeChange = new Emitter<IFileIconTheme>();

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

		windowService.onBroadcast(e => {
			if (e.channel === COLOR_THEME_CHANNEL && typeof e.payload === 'string') {
				this.setColorTheme(e.payload, false);
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

		windowService.onBroadcast(e => {
			if (e.channel === ICON_THEME_CHANNEL && typeof e.payload === 'string') {
				this.setFileIconTheme(e.payload, false);
			}
		});
	}

	public get onDidColorThemeChange(): Event<IColorTheme> {
		return this.onColorThemeChange.event;
	}

	public get onDidFileIconThemeChange(): Event<IFileIconTheme> {
		return this.onFileIconThemeChange.event;
	}

	public initialize(container: HTMLElement): TPromise<void> {
		this.container = container;

		let themeId = this.storageService.get(COLOR_THEME_PREF, StorageScope.GLOBAL, null);
		if (!themeId) {
			themeId = DEFAULT_THEME_ID;
			this.storageService.store(COLOR_THEME_PREF, themeId, StorageScope.GLOBAL);
		}
		let iconThemeId = this.storageService.get(ICON_THEME_PREF, StorageScope.GLOBAL, null);
		return Promise.join([
			this.setColorTheme(themeId, false),
			this.setFileIconTheme(iconThemeId, false)
		]);

	}

	public setColorTheme(themeId: string, broadcastToAllWindows: boolean): TPromise<IColorTheme> {
		if (!themeId) {
			return TPromise.as(null);
		}
		if (themeId === this.currentColorTheme.id && this.currentColorTheme.isLoaded) {
			if (broadcastToAllWindows) {
				this.windowService.broadcast({ channel: COLOR_THEME_CHANNEL, payload: themeId });
			}
			return TPromise.as(this.currentColorTheme);
		}

		themeId = validateThemeId(themeId); // migrate theme ids

		let onApply = (newTheme: IInternalColorThemeData) => {
			let newThemeId = newTheme.id;
			if (this.container) {
				if (this.currentColorTheme) {
					$(this.container).removeClass(this.currentColorTheme.id);
				}
				$(this.container).addClass(newThemeId);
			}
			this.currentColorTheme = newTheme;

			this.storageService.store(COLOR_THEME_PREF, newThemeId, StorageScope.GLOBAL);
			if (broadcastToAllWindows) {
				this.windowService.broadcast({ channel: COLOR_THEME_CHANNEL, payload: newThemeId });
			} else {
				this.sendTelemetry(newTheme.id, newTheme.extensionData, 'color');
			}
			this.onColorThemeChange.fire(this.currentColorTheme);
			return this.currentColorTheme;
		};

		return this.applyThemeCSS(themeId, DEFAULT_THEME_ID, onApply);
	}

	public getColorTheme() {
		return this.currentColorTheme;
	}

	private findThemeData(themeId: string, defaultId?: string): TPromise<IInternalColorThemeData> {
		return this.getColorThemes().then(allThemes => {
			let themes = allThemes.filter(t => t.id === themeId);
			if (themes.length > 0) {
				return <IInternalColorThemeData>themes[0];
			}
			if (defaultId) {
				let themes = allThemes.filter(t => t.id === defaultId);
				if (themes.length > 0) {
					return <IInternalColorThemeData>themes[0];
				}
			}
			return null;
		});
	}

	private applyThemeCSS(themeId: string, defaultId: string, onApply: (theme: IInternalColorThemeData) => IColorTheme): TPromise<IColorTheme> {
		return this.findThemeData(themeId, defaultId).then(theme => {
			if (theme) {
				return applyTheme(theme, onApply);
			}
			return null;
		});
	}

	public getColorThemes(): TPromise<IColorTheme[]> {
		return this.extensionService.onReady().then(isReady => {
			return this.knownColorThemes;
		});
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
			if (!theme.path || (typeof theme.path !== 'string')) {
				collector.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					themesExtPoint.name,
					String(theme.path)
				));
				return;
			}
			let normalizedAbsolutePath = Paths.normalize(Paths.join(extensionFolderPath, theme.path));

			if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", themesExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
			}

			let themeSelector = toCSSSelector(extensionData.extensionId + '-' + Paths.normalize(theme.path));
			this.knownColorThemes.push({
				id: `${theme.uiTheme || defaultBaseTheme} ${themeSelector}`,
				label: theme.label || Paths.basename(theme.path),
				description: theme.description,
				path: normalizedAbsolutePath,
				extensionData: extensionData,
				isLoaded: false
			});
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
			if (!iconTheme.path || (typeof iconTheme.path !== 'string')) {
				collector.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					themesExtPoint.name,
					String(iconTheme.path)
				));
				return;
			}
			if (!iconTheme.id || (typeof iconTheme.id !== 'string')) {
				collector.error(nls.localize(
					'reqid',
					"Expected string in `contributes.{0}.id`. Provided value: {1}",
					themesExtPoint.name,
					String(iconTheme.path)
				));
				return;
			}
			let normalizedAbsolutePath = Paths.normalize(Paths.join(extensionFolderPath, iconTheme.path));

			if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", themesExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
			}

			this.knownIconThemes.push({
				id: extensionData.extensionId + '-' + iconTheme.id,
				label: iconTheme.label || Paths.basename(iconTheme.path),
				description: iconTheme.description,
				path: normalizedAbsolutePath,
				extensionData: extensionData,
				isLoaded: false
			});
		});
	}

	private themeExtensionsActivated = {};
	private sendTelemetry(themeId: string, themeData: ExtensionData, themeType: string) {
		let key = themeType + themeData.extensionId;
		if (!this.themeExtensionsActivated[key]) {
			this.telemetryService.publicLog('activatePlugin', {
				id: themeData.extensionId,
				name: themeData.extensionName,
				isBuiltin: themeData.extensionIsBuiltin,
				publisherDisplayName: themeData.extensionPublisher,
				themeId: themeId
			});
			this.themeExtensionsActivated[key] = true;
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

	public setFileIconTheme(iconTheme: string, broadcastToAllWindows: boolean): TPromise<IColorTheme> {
		iconTheme = iconTheme || '';
		if (iconTheme === this.currentIconTheme.id && this.currentIconTheme.isLoaded) {
			if (broadcastToAllWindows) {
				this.windowService.broadcast({ channel: ICON_THEME_CHANNEL, payload: iconTheme });
			}
			return TPromise.as(this.currentIconTheme);
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

			this.storageService.store(ICON_THEME_PREF, this.currentIconTheme.id, StorageScope.GLOBAL);
			if (broadcastToAllWindows) {
				this.windowService.broadcast({ channel: ICON_THEME_CHANNEL, payload: this.currentIconTheme.id });
			} else if (newIconTheme) {
				this.sendTelemetry(newIconTheme.id, newIconTheme.extensionData, 'fileIcon');
			}
			this.onFileIconThemeChange.fire(this.currentIconTheme);
			return this.currentIconTheme;
		};


		return this._updateIconTheme(iconTheme, onApply);
	}

	private _updateIconTheme(iconTheme: string, onApply: (theme: IInternalIconThemeData) => IFileIconTheme): TPromise<IFileIconTheme> {
		return this.getFileIconThemes().then(allIconSets => {
			let iconSetData: IInternalIconThemeData;
			for (let iconSet of allIconSets) {
				if (iconSet.id === iconTheme) {
					iconSetData = <IInternalIconThemeData>iconSet;
					break;
				}
			}
			return _applyIconTheme(iconSetData, onApply);
		});
	}
}

function _applyIconTheme(data: IInternalIconThemeData, onApply: (theme: IInternalIconThemeData) => IFileIconTheme): TPromise<IFileIconTheme> {
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
		return TPromise.wrapError(nls.localize('error.cannotloadicontheme', "Unable to load {0}", data.path));
	});
}

function _loadIconThemeDocument(fileSetPath: string): TPromise<IconThemeDocument> {
	return pfs.readFile(fileSetPath).then(content => {
		let errors: Json.ParseError[] = [];
		let contentValue = Json.parse(content.toString(), errors);
		if (errors.length > 0) {
			return TPromise.wrapError(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing file icons file: {0}", errors.map(e => Json.getParseErrorMessage(e.error)).join(', '))));
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
		return Paths.join(Paths.dirname(iconThemeDocumentPath), path);
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
		cssRules.push(`.show-file-icons .file-icon::before, .show-file-icons .folder-icon::before { font-family: '${fonts[0].id}'; font-size: ${fonts[0].size || '150%'}}`);
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


function toCSSSelector(str: string) {
	str = str.replace(/[^_\-a-zA-Z0-9]/g, '-');
	if (str.charAt(0).match(/[0-9\-]/)) {
		str = '_' + str;
	}
	return str;
}

function applyTheme(theme: IInternalColorThemeData, onApply: (theme: IInternalColorThemeData) => IColorTheme): TPromise<IColorTheme> {
	if (theme.styleSheetContent) {
		_applyRules(theme.styleSheetContent, colorThemeRulesClassName);
		return TPromise.as(onApply(theme));
	}
	return _loadThemeDocument(getBaseThemeId(theme.id), theme.path).then(themeSettings => {
		theme.settings = themeSettings;
		let styleSheetContent = _processThemeObject(theme.id, themeSettings);
		theme.styleSheetContent = styleSheetContent;
		theme.isLoaded = true;
		_applyRules(styleSheetContent, colorThemeRulesClassName);
		return onApply(theme);
	}, error => {
		return TPromise.wrapError(nls.localize('error.cannotloadtheme', "Unable to load {0}", theme.path));
	});
}

function _loadThemeDocument(baseTheme: string, themePath: string): TPromise<IThemeSetting[]> {
	return pfs.readFile(themePath).then(content => {
		let allSettings = defaultThemeColors[baseTheme] || [];
		if (Paths.extname(themePath) === '.json') {
			let errors: Json.ParseError[] = [];
			let contentValue = Json.parse(content.toString(), errors);
			if (errors.length > 0) {
				return TPromise.wrapError(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => Json.getParseErrorMessage(e.error)).join(', '))));
			}
			if (!Array.isArray(contentValue.settings)) {
				return TPromise.wrapError(new Error(nls.localize('error.invalidformat', "Problem parsing JSON theme file: {0}. 'settings' is not array.")));
			}
			allSettings = allSettings.concat(contentValue.settings); // will clone
			if (contentValue.include) {
				return _loadThemeDocument(baseTheme, Paths.join(Paths.dirname(themePath), contentValue.include)).then(settings => {
					allSettings = settings.concat(allSettings);
					return TPromise.as(allSettings);
				});
			}
			return TPromise.as(allSettings);
		}
		try {
			let contentValue = plist.parse(content.toString());
			let settings: IThemeSetting[] = contentValue.settings;
			if (!Array.isArray(settings)) {
				return TPromise.wrapError(new Error(nls.localize('error.plist.invalidformat', "Problem parsing theme file: {0}. 'settings' is not array.")));
			}
			allSettings = allSettings.concat(settings); // will clone
			return TPromise.as(allSettings);
		} catch (e) {
			return TPromise.wrapError(new Error(nls.localize('error.cannotparse', "Problems parsing theme file: {0}", e.message)));
		}
	});
}

function _processThemeObject(themeId: string, themeSettings: IThemeSetting[]): string {
	let cssRules: string[] = [];

	if (Array.isArray(themeSettings)) {
		new EditorStylesContribution().contributeStyles(themeId, themeSettings, cssRules);
		new SearchViewStylesContribution().contributeStyles(themeId, themeSettings, cssRules);
		new TerminalStylesContribution().contributeStyles(themeId, themeSettings, cssRules);
	}

	return cssRules.join('\n');
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

const schemaId = 'vscode://schemas/icon-theme';
const schema: IJSONSchema = {
	type: 'object',
	definitions: {
		folderExpanded: {
			type: 'string',
			description: nls.localize('schema.folderExpanded', 'The folder icon for expanded folders. The expanded folder icon is optional. If not set, the icon defined for folder will be shown.')
		},
		folder: {
			type: 'string',
			description: nls.localize('schema.folder', 'The folder icon for collapsed folders, and if folderExpanded is not set, also for expanded folders.')

		},
		file: {
			type: 'string',
			description: nls.localize('schema.file', 'The default file icon, shown for all files that don\'t match any extension, filename or language id.')

		},
		folderNames: {
			type: 'object',
			description: nls.localize('schema.folderNames', 'Associates folder names to icons. The object key is is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive.'),
			additionalProperties: {
				type: 'string',
				description: nls.localize('schema.folderName', 'The ID of the icon definition for the association.')
			}
		},
		folderNamesExpanded: {
			type: 'object',
			description: nls.localize('schema.folderNamesExpanded', 'Associates folder names to icons for expanded folders. The object key is is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive.'),
			additionalProperties: {
				type: 'string',
				description: nls.localize('schema.folderNameExpanded', 'The ID of the icon definition for the association.')
			}
		},
		fileExtensions: {
			type: 'object',
			description: nls.localize('schema.fileExtensions', 'Associates file extensions to icons. The object key is is the file extension name. The extension name is the last segment of a file name after the last dot (not including the dot). Extensions are compared case insensitive.'),

			additionalProperties: {
				type: 'string',
				description: nls.localize('schema.fileExtension', 'The ID of the icon definition for the association.')
			}
		},
		fileNames: {
			type: 'object',
			description: nls.localize('schema.fileNames', 'Associates file names to icons. The object key is is the full file name, but not including any path segments. File name can include dots and a possible file extension. No patterns or wildcards are allowed. File name matching is case insensitive.'),

			additionalProperties: {
				type: 'string',
				description: nls.localize('schema.fileName', 'The ID of the icon definition for the association.')
			}
		},
		languageIds: {
			type: 'object',
			description: nls.localize('schema.languageIds', 'Associates languages to icons. The object key is the language id as defined in the language contribution point.'),

			additionalProperties: {
				type: 'string',
				description: nls.localize('schema.languageId', 'The ID of the icon definition for the association.')
			}
		},
		associations: {
			type: 'object',
			properties: {
				folderExpanded: {
					$ref: '#/definitions/folderExpanded'
				},
				folder: {
					$ref: '#/definitions/folder'
				},
				file: {
					$ref: '#/definitions/file'
				},
				folderNames: {
					$ref: '#/definitions/folderNames'
				},
				folderNamesExpanded: {
					$ref: '#/definitions/folderNamesExpanded'
				},
				fileExtensions: {
					$ref: '#/definitions/fileExtensions'
				},
				fileNames: {
					$ref: '#/definitions/fileNames'
				},
				languageIds: {
					$ref: '#/definitions/languageIds'
				}
			}
		}
	},
	properties: {
		fonts: {
			type: 'array',
			description: nls.localize('schema.fonts', 'Fonts that are used in the icon definitions.'),
			items: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: nls.localize('schema.id', 'The ID of the font.')
					},
					src: {
						type: 'array',
						description: nls.localize('schema.src', 'The locations of the font.'),
						items: {
							type: 'object',
							properties: {
								path: {
									type: 'string',
									description: nls.localize('schema.font-path', 'The font path, relative to the current icon theme file.'),
								},
								format: {
									type: 'string',
									description: nls.localize('schema.font-format', 'The format of the font.')
								}
							},
							required: [
								'path',
								'format'
							]
						}
					},
					weight: {
						type: 'string',
						description: nls.localize('schema.font-weight', 'The weight of the font.')
					},
					style: {
						type: 'string',
						description: nls.localize('schema.font-sstyle', 'The style of the font.')
					},
					size: {
						type: 'string',
						description: nls.localize('schema.font-size', 'The default size of the font.')
					}
				},
				required: [
					'id',
					'src'
				]
			}
		},
		iconDefinitions: {
			type: 'object',
			description: nls.localize('schema.iconDefinitions', 'Description of all icons that can be used when associating files to icons.'),
			additionalProperties: {
				type: 'object',
				description: nls.localize('schema.iconDefinition', 'An icon definition. The object key is the ID of the definition.'),
				properties: {
					iconPath: {
						type: 'string',
						description: nls.localize('schema.iconPath', 'When using a SVG or PNG: The path to the image. The path is relative to the icon set file.')
					},
					fontCharacter: {
						type: 'string',
						description: nls.localize('schema.fontCharacter', 'When using a glyph font: The character in the font to use.')
					},
					fontColor: {
						type: 'string',
						description: nls.localize('schema.fontColor', 'When using a glyph font: The color to use.')
					},
					fontSize: {
						type: 'string',
						description: nls.localize('schema.fontSize', 'When using a font: The font size in percentage to the text font. If not set, defaults to the size in the font definition.')
					},
					fontId: {
						type: 'string',
						description: nls.localize('schema.fontId', 'When using a font: The id of the font. If not set, defaults to the first font definition.')
					}
				}
			}
		},
		folderExpanded: {
			$ref: '#/definitions/folderExpanded'
		},
		folder: {
			$ref: '#/definitions/folder'
		},
		file: {
			$ref: '#/definitions/file'
		},
		folderNames: {
			$ref: '#/definitions/folderNames'
		},
		fileExtensions: {
			$ref: '#/definitions/fileExtensions'
		},
		fileNames: {
			$ref: '#/definitions/fileNames'
		},
		languageIds: {
			$ref: '#/definitions/languageIds'
		},
		light: {
			$ref: '#/definitions/associations',
			description: nls.localize('schema.light', 'Optional associations for file icons in light color themes.')
		},
		highContrast: {
			$ref: '#/definitions/associations',
			description: nls.localize('schema.highContrast', 'Optional associations for file icons in high contrast color themes.')
		}
	}
};

let schemaRegistry = <IJSONContributionRegistry>Registry.as(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);