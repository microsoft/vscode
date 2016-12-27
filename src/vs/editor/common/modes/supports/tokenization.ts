/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Map, createMap } from 'vs/editor/common/core/map';

export interface IThemeRule {
	token: string;
	foreground?: string;
	fontStyle?: string;
}

export const enum FontStyle {
	NotSet = -1,
	None = 0,
	Italic = 1,
	Bold = 2,
	Underline = 4
}

export class ParsedThemeRule {
	_parsedThemeRuleBrand: void;

	readonly scope: string;
	readonly index: number;

	/**
	 * -1 if not set. An or mask of `FontStyle` otherwise.
	 */
	readonly fontStyle: number;
	readonly foreground: string;
	readonly background: string;

	constructor(
		scope: string,
		index: number,
		fontStyle: number,
		foreground: string,
		background: string,
	) {
		this.scope = scope;
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
		// if (typeof entry.background === 'string') {
		// 	background = entry.background;
		// }

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
		let r = strcmp(a.scope, b.scope);
		if (r !== 0) {
			return r;
		}
		return a.index - b.index;
	});

	// Determine defaults
	let defaultFontStyle = FontStyle.None;
	let defaultForeground = '#000000';
	let defaultBackground = '#ffffff';
	while (parsedThemeRules.length >= 1 && parsedThemeRules[0].scope === '') {
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
	let defaults = new ThemeTrieElementRule(defaultFontStyle, colorMap.getId(defaultForeground), colorMap.getId(defaultBackground));

	let root = new ThemeTrieElement(new ThemeTrieElementRule(FontStyle.NotSet, 0, 0));
	for (let i = 0, len = parsedThemeRules.length; i < len; i++) {
		let rule = parsedThemeRules[i];
		root.insert(rule.scope, rule.fontStyle, colorMap.getId(rule.foreground), colorMap.getId(rule.background));
	}

	return new Theme(colorMap, defaults, root);
}

export class ColorMap {

	private _lastColorId: number;
	private _id2color: string[];
	private _color2id: Map<string, number>;

	constructor() {
		this._lastColorId = 0;
		this._id2color = [];
		this._color2id = createMap<string, number>();
	}

	public getId(color: string): number {
		if (color === null) {
			return 0;
		}
		color = color.toUpperCase();
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
	private readonly _defaults: ThemeTrieElementRule;
	private readonly _cache: Map<string, ThemeTrieElementRule>;

	constructor(colorMap: ColorMap, defaults: ThemeTrieElementRule, root: ThemeTrieElement) {
		this._colorMap = colorMap;
		this._root = root;
		this._defaults = defaults;
		this._cache = createMap<string, ThemeTrieElementRule>();
	}

	public getColorMap(): string[] {
		return this._colorMap.getColorMap();
	}

	public getDefaults(): ThemeTrieElementRule {
		return this._defaults;
	}

	public match(scopeName: string): ThemeTrieElementRule {
		let result = this._cache.get(scopeName);
		if (typeof result === 'undefined') {
			result = this._root.match(scopeName);
			this._cache.set(scopeName, result);
		}
		return result;
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

export function strArrCmp(a: string[], b: string[]): number {
	if (a === null && b === null) {
		return 0;
	}
	if (!a) {
		return -1;
	}
	if (!b) {
		return 1;
	}
	let len1 = a.length;
	let len2 = b.length;
	if (len1 === len2) {
		for (let i = 0; i < len1; i++) {
			let res = strcmp(a[i], b[i]);
			if (res !== 0) {
				return res;
			}
		}
		return 0;
	}
	return len1 - len2;
}

export class ThemeTrieElementRule {
	_themeTrieElementRuleBrand: void;

	fontStyle: number;
	foreground: number;
	background: number;

	constructor(fontStyle: number, foreground: number, background: number) {
		this.fontStyle = fontStyle;
		this.foreground = foreground;
		this.background = background;
	}

	public clone(): ThemeTrieElementRule {
		return new ThemeTrieElementRule(this.fontStyle, this.foreground, this.background);
	}

	public static cloneArr(arr: ThemeTrieElementRule[]): ThemeTrieElementRule[] {
		let r: ThemeTrieElementRule[] = [];
		for (let i = 0, len = arr.length; i < len; i++) {
			r[i] = arr[i].clone();
		}
		return r;
	}

	public acceptOverwrite(fontStyle: number, foreground: number, background: number): void {
		if (fontStyle !== FontStyle.NotSet) {
			this.fontStyle = fontStyle;
		}
		if (foreground !== 0) {
			this.foreground = foreground;
		}
		if (background !== 0) {
			this.background = background;
		}
	}
}

export class ThemeTrieElement {
	_themeTrieElementBrand: void;

	private readonly _mainRule: ThemeTrieElementRule;
	private readonly _children: Map<string, ThemeTrieElement>;

	constructor(mainRule: ThemeTrieElementRule) {
		this._mainRule = mainRule;
		this._children = createMap<string, ThemeTrieElement>();
	}

	public match(scope: string): ThemeTrieElementRule {
		if (scope === '') {
			return this._mainRule;
		}

		let dotIndex = scope.indexOf('.');
		let head: string;
		let tail: string;
		if (dotIndex === -1) {
			head = scope;
			tail = '';
		} else {
			head = scope.substring(0, dotIndex);
			tail = scope.substring(dotIndex + 1);
		}

		let child = this._children.get(head);
		if (typeof child !== 'undefined') {
			return child.match(tail);
		}

		return this._mainRule;
	}

	public insert(scope: string, fontStyle: number, foreground: number, background: number): void {
		if (scope === '') {
			// Merge into the main rule
			this._mainRule.acceptOverwrite(fontStyle, foreground, background);
			return;
		}

		let dotIndex = scope.indexOf('.');
		let head: string;
		let tail: string;
		if (dotIndex === -1) {
			head = scope;
			tail = '';
		} else {
			head = scope.substring(0, dotIndex);
			tail = scope.substring(dotIndex + 1);
		}

		let child = this._children.get(head);
		if (typeof child === 'undefined') {
			child = new ThemeTrieElement(this._mainRule.clone());
			this._children.set(head, child);
		}

		child.insert(tail, fontStyle, foreground, background);
	}
}
