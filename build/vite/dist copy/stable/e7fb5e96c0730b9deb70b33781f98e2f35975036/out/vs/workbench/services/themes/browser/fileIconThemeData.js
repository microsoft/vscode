/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as paths from '../../../../base/common/path.js';
import * as resources from '../../../../base/common/resources.js';
import * as Json from '../../../../base/common/json.js';
import { ExtensionData } from '../common/workbenchThemeService.js';
import { getParseErrorMessage } from '../../../../base/common/jsonErrorMessages.js';
import { fontColorRegex, fontSizeRegex } from '../../../../platform/theme/common/iconRegistry.js';
import * as css from '../../../../base/browser/cssValue.js';
import { fileIconSelectorEscape } from '../../../../editor/common/services/getIconClasses.js';
export class FileIconThemeData {
    static { this.STORAGE_KEY = 'iconThemeData'; }
    constructor(id, label, settingsId) {
        this.id = id;
        this.label = label;
        this.settingsId = settingsId;
        this.isLoaded = false;
        this.hasFileIcons = false;
        this.hasFolderIcons = false;
        this.hidesExplorerArrows = false;
    }
    ensureLoaded(themeLoader) {
        return !this.isLoaded ? this.load(themeLoader) : Promise.resolve(this.styleSheetContent);
    }
    reload(themeLoader) {
        return this.load(themeLoader);
    }
    load(themeLoader) {
        return themeLoader.load(this);
    }
    static fromExtensionTheme(iconTheme, iconThemeLocation, extensionData) {
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
    static { this._noIconTheme = null; }
    static get noIconTheme() {
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
    static createUnloadedTheme(id) {
        const themeData = new FileIconThemeData(id, '', '__' + id);
        themeData.isLoaded = false;
        themeData.hasFileIcons = false;
        themeData.hasFolderIcons = false;
        themeData.hidesExplorerArrows = false;
        themeData.extensionData = undefined;
        themeData.watch = false;
        return themeData;
    }
    static fromStorageData(storageService) {
        const input = storageService.get(FileIconThemeData.STORAGE_KEY, 0 /* StorageScope.PROFILE */);
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
                        // eslint-disable-next-line local/code-no-any-casts
                        theme[key] = data[key];
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
        }
        catch (e) {
            return undefined;
        }
    }
    toStorage(storageService) {
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
        storageService.store(FileIconThemeData.STORAGE_KEY, data, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
}
export class FileIconThemeLoader {
    constructor(fileService, languageService) {
        this.fileService = fileService;
        this.languageService = languageService;
    }
    load(data) {
        if (!data.location) {
            return Promise.resolve(data.styleSheetContent);
        }
        return this.loadIconThemeDocument(data.location).then(iconThemeDocument => {
            const result = this.processIconThemeDocument(data.id, data.location, iconThemeDocument);
            data.styleSheetContent = result.content;
            data.hasFileIcons = result.hasFileIcons;
            data.hasFolderIcons = result.hasFolderIcons;
            data.hidesExplorerArrows = result.hidesExplorerArrows;
            data.isLoaded = true;
            return data.styleSheetContent;
        });
    }
    loadIconThemeDocument(location) {
        return this.fileService.readExtensionResource(location).then((content) => {
            const errors = [];
            const contentValue = Json.parse(content, errors);
            if (errors.length > 0) {
                return Promise.reject(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing file icons file: {0}", errors.map(e => getParseErrorMessage(e.error)).join(', '))));
            }
            else if (Json.getNodeType(contentValue) !== 'object') {
                return Promise.reject(new Error(nls.localize('error.invalidformat', "Invalid format for file icons theme file: Object expected.")));
            }
            return Promise.resolve(contentValue);
        });
    }
    processIconThemeDocument(id, iconThemeDocumentLocation, iconThemeDocument) {
        const result = { content: '', hasFileIcons: false, hasFolderIcons: false, hidesExplorerArrows: !!iconThemeDocument.hidesExplorerArrows };
        let hasSpecificFileIcons = false;
        if (!iconThemeDocument.iconDefinitions) {
            return result;
        }
        const selectorByDefinitionId = {};
        const coveredLanguages = {};
        const iconThemeDocumentLocationDirname = resources.dirname(iconThemeDocumentLocation);
        function resolvePath(path) {
            return resources.joinPath(iconThemeDocumentLocationDirname, path);
        }
        function collectSelectors(associations, baseThemeClassName) {
            function addSelector(selector, defId) {
                if (defId) {
                    let list = selectorByDefinitionId[defId];
                    if (!list) {
                        list = selectorByDefinitionId[defId] = new css.Builder();
                    }
                    list.push(selector);
                }
            }
            if (associations) {
                let qualifier = css.inline `.show-file-icons`;
                if (baseThemeClassName) {
                    qualifier = css.inline `${baseThemeClassName} ${qualifier}`;
                }
                const expanded = css.inline `.monaco-tl-twistie.collapsible:not(.collapsed) + .monaco-tl-contents`;
                if (associations.folder) {
                    addSelector(css.inline `${qualifier} .folder-icon::before`, associations.folder);
                    result.hasFolderIcons = true;
                }
                if (associations.folderExpanded) {
                    addSelector(css.inline `${qualifier} ${expanded} .folder-icon::before`, associations.folderExpanded);
                    result.hasFolderIcons = true;
                }
                const rootFolder = associations.rootFolder || associations.folder;
                const rootFolderExpanded = associations.rootFolderExpanded || associations.folderExpanded;
                if (rootFolder) {
                    addSelector(css.inline `${qualifier} .rootfolder-icon::before`, rootFolder);
                    result.hasFolderIcons = true;
                }
                if (rootFolderExpanded) {
                    addSelector(css.inline `${qualifier} ${expanded} .rootfolder-icon::before`, rootFolderExpanded);
                    result.hasFolderIcons = true;
                }
                if (associations.file) {
                    addSelector(css.inline `${qualifier} .file-icon::before`, associations.file);
                    result.hasFileIcons = true;
                }
                const folderNames = associations.folderNames;
                if (folderNames) {
                    for (const key in folderNames) {
                        const selectors = new css.Builder();
                        const name = handleParentFolder(key.toLowerCase(), selectors);
                        selectors.push(css.inline `.${classSelectorPart(name)}-name-folder-icon`);
                        addSelector(css.inline `${qualifier} ${selectors.join('')}.folder-icon::before`, folderNames[key]);
                        result.hasFolderIcons = true;
                    }
                }
                const folderNamesExpanded = associations.folderNamesExpanded;
                if (folderNamesExpanded) {
                    for (const key in folderNamesExpanded) {
                        const selectors = new css.Builder();
                        const name = handleParentFolder(key.toLowerCase(), selectors);
                        selectors.push(css.inline `.${classSelectorPart(name)}-name-folder-icon`);
                        addSelector(css.inline `${qualifier} ${expanded} ${selectors.join('')}.folder-icon::before`, folderNamesExpanded[key]);
                        result.hasFolderIcons = true;
                    }
                }
                const rootFolderNames = associations.rootFolderNames;
                if (rootFolderNames) {
                    for (const key in rootFolderNames) {
                        const name = key.toLowerCase();
                        addSelector(css.inline `${qualifier} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNames[key]);
                        result.hasFolderIcons = true;
                    }
                }
                const rootFolderNamesExpanded = associations.rootFolderNamesExpanded;
                if (rootFolderNamesExpanded) {
                    for (const key in rootFolderNamesExpanded) {
                        const name = key.toLowerCase();
                        addSelector(css.inline `${qualifier} ${expanded} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNamesExpanded[key]);
                        result.hasFolderIcons = true;
                    }
                }
                const languageIds = associations.languageIds;
                if (languageIds) {
                    if (!languageIds.jsonc && languageIds.json) {
                        languageIds.jsonc = languageIds.json;
                    }
                    for (const languageId in languageIds) {
                        addSelector(css.inline `${qualifier} .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`, languageIds[languageId]);
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
                                selectors.push(css.inline `.${classSelectorPart(segments.slice(i).join('.'))}-ext-file-icon`);
                            }
                            selectors.push(css.inline `.ext-file-icon`); // extra segment to increase file-ext score
                        }
                        addSelector(css.inline `${qualifier} ${selectors.join('')}.file-icon::before`, fileExtensions[key]);
                        result.hasFileIcons = true;
                        hasSpecificFileIcons = true;
                    }
                }
                const fileNames = associations.fileNames;
                if (fileNames) {
                    for (const key in fileNames) {
                        const selectors = new css.Builder();
                        const fileName = handleParentFolder(key.toLowerCase(), selectors);
                        selectors.push(css.inline `.${classSelectorPart(fileName)}-name-file-icon`);
                        selectors.push(css.inline `.name-file-icon`); // extra segment to increase file-name score
                        const segments = fileName.split('.');
                        if (segments.length) {
                            for (let i = 1; i < segments.length; i++) {
                                selectors.push(css.inline `.${classSelectorPart(segments.slice(i).join('.'))}-ext-file-icon`);
                            }
                            selectors.push(css.inline `.ext-file-icon`); // extra segment to increase file-ext score
                        }
                        addSelector(css.inline `${qualifier} ${selectors.join('')}.file-icon::before`, fileNames[key]);
                        result.hasFileIcons = true;
                        hasSpecificFileIcons = true;
                    }
                }
            }
        }
        collectSelectors(iconThemeDocument);
        collectSelectors(iconThemeDocument.light, css.inline `.vs`);
        collectSelectors(iconThemeDocument.highContrast, css.inline `.hc-black`);
        collectSelectors(iconThemeDocument.highContrast, css.inline `.hc-light`);
        if (!result.hasFileIcons && !result.hasFolderIcons) {
            return result;
        }
        const showLanguageModeIcons = iconThemeDocument.showLanguageModeIcons === true || (hasSpecificFileIcons && iconThemeDocument.showLanguageModeIcons !== false);
        const cssRules = new css.Builder();
        const fonts = iconThemeDocument.fonts;
        const fontSizes = new Map();
        if (Array.isArray(fonts)) {
            const defaultFontSize = this.tryNormalizeFontSize(fonts[0].size) || '150%';
            fonts.forEach(font => {
                const fontSrcs = new css.Builder();
                fontSrcs.push(...font.src.map(l => css.inline `${css.asCSSUrl(resolvePath(l.path))} format(${css.stringValue(l.format)})`));
                cssRules.push(css.inline `@font-face { src: ${fontSrcs.join(', ')}; font-family: ${css.stringValue(font.id)}; font-weight: ${css.identValue(font.weight)}; font-style: ${css.identValue(font.style)}; font-display: block; }`);
                const fontSize = this.tryNormalizeFontSize(font.size);
                if (fontSize !== undefined && fontSize !== defaultFontSize) {
                    fontSizes.set(font.id, fontSize);
                }
            });
            cssRules.push(css.inline `.show-file-icons .file-icon::before, .show-file-icons .folder-icon::before, .show-file-icons .rootfolder-icon::before { font-family: ${css.stringValue(fonts[0].id)}; font-size: ${css.sizeValue(defaultFontSize)}; }`);
        }
        // Use emQuads to prevent the icon from collapsing to zero height for image icons
        const emQuad = css.stringValue('\\2001');
        for (const defId in selectorByDefinitionId) {
            const selectors = selectorByDefinitionId[defId];
            const definition = iconThemeDocument.iconDefinitions[defId];
            if (definition) {
                if (definition.iconPath) {
                    cssRules.push(css.inline `${selectors.join(', ')} { content: ${emQuad}; background-image: ${css.asCSSUrl(resolvePath(definition.iconPath))}; }`);
                }
                else if (definition.fontCharacter || definition.fontColor) {
                    const body = new css.Builder();
                    if (definition.fontColor && definition.fontColor.match(fontColorRegex)) {
                        body.push(css.inline `color: ${css.hexColorValue(definition.fontColor)};`);
                    }
                    if (definition.fontCharacter) {
                        body.push(css.inline `content: ${css.stringValue(definition.fontCharacter)};`);
                    }
                    const fontSize = definition.fontSize ?? (definition.fontId ? fontSizes.get(definition.fontId) : undefined);
                    if (fontSize && fontSize.match(fontSizeRegex)) {
                        body.push(css.inline `font-size: ${css.sizeValue(fontSize)};`);
                    }
                    if (definition.fontId) {
                        body.push(css.inline `font-family: ${css.stringValue(definition.fontId)};`);
                    }
                    if (showLanguageModeIcons) {
                        body.push(css.inline `background-image: unset;`); // potentially set by the language default
                    }
                    cssRules.push(css.inline `${selectors.join(', ')} { ${body.join(' ')} }`);
                }
            }
        }
        if (showLanguageModeIcons) {
            for (const languageId of this.languageService.getRegisteredLanguageIds()) {
                if (!coveredLanguages[languageId]) {
                    const icon = this.languageService.getIcon(languageId);
                    if (icon) {
                        const selector = css.inline `.show-file-icons .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`;
                        cssRules.push(css.inline `${selector} { content: ${emQuad}; background-image: ${css.asCSSUrl(icon.dark)}; }`);
                        cssRules.push(css.inline `.vs ${selector} { content: ${emQuad}; background-image: ${css.asCSSUrl(icon.light)}; }`);
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
    tryNormalizeFontSize(size) {
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
function handleParentFolder(key, selectors) {
    const lastIndexOfSlash = key.lastIndexOf('/');
    if (lastIndexOfSlash >= 0) {
        const parentFolder = key.substring(0, lastIndexOfSlash);
        selectors.push(css.inline `.${classSelectorPart(parentFolder)}-name-dir-icon`);
        return key.substring(lastIndexOfSlash + 1);
    }
    return key;
}
function classSelectorPart(str) {
    str = fileIconSelectorEscape(str);
    return css.className(str, true);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUljb25UaGVtZURhdGEuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL2Jyb3dzZXIvZmlsZUljb25UaGVtZURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssS0FBSyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pELE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsYUFBYSxFQUFpRCxNQUFNLG9DQUFvQyxDQUFDO0FBQ2xILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBSXBGLE9BQU8sRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUU5RixNQUFNLE9BQU8saUJBQWlCO2FBRWIsZ0JBQVcsR0FBRyxlQUFlLENBQUM7SUFnQjlDLFlBQW9CLEVBQVUsRUFBRSxLQUFhLEVBQUUsVUFBeUI7UUFDdkUsSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUM7UUFDYixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztRQUN0QixJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQztRQUMxQixJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztRQUM1QixJQUFJLENB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