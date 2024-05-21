/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { registerColor, transparent } from 'vs/platform/theme/common/colorUtils';

import { foreground } from 'vs/platform/theme/common/colors/baseColors';
import { editorErrorForeground, editorInfoForeground, editorWarningForeground } from 'vs/platform/theme/common/colors/editorColors';
import { minimapFindMatch } from 'vs/platform/theme/common/colors/minimapColors';


export const chartsForeground = registerColor('charts.foreground',
	{ dark: foreground, light: foreground, hcDark: foreground, hcLight: foreground },
	nls.localize('chartsForeground', "The foreground color used in charts."));

export const chartsLines = registerColor('charts.lines',
	{ dark: transparent(foreground, .5), light: transparent(foreground, .5), hcDark: transparent(foreground, .5), hcLight: transparent(foreground, .5) },
	nls.localize('chartsLines', "The color used for horizontal lines in charts."));

export const chartsRed = registerColor('charts.red',
	{ dark: editorErrorForeground, light: editorErrorForeground, hcDark: editorErrorForeground, hcLight: editorErrorForeground },
	nls.localize('chartsRed', "The red color used in chart visualizations."));

export const chartsBlue = registerColor('charts.blue',
	{ dark: editorInfoForeground, light: editorInfoForeground, hcDark: editorInfoForeground, hcLight: editorInfoForeground },
	nls.localize('chartsBlue', "The blue color used in chart visualizations."));

export const chartsYellow = registerColor('charts.yellow',
	{ dark: editorWarningForeground, light: editorWarningForeground, hcDark: editorWarningForeground, hcLight: editorWarningForeground },
	nls.localize('chartsYellow', "The yellow color used in chart visualizations."));

export const chartsOrange = registerColor('charts.orange',
	{ dark: minimapFindMatch, light: minimapFindMatch, hcDark: minimapFindMatch, hcLight: minimapFindMatch },
	nls.localize('chartsOrange', "The orange color used in chart visualizations."));

export const chartsGreen = registerColor('charts.green',
	{ dark: '#89D185', light: '#388A34', hcDark: '#89D185', hcLight: '#374e06' },
	nls.localize('chartsGreen', "The green color used in chart visualizations."));

export const chartsPurple = registerColor('charts.purple',
	{ dark: '#B180D7', light: '#652D90', hcDark: '#B180D7', hcLight: '#652D90' },
	nls.localize('chartsPurple', "The purple color used in chart visualizations."));
