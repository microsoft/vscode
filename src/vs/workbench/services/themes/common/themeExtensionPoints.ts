/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import * as types from 'vs/base/common/types';
import * as resources from 'vs/base/common/resources';
import { ExtensionMessageCollector, IExtensionPoint, ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ExtensionData, IThemeExtensionPoint, VS_LIGHT_THEME, VS_DARK_THEME, VS_HC_THEME } from 'vs/workbench/services/themes/common/workbenchThemeService';

import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export function registerColorThemeExtensionPoint() {
	return ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>({
		extensionPoint: 'themes',
		jsonSchema: {
			description: nls.localize('vscode.extension.contributes.themes', 'Contributes textmate color themes.'),
			type: 'array',
			items: {
				type: 'object',
				defaultSnippets: [{ body: { label: '${1:label}', id: '${2:id}', uiTheme: VS_DARK_THEME, path: './themes/${3:id}.tmTheme.' } }],
				properties: {
					id: {
						description: nls.localize('vscode.extension.contributes.themes.id', 'Id of the color theme as used in the user settings.'),
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
						description: nls.localize('vscode.extension.contributes.themes.path', 'Path of the tmTheme file. The path is relative to the extension folder and is typically \'./colorthemes/awesome-color-theme.json\'.'),
						type: 'string'
					}
				},
				required: ['path', 'uiTheme']
			}
		}
	});
}
export function registerFileIconThemeExtensionPoint() {
	return ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>({
		extensionPoint: 'iconThemes',
		jsonSchema: {
			description: nls.localize('vscode.extension.contributes.iconThemes', 'Contributes file icon themes.'),
			type: 'array',
			items: {
				type: 'object',
				defaultSnippets: [{ body: { id: '${1:id}', label: '${2:label}', path: './fileicons/${3:id}-icon-theme.json' } }],
				properties: {
					id: {
						description: nls.localize('vscode.extension.contributes.iconThemes.id', 'Id of the file icon theme as used in the user settings.'),
						type: 'string'
					},
					label: {
						description: nls.localize('vscode.extension.contributes.iconThemes.label', 'Label of the file icon theme as shown in the UI.'),
						type: 'string'
					},
					path: {
						description: nls.localize('vscode.extension.contributes.iconThemes.path', 'Path of the file icon theme definition file. The path is relative to the extension folder and is typically \'./fileicons/awesome-icon-theme.json\'.'),
						type: 'string'
					}
				},
				required: ['path', 'id']
			}
		}
	});
}

export function registerProductIconThemeExtensionPoint() {
	return ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>({
		extensionPoint: 'productIconThemes',
		jsonSchema: {
			description: nls.localize('vscode.extension.contributes.productIconThemes', 'Contributes product icon themes.'),
			type: 'array',
			items: {
				type: 'object',
				defaultSnippets: [{ body: { id: '${1:id}', label: '${2:label}', path: './producticons/${3:id}-product-icon-theme.json' } }],
				properties: {
					id: {
						description: nls.localize('vscode.extension.contributes.productIconThemes.id', 'Id of the product icon theme as used in the user settings.'),
						type: 'string'
					},
					label: {
						description: nls.localize('vscode.extension.contributes.productIconThemes.label', 'Label of the product icon theme as shown in the UI.'),
						type: 'string'
					},
					path: {
						description: nls.localize('vscode.extension.contributes.productIconThemes.path', 'Path of the product icon theme definition file. The path is relative to the extension folder and is typically \'./producticons/awesome-product-icon-theme.json\'.'),
						type: 'string'
					}
				},
				required: ['path', 'id']
			}
		}
	});
}

export interface ThemeChangeEvent<T> {
	themes: T[];
	added: T[];
	removed: T[];
}

export interface IThemeData {
	id: string;
	settingsId: string | null;
	location?: URI;
}

export class ThemeRegistry<T extends IThemeData> {

	private extensionThemes: T[];

	private readonly onDidChangeEmitter = new Emitter<ThemeChangeEvent<T>>();
	public readonly onDidChange: Event<ThemeChangeEvent<T>> = this.onDidChangeEmitter.event;

	constructor(
		private readonly themesExtPoint: IExtensionPoint<IThemeExtensionPoint[]>,
		private create: (theme: IThemeExtensionPoint, themeLocation: URI, extensionData: ExtensionData) => T,
		private idRequired = false,
		private builtInTheme: T | undefined = undefined
	) {
		this.extensionThemes = [];
		this.initialize();
	}

	private initialize() {
		this.themesExtPoint.setHandler((extensions, delta) => {
			const previousIds: { [key: string]: T } = {};

			const added: T[] = [];
			for (const theme of this.extensionThemes) {
				previousIds[theme.id] = theme;
			}
			this.extensionThemes.length = 0;
			for (let ext of extensions) {
				let extensionData: ExtensionData = {
					extensionId: ext.description.identifier.value,
					extensionPublisher: ext.description.publisher,
					extensionName: ext.description.name,
					extensionIsBuiltin: ext.description.isBuiltin
				};
				this.onThemes(extensionData, ext.description.extensionLocation, ext.value, ext.collector);
			}
			for (const theme of this.extensionThemes) {
				if (!previousIds[theme.id]) {
					added.push(theme);
				} else {
					delete previousIds[theme.id];
				}
			}
			const removed = Object.values(previousIds);
			this.onDidChangeEmitter.fire({ themes: this.extensionThemes, added, removed });
		});
	}

	private onThemes(extensionData: ExtensionData, extensionLocation: URI, themes: IThemeExtensionPoint[], collector: ExtensionMessageCollector): void {
		if (!Array.isArray(themes)) {
			collector.error(nls.localize(
				'reqarray',
				"Extension point `{0}` must be an array.",
				this.themesExtPoint.name
			));
			return;
		}
		themes.forEach(theme => {
			if (!theme.path || !types.isString(theme.path)) {
				collector.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					this.themesExtPoint.name,
					String(theme.path)
				));
				return;
			}
			if (this.idRequired && (!theme.id || !types.isString(theme.id))) {
				collector.error(nls.localize(
					'reqid',
					"Expected string in `contributes.{0}.id`. Provided value: {1}",
					this.themesExtPoint.name,
					String(theme.id)
				));
				return;
			}

			const themeLocation = resources.joinPath(extensionLocation, theme.path);
			if (!resources.isEqualOrParent(themeLocation, extensionLocation)) {
				collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", this.themesExtPoint.name, themeLocation.path, extensionLocation.path));
			}

			let themeData = this.create(theme, themeLocation, extensionData);
			this.extensionThemes.push(themeData);
		});
	}

	public findThemeById(themeId: string, defaultId?: string): T | undefined {
		if (this.builtInTheme && this.builtInTheme.id === themeId) {
			return this.builtInTheme;
		}
		const allThemes = this.getThemes();
		let defaultTheme: T | undefined = undefined;
		for (let t of allThemes) {
			if (t.id === themeId) {
				return t;
			}
			if (t.id === defaultId) {
				defaultTheme = t;
			}
		}
		return defaultTheme;
	}

	public findThemeBySettingsId(settingsId: string | null, defaultId?: string): T | undefined {
		if (this.builtInTheme && this.builtInTheme.settingsId === settingsId) {
			return this.builtInTheme;
		}
		const allThemes = this.getThemes();
		let defaultTheme: T | undefined = undefined;
		for (let t of allThemes) {
			if (t.settingsId === settingsId) {
				return t;
			}
			if (t.id === defaultId) {
				defaultTheme = t;
			}
		}
		return defaultTheme;
	}

	public findThemeByExtensionLocation(extLocation: URI | undefined): T[] {
		if (extLocation) {
			return this.getThemes().filter(t => t.location && resources.isEqualOrParent(t.location, extLocation));
		}
		return [];
	}

	public getThemes(): T[] {
		return this.extensionThemes;
	}

}
