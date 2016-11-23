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

export interface IThemeService {
	_serviceBrand: any;
	setColorTheme(themeId: string, broadcastToAllWindows: boolean): TPromise<boolean>;
	getColorTheme(): string;
	getColorThemes(): TPromise<IThemeData[]>;
	onDidColorThemeChange: Event<string>;

	setFileIconTheme(iconThemeId: string, broadcastToAllWindows: boolean): TPromise<boolean>;
	getFileIconTheme(): string;
	getFileIconThemes(): TPromise<IThemeData[]>;
}

export interface IThemeData {
	id: string;
	label: string;
	description?: string;
	path: string;
}

export interface IThemeDocument {
	name: string;
	include: string;
	settings: IThemeSetting[];
}

export interface IThemeSetting {
	name?: string;
	scope?: string[];
	settings: IThemeSettingStyle[];
}

export interface IThemeSettingStyle {
}