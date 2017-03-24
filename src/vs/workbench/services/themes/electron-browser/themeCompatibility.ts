/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITokenColorizationRule, IColorMap } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { Color } from 'vs/base/common/color';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';

import * as editorColorRegistry from 'vs/editor/common/view/editorColorRegistry';
import * as wordHighlighter from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import { ansiColorIdentifiers } from 'vs/workbench/parts/terminal/electron-browser/terminalColorRegistry';
import { editorHoverHighlight } from 'vs/editor/contrib/hover/browser/hover';
import { editorPeekReferenceHighlight, editorPeekFindMatchHighlight } from 'vs/editor/contrib/referenceSearch/browser/referencesWidget';

const settingToColorIdMapping: { [settingId: string]: string[] } = {};
function addSettingMapping(settingId: string, colorId: string) {
	let colorIds = settingToColorIdMapping[settingId];
	if (!colorIds) {
		settingToColorIdMapping[settingId] = colorIds = [];
	}
	colorIds.push(colorId);
}

export function convertSettings(oldSettings: ITokenColorizationRule[], resultRules: ITokenColorizationRule[], resultColors: IColorMap): void {
	for (let rule of oldSettings) {
		resultRules.push(rule);
		if (!rule.scope) {
			let settings = rule.settings;
			if (!settings) {
				rule.settings = {};
			} else {
				for (let key in settings) {
					let mappings = settingToColorIdMapping[key];
					if (mappings) {
						let color = Color.fromHex(settings[key]);
						for (let colorId of mappings) {
							resultColors[colorId] = color;
						}
					}
					if (key !== 'foreground' && key !== 'background') {
						delete settings[key];
					}
				}
			}
		}
	}
}

addSettingMapping('background', colorRegistry.editorBackground);
addSettingMapping('selection', colorRegistry.editorSelection);
addSettingMapping('inactiveSelection', colorRegistry.editorInactiveSelection);
addSettingMapping('selectionHighlightColor', colorRegistry.editorSelectionHighlightColor);
addSettingMapping('findMatchHighlight', colorRegistry.editorFindMatchHighlight);
addSettingMapping('currentFindMatchHighlight', colorRegistry.editorCurrentFindMatchHighlight);
addSettingMapping('hoverHighlight', editorHoverHighlight);
addSettingMapping('hoverHighlight', editorHoverHighlight);
addSettingMapping('linkForeground', colorRegistry.editorLinkForeground);
addSettingMapping('wordHighlight', wordHighlighter.editorWordHighlight);
addSettingMapping('wordHighlightStrong', wordHighlighter.editorWordHighlightStrong);
addSettingMapping('findRangeHighlight', colorRegistry.editorFindRangeHighlight);
addSettingMapping('findMatchHighlight', editorPeekFindMatchHighlight);
addSettingMapping('referenceHighlight', editorPeekReferenceHighlight);
addSettingMapping('lineHighlight', editorColorRegistry.editorLineHighlight);
addSettingMapping('rangeHighlight', editorColorRegistry.editorRangeHighlight);
addSettingMapping('caret', editorColorRegistry.editorCursor);
addSettingMapping('invisibles', editorColorRegistry.editorInvisibles);
addSettingMapping('guide', editorColorRegistry.editorGuide);

const ansiColorMap = ['ansiBlack', 'ansiRed', 'ansiGreen', 'ansiYellow', 'ansiBlue', 'ansiMagenta', 'ansiCyan', 'ansiWhite',
	'ansiBrightBlack', 'ansiBrightRed', 'ansiBrightGreen', 'ansiBrightYellow', 'ansiBrightBlue', 'ansiBrightMagenta', 'ansiBrightCyan', 'ansiBrightWhite'
];

for (let i = 0; i < ansiColorIdentifiers.length; i++) {
	addSettingMapping(ansiColorMap[i], ansiColorIdentifiers[i]);
}


