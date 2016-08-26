/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {IThemeDocument, IThemeSetting, IThemeSettingStyle} from 'vs/workbench/services/themes/common/themeService';
import {Color} from 'vs/workbench/services/themes/common/color';
import {getBaseThemeId, getSyntaxThemeId} from 'vs/platform/theme/common/themes';

export class TokenStylesContribution {

	public contributeStyles(themeId: string, themeDocument: IThemeDocument): string[] {
		let cssRules = [];
		let editorStyles = new EditorStyles(themeId, themeDocument);
		themeDocument.settings.forEach((s: IThemeSetting, index, arr) => {
			let scope: string | string[] = s.scope;
			let settings = s.settings;
			if (scope && settings) {
				let rules = Array.isArray(scope) ? <string[]>scope : scope.split(',');
				let statements = this._settingsToStatements(settings);
				rules.forEach(rule => {
					rule = rule.trim().replace(/ /g, '.'); // until we have scope hierarchy in the editor dom: replace spaces with .

					cssRules.push(`.monaco-editor.${editorStyles.themeSelector} .token.${rule} { ${statements} }`);
				});
			}
		});
		return cssRules;
	}

	private _settingsToStatements(settings: IThemeSettingStyle): string {
		let statements: string[] = [];

		for (let settingName in settings) {
			const value = settings[settingName];
			switch (settingName) {
				case 'foreground':
					let foreground = new Color(value);
					statements.push(`color: ${foreground};`);
					break;
				case 'background':
					// do not support background color for now, see bug 18924
					//let background = new Color(value);
					//statements.push(`background-color: ${background};`);
					break;
				case 'fontStyle':
					let segments = value.split(' ');
					segments.forEach(s => {
						switch (s) {
							case 'italic':
								statements.push(`font-style: italic;`);
								break;
							case 'bold':
								statements.push(`font-weight: bold;`);
								break;
							case 'underline':
								statements.push(`text-decoration: underline;`);
								break;
						}
					});
			}
		}
		return statements.join(' ');
	}
}

export class EditorStylesContribution {

	public contributeStyles(themeId: string, themeDocument: IThemeDocument): string[] {
		let cssRules = [];
		let editorStyles = new EditorStyles(themeId, themeDocument);
		if (editorStyles.editorStyleSettings) {
			let themeSelector = editorStyles.themeSelector;
			if (editorStyles.editorStyleSettings.background) {
				let background = new Color(editorStyles.editorStyleSettings.background);
				cssRules.push(`.monaco-editor.${themeSelector} .monaco-editor-background { background-color: ${background}; }`);
				cssRules.push(`.monaco-editor.${themeSelector} .glyph-margin { background-color: ${background}; }`);
				cssRules.push(`.${themeSelector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
			}
			if (editorStyles.editorStyleSettings.foreground) {
				let foreground = new Color(editorStyles.editorStyleSettings.foreground);
				cssRules.push(`.monaco-editor.${themeSelector} .token { color: ${foreground}; }`);
			}
			if (editorStyles.editorStyleSettings.selection) {
				let selection = new Color(editorStyles.editorStyleSettings.selection);
				cssRules.push(`.monaco-editor.${themeSelector} .focused .selected-text { background-color: ${selection}; }`);
				cssRules.push(`.monaco-editor.${themeSelector} .selected-text { background-color: ${selection.transparent(0.5)}; }`);
			}
			if (editorStyles.editorStyleSettings.selectionHighlight) {
				let selection = new Color(editorStyles.editorStyleSettings.selectionHighlight);
				cssRules.push(`.monaco-editor.${themeSelector} .selectionHighlight { background-color: ${selection}; }`);
			}
			if (editorStyles.editorStyleSettings.wordHighlight) {
				let selection = new Color(editorStyles.editorStyleSettings.wordHighlight);
				cssRules.push(`.monaco-editor.${themeSelector} .wordHighlight { background-color: ${selection}; }`);
			}
			if (editorStyles.editorStyleSettings.wordHighlightStrong) {
				let selection = new Color(editorStyles.editorStyleSettings.wordHighlightStrong);
				cssRules.push(`.monaco-editor.${themeSelector} .wordHighlightStrong { background-color: ${selection}; }`);
			}
			if (editorStyles.editorStyleSettings.findLineHighlight) {
				let selection = new Color(editorStyles.editorStyleSettings.findLineHighlight);
				cssRules.push(`.monaco-editor.${themeSelector} .findLineHighlight { background-color: ${selection}; }`);
			}
			if (editorStyles.editorStyleSettings.lineHighlight) {
				let lineHighlight = new Color(editorStyles.editorStyleSettings.lineHighlight);
				cssRules.push(`.monaco-editor.${themeSelector} .current-line { background-color: ${lineHighlight}; border:0; }`);
			}
			if (editorStyles.editorStyleSettings.caret) {
				let caret = new Color(editorStyles.editorStyleSettings.caret);
				let oppositeCaret = caret.opposite();
				cssRules.push(`.monaco-editor.${themeSelector} .cursor { background-color: ${caret}; border-color: ${caret}; color: ${oppositeCaret}; }`);
			}
			if (editorStyles.editorStyleSettings.invisibles) {
				let invisibles = new Color(editorStyles.editorStyleSettings.invisibles);
				cssRules.push(`.monaco-editor.${themeSelector} .token.whitespace { color: ${invisibles} !important; }`);
			}
			if (editorStyles.editorStyleSettings.guide) {
				let guide = new Color(editorStyles.editorStyleSettings.guide);
				cssRules.push(`.monaco-editor.${themeSelector} .lines-content .cigr { background: ${guide}; }`);
			} else if (editorStyles.editorStyleSettings.invisibles) {
				let invisibles = new Color(editorStyles.editorStyleSettings.invisibles);
				cssRules.push(`.monaco-editor.${themeSelector} .lines-content .cigr { background: ${invisibles}; }`);
			}
		}
		return cssRules;
	}
}

interface EditorStyleSettings {
	background?: string;
	foreground?: string;
	fontStyle?: string;
	caret?: string;
	invisibles?: string;
	guide?: string;
	lineHighlight?: string;
	selection?: string;
	selectionHighlight?: string;
	findLineHighlight?: string;
	wordHighlight?: string;
	wordHighlightStrong?: string;
}


class EditorStyles {

	public themeSelector: string;
	public editorStyleSettings: EditorStyleSettings = null;

	constructor(themeId: string, themeDocument: IThemeDocument) {
		this.themeSelector = `${getBaseThemeId(themeId)}.${getSyntaxThemeId(themeId)}`;
		let settings = themeDocument.settings[0];
		if (!settings.scope) {
			this.editorStyleSettings = settings.settings;
		}
	}
}