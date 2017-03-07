/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/platform/platform');
import { Color } from 'vs/base/common/color';

export const Extensions = {
	ThemingContribution: 'base.contributions.theming'
};

export interface IColorContribution {
	id: string;
	description: string;
	defaults?: IColorDefaults;
}

export interface IColorDefaults {
	light: Color;
	dark: Color;
	highContrast: Color;
}

export interface ITheme {
	readonly selector: string;
	getColor(colorId: string): Color;
}

export interface IThemingParticipant {
	(theme: ITheme, result: string[]): void;
}

export interface IThemingRegistry {

	/**
	 * Register a color to the registry.
	 */
	registerColor(id: string, description: string, defaults?: IColorDefaults): void;

	/**
	 * Get all color contributions
	 */
	getColors(): IColorContribution[];

	/**
	 * Register a theming participant to the registry.
	 */
	registerThemingParticipant(participant: IThemingParticipant): void;

	/**
	 * Get all theming participant
	 */
	getThemingParticipants(): IThemingParticipant[];

}


class ThemingRegistry implements IThemingRegistry {
	private colorsById: { [key: string]: IColorContribution };
	private themingParticipants: IThemingParticipant[];

	constructor() {
		this.colorsById = {};
		this.themingParticipants = [];
	}

	public registerColor(id: string, description: string, defaults?: IColorDefaults): void {
		this.colorsById[id] = { id, description, defaults };
	}

	public getColors(): IColorContribution[] {
		return Object.keys(this.colorsById).map(id => this.colorsById[id]);
	}

	public registerThemingParticipant(participant: IThemingParticipant): void {
		this.themingParticipants.push(participant);
	}

	public getThemingParticipants(): IThemingParticipant[] {
		return this.themingParticipants;
	}

}

const themingRegistry = new ThemingRegistry();
platform.Registry.add(Extensions.ThemingContribution, themingRegistry);