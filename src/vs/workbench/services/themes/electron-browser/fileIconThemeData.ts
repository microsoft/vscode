/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import * as Paths from 'path';
import * as resources from 'vs/base/common/resources';
import * as Json from 'vs/base/common/json';
import { ExtensionData, IThemeExtensionPoint, IFileIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IFileService } from 'vs/platform/files/common/files';
import { getParseErrorMessage } from 'vs/base/common/jsonErrorMessages';

export class FileIconThemeData implements IFileIconTheme {
	id: string;
	label: string;
	settingsId?: string;
	description?: string;
	hasFileIcons: boolean;
	hasFolderIcons: boolean;
	hidesExplorerArrows: boolean;
	isLoaded: boolean;
	location?: URI;
	extensionData?: ExtensionData;

	styleSheetContent?: string;

	private constructor() { }

	public ensureLoaded(fileService: IFileService): Promise<string> {
		if (!this.isLoaded) {
			if (this.location) {
				return _loadIconThemeDocument(fileService, this.location).then(iconThemeDocument => {
					let result = _processIconThemeDocument(this.id, this.location!, iconThemeDocument);
					this.styleSheetContent = result.content;
					this.hasFileIcons = result.hasFileIcons;
					this.hasFolderIcons = result.hasFolderIcons;
					this.hidesExplorerArrows = result.hidesExplorerArrows;
					this.isLoaded = true;
					return this.styleSheetContent;
				});
			}
		}
		return Promise.resolve(this.styleSheetContent);
	}

	static fromExtensionTheme(iconTheme: IThemeExtensionPoint, iconThemeLocation: URI, extensionData: ExtensionData): FileIconThemeData {
		let themeData = new FileIconThemeData();
		themeData.id = extensionData.extensionId + '-' + iconTheme.id;
		themeData.label = iconTheme.label || Paths.basename(iconTheme.path);
		themeData.settingsId = iconTheme.id;
		themeData.description = iconTheme.description;
		themeData.location = iconThemeLocation;
		themeData.extensionData = extensionData;
		themeData.isLoaded = false;
		return themeData;
	}

	private static _noIconTheme: FileIconThemeData | null = null;

	static noIconTheme(): FileIconThemeData {
		let themeData = FileIconThemeData._noIconTheme;
		if (!themeData) {
			themeData = FileIconThemeData._noIconTheme = new FileIconThemeData();
			themeData.id = '';
			themeData.label = '';
			themeData.settingsId = undefined;
			themeData.hasFileIcons = false;
			themeData.hasFolderIcons = false;
			themeData.hidesExplorerArrows = false;
			themeData.isLoaded = true;
			themeData.extensionData = undefined;
		}
		return themeData;
	}

	static fromStorageData(input: string): FileIconThemeData | null {
		try {
			let data = JSON.parse(input);
			let theme = new FileIconThemeData();
			for (let key in data) {
				switch (key) {
					case 'id':
					case 'label':
					case 'description':
					case 'settingsId':
					case 'extensionData':
					case 'styleSheetContent':
					case 'hasFileIcons':
					case 'hidesExplorerArrows':
					case 'hasFolderIcons':
						theme[key] = data[key];
						break;
					case 'location':
						theme.location = URI.revive(data.location);
						break;
				}
			}
			return theme;
		} catch (e) {
			return null;
		}
	}

	toStorageData() {
		return JSON.stringify({
			id: this.id,
			label: this.label,
			description: this.description,
			settingsId: this.settingsId,
			location: this.location,
			styleSheetContent: this.styleSheetContent,
			hasFileIcons: this.hasFileIcons,
			hasFolderIcons: this.hasFolderIcons,
			hidesExplorerArrows: this.hidesExplorerArrows
		});
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
	hidesExplorerArrows?: boolean;
}

function _loadIconThemeDocument(fileService: IFileService, location: URI): Promise<IconThemeDocument> {
	return fileService.resolveContent(location, { encoding: 'utf8' }).then((content) => {
		let errors: Json.ParseError[] = [];
		let contentValue = Json.parse(content.value.toString(), errors);
		if (errors.length > 0 || !contentValue) {
			return Promise.reject(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing file icons file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
		}
		return Promise.resolve(contentValue);
	});
}

function _processIconThemeDocument(id: string, iconThemeDocumentLocation: URI, iconThemeDocument: IconThemeDocument): { content: string; hasFileIcons: boolean; hasFolderIcons: boolean; hidesExplorerArrows: boolean; } {

	const result = { content: '', hasFileIcons: false, hasFolderIcons: false, hidesExplorerArrows: !!iconThemeDocument.hidesExplorerArrows };

	if (!iconThemeDocument.iconDefinitions) {
		return result;
	}
	let selectorByDefinitionId: { [def: string]: string[] } = {};

	const iconThemeDocumentLocationDirname = resources.dirname(iconThemeDocumentLocation);
	function resolvePath(path: string) {
		return resources.joinPath(iconThemeDocumentLocationDirname!, path);
	}

	function collectSelectors(associations: IconsAssociation | undefined, baseThemeClassName?: string) {
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
				if (!languageIds.jsonc && languageIds.json) {
					languageIds.jsonc = languageIds.json;
				}
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
					if (segments.length) {
						for (let i = 0; i < segments.length; i++) {
							selectors.push(`.${escapeCSS(segments.slice(i).join('.'))}-ext-file-icon`);
						}
						selectors.push('.ext-file-icon'); // extra segment to increase file-ext score
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
					if (segments.length) {
						for (let i = 1; i < segments.length; i++) {
							selectors.push(`.${escapeCSS(segments.slice(i).join('.'))}-ext-file-icon`);
						}
						selectors.push('.ext-file-icon'); // extra segment to increase file-ext score
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
			cssRules.push(`@font-face { src: ${src}; font-family: '${font.id}'; font-weight: ${font.weight}; font-style: ${font.style}; }`);
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
