/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as objects from 'vs/base/common/objects';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import {IDecorationRenderOptions, IModelDecorationOptions, IModelDecorationOverviewRulerOptions, IThemeDecorationRenderOptions, OverviewRulerLane} from 'vs/editor/common/editorCommon';
import {AbstractCodeEditorService} from 'vs/editor/common/services/abstractCodeEditorService';

export class CodeEditorServiceImpl extends AbstractCodeEditorService {

	private _styleSheet: HTMLStyleElement;
	private _decorationRenderOptions: {[key:string]:DecorationRenderOptions};

	constructor() {
		super();
		this._styleSheet = dom.createStyleSheet();
		this._decorationRenderOptions = Object.create(null);
	}

	public registerDecorationType(key:string, options: IDecorationRenderOptions): void {
		if (this._decorationRenderOptions[key]) {
			this._decorationRenderOptions[key].dispose();
			delete this._decorationRenderOptions[key];
		}
		var decorationRenderOptions = new DecorationRenderOptions(this._styleSheet, key, options);
		this._decorationRenderOptions[key] = decorationRenderOptions;
	}

	public removeDecorationType(key:string): void {
		if (this._decorationRenderOptions[key]) {
			this._decorationRenderOptions[key].dispose();
			delete this._decorationRenderOptions[key];

			this.listCodeEditors().forEach((ed) => ed.removeDecorations(key));
		}
	}

	public resolveDecorationType(key:string): IModelDecorationOptions {
		if (this._decorationRenderOptions[key]) {
			return this._decorationRenderOptions[key];
		}
		throw new Error('Unknown decoration type key: ' + key);
	}

}

class DecorationRenderOptions implements IModelDecorationOptions {

	private _styleSheet: HTMLStyleElement;
	private _key: string;

	public className: string;
	public inlineClassName: string;
	public glyphMarginClassName: string;
	public isWholeLine:boolean;
	public overviewRuler:IModelDecorationOverviewRulerOptions;

	constructor(styleSheet: HTMLStyleElement, key:string, options:IDecorationRenderOptions) {
		var themedOpts = resolveDecorationRenderOptions(options);

		this._styleSheet = styleSheet;
		this._key = key;

		this.className = DecorationRenderOptions._handle(
			this._styleSheet,
			this._key,
			ModelDecorationCSSRuleType.ClassName,
			DecorationRenderOptions._getCSSTextForModelDecorationClassName(themedOpts.light),
			DecorationRenderOptions._getCSSTextForModelDecorationClassName(themedOpts.dark)
		);

		this.inlineClassName = DecorationRenderOptions._handle(
			this._styleSheet,
			this._key,
			ModelDecorationCSSRuleType.InlineClassName,
			DecorationRenderOptions._getCSSTextForModelDecorationInlineClassName(themedOpts.light),
			DecorationRenderOptions._getCSSTextForModelDecorationInlineClassName(themedOpts.dark)
		);

		this.glyphMarginClassName = DecorationRenderOptions._handle(
			this._styleSheet,
			this._key,
			ModelDecorationCSSRuleType.GlyphMarginClassName,
			DecorationRenderOptions._getCSSTextForModelDecorationGlyphMarginClassName(themedOpts.light),
			DecorationRenderOptions._getCSSTextForModelDecorationGlyphMarginClassName(themedOpts.dark)
		);

		this.isWholeLine = Boolean(options.isWholeLine);

		if (
			typeof themedOpts.light.overviewRulerColor !== 'undefined'
			|| typeof themedOpts.dark.overviewRulerColor !== 'undefined'
		) {
			this.overviewRuler = {
				color: themedOpts.light.overviewRulerColor || themedOpts.dark.overviewRulerColor,
				darkColor: themedOpts.dark.overviewRulerColor || themedOpts.light.overviewRulerColor,
				position: options.overviewRulerLane || OverviewRulerLane.Center
			};
		}
	}

	public dispose(): void {
		dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.Light, this._key), this._styleSheet);
		dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.Dark, this._key), this._styleSheet);
	}

	private static _CSS_MAP = {
		color: 'color:{0} !important;',
		backgroundColor: 'background-color:{0};',

		outlineColor: 'outline-color:{0};',
		outlineStyle: 'outline-style:{0};',
		outlineWidth: 'outline-width:{0};',

		borderColor: 'border-color:{0};',
		borderRadius: 'border-radius:{0};',
		borderSpacing: 'border-spacing:{0};',
		borderStyle: 'border-style:{0};',
		borderWidth: 'border-width:{0};',

		textDecoration: 'text-decoration:{0};',
		cursor: 'cursor:{0};',
		letterSpacing: 'letter-spacing:{0};',

		gutterIconPath: 'background:url(\'{0}\') center center no-repeat;',
	};

	/**
	 * Build the CSS for decorations styled via `className`.
	 */
	private static _getCSSTextForModelDecorationClassName(opts:IThemeDecorationRenderOptions): string {
		let cssTextArr = [];

		if (typeof opts.backgroundColor !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.backgroundColor, opts.backgroundColor));
		}

		if (typeof opts.outlineColor !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.outlineColor, opts.outlineColor));
		}
		if (typeof opts.outlineStyle !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.outlineStyle, opts.outlineStyle));
		}
		if (typeof opts.outlineWidth !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.outlineWidth, opts.outlineWidth));
		}

		if (
			typeof opts.borderColor !== 'undefined'
			|| typeof opts.borderRadius !== 'undefined'
			|| typeof opts.borderSpacing !== 'undefined'
			|| typeof opts.borderStyle !== 'undefined'
			|| typeof opts.borderWidth !== 'undefined'
		) {
			cssTextArr.push(strings.format('box-sizing: border-box;'));
		}

		if (typeof opts.borderColor !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.borderColor, opts.borderColor));
		}
		if (typeof opts.borderRadius !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.borderRadius, opts.borderRadius));
		}
		if (typeof opts.borderSpacing !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.borderSpacing, opts.borderSpacing));
		}
		if (typeof opts.borderStyle !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.borderStyle, opts.borderStyle));
		}
		if (typeof opts.borderWidth !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.borderWidth, opts.borderWidth));
		}

		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `inlineClassName`.
	 */
	private static _getCSSTextForModelDecorationInlineClassName(opts:IThemeDecorationRenderOptions): string {
		let cssTextArr = [];

		if (typeof opts.textDecoration !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.textDecoration, opts.textDecoration));
		}
		if (typeof opts.cursor !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.cursor, opts.cursor));
		}
		if (typeof opts.color !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.color, opts.color));
		}
		if (typeof opts.letterSpacing !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.letterSpacing, opts.letterSpacing));
		}

		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `glpyhMarginClassName`.
	 */
	private static _getCSSTextForModelDecorationGlyphMarginClassName(opts:IThemeDecorationRenderOptions): string {
		let cssTextArr = [];

		if (typeof opts.gutterIconPath !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.gutterIconPath, URI.file(opts.gutterIconPath).toString()));
		}

		return cssTextArr.join('');
	}

	private static _handle(styleSheet: HTMLStyleElement, key:string, ruleType:ModelDecorationCSSRuleType, lightCSS:string, darkCSS:string): string {
		if (lightCSS.length > 0 || darkCSS.length > 0) {
			if (lightCSS.length > 0) {
				this._createCSSSelector(styleSheet, ThemeType.Light, key, ruleType, lightCSS);
			}
			if (darkCSS.length > 0) {
				this._createCSSSelector(styleSheet, ThemeType.Dark, key, ruleType, darkCSS);
			}
			return CSSNameHelper.getClassName(key, ruleType);
		}
		return undefined;
	}

	private static _createCSSSelector(styleSheet: HTMLStyleElement, themeType:ThemeType, key:string, ruleType:ModelDecorationCSSRuleType, cssText:string): void {
		dom.createCSSRule(CSSNameHelper.getSelector(themeType, key, ruleType), cssText, styleSheet);
	}
}

enum ThemeType {
	Light = 0,
	Dark = 1
}
enum ModelDecorationCSSRuleType {
	ClassName = 0,
	InlineClassName = 1,
	GlyphMarginClassName = 2
}
class CSSNameHelper {

	private static _getSelectorPrefixOf(theme:ThemeType): string {
		if (theme === ThemeType.Light) {
			return '.monaco-editor.vs';
		}
		return '.monaco-editor.vs-dark';
	}

	public static getClassName(key:string, type:ModelDecorationCSSRuleType): string {
		return 'ced-' + key + '-' + type;
	}

	public static getSelector(themeType:ThemeType, key:string, ruleType:ModelDecorationCSSRuleType): string {
		return this._getSelectorPrefixOf(themeType) + ' .' + this.getClassName(key, ruleType);
	}

	public static getDeletionPrefixFor(themeType:ThemeType, key:string): string {
		return this._getSelectorPrefixOf(themeType) + ' .ced-' + key;
	}
}

// ---- Normalize decoration render options per theme
interface IResolvedDecorationRenderOptions {
	light: IThemeDecorationRenderOptions;
	dark: IThemeDecorationRenderOptions;
}
function resolveDecorationRenderOptions(opts:IDecorationRenderOptions): IResolvedDecorationRenderOptions {
	var light = objects.deepClone(opts);
	objects.mixin(light, opts.light);

	var dark = objects.deepClone(opts);
	objects.mixin(dark, opts.dark);

	return {
		light: light,
		dark: dark
	};
}