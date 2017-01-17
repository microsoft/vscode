/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';

export let IThemeService = createDecorator<IThemeService>('themeService');

export const VS_LIGHT_THEME = 'vs';
export const VS_DARK_THEME = 'vs-dark';
export const VS_HC_THEME = 'hc-black';

export class IColorTheme {
	id: string;
	label: string;
	description?: string;
	isLoaded: boolean;
	settings?: IThemeSetting[];
}

export interface IFileIconTheme {
	id: string;
	label: string;
	description?: string;
	isLoaded: boolean;
	hasFileIcons?: boolean;
	hasFolderIcons?: boolean;
}

export interface IThemeService {
	_serviceBrand: any;
	setColorTheme(themeId: string, broadcastToAllWindows: boolean): TPromise<IColorTheme>;
	getColorTheme(): IColorTheme;
	getColorThemes(): TPromise<IColorTheme[]>;
	onDidColorThemeChange: Event<IColorTheme>;

	setFileIconTheme(iconThemeId: string, broadcastToAllWindows: boolean): TPromise<IFileIconTheme>;
	getFileIconTheme(): IFileIconTheme;
	getFileIconThemes(): TPromise<IFileIconTheme[]>;
	onDidFileIconThemeChange: Event<IFileIconTheme>;
}

export interface IThemeSetting {
	name?: string;
	scope?: string | string[];
	settings: IThemeSettingStyle;
}

export interface IThemeSettingStyle {
	foreground?: string;
	background?: string;
}