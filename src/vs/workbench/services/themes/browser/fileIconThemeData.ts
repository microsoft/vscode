/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import * as paths from '../../../../base/common/path.js';
import * as resources from '../../../../base/common/resources.js';
import * as Json from '../../../../base/common/json.js';
import { ExtensionData, IThemeExtensionPoint, IWorkbenchFileIconTheme } from '../common/workbenchThemeService.js';
import { getParseErrorMessage } from '../../../../base/common/jsonErrorMessages.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { fontCharacterRegex, fontColorRegex, fontSizeRegex } from '../common/productIconThemeSchema.js';
import * as css from '../../../../base/browser/cssValue.js';
import { fileIconSelectorEscape } from '../../../../editor/common/services/getIconClasses.js';

export class FileIconThemeData implements IWorkbenchFileIconTheme {

	static readonly STORAGE_KEY = 'iconThemeData';

	id: string;
	label: string;
	settingsId: string | null;
	description?: string;
	hasFileIcons: boolean;
	hasFolderIcons: boolean;
	hidesExplorerArrows: boolean;
	isLoaded: boolean;
	location?: URI;
	extensionData?: ExtensionData;
	watch?: boolean;

	styleSheetContent?: string;

	private constructor(id: string, label: string, settingsId: string | null) {
		this.id = id;
		this.label = label;
		this.settingsId = settingsId;
		this.isLoaded = false;
		this.hasFileIcons = false;
		this.hasFolderIcons = false;
		this.hidesExplorerArrows = false;
	}

	public ensureLoaded(themeLoader: FileIconThemeLoader): Promise<string | undefined> {
		return !this.isLoaded ? this.load(themeLoader) : Promise.resolve(this.styleSheetContent);
	}

	public reload(themeLoader: FileIconThemeLoader): Promise<string | undefined> {
		return this.load(themeLoader);
	}

	private load(themeLoader: FileIconThemeLoader): Promise<string | undefined> {
		return themeLoader.load(this);
	}

	static fromExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeLocation: URI, extensionData: ExtensionData): FileIconThemeData {
		const id = extensionData.extensionId + '-' + iconTheme.id;
		const label = iconTheme.label || paths.basename(iconTheme.path);
		const settingsId = iconTheme.id;

		const themeData = new FileIconThemeData(id, label, settingsId);

		themeData.description = iconTheme.description;
		themeData.location = iconThemeLocation;
		themeData.extensionData = extensionData;
		themeData.watch = iconTheme._watch;
		themeData.isLoaded = false;
		return themeData;
	}

	private static _noIconTheme: FileIconThemeData | null = null;

	static get noIconTheme(): FileIconThemeData {
		let themeData = FileIconThemeData._noIconTheme;
		if (!themeData) {
			themeData = FileIconThemeData._noIconTheme = new FileIconThemeData('', '', null);
			themeData.hasFileIcons = false;
			themeData.hasFolderIcons = false;
			themeData.hidesExplorerArrows = false;
			themeData.isLoaded = true;
			themeData.extensionData = undefined;
			themeData.watch = false;
		}
		return themeData;
	}

	static createUnloadedTheme(id: string): FileIconThemeData {
		const themeData = new FileIconThemeData(id, '', '__' + id);
		themeData.isLoaded = false;
		themeData.hasFileIcons = false;
		themeData.hasFolderIcons = false;
		themeData.hidesExplorerArrows = false;
		themeData.extensionData = undefined;
		themeData.watch = false;
		return themeData;
	}


	static fromStorageData(storageService: IStorageService): FileIconThemeData | undefined {
		const input = storageService.get(FileIconThemeData.STORAGE_KEY, StorageScope.PROFILE);
		if (!input) {
			return undefined;
		}
		try {
			const data = JSON.parse(input);
			const theme = new FileIconThemeData('', '', null);
			for (const key in data) {
				switch (key) {
					case 'id':
					case 'label':
					case 'description':
					case 'settingsId':
					case 'styleSheetContent':
					case 'hasFileIcons':
					case 'hidesExplorerArrows':
					case 'hasFolderIcons':
					case 'watch':
						(theme as any)[key] = data[key];
						break;
					case 'location':
						// ignore, no longer restore
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
			styleSheetContent: this.styleSheetContent,
			hasFileIcons: this.hasFileIcons,
			hasFolderIcons: this.hasFolderIcons,
			hidesExplorerArrows: this.hidesExplorerArrows,
			extensionData: ExtensionData.toJSONObject(this.extensionData),
			watch: this.watch
		});
		storageService.store(FileIconThemeData.STORAGE_KEY, data, StorageScope.PROFILE, StorageTarget.MACHINE);
	}
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
	src: { path: string; format: string }[];
}

interface IconsAssociation {
	folder?: string;
	file?: string;
	folderExpanded?: string;
	rootFolder?: string;
	rootFolderExpanded?: string;
	rootFolderNames?: { [folderName: string]: string };
	rootFolderNamesExpanded?: { [folderName: string]: string };
	folderNames?: { [folderName: string]: string };
	folderNamesExpanded?: { [folderName: string]: string };
	fileExtensions?: { [extension: string]: string };
	fileNames?: { [fileName: string]: string };
	languageIds?: { [languageId: string]: string };
}

interface IconThemeDocument extends IconsAssociation {
	iconDefinitions: { [key: string]: IconDefinition };
	fonts: FontDefinition[];
	light?: IconsAssociation;
	highContrast?: IconsAssociation;
	hidesExplorerArrows?: boolean;
	showLanguageModeIcons?: boolean;
}

export class FileIconThemeLoader {

	constructor(
		private readonly fileService: IExtensionResourceLoaderService,
		private readonly languageService: ILanguageService
	) {
	}

	public load(data: FileIconThemeData): Promise<string | undefined> {
		if (!data.location) {
			return Promise.resolve(data.styleSheetContent);
		}
		return this.loadIconThemeDocument(data.location).then(iconThemeDocument => {
			const result = this.processIconThemeDocument(data.id, data.location!, iconThemeDocument);
			data.styleSheetContent = result.content;
			data.hasFileIcons = result.hasFileIcons;
			data.hasFolderIcons = result.hasFolderIcons;
			data.hidesExplorerArrows = result.hidesExplorerArrows;
			data.isLoaded = true;
			return data.styleSheetContent;
		});
	}

	private loadIconThemeDocument(location: URI): Promise<IconThemeDocument> {
		return this.fileService.readExtensionResource(location).then((content) => {
			const errors: Json.ParseError[] = [];
			const contentValue = Json.parse(content, errors);
			if (errors.length > 0) {
				return Promise.reject(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing file icons file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
			} else if (Json.getNodeType(contentValue) !== 'object') {
				return Promise.reject(new Error(nls.localize('error.invalidformat', "Invalid format for file icons theme file: Object expected.")));
			}
			return Promise.resolve(contentValue);
		});
	}

	private processIconThemeDocument(id: string, iconThemeDocumentLocation: URI, iconThemeDocument: IconThemeDocument): { content: string; hasFileIcons: boolean; hasFolderIcons: boolean; hidesExplorerArrows: boolean } {

		const result = { content: '', hasFileIcons: false, hasFolderIcons: false, hidesExplorerArrows: !!iconThemeDocument.hidesExplorerArrows };

		let hasSpecificFileIcons = false;

		if (!iconThemeDocument.iconDefinitions) {
			return result;
		}
		const selectorByDefinitionId: { [def: string]: css.Builder } = {};
		const coveredLanguages: { [languageId: string]: boolean } = {};

		const iconThemeDocumentLocationDirname = resources.dirname(iconThemeDocumentLocation);
		function resolvePath(path: string) {
			return resources.joinPath(iconThemeDocumentLocationDirname, path);
		}

		function collectSelectors(associations: IconsAssociation | undefined, baseThemeClassName?: css.CssFragment) {
			function addSelector(selector: css.CssFragment, defId: string) {
				if (defId) {
					let list = selectorByDefinitionId[defId];
					if (!list) {
						list = selectorByDefinitionId[defId] = new css.Builder();
					}
					list.push(selector);
				}
			}

			if (associations) {
				let qualifier = css.inline`.show-file-icons`;
				if (baseThemeClassName) {
					qualifier = css.inline`${baseThemeClassName} ${qualifier}`;
				}

				const expanded = css.inline`.monaco-tl-twistie.collapsible:not(.collapsed) + .monaco-tl-contents`;

				if (associations.folder) {
					addSelector(css.inline`${qualifier} .folder-icon::before`, associations.folder);
					result.hasFolderIcons = true;
				}

				if (associations.folderExpanded) {
					addSelector(css.inline`${qualifier} ${expanded} .folder-icon::before`, associations.folderExpanded);
					result.hasFolderIcons = true;
				}

				const rootFolder = associations.rootFolder || associations.folder;
				const rootFolderExpanded = associations.rootFolderExpanded || associations.folderExpanded;

				if (rootFolder) {
					addSelector(css.inline`${qualifier} .rootfolder-icon::before`, rootFolder);
					result.hasFolderIcons = true;
				}

				if (rootFolderExpanded) {
					addSelector(css.inline`${qualifier} ${expanded} .rootfolder-icon::before`, rootFolderExpanded);
					result.hasFolderIcons = true;
				}

				if (associations.file) {
					addSelector(css.inline`${qualifier} .file-icon::before`, associations.file);
					result.hasFileIcons = true;
				}

				const folderNames = associations.folderNames;
				if (folderNames) {
					for (const key in folderNames) {
						const selectors = new css.Builder();
						const name = handleParentFolder(key.toLowerCase(), selectors);
						selectors.push(css.inline`.${classSelectorPart(name)}-name-folder-icon`);
						addSelector(css.inline`${qualifier} ${selectors.join('')}.folder-icon::before`, folderNames[key]);
						result.hasFolderIcons = true;
					}
				}
				const folderNamesExpanded = associations.folderNamesExpanded;
				if (folderNamesExpanded) {
					for (const key in folderNamesExpanded) {
						const selectors = new css.Builder();
						const name = handleParentFolder(key.toLowerCase(), selectors);
						selectors.push(css.inline`.${classSelectorPart(name)}-name-folder-icon`);
						addSelector(css.inline`${qualifier} ${expanded} ${selectors.join('')}.folder-icon::before`, folderNamesExpanded[key]);
						result.hasFolderIcons = true;
					}
				}

				const rootFolderNames = associations.rootFolderNames;
				if (rootFolderNames) {
					for (const key in rootFolderNames) {
						const name = key.toLowerCase();
						addSelector(css.inline`${qualifier} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNames[key]);
						result.hasFolderIcons = true;
					}
				}
				const rootFolderNamesExpanded = associations.rootFolderNamesExpanded;
				if (rootFolderNamesExpanded) {
					for (const key in rootFolderNamesExpanded) {
						const name = key.toLowerCase();
						addSelector(css.inline`${qualifier} ${expanded} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNamesExpanded[key]);
						result.hasFolderIcons = true;
					}
				}

				const languageIds = associations.languageIds;
				if (languageIds) {
					if (!languageIds.jsonc && languageIds.json) {
						languageIds.jsonc = languageIds.json;
					}
					for (const languageId in languageIds) {
						addSelector(css.inline`${qualifier} .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`, languageIds[languageId]);
						result.hasFileIcons = true;
						hasSpecificFileIcons = true;
						coveredLanguages[languageId] = true;
					}
				}
				const fileExtensions = associations.fileExtensions;
				if (fileExtensions) {
					for (const key in fileExtensions) {
						const selectors = new css.Builder();
						const name = handleParentFolder(key.toLowerCase(), selectors);
						const segments = name.split('.');
						if (segments.length) {
							for (let i = 0; i < segments.length; i++) {
								selectors.push(css.inline`.${classSelectorPart(segments.slice(i).join('.'))}-ext-file-icon`);
							}
							selectors.push(css.inline`.ext-file-icon`); // extra segment to increase file-ext score
						}
						addSelector(css.inline`${qualifier} ${selectors.join('')}.file-icon::before`, fileExtensions[key]);
						result.hasFileIcons = true;
						hasSpecificFileIcons = true;
					}
				}
				const fileNames = associations.fileNames;
				if (fileNames) {
					for (const key in fileNames) {
						const selectors = new css.Builder();
						const fileName = handleParentFolder(key.toLowerCase(), selectors);
						selectors.push(css.inline`.${classSelectorPart(fileName)}-name-file-icon`);
						selectors.push(css.inline`.name-file-icon`); // extra segment to increase file-name score
						const segments = fileName.split('.');
						if (segments.length) {
							for (let i = 1; i < segments.length; i++) {
								selectors.push(css.inline`.${classSelectorPart(segments.slice(i).join('.'))}-ext-file-icon`);
							}
							selectors.push(css.inline`.ext-file-icon`); // extra segment to increase file-ext score
						}
						addSelector(css.inline`${qualifier} ${selectors.join('')}.file-icon::before`, fileNames[key]);
						result.hasFileIcons = true;
						hasSpecificFileIcons = true;
					}
				}
			}
		}
		collectSelectors(iconThemeDocument);
		collectSelectors(iconThemeDocument.light, css.inline`.vs`);
		collectSelectors(iconThemeDocument.highContrast, css.inline`.hc-black`);
		collectSelectors(iconThemeDocument.highContrast, css.inline`.hc-light`);

		if (!result.hasFileIcons && !result.hasFolderIcons) {
			return result;
		}

		const showLanguageModeIcons = iconThemeDocument.showLanguageModeIcons === true || (hasSpecificFileIcons && iconThemeDocument.showLanguageModeIcons !== false);

		const cssRules = new css.Builder();

		const fonts = iconThemeDocument.fonts;
		const fontSizes = new Map<string, string>();
		if (Array.isArray(fonts)) {
			const defaultFontSize = this.tryNormalizeFontSize(fonts[0].size) || '150%';
			fonts.forEach(font => {
				const fontSrcs = new css.Builder();
				fontSrcs.push(...font.src.map(l => css.inline`${css.asCSSUrl(resolvePath(l.path))} format(${css.stringValue(l.format)})`));
				cssRules.push(css.inline`@font-face { src: ${fontSrcs.join(', ')}; font-family: ${css.stringValue(font.id)}; font-weight: ${css.identValue(font.weight)}; font-style: ${css.identValue(font.style)}; font-display: block; }`);

				const fontSize = this.tryNormalizeFontSize(font.size);
				if (fontSize !== undefined && fontSize !== defaultFontSize) {
					fontSizes.set(font.id, fontSize);
				}
			});
			cssRules.push(css.inline`.show-file-icons .file-icon::before, .show-file-icons .folder-icon::before, .show-file-icons .rootfolder-icon::before { font-family: ${css.stringValue(fonts[0].id)}; font-size: ${css.sizeValue(defaultFontSize)}; }`);
		}

		// Use emQuads to prevent the icon from collapsing to zero height for image icons
		const emQuad = css.stringValue('\\2001');

		for (const defId in selectorByDefinitionId) {
			const selectors = selectorByDefinitionId[defId];
			const definition = iconThemeDocument.iconDefinitions[defId];
			if (definition) {
				if (definition.iconPath) {
					cssRules.push(css.inline`${selectors.join(', ')} { content: ${emQuad}; background-image: ${css.asCSSUrl(resolvePath(definition.iconPath))}; }`);
				} else if (definition.fontCharacter || definition.fontColor) {
					const body = new css.Builder();
					if (definition.fontColor && definition.fontColor.match(fontColorRegex)) {
						body.push(css.inline`color: ${css.hexColorValue(definition.fontColor)};`);
					}
					if (definition.fontCharacter && definition.fontCharacter.match(fontCharacterRegex)) {
						body.push(css.inline`content: ${css.stringValue(definition.fontCharacter)};`);
					}
					const fontSize = definition.fontSize ?? (definition.fontId ? fontSizes.get(definition.fontId) : undefined);
					if (fontSize && fontSize.match(fontSizeRegex)) {
						body.push(css.inline`font-size: ${css.sizeValue(fontSize)};`);
					}
					if (definition.fontId) {
						body.push(css.inline`font-family: ${css.stringValue(definition.fontId)};`);
					}
					if (showLanguageModeIcons) {
						body.push(css.inline`background-image: unset;`); // potentially set by the language default
					}
					cssRules.push(css.inline`${selectors.join(', ')} { ${body.join(' ')} }`);
				}
			}
		}

		if (showLanguageModeIcons) {
			for (const languageId of this.languageService.getRegisteredLanguageIds()) {
				if (!coveredLanguages[languageId]) {
					const icon = this.languageService.getIcon(languageId);
					if (icon) {
						const selector = css.inline`.show-file-icons .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`;
						cssRules.push(css.inline`${selector} { content: ${emQuad}; background-image: ${css.asCSSUrl(icon.dark)}; }`);
						cssRules.push(css.inline`.vs ${selector} { content: ${emQuad}; background-image: ${css.asCSSUrl(icon.light)}; }`);
					}
				}
			}
		}

		result.content = cssRules.join('\n');
		return result;
	}

	/**
	 * Try converting absolute font sizes to relative values.
	 *
	 * This allows them to be scaled nicely depending on where they are used.
	 */
	private tryNormalizeFontSize(size: string | undefined): string | undefined {
		if (!size) {
			return undefined;
		}

		const defaultFontSizeInPx = 13;

		if (size.endsWith('px')) {
			const value = parseInt(size, 10);
			if (!isNaN(value)) {
				return Math.round((value / defaultFontSizeInPx) * 100) + '%';
			}
		}

		return size;
	}
}

function handleParentFolder(key: string, selectors: css.Builder): string {
	const lastIndexOfSlash = key.lastIndexOf('/');
	if (lastIndexOfSlash >= 0) {
		const parentFolder = key.substring(0, lastIndexOfSlash);
		selectors.push(css.inline`.${classSelectorPart(parentFolder)}-name-dir-icon`);
		return key.substring(lastIndexOfSlash + 1);
	}
	return key;
}

function classSelectorPart(str: string): css.CssFragment {
	str = fileIconSelectorEscape(str);
	return css.className(str, true);
}
