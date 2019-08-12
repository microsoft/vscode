/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';
import { ITheme, IThemeService, IIconTheme } from 'vs/platform/theme/common/themeService';
import { ConfigurationTarget } from 'vs/platform/configuration/common/configuration';

export const IWorkbenchThemeService = createDecorator<IWorkbenchThemeService>('themeService');

export const VS_LIGHT_THEME = 'vs';
export const VS_DARK_THEME = 'vs-dark';
export const VS_HC_THEME = 'hc-black';

export const HC_THEME_ID = 'Default High Contrast';

export const COLOR_THEME_SETTING = 'workbench.colorTheme';
export const DETECT_HC_SETTING = 'window.autoDetectHighContrast';
export const ICON_THEME_SETTING = 'workbench.iconTheme';
export const CUSTOM_WORKBENCH_COLORS_SETTING = 'workbench.colorCustomizations';
export const CUSTOM_EDITOR_COLORS_SETTING = 'editor.tokenColorCustomizations';

export interface IColorTheme extends ITheme {
	readonly id: string;
	readonly label: string;
	readonly settingsId: string;
	readonly extensionData?: ExtensionData;
	readonly description?: string;
	readonly isLoaded: boolean;
	readonly tokenColors: ITokenColorizationRule[];
}

export interface IColorMap {
	[id: string]: Color;
}

export interface IFileIconTheme extends IIconTheme {
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

export interface IWorkbenchThemeService extends IThemeService {
	_serviceBrand: any;
	setColorTheme(themeId: string | undefined, settingsTarget: ConfigurationTarget | undefined): Promise<IColorTheme | null>;
	getColorTheme(): IColorTheme;
	getColorThemes(): Promise<IColorTheme[]>;
	onDidColorThemeChange: Event<IColorTheme>;
	restoreColorTheme(): void;

	setFileIconTheme(iconThemeId: string | undefined, settingsTarget: ConfigurationTarget | undefined): Promise<IFileIconTheme>;
	getFileIconTheme(): IFileIconTheme;
	getFileIconThemes(): Promise<IFileIconTheme[]>;
	onDidFileIconThemeChange: Event<IFileIconTheme>;
}

export interface IColorCustomizations {
	[colorIdOrThemeSettingsId: string]: string | IColorCustomizations;
}

export interface ITokenColorCustomizations {
	[groupIdOrThemeSettingsId: string]: string | ITokenColorizationSetting | ITokenColorCustomizations | undefined | ITokenColorizationRule[];
	comments?: string | ITokenColorizationSetting;
	strings?: string | ITokenColorizationSetting;
	numbers?: string | ITokenColorizationSetting;
	keywords?: string | ITokenColorizationSetting;
	types?: string | ITokenColorizationSetting;
	functions?: string | ITokenColorizationSetting;
	variables?: string | ITokenColorizationSetting;
	textMateRules?: ITokenColorizationRule[];
}

export interface ITokenColorizationRule {
	name?: string;
	scope?: string | string[];
	settings: ITokenColorizationSetting;
}

export interface ITokenColorizationSetting {
	foreground?: string;
	background?: string;
	fontStyle?: string;  // italic, underline, bold
}

export interface ExtensionData {
	extensionId: string;
	extensionPublisher: string;
	extensionName: string;
	extensionIsBuiltin: boolean;
}

export interface IThemeExtensionPoint {
	id: string;
	label?: string;
	description?: string;
	path: string;
	uiTheme?: typeof VS_LIGHT_THEME | typeof VS_DARK_THEME | typeof VS_HC_THEME;
	_watch: boolean; // unsupported options to watch location
}