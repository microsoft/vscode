/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Color } from 'vs/base/common/color';
import Event from 'vs/base/common/event';

export let IThemeService = createDecorator<IThemeService>('themeService');


export interface ITheme {
	readonly selector: string;
	readonly label: string;
	getColor(color: string): Color;

	isLightTheme(): boolean;
	isDarkTheme(): boolean;
}

export interface IThemingParticipant {
	(theme: ITheme, result: string[]): void;
}

export interface IThemeService {
	_serviceBrand: any;
	getTheme(): ITheme;

	onDidThemeChange: Event<ITheme>;

	/**
	 * Register a theming participant to the registry.
	 */
	registerThemingParticipant(participant: IThemingParticipant): void;

	/**
	 * Get all theming participants
	 */
	getThemingParticipants(): IThemingParticipant[];
}