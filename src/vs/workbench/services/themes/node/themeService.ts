/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import WinJS = require('vs/base/common/winjs.base');
import nls = require('vs/nls');
import Paths = require('vs/base/common/paths');
import Themes = require('vs/platform/theme/common/themes');
import {IThemeExtensionPoint} from 'vs/platform/theme/common/themeExtensionPoint';
import {IPluginService} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry, IMessageCollector} from 'vs/platform/plugins/common/pluginsRegistry';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

import plist = require('vs/base/node/plist');
import pfs = require('vs/base/node/pfs');

export var IThemeService = createDecorator<IThemeService>('themeService');

export interface IThemeService {
	serviceId : ServiceIdentifier<any>;
	getTheme(themeId: string) : WinJS.TPromise<ITheme>;
	loadThemeCSS(themeId: string) : WinJS.TPromise<boolean>;
	getThemes(): WinJS.TPromise<ITheme[]>;
}

export interface ITheme {
	id: string;
	label: string;
	description?: string;
	path: string;
	styleSheetContent?: string;
}

// implementation

var defaultBaseTheme = Themes.toId(Themes.BaseTheme.VS_DARK);

let themesExtPoint = PluginsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>('themes', {
	description: nls.localize('vscode.extension.contributes.themes', 'Contributes textmate color themes.'),
	type: 'array',
	default: [{ label: '{{label}}', uiTheme: 'vs-dark', path: './themes/{{id}}.tmTheme.'}],
	items: {
		type: 'object',
		default: { label: '{{label}}', uiTheme: 'vs-dark', path: './themes/{{id}}.tmTheme.'},
		properties: {
			label: {
				description: nls.localize('vscode.extension.contributes.themes.label', 'Label of the color theme as shown in the UI.'),
				type: 'string'
			},
			uiTheme: {
				description: nls.localize('vscode.extension.contributes.themes.uiTheme', 'Base theme defining the colors around the editor: \'vs\' is the light color theme, \'vs-dark\' is the dark color theme.'),
				enum: [ 'vs', 'vs-dark']
			},
			path: {
				description: nls.localize('vscode.extension.contributes.themes.path', 'Path of the tmTheme file. The path is relative to the extension folder and is typically \'./themes/themeFile.tmTheme\'.'),
				type: 'string'
			}
		}
	}
});

export class ThemeService implements IThemeService {
	serviceId = IThemeService;

	private knownThemes: ITheme[];

	constructor (private pluginService: IPluginService) {
		this.knownThemes = [];

		themesExtPoint.setHandler((extensions) => {
			for (let ext of extensions) {
				this.onThemes(ext.description.extensionFolderPath, ext.description.id, ext.value, ext.collector);
			}
		});
	}

	public getTheme(themeId: string) : WinJS.TPromise<ITheme> {
		return this.getThemes().then(allThemes => {
			var themes = allThemes.filter(t => t.id === themeId);
			if (themes.length > 0) {
				return themes[0];
			}
			return null;
		});
	}

	public loadThemeCSS(themeId: string) : WinJS.TPromise<boolean> {
		return this.getTheme(themeId).then(theme => {
			if (theme) {
				return loadTheme(theme);
			}
			return null;
		})
	}

	public getThemes(): WinJS.TPromise<ITheme[]> {
		return this.pluginService.onReady().then(isReady => {
			return this.knownThemes;
		});
	}

	private onThemes(extensionFolderPath: string, extensionId: string, themes: IThemeExtensionPoint[], collector: IMessageCollector): void {
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

			var themeSelector = toCssSelector(extensionId + '-' + Paths.normalize(theme.path));
			this.knownThemes.push({
				id: `${theme.uiTheme || defaultBaseTheme} ${themeSelector}`,
				label: theme.label || Paths.basename(theme.path),
				description: theme.description,
				path: normalizedAbsolutePath
			});
		})
	}

}

function toCssSelector(str: string) {
	return str.replace(/[^_\-a-zA-Z0-9]/g, '-');
}


function loadTheme(theme: ITheme) : WinJS.TPromise<boolean> {
	if (theme.styleSheetContent) {
		_applyRules(theme.styleSheetContent)
	}

	return pfs.readFile(theme.path).then(content => {
		var parseResult = plist.parse(content.toString());
		if (parseResult.errors && parseResult.errors.length) {
			return WinJS.TPromise.wrapError(new Error(nls.localize('error.cannotparse', "Problems parsing plist file: {0}", parseResult.errors.join(', '))));
		}
		var styleSheetContent = _processThemeObject(theme.id, parseResult.value);
		theme.styleSheetContent = styleSheetContent;
		_applyRules(styleSheetContent)
		return true;
	}, error => {
		return WinJS.Promise.wrapError(nls.localize('error.cannotloadtheme', "Unable to load {0}", theme.path));
	});
}

function _processThemeObject(themeId: string, themeDocument: any) : string {
	var cssRules : string[] = [];

	var themeSettings = themeDocument.settings;
	var editorSettings = {
		background: void 0,
		foreground: void 0,
		caret: void 0,
		invisibles: void 0,
		lineHighlight: void 0,
		selection: void 0
	};

	var themeSelector = `${Themes.getBaseThemeId(themeId)}.${Themes.getSyntaxThemeId(themeId)}`;

	if (Array.isArray(themeSettings)) {
		themeSettings.forEach((s, index, arr) => {
			if (index === 0 && !s.scope) {
				editorSettings = s.settings;
			} else {
				var scope : string = s.scope;
				var settings : string = s.settings;
				if (scope && settings) {
					var rules = scope.split(',');
					var statements = _settingsToStatements(settings);
					rules.forEach(rule => {
						rule = rule.trim().replace(/ /g, '.'); // until we have scope hierarchy in the editor dom: replace spaces with .

						cssRules.push(`.monaco-editor.${themeSelector} .token.${rule} { ${statements} }`);
					});
				}
			}
		});
	}

	if (editorSettings.background) {
		var background = new Color(editorSettings.background);
		//cssRules.push(`.monaco-editor.${themeSelector} { background-color: ${background}; }`);
		cssRules.push(`.monaco-editor.${themeSelector} .monaco-editor-background { background-color: ${background}; }`);
		cssRules.push(`.monaco-editor.${themeSelector} .glyph-margin { background-color: ${background}; }`);
		cssRules.push(`.monaco-workbench.${themeSelector} .monaco-editor-background { background-color: ${background}; }`);
	}
	if (editorSettings.foreground) {
		var foreground = new Color(editorSettings.foreground);
		cssRules.push(`.monaco-editor.${themeSelector} { color: ${foreground}; }`);
		cssRules.push(`.monaco-editor.${themeSelector} .token { color: ${foreground}; }`);
	}
	if (editorSettings.selection) {
		var selection = new Color(editorSettings.selection);
		cssRules.push(`.monaco-editor.${themeSelector} .focused .selected-text { background-color: ${selection}; }`);
		cssRules.push(`.monaco-editor.${themeSelector} .selected-text { background-color: ${selection.transparent(0.5)}; }`);
	}
	if (editorSettings.lineHighlight) {
		var lineHighlight = new Color(editorSettings.lineHighlight);
		cssRules.push(`.monaco-editor.${themeSelector} .current-line { background-color: ${lineHighlight}; }`);
	}
	if (editorSettings.caret) {
		var caret = new Color(editorSettings.caret);
		cssRules.push(`.monaco-editor.${themeSelector} .cursor { background-color: ${caret}; }`);
	}
	if (editorSettings.invisibles) {
		var invisibles = new Color(editorSettings.invisibles);
		cssRules.push(`.monaco-editor.${themeSelector} .token.whitespace { color: ${invisibles} !important; }`);
	}

	return cssRules.join('\n');
}

function _settingsToStatements(settings: any) : string {
	var statements: string[] = [];

	for (var settingName in settings) {
		var value = settings[settingName];
		switch (settingName) {
			case 'foreground':
				var foreground = new Color(value);
				statements.push(`color: ${foreground};`);
				break;
			case 'background':
				// do not support background color for now, see bug 18924
				//var background = new Color(value);
				//statements.push(`background-color: ${background};`);
				break;
			case 'fontStyle':
				var segments = value.split(' ');
				segments.forEach(s => {
					switch (value) {
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

var className = 'contributedColorTheme';

function _applyRules(styleSheetContent: string) {
	var themeStyles = document.head.getElementsByClassName(className);
	if (themeStyles.length === 0) {
		var elStyle = document.createElement('style');
		elStyle.type= 'text/css';
		elStyle.className = className;
		elStyle.innerHTML = styleSheetContent;
		document.head.appendChild(elStyle);
	} else {
		(<HTMLStyleElement> themeStyles[0]).innerHTML = styleSheetContent;
	}
}

interface RGBA { r:number; g: number; b: number; a:number; }

class Color {

	private parsed : RGBA;
	private str: string;

	constructor(arg: string|RGBA) {
		if (typeof arg === 'string') {
			this.parsed = Color.parse(<string> arg);
		} else {
			this.parsed = <RGBA> arg;
		}
		this.str = null;
	}

	private static parse(color: string) : RGBA {
		function parseHex(str: string) {
			return parseInt('0x' + str);
		}

		if (color.charAt(0) === '#' && color.length >= 7) {
			var r = parseHex(color.substr(1, 2));
			var g = parseHex(color.substr(3, 2));
			var b = parseHex(color.substr(5, 2));
			var a = color.length === 9 ? parseHex(color.substr(7, 2)) / 0xff : 1
			return { r, g, b, a };
		}
		return { r:255, g:0, b:0, a:1 };
	}

	public toString(): string {
		if (!this.str) {
			var p = this.parsed;
			this.str = `rgba(${p.r}, ${p.g}, ${p.b}, ${+p.a.toFixed(2)})`;
		}
		return this.str;
	}

	public transparent(factor: number) : Color {
		var p = this.parsed;
		return new Color({ r: p.r, g: p.g, b: p.b, a: p.a*factor });
	}
}