/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {IThemeDocument, IThemeSetting, IThemeSettingStyle} from 'vs/workbench/services/themes/common/themeService';
import {Color} from 'vs/base/common/color';
import {getBaseThemeId, getSyntaxThemeId, isLightTheme, isDarkTheme} from 'vs/platform/theme/common/themes';

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
			new EditorBackgroundStyleRules(),
			new EditorForegroundStyleRules(),
			new EditorCursorStyleRules(),
			new EditorWhiteSpaceStyleRules(),
			new EditorIndentGuidesStyleRules(),
			new EditorLineHighlightStyleRules(),
			new EditorSelectionStyleRules(),
			new EditorWordHighlightStyleRules(),
			new EditorFindStyleRules()
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
	rangeHighlight?: string;

	selection?: string;
	selectionHighlight?: string;

	findMatch?: string;
	currentFindMatch?: string;

	wordHighlight?: string;
	wordHighlightStrong?: string;
}

class EditorStyles {

	private themeSelector: string;
	private editorStyleSettings: EditorStyleSettings = null;

	constructor(private themeId: string, themeDocument: IThemeDocument) {
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

	public isDarkTheme(): boolean {
		return isDarkTheme(this.themeId);
	}

	public isLightTheme(): boolean {
		return isLightTheme(this.themeId);
	}
}

abstract class EditorStyleRule {

	protected addBackgroundColorRule(editorStyles: EditorStyles, selector: string, color: string | Color, rules: string[]): void {
		if (color) {
			color = color instanceof Color ? color : new Color(color);
			rules.push(`.monaco-editor.${editorStyles.getThemeSelector()} ${selector} { background-color: ${color}; }`);
		}
	}

	public abstract getCssRules(editorStyles: EditorStyles): string[];
}

class EditorBackgroundStyleRules extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		let themeSelector = editorStyles.getThemeSelector();
		if (editorStyles.getEditorStyleSettings().background) {
			let background = new Color(editorStyles.getEditorStyleSettings().background);
			this.addBackgroundColorRule(editorStyles, '.monaco-editor-background', background, cssRules);
			this.addBackgroundColorRule(editorStyles, '.glyph-margin', background, cssRules);
			cssRules.push(`.${themeSelector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
		}
		return cssRules;
	}
}

class EditorForegroundStyleRules extends EditorStyleRule {
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

class EditorSelectionStyleRules extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		if (editorStyles.getEditorStyleSettings().selection) {
			let selection = new Color(editorStyles.getEditorStyleSettings().selection);
			this.addBackgroundColorRule(editorStyles, '.focused .selected-text', selection, cssRules);
			this.addBackgroundColorRule(editorStyles, '.selected-text', selection.transparent(0.5), cssRules);
		}

		let selectionHighlightColor = this.getSelectionHighlightColor(editorStyles);
		if (selectionHighlightColor) {
			this.addBackgroundColorRule(editorStyles, '.focused .selectionHighlight', selectionHighlightColor, cssRules);
			this.addBackgroundColorRule(editorStyles, '.selectionHighlight', selectionHighlightColor.transparent(0.5), cssRules);
		}
		return cssRules;
	}

	private getSelectionHighlightColor(editorStyles: EditorStyles) {
		if (editorStyles.getEditorStyleSettings().selectionHighlight) {
			return new Color(editorStyles.getEditorStyleSettings().selectionHighlight);
		}

		if (editorStyles.getEditorStyleSettings().selection && editorStyles.getEditorStyleSettings().background) {
			let selection = new Color(editorStyles.getEditorStyleSettings().selection);
			let background = new Color(editorStyles.getEditorStyleSettings().background);
			return deriveLessProminentColor(selection, background);
		}

		return null;
	}
}

class EditorWordHighlightStyleRules extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		this.addBackgroundColorRule(editorStyles, '.wordHighlight', editorStyles.getEditorStyleSettings().wordHighlight, cssRules);
		this.addBackgroundColorRule(editorStyles, '.wordHighlightStrong', editorStyles.getEditorStyleSettings().wordHighlightStrong, cssRules);
		return cssRules;
	}
}

class EditorFindStyleRules extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		this.addBackgroundColorRule(editorStyles, '.findMatch', editorStyles.getEditorStyleSettings().findMatch, cssRules);
		this.addBackgroundColorRule(editorStyles, '.currentFindMatch', editorStyles.getEditorStyleSettings().currentFindMatch, cssRules);
		return cssRules;
	}
}

class EditorLineHighlightStyleRules extends EditorStyleRule {
	public getCssRules(editorStyles: EditorStyles): string[] {
		let cssRules = [];
		if (editorStyles.getEditorStyleSettings().lineHighlight) {
			cssRules.push(`.monaco-editor.${editorStyles.getThemeSelector()} .current-line { background-color: ${new Color(editorStyles.getEditorStyleSettings().lineHighlight)}; border: none; }`);
		}
		this.addBackgroundColorRule(editorStyles, '.rangeHighlight', editorStyles.getEditorStyleSettings().rangeHighlight, cssRules);
		return cssRules;
	}
}

class EditorCursorStyleRules extends EditorStyleRule {
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

class EditorWhiteSpaceStyleRules extends EditorStyleRule {
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

class EditorIndentGuidesStyleRules extends EditorStyleRule {
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