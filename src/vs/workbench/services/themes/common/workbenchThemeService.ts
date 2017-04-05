/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { Color } from 'vs/base/common/color';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';

export let IWorkbenchThemeService = createDecorator<IWorkbenchThemeService>('themeService');

export const VS_LIGHT_THEME = 'vs';
export const VS_DARK_THEME = 'vs-dark';
export const VS_HC_THEME = 'hc-black';

export const COLOR_THEME_SETTING = 'workbench.colorTheme';
export const ICON_THEME_SETTING = 'workbench.iconTheme';
export const CUSTOM_COLORS_SETTING = 'workbench.experimental.colorCustomizations';

export interface IColorTheme extends ITheme {
	readonly id: string;
	readonly label: string;
	readonly settingsId: string;
	readonly extensionData: ExtensionData;
	readonly description?: string;
	readonly isLoaded: boolean;
	readonly tokenColors?: ITokenColorizationRule[];

	isLightTheme(): boolean;
	isDarkTheme(): boolean;
	getSyntaxThemeId(): string;
	getBaseThemeId(): string;
}

export interface IColorMap {
	[id: string]: Color;
}

export interface IFileIconTheme {
	readonly id: string;
	readonly label: string;
	readonly settingsId: string;
	readonly description?: string;
	readonly extensionData: ExtensionData;

	readonly isLoaded: boolean;
	readonly hasFileIcons?: boolean;
	readonly hasFolderIcons?: boolean;
}

export interface IWorkbenchThemeService extends IThemeService {
	_serviceBrand: any;
	setColorTheme(themeId: string, settingsTarget: ConfigurationTarget): TPromise<IColorTheme>;
	getColorTheme(): IColorTheme;
	getColorThemes(): TPromise<IColorTheme[]>;
	onDidColorThemeChange: Event<IColorTheme>;

	setFileIconTheme(iconThemeId: string, settingsTarget: ConfigurationTarget): TPromise<IFileIconTheme>;
	getFileIconTheme(): IFileIconTheme;
	getFileIconThemes(): TPromise<IFileIconTheme[]>;
	onDidFileIconThemeChange: Event<IFileIconTheme>;
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