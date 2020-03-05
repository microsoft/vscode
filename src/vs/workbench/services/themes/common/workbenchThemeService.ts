/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';
import { IColorTheme, IThemeService, IFileIconTheme } from 'vs/platform/theme/common/themeService';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';

export const IWorkbenchThemeService = createDecorator<IWorkbenchThemeService>('themeService');

export const VS_LIGHT_THEME = 'vs';
export const VS_DARK_THEME = 'vs-dark';
export const VS_HC_THEME = 'hc-black';

export const HC_THEME_ID = 'Default High Contrast';

export enum ThemeSettings {
	COLOR_THEME = 'workbench.colorTheme',
	ICON_THEME = 'workbench.iconTheme',
	COLOR_CUSTOMIZATIONS = 'workbench.colorCustomizations',
	TOKEN_COLOR_CUSTOMIZATIONS = 'editor.tokenColorCustomizations',
	TOKEN_COLOR_CUSTOMIZATIONS_EXPERIMENTAL = 'editor.tokenColorCustomizationsExperimental',

	PREFERRED_DARK_THEME = 'workbench.preferredDarkColorTheme',
	PREFERRED_LIGHT_THEME = 'workbench.preferredLightColorTheme',
	PREFERRED_HC_THEME = 'workbench.preferredHighContrastColorTheme',
	DETECT_COLOR_SCHEME = 'window.autoDetectColorScheme',
	DETECT_HC = 'window.autoDetectHighContrast',

	PRODUCT_ICON_THEME = 'workbench.productIconTheme'
}

export interface IWorkbenchColorTheme extends IColorTheme {
	readonly id: string;
	readonly label: string;
	readonly settingsId: string;
	readonly extensionData?: ExtensionData;
	readonly description?: string;
	readonly isLoaded: boolean;
	readonly tokenColors: ITextMateThemingRule[];
}

export interface IColorMap {
	[id: string]: Color;
}

export interface IWorkbenchFileIconTheme extends IFileIconTheme {
	readonly id: string;
	readonly label: string;
	readonly settingsId: string | null;
	readonly description?: string;
	readonly extensionData?: ExtensionData;

	readonly isLoaded: boolean;
	readonly hasFileIcons: boolean;
	readonly hasFolderIcons: boolean;
	readonly hidesExplorerArrows: boolean;
}

export interface IWorkbenchProductIconTheme {
	readonly id: string;
	readonly label: string;
	readonly settingsId: string;
	readonly description?: string;
	readonly extensionData?: ExtensionData;

	readonly isLoaded: boolean;
}


export interface IWorkbenchThemeService extends IThemeService {
	_serviceBrand: undefined;
	setColorTheme(themeId: string | undefined, settingsTarget: ConfigurationTarget | undefined): Promise<IWorkbenchColorTheme | null>;
	getColorTheme(): IWorkbenchColorTheme;
	getColorThemes(): Promise<IWorkbenchColorTheme[]>;
	onDidColorThemeChange: Event<IWorkbenchColorTheme>;
	restoreColorTheme(): void;

	setFileIconTheme(iconThemeId: string | undefined, settingsTarget: ConfigurationTarget | undefined): Promise<IWorkbenchFileIconTheme>;
	getFileIconTheme(): IWorkbenchFileIconTheme;
	getFileIconThemes(): Promise<IWorkbenchFileIconTheme[]>;
	onDidFileIconThemeChange: Event<IWorkbenchFileIconTheme>;

	setProductIconTheme(iconThemeId: string | undefined, settingsTarget: ConfigurationTarget | undefined): Promise<IWorkbenchProductIconTheme>;
	getProductIconTheme(): IWorkbenchProductIconTheme;
	getProductIconThemes(): Promise<IWorkbenchProductIconTheme[]>;
	onDidProductIconThemeChange: Event<IWorkbenchProductIconTheme>;

}

export interface IColorCustomizations {
	[colorIdOrThemeSettingsId: string]: string | IColorCustomizations;
}

export interface ITokenColorCustomizations {
	[groupIdOrThemeSettingsId: string]: string | ITokenColorizationSetting | ITokenColorCustomizations | undefined | ITextMateThemingRule[];
	comments?: string | ITokenColorizationSetting;
	strings?: string | ITokenColorizationSetting;
	numbers?: string | ITokenColorizationSetting;
	keywords?: string | ITokenColorizationSetting;
	types?: string | ITokenColorizationSetting;
	functions?: string | ITokenColorizationSetting;
	variables?: string | ITokenColorizationSetting;
	textMateRules?: ITextMateThemingRule[];
}

export interface IExperimentalTokenStyleCustomizations {
	[styleRuleOrThemeSettingsId: string]: string | ITokenColorizationSetting | IExperimentalTokenStyleCustomizations | undefined;
}

export interface ITextMateThemingRule {
	name?: string;
	scope?: string | string[];
	settings: ITokenColorizationSetting;
}

export interface ITokenColorizationSetting {
	foreground?: string;
	background?: string;
	fontStyle?: string; /* [italic|underline|bold] */
}

export interface ExtensionData {
	extensionId: string;
	extensionPublisher: string;
	extensionName: string;
	extensionIsBuiltin: boolean;
	extensionLocation: URI;
}

export interface IThemeExtensionPoint {
	id: string;
	label?: string;
	description?: string;
	path: string;
	uiTheme?: typeof VS_LIGHT_THEME | typeof VS_DARK_THEME | typeof VS_HC_THEME;
	_watch: boolean; // unsupported options to watch location
}
