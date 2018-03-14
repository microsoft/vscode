/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

import * as types from 'vs/base/common/types';
import * as Paths from 'path';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IColorTheme, ExtensionData, IThemeExtensionPoint, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ColorThemeData } from 'vs/workbench/services/themes/electron-browser/colorThemeData';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';


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

export class ColorThemeStore {

	private extensionsColorThemes: ColorThemeData[];
	private readonly onDidChangeEmitter: Emitter<ColorThemeData[]>;

	public get onDidChange(): Event<ColorThemeData[]> { return this.onDidChangeEmitter.event; }

	constructor(@IExtensionService private extensionService: IExtensionService, defaultTheme: ColorThemeData) {
		this.extensionsColorThemes = [defaultTheme];
		this.onDidChangeEmitter = new Emitter<ColorThemeData[]>();
		this.initialize();
	}


	private initialize() {
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
			this.onDidChangeEmitter.fire(this.extensionsColorThemes);
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
			let themeData = ColorThemeData.fromExtensionTheme(theme, normalizedAbsolutePath, extensionData);
			if (themeData.id === this.extensionsColorThemes[0].id) {
				this.extensionsColorThemes[0] = themeData;
			} else {
				this.extensionsColorThemes.push(themeData);
			}
		});
	}

	public findThemeData(themeId: string, defaultId?: string): TPromise<ColorThemeData> {
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
		return this.extensionService.whenInstalledExtensionsRegistered().then(isReady => {
			return this.extensionsColorThemes;
		});
	}

}
