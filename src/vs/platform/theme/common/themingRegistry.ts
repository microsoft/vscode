/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/platform/platform');
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Color } from 'vs/base/common/color';
import { ITheme } from 'vs/platform/theme/common/themeService';

import nls = require('vs/nls');

export const Extensions = {
	ThemingContribution: 'base.contributions.theming'
};

export interface IColorContribution {
	readonly id: string;
	readonly description: string;
	readonly defaults: ColorDefaults;
}

export interface DerivedColor {
	(theme: ITheme): Color;
}

export interface ColorDefaults {
	light: ColorValue;
	dark: ColorValue;
	hc: ColorValue;
}

// either a hex color literal (#RRGGBB or #RRBBGGAA) or a refence to other color or a derived color
export type ColorValue = string | IColorContribution | DerivedColor;


export interface IThemingRegistry {

	/**
	 * Register a color to the registry.
	 */
	registerColor(id: string, description: string, defaults?: ColorDefaults): IColorContribution;

	/**
	 * Get all color contributions
	 */
	getColors(): IColorContribution[];

	/**
	 * Gets the color of the given id
	 */
	getColor(id: string): IColorContribution;

	/**
	 * JSON schema of all colors
	 */
	getColorSchema(): IJSONSchema;

}

export function darken(colorValue: ColorValue, factor: number): DerivedColor {
	return (theme) => {
		let color = resolveColorValue(colorValue, theme);
		if (color) {
			return color.darken(factor);
		}
		return null;
	};
}


class ThemingRegistry implements IThemingRegistry {
	private colorsById: { [key: string]: IColorContribution };
	private colorSchema: IJSONSchema = { type: 'object', description: nls.localize('schema.colors', 'Colors used in the workbench.'), properties: {} };

	constructor() {
		this.colorsById = {};
	}

	public registerColor(id: string, description: string, defaults: ColorDefaults): IColorContribution {
		let colorContribution: IColorContribution = { id, description, defaults };
		this.colorsById[id] = colorContribution;
		this.colorSchema.properties[id] = { type: 'string', description };
		return colorContribution;
	}

	public getColors(): IColorContribution[] {
		return Object.keys(this.colorsById).map(id => this.colorsById[id]);
	}

	public getColor(id: string): IColorContribution {
		return this.colorsById[id];
	}

	public getColorSchema(): IJSONSchema {
		return this.colorSchema;
	}

}

/**
 * @param colorValue Resolve a color value in the context of a theme
 */
export function resolveColorValue(colorValue: ColorValue, theme: ITheme): Color {
	if (colorValue === null) {
		return null;
	} else if (typeof colorValue === 'string') {
		return Color.fromHex(colorValue);
	} else if (typeof colorValue === 'object' && colorValue.id) {
		return theme.getColor(colorValue.id);
	} else if (typeof colorValue === 'function') {
		return colorValue(theme);
	}
	return null;
}


const themingRegistry = new ThemingRegistry();
platform.Registry.add(Extensions.ThemingContribution, themingRegistry);