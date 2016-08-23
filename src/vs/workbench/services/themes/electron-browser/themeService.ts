/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import Paths = require('vs/base/common/paths');
import Json = require('vs/base/common/json');
import {IThemeExtensionPoint} from 'vs/platform/theme/common/themeExtensionPoint';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ExtensionsRegistry, IExtensionMessageCollector} from 'vs/platform/extensions/common/extensionsRegistry';
import {IThemeService, IThemeData} from 'vs/workbench/services/themes/common/themeService';
import {getBaseThemeId, getSyntaxThemeId} from 'vs/platform/theme/common/themes';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {Registry} from 'vs/platform/platform';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IFilesConfiguration} from 'vs/platform/files/common/files';
import {Extensions as JSONExtensions, IJSONContributionRegistry} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {IJSONSchema} from 'vs/base/common/jsonSchema';

import {$} from 'vs/base/browser/builder';
import Event, {Emitter} from 'vs/base/common/event';

import plist = require('vs/base/node/plist');
import pfs = require('vs/base/node/pfs');

// implementation

const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';
const DEFAULT_FILE_ICONS = 'vs-standard';

const THEME_CHANNEL = 'vscode:changeTheme';
const THEME_PREF = 'workbench.theme';

let defaultBaseTheme = getBaseThemeId(DEFAULT_THEME_ID);

const defaultThemeExtensionId = 'vscode-theme-defaults';
const oldDefaultThemeExtensionId = 'vscode-theme-colorful-defaults';

function validateThemeId(theme: string) : string {
	// migrations
	switch (theme) {
		case 'vs': return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
		case 'vs-dark': return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
		case 'hc-black': return `hc-black ${defaultThemeExtensionId}-themes-hc_black-json`;
		case `vs ${oldDefaultThemeExtensionId}-themes-light_plus-tmTheme`: return `vs ${defaultThemeExtensionId}-themes-light_plus-json`;
		case `vs-dark ${oldDefaultThemeExtensionId}-themes-dark_plus-tmTheme`: return `vs-dark ${defaultThemeExtensionId}-themes-dark_plus-json`;
	}
	return theme;
}

let themesExtPoint = ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>('themes', {
	description: nls.localize('vscode.extension.contributes.themes', 'Contributes textmate color themes.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { label: '{{label}}', uiTheme: 'vs-dark', path: './themes/{{id}}.tmTheme.' } }],
		properties: {
			label: {
				description: nls.localize('vscode.extension.contributes.themes.label', 'Label of the color theme as shown in the UI.'),
				type: 'string'
			},
			uiTheme: {
				description: nls.localize('vscode.extension.contributes.themes.uiTheme', 'Base theme defining the colors around the editor: \'vs\' is the light color theme, \'vs-dark\' is the dark color theme. \'hc-black\' is the dark high contrast theme.'),
				enum: ['vs', 'vs-dark', 'hc-black']
			},
			path: {
				description: nls.localize('vscode.extension.contributes.themes.path', 'Path of the tmTheme file. The path is relative to the extension folder and is typically \'./themes/themeFile.tmTheme\'.'),
				type: 'string'
			}
		},
		required: ['path', 'uiTheme']
	}
});

let fileIconsExtPoint = ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>('fileIcons', {
	description: nls.localize('vscode.extension.contributes.fileIcons', 'Contributes icon themes.'),
	type: 'array',
	items: {
		type: 'object',
		defaultSnippets: [{ body: { id: '{{id}}', label: '{{label}}', path: './fileicons/{{id}}-icon-theme.json' } }],
		properties: {
			id: {
				description: nls.localize('vscode.extension.contributes.fileIcons.id', 'Id of the icon theme as used in the user settings.'),
				type: 'string'
			},
			label: {
				description: nls.localize('vscode.extension.contributes.fileIcons.label', 'Label of the icon theme as shown in the UI.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.fileIcons.path', 'Path of the icon theme definition file. The path is relative to the extension folder and is typically \'./icons/awesome-icon-theme.json\'.'),
				type: 'string'
			}
		},
		required: ['path', 'id']
	}
});

interface ThemeSettingStyle {
	background?: string;
	foreground?: string;
	fontStyle?: string;
	caret?: string;
	invisibles?: string;
	guide?: string;
	lineHighlight?: string;
	selection?: string;
}

interface ThemeSetting {
	name?: string;
	scope?: string | string[];
	settings: ThemeSettingStyle[];
}

interface ThemeDocument {
	name: string;
	include: string;
	settings: ThemeSetting[];
}

interface IInternalThemeData extends IThemeData {
	styleSheetContent?: string;
	extensionId: string;
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
	src: { path:string; format:string; }[];
}

interface FileIconsAssociation {
	folder?: string;
	file?: string;
	folderExpanded?: string;
	folderNames?: {[folderName:string]: string; };
	fileExtensions?: {[extension:string]: string; };
	fileNames?: {[fileName:string]: string; };
	languageIds?: {[languageId:string]: string; };
}

interface FileIconsDocument extends FileIconsAssociation {
	iconDefinitions: { [key:string]: IconDefinition };
	fonts: FontDefinition[];
	light?: FileIconsAssociation;
	highContrast?: FileIconsAssociation;
}

export class ThemeService implements IThemeService {
	_serviceBrand: any;

	private knownThemes: IInternalThemeData[];
	private currentTheme: string;
	private container: HTMLElement;
	private onColorThemeChange: Emitter<string>;

	private knownFileIconContributions: IInternalThemeData[];
	private currentFileIcons: string;

	constructor(
			@IExtensionService private extensionService: IExtensionService,
			@IWindowService private windowService: IWindowService,
			@IStorageService private storageService: IStorageService,
			@IConfigurationService private configurationService: IConfigurationService,
			@ITelemetryService private telemetryService: ITelemetryService) {

		this.knownThemes = [];
		this.onColorThemeChange = new Emitter<string>();
		this.knownFileIconContributions = [];
		this.currentFileIcons = null;

		themesExtPoint.setHandler((extensions) => {
			for (let ext of extensions) {
				this.onThemes(ext.description.extensionFolderPath, ext.description.id, ext.value, ext.collector);
			}
		});

		windowService.onBroadcast(e => {
			if (e.channel === THEME_CHANNEL && typeof e.payload === 'string') {
				this.setColorTheme(e.payload, false);
			}
		});

		fileIconsExtPoint.setHandler((extensions) => {
			for (let ext of extensions) {
				this.onFileIcons(ext.description.extensionFolderPath, ext.description.id, ext.value, ext.collector);
			}
		});

		const settings = configurationService.getConfiguration<IFilesConfiguration>();
		let iconTheme = settings && settings.files && settings.files.iconTheme;
		if (iconTheme) {
			this.setFileIcons(iconTheme);
		}

		configurationService.onDidUpdateConfiguration(e => {
			let filesConfig = e.config.files;
			let iconTheme = filesConfig && filesConfig.iconTheme;
			this.setFileIcons(iconTheme);
		});
	}

	public get onDidColorThemeChange(): Event<string> {
		return this.onColorThemeChange.event;
	}

	public initialize(container: HTMLElement): TPromise<boolean> {
		this.container = container;

		let themeId = this.storageService.get(THEME_PREF, StorageScope.GLOBAL, null);
		if (!themeId) {
			themeId = DEFAULT_THEME_ID;
			this.storageService.store(THEME_PREF, themeId, StorageScope.GLOBAL);
		}
		return this.setColorTheme(themeId, false);
	}

	public setColorTheme(themeId: string, broadcastToAllWindows: boolean) : TPromise<boolean> {
		if (!themeId) {
			return TPromise.as(false);
		}
		if (themeId === this.currentTheme) {
			if (broadcastToAllWindows) {
				this.windowService.broadcast({ channel: THEME_CHANNEL, payload: themeId });
			}
			return TPromise.as(true);
		}

		themeId = validateThemeId(themeId); // migrate theme ids

		let onApply = (newTheme: IInternalThemeData) => {
			let newThemeId = newTheme.id;
			if (this.container) {
				if (this.currentTheme) {
					$(this.container).removeClass(this.currentTheme);
				}
				this.currentTheme = newThemeId;
				$(this.container).addClass(newThemeId);
			}

			this.storageService.store(THEME_PREF, newThemeId, StorageScope.GLOBAL);
			if (broadcastToAllWindows) {
				this.windowService.broadcast({ channel: THEME_CHANNEL, payload: newThemeId });
			} else {
				this.sendTelemetry(newTheme);
			}
			this.onColorThemeChange.fire(newThemeId);
		};

		return this.applyThemeCSS(themeId, DEFAULT_THEME_ID, onApply);
	}

	public getColorTheme() {
		return this.currentTheme || this.storageService.get(THEME_PREF, StorageScope.GLOBAL, DEFAULT_THEME_ID);
	}

	private findThemeData(themeId: string, defaultId?: string): TPromise<IInternalThemeData> {
		return this.getColorThemes().then(allThemes => {
			let themes = allThemes.filter(t => t.id === themeId);
			if (themes.length > 0) {
				return <IInternalThemeData> themes[0];
			}
			if (defaultId) {
				let themes = allThemes.filter(t => t.id === defaultId);
				if (themes.length > 0) {
					return <IInternalThemeData> themes[0];
				}
			}
			return null;
		});
	}

	private applyThemeCSS(themeId: string, defaultId: string, onApply: (theme:IInternalThemeData) => void): TPromise<boolean> {
		return this.findThemeData(themeId, defaultId).then(theme => {
			if (theme) {
				return applyTheme(theme, onApply);
			}
			return false;
		});
	}

	public getColorThemes(): TPromise<IThemeData[]> {
		return this.extensionService.onReady().then(isReady => {
			return this.knownThemes;
		});
	}

	private onThemes(extensionFolderPath: string, extensionId: string, themes: IThemeExtensionPoint[], collector: IExtensionMessageCollector): void {
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

			let themeSelector = toCSSSelector(extensionId + '-' + Paths.normalize(theme.path));
			this.knownThemes.push({
				id: `${theme.uiTheme || defaultBaseTheme} ${themeSelector}`,
				label: theme.label || Paths.basename(theme.path),
				description: theme.description,
				path: normalizedAbsolutePath,
				extensionId: extensionId
			});
		});
	}

	private onFileIcons(extensionFolderPath: string, extensionId: string, fileIcons: IThemeExtensionPoint[], collector: IExtensionMessageCollector): void {
		if (!Array.isArray(fileIcons)) {
			collector.error(nls.localize(
				'reqarray',
				"Extension point `{0}` must be an array.",
				themesExtPoint.name
			));
			return;
		}
		fileIcons.forEach(fileIconSet => {
			if (!fileIconSet.path || (typeof fileIconSet.path !== 'string')) {
				collector.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					themesExtPoint.name,
					String(fileIconSet.path)
				));
				return;
			}
			if (!fileIconSet.id || (typeof fileIconSet.id !== 'string')) {
				collector.error(nls.localize(
					'reqid',
					"Expected string in `contributes.{0}.id`. Provided value: {1}",
					themesExtPoint.name,
					String(fileIconSet.path)
				));
				return;
			}
			let normalizedAbsolutePath = Paths.normalize(Paths.join(extensionFolderPath, fileIconSet.path));

			if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", themesExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
			}

			this.knownFileIconContributions.push({
				id: fileIconSet.id,
				label: fileIconSet.label || Paths.basename(fileIconSet.path),
				description: fileIconSet.description,
				path: normalizedAbsolutePath,
				extensionId: extensionId
			});
		});
	}

	private themeExtensionsActivated = {};
	private sendTelemetry(themeData: IInternalThemeData) {
		if (!this.themeExtensionsActivated[themeData.extensionId]) {
			let description = ExtensionsRegistry.getExtensionDescription(themeData.extensionId);
			if (description) {
				this.telemetryService.publicLog('activatePlugin', {
					id: description.id,
					name: description.name,
					isBuiltin: description.isBuiltin,
					publisherDisplayName: description.publisher,
					themeId: themeData.id
				});
				this.themeExtensionsActivated[themeData.extensionId] = true;
			}
		}
	}

	public getFileIcons(): TPromise<IThemeData[]> {
		return this.extensionService.onReady().then(isReady => {
			return this.knownFileIconContributions;
		});
	}

	private setFileIcons(fileIcons: string) : TPromise<boolean> {
		if (fileIcons !== this.currentFileIcons) {
			this.currentFileIcons = fileIcons;
			return this._updateFileIcons();
		}
		return TPromise.as(true);
	}

	private _updateFileIcons() : TPromise<boolean> {
		return this.getFileIcons().then(allIconSets => {
			let iconSetData;
			for (let iconSet of allIconSets) {
				if (iconSet.id === this.currentFileIcons) {
					iconSetData = <IInternalThemeData> iconSet;
					break;
				}
			}
			return _applyFileIcons(iconSetData);
		});
	}
}

function _applyFileIcons(data: IInternalThemeData): TPromise<boolean> {
	if (!data) {
		_applyRules('', fileIconRulesClassName);
		return TPromise.as(true);
	}

	if (data.styleSheetContent) {
		_applyRules(data.styleSheetContent, fileIconRulesClassName);
		return TPromise.as(true);
	}
	return _loadFileIconsDocument(data.path).then(fileIconsDocument => {
		let styleSheetContent = _processFileIconsObject(data.id, data.path, fileIconsDocument);
		data.styleSheetContent = styleSheetContent;
		_applyRules(styleSheetContent, fileIconRulesClassName);
		return true;
	}, error => {
		return TPromise.wrapError(nls.localize('error.cannotloadfileicons', "Unable to load {0}", data.path));
	});
}

function _loadFileIconsDocument(fileSetPath: string) : TPromise<FileIconsDocument> {
	return pfs.readFile(fileSetPath).then(content => {
		let errors: Json.ParseError[] = [];
		let contentValue = <ThemeDocument> Json.parse(content.toString(), errors);
		if (errors.length > 0) {
			return TPromise.wrapError(new Error(nls.localize('error.cannotparsefileicons', "Problems parsing file icons file: {0}", errors.map(e => Json.getParseErrorMessage(e.error)).join(', '))));
		}
		return TPromise.as(contentValue);
	});
}

function _processFileIconsObject(id: string, fileIconsPath: string, fileIconsDocument: FileIconsDocument) : string {
	if (!fileIconsDocument.iconDefinitions) {
		return '';
	}
	let selectorByDefinitionId : {[def:string]:string[]} = {};

	function resolvePath(path: string) {
		return Paths.join(Paths.dirname(fileIconsPath), path);
	}

	function collectSelectors(associations: FileIconsAssociation, baseThemeClassName?: string) {
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

			addSelector(`${qualifier} .folder-icon::before`, associations.folder);
			addSelector(`${qualifier} .expanded .folder-icon::before`, associations.folderExpanded);
			addSelector(`${qualifier} .file-icon::before`, associations.file);

			let folderNames = associations.folderNames;
			if (folderNames) {
				for (let folderName in folderNames) {
					addSelector(`${qualifier} .${escapeCSS(folderName.toLowerCase())}-name-folder-icon.folder-icon::before`, folderNames[folderName]);
				}
			}
			let fileExtensions = associations.fileExtensions;
			if (fileExtensions) {
				for (let fileExtension in fileExtensions) {
					addSelector(`${qualifier} .${escapeCSS(fileExtension.toLowerCase())}-ext-file-icon.file-icon::before`, fileExtensions[fileExtension]);
				}
			}
			let fileNames = associations.fileNames;
			if (fileNames) {
				for (let fileName in fileNames) {
					fileName = fileName.toLowerCase();
					let idx = fileName.lastIndexOf('.');
					let [name, ext] = idx !== -1 ? [fileName.substr(0, idx), fileName.substr(idx + 1)] : [ fileName , ''];
					addSelector(`${qualifier} .${escapeCSS(name)}-name-file-icon.${escapeCSS(ext)}-ext-file-icon.file-icon::before`, fileNames[fileName]);
				}
			}
			let languageIds = associations.languageIds;
			if (languageIds) {
				for (let languageId in languageIds) {
					addSelector(`${qualifier} .${escapeCSS(languageId)}-lang-file-icon.file-icon::before`, languageIds[languageId]);
				}
			}
		}
	}
	collectSelectors(fileIconsDocument);
	collectSelectors(fileIconsDocument.light, '.vs');
	collectSelectors(fileIconsDocument.highContrast, '.hc_black');

	let cssRules: string[] = [];

	let fonts = fileIconsDocument.fonts;
	if (Array.isArray(fonts)) {
		fonts.forEach(font => {
			let src = font.src.map(l => `url('${resolvePath(l.path)}') format('${l.format}')`).join(', ');
			cssRules.push(`@font-face { src: ${src}; font-family: '${font.id}'; font-weigth: ${font.weight}; font-style: ${font.style}; }`);
		});
		cssRules.push(`.show-file-icons .file-icon::before, .show-file-icons .folder-icon::before { font-family: '${fonts[0].id}'; font-size: ${fonts[0].size || '150%'}}`);
	}

	for (let defId in selectorByDefinitionId) {
		let selectors = selectorByDefinitionId[defId];
		let definition = fileIconsDocument.iconDefinitions[defId];
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
	return cssRules.join('\n');
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

function applyTheme(theme: IInternalThemeData, onApply: (theme:IInternalThemeData) => void): TPromise<boolean> {
	if (theme.styleSheetContent) {
		_applyRules(theme.styleSheetContent, colorThemeRulesClassName);
		onApply(theme);
		return TPromise.as(true);
	}
	return _loadThemeDocument(theme.path).then(themeDocument => {
		let styleSheetContent = _processThemeObject(theme.id, themeDocument);
		theme.styleSheetContent = styleSheetContent;
		_applyRules(styleSheetContent, colorThemeRulesClassName);
		onApply(theme);
		return true;
	}, error => {
		return TPromise.wrapError(nls.localize('error.cannotloadtheme', "Unable to load {0}", theme.path));
	});
}

function _loadThemeDocument(themePath: string) : TPromise<ThemeDocument> {
	return pfs.readFile(themePath).then(content => {
		if (Paths.extname(themePath) === '.json') {
			let errors: Json.ParseError[] = [];
			let contentValue = <ThemeDocument> Json.parse(content.toString(), errors);
			if (errors.length > 0) {
				return TPromise.wrapError(new Error(nls.localize('error.cannotparsejson', "Problems parsing JSON theme file: {0}", errors.map(e => Json.getParseErrorMessage(e.error)).join(', '))));
			}
			if (contentValue.include) {
				return _loadThemeDocument(Paths.join(Paths.dirname(themePath), contentValue.include)).then(includedValue => {
					contentValue.settings = includedValue.settings.concat(contentValue.settings);
					return TPromise.as(contentValue);
				});
			}
			return TPromise.as(contentValue);
		} else {
			let parseResult = plist.parse(content.toString());
			if (parseResult.errors && parseResult.errors.length) {
				return TPromise.wrapError(new Error(nls.localize('error.cannotparse', "Problems parsing plist file: {0}", parseResult.errors.join(', '))));
			}
			return TPromise.as(parseResult.value);
		}
	});
}

function _processThemeObject(themeId: string, themeDocument: ThemeDocument): string {
	let cssRules: string[] = [];

	let themeSettings : ThemeSetting[] = themeDocument.settings;
	let editorSettings : ThemeSettingStyle = {
		background: void 0,
		foreground: void 0,
		caret: void 0,
		invisibles: void 0,
		guide: void 0,
		lineHighlight: void 0,
		selection: void 0
	};

	let themeSelector = `${getBaseThemeId(themeId)}.${getSyntaxThemeId(themeId)}`;

	if (Array.isArray(themeSettings)) {
		themeSettings.forEach((s : ThemeSetting, index, arr) => {
			if (index === 0 && !s.scope) {
				editorSettings = s.settings;
			} else {
				let scope: string | string[] = s.scope;
				let settings = s.settings;
				if (scope && settings) {
					let rules = Array.isArray(scope) ? <string[]> scope : scope.split(',');
					let statements = _settingsToStatements(settings);
					rules.forEach(rule => {
						rule = rule.trim().replace(/ /g, '.'); // until we have scope hierarchy in the editor dom: replace spaces with .

						cssRules.push(`.monaco-editor.${themeSelector} .token.${rule} { ${statements} }`);
					});
				}
			}
		});
	}

	if (editorSettings.background) {
		let background = new Color(editorSettings.background);
		cssRules.push(`.monaco-editor.${themeSelector} .monaco-editor-background { background-color: ${background}; }`);
		cssRules.push(`.monaco-editor.${themeSelector} .glyph-margin { background-color: ${background}; }`);
		cssRules.push(`.${themeSelector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
	}
	if (editorSettings.foreground) {
		let foreground = new Color(editorSettings.foreground);
		cssRules.push(`.monaco-editor.${themeSelector} .token { color: ${foreground}; }`);
	}
	if (editorSettings.selection) {
		let selection = new Color(editorSettings.selection);
		cssRules.push(`.monaco-editor.${themeSelector} .focused .selected-text { background-color: ${selection}; }`);
		cssRules.push(`.monaco-editor.${themeSelector} .selected-text { background-color: ${selection.transparent(0.5)}; }`);
	}
	if (editorSettings.lineHighlight) {
		let lineHighlight = new Color(editorSettings.lineHighlight);
		cssRules.push(`.monaco-editor.${themeSelector} .current-line { background-color: ${lineHighlight}; border:0; }`);
	}
	if (editorSettings.caret) {
		let caret = new Color(editorSettings.caret);
		let oppositeCaret = caret.opposite();
		cssRules.push(`.monaco-editor.${themeSelector} .cursor { background-color: ${caret}; border-color: ${caret}; color: ${oppositeCaret}; }`);
	}
	if (editorSettings.invisibles) {
		let invisibles = new Color(editorSettings.invisibles);
		cssRules.push(`.monaco-editor.${themeSelector} .token.whitespace { color: ${invisibles} !important; }`);
	}
	if (editorSettings.guide) {
		let guide = new Color(editorSettings.guide);
		cssRules.push(`.monaco-editor.${themeSelector} .lines-content .cigr { background: ${guide}; }`);
	}
	return cssRules.join('\n');
}

function _settingsToStatements(settings: ThemeSettingStyle): string {
	let statements: string[] = [];

	for (let settingName in settings) {
		const value = settings[settingName];
		switch (settingName) {
			case 'foreground':
				let foreground = new Color(value);
				statements.push(`color: ${foreground};`);
				break;
			case 'background':
				// do not support background color for now, see bug 18924
				//let background = new Color(value);
				//statements.push(`background-color: ${background};`);
				break;
			case 'fontStyle':
				let segments = value.split(' ');
				segments.forEach(s => {
					switch (s) {
						case 'italic':
							statements.push(`font-style: italic;`);
							break;
						case 'bold':
							statements.push(`font-weight: bold;`);
							break;
						case 'underline':
							statements.push(`text-decoration: underline;`);
							break;
					}
				});
		}
	}
	return statements.join(' ');
}

let colorThemeRulesClassName = 'contributedColorTheme';
let fileIconRulesClassName = 'contributedFileIcons';

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

interface RGBA { r: number; g: number; b: number; a: number; }

class Color {

	private parsed: RGBA;
	private str: string;

	constructor(arg: string | RGBA) {
		if (typeof arg === 'string') {
			this.parsed = Color.parse(<string>arg);
		} else {
			this.parsed = <RGBA>arg;
		}
		this.str = null;
	}

	private static parse(color: string): RGBA {
		function parseHex(str: string) {
			return parseInt('0x' + str);
		}

		if (color.charAt(0) === '#' && color.length >= 7) {
			let r = parseHex(color.substr(1, 2));
			let g = parseHex(color.substr(3, 2));
			let b = parseHex(color.substr(5, 2));
			let a = color.length === 9 ? parseHex(color.substr(7, 2)) / 0xff : 1;
			return { r, g, b, a };
		}
		return { r: 255, g: 0, b: 0, a: 1 };
	}

	public toString(): string {
		if (!this.str) {
			let p = this.parsed;
			this.str = `rgba(${p.r}, ${p.g}, ${p.b}, ${+p.a.toFixed(2)})`;
		}
		return this.str;
	}

	public transparent(factor: number): Color {
		let p = this.parsed;
		return new Color({ r: p.r, g: p.g, b: p.b, a: p.a * factor });
	}

	public opposite(): Color {
		return new Color({
			r: 255 - this.parsed.r,
			g: 255 - this.parsed.g,
			b: 255 - this.parsed.b,
			a : this.parsed.a
		});
	}
}

var configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'files',
	'order': 9.01,
	'type': 'object',
	'properties': {
		'files.iconTheme': {
			'type': 'string',
			'default': DEFAULT_FILE_ICONS,
			'description': nls.localize('settings.icons.dark', 'The active file icons. Use \'explorer.showFileIcons\' to enable file icons in the explorer'),
		}
	}
});

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
			$ref: '#/definitions/associations'
		},
		highContrast: {
			$ref: '#/definitions/associations'
		}
	},
	required: [
		'iconDefinitions',
		'file'
	]
};

let schemaRegistry = <IJSONContributionRegistry>Registry.as(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);