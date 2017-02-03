/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ColorId, FontStyle, MetadataConsts, LanguageId } from 'vs/editor/common/modes';
import { toStandardTokenType } from 'vs/editor/common/core/lineTokens';

export interface IThemeRule {
	token: string;
	foreground?: string;
	background?: string;
	fontStyle?: string;
}

export class ParsedThemeRule {
	_parsedThemeRuleBrand: void;

	readonly token: string;
	readonly index: number;

	/**
	 * -1 if not set. An or mask of `FontStyle` otherwise.
	 */
	readonly fontStyle: FontStyle;
	readonly foreground: string;
	readonly background: string;

	constructor(
		token: string,
		index: number,
		fontStyle: number,
		foreground: string,
		background: string,
	) {
		this.token = token;
		this.index = index;
		this.fontStyle = fontStyle;
		this.foreground = foreground;
		this.background = background;
	}
}

/**
 * Parse a raw theme into rules.
 */
export function parseTheme(source: IThemeRule[]): ParsedThemeRule[] {
	if (!source || !Array.isArray(source)) {
		return [];
	}
	let result: ParsedThemeRule[] = [], resultLen = 0;
	for (let i = 0, len = source.length; i < len; i++) {
		let entry = source[i];

		let fontStyle: number = FontStyle.NotSet;
		if (typeof entry.fontStyle === 'string') {
			fontStyle = FontStyle.None;

			let segments = entry.fontStyle.split(' ');
			for (let j = 0, lenJ = segments.length; j < lenJ; j++) {
				let segment = segments[j];
				switch (segment) {
					case 'italic':
						fontStyle = fontStyle | FontStyle.Italic;
						break;
					case 'bold':
						fontStyle = fontStyle | FontStyle.Bold;
						break;
					case 'underline':
						fontStyle = fontStyle | FontStyle.Underline;
						break;
				}
			}
		}

		let foreground: string = null;
		if (typeof entry.foreground === 'string') {
			foreground = entry.foreground;
		}

		let background: string = null;
		if (typeof entry.background === 'string') {
			background = entry.background;
		}

		result[resultLen++] = new ParsedThemeRule(
			entry.token || '',
			i,
			fontStyle,
			foreground,
			background
		);
	}

	return result;
}

/**
 * Resolve rules (i.e. inheritance).
 */
function resolveParsedThemeRules(parsedThemeRules: ParsedThemeRule[]): Theme {

	// Sort rules lexicographically, and then by index if necessary
	parsedThemeRules.sort((a, b) => {
		let r = strcmp(a.token, b.token);
		if (r !== 0) {
			return r;
		}
		return a.index - b.index;
	});

	// Determine defaults
	let defaultFontStyle = FontStyle.None;
	let defaultForeground = '000000';
	let defaultBackground = 'ffffff';
	while (parsedThemeRules.length >= 1 && parsedThemeRules[0].token === '') {
		let incomingDefaults = parsedThemeRules.shift();
		if (incomingDefaults.fontStyle !== FontStyle.NotSet) {
			defaultFontStyle = incomingDefaults.fontStyle;
		}
		if (incomingDefaults.foreground !== null) {
			defaultForeground = incomingDefaults.foreground;
		}
		if (incomingDefaults.background !== null) {
			defaultBackground = incomingDefaults.background;
		}
	}
	let colorMap = new ColorMap();
	// ensure default foreground gets id 1 and default background gets id 2
	let defaults = new ThemeTrieElementRule(defaultFontStyle, colorMap.getId(defaultForeground), colorMap.getId(defaultBackground));

	let root = new ThemeTrieElement(defaults);
	for (let i = 0, len = parsedThemeRules.length; i < len; i++) {
		let rule = parsedThemeRules[i];
		root.insert(rule.token, rule.fontStyle, colorMap.getId(rule.foreground), colorMap.getId(rule.background));
	}

	return new Theme(colorMap, root);
}

export class ColorMap {

	private _lastColorId: number;
	private _id2color: string[];
	private _color2id: Map<string, ColorId>;

	constructor() {
		this._lastColorId = 0;
		this._id2color = [];
		this._color2id = new Map<string, ColorId>();
	}

	public getId(color: string): ColorId {
		if (color === null) {
			return 0;
		}
		color = color.toUpperCase();
		if (!/^[0-9A-F]{6}$/.test(color)) {
			throw new Error('Illegal color name: ' + color);
		}
		let value = this._color2id.get(color);
		if (value) {
			return value;
		}
		value = ++this._lastColorId;
		this._color2id.set(color, value);
		this._id2color[value] = color;
		return value;
	}

	public getColorMap(): string[] {
		return this._id2color.slice(0);
	}

}

export class Theme {

	public static createFromRawTheme(source: IThemeRule[]): Theme {
		return this.createFromParsedTheme(parseTheme(source));
	}

	public static createFromParsedTheme(source: ParsedThemeRule[]): Theme {
		return resolveParsedThemeRules(source);
	}

	private readonly _colorMap: ColorMap;
	private readonly _root: ThemeTrieElement;
	private readonly _cache: Map<string, ThemeTrieElementRule>;

	constructor(colorMap: ColorMap, root: ThemeTrieElement) {
		this._colorMap = colorMap;
		this._root = root;
		this._cache = new Map<string, ThemeTrieElementRule>();
	}

	public getColorMap(): string[] {
		return this._colorMap.getColorMap();
	}

	/**
	 * used for testing purposes
	 */
	public getThemeTrieElement(): ExternalThemeTrieElement {
		return this._root.toExternalThemeTrieElement();
	}

	public _match(token: string): ThemeTrieElementRule {
		let result = this._cache.get(token);
		if (typeof result === 'undefined') {
			result = this._root.match(token);
			this._cache.set(token, result);
		}
		return result;
	}

	public match(languageId: LanguageId, token: string): number {
		let rule = this._match(token);
		let standardToken = toStandardTokenType(token);

		return (
			rule.metadata
			| (standardToken << MetadataConsts.TOKEN_TYPE_OFFSET)
			| (languageId << MetadataConsts.LANGUAGEID_OFFSET)
		) >>> 0;
	}
}

export function strcmp(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

export class ThemeTrieElementRule {
	_themeTrieElementRuleBrand: void;

	private _fontStyle: FontStyle;
	private _foreground: ColorId;
	private _background: ColorId;
	public metadata: number;

	constructor(fontStyle: FontStyle, foreground: ColorId, background: ColorId) {
		this._fontStyle = fontStyle;
		this._foreground = foreground;
		this._background = background;
		this.metadata = (
			(this._fontStyle << MetadataConsts.FONT_STYLE_OFFSET)
			| (this._foreground << MetadataConsts.FOREGROUND_OFFSET)
			| (this._background << MetadataConsts.BACKGROUND_OFFSET)
		) >>> 0;
	}

	public clone(): ThemeTrieElementRule {
		return new ThemeTrieElementRule(this._fontStyle, this._foreground, this._background);
	}

	public static cloneArr(arr: ThemeTrieElementRule[]): ThemeTrieElementRule[] {
		let r: ThemeTrieElementRule[] = [];
		for (let i = 0, len = arr.length; i < len; i++) {
			r[i] = arr[i].clone();
		}
		return r;
	}

	public acceptOverwrite(fontStyle: FontStyle, foreground: ColorId, background: ColorId): void {
		if (fontStyle !== FontStyle.NotSet) {
			this._fontStyle = fontStyle;
		}
		if (foreground !== ColorId.None) {
			this._foreground = foreground;
		}
		if (background !== ColorId.None) {
			this._background = background;
		}
		this.metadata = (
			(this._fontStyle << MetadataConsts.FONT_STYLE_OFFSET)
			| (this._foreground << MetadataConsts.FOREGROUND_OFFSET)
			| (this._background << MetadataConsts.BACKGROUND_OFFSET)
		) >>> 0;
	}
}

export class ExternalThemeTrieElement {

	public readonly mainRule: ThemeTrieElementRule;
	public readonly children: { [segment: string]: ExternalThemeTrieElement };

	constructor(mainRule: ThemeTrieElementRule, children?: { [segment: string]: ExternalThemeTrieElement }) {
		this.mainRule = mainRule;
		this.children = children || Object.create(null);
	}
}

export class ThemeTrieElement {
	_themeTrieElementBrand: void;

	private readonly _mainRule: ThemeTrieElementRule;
	private readonly _children: Map<string, ThemeTrieElement>;

	constructor(mainRule: ThemeTrieElementRule) {
		this._mainRule = mainRule;
		this._children = new Map<string, ThemeTrieElement>();
	}

	/**
	 * used for testing purposes
	 */
	public toExternalThemeTrieElement(): ExternalThemeTrieElement {
		let children: { [segment: string]: ExternalThemeTrieElement } = Object.create(null);
		this._children.forEach((element, index) => {
			children[index] = element.toExternalThemeTrieElement();
		});
		return new ExternalThemeTrieElement(this._mainRule, children);
	}

	public match(token: string): ThemeTrieElementRule {
		if (token === '') {
			return this._mainRule;
		}

		let dotIndex = token.indexOf('.');
		let head: string;
		let tail: string;
		if (dotIndex === -1) {
			head = token;
			tail = '';
		} else {
			head = token.substring(0, dotIndex);
			tail = token.substring(dotIndex + 1);
		}

		let child = this._children.get(head);
		if (typeof child !== 'undefined') {
			return child.match(tail);
		}

		return this._mainRule;
	}

	public insert(token: string, fontStyle: FontStyle, foreground: ColorId, background: ColorId): void {
		if (token === '') {
			// Merge into the main rule
			this._mainRule.acceptOverwrite(fontStyle, foreground, background);
			return;
		}

		let dotIndex = token.indexOf('.');
		let head: string;
		let tail: string;
		if (dotIndex === -1) {
			head = token;
			tail = '';
		} else {
			head = token.substring(0, dotIndex);
			tail = token.substring(dotIndex + 1);
		}

		let child = this._children.get(head);
		if (typeof child === 'undefined') {
			child = new ThemeTrieElement(this._mainRule.clone());
			this._children.set(head, child);
		}

		child.insert(tail, fontStyle, foreground, background);
	}
}
