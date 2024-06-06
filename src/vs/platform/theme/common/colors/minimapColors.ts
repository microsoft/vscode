/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

// Import the effects we need
import { Color, RGBA } from 'vs/base/common/color';
import { registerColor, transparent } from 'vs/platform/theme/common/colorUtils';

// Import the colors we need
import { editorInfoForeground, editorWarningForeground, editorWarningBorder, editorInfoBorder } from 'vs/platform/theme/common/colors/editorColors';
import { scrollbarSliderBackground, scrollbarSliderHoverBackground, scrollbarSliderActiveBackground } from 'vs/platform/theme/common/colors/miscColors';


export const minimapFindMatch = registerColor('minimap.findMatchHighlight',
	{ light: '#d18616', dark: '#d18616', hcDark: '#AB5A00', hcLight: '#0F4A85' },
	nls.localize('minimapFindMatchHighlight', 'Minimap marker color for find matches.'), true);

export const minimapSelectionOccurrenceHighlight = registerColor('minimap.selectionOccurrenceHighlight',
	{ light: '#c9c9c9', dark: '#676767', hcDark: '#ffffff', hcLight: '#0F4A85' },
	nls.localize('minimapSelectionOccurrenceHighlight', 'Minimap marker color for repeating editor selections.'), true);

export const minimapSelection = registerColor('minimap.selectionHighlight',
	{ light: '#ADD6FF', dark: '#264F78', hcDark: '#ffffff', hcLight: '#0F4A85' },
	nls.localize('minimapSelectionHighlight', 'Minimap marker color for the editor selection.'), true);

export const minimapInfo = registerColor('minimap.infoHighlight',
	{ dark: editorInfoForeground, light: editorInfoForeground, hcDark: editorInfoBorder, hcLight: editorInfoBorder },
	nls.localize('minimapInfo', 'Minimap marker color for infos.'));

export const minimapWarning = registerColor('minimap.warningHighlight',
	{ dark: editorWarningForeground, light: editorWarningForeground, hcDark: editorWarningBorder, hcLight: editorWarningBorder },
	nls.localize('overviewRuleWarning', 'Minimap marker color for warnings.'));

export const minimapError = registerColor('minimap.errorHighlight',
	{ dark: new Color(new RGBA(255, 18, 18, 0.7)), light: new Color(new RGBA(255, 18, 18, 0.7)), hcDark: new Color(new RGBA(255, 50, 50, 1)), hcLight: '#B5200D' },
	nls.localize('minimapError', 'Minimap marker color for errors.'));

export const minimapBackground = registerColor('minimap.background',
	null,
	nls.localize('minimapBackground', "Minimap background color."));

export const minimapForegroundOpacity = registerColor('minimap.foregroundOpacity',
	Color.fromHex('#000f'),
	nls.localize('minimapForegroundOpacity', 'Opacity of foreground elements rendered in the minimap. For example, "#000000c0" will render the elements with 75% opacity.'));

export const minimapSliderBackground = registerColor('minimapSlider.background',
	transparent(scrollbarSliderBackground, 0.5),
	nls.localize('minimapSliderBackground', "Minimap slider background color."));

export const minimapSliderHoverBackground = registerColor('minimapSlider.hoverBackground',
	transparent(scrollbarSliderHoverBackground, 0.5),
	nls.localize('minimapSliderHoverBackground', "Minimap slider background color when hovering."));

export const minimapSliderActiveBackground = registerColor('minimapSlider.activeBackground',
	transparent(scrollbarSliderActiveBackground, 0.5),
	nls.localize('minimapSliderActiveBackground', "Minimap slider background color when clicked on."));
