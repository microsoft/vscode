/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import * as Paths from 'vs/base/common/path';
import * as resources from 'vs/base/common/resources';
import * as Json from 'vs/base/common/json';
import { ExtensionData, IThemeExtensionPoint, IWorkbenchProductIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IFileService } from 'vs/platform/files/common/files';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';
import { asCSSUrl } from 'vs/base/browser/dom';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { DEFAULT_PRODUCT_ICON_THEME_SETTING_VALUE } from 'vs/workbench/services/themes/common/themeConfiguration';

const PERSISTED_PRODUCT_ICON_THEME_STORAGE_KEY = 'productIconThemeData';

export const DEFAULT_PRODUCT_ICON_THEME_ID = ''; // TODO

export class ProductIconThemeData implements IWorkbenchProductIconTheme {
	id: string;
	label: string;
	settingsId: string;
	description?: string;
	isLoaded: boolean;
	location?: URI;
	extensionData?: ExtensionData;
	watch?: boolean;

	styleSheetContent?: string;

	private constructor(id: string, label: string, settingsId: string) {
		this.id = id;
		this.label = label;
		this.settingsId = settingsId;
		this.isLoaded = false;
	}

	public ensureLoaded(fileService: IFileService): Promise<string | undefined> {
		return !this.isLoaded ? this.load(fileService) : Promise.resolve(this.styleSheetContent);
	}

	public reload(fileService: IFileService): Promise<string | undefined> {
		return this.load(fileService);
	}

	private load(fileService: IFileService): Promise<string | undefined> {
		if (!this.location) {
			return Promise.resolve(this.styleSheetContent);
		}
		return _loadProductIconThemeDocument(fileService, this.location).then(iconThemeDocument => {
			const result = _processIconThemeDocument(this.id, this.location!, iconThemeDocument);
			this.styleSheetContent = result.content;
			this.isLoaded = true;
			return this.styleSheetContent;
		});
	}

	static fromExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeLocation: URI, extensionData: ExtensionData): ProductIconThemeData {
		const id = extensionData.extensionId + '-' + iconTheme.id;
		const label = iconTheme.label || Paths.basename(iconTheme.path);
		const settingsId = iconTheme.id;

		const themeData = new ProductIconThemeData(id, label, settingsId);

		themeData.description = iconTheme.description;
		themeData.location = iconThemeLocation;
		themeData.extensionData = extensionData;
		themeData.watch = iconTheme._watch;
		themeData.isLoaded = false;
		return themeData;
	}

	static createUnloadedTheme(id: string): ProductIconThemeData {
		const themeData = new ProductIconThemeData(id, '', '__' + id);
		themeData.isLoaded = false;
		themeData.extensionData = undefined;
		themeData.watch = false;
		return themeData;
	}

	private static _defaultProductIconTheme: ProductIconThemeData | null = null;

	static get defaultTheme(): ProductIconThemeData {
		let themeData = ProductIconThemeData._defaultProductIconTheme;
		if (!themeData) {
			themeData = ProductIconThemeData._defaultProductIconTheme = new ProductIconThemeData(DEFAULT_PRODUCT_ICON_THEME_ID, nls.localize('defaultTheme', 'Default'), DEFAULT_PRODUCT_ICON_THEME_SETTING_VALUE);
			themeData.isLoaded = true;
			themeData.extensionData = undefined;
			themeData.watch = false;
		}
		return themeData;
	}

	static fromStorageData(storageService: IStorageService): ProductIconThemeData | undefined {
		const input = storageService.get(PERSISTED_PRODUCT_ICON_THEME_STORAGE_KEY, StorageScope.GLOBAL);
		if (!input) {
			return undefined;
		}
		try {
			let data = JSON.parse(input);
			const theme = new ProductIconThemeData('', '', '');
			for (let key in data) {
				switch (key) {
					case 'id':
					case 'label':
					case 'description':
					case 'settingsId':
					case 'styleSheetContent':
					case 'watch':
						(theme as any)[key] = data[key];
						break;
					case 'location':
						theme.location = URI.revive(data.location);
						break;
					case 'extensionData':
						theme.extensionData = ExtensionData.fromJSONObject(data.extensionData);
						break;
				}
			}
			return theme;
		} catch (e) {
			return undefined;
		}
	}

	toStorage(storageService: IStorageService) {
		const data = JSON.stringify({
			id: this.id,
			label: this.label,
			description: this.description,
			settingsId: this.settingsId,
			location: this.location?.toJSON(),
			styleSheetContent: this.styleSheetContent,
			watch: this.watch,
			extensionData: ExtensionData.toJSONObject(this.extensionData),
		});
		storageService.store(PERSISTED_PRODUCT_ICON_THEME_STORAGE_KEY, data, StorageScope.GLOBAL);
	}
}

interface IconDefinition {
	fontCharacter: string;
	fontId: string;
}

interface FontDefinition {
	id: string;
	weight: string;
	style: string;
	size: string;
	src: { path: string; format: string; }[];
}

interface ProductIconThemeDocument {
	iconDefinitions: { [key: string]: IconDefinition };
	fonts: FontDefinition[];
}

function _loadProductIconThemeDocument(fileService: IFileService, location: URI): Promise<ProductIconThemeDocument> {
	return fileService.readFile(location).then((content) => {
		let errors: Json.ParseError[] = [];
		let contentValue = Json.parse(content.value.toString(), errors);
		if (errors.length > 0) {
			return Promise.reject(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing product icons file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
		} else if (Json.getNodeType(contentValue) !== 'object') {
			return Promise.reject(new Error(nls.localize('error.invalidformat', "Invalid format for product icons theme file: Object expected.")));
		} else if (!contentValue.iconDefinitions || !Array.isArray(contentValue.fonts) || !contentValue.fonts.length) {
			return Promise.reject(new Error(nls.localize('error.missingProperties', "Invalid format for product icons theme file: Must contain iconDefinitions and fonts.")));
		}
		return Promise.resolve(contentValue);
	});
}

function _processIconThemeDocument(id: string, iconThemeDocumentLocation: URI, iconThemeDocument: ProductIconThemeDocument): { content: string; } {

	const result = { content: '' };

	if (!iconThemeDocument.iconDefinitions || !Array.isArray(iconThemeDocument.fonts) || !iconThemeDocument.fonts.length) {
		return result;
	}

	const iconThemeDocumentLocationDirname = resources.dirname(iconThemeDocumentLocation);
	function resolvePath(path: string) {
		return resources.joinPath(iconThemeDocumentLocationDirname, path);
	}

	let cssRules: string[] = [];

	let fonts = iconThemeDocument.fonts;
	for (const font of fonts) {
		const src = font.src.map(l => `${asCSSUrl(resolvePath(l.path))} format('${l.format}')`).join(', ');
		cssRules.push(`@font-face { src: ${src}; font-family: '${font.id}'; font-weight: ${font.weight}; font-style: ${font.style}; }`);
	}

	let primaryFontId = fonts[0].id;
	let iconDefinitions = iconThemeDocument.iconDefinitions;
	for (const iconId in iconThemeDocument.iconDefinitions) {
		const definition = iconDefinitions[iconId];
		if (definition && definition.fontCharacter) {
			cssRules.push(`.codicon-${iconId}:before { content: '${definition.fontCharacter}' !important; font-family: ${definition.fontId || primaryFontId} !important; }`);
		}
	}
	result.content = cssRules.join('\n');
	return result;
}
