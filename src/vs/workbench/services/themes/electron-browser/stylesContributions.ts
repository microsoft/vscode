/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');

import { ITokenColorizationRule, IColorMap } from 'vs/workbench/services/themes/common/themeService';
import { Color } from 'vs/base/common/color';
import { Extensions, IThemingRegistry } from 'vs/platform/theme/common/themingRegistry';
import { Registry } from 'vs/platform/platform';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';

let themingRegistry = <IThemingRegistry>Registry.as(Extensions.ThemingContribution);

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
	themingRegistry.registerColor(id, nls.localize('terminal.ansiColor', 'Color for terminal {0} color', key));
	addSettingMapping(key, id);
}


const editorBackground = 'editorBackground';
themingRegistry.registerColor(editorBackground, nls.localize('background', 'Editor background color'));
addSettingMapping('background', editorBackground);



const editorHoverHighlight = 'editorHoverHighlight';
themingRegistry.registerColor(editorHoverHighlight, nls.localize('hoverHighlight', 'Background color of the editor hover'));
addSettingMapping('hoverHighlight', editorHoverHighlight);



const editorActiveLinkForeground = 'editorActiveLinkForeground';
themingRegistry.registerColor(editorActiveLinkForeground, nls.localize('activeLinkForeground', 'Color of active links'));
addSettingMapping('hoverHighlight', editorHoverHighlight);

const editorLinkForeground = 'editorLinkForeground';
themingRegistry.registerColor(editorLinkForeground, nls.localize('linkForeground', 'Color of links'));
addSettingMapping('linkForeground', editorLinkForeground);

const editorSelection = 'editorSelection';
themingRegistry.registerColor(editorSelection, nls.localize('selection', 'Color of the editor selection'));
addSettingMapping('selection', editorSelection);

const editorInactiveSelection = 'editorInactiveSelection';
themingRegistry.registerColor(editorInactiveSelection, nls.localize('inactiveSelection', 'Color of the inactive editor selection'));
addSettingMapping('inactiveSelection', editorInactiveSelection);

const editorSelectionHighlightColor = 'editorSelectionHighlightColor';
themingRegistry.registerColor(editorSelectionHighlightColor, nls.localize('selectionHighlightColor', 'Background color of regions highlighted while selecting'));
addSettingMapping('selectionHighlightColor', editorSelectionHighlightColor);

const editorWordHighlight = 'editorWordHighlight';
themingRegistry.registerColor(editorWordHighlight, nls.localize('wordHighlight', 'Background color of a symbol during read-access, like reading a variable'));
addSettingMapping('wordHighlight', editorWordHighlight);

const editorWordHighlightString = 'editorWordHighlightStrong';
themingRegistry.registerColor(editorWordHighlightString, nls.localize('wordHighlightStrong', 'Background color of a symbol during write-access, like writing to a variable'));
addSettingMapping('wordHighlightStrong', editorWordHighlightString);

const editorFindMatchHighlight = 'editorFindMatchHighlight';
themingRegistry.registerColor(editorFindMatchHighlight, nls.localize('findMatchHighlight', 'Background color of regions matching the search'));
addSettingMapping('findMatchHighlight', editorFindMatchHighlight);

const editorCurrentFindMatchHighlight = 'editorCurrentFindMatchHighlight';
themingRegistry.registerColor(editorCurrentFindMatchHighlight, nls.localize('currentFindMatchHighlight', 'Background color of the current region matching the search'));
addSettingMapping('currentFindMatchHighlight', editorCurrentFindMatchHighlight);

const editorFindRangeHighlight = 'editorFindRangeHighlight';
themingRegistry.registerColor(editorFindRangeHighlight, nls.localize('findRangeHighlight', 'Background color of regions selected for search'));
addSettingMapping('findRangeHighlight', editorFindRangeHighlight);

const referencesFindMatchHighlight = 'referencesFindMatchHighlight';
themingRegistry.registerColor(referencesFindMatchHighlight, nls.localize('referencesFindMatchHighlight', 'References view match highlight color'));
addSettingMapping('findMatchHighlight', referencesFindMatchHighlight);

const referencesReferenceHighlight = 'referencesReferenceHighlight';
themingRegistry.registerColor(referencesReferenceHighlight, nls.localize('referencesReferenceHighlight', 'References range highlight color'));
addSettingMapping('referenceHighlight', referencesReferenceHighlight);

const editorLineHighlight = 'editorLineHighlight';
themingRegistry.registerColor(editorLineHighlight, nls.localize('lineHighlight', 'Editor line highlight color'));
addSettingMapping('lineHighlight', editorLineHighlight);

const editorRangeHighlight = 'editorRangeHighlight';
themingRegistry.registerColor(editorRangeHighlight, nls.localize('rangeHighlight', 'Background color of range highlighted, like by Quick open and Find features'));
addSettingMapping('rangeHighlight', editorRangeHighlight);

const editorCursor = 'editorCursor';
themingRegistry.registerColor(editorCursor, nls.localize('caret', 'Editor cursor color'));
addSettingMapping('caret', editorCursor);

const editorInvisibles = 'editorInvisibles';
themingRegistry.registerColor(editorInvisibles, nls.localize('invisibles', 'Editor invisibles color'));
addSettingMapping('invisibles', editorInvisibles);

const editorGuide = 'editorGuide';
themingRegistry.registerColor(editorGuide, nls.localize('guide', 'Editor guide color'));
addSettingMapping('guide', editorGuide);

function addBackgroundColorRule(theme: ITheme, selector: string, color: Color, rules: string[]): void {
	if (color) {
		rules.push(`.monaco-editor.${theme.selector} ${selector} { background-color: ${color}; }`);
	}
}

function getSelectionHighlightColor(theme: ITheme) {
	let selectionHighlight = theme.getColor(editorSelectionHighlightColor);
	if (selectionHighlight) {
		return selectionHighlight;
	}

	let selection = theme.getColor(editorSelection);
	let background = theme.getColor(editorBackground);

	if (selection && background) {
		return deriveLessProminentColor(selection, background);
	}

	return null;
}


export function registerParticipants(service: IThemeService) {

	// search viewlet

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let matchHighlightColor = theme.getColor(editorFindMatchHighlight);
		if (matchHighlightColor) {
			cssRules.push(`.${theme.selector} .search-viewlet .findInFileMatch { background-color: ${matchHighlightColor}; }`);
			cssRules.push(`.${theme.selector} .search-viewlet .highlight { background-color: ${matchHighlightColor}; }`);
		}
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		for (let key in ansiColorMap) {
			const color = theme.getColor(keyPrefix + key);
			if (color) {
				const index = ansiColorMap[key];
				const rgba = color.transparent(0.996);
				cssRules.push(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-color-${index} { color: ${color}; }`);
				cssRules.push(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-color-${index}::selection { background-color: ${rgba}; }`);
				cssRules.push(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-bg-color-${index} { background-color: ${color}; }`);
				cssRules.push(`.${theme.selector} .panel.integrated-terminal .xterm .xterm-bg-color-${index}::selection { color: ${color}; }`);
			};
		}
	});


	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let background = theme.getColor(editorBackground);
		if (background) {
			addBackgroundColorRule(theme, '.monaco-editor-background', background, cssRules);
			addBackgroundColorRule(theme, '.glyph-margin', background, cssRules);
			cssRules.push(`.${theme.selector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
		}
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		addBackgroundColorRule(theme, '.hoverHighlight', theme.getColor(editorHoverHighlight), cssRules);
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let activeLinkForeground = theme.getColor(editorActiveLinkForeground);
		if (activeLinkForeground) {
			cssRules.push(`.monaco-editor.${theme.selector} .detected-link-active { color: ${activeLinkForeground} !important; }`);
			cssRules.push(`.monaco-editor.${theme.selector} .goto-definition-link { color: ${activeLinkForeground} !important; }`);
		}
		let linkForeground = theme.getColor(editorLinkForeground);
		if (linkForeground) {
			cssRules.push(`.monaco-editor.${theme.selector} .detected-link { color: ${linkForeground} !important; }`);
		}
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let selection = theme.getColor(editorSelection);
		if (selection) {
			addBackgroundColorRule(theme, '.focused .selected-text', selection, cssRules);
		}

		let inactiveSelection = theme.getColor(editorInactiveSelection);
		if (inactiveSelection) {
			addBackgroundColorRule(theme, '.selected-text', inactiveSelection, cssRules);
		} else if (selection) {
			addBackgroundColorRule(theme, '.selected-text', selection.transparent(0.5), cssRules);
		}

		let selectionHighlightColor = getSelectionHighlightColor(theme);
		if (selectionHighlightColor) {
			addBackgroundColorRule(theme, '.focused .selectionHighlight', selectionHighlightColor, cssRules);
			addBackgroundColorRule(theme, '.selectionHighlight', selectionHighlightColor.transparent(0.5), cssRules);
		}
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		addBackgroundColorRule(theme, '.wordHighlight', theme.getColor(editorWordHighlight), cssRules);
		addBackgroundColorRule(theme, '.wordHighlightStrong', theme.getColor(editorWordHighlightString), cssRules);
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		addBackgroundColorRule(theme, '.findMatch', theme.getColor(editorFindMatchHighlight), cssRules);
		addBackgroundColorRule(theme, '.currentFindMatch', theme.getColor(editorCurrentFindMatchHighlight), cssRules);
		addBackgroundColorRule(theme, '.findScope', theme.getColor(editorFindRangeHighlight), cssRules);
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		addBackgroundColorRule(theme, '.reference-zone-widget .ref-tree .referenceMatch', theme.getColor(referencesFindMatchHighlight), cssRules);
		addBackgroundColorRule(theme, '.reference-zone-widget .preview .reference-decoration', theme.getColor(referencesReferenceHighlight), cssRules);
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let lineHighlight = theme.getColor(editorLineHighlight);
		if (lineHighlight) {
			cssRules.push(`.monaco-editor.${theme.selector} .view-overlays .current-line { background-color: ${lineHighlight}; border: none; }`);
			cssRules.push(`.monaco-editor.${theme.selector} .margin-view-overlays .current-line-margin { background-color: ${lineHighlight}; border: none; }`);
		}
		addBackgroundColorRule(theme, '.rangeHighlight', theme.getColor(editorRangeHighlight), cssRules);
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let caret = theme.getColor(editorCursor);
		if (caret) {
			let oppositeCaret = caret.opposite();
			cssRules.push(`.monaco-editor.${theme.selector} .cursor { background-color: ${caret}; border-color: ${caret}; color: ${oppositeCaret}; }`);
		}
	});

	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let invisibles = theme.getColor(editorInvisibles);
		if (invisibles) {
			cssRules.push(`.vs-whitespace { color: ${invisibles} !important; }`);
		}
	});


	service.registerThemingParticipant((theme: ITheme, cssRules: string[]) => {
		let color = theme.getColor(editorGuide);
		if (!color) {
			color = theme.getColor(editorInvisibles);
		}
		if (color !== null) {
			cssRules.push(`.monaco-editor.${theme.selector} .lines-content .cigr { background: ${color}; }`);
		}
	});
}



function deriveLessProminentColor(from: Color, backgroundColor: Color): Color {
	let contrast = from.getContrast(backgroundColor);
	if (contrast < 1.7 || contrast > 4.5) {
		return null;
	}
	if (from.isDarkerThan(backgroundColor)) {
		return Color.getLighterColor(from, backgroundColor, 0.4);
	}
	return Color.getDarkerColor(from, backgroundColor, 0.4);
}