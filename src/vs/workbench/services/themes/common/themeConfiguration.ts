/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationNode, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { textmateColorsSchemaId, textmateColorGroupSchemaId } from 'vs/workbench/services/themes/common/colorThemeSchema';
import { workbenchColorsSchemaId } from 'vs/platform/theme/common/colorRegistry';
import { tokenStylingSchemaId } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { ThemeSettings, IWorkbenchColorTheme, IWorkbenchFileIconTheme, IColorCustomizations, ITokenColorCustomizations, IWorkbenchProductIconTheme, ISemanticTokenColorCustomizations, ThemeSettingTarget, ThemeSettingDefaults } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { isWeb } from 'vs/base/common/platform';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { IHostColorSchemeService } from 'vs/workbench/services/themes/common/hostColorSchemeService';

// Configuration: Themes
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const colorThemeSettingEnum: string[] = [];
const colorThemeSettingEnumItemLabels: string[] = [];
const colorThemeSettingEnumDescriptions: string[] = [];

export function formatSettingAsLink(str: string) {
	return `\`#${str}#\``;
}

export const COLOR_THEME_CONFIGURATION_SETTINGS_TAG = 'colorThemeConfiguration';

const colorThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	markdownDescription: nls.localize({ key: 'colorTheme', comment: ['{0} will become a link to another setting.'] }, "Specifies the color theme used in the workbench when {0} is not enabled.", formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
	default: isWeb ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK,
	tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	enumItemLabels: colorThemeSettingEnumItemLabels,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredDarkThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string', //
	markdownDescription: nls.localize({ key: 'preferredDarkColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when system color mode is dark and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
	default: ThemeSettingDefaults.COLOR_THEME_DARK,
	tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	enumItemLabels: colorThemeSettingEnumItemLabels,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredLightThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	markdownDescription: nls.localize({ key: 'preferredLightColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when system color mode is light and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_COLOR_SCHEME)),
	default: ThemeSettingDefaults.COLOR_THEME_LIGHT,
	tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	enumItemLabels: colorThemeSettingEnumItemLabels,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredHCDarkThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	markdownDescription: nls.localize({ key: 'preferredHCDarkColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when in high contrast dark mode and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_HC)),
	default: ThemeSettingDefaults.COLOR_THEME_HC_DARK,
	tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	enumItemLabels: colorThemeSettingEnumItemLabels,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const preferredHCLightThemeSettingSchema: IConfigurationPropertySchema = {
	type: 'string',
	markdownDescription: nls.localize({ key: 'preferredHCLightColorTheme', comment: ['{0} will become a link to another setting.'] }, 'Specifies the color theme when in high contrast light mode and {0} is enabled.', formatSettingAsLink(ThemeSettings.DETECT_HC)),
	default: ThemeSettingDefaults.COLOR_THEME_HC_LIGHT,
	tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
	enum: colorThemeSettingEnum,
	enumDescriptions: colorThemeSettingEnumDescriptions,
	enumItemLabels: colorThemeSettingEnumItemLabels,
	errorMessage: nls.localize('colorThemeError', "Theme is unknown or not installed."),
};
const detectColorSchemeSettingSchema: IConfigurationPropertySchema = {
	type: 'boolean',
	markdownDescription: nls.localize({ key: 'detectColorScheme', comment: ['{0} and {1} will become links to other settings.'] }, 'If enabled, will automatically select a color theme based on the system color mode. If the system color mode is dark, {0} is used, else {1}.', formatSettingAsLink(ThemeSettings.PREFERRED_DARK_THEME), formatSettingAsLink(ThemeSettings.PREFERRED_LIGHT_THEME)),
	default: false,
	tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
};

const colorCustomizationsSchema: IConfigurationPropertySchema = {
	type: 'object',
	description: nls.localize('workbenchColors', "Overrides colors from the currently selected color theme."),
	allOf: [{ $ref: workbenchColorsSchemaId }],
	default: {},
	defaultSnippets: [{
		body: {
		}
	}]
};
const fileIconThemeSettingSchema: IConfigurationPropertySchema = {
	type: ['string', 'null'],
	default: ThemeSettingDefaults.FILE_ICON_THEME,
	description: nls.localize('iconTheme', "Specifies the file icon theme used in the workbench or 'null' to not show any file icons."),
	enum: [null],
	enumItemLabels: [nls.localize('noIconThemeLabel', 'None')],
	enumDescriptions: [nls.localize('noIconThemeDesc', 'No file icons')],
	errorMessage: nls.localize('iconThemeError', "File icon theme is unknown or not installed.")
};
const productIconThemeSettingSchema: IConfigurationPropertySchema = {
	type: ['string', 'null'],
	default: ThemeSettingDefaults.PRODUCT_ICON_THEME,
	description: nls.localize('productIconTheme', "Specifies the product icon theme used."),
	enum: [ThemeSettingDefaults.PRODUCT_ICON_THEME],
	enumItemLabels: [nls.localize('defaultProductIconThemeLabel', 'Default')],
	enumDescriptions: [nls.localize('defaultProductIconThemeDesc', 'Default')],
	errorMessage: nls.localize('productIconThemeError', "Product icon theme is unknown or not installed.")
};

const detectHCSchemeSettingSchema: IConfigurationPropertySchema = {
	type: 'boolean',
	default: true,
	markdownDescription: nls.localize({ key: 'autoDetectHighContrast', comment: ['{0} and {1} will become links to other settings.'] }, "If enabled, will automatically change to high contrast theme if the OS is using a high contrast theme. The high contrast theme to use is specified by {0} and {1}.", formatSettingAsLink(ThemeSettings.PREFERRED_HC_DARK_THEME), formatSettingAsLink(ThemeSettings.PREFERRED_HC_LIGHT_THEME)),
	scope: ConfigurationScope.APPLICATION,
	tags: [COLOR_THEME_CONFIGURATION_SETTINGS_TAG],
};

const themeSettingsConfiguration: IConfigurationNode = {
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

const themeSettingsWindowConfiguration: IConfigurationNode = {
	id: 'window',
	order: 8.1,
	type: 'object',
	properties: {
		[ThemeSettings.DETECT_HC]: detectHCSchemeSettingSchema,
		[ThemeSettings.DETECT_COLOR_SCHEME]: detectColorSchemeSettingSchema,
	}
};
configurationRegistry.registerConfiguration(themeSettingsWindowConfiguration);

function tokenGroupSettings(description: string): IJSONSchema {
	return {
		description,
		$ref: textmateColorGroupSchemaId
	};
}

const themeSpecificSettingKey = '^\\[[^\\]]*(\\]\\s*\\[[^\\]]*)*\\]$';

const tokenColorSchema: IJSONSchema = {
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

const tokenColorCustomizationSchema: IConfigurationPropertySchema = {
	description: nls.localize('editorColors', "Overrides editor syntax colors and font style from the currently selected color theme."),
	default: {},
	allOf: [{ ...tokenColorSchema, patternProperties: { '^\\[': {} } }]
};

const semanticTokenColorSchema: IJSONSchema = {
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

const semanticTokenColorCustomizationSchema: IConfigurationPropertySchema = {
	description: nls.localize('semanticTokenColors', "Overrides editor semantic token color and styles from the currently selected color theme."),
	default: {},
	allOf: [{ ...semanticTokenColorSchema, patternProperties: { '^\\[': {} } }]
};

const tokenColorCustomizationConfiguration: IConfigurationNode = {
	id: 'editor',
	order: 7.2,
	type: 'object',
	properties: {
		[ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS]: tokenColorCustomizationSchema,
		[ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS]: semanticTokenColorCustomizationSchema
	}
};

configurationRegistry.registerConfiguration(tokenColorCustomizationConfiguration);

export function updateColorThemeConfigurationSchemas(themes: IWorkbenchColorTheme[]) {
	// updates enum for the 'workbench.colorTheme` setting
	themes.sort((a, b) => a.label.localeCompare(b.label));
	colorThemeSettingEnum.splice(0, colorThemeSettingEnum.length, ...themes.map(t => t.settingsId));
	colorThemeSettingEnumDescriptions.splice(0, colorThemeSettingEnumDescriptions.length, ...themes.map(t => t.description || ''));
	colorThemeSettingEnumItemLabels.splice(0, colorThemeSettingEnumItemLabels.length, ...themes.map(t => t.label || ''));

	const themeSpecificWorkbenchColors: IJSONSchema = { properties: {} };
	const themeSpecificTokenColors: IJSONSchema = { properties: {} };
	const themeSpecificSemanticTokenColors: IJSONSchema = { properties: {} };

	const workbenchColors = { $ref: workbenchColorsSchemaId, additionalProperties: false };
	const tokenColors = { properties: tokenColorSchema.properties, additionalProperties: false };
	for (const t of themes) {
		// add theme specific color customization ("[Abyss]":{ ... })
		const themeId = `[${t.settingsId}]`;
		themeSpecificWorkbenchColors.properties![themeId] = workbenchColors;
		themeSpecificTokenColors.properties![themeId] = tokenColors;
		themeSpecificSemanticTokenColors.properties![themeId] = semanticTokenColorSchema;
	}
	themeSpecificWorkbenchColors.patternProperties = { [themeSpecificSettingKey]: workbenchColors };
	themeSpecificTokenColors.patternProperties = { [themeSpecificSettingKey]: tokenColors };
	themeSpecificSemanticTokenColors.patternProperties = { [themeSpecificSettingKey]: semanticTokenColorSchema };

	colorCustomizationsSchema.allOf![1] = themeSpecificWorkbenchColors;
	tokenColorCustomizationSchema.allOf![1] = themeSpecificTokenColors;
	semanticTokenColorCustomizationSchema.allOf![1] = themeSpecificSemanticTokenColors;

	configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration, tokenColorCustomizationConfiguration);
}

export function updateFileIconThemeConfigurationSchemas(themes: IWorkbenchFileIconTheme[]) {
	fileIconThemeSettingSchema.enum!.splice(1, Number.MAX_VALUE, ...themes.map(t => t.settingsId));
	fileIconThemeSettingSchema.enumItemLabels!.splice(1, Number.MAX_VALUE, ...themes.map(t => t.label));
	fileIconThemeSettingSchema.enumDescriptions!.splice(1, Number.MAX_VALUE, ...themes.map(t => t.description || ''));

	configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
}

export function updateProductIconThemeConfigurationSchemas(themes: IWorkbenchProductIconTheme[]) {
	productIconThemeSettingSchema.enum!.splice(1, Number.MAX_VALUE, ...themes.map(t => t.settingsId));
	productIconThemeSettingSchema.enumItemLabels!.splice(1, Number.MAX_VALUE, ...themes.map(t => t.label));
	productIconThemeSettingSchema.enumDescriptions!.splice(1, Number.MAX_VALUE, ...themes.map(t => t.description || ''));

	configurationRegistry.notifyConfigurationSchemaUpdated(themeSettingsConfiguration);
}

const colorSchemeToPreferred = {
	[ColorScheme.DARK]: ThemeSettings.PREFERRED_DARK_THEME,
	[ColorScheme.LIGHT]: ThemeSettings.PREFERRED_LIGHT_THEME,
	[ColorScheme.HIGH_CONTRAST_DARK]: ThemeSettings.PREFERRED_HC_DARK_THEME,
	[ColorScheme.HIGH_CONTRAST_LIGHT]: ThemeSettings.PREFERRED_HC_LIGHT_THEME
};

export class ThemeConfiguration {
	constructor(private configurationService: IConfigurationService, private hostColorService: IHostColorSchemeService) {
	}

	public get colorTheme(): string {
		return this.configurationService.getValue<string>(this.getColorThemeSettingId());
	}

	public get fileIconTheme(): string | null {
		return this.configurationService.getValue<string | null>(ThemeSettings.FILE_ICON_THEME);
	}

	public get productIconTheme(): string {
		return this.configurationService.getValue<string>(ThemeSettings.PRODUCT_ICON_THEME);
	}

	public get colorCustomizations(): IColorCustomizations {
		return this.configurationService.getValue<IColorCustomizations>(ThemeSettings.COLOR_CUSTOMIZATIONS) || {};
	}

	public get tokenColorCustomizations(): ITokenColorCustomizations {
		return this.configurationService.getValue<ITokenColorCustomizations>(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS) || {};
	}

	public get semanticTokenColorCustomizations(): ISemanticTokenColorCustomizations | undefined {
		return this.configurationService.getValue<ISemanticTokenColorCustomizations>(ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS);
	}

	public getPreferredColorScheme(): ColorScheme | undefined {
		if (this.configurationService.getValue(ThemeSettings.DETECT_HC) && this.hostColorService.highContrast) {
			return this.hostColorService.dark ? ColorScheme.HIGH_CONTRAST_DARK : ColorScheme.HIGH_CONTRAST_LIGHT;
		}
		if (this.configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
			return this.hostColorService.dark ? ColorScheme.DARK : ColorScheme.LIGHT;
		}
		return undefined;
	}

	public getColorThemeSettingId(): ThemeSettings {
		const preferredScheme = this.getPreferredColorScheme();
		return preferredScheme ? colorSchemeToPreferred[preferredScheme] : ThemeSettings.COLOR_THEME;
	}

	public async setColorTheme(theme: IWorkbenchColorTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchColorTheme> {
		await this.writeConfiguration(this.getColorThemeSettingId(), theme.settingsId, settingsTarget);
		return theme;
	}

	public async setFileIconTheme(theme: IWorkbenchFileIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchFileIconTheme> {
		await this.writeConfiguration(ThemeSettings.FILE_ICON_THEME, theme.settingsId, settingsTarget);
		return theme;
	}

	public async setProductIconTheme(theme: IWorkbenchProductIconTheme, settingsTarget: ThemeSettingTarget): Promise<IWorkbenchProductIconTheme> {
		await this.writeConfiguration(ThemeSettings.PRODUCT_ICON_THEME, theme.settingsId, settingsTarget);
		return theme;
	}

	public isDefaultColorTheme(): boolean {
		const settings = this.configurationService.inspect(this.getColorThemeSettingId());
		return settings && settings.default?.value === settings.value;
	}

	public findAutoConfigurationTarget(key: string) {
		const settings = this.configurationService.inspect(key);
		if (!types.isUndefined(settings.workspaceFolderValue)) {
			return ConfigurationTarget.WORKSPACE_FOLDER;
		} else if (!types.isUndefined(settings.workspaceValue)) {
			return ConfigurationTarget.WORKSPACE;
		} else if (!types.isUndefined(settings.userRemote)) {
			return ConfigurationTarget.USER_REMOTE;
		}
		return ConfigurationTarget.USER;
	}

	private async writeConfiguration(key: string, value: any, settingsTarget: ThemeSettingTarget): Promise<void> {
		if (settingsTarget === undefined || settingsTarget === 'preview') {
			return;
		}

		const settings = this.configurationService.inspect(key);
		if (settingsTarget === 'auto') {
			return this.configurationService.updateValue(key, value);
		}

		if (settingsTarget === ConfigurationTarget.USER) {
			if (value === settings.userValue) {
				return Promise.resolve(undefined); // nothing to do
			} else if (value === settings.defaultValue) {
				if (types.isUndefined(settings.userValue)) {
					return Promise.resolve(undefined); // nothing to do
				}
				value = undefined; // remove configuration from user settings
			}
		} else if (settingsTarget === ConfigurationTarget.WORKSPACE || settingsTarget === ConfigurationTarget.WORKSPACE_FOLDER || settingsTarget === ConfigurationTarget.USER_REMOTE) {
			if (value === settings.value) {
				return Promise.resolve(undefined); // nothing to do
			}
		}
		return this.configurationService.updateValue(key, value, settingsTarget);
	}
}
