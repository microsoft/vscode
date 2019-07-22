/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import * as types from 'vs/base/common/types';
import * as resources from 'vs/base/common/resources';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ExtensionData, IThemeExtensionPoint, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ColorThemeData } from 'vs/workbench/services/themes/common/colorThemeData';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

const themesExtPoint = ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>({
	extensionPoint: 'themes',
	jsonSchema: {
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
	}
});

export interface ColorThemeChangeEvent {
	themes: ColorThemeData[];
	added: ColorThemeData[];
}

export class ColorThemeStore {

	private extensionsColorThemes: ColorThemeData[];

	private readonly onDidChangeEmitter = new Emitter<ColorThemeChangeEvent>();
	public readonly onDidChange: Event<ColorThemeChangeEvent> = this.onDidChangeEmitter.event;

	constructor(@IExtensionService private readonly extensionService: IExtensionService, defaultTheme: ColorThemeData) {
		this.extensionsColorThemes = [defaultTheme];
		this.initialize();
	}

	private initialize() {
		themesExtPoint.setHandler((extensions, delta) => {
			const previousIds: { [key: string]: boolean } = {};
			const added: ColorThemeData[] = [];
			for (const theme of this.extensionsColorThemes) {
				previousIds[theme.id] = true;
			}
			this.extensionsColorThemes.length = 1; // remove all but the default theme
			for (let ext of extensions) {
				let extensionData = {
					extensionId: ext.description.identifier.value,
					extensionPublisher: ext.description.publisher,
					extensionName: ext.description.name,
					extensionIsBuiltin: ext.description.isBuiltin
				};
				this.onThemes(ext.description.extensionLocation, extensionData, ext.value, ext.collector);
			}
			for (const theme of this.extensionsColorThemes) {
				if (!previousIds[theme.id]) {
					added.push(theme);
				}
			}
			this.onDidChangeEmitter.fire({ themes: this.extensionsColorThemes, added });
		});
	}

	private onThemes(extensionLocation: URI, extensionData: ExtensionData, themes: IThemeExtensionPoint[], collector: ExtensionMessageCollector): void {
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

			const colorThemeLocation = resources.joinPath(extensionLocation, theme.path);
			if (!resources.isEqualOrParent(colorThemeLocation, extensionLocation)) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", themesExtPoint.name, colorThemeLocation.path, extensionLocation.path));
			}

			let themeData = ColorThemeData.fromExtensionTheme(theme, colorThemeLocation, extensionData);
			if (themeData.id === this.extensionsColorThemes[0].id) {
				this.extensionsColorThemes[0] = themeData;
			} else {
				this.extensionsColorThemes.push(themeData);
			}
		});
	}

	public findThemeData(themeId: string, defaultId?: string): Promise<ColorThemeData | undefined> {
		return this.getColorThemes().then(allThemes => {
			let defaultTheme: ColorThemeData | undefined = undefined;
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

	public findThemeDataBySettingsId(settingsId: string, defaultId: string | undefined): Promise<ColorThemeData | undefined> {
		return this.getColorThemes().then(allThemes => {
			let defaultTheme: ColorThemeData | undefined = undefined;
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

	public findThemeDataByParentLocation(parentLocation: URI | undefined): Promise<ColorThemeData[]> {
		if (parentLocation) {
			return this.getColorThemes().then(allThemes => {
				return allThemes.filter(t => t.location && resources.isEqualOrParent(t.location, parentLocation));
			});
		}
		return Promise.resolve([]);

	}

	public getColorThemes(): Promise<ColorThemeData[]> {
		return this.extensionService.whenInstalledExtensionsRegistered().then(_ => {
			return this.extensionsColorThemes;
		});
	}

}
