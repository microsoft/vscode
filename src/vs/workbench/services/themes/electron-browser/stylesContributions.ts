/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {IThemeDocument, IThemeSetting, IThemeSettingStyle} from 'vs/workbench/services/themes/common/themeService';
import {Color} from 'vs/base/common/color';
import {getBaseThemeId, getSyntaxThemeId, isLightTheme, isDarkTheme} from 'vs/platform/theme/common/themes';

interface ThemeGlobalSettings {
	background?: string;
	foreground?: string;
	fontStyle?: string;
	caret?: string;
	invisibles?: string;
	guide?: string;

	lineHighlight?: string;
	rangeHighlight?: string;

	hoverHighlight?: string;

	selection?: string;
	inactiveSelection?: string;
	selectionHighlight?: string;

	findRangeHighlight?: string;
	findMatchHighlight?: string;
	currentFindMatchHighlight?: string;

	wordHighlight?: string;
	wordHighlightStrong?: string;

	referenceHighlight?: string;

	activeLinkForeground?: string;
	gotoDefinitionLinkForeground?: string;
}

class Theme {

	private selector: string;
	private settings: IThemeSetting[];
	private globalSettings: ThemeGlobalSettings = null;

	constructor(private themeId: string, themeDocument: IThemeDocument) {
		this.selector = `${getBaseThemeId(themeId)}.${getSyntaxThemeId(themeId)}`;
		this.settings = themeDocument.settings;
		let settings = this.settings[0];
		if (!settings.scope) {
			this.globalSettings = settings.settings;
		}
	}

	public getSelector(): string {
		return this.selector;
	}

	public hasGlobalSettings(): boolean {
		return !!this.globalSettings;
	}

	public getGlobalSettings(): ThemeGlobalSettings {
		return this.globalSettings;
	}

	public getSettings(): IThemeSetting[] {
		return this.settings;
	}

	public isDarkTheme(): boolean {
		return isDarkTheme(this.themeId);
	}

	public isLightTheme(): boolean {
		return isLightTheme(this.themeId);
	}
}

abstract class StyleRules {
	public abstract getCssRules(theme: Theme): string[];
}

export class TokenStylesContribution {

	public contributeStyles(themeId: string, themeDocument: IThemeDocument): string[] {
		let cssRules = [];
		let theme = new Theme(themeId, themeDocument);
		theme.getSettings().forEach((s: IThemeSetting, index, arr) => {
			let scope: string | string[] = s.scope;
			let settings = s.settings;
			if (scope && settings) {
				let rules = Array.isArray(scope) ? <string[]>scope : scope.split(',');
				let statements = this._settingsToStatements(settings);
				rules.forEach(rule => {
					rule = rule.trim().replace(/ /g, '.'); // until we have scope hierarchy in the editor dom: replace spaces with .

					cssRules.push(`.monaco-editor.${theme.getSelector()} .token.${rule} { ${statements} }`);
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
			new EditorFindStyleRules(),
			new EditorReferenceSearchStyleRules(),
			new EditorHoverHighlightStyleRules(),
			new EditorLinkStyleRules()
		];
		let theme = new Theme(themeId, themeDocument);
		if (theme.hasGlobalSettings()) {
			editorStyleRules.forEach((editorStyleRule => {
				cssRules = cssRules.concat(editorStyleRule.getCssRules(theme));
			}));
		}
		return cssRules;
	}
}

export class SearchViewStylesContribution {

	public contributeStyles(themeId: string, themeDocument: IThemeDocument): string[] {
		let cssRules = [];
		let theme = new Theme(themeId, themeDocument);
		if (theme.hasGlobalSettings()) {
			if (theme.getGlobalSettings().findMatchHighlight) {
				let color = new Color(theme.getGlobalSettings().findMatchHighlight);
				cssRules.push(`.${theme.getSelector()} .search-viewlet .findInFileMatch { background-color: ${color}; }`);
				cssRules.push(`.${theme.getSelector()} .search-viewlet .highlight { background-color: ${color}; }`);
			}
		}
		return cssRules;
	}
}

abstract class EditorStyleRules extends StyleRules {

	protected addBackgroundColorRule(theme: Theme, selector: string, color: string | Color, rules: string[]): void {
		if (color) {
			color = color instanceof Color ? color : new Color(color);
			rules.push(`.monaco-editor.${theme.getSelector()} ${selector} { background-color: ${color}; }`);
		}
	}

}

class EditorBackgroundStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		let themeSelector = theme.getSelector();
		if (theme.getGlobalSettings().background) {
			let background = new Color(theme.getGlobalSettings().background);
			this.addBackgroundColorRule(theme, '.monaco-editor-background', background, cssRules);
			this.addBackgroundColorRule(theme, '.glyph-margin', background, cssRules);
			cssRules.push(`.${themeSelector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
		}
		return cssRules;
	}
}

class EditorForegroundStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		let themeSelector = theme.getSelector();
		if (theme.getGlobalSettings().foreground) {
			let foreground = new Color(theme.getGlobalSettings().foreground);
			cssRules.push(`.monaco-editor.${themeSelector} .token { color: ${foreground}; }`);
		}
		return cssRules;
	}
}

class EditorHoverHighlightStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		this.addBackgroundColorRule(theme, '.hoverHighlight', theme.getGlobalSettings().hoverHighlight, cssRules);
		return cssRules;
	}
}

class EditorLinkStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		if (theme.getGlobalSettings().activeLinkForeground) {
			cssRules.push(`.monaco-editor.${theme.getSelector()} .detected-link-active { color: ${new Color(theme.getGlobalSettings().activeLinkForeground)} !important; }`);
		}
		if (theme.getGlobalSettings().gotoDefinitionLinkForeground) {
			cssRules.push(`.monaco-editor.${theme.getSelector()} .goto-definition-link { color: ${new Color(theme.getGlobalSettings().gotoDefinitionLinkForeground)} !important; }`);
		}
		return cssRules;
	}
}

class EditorSelectionStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		if (theme.getGlobalSettings().selection) {
			this.addBackgroundColorRule(theme, '.focused .selected-text', theme.getGlobalSettings().selection, cssRules);
		}

		if (theme.getGlobalSettings().inactiveSelection) {
			this.addBackgroundColorRule(theme, '.selected-text', theme.getGlobalSettings().inactiveSelection, cssRules);
		} else if (theme.getGlobalSettings().selection) {
			let selection = new Color(theme.getGlobalSettings().selection);
			this.addBackgroundColorRule(theme, '.selected-text', selection.transparent(0.5), cssRules);
		}

		let selectionHighlightColor = this.getSelectionHighlightColor(theme);
		if (selectionHighlightColor) {
			this.addBackgroundColorRule(theme, '.focused .selectionHighlight', selectionHighlightColor, cssRules);
			this.addBackgroundColorRule(theme, '.selectionHighlight', selectionHighlightColor.transparent(0.5), cssRules);
		}

		return cssRules;
	}

	private getSelectionHighlightColor(theme: Theme) {
		if (theme.getGlobalSettings().selectionHighlight) {
			return new Color(theme.getGlobalSettings().selectionHighlight);
		}

		if (theme.getGlobalSettings().selection && theme.getGlobalSettings().background) {
			let selection = new Color(theme.getGlobalSettings().selection);
			let background = new Color(theme.getGlobalSettings().background);
			return deriveLessProminentColor(selection, background);
		}

		return null;
	}
}

class EditorWordHighlightStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		this.addBackgroundColorRule(theme, '.wordHighlight', theme.getGlobalSettings().wordHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.wordHighlightStrong', theme.getGlobalSettings().wordHighlightStrong, cssRules);
		return cssRules;
	}
}

class EditorFindStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		this.addBackgroundColorRule(theme, '.findMatch', theme.getGlobalSettings().findMatchHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.currentFindMatch', theme.getGlobalSettings().currentFindMatchHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.findScope', theme.getGlobalSettings().findRangeHighlight, cssRules);
		return cssRules;
	}
}

class EditorReferenceSearchStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		this.addBackgroundColorRule(theme, '.reference-zone-widget .ref-tree .referenceMatch', theme.getGlobalSettings().findMatchHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.reference-zone-widget .preview .reference-decoration', theme.getGlobalSettings().referenceHighlight, cssRules);
		return cssRules;
	}
}

class EditorLineHighlightStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		if (theme.getGlobalSettings().lineHighlight) {
			cssRules.push(`.monaco-editor.${theme.getSelector()} .current-line { background-color: ${new Color(theme.getGlobalSettings().lineHighlight)}; border: none; }`);
		}
		this.addBackgroundColorRule(theme, '.rangeHighlight', theme.getGlobalSettings().rangeHighlight, cssRules);
		return cssRules;
	}
}

class EditorCursorStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		let themeSelector = theme.getSelector();
		if (theme.getGlobalSettings().caret) {
			let caret = new Color(theme.getGlobalSettings().caret);
			let oppositeCaret = caret.opposite();
			cssRules.push(`.monaco-editor.${themeSelector} .cursor { background-color: ${caret}; border-color: ${caret}; color: ${oppositeCaret}; }`);
		}
		return cssRules;
	}
}

class EditorWhiteSpaceStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		let themeSelector = theme.getSelector();
		if (theme.getGlobalSettings().invisibles) {
			let invisibles = new Color(theme.getGlobalSettings().invisibles);
			cssRules.push(`.monaco-editor.${themeSelector} .token.whitespace { color: ${invisibles} !important; }`);
		}
		return cssRules;
	}
}

class EditorIndentGuidesStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme): string[] {
		let cssRules = [];
		let themeSelector = theme.getSelector();
		let color = this.getColor(theme.getGlobalSettings());
		if (color !== null) {
			cssRules.push(`.monaco-editor.${themeSelector} .lines-content .cigr { background: ${color}; }`);
		}
		return cssRules;
	}

	private getColor(theme: ThemeGlobalSettings): Color {
		if (theme.guide) {
			return new Color(theme.guide);
		}
		if (theme.invisibles) {
			return new Color(theme.invisibles);
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