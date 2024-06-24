/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

// Import the effects we need
import { registerColor, transparent } from 'vs/platform/theme/common/colorUtils';

// Import the colors we need
import { foreground } from 'vs/platform/theme/common/colors/baseColors';
import { editorFindMatchHighlight, editorFindMatchHighlightBorder } from 'vs/platform/theme/common/colors/editorColors';


export const searchResultsInfoForeground = registerColor('search.resultsInfoForeground',
	{ light: foreground, dark: transparent(foreground, 0.65), hcDark: foreground, hcLight: foreground },
	nls.localize('search.resultsInfoForeground', "Color of the text in the search viewlet's completion message."));


// ----- search editor (Distinct from normal editor find match to allow for better differentiation)

export const searchEditorFindMatch = registerColor('searchEditor.findMatchBackground',
	{ light: transparent(editorFindMatchHighlight, 0.66), dark: transparent(editorFindMatchHighlight, 0.66), hcDark: editorFindMatchHighlight, hcLight: editorFindMatchHighlight },
	nls.localize('searchEditor.queryMatch', "Color of the Search Editor query matches."));

export const searchEditorFindMatchBorder = registerColor('searchEditor.findMatchBorder',
	{ light: transparent(editorFindMatchHighlightBorder, 0.66), dark: transparent(editorFindMatchHighlightBorder, 0.66), hcDark: editorFindMatchHighlightBorder, hcLight: editorFindMatchHighlightBorder },
	nls.localize('searchEditor.editorFindMatchBorder', "Border color of the Search Editor query matches."));
