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

//  ------ API types

export type ColorIdentifier = string;

export interface ColorContribution {
	readonly id: ColorIdentifier;
	readonly description: string;
	readonly defaults: ColorDefaults;
}


export interface ColorFunction {
	(theme: ITheme): Color;
}

export interface ColorDefaults {
	light: ColorValue;
	dark: ColorValue;
	hc: ColorValue;
}

/**
 * A Color Value is either a color literal, a refence to other color or a derived color
 */
export type ColorValue = Color | string | ColorIdentifier | ColorFunction;

// color registry
export const Extensions = {
	ColorContribution: 'base.contributions.colors'
};

export interface IColorRegistry {

	/**
	 * Register a color to the registry.
	 * @param id The color id as used in theme descrition files
	 * @param defaults The default values
	 * @description the description
	 */
	registerColor(id: string, defaults: ColorDefaults, description: string): ColorIdentifier;

	/**
	 * Get all color contributions
	 */
	getColors(): ColorContribution[];

	/**
	 * Gets the default color of the given id
	 */
	resolveDefaultColor(id: ColorIdentifier, theme: ITheme): Color;

	/**
	 * JSON schema of all colors
	 */
	getColorSchema(): IJSONSchema;

}

class ColorRegistry implements IColorRegistry {
	private colorsById: { [key: string]: ColorContribution };
	private colorSchema: IJSONSchema = { type: 'object', description: nls.localize('schema.colors', 'Colors used in the workbench.'), properties: {} };

	constructor() {
		this.colorsById = {};
	}

	public registerColor(id: string, defaults: ColorDefaults, description: string): ColorIdentifier {
		let colorContribution = { id, description, defaults };
		this.colorsById[id] = colorContribution;
		this.colorSchema.properties[id] = { type: 'string', description };
		return id;
	}

	public getColors(): ColorContribution[] {
		return Object.keys(this.colorsById).map(id => this.colorsById[id]);
	}

	public resolveDefaultColor(id: ColorIdentifier, theme: ITheme): Color {
		let colorDesc = this.colorsById[id];
		if (colorDesc && colorDesc.defaults) {
			let colorValue = colorDesc.defaults[theme.type];
			return resolveColorValue(colorValue, theme);
		}
		return null;
	}

	public getColorSchema(): IJSONSchema {
		return this.colorSchema;
	}

}

const colorRegistry = new ColorRegistry();
platform.Registry.add(Extensions.ColorContribution, colorRegistry);

export function registerColor(id: string, defaults: ColorDefaults, description: string): ColorIdentifier {
	return colorRegistry.registerColor(id, defaults, description);
}


// ----- base colors

/**
 * Editor background color.
 * Because of bug https://monacotools.visualstudio.com/DefaultCollection/Monaco/_workitems/edit/13254
 * we are *not* using the color white (or #ffffff, rgba(255,255,255)) but something very close to white.
 */
export const editorBackground = registerColor('editorBackground', { light: '#fffffe', dark: '#1E1E1E', hc: Color.black }, nls.localize('editorBackground', 'Editor background color'));

/**
 * Editor foreground color.
 */
export const editorForeground = registerColor('editorForeground', { light: '#333333', dark: '#BBBBBB', hc: Color.white }, nls.localize('editorForeground', 'Editor default foreground color'));

/**
 * Editor selection colors.
 */
export const editorSelection = registerColor('editorSelection', { light: '#ADD6FF', dark: '#264F78', hc: '#f3f518' }, nls.localize('editorSelection', 'Color of the editor selection'));
export const editorInactiveSelection = registerColor('editorInactiveSelection', { light: '#E5EBF1', dark: '#3A3D41', hc: null }, nls.localize('editorInactiveSelection', 'Color of the inactive editor selection'));
export const editorSelectionHighlightColor = registerColor('editorSelectionHighlightColor', { light: '#add6ff4d', dark: '#add6ff26', hc: null }, nls.localize('editorsSelectionHighlightColor', 'Background color of regions highlighted while selecting'));

/**
 * Editor find match colors.
 */
export const editorFindMatchHighlight = registerColor('editorFindMatchHighlight', { light: '#EA5C0055', dark: '#EA5C0055', hc: null }, nls.localize('findMatchHighlight', 'Background color of regions matching the search'));
export const editorCurrentFindMatchHighlight = registerColor('editorCurrentFindMatchHighlight', { light: '#A8AC94', dark: '#515C6A', hc: null }, nls.localize('currentFindMatchHighlight', 'Background color of the current region matching the search'));
export const editorFindRangeHighlight = registerColor('editorFindRangeHighlight', { dark: '#3a3d4166', light: '#b4b4b44d', hc: null }, nls.localize('findRangeHighlight', 'Background color of regions selected for search'));


// ----- color functions

export function darken(colorValue: ColorValue, factor: number): ColorFunction {
	return (theme) => {
		let color = resolveColorValue(colorValue, theme);
		if (color) {
			return color.darken(factor);
		}
		return null;
	};
}

export function transparent(colorValue: ColorValue, factor: number): ColorFunction {
	return (theme) => {
		let color = resolveColorValue(colorValue, theme);
		if (color) {
			return color.transparent(factor);
		}
		return null;
	};
}

// ----- implementation

/**
 * @param colorValue Resolve a color value in the context of a theme
 */
function resolveColorValue(colorValue: ColorValue, theme: ITheme): Color {
	if (colorValue === null) {
		return null;
	} else if (typeof colorValue === 'string') {
		if (colorValue[0] === '#') {
			return Color.fromHex(colorValue);
		}
		return theme.getColor(colorValue);
	} else if (colorValue instanceof Color) {
		return colorValue;
	} else if (typeof colorValue === 'function') {
		return colorValue(theme);
	}
	return null;
}





