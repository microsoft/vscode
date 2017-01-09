/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Theme, IThemeRule } from 'vs/editor/common/modes/supports/tokenization';

export var IStandaloneColorService = createDecorator<IStandaloneColorService>('standaloneColorService');

export type BuiltinTheme = 'vs' | 'vs-dark' | 'hc-black';

export interface ITheme {
	base: BuiltinTheme;
	inherit: boolean;
	rules: IThemeRule[];
}

export interface IStandaloneColorService {
	_serviceBrand: any;

	setTheme(themeName: string): string;

	defineTheme(themeName: string, themeData: ITheme): void;

	getTheme(): Theme;
}
