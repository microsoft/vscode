/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';

// Import the effects we need
import { Color, RGBA } from '../../../../base/common/color.js';
import { registerColor, transparent, withOpacity } from '../colorUtils.js';

// Import the colors we need
import { editorFindMatchHighlightBorder, editorInfoBorder, editorInfoForeground, editorSelectionBackground, editorSelectionHighlight, editorWarningBorder, editorWarningForeground, overviewRulerFindMatchForeground } from './editorColors.js';
import { scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from './miscColors.js';


export const minimapFindMatch = registerColor('minimap.findMatchHighlight',
	{ dark: withOpacity(overviewRulerFindMatchForeground, 0.8), light: withOpacity(overviewRulerFindMatchForeground, 0.8), hcDark: editorFindMatchHighlightBorder, hcLight: editorFindMatchHighlightBorder },
	nls.localize('minimapFindMatchHighlight', 'Minimap marker color for find matches. In light and dark themes, the default uses the overview ruler search match color at 80% opacity.'), true);

export const minimapSelectionOccurrenceHighlight = registerColor('minimap.selectionOccurrenceHighlight',
	editorSelectionHighlight,
	nls.localize('minimapSelectionOccurrenceHighlight', 'Minimap marker color for repeating editor selections.'), true);

export const minimapSelection = registerColor('minimap.selectionHighlight',
	editorSelectionBackground,
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
