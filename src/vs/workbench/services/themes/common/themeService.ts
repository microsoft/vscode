/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {TPromise} from 'vs/base/common/winjs.base';

export let IThemeService = createDecorator<IThemeService>('themeService');

export const DEFAULT_THEME_ID = 'vs-dark vscode-theme-defaults-themes-dark_plus-json';

export interface IThemeService {
	serviceId: ServiceIdentifier<any>;
	loadTheme(themeId: string): TPromise<IThemeData>;
	applyThemeCSS(themeId: string): TPromise<boolean>;
	getThemes(): TPromise<IThemeData[]>;
}

export interface IThemeData {
	id: string;
	label: string;
	description?: string;
	path: string;
	styleSheetContent?: string;
}