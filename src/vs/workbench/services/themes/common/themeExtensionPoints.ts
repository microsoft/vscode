/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';

import * as types from '../../../../base/common/types.js';
import * as resources from '../../../../base/common/resources.js';
import { ExtensionMessageCollector, IExtensionPoint, ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { ExtensionData, IThemeExtensionPoint } from './workbenchThemeService.js';

import { Event, Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { Extensions, IExtensionFeatureMarkdownRenderer, IExtensionFeaturesRegistry, IRenderedData } from '../../extensionManagement/common/extensionFeatures.js';
import { IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';

export function registerColorThemeExtensionPoint() {
	return ExtensionsRegistry.registerExtensionPoint<IThemeExtensionPoint[]>({
		extensionPoint: 'themes',
		jsonSchema: {
			description: nls.localize('vscode.extension.contributes.themes', 'Contributes textmate color themes.'),
			type: 'array',
			items: {
				type: 'object',
				defaultSnippets: [{ body: { label: '${1:label}', id: '${2:id}', uiTheme: ThemeTypeSelector.VS_DARK, path: './themes/${3:id}.tmTheme.' } }],
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
						description: nls.localize('vscode.extension.contributes.themes.uiTheme', 'Base theme defining the colors around the editor: \'vs\' is the light color theme, \'vs-dark\' is the dark color theme. \'hc-black\' is the dark high contrast theme, \'hc-light\' is the light high contrast theme.'),
						enum: [ThemeTypeSelector.VS, ThemeTypeSelector.VS_DARK, ThemeTypeSelector.HC_BLACK, ThemeTypeSelector.HC_LIGHT]
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

class ThemeDataRenderer extends Disposable implements IExtensionFeatureMarkdownRenderer {

	readonly type = 'markdown';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.themes || !!manifest.contributes?.iconThemes || !!manifest.contributes?.productIconThemes;
	}

	render(manifest: IExtensionManifest): IRenderedData<IMarkdownString> {
		const markdown = new MarkdownString();
		if (manifest.contributes?.themes) {
			markdown.appendMarkdown(`### ${nls.localize('color themes', "Color Themes")}\n\n`);
			for (const theme of manifest.contributes.themes) {
				markdown.appendMarkdown(`- ${theme.label}\n`);
			}
		}
		if (manifest.contributes?.iconThemes) {
			markdown.appendMarkdown(`### ${nls.localize('file icon themes', "File Icon Themes")}\n\n`);
			for (const theme of manifest.contributes.iconThemes) {
				markdown.appendMarkdown(`- ${theme.label}\n`);
			}
		}
		if (manifest.contributes?.productIconThemes) {
			markdown.appendMarkdown(`### ${nls.localize('product icon themes', "Product Icon Themes")}\n\n`);
			for (const theme of manifest.contributes.productIconThemes) {
				markdown.appendMarkdown(`- ${theme.label}\n`);
			}
		}
		return {
			data: markdown,
			dispose: () => { /* noop */ }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'themes',
	label: nls.localize('themes', "Themes"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ThemeDataRenderer),
});

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

export class ThemeRegistry<T extends IThemeData> implements IDisposable {

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

	dispose() {
		this.themesExtPoint.setHandler(() => { });
	}

	private initialize() {
		this.themesExtPoint.setHandler((extensions, delta) => {
			const previousIds: { [key: string]: T } = {};

			const added: T[] = [];
			for (const theme of this.extensionThemes) {
				previousIds[theme.id] = theme;
			}
			this.extensionThemes.length = 0;
			for (const ext of extensions) {
				const extensionData = ExtensionData.fromName(ext.description.publisher, ext.description.name, ext.description.isBuiltin);
				this.onThemes(extensionData, ext.description.extensionLocation, ext.value, this.extensionThemes, ext.collector);
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

	private onThemes(extensionData: ExtensionData, extensionLocation: URI, themeContributions: IThemeExtensionPoint[], resultingThemes: T[] = [], log?: ExtensionMessageCollector): T[] {
		if (!Array.isArray(themeContributions)) {
			log?.error(nls.localize(
				'reqarray',
				"Extension point `{0}` must be an array.",
				this.themesExtPoint.name
			));
			return resultingThemes;
		}
		themeContributions.forEach(theme => {
			if (!theme.path || !types.isString(theme.path)) {
				log?.error(nls.localize(
					'reqpath',
					"Expected string in `contributes.{0}.path`. Provided value: {1}",
					this.themesExtPoint.name,
					String(theme.path)
				));
				return;
			}
			if (this.idRequired && (!theme.id || !types.isString(theme.id))) {
				log?.error(nls.localize(
					'reqid',
					"Expected string in `contributes.{0}.id`. Provided value: {1}",
					this.themesExtPoint.name,
					String(theme.id)
				));
				return;
			}

			const themeLocation = resources.joinPath(extensionLocation, theme.path);
			if (!resources.isEqualOrParent(themeLocation, extensionLocation)) {
				log?.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", this.themesExtPoint.name, themeLocation.path, extensionLocation.path));
			}

			const themeData = this.create(theme, themeLocation, extensionData);
			resultingThemes.push(themeData);
		});
		return resultingThemes;
	}

	public findThemeById(themeId: string): T | undefined {
		if (this.builtInTheme && this.builtInTheme.id === themeId) {
			return this.builtInTheme;
		}
		const allThemes = this.getThemes();
		for (const t of allThemes) {
			if (t.id === themeId) {
				return t;
			}
		}
		return undefined;
	}

	public findThemeBySettingsId(settingsId: string | null, defaultSettingsId?: string): T | undefined {
		if (this.builtInTheme && this.builtInTheme.settingsId === settingsId) {
			return this.builtInTheme;
		}
		const allThemes = this.getThemes();
		let defaultTheme: T | undefined = undefined;
		for (const t of allThemes) {
			if (t.settingsId === settingsId) {
				return t;
			}
			if (t.settingsId === defaultSettingsId) {
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

	public getMarketplaceThemes(manifest: any, extensionLocation: URI, extensionData: ExtensionData): T[] {
		const themes = manifest?.contributes?.[this.themesExtPoint.name];
		if (Array.isArray(themes)) {
			return this.onThemes(extensionData, extensionLocation, themes);
		}
		return [];
	}

}
