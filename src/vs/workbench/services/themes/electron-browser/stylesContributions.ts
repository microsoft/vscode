/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');

import { ITokenColorizationRule, IColorMap } from 'vs/workbench/services/themes/common/themeService';
import { Color } from 'vs/base/common/color';
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { ITheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';

import * as editorColorRegistry from 'vs/editor/common/view/editorColorRegistry';
import * as wordHighlighter from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';


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

addSettingMapping('background', colorRegistry.editorBackground);
addSettingMapping('selection', colorRegistry.editorSelection);
addSettingMapping('inactiveSelection', colorRegistry.editorInactiveSelection);
addSettingMapping('selectionHighlightColor', colorRegistry.editorSelectionHighlightColor);
addSettingMapping('findMatchHighlight', colorRegistry.editorFindMatchHighlight);
addSettingMapping('currentFindMatchHighlight', colorRegistry.editorCurrentFindMatchHighlight);
addSettingMapping('hoverHighlight', editorColorRegistry.editorHoverHighlight);
addSettingMapping('hoverHighlight', editorColorRegistry.editorHoverHighlight);
addSettingMapping('linkForeground', editorColorRegistry.editorLinkForeground);
addSettingMapping('wordHighlight', wordHighlighter.editorWordHighlight);
addSettingMapping('wordHighlightStrong', wordHighlighter.editorWordHighlightString);
addSettingMapping('findRangeHighlight', colorRegistry.editorFindRangeHighlight);
addSettingMapping('findMatchHighlight', editorColorRegistry.referencesFindMatchHighlight);
addSettingMapping('referenceHighlight', editorColorRegistry.referencesReferenceHighlight);
addSettingMapping('lineHighlight', editorColorRegistry.editorLineHighlight);
addSettingMapping('rangeHighlight', editorColorRegistry.editorRangeHighlight);
addSettingMapping('caret', editorColorRegistry.editorCursor);
addSettingMapping('invisibles', editorColorRegistry.editorInvisibles);
addSettingMapping('guide', editorColorRegistry.editorGuide);


const ansiColorMap = {
	ansiBlack: 0,
	ansiRed: 1,
	ansiGreen: 2,
	ansiYellow: 3,
	ansiBlue: 4,
	ansiMagenta: 5,
	ansiCyan: 6,
	ansiWhite: 7,
	ansiBrightBlack: 8,
	ansiBrightRed: 9,
	ansiBrightGreen: 10,
	ansiBrightYellow: 11,
	ansiBrightBlue: 12,
	ansiBrightMagenta: 13,
	ansiBrightCyan: 14,
	ansiBrightWhite: 15
};
const keyPrefix = 'terminal';

for (let key in ansiColorMap) {
	let id = keyPrefix + key[0].toUpperCase() + key.substr(1);
	colorRegistry.registerColor(id, null, nls.localize('terminal.ansiColor', 'Color for terminal {0} color', key));
	addSettingMapping(key, id);
}

function updateTerminalStyles(theme: ITheme, collector: ICssStyleCollector) {
	for (let key in ansiColorMap) {
		const color = theme.getColor(keyPrefix + key);
		if (color) {
			const index = ansiColorMap[key];
			const rgba = color.transparent(0.996);
			collector.addRule(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-color-${index} { color: ${color}; }`);
			collector.addRule(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-color-${index}::selection { background-color: ${rgba}; }`);
			collector.addRule(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-bg-color-${index} { background-color: ${color}; }`);
			collector.addRule(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-bg-color-${index}::selection { color: ${color}; }`);
		};
	}
}

registerThemingParticipant(updateTerminalStyles);


