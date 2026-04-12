/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as types from '../../../../base/common/types.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { textmateColorsSchemaId, textmateColorGroupSchemaId } from './colorThemeSchema.js';
import { workbenchColorsSchemaId } from '../../../../platform/theme/common/colorRegistry.js';
import { tokenStylingSchemaId } from '../../../../platform/theme/common/tokenClassificationRegistry.js';
import { ThemeSettings, ThemeSettingDefaults } from './workbenchThemeService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
// Configuration: Themes
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
const colorThemeSettingEnum = [];
const colorThemeSettingEnumItemLabels = [];
const colorThemeSettingEnumDescriptions = [];
export function formatSettingAsLink(str) {
    return `\`#${str}#\``;
}
export const COLOR_THEME_CONFIGURATION_SETTINGS_TAG = 'colorThemeConfiguration';
const colorThemeSettingSchema = {
    type: 'string',
    markdownDescription: nls.localize({ key: 'colorTheme', comment: ['{0} will become a link to another setting.'] }, "Specifies the color theme used in the workbench when {0} is not enabled.", formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
    default: isWeb ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK,
    tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
    enum: colorThemeSettingEnum,
    enumDescriptions: colorThemeSettingEnumDescriptions,
    enumItemLabels: colorThemeSettingEnumItemLabels,
    errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredDarkThemeSettingSchema = {
    type: 'string', //
    markdownDescription: nls.localize({ key: 'preferredDarkColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when system color mode is dark and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
    default: ThemeSettingDefaults.COLOR_THEME_DARK,
    tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
    enum: colorThemeSettingEnum,
    enumDescriptions: colorThemeSettingEnumDescriptions,
    enumItemLabels: colorThemeSettingEnumItemLabels,
    errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredLightThemeSettingSchema = {
    type: 'string',
    markdownDescription: nls.localize({ key: 'preferredLightColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when system color mode is light and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
    default: ThemeSettingDefaults.COLOR_THEME_LIGHT,
    tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
    enum: colorThemeSettingEnum,
    enumDescriptions: colorThemeSettingEnumDescriptions,
    enumItemLabels: colorThemeSettingEnumItemLabels,
    errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredHCDarkThemeSettingSchema = {
    type: 'string',
    markdownDescription: nls.localize({ key: 'preferredHCDarkColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when in high contrast dark mode and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_HC)),
    default: ThemeSettingDefaults.COLOR_THEME_HC_DARK,
    tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
    enum: colorThemeSettingEnum,
    enumDescriptions: colorThemeSettingEnumDescriptions,
    enumItemLabels: colorThemeSettingEnumItemLabels,
    errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredHCLightThemeSettingSchema = {
    type: 'string',
    markdownDescription: nls.localize({ key: 'preferredHCLightColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when in high contrast light mode and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_HC)),
    default: ThemeSettingDefaults.COLOR_THEME_HC_LIGHT,
    tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
    enum: colorThemeSettingEnum,
    enumDescriptions: colorThemeSettingEnumDescriptions,
    enumItemLabels: colorThemeSettingEnumItemLabels,
    errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const detectColorSchemeSettingSchema = {
    type: 'boolean',
    markdownDescription: nls.localize({ key: 'detectColorScheme', comment: ['{0} and {1} will become links to other settings.'] }, 'If enabled, will automatically select a color theme based on the system color mode. If the system color mode is dark, {0} is used, else {1}.', formatSettingAsLink(ThemeSettings.PREFERRED_DARK_THEME), formatSettingAsLink(ThemeSettings.PREFERRED_LIGHT_THEME)),
    default: false,
    tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
};
const colorCustomizationsSchema = {
    type: 'object',
    description: nls.localize('workbenchColors', "Overrides colors from the currently selected color theme."),
    allOf: [{ $ref: workbenchColorsSchemaId }],
    default: {},
    defaultSnippets: [{
            body: {}
        }]
};
const fileIconThemeSettingSchema = {
    type: ['string', 'null'],
    default: ThemeSettingDefaults.FILE_ICON_THEME,
    description: nls.localize('iconTheme', "Specifies the file icon theme used in the workbench or 'null' to not show any file icons."),
    enum: [null],
    enumItemLabels: [nls.localize('noIconThemeLabel', 'None')],
    enumDescriptions: [nls.localize('noIconThemeDesc', 'No file icons')],
    errorMessage: nls.localize('iconThemeError', "File icon theme is unknown or not installed.")
};
const productIconThemeSettingSchema = {
    type: ['string', 'null'],
    default: ThemeSettingDefaults.PRODUCT_ICON_THEME,
    description: nls.localize('productIconTheme', "Specifies the product icon theme used."),
    enum: [ThemeSettingDefaults.PRODUCT_ICON_THEME],
    enumItemLabels: [nls.localize('defaultProductIconThemeLabel', 'Default')],
    enumDescriptions: [nls.localize('defaultProductIconThemeDesc', 'Default')],
    errorMessage: nls.localize('productIconThemeError', "Product icon theme is unknown or not installed.")
};
const detectHCSchemeSettingSchema = {
    type: 'boolean',
    default: true,
    markdownDescription: nls.localize({ key: 'autoDetectHighContrast', comment: ['{0} and {1} will become links to other settings.'] }, "If enabled, will automatically change to high contrast theme if the OS is using a high contrast theme. The high contrast theme to use is specified by {0} and {1}.", formatSettingAsLink(ThemeSettings.PREFERRED_HC_DARK_THEME), formatSettingAsLink(ThemeSettings.PREFERRED_HC_LIGHT_THEME)),
    scope: 1 /* ConfigurationScope.APPLICATION */,
    tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
};
const themeSettingsConfiguration = {
    id: 'workbench',
    order: 7.1,
    type: 'object',
    properties: {
        [ThemeSettings.COLOR_THEME]: colorThemeSettingSchema,
        [ThemeSettings.PREFERRED_DARK_THEME]: preferredDarkThemeSettingSchema,
        [ThemeSettings.PREFERRED_LIGHT_THEME]: preferredLightThemeSettingSchema,
        [ThemeSettings.PREFERRED_HC_DARK_THEME]: preferredHCDarkThemeSettingSchema,
        [ThemeSettings.PREFERRED_HC_LIGHT_THEME]: preferredHCLightThemeSettingSchema,
        [ThemeSettings.FILE_ICON_THEME]: fileIconThemeSettingSchema,
        [ThemeSettings.COLOR_CUSTOMIZATIONS]: colorCustomizationsSchema,
        [ThemeSettings.PRODUCT_ICON_THEME]: productIconThemeSettingSchema
    }
};
configurationRegistry.registerConfiguration(themeSettingsConfiguration);
const themeSettingsWindowConfiguration = {
    id: 'window',
    order: 8.1,
    type: 'object',
    properties: {
        [ThemeSettings.DETECT_HC]: detectHCSchemeSettingSchema,
        [ThemeSettings.DETECT_COLOR_SCHEME]: detectColorSchemeSettingSchema,
    }
};
configurationRegistry.registerConfiguration(themeSettingsWindowConfiguration);
function tokenGroupSettings(description) {
    return {
        description,
        $ref: textmateColorGroupSchemaId
    };
}
const themeSpecificSettingKey = '^\\[[^\\]]*(\\]\\s*\\[[^\\]]*)*\\]$';
const tokenColorSchema = {
    type: 'object',
    properties: {
        comments: tokenGroupSettings(nls.localize('editorColors.comments', "Sets the colors and styles for comments")),
        strings: tokenGroupSettings(nls.localize('editorColors.strings', "Sets the colors and styles for strings literals.")),
        keywords: tokenGroupSettings(nls.localize('editorColors.keywords', "Sets the colors and styles for keywords.")),
        numbers: tokenGroupSettings(nls.localize('editorColors.numbers', "Sets the colors and styles for number literals.")),
        types: tokenGroupSettings(nls.localize('editorColors.types', "Sets the colors and styles for type declarations and references.")),
        functions: tokenGroupSettings(nls.localize('editorColors.functions', "Sets the colors and styles for functions declarations and references.")),
        variables: tokenGroupSettings(nls.localize('editorColors.variables', "Sets the colors and styles for variables declarations and references.")),
        textMateRules: {
            description: nls.localize('editorColors.textMateRules', 'Sets colors and styles using textmate theming rules (advanced).'),
            $ref: textmateColorsSchemaId
        },
        semanticHighlighting: {
            description: nls.localize('editorColors.semanticHighlighting', 'Whether semantic highlighting should be enabled for this theme.'),
            deprecationMessage: nls.localize('editorColors.semanticHighlighting.deprecationMessage', 'Use `enabled` in `editor.semanticTokenColorCustomizations` setting instead.'),
            markdownDeprecationMessage: nls.localize({ key: 'editorColors.semanticHighlighting.deprecationMessageMarkdown', comment: ['{0} will become a link to another setting.'] }, 'Use `enabled` in {0} setting instead.', formatSettingAsLink('editor.semanticTokenColorCustomizations')),
            type: 'boolean'
        }
    },
    additionalProperties: false
};
const tokenColorCustomizationSchema = {
    description: nls.localize('editorColors', "Overrides editor syntax colors and font style from the currently selected color theme."),
    default: {},
    allOf: [{ ...tokenColorSchema, patternProperties: { '^\\[': {} } }]
};
const semanticTokenColorSchema = {
    type: 'object',
    properties: {
        enabled: {
            type: 'boolean',
            description: nls.localize('editorColors.semanticHighlighting.enabled', 'Whether semantic highlighting is enabled or disabled for this theme'),
            suggestSortText: '0_enabled'
        },
        rules: {
            $ref: tokenStylingSchemaId,
            description: nls.localize('editorColors.semanticHighlighting.rules', 'Semantic token styling rules for this theme.'),
            suggestSortText: '0_rules'
        }
    },
    additionalProperties: false
};
const semanticTokenColorCustomizationSchema = {
    description: nls.localize('semanticTokenColors', "Overrides editor semantic token color and styles from the currently selected color theme."),
    default: {},
    allOf: [{ ...semanticTokenColorSchema, patternProperties: { '^\\[': {} } }]
};
const tokenColorCustomizationConfiguration = {
    id: 'editor',
    order: 7.2,
    type: 'object',
    properties: {
        [ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS]: tokenColorCustomizationSchema,
        [ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS]: semanticTokenColorCustomizationSchema
    }
};
configurationRegistry.registerConfiguration(tokenColorCustomizationConfiguration);
export function updateColorThemeConfigurationSchemas(themes) {
    // updates enum for the 'workbench.colorTheme` setting
    themes.sort((a, b) => a.label.localeCompare(b.label));
    colorThemeSettingEnum.splice(0, colorThemeSettingEnum.length, ...themes.map(t => t.settingsId));
    colorThemeSettingEnumDescriptions.splice(0, colorThemeSettingEnumDescriptions.length, ...themes.map(t => t.description || ''));
    colorThemeSettingEnumItemLabels.splice(0, colorThemeSettingEnumItemLabels.length, ...themes.map(t => t.label || ''));
    const themeSpecificWorkbenchColors = { properties: {} };
    const themeSpecificTokenColors = { properties: {} };
    const themeSpecificSemanticTokenColors = { properties: {} };
    const workbenchColors = { $ref: workbenchColorsSchemaId, additionalProperties: false };
    const tokenColors = { properties: tokenColorSchema.properties, additionalProperties: false };
    for (const t of themes) {
        // add theme specific color customization ("[Abyss]":{ ... })
        const themeId = `[${t.settingsId}]`;
        themeSpecificWorkbenchColors.properties[themeId] = workbenchColors;
        themeSpecificTokenColors.properties[themeId] = tokenColors;
        themeSpecificSemanticTokenColors.properties[themeId] = semanticTokenColorSchema;
    }
    themeSpecificWorkbenchColors.patternProperties = { [themeSpecificSettingKey]: workbenchColors };
    themeSpecificTokenColors.patternProperties = { [themeSpecificSettingKey]: tokenColors };
    themeSpecificSemanticTokenColors.patternProperties = { [themeSpecificSettingKey]: semanticTokenColorSchema };
    colorCustomizationsSchema.allOf[1] = themeSpecificWorkbenchColors;
    tokenColorCustomizationSchema.allOf[1] = themeSpecificTokenColors;
    semanticTokenColorCustomizationSchema.allOf[1] = themeSpecificSemanticTokenColors;
    configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration, tokenColorCustomizationConfiguration);
}
export function updateFileIconThemeConfigurationSchemas(themes) {
    fileIconThemeSettingSchema.enum.splice(1, Number.MAX_VALUE, ...themes.map(t => t.settingsId));
    fileIconThemeSettingSchema.enumItemLabels.splice(1, Number.MAX_VALUE, ...themes.map(t => t.label));
    fileIconThemeSettingSchema.enumDescriptions.splice(1, Number.MAX_VALUE, ...themes.map(t => t.description || ''));
    configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
}
export function updateProductIconThemeConfigurationSchemas(themes) {
    productIconThemeSettingSchema.enum.splice(1, Number.MAX_VALUE, ...themes.map(t => t.settingsId));
    productIconThemeSettingSchema.enumItemLabels.splice(1, Number.MAX_VALUE, ...themes.map(t => t.label));
    productIconThemeSettingSchema.enumDescriptions.splice(1, Number.MAX_VALUE, ...themes.map(t => t.description || ''));
    configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
}
const colorSchemeToPreferred = {
    [ColorScheme.DARK]: ThemeSettings.PREFERRED_DARK_THEME,
    [ColorScheme.LIGHT]: ThemeSettings.PREFERRED_LIGHT_THEME,
    [ColorScheme.HIGH_CONTRAST_DARK]: ThemeSettings.PREFERRED_HC_DARK_THEME,
    [ColorScheme.HIGH_CONTRAST_LIGHT]: ThemeSettings.PREFERRED_HC_LIGHT_THEME
};
export class ThemeConfiguration {
    constructor(configurationService, hostColorService) {
        this.configurationService = configurationService;
        this.hostColorService = hostColorService;
    }
    get colorTheme() {
        return this.configurationService.getValue(this.getColorThemeSettingId());
    }
    get fileIconTheme() {
        return this.configurationService.getValue(ThemeSettings.FILE_ICON_THEME);
    }
    get productIconTheme() {
        return this.configurationService.getValue(ThemeSettings.PRODUCT_ICON_THEME);
    }
    get colorCustomizations() {
        return this.configurationService.getValue(ThemeSettings.COLOR_CUSTOMIZATIONS) || {};
    }
    get tokenColorCustomizations() {
        const tokenColorCustomization = this.configurationService.getValue(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS) || {};
        const textMateRules = tokenColorCustomization.textMateRules;
        if (!textMateRules) {
            return tokenColorCustomization;
        }
        const updatedRules = textMateRules.map(rule => {
            const fontSize = rule.settings?.fontSize;
            const lineHeight = rule.settings?.lineHeight;
            if (fontSize !== undefined && lineHeight === undefined) {
                return {
                    ...rule,
                    settings: {
                        ...rule.settings,
                        lineHeight: fontSize
                    }
                };
            }
            return rule;
        });
        const updatedTokenColorCustomization = {
            ...tokenColorCustomization,
            textMateRules: updatedRules
        };
        return updatedTokenColorCustomization;
    }
    get semanticTokenColorCustomizations() {
        return this.configurationService.getValue(ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS);
    }
    getPreferredColorScheme() {
        if (this.configurationService.getValue(ThemeSettings.DETECT_HC) && this.hostColorService.highContrast) {
            return this.hostColorService.dark ? ColorScheme.HIGH_CONTRAST_DARK : ColorScheme.HIGH_CONTRAST_LIGHT;
        }
        if (this.isDetectingColorScheme()) {
            return this.hostColorService.dark ? ColorScheme.DARK : ColorScheme.LIGHT;
        }
        return undefined;
    }
    isDetectingColorScheme() {
        return this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME);
    }
    getColorThemeSettingId() {
        const preferredScheme = this.getPreferredColorScheme();
        return preferredScheme ? colorSchemeToPreferred[preferredScheme] : ThemeSettings.COLOR_THEME;
    }
    async setColorTheme(theme, settingsTarget) {
        await this.writeConfiguration(this.getColorThemeSettingId(), theme.settingsId, settingsTarget);
        return theme;
    }
    async setFileIconTheme(theme, settingsTarget) {
        await this.writeConfiguration(ThemeSettings.FILE_ICON_THEME, theme.settingsId, settingsTarget);
        return theme;
    }
    async setProductIconTheme(theme, settingsTarget) {
        await this.writeConfiguration(ThemeSettings.PRODUCT_ICON_THEME, theme.settingsId, settingsTarget);
        return theme;
    }
    isDefaultColorTheme() {
        const settings = this.configurationService.inspect(this.getColorThemeSettingId());
        return settings && settings.default?.value === settings.value;
    }
    findAutoConfigurationTarget(key) {
        const settings = this.configurationService.inspect(key);
        if (!types.isUndefined(settings.workspaceFolderValue)) {
            return 6 /* ConfigurationTarget.WORKSPACE_FOLDER */;
        }
        else if (!types.isUndefined(settings.workspaceValue)) {
            return 5 /* ConfigurationTarget.WORKSPACE */;
        }
        else if (!types.isUndefined(settings.userRemote)) {
            return 4 /* ConfigurationTarget.USER_REMOTE */;
        }
        return 2 /* ConfigurationTarget.USER */;
    }
    async writeConfiguration(key, value, settingsTarget) {
        if (settingsTarget === undefined || settingsTarget === 'preview') {
            return;
        }
        const settings = this.configurationService.inspect(key);
        if (settingsTarget === 'auto') {
            return this.configurationService.updateValue(key, value);
        }
        if (settingsTarget === 2 /* ConfigurationTarget.USER */) {
            if (value === settings.userValue) {
                return Promise.resolve(undefined); // nothing to do
            }
            else if (value === settings.defaultValue) {
                if (types.isUndefined(settings.userValue)) {
                    return Promise.resolve(undefined); // nothing to do
                }
                value = undefined; // remove configuration from user settings
            }
        }
        else if (settingsTarget === 5 /* ConfigurationTarget.WORKSPACE */ || settingsTarget === 6 /* ConfigurationTarget.WORKSPACE_FOLDER */ || settingsTarget === 4 /* ConfigurationTarget.USER_REMOTE */) {
            if (value === settings.value) {
                return Promise.resolve(undefined); // nothing to do
            }
        }
        return this.configurationService.updateValue(key, value, settingsTarget);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVDb25maWd1cmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vdGhlbWVDb25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxLQUFLLEtBQUssTUFBTSxrQ0FBa0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQXdFLE1BQU0sb0VBQW9FLENBQUM7QUFHek4sT0FBTyxFQUFFLHNCQUFzQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDM0YsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDN0YsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDeEcsT0FBTyxFQUFFLGFBQWEsRUFBcUwsb0JBQW9CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUVwUSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBR3pFLHdCQUF3QjtBQUN4QixNQUFNLHFCQUFxQixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRXpHLE1BQU0scUJBQXFCLEdBQWEsRUFBRSxDQUFDO0FBQzNDLE1BQU0sK0JBQStCLEdBQWEsRUFBRSxDQUFDO0FBQ3JELE1BQU0saUNBQWlDLEdBQWEsRUFBRSxDQUFDO0FBRXZELE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxHQUFXO0lBQzlDLE9BQU8s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