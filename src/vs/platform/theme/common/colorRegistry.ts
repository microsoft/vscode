/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/platform/registry/common/platform');
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Color, RGBA } from 'vs/base/common/color';
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
	 * JSON schema for an object to assign color values to one of the color contrbutions.
	 */
	getColorSchema(): IJSONSchema;

	/**
	 * JSON schema to for a reference to a color contrbution.
	 */
	getColorReferenceSchema(): IJSONSchema;

}

const colorPattern = '^#([0-9A-Fa-f]{3,4}|([0-9A-Fa-f]{2}){3,4})$';
const colorPatternErrorMessage = nls.localize('invalid.color', 'Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA');

class ColorRegistry implements IColorRegistry {
	private colorsById: { [key: string]: ColorContribution };
	private colorSchema: IJSONSchema = { type: 'object', description: nls.localize('schema.colors', "Colors used in the workbench."), properties: {}, additionalProperties: false };
	private colorReferenceSchema: IJSONSchema = { type: 'string', enum: [], enumDescriptions: [] };

	constructor() {
		this.colorsById = {};
	}

	public registerColor(id: string, defaults: ColorDefaults, description: string): ColorIdentifier {
		let colorContribution = { id, description, defaults };
		this.colorsById[id] = colorContribution;
		this.colorSchema.properties[id] = { type: 'string', description, format: 'color', pattern: colorPattern, patternErrorMessage: colorPatternErrorMessage };
		this.colorReferenceSchema.enum.push(id);
		this.colorReferenceSchema.enumDescriptions.push(description);
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

	public getColorReferenceSchema(): IJSONSchema {
		return this.colorReferenceSchema;
	}

	public toString() {
		let sorter = (a: string, b: string) => {
			let cat1 = a.indexOf('.') === -1 ? 0 : 1;
			let cat2 = b.indexOf('.') === -1 ? 0 : 1;
			if (cat1 !== cat2) {
				return cat1 - cat2;
			}
			return a.localeCompare(b);
		};

		return Object.keys(this.colorsById).sort(sorter).map(k => `- \`${k}\`: ${this.colorsById[k].description}`).join('\n');
	}

}

const colorRegistry = new ColorRegistry();
platform.Registry.add(Extensions.ColorContribution, colorRegistry);

export function registerColor(id: string, defaults: ColorDefaults, description: string): ColorIdentifier {
	return colorRegistry.registerColor(id, defaults, description);
}

export function getColorRegistry(): IColorRegistry {
	return colorRegistry;
}

// ----- base colors

export const foreground = registerColor('foreground', { dark: '#CCCCCC', light: '#6C6C6C', hc: '#FFFFFF' }, nls.localize('foreground', "Overall foreground color. This color is only used if not overridden by a component."));
export const errorForeground = registerColor('errorForeground', { dark: '#F48771', light: '#A1260D', hc: '#F48771' }, nls.localize('errorForeground', "Overall foreground color for error messages. This color is only used if not overridden by a component."));
export const descriptionForeground = registerColor('descriptionForeground', { light: transparent(foreground, 0.7), dark: transparent(foreground, 0.7), hc: transparent(foreground, 0.7) }, nls.localize('descriptionForeground', "Foreground color for description text providing additional information, for example for a label."));

export const focusBorder = registerColor('focusBorder', { dark: Color.fromHex('#0E639C').transparent(0.6), light: Color.fromHex('#007ACC').transparent(0.4), hc: '#F38518' }, nls.localize('focusBorder', "Overall border color for focused elements. This color is only used if not overridden by a component."));

export const contrastBorder = registerColor('contrastBorder', { light: null, dark: null, hc: '#6FC3DF' }, nls.localize('contrastBorder', "An extra border around elements to separate them from others for greater contrast."));
export const activeContrastBorder = registerColor('contrastActiveBorder', { light: null, dark: null, hc: focusBorder }, nls.localize('activeContrastBorder', "An extra border around active elements to separate them from others for greater contrast."));

export const selectionBackground = registerColor('selection.background', { light: null, dark: null, hc: null }, nls.localize('selectionBackground', "The background color of text selections in the workbench (e.g. for input fields or text areas). Note that this does not apply to selections within the editor."));

// ------ text colors

export const textSeparatorForeground = registerColor('textSeparator.foreground', { light: '#0000002e', dark: '#ffffff2e', hc: Color.black }, nls.localize('textSeparatorForeground', "Color for text separators."));
export const textLinkForeground = registerColor('textLink.foreground', { light: '#4080D0', dark: '#4080D0', hc: '#4080D0' }, nls.localize('textLinkForeground', "Foreground color for links in text."));
export const textLinkActiveForeground = registerColor('textLink.activeForeground', { light: '#4080D0', dark: '#4080D0', hc: '#4080D0' }, nls.localize('textLinkActiveForeground', "Foreground color for active links in text."));
export const textPreformatForeground = registerColor('textPreformat.foreground', { light: '#A31515', dark: '#D7BA7D', hc: '#D7BA7D' }, nls.localize('textPreformatForeground', "Foreground color for preformatted text segments."));
export const textBlockQuoteBackground = registerColor('textBlockQuote.background', { light: '#7f7f7f1a', dark: '#7f7f7f1a', hc: null }, nls.localize('textBlockQuoteBackground', "Background color for block quotes in text."));
export const textBlockQuoteBorder = registerColor('textBlockQuote.border', { light: '#007acc80', dark: '#007acc80', hc: Color.white }, nls.localize('textBlockQuoteBorder', "Border color for block quotes in text."));
export const textCodeBlockBackground = registerColor('textCodeBlock.background', { light: '#dcdcdc66', dark: '#0a0a0a66', hc: Color.black }, nls.localize('textCodeBlockBackground', "Background color for code blocks in text."));

// ----- widgets
export const widgetShadow = registerColor('widget.shadow', { dark: '#000000', light: '#A8A8A8', hc: null }, nls.localize('widgetShadow', 'Shadow color of widgets such as find/replace inside the editor.'));

export const inputBackground = registerColor('input.background', { dark: '#3C3C3C', light: Color.white, hc: Color.black }, nls.localize('inputBoxBackground', "Input box background."));
export const inputForeground = registerColor('input.foreground', { dark: foreground, light: foreground, hc: foreground }, nls.localize('inputBoxForeground', "Input box foreground."));
export const inputBorder = registerColor('input.border', { dark: null, light: null, hc: contrastBorder }, nls.localize('inputBoxBorder', "Input box border."));
export const inputActiveOptionBorder = registerColor('inputOption.activeBorder', { dark: '#007ACC', light: '#007ACC', hc: activeContrastBorder }, nls.localize('inputBoxActiveOptionBorder', "Border color of activated options in input fields."));
export const inputPlaceholderForeground = registerColor('input.placeholderForeground', { dark: null, light: null, hc: null }, nls.localize('inputPlaceholderForeground', "Input box foreground color for placeholder text."));

export const inputValidationInfoBackground = registerColor('inputValidation.infoBackground', { dark: '#063B49', light: '#D6ECF2', hc: Color.black }, nls.localize('inputValidationInfoBackground', "Input validation background color for information severity."));
export const inputValidationInfoBorder = registerColor('inputValidation.infoBorder', { dark: '#007acc', light: '#007acc', hc: contrastBorder }, nls.localize('inputValidationInfoBorder', "Input validation border color for information severity."));
export const inputValidationWarningBackground = registerColor('inputValidation.warningBackground', { dark: '#352A05', light: '#F6F5D2', hc: Color.black }, nls.localize('inputValidationWarningBackground', "Input validation background color for information warning."));
export const inputValidationWarningBorder = registerColor('inputValidation.warningBorder', { dark: '#B89500', light: '#B89500', hc: contrastBorder }, nls.localize('inputValidationWarningBorder', "Input validation border color for warning severity."));
export const inputValidationErrorBackground = registerColor('inputValidation.errorBackground', { dark: '#5A1D1D', light: '#F2DEDE', hc: Color.black }, nls.localize('inputValidationErrorBackground', "Input validation background color for error severity."));
export const inputValidationErrorBorder = registerColor('inputValidation.errorBorder', { dark: '#BE1100', light: '#BE1100', hc: contrastBorder }, nls.localize('inputValidationErrorBorder', "Input validation border color for error severity."));

export const selectBackground = registerColor('dropdown.background', { dark: '#3C3C3C', light: Color.white, hc: Color.black }, nls.localize('dropdownBackground', "Dropdown background."));
export const selectForeground = registerColor('dropdown.foreground', { dark: '#F0F0F0', light: null, hc: Color.white }, nls.localize('dropdownForeground', "Dropdown foreground."));
export const selectBorder = registerColor('dropdown.border', { dark: selectBackground, light: '#CECECE', hc: contrastBorder }, nls.localize('dropdownBorder', "Dropdown border."));

export const listFocusBackground = registerColor('list.focusBackground', { dark: '#073655', light: '#DCEBFC', hc: null }, nls.localize('listFocusBackground', "List/Tree background color for the focused item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));
export const listFocusForeground = registerColor('list.focusForeground', { dark: null, light: null, hc: null }, nls.localize('listFocusForeground', "List/Tree foreground color for the focused item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));
export const listActiveSelectionBackground = registerColor('list.activeSelectionBackground', { dark: '#094771', light: '#3399FF', hc: null }, nls.localize('listActiveSelectionBackground', "List/Tree background color for the selected item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));
export const listActiveSelectionForeground = registerColor('list.activeSelectionForeground', { dark: Color.white, light: Color.white, hc: null }, nls.localize('listActiveSelectionForeground', "List/Tree foreground color for the selected item when the list/tree is active. An active list/tree has keyboard focus, an inactive does not."));
export const listInactiveSelectionBackground = registerColor('list.inactiveSelectionBackground', { dark: '#3F3F46', light: '#CCCEDB', hc: null }, nls.localize('listInactiveSelectionBackground', "List/Tree background color for the selected item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));
export const listInactiveSelectionForeground = registerColor('list.inactiveSelectionForeground', { dark: null, light: null, hc: null }, nls.localize('listInactiveSelectionForeground', "List/Tree foreground color for the selected item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));
export const listInactiveFocusBackground = registerColor('list.inactiveFocusBackground', { dark: '#313135', light: '#d8dae6', hc: null }, nls.localize('listInactiveSelectionBackground', "List/Tree background color for the selected item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));
export const listInactiveFocusForeground = registerColor('list.inactiveFocusForeground', { dark: null, light: null, hc: null }, nls.localize('listInactiveSelectionForeground', "List/Tree foreground color for the selected item when the list/tree is inactive. An active list/tree has keyboard focus, an inactive does not."));
export const listHoverBackground = registerColor('list.hoverBackground', { dark: '#2A2D2E', light: '#F0F0F0', hc: null }, nls.localize('listHoverBackground', "List/Tree background when hovering over items using the mouse."));
export const listHoverForeground = registerColor('list.hoverForeground', { dark: null, light: null, hc: null }, nls.localize('listHoverForeground', "List/Tree foreground when hovering over items using the mouse."));
export const listDropBackground = registerColor('list.dropBackground', { dark: listFocusBackground, light: listFocusBackground, hc: null }, nls.localize('listDropBackground', "List/Tree drag and drop background when moving items around using the mouse."));
export const listHighlightForeground = registerColor('list.highlightForeground', { dark: '#0097fb', light: '#007acc', hc: focusBorder }, nls.localize('highlight', 'List/Tree foreground color of the match highlights when searching inside the list/tree.'));

export const pickerGroupForeground = registerColor('pickerGroup.foreground', { dark: Color.fromHex('#0097FB').transparent(0.6), light: Color.fromHex('#007ACC').transparent(0.6), hc: Color.white }, nls.localize('pickerGroupForeground', "Quick picker color for grouping labels."));
export const pickerGroupBorder = registerColor('pickerGroup.border', { dark: '#3F3F46', light: '#CCCEDB', hc: Color.white }, nls.localize('pickerGroupBorder', "Quick picker color for grouping borders."));

export const buttonForeground = registerColor('button.foreground', { dark: Color.white, light: Color.white, hc: Color.white }, nls.localize('buttonForeground', "Button foreground color."));
export const buttonBackground = registerColor('button.background', { dark: '#0E639C', light: '#007ACC', hc: null }, nls.localize('buttonBackground', "Button background color."));
export const buttonHoverBackground = registerColor('button.hoverBackground', { dark: lighten(buttonBackground, 0.2), light: darken(buttonBackground, 0.2), hc: null }, nls.localize('buttonHoverBackground', "Button background color when hovering."));

export const badgeBackground = registerColor('badge.background', { dark: '#4D4D4D', light: '#BEBEBE', hc: Color.black }, nls.localize('badgeBackground', "Badge background color. Badges are small information labels, e.g. for search results count."));
export const badgeForeground = registerColor('badge.foreground', { dark: Color.white, light: Color.white, hc: Color.white }, nls.localize('badgeForeground', "Badge foreground color. Badges are small information labels, e.g. for search results count."));

export const scrollbarShadow = registerColor('scrollbar.shadow', { dark: '#000000', light: '#DDDDDD', hc: null }, nls.localize('scrollbarShadow', "Scrollbar shadow to indicate that the view is scrolled."));
export const scrollbarSliderBackground = registerColor('scrollbarSlider.background', { dark: Color.fromHex('#797979').transparent(0.4), light: Color.fromHex('#646464').transparent(0.4), hc: transparent(contrastBorder, 0.6) }, nls.localize('scrollbarSliderBackground', "Scrollbar slider background color."));
export const scrollbarSliderHoverBackground = registerColor('scrollbarSlider.hoverBackground', { dark: Color.fromHex('#646464').transparent(0.7), light: Color.fromHex('#646464').transparent(0.7), hc: transparent(contrastBorder, 0.8) }, nls.localize('scrollbarSliderHoverBackground', "Scrollbar slider background color when hovering."));
export const scrollbarSliderActiveBackground = registerColor('scrollbarSlider.activeBackground', { dark: Color.fromHex('#BFBFBF').transparent(0.4), light: Color.fromHex('#000000').transparent(0.6), hc: contrastBorder }, nls.localize('scrollbarSliderActiveBackground', "Scrollbar slider background color when active."));

export const progressBarBackground = registerColor('progressBar.background', { dark: Color.fromHex('#0E70C0'), light: Color.fromHex('#0E70C0'), hc: contrastBorder }, nls.localize('progressBarBackground', "Background color of the progress bar that can show for long running operations."));

/**
 * Editor background color.
 * Because of bug https://monacotools.visualstudio.com/DefaultCollection/Monaco/_workitems/edit/13254
 * we are *not* using the color white (or #ffffff, rgba(255,255,255)) but something very close to white.
 */
export const editorBackground = registerColor('editor.background', { light: '#fffffe', dark: '#1E1E1E', hc: Color.black }, nls.localize('editorBackground', "Editor background color."));

/**
 * Editor foreground color.
 */
export const editorForeground = registerColor('editor.foreground', { light: '#333333', dark: '#BBBBBB', hc: Color.white }, nls.localize('editorForeground', "Editor default foreground color."));

/**
 * Editor widgets
 */
export const editorWidgetBackground = registerColor('editorWidget.background', { dark: '#2D2D30', light: '#EFEFF2', hc: '#0C141F' }, nls.localize('editorWidgetBackground', 'Background color of editor widgets, such as find/replace.'));
export const editorWidgetBorder = registerColor('editorWidget.border', { dark: '#454545', light: '#C8C8C8', hc: contrastBorder }, nls.localize('editorWidgetBorder', 'Border color of editor widgets. The color is only used if the widget chooses to have a border and if the color is not overridden by a widget.'));


/**
 * Editor selection colors.
 */
export const editorSelectionBackground = registerColor('editor.selectionBackground', { light: '#ADD6FF', dark: '#264F78', hc: '#f3f518' }, nls.localize('editorSelectionBackground', "Color of the editor selection."));
export const editorSelectionForeground = registerColor('editor.selectionForeground', { light: null, dark: null, hc: '#000000' }, nls.localize('editorSelectionForeground', "Color of the selected text for high contrast."));
export const editorInactiveSelection = registerColor('editor.inactiveSelectionBackground', { light: transparent(editorSelectionBackground, 0.5), dark: transparent(editorSelectionBackground, 0.5), hc: transparent(editorSelectionBackground, 0.5) }, nls.localize('editorInactiveSelection', "Color of the selection in an inactive editor."));
export const editorSelectionHighlight = registerColor('editor.selectionHighlightBackground', { light: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), dark: lessProminent(editorSelectionBackground, editorBackground, 0.3, 0.6), hc: null }, nls.localize('editorSelectionHighlight', 'Color for regions with the same content as the selection.'));

/**
 * Editor find match colors.
 */
export const editorFindMatch = registerColor('editor.findMatchBackground', { light: '#A8AC94', dark: '#515C6A', hc: null }, nls.localize('editorFindMatch', "Color of the current search match."));
export const editorFindMatchHighlight = registerColor('editor.findMatchHighlightBackground', { light: '#EA5C0055', dark: '#EA5C0055', hc: null }, nls.localize('findMatchHighlight', "Color of the other search matches."));
export const editorFindRangeHighlight = registerColor('editor.findRangeHighlightBackground', { dark: '#3a3d4166', light: '#b4b4b44d', hc: null }, nls.localize('findRangeHighlight', "Color the range limiting the search."));

/**
 * Editor hover
 */
export const editorHoverHighlight = registerColor('editor.hoverHighlightBackground', { light: '#ADD6FF26', dark: '#264f7840', hc: '#ADD6FF26' }, nls.localize('hoverHighlight', 'Highlight below the word for which a hover is shown.'));
export const editorHoverBackground = registerColor('editorHoverWidget.background', { light: editorWidgetBackground, dark: editorWidgetBackground, hc: editorWidgetBackground }, nls.localize('hoverBackground', 'Background color of the editor hover.'));
export const editorHoverBorder = registerColor('editorHoverWidget.border', { light: editorWidgetBorder, dark: editorWidgetBorder, hc: editorWidgetBorder }, nls.localize('hoverBorder', 'Border color of the editor hover.'));

/**
 * Editor link colors
 */
export const editorActiveLinkForeground = registerColor('editorLink.activeForeground', { dark: '#4E94CE', light: Color.blue, hc: Color.cyan }, nls.localize('activeLinkForeground', 'Color of active links.'));

/**
 * Diff Editor Colors
 */
export const defaultInsertColor = new Color(new RGBA(155, 185, 85, 0.2));
export const defaultRemoveColor = new Color(new RGBA(255, 0, 0, 0.2));

export const diffInserted = registerColor('diffEditor.insertedTextBackground', { dark: defaultInsertColor, light: defaultInsertColor, hc: null }, nls.localize('diffEditorInserted', 'Background color for text that got inserted.'));
export const diffRemoved = registerColor('diffEditor.removedTextBackground', { dark: defaultRemoveColor, light: defaultRemoveColor, hc: null }, nls.localize('diffEditorRemoved', 'Background color for text that got removed.'));

export const diffInsertedOutline = registerColor('diffEditor.insertedTextBorder', { dark: null, light: null, hc: '#33ff2eff' }, nls.localize('diffEditorInsertedOutline', 'Outline color for the text that got inserted.'));
export const diffRemovedOutline = registerColor('diffEditor.removedTextBorder', { dark: null, light: null, hc: '#FF008F' }, nls.localize('diffEditorRemovedOutline', 'Outline color for text that got removed.'));

/**
 * Merge-conflict colors
 */

const headerTransparency = 0.5;
const currentBaseColor = Color.fromHex('#40C8AE').transparent(headerTransparency);
const incomingBaseColor = Color.fromHex('#40A6FF').transparent(headerTransparency);
const commonBaseColor = Color.fromHex('#606060').transparent(0.4);
const contentTransparency = 0.4;
const rulerTransparency = 1;

export const mergeCurrentHeaderBackground = registerColor('merge.currentHeaderBackground', { dark: currentBaseColor, light: currentBaseColor, hc: null }, nls.localize('mergeCurrentHeaderBackground', 'Current header background in inline merge-conflicts.'));
export const mergeCurrentContentBackground = registerColor('merge.currentContentBackground', { dark: transparent(mergeCurrentHeaderBackground, contentTransparency), light: transparent(mergeCurrentHeaderBackground, contentTransparency), hc: transparent(mergeCurrentHeaderBackground, contentTransparency) }, nls.localize('mergeCurrentContentBackground', 'Current content background in inline merge-conflicts.'));
export const mergeIncomingHeaderBackground = registerColor('merge.incomingHeaderBackground', { dark: incomingBaseColor, light: incomingBaseColor, hc: null }, nls.localize('mergeIncomingHeaderBackground', 'Incoming header background in inline merge-conflicts.'));
export const mergeIncomingContentBackground = registerColor('merge.incomingContentBackground', { dark: transparent(mergeIncomingHeaderBackground, contentTransparency), light: transparent(mergeIncomingHeaderBackground, contentTransparency), hc: transparent(mergeIncomingHeaderBackground, contentTransparency) }, nls.localize('mergeIncomingContentBackground', 'Incoming content background in inline merge-conflicts.'));
export const mergeCommonHeaderBackground = registerColor('merge.commonHeaderBackground', { dark: commonBaseColor, light: commonBaseColor, hc: null }, nls.localize('mergeCommonHeaderBackground', 'Common ancestor header background in inline merge-conflicts.'));
export const mergeCommonContentBackground = registerColor('merge.commonContentBackground', { dark: transparent(mergeCommonHeaderBackground, contentTransparency), light: transparent(mergeCommonHeaderBackground, contentTransparency), hc: transparent(mergeCommonHeaderBackground, contentTransparency) }, nls.localize('mergeCommonContentBackground', 'Common ancester content background in inline merge-conflicts.'));

export const mergeBorder = registerColor('merge.border', { dark: null, light: null, hc: '#C3DF6F' }, nls.localize('mergeBorder', 'Border color on headers and the splitter in inline merge-conflicts.'));

export const overviewRulerCurrentContentForeground = registerColor('editorOverviewRuler.currentContentForeground', { dark: transparent(mergeCurrentHeaderBackground, rulerTransparency), light: transparent(mergeCurrentHeaderBackground, rulerTransparency), hc: mergeBorder }, nls.localize('overviewRulerCurrentContentForeground', 'Current overview ruler foreground for inline merge-conflicts.'));
export const overviewRulerIncomingContentForeground = registerColor('editorOverviewRuler.incomingContentForeground', { dark: transparent(mergeIncomingHeaderBackground, rulerTransparency), light: transparent(mergeIncomingHeaderBackground, rulerTransparency), hc: mergeBorder }, nls.localize('overviewRulerIncomingContentForeground', 'Incoming overview ruler foreground for inline merge-conflicts.'));
export const overviewRulerCommonContentForeground = registerColor('editorOverviewRuler.commonContentForeground', { dark: transparent(mergeCommonHeaderBackground, rulerTransparency), light: transparent(mergeCommonHeaderBackground, rulerTransparency), hc: mergeBorder }, nls.localize('overviewRulerCommonContentForeground', 'Common ancestor overview ruler foreground for inline merge-conflicts.'));

const findMatchColorDefault = new Color(new RGBA(246, 185, 77, 0.7));
export const overviewRulerFindMatchForeground = registerColor('editorOverviewRuler.findMatchForeground', { dark: findMatchColorDefault, light: findMatchColorDefault, hc: findMatchColorDefault }, nls.localize('overviewRulerFindMatchForeground', 'Overview ruler marker color for find matches.'));

export const overviewRulerSelectionHighlightForeground = registerColor('editorOverviewRuler.selectionHighlightForeground', { dark: '#A0A0A0', light: '#A0A0A0', hc: '#A0A0A0' }, nls.localize('overviewRulerSelectionHighlightForeground', 'Overview ruler marker color for selection highlights.'));


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

export function lighten(colorValue: ColorValue, factor: number): ColorFunction {
	return (theme) => {
		let color = resolveColorValue(colorValue, theme);
		if (color) {
			return color.lighten(factor);
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

export function oneOf(...colorValues: ColorValue[]): ColorFunction {
	return (theme) => {
		for (let colorValue of colorValues) {
			let color = resolveColorValue(colorValue, theme);
			if (color) {
				return color;
			}
		}
		return null;
	};
}

function lessProminent(colorValue: ColorValue, backgroundColorValue: ColorValue, factor: number, transparency: number): ColorFunction {
	return (theme) => {
		let from = resolveColorValue(colorValue, theme);
		if (from) {
			let backgroundColor = resolveColorValue(backgroundColorValue, theme);
			if (backgroundColor) {
				if (from.isDarkerThan(backgroundColor)) {
					return Color.getLighterColor(from, backgroundColor, factor).transparent(transparency);
				}
				return Color.getDarkerColor(from, backgroundColor, factor).transparent(transparency);
			}
			return from.transparent(factor * transparency);
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

// setTimeout(_ => console.log(colorRegistry.toString()), 5000);



