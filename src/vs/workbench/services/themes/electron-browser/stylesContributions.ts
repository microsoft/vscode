/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IThemeSetting } from 'vs/workbench/services/themes/common/themeService';
import { Color } from 'vs/base/common/color';
import { getBaseThemeId, getSyntaxThemeId } from 'vs/platform/theme/common/themes';

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

	linkForeground?: string;
	activeLinkForeground?: string;

	ansiBlack?: string;
	ansiRed?: string;
	ansiGreen?: string;
	ansiYellow?: string;
	ansiBlue?: string;
	ansiMagenta?: string;
	ansiCyan?: string;
	ansiWhite?: string;
	ansiBrightBlack?: string;
	ansiBrightRed?: string;
	ansiBrightGreen?: string;
	ansiBrightYellow?: string;
	ansiBrightBlue?: string;
	ansiBrightMagenta?: string;
	ansiBrightCyan?: string;
	ansiBrightWhite?: string;
}

class Theme {

	private selector: string;
	private settings: IThemeSetting[];
	private globalSettings: ThemeGlobalSettings = null;

	constructor(private themeId: string, themeSettings: IThemeSetting[]) {
		this.selector = `${getBaseThemeId(themeId)}.${getSyntaxThemeId(themeId)}`;
		this.settings = themeSettings;
		let globalSettings = this.settings.filter(s => !s.scope);
		if (globalSettings.length > 0) {
			this.globalSettings = globalSettings[0].settings;
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

}

abstract class StyleRules {
	public abstract getCssRules(theme: Theme, cssRules: string[]): void;
}

export class EditorStylesContribution {

	public contributeStyles(themeId: string, themeSettings: IThemeSetting[], cssRules: string[]) {
		let editorStyleRules = [
			new EditorBackgroundStyleRules(),
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
		let theme = new Theme(themeId, themeSettings);
		if (theme.hasGlobalSettings()) {
			editorStyleRules.forEach((editorStyleRule => {
				editorStyleRule.getCssRules(theme, cssRules);
			}));
		}
	}
}

export class SearchViewStylesContribution {

	public contributeStyles(themeId: string, themeSettings: IThemeSetting[], cssRules: string[]): void {
		let theme = new Theme(themeId, themeSettings);
		if (theme.hasGlobalSettings()) {
			if (theme.getGlobalSettings().findMatchHighlight) {
				let color = new Color(theme.getGlobalSettings().findMatchHighlight);
				cssRules.push(`.${theme.getSelector()} .search-viewlet .findInFileMatch { background-color: ${color}; }`);
				cssRules.push(`.${theme.getSelector()} .search-viewlet .highlight { background-color: ${color}; }`);
			}
		}
	}
}

export class TerminalStylesContribution {

	private static ansiColorMap = {
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

	/**
	 * Converts a CSS hex color (#rrggbb) to a CSS rgba color (rgba(r, g, b, a)).
	 */
	private _convertHexCssColorToRgba(hex: string, alpha: number): string {
		const r = parseInt(hex.substr(1, 2), 16);
		const g = parseInt(hex.substr(3, 2), 16);
		const b = parseInt(hex.substr(5, 2), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	public contributeStyles(themeId: string, themeSettings: IThemeSetting[], cssRules: string[]): void {
		const theme = new Theme(themeId, themeSettings);
		if (theme.hasGlobalSettings()) {
			const keys = Object.keys(theme.getGlobalSettings());
			keys.filter(key => key.indexOf('ansi') === 0).forEach(key => {
				if (key in TerminalStylesContribution.ansiColorMap) {
					const color = theme.getGlobalSettings()[key];
					const index = TerminalStylesContribution.ansiColorMap[key];
					const rgba = this._convertHexCssColorToRgba(color, 0.996);
					cssRules.push(`.${theme.getSelector()} .panel.integrated-terminal .xterm .xterm-color-${index} { color: ${color}; }`);
					cssRules.push(`.${theme.getSelector()} .panel.integrated-terminal .xterm .xterm-color-${index}::selection { background-color: ${rgba}; }`);
					cssRules.push(`.${theme.getSelector()} .panel.integrated-terminal .xterm .xterm-bg-color-${index} { background-color: ${color}; }`);
					cssRules.push(`.${theme.getSelector()} .panel.integrated-terminal .xterm .xterm-bg-color-${index}::selection { color: ${color}; }`);
				}
			});
		}
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
	public getCssRules(theme: Theme, cssRules: string[]): void {
		let themeSelector = theme.getSelector();
		if (theme.getGlobalSettings().background) {
			let background = new Color(theme.getGlobalSettings().background);
			this.addBackgroundColorRule(theme, '.monaco-editor-background', background, cssRules);
			this.addBackgroundColorRule(theme, '.glyph-margin', background, cssRules);
			cssRules.push(`.${themeSelector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
		}
	}
}

class EditorHoverHighlightStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		this.addBackgroundColorRule(theme, '.hoverHighlight', theme.getGlobalSettings().hoverHighlight, cssRules);
	}
}

class EditorLinkStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		if (theme.getGlobalSettings().activeLinkForeground) {
			cssRules.push(`.monaco-editor.${theme.getSelector()} .detected-link-active { color: ${new Color(theme.getGlobalSettings().activeLinkForeground)} !important; }`);
			cssRules.push(`.monaco-editor.${theme.getSelector()} .goto-definition-link { color: ${new Color(theme.getGlobalSettings().activeLinkForeground)} !important; }`);
		}
		if (theme.getGlobalSettings().linkForeground) {
			cssRules.push(`.monaco-editor.${theme.getSelector()} .detected-link { color: ${new Color(theme.getGlobalSettings().linkForeground)} !important; }`);
		}
	}
}

class EditorSelectionStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
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
	public getCssRules(theme: Theme, cssRules: string[]): void {
		this.addBackgroundColorRule(theme, '.wordHighlight', theme.getGlobalSettings().wordHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.wordHighlightStrong', theme.getGlobalSettings().wordHighlightStrong, cssRules);
	}
}

class EditorFindStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		this.addBackgroundColorRule(theme, '.findMatch', theme.getGlobalSettings().findMatchHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.currentFindMatch', theme.getGlobalSettings().currentFindMatchHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.findScope', theme.getGlobalSettings().findRangeHighlight, cssRules);
	}
}

class EditorReferenceSearchStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		this.addBackgroundColorRule(theme, '.reference-zone-widget .ref-tree .referenceMatch', theme.getGlobalSettings().findMatchHighlight, cssRules);
		this.addBackgroundColorRule(theme, '.reference-zone-widget .preview .reference-decoration', theme.getGlobalSettings().referenceHighlight, cssRules);
	}
}

class EditorLineHighlightStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		if (theme.getGlobalSettings().lineHighlight) {
			cssRules.push(`.monaco-editor.${theme.getSelector()} .view-overlays .current-line { background-color: ${new Color(theme.getGlobalSettings().lineHighlight)}; border: none; }`);
			cssRules.push(`.monaco-editor.${theme.getSelector()} .margin-view-overlays .current-line-margin { background-color: ${new Color(theme.getGlobalSettings().lineHighlight)}; border: none; }`);
		}
		this.addBackgroundColorRule(theme, '.rangeHighlight', theme.getGlobalSettings().rangeHighlight, cssRules);
	}
}

class EditorCursorStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		let themeSelector = theme.getSelector();
		if (theme.getGlobalSettings().caret) {
			let caret = new Color(theme.getGlobalSettings().caret);
			let oppositeCaret = caret.opposite();
			cssRules.push(`.monaco-editor.${themeSelector} .cursor { background-color: ${caret}; border-color: ${caret}; color: ${oppositeCaret}; }`);
		}
	}
}

class EditorWhiteSpaceStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		if (theme.getGlobalSettings().invisibles) {
			let invisibles = new Color(theme.getGlobalSettings().invisibles);
			cssRules.push(`.vs-whitespace { color: ${invisibles} !important; }`);
		}
	}
}

class EditorIndentGuidesStyleRules extends EditorStyleRules {
	public getCssRules(theme: Theme, cssRules: string[]): void {
		let themeSelector = theme.getSelector();
		let color = this.getColor(theme.getGlobalSettings());
		if (color !== null) {
			cssRules.push(`.monaco-editor.${themeSelector} .lines-content .cigr { background: ${color}; }`);
		}
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