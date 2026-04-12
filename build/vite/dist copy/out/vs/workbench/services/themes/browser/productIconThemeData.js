/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as Paths from '../../../../base/common/path.js';
import * as resources from '../../../../base/common/resources.js';
import * as Json from '../../../../base/common/json.js';
import { ExtensionData, ThemeSettingDefaults } from '../common/workbenchThemeService.js';
import { getParseErrorMessage } from '../../../../base/common/jsonErrorMessages.js';
import { isObject, isString } from '../../../../base/common/types.js';
import { getIconRegistry, IconFontDefinition, fontIdRegex, fontWeightRegex, fontStyleRegex, fontFormatRegex } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
export const DEFAULT_PRODUCT_ICON_THEME_ID = ''; // TODO
export class ProductIconThemeData {
    static { this.STORAGE_KEY = 'productIconThemeData'; }
    constructor(id, label, settingsId) {
        this.iconThemeDocument = { iconDefinitions: new Map() };
        this.id = id;
        this.label = label;
        this.settingsId = settingsId;
        this.isLoaded = false;
    }
    getIcon(iconContribution) {
        return _resolveIconDefinition(iconContribution, this.iconThemeDocument);
    }
    ensureLoaded(fileService, logService) {
        return !this.isLoaded ? this.load(fileService, logService) : Promise.resolve(this.styleSheetContent);
    }
    reload(fileService, logService) {
        return this.load(fileService, logService);
    }
    async load(fileService, logService) {
        const location = this.location;
        if (!location) {
            return Promise.resolve(this.styleSheetContent);
        }
        const warnings = [];
        this.iconThemeDocument = await _loadProductIconThemeDocument(fileService, location, warnings);
        this.isLoaded = true;
        if (warnings.length) {
            logService.error(nls.localize('error.parseicondefs', "Problems processing product icons definitions in {0}:\n{1}", location.toString(), warnings.join('\n')));
        }
        return this.styleSheetContent;
    }
    static fromExtensionTheme(iconTheme, iconThemeLocation, extensionData) {
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
    static createUnloadedTheme(id) {
        const themeData = new ProductIconThemeData(id, '', '__' + id);
        themeData.isLoaded = false;
        themeData.extensionData = undefined;
        themeData.watch = false;
        return themeData;
    }
    static { this._defaultProductIconTheme = null; }
    static get defaultTheme() {
        let themeData = ProductIconThemeData._defaultProductIconTheme;
        if (!themeData) {
            themeData = ProductIconThemeData._defaultProductIconTheme = new ProductIconThemeData(DEFAULT_PRODUCT_ICON_THEME_ID, nls.localize('defaultTheme', 'Default'), ThemeSettingDefaults.PRODUCT_ICON_THEME);
            themeData.isLoaded = true;
            themeData.extensionData = undefined;
            themeData.watch = false;
        }
        return themeData;
    }
    static fromStorageData(storageService) {
        const input = storageService.get(ProductIconThemeData.STORAGE_KEY, 0 /* StorageScope.PROFILE */);
        if (!input) {
            return undefined;
        }
        try {
            const data = JSON.parse(input);
            const theme = new ProductIconThemeData('', '', '');
            for (const key in data) {
                switch (key) {
                    case 'id':
                    case 'label':
                    case 'description':
                    case 'settingsId':
                    case 'styleSheetContent':
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
            const { iconDefinitions, iconFontDefinitions } = data;
            if (Array.isArray(iconDefinitions) && isObject(iconFontDefinitions)) {
                const restoredIconDefinitions = new Map();
                for (const entry of iconDefinitions) {
                    const { id, fontCharacter, fontId } = entry;
                    if (isString(id) && isString(fontCharacter)) {
                        if (isString(fontId)) {
                            const iconFontDefinition = IconFontDefinition.fromJSONObject(iconFontDefinitions[fontId]);
                            if (iconFontDefinition) {
                                restoredIconDefinitions.set(id, { fontCharacter, font: { id: fontId, definition: iconFontDefinition } });
                            }
                        }
                        else {
                            restoredIconDefinitions.set(id, { fontCharacter });
                        }
                    }
                }
                theme.iconThemeDocument = { iconDefinitions: restoredIconDefinitions };
            }
            return theme;
        }
        catch (e) {
            return undefined;
        }
    }
    toStorage(storageService) {
        const iconDefinitions = [];
        const iconFontDefinitions = {};
        for (const entry of this.iconThemeDocument.iconDefinitions.entries()) {
            const font = entry[1].font;
            iconDefinitions.push({ id: entry[0], fontCharacter: entry[1].fontCharacter, fontId: font?.id });
            if (font && iconFontDefinitions[font.id] === undefined) {
                iconFontDefinitions[font.id] = IconFontDefinition.toJSONObject(font.definition);
            }
        }
        const data = JSON.stringify({
            id: this.id,
            label: this.label,
            description: this.description,
            settingsId: this.settingsId,
            styleSheetContent: this.styleSheetContent,
            watch: this.watch,
            extensionData: ExtensionData.toJSONObject(this.extensionData),
            iconDefinitions,
            iconFontDefinitions
        });
        storageService.store(ProductIconThemeData.STORAGE_KEY, data, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
}
function _loadProductIconThemeDocument(fileService, location, warnings) {
    return fileService.readExtensionResource(location).then((content) => {
        const parseErrors = [];
        const contentValue = Json.parse(content, parseErrors);
        if (parseErrors.length > 0) {
            return Promise.reject(new Error(nls.localize('error.cannotparseicontheme', "Problems parsing product icons file: {0}", parseErrors.map(e => getParseErrorMessage(e.error)).join(', '))));
        }
        else if (Json.getNodeType(contentValue) !== 'object') {
            return Promise.reject(new Error(nls.localize('error.invalidformat', "Invalid format for product icons theme file: Object expected.")));
        }
        else if (!contentValue.iconDefinitions || !Array.isArray(contentValue.fonts) || !contentValue.fonts.length) {
            return Promise.reject(new Error(nls.localize('error.missingProperties', "Invalid format for product icons theme file: Must contain iconDefinitions and fonts.")));
        }
        const iconThemeDocumentLocationDirname = resources.dirname(location);
        const sanitizedFonts = new Map();
        for (const font of contentValue.fonts) {
            const fontId = font.id;
            if (isString(fontId) && fontId.match(fontIdRegex)) {
                let fontWeight = undefined;
                if (isString(font.weight) && font.weight.match(fontWeightRegex)) {
                    fontWeight = font.weight;
                }
                else {
                    warnings.push(nls.localize('error.fontWeight', 'Invalid font weight in font \'{0}\'. Ignoring setting.', font.id));
                }
                let fontStyle = undefined;
                if (isString(font.style) && font.style.match(fontStyleRegex)) {
                    fontStyle = font.style;
                }
                else {
                    warnings.push(nls.localize('error.fontStyle', 'Invalid font style in font \'{0}\'. Ignoring setting.', font.id));
                }
                const sanitizedSrc = [];
                if (Array.isArray(font.src)) {
                    for (const s of font.src) {
                        if (isString(s.path) && isString(s.format) && s.format.match(fontFormatRegex)) {
                            const iconFontLocation = resources.joinPath(iconThemeDocumentLocationDirname, s.path);
                            sanitizedSrc.push({ location: iconFontLocation, format: s.format });
                        }
                        else {
                            warnings.push(nls.localize('error.fontSrc', 'Invalid font source in font \'{0}\'. Ignoring source.', font.id));
                        }
                    }
                }
                if (sanitizedSrc.length) {
                    sanitizedFonts.set(fontId, { weight: fontWeight, style: fontStyle, src: sanitizedSrc });
                }
                else {
                    warnings.push(nls.localize('error.noFontSrc', 'No valid font source in font \'{0}\'. Ignoring font definition.', font.id));
                }
            }
            else {
                warnings.push(nls.localize('error.fontId', 'Missing or invalid font id \'{0}\'. Skipping font definition.', font.id));
            }
        }
        const iconDefinitions = new Map();
        const primaryFontId = contentValue.fonts[0].id;
        for (const iconId in contentValue.iconDefinitions) {
            const definition = contentValue.iconDefinitions[iconId];
            if (isString(definition.fontCharacter)) {
                const fontId = definition.fontId ?? primaryFontId;
                const fontDefinition = sanitizedFonts.get(fontId);
                if (fontDefinition) {
                    const font = { id: `pi-${fontId}`, definition: fontDefinition };
                    iconDefinitions.set(iconId, { fontCharacter: definition.fontCharacter, font });
                }
                else {
                    warnings.push(nls.localize('error.icon.font', 'Skipping icon definition \'{0}\'. Unknown font.', iconId));
                }
            }
            else {
                warnings.push(nls.localize('error.icon.fontCharacter', 'Skipping icon definition \'{0}\': Needs to be defined', iconId));
            }
        }
        return { iconDefinitions };
    });
}
const iconRegistry = getIconRegistry();
function _resolveIconDefinition(iconContribution, iconThemeDocument) {
    const iconDefinitions = iconThemeDocument.iconDefinitions;
    let definition = iconDefinitions.get(iconContribution.id);
    let defaults = iconContribution.defaults;
    while (!definition && ThemeIcon.isThemeIcon(defaults)) {
        // look if an inherited icon has a definition
        const ic = iconRegistry.getIcon(defaults.id);
        if (ic) {
            definition = iconDefinitions.get(ic.id);
            defaults = ic.defaults;
        }
        else {
            return undefined;
        }
    }
    if (definition) {
        return definition;
    }
    if (!ThemeIcon.isThemeIcon(defaults)) {
        return defaults;
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdEljb25UaGVtZURhdGEuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL2Jyb3dzZXIvcHJvZHVjdEljb25UaGVtZURhdGEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEtBQUssS0FBSyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3pELE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxLQUFLLElBQUksTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsYUFBYSxFQUFvRCxvQkFBb0IsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXBGLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFdEUsT0FBTyxFQUFrQixlQUFlLEVBQW9CLGtCQUFrQixFQUFrQixXQUFXLEVBQUUsZUFBZSxFQUFFLGNBQWMsRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN6TixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHakUsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsRUFBRSxDQUFDLENBQUMsT0FBTztBQUV4RCxNQUFNLE9BQU8sb0JBQW9CO2FBRWhCLGdCQUFXLEdBQUcsc0JBQXNCLEFBQXpCLENBQTBCO0lBY3JELFlBQW9CLEVBQVUsRUFBRSxLQUFhLEVBQUUsVUFBa0I7UUFIakUsc0JBQWlCLEdBQTZCLEVBQUUsZUFBZSxFQUFFLElBQUksR0FBRyxFQUFFLEVBQUUsQ0FBQztRQUk1RSxJQUFJLENBQUMsRUFBRSxHQUFHLEVBQUUs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