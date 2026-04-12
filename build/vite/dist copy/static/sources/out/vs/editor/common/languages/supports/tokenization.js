/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Color } from '../../../../base/common/color.js';
export class ParsedTokenThemeRule {
    constructor(token, index, fontStyle, foreground, background) {
        this._parsedThemeRuleBrand = undefined;
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
export function parseTokenTheme(source) {
    if (!source || !Array.isArray(source)) {
        return [];
    }
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = source.length; i < len; i++) {
        const entry = source[i];
        let fontStyle = -1 /* FontStyle.NotSet */;
        if (typeof entry.fontStyle === 'string') {
            fontStyle = 0 /* FontStyle.None */;
            const segments = entry.fontStyle.split(' ');
            for (let j = 0, lenJ = segments.length; j < lenJ; j++) {
                const segment = segments[j];
                switch (segment) {
                    case 'italic':
                        fontStyle = fontStyle | 1 /* FontStyle.Italic */;
                        break;
                    case 'bold':
                        fontStyle = fontStyle | 2 /* FontStyle.Bold */;
                        break;
                    case 'underline':
                        fontStyle = fontStyle | 4 /* FontStyle.Underline */;
                        break;
                    case 'strikethrough':
                        fontStyle = fontStyle | 8 /* FontStyle.Strikethrough */;
                        break;
                }
            }
        }
        let foreground = null;
        if (typeof entry.foreground === 'string') {
            foreground = entry.foreground;
        }
        let background = null;
        if (typeof entry.background === 'string') {
            background = entry.background;
        }
        result[resultLen++] = new ParsedTokenThemeRule(entry.token || '', i, fontStyle, foreground, background);
    }
    return result;
}
/**
 * Resolve rules (i.e. inheritance).
 */
function resolveParsedTokenThemeRules(parsedThemeRules, customTokenColors) {
    // Sort rules lexicographically, and then by index if necessary
    parsedThemeRules.sort((a, b) => {
        const r = strcmp(a.token, b.token);
        if (r !== 0) {
            return r;
        }
        return a.index - b.index;
    });
    // Determine defaults
    let defaultFontStyle = 0 /* FontStyle.None */;
    let defaultForeground = '000000';
    let defaultBackground = 'ffffff';
    while (parsedThemeRules.length >= 1 && parsedThemeRules[0].token === '') {
        const incomingDefaults = parsedThemeRules.shift();
        if (incomingDefaults.fontStyle !== -1 /* FontStyle.NotSet */) {
            defaultFontStyle = incomingDefaults.fontStyle;
        }
        if (incomingDefaults.foreground !== null) {
            defaultForeground = incomingDefaults.foreground;
        }
        if (incomingDefaults.background !== null) {
            defaultBackground = incomingDefaults.background;
        }
    }
    const colorMap = new ColorMap();
    // start with token colors from custom token themes
    for (const color of customTokenColors) {
        colorMap.getId(color);
    }
    const foregroundColorId = colorMap.getId(defaultForeground);
    const backgroundColorId = colorMap.getId(defaultBackground);
    const defaults = new ThemeTrieElementRule(defaultFontStyle, foregroundColorId, backgroundColorId);
    const root = new ThemeTrieElement(defaults);
    for (let i = 0, len = parsedThemeRules.length; i < len; i++) {
        const rule = parsedThemeRules[i];
        root.insert(rule.token, rule.fontStyle, colorMap.getId(rule.foreground), colorMap.getId(rule.background));
    }
    return new TokenTheme(colorMap, root);
}
const colorRegExp = /^#?([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/;
export class ColorMap {
    constructor() {
        this._lastColorId = 0;
        this._id2color = [];
        this._color2id = new Map();
    }
    getId(color) {
        if (color === null) {
            return 0;
        }
        const match = color.match(colorRegExp);
        if (!match) {
            throw new Error('Illegal value for token color: ' + color);
        }
        color = match[1].toUpperCase();
        let value = this._color2id.get(color);
        if (value) {
            return value;
        }
        value = ++this._lastColorId;
        this._color2id.set(color, value);
        this._id2color[value] = Color.fromHex('#' + color);
        return value;
    }
    getColorMap() {
        return this._id2color.slice(0);
    }
}
export class TokenTheme {
    static createFromRawTokenTheme(source, customTokenColors) {
        return this.createFromParsedTokenTheme(parseTokenTheme(source), customTokenColors);
    }
    static createFromParsedTokenTheme(source, customTokenColors) {
        return resolveParsedTokenThemeRules(source, customTokenColors);
    }
    constructor(colorMap, root) {
        this._colorMap = colorMap;
        this._root = root;
        this._cache = new Map();
    }
    getColorMap() {
        return this._colorMap.getColorMap();
    }
    /**
     * used for testing purposes
     */
    getThemeTrieElement() {
        return this._root.toExternalThemeTrieElement();
    }
    _match(token) {
        return this._root.match(token);
    }
    match(languageId, token) {
        // The cache contains the metadata without the language bits set.
        let result = this._cache.get(token);
        if (typeof result === 'undefined') {
            const rule = this._match(token);
            const standardToken = toStandardTokenType(token);
            result = (rule.metadata
                | (standardToken << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)) >>> 0;
            this._cache.set(token, result);
        }
        return (result
            | (languageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)) >>> 0;
    }
}
const STANDARD_TOKEN_TYPE_REGEXP = /\b(comment|string|regex|regexp)\b/;
export function toStandardTokenType(tokenType) {
    const m = tokenType.match(STANDARD_TOKEN_TYPE_REGEXP);
    if (!m) {
        return 0 /* StandardTokenType.Other */;
    }
    switch (m[1]) {
        case 'comment':
            return 1 /* StandardTokenType.Comment */;
        case 'string':
            return 2 /* StandardTokenType.String */;
        case 'regex':
            return 3 /* StandardTokenType.RegEx */;
        case 'regexp':
            return 3 /* StandardTokenType.RegEx */;
    }
    throw new Error('Unexpected match for standard token type!');
}
export function strcmp(a, b) {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}
export class ThemeTrieElementRule {
    constructor(fontStyle, foreground, background) {
        this._themeTrieElementRuleBrand = undefined;
        this._fontStyle = fontStyle;
        this._foreground = foreground;
        this._background = background;
        this.metadata = ((this._fontStyle << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)
            | (this._foreground << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
            | (this._background << 24 /* MetadataConsts.BACKGROUND_OFFSET */)) >>> 0;
    }
    clone() {
        return new ThemeTrieElementRule(this._fontStyle, this._foreground, this._background);
    }
    acceptOverwrite(fontStyle, foreground, background) {
        if (fontStyle !== -1 /* FontStyle.NotSet */) {
            this._fontStyle = fontStyle;
        }
        if (foreground !== 0 /* ColorId.None */) {
            this._foreground = foreground;
        }
        if (background !== 0 /* ColorId.None */) {
            this._background = background;
        }
        this.metadata = ((this._fontStyle << 11 /* MetadataConsts.FONT_STYLE_OFFSET */)
            | (this._foreground << 15 /* MetadataConsts.FOREGROUND_OFFSET */)
            | (this._background << 24 /* MetadataConsts.BACKGROUND_OFFSET */)) >>> 0;
    }
}
export class ExternalThemeTrieElement {
    constructor(mainRule, children = new Map()) {
        this.mainRule = mainRule;
        if (children instanceof Map) {
            this.children = children;
        }
        else {
            this.children = new Map();
            for (const key in children) {
                this.children.set(key, children[key]);
            }
        }
    }
}
export class ThemeTrieElement {
    constructor(mainRule) {
        this._themeTrieElementBrand = undefined;
        this._mainRule = mainRule;
        this._children = new Map();
    }
    /**
     * used for testing purposes
     */
    toExternalThemeTrieElement() {
        const children = new Map();
        this._children.forEach((element, index) => {
            children.set(index, element.toExternalThemeTrieElement());
        });
        return new ExternalThemeTrieElement(this._mainRule, children);
    }
    match(token) {
        if (token === '') {
            return this._mainRule;
        }
        const dotIndex = token.indexOf('.');
        let head;
        let tail;
        if (dotIndex === -1) {
            head = token;
            tail = '';
        }
        else {
            head = token.substring(0, dotIndex);
            tail = token.substring(dotIndex + 1);
        }
        const child = this._children.get(head);
        if (typeof child !== 'undefined') {
            return child.match(tail);
        }
        return this._mainRule;
    }
    insert(token, fontStyle, foreground, background) {
        if (token === '') {
            // Merge into the main rule
            this._mainRule.acceptOverwrite(fontStyle, foreground, background);
            return;
        }
        const dotIndex = token.indexOf('.');
        let head;
        let tail;
        if (dotIndex === -1) {
            head = token;
            tail = '';
        }
        else {
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
export function generateTokensCSSForColorMap(colorMap) {
    const rules = [];
    for (let i = 1, len = colorMap.length; i < len; i++) {
        const color = colorMap[i];
        rules[i] = `.mtk${i} { color: ${color}; }`;
    }
    rules.push('.mtki { font-style: italic; }');
    rules.push('.mtkb { font-weight: bold; }');
    rules.push('.mtku { text-decoration: underline; text-underline-position: under; }');
    rules.push('.mtks { text-decoration: line-through; }');
    rules.push('.mtks.mtku { text-decoration: underline line-through; text-underline-position: under; }');
    return rules.join('\n');
}
export function generateTokensCSSForFontMap(fontMap) {
    const rules = [];
    const fonts = new Set();
    for (let i = 1, len = fontMap.length; i < len; i++) {
        const font = fontMap[i];
        if (!font.fontFamily && !font.fontSizeMultiplier) {
            continue;
        }
        const className = classNameForFontTokenDecorations(font.fontFamily ?? '', font.fontSizeMultiplier ?? 0);
        if (fonts.has(className)) {
            continue;
        }
        fonts.add(className);
        let rule = `.${className} {`;
        if (font.fontFamily) {
            rule += `font-family: ${font.fontFamily};`;
        }
        if (font.fontSizeMultiplier) {
            rule += `font-size: calc(var(--editor-font-size)*${font.fontSizeMultiplier});`;
        }
        rule += `}`;
        rules.push(rule);
    }
    return rules.join('\n');
}
export function classNameForFontTokenDecorations(fontFamily, fontSize) {
    const safeFontFamily = sanitizeFontFamilyForClassName(fontFamily);
    return cleanClassName(`font-decoration-${safeFontFamily}-${fontSize}`);
}
function sanitizeFontFamilyForClassName(fontFamily) {
    const normalized = fontFamily.toLowerCase().trim();
    if (!normalized) {
        return 'default';
    }
    return cleanClassName(normalized);
}
function cleanClassName(className) {
    return className.replace(/[^a-z0-9_-]/gi, '-');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQVd6RCxNQUFNLE9BQU8sb0JBQW9CO0lBYWhDLFlBQ0MsS0FBYSxFQUNiLEtBQWEsRUFDYixTQUFpQixFQUNqQixVQUF5QixFQUN6QixVQUF5QjtRQWpCMUIsMEJBQXFCLEdBQVMsU0FBUyxDQUFDO1FBbUJ2QyxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUM5QixDQUFDO0NBQ0Q7QUFFRDs7R0FFRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQUMsTUFBeUI7SUFDeEQsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUN2QyxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFDRCxNQUFNLE1BQU0sR0FBMkIsRUFBRSxDQUFDO0lBQzFDLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNsQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDbkQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FB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