/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {TPromise} from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';

export let IThemeService = createDecorator<IThemeService>('themeService');

export interface IThemeService {
	_serviceBrand: any;
	setTheme(themeId: string, broadcastToAllWindows: boolean): TPromise<boolean>;
	getTheme(): string;
	getThemes(): TPromise<IThemeData[]>;
	onDidThemeChange: Event<string>;
}

export interface IThemeData {
	id: string;
	label: string;
	description?: string;
	path: string;
}