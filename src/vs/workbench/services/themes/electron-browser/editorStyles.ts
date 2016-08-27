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

					cssRules.push(`.monaco-editor.${editorStyles.getThemeSelector()} .token.${rule} { ${statements} }`);
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
		let editorStyleRules = [
			new EditorBackgroundStyleRule(),
			new EditorForegroundStyleRule(),
			new EditorSelectionStyleRule(),
			new EditorSelectionHighlightStyleRule(),
			new EditorWordHighlightStyleRule(),
			new EditorWordHighlightStrongStyleRule(),
			new EditorFindLineHighlightStyleRule(),
			new EditorCurrentLineHighlightStyleRule(),
			new EditorCursorStyleRule(),
			new EditorWhiteSpaceStyleRule(),
			new EditorIndentGuidesStyleRule()
		];
		let editorStyles = new EditorStyles(themeId, themeDocument);
		if (editorStyles.hasEditorStyleSettings()) {
			editorStyleRules.forEach((editorStyleRule => {
				cssRules = cssRules.concat(editorStyleRule.getCssRules(editorStyles));
			}));
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

	private themeSelector: string;
	private editorStyleSettings: EditorStyleSettings = null;

	constructor(themeId: string, themeDocument: IThemeDocument) {
		this.themeSelector = `${getBaseThemeId(themeId)}.${getSyntaxThemeId(themeId)}`;
		let settings = themeDocument.settings[0];
		if (!settings.scope) {
			this.editorStyleSettings = settings.settings;
		}
	}

	public getThemeSelector(): string {
		return this.themeSelector;
	}

	public hasEditorStyleSettings(): boolean {
		return !!this.editorStyleSettings;
	}

	public getEditorStyleSettings(): EditorStyleSettings {
		return this.editorStyleSettings;
	}
}

abstract class EditorStyleRule {
	public abstract getCssRules(editorStyles: EditorStyles): string[];
}

class EditorBackgroundStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().background) {
			let background = new Color(editorStyles.getEditorStyleSettings().background);
			cssRules.push(`.monaco-editor.${themeSelector} .monaco-editor-background { background-color: ${background}; }`);
			cssRules.push(`.monaco-editor.${themeSelector} .glyph-margin { background-color: ${background}; }`);
			cssRules.push(`.${themeSelector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
		}
		return cssRules;
	}
}

class EditorForegroundStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().foreground) {
			let foreground = new Color(editorStyles.getEditorStyleSettings().foreground);
			cssRules.push(`.monaco-editor.${themeSelector} .token { color: ${foreground}; }`);
		}
		return cssRules;
	}
}

class EditorSelectionStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().selection) {
			let selection = new Color(editorStyles.getEditorStyleSettings().selection);
			cssRules.push(`.monaco-editor.${themeSelector} .focused .selected-text { background-color: ${selection}; }`);
			cssRules.push(`.monaco-editor.${themeSelector} .selected-text { background-color: ${selection.transparent(0.5)}; }`);
		}
		return cssRules;
	}
}

class EditorSelectionHighlightStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().selectionHighlight) {
			let selection = new Color(editorStyles.getEditorStyleSettings().selectionHighlight);
			cssRules.push(`.monaco-editor.${themeSelector} .selectionHighlight { background-color: ${selection}; }`);
		}
		return cssRules;
	}
}

class EditorWordHighlightStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().wordHighlight) {
			let selection = new Color(editorStyles.getEditorStyleSettings().wordHighlight);
			cssRules.push(`.monaco-editor.${themeSelector} .wordHighlight { background-color: ${selection}; }`);
		}
		return cssRules;
	}
}

class EditorWordHighlightStrongStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().wordHighlightStrong) {
			let selection = new Color(editorStyles.getEditorStyleSettings().wordHighlightStrong);
			cssRules.push(`.monaco-editor.${themeSelector} .wordHighlightStrong { background-color: ${selection}; }`);
		}
		return cssRules;
	}
}

class EditorFindLineHighlightStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().findLineHighlight) {
			let selection = new Color(editorStyles.getEditorStyleSettings().findLineHighlight);
			cssRules.push(`.monaco-editor.${themeSelector} .findLineHighlight { background-color: ${selection}; }`);
		}
		return cssRules;
	}
}

class EditorCurrentLineHighlightStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().lineHighlight) {
			let lineHighlight = new Color(editorStyles.getEditorStyleSettings().lineHighlight);
			cssRules.push(`.monaco-editor.${themeSelector} .current-line { background-color: ${lineHighlight}; border:0; }`);
		}
		return cssRules;
	}
}

class EditorCursorStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().caret) {
			let caret = new Color(editorStyles.getEditorStyleSettings().caret);
			let oppositeCaret = caret.opposite();
			cssRules.push(`.monaco-editor.${themeSelector} .cursor { background-color: ${caret}; border-color: ${caret}; color: ${oppositeCaret}; }`);
		}
		return cssRules;
	}
}

class EditorWhiteSpaceStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().invisibles) {
			let invisibles = new Color(editorStyles.getEditorStyleSettings().invisibles);
			cssRules.push(`.monaco-editor.${themeSelector} .token.whitespace { color: ${invisibles} !important; }`);
		}
		return cssRules;
	}
}

class EditorIndentGuidesStyleRule extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		let color = this.getColor(editorStyles.getEditorStyleSettings());
		if (color !== null) {
			cssRules.push(`.monaco-editor.${themeSelector} .lines-content .cigr { background: ${color}; }`);
		}
		return cssRules;
	}

	private getColor(editorStyleSettings: EditorStyleSettings): Color {
		if (editorStyleSettings.guide) {
			return new Color(editorStyleSettings.guide);
		}
		if (editorStyleSettings.invisibles) {
			return new Color(editorStyleSettings.invisibles);
		}
		return null;
	}
}