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
	light: ColorDescription;
	dark: ColorDescription;
	hc: ColorDescription;
}

export type ColorDescription = string | IColorContribution | DerivedColor;


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

export function darken(colorDesc: ColorDescription, factor: number): DerivedColor {
	return (theme) => {
		let color = resolveDescription(theme, colorDesc);
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

	public registerColor(id: string, description: string, defaults: ColorDefaults) {
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

function resolveDescription(theme: ITheme, colorDesc: ColorDescription): Color {
	if (typeof colorDesc === 'string') {
		return Color.fromHex(colorDesc);
	} else if (typeof colorDesc === 'object' && colorDesc !== null) {
		let defaults = colorDesc.defaults;
		if (!defaults) {
			return null;
		}
		if (theme.isDarkTheme()) {
			return resolveDescription(theme, defaults.dark);
		} else if (theme.isLightTheme()) {
			return resolveDescription(theme, defaults.light);
		} else {
			return resolveDescription(theme, defaults.hc);
		}
	} else if (typeof colorDesc === 'function') {
		return colorDesc(theme);
	} else {
		return null;
	}
}




const themingRegistry = new ThemingRegistry();
platform.Registry.add(Extensions.ThemingContribution, themingRegistry);