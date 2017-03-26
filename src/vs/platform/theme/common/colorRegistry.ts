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
	private colorSchema: IJSONSchema = { type: 'object', description: nls.localize('schema.colors', "Colors used in the workbench."), properties: {} };

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

export const foreground = registerColor('foreground', { dark: '#CCCCCC', light: '#6C6C6C', hc: '#FFFFFF' }, nls.localize('foreground', "Overall foreground color. This color is only used if not overridden by a component."));
export const focus = registerColor('focus', { dark: '#007ACC', light: '#007ACC', hc: '#F38518' }, nls.localize('focus', "Overall outline/border color for focused elements. This color is only used if not overridden by a component."));

/**
 * Commonly used High contrast colors.
 */
export const highContrastBorder = registerColor('highContrastBorder', { light: null, dark: null, hc: '#6FC3DF' }, nls.localize('highContrastBorder', "Border color to separate components when high contrast theme is enabled."));
export const highContrastOutline = registerColor('highContrastOutline', { light: null, dark: null, hc: focus }, nls.localize('highContrastOutline', "Outline color for active components when high contrast theme is enabled."));

/**
 * Widgets
 */
export const inputBackground = registerColor('inputBackground', { dark: '#3C3C3C', light: Color.white, hc: Color.black }, nls.localize('inputBackground', 'Input field background'));
export const inputForeground = registerColor('inputForeground', { dark: foreground, light: foreground, hc: foreground }, nls.localize('inputForeground', 'Input field foreground'));
export const inputBorder = registerColor('inputBorder', { dark: null, light: null, hc: highContrastBorder }, nls.localize('inputBorder', 'Input field border'));

export const selectBackground = registerColor('selectBackground', { dark: '#3C3C3C', light: Color.white, hc: '#3C3C3C' }, nls.localize('selectBackground', 'Select field background'));
export const selectForeground = registerColor('selectForeground', { dark: '#F0F0F0', light: null, hc: Color.white }, nls.localize('selectForeground', 'Select field foreground'));
export const selectBorder = registerColor('selectBorder', { dark: selectBackground, light: '#CECECE', hc: selectBackground }, nls.localize('selectBorder', 'Select field border'));

/**
 * Editor background color.
 * Because of bug https://monacotools.visualstudio.com/DefaultCollection/Monaco/_workitems/edit/13254
 * we are *not* using the color white (or #ffffff, rgba(255,255,255)) but something very close to white.
 */
export const editorBackground = registerColor('editorBackground', { light: '#fffffe', dark: '#1E1E1E', hc: Color.black }, nls.localize('editorBackground', "Editor background color"));

/**
 * Editor foreground color.
 */
export const editorForeground = registerColor('editorForeground', { light: '#333333', dark: '#BBBBBB', hc: Color.white }, nls.localize('editorForeground', "Editor default foreground color"));

/**
 * Editor selection colors.
 */
export const editorSelection = registerColor('editorSelection', { light: '#ADD6FF', dark: '#264F78', hc: '#f3f518' }, nls.localize('editorSelection', "Color of the editor selection"));
export const editorInactiveSelection = registerColor('editorInactiveSelection', { light: transparent(editorSelection, 0.5), dark: transparent(editorSelection, 0.5), hc: null }, nls.localize('editorInactiveSelection', "Color of the inactive editor selection"));
export const editorSelectionHighlightColor = registerColor('editorSelectionHighlightColor', { light: lessProminent(editorSelection, editorBackground, 0.3), dark: lessProminent(editorSelection, editorBackground, 0.3), hc: null }, nls.localize('editorsSelectionHighlightColor', "Background color of regions highlighted while selecting"));

/**
 * Editor find match colors.
 */
export const editorFindMatchHighlight = registerColor('editorFindMatchHighlight', { light: '#EA5C0055', dark: '#EA5C0055', hc: null }, nls.localize('findMatchHighlight', "Background color of regions matching the search"));
export const editorCurrentFindMatchHighlight = registerColor('editorCurrentFindMatchHighlight', { light: '#A8AC94', dark: '#515C6A', hc: null }, nls.localize('currentFindMatchHighlight', "Background color of the current region matching the search"));
export const editorFindRangeHighlight = registerColor('editorFindRangeHighlight', { dark: '#3a3d4166', light: '#b4b4b44d', hc: null }, nls.localize('findRangeHighlight', "Background color of regions selected for search"));

/**
 * Editor link colors
 */
export const editorActiveLinkForeground = registerColor('editorActiveLinkForeground', { dark: '#4E94CE', light: Color.black, hc: Color.cyan }, nls.localize('activeLinkForeground', 'Color of active links'));
export const editorLinkForeground = registerColor('editorLinkForeground', { dark: null, light: null, hc: null }, nls.localize('linkForeground', 'Color of links'));

/**
 * Find widget
 */
export const editorFindWidgetBackground = registerColor('editorFindWidgetBackground', { dark: '#2D2D30', light: '#EFEFF2', hc: '#0C141F' }, nls.localize('editorFindWidgetBackground', 'Find widget background'));
export const editorFindCheckedBorders = registerColor('editorFindCheckedBorders', { dark: '#007ACC', light: '#007ACC', hc: highContrastOutline }, nls.localize('editorFindCheckedBorders', 'Find widget checked border color'));


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

export function lessProminent(colorValue: ColorValue, backgroundColorValue: ColorValue, factor: number): ColorFunction {
	return (theme) => {
		let from = resolveColorValue(colorValue, theme);
		if (from) {
			let backgroundColor = resolveColorValue(backgroundColorValue, theme);
			if (backgroundColor) {
				if (from.isDarkerThan(backgroundColor)) {
					return Color.getLighterColor(from, backgroundColor, factor);
				}
				return Color.getDarkerColor(from, backgroundColor, factor);
			}
			return from.transparent(factor);
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





