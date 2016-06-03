/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as objects from 'vs/base/common/objects';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import {IDecorationRenderOptions, IModelDecorationOptions, IModelDecorationOverviewRulerOptions, IThemeDecorationRenderOptions,
	IContentDecorationRenderOptions, OverviewRulerLane, TrackedRangeStickiness} from 'vs/editor/common/editorCommon';
import {AbstractCodeEditorService} from 'vs/editor/common/services/abstractCodeEditorService';
import {IDisposable, toDisposable} from 'vs/base/common/lifecycle';

export class CodeEditorServiceImpl extends AbstractCodeEditorService {

	private _styleSheet: HTMLStyleElement;
	private _decorationOptionProviders: {[key:string]:IModelDecorationOptionsProvider};

	constructor() {
		super();
		this._styleSheet = dom.createStyleSheet();
		this._decorationOptionProviders = Object.create(null);
	}

	public registerDecorationType(key:string, options: IDecorationRenderOptions, parentTypeKey?: string): void {
		let provider = this._decorationOptionProviders[key];
		if (provider) {
			provider.dispose();
			delete this._decorationOptionProviders[key];
		}
		if (!parentTypeKey) {
			provider = new DecorationTypeOptionsProvider(this._styleSheet, key, options);
		} else {
			provider = new DecorationSubTypeOptionsProvider(this._styleSheet, key, parentTypeKey, options);
		}
		this._decorationOptionProviders[key] = provider;
		provider.refCount++;
	}

	public removeDecorationType(key:string): void {
		let provider = this._decorationOptionProviders[key];
		if (provider) {
			provider.refCount--;
			if (provider.refCount <= 0) {
				delete this._decorationOptionProviders[key];
				provider.dispose();
				this.listCodeEditors().forEach((ed) => ed.removeDecorations(key));
			}
		}
	}

	public resolveDecorationOptions(decorationTypeKey:string, writable: boolean): IModelDecorationOptions {
		let provider = this._decorationOptionProviders[decorationTypeKey];
		if (!provider) {
			throw new Error('Unknown decoration type key: ' + decorationTypeKey);
		}
		return provider.getOptions(this, writable);
	}

}

interface IModelDecorationOptionsProvider extends IDisposable {
	refCount: number;
	getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions;
}

class DecorationSubTypeOptionsProvider implements IModelDecorationOptionsProvider {

	public refCount: number;

	private _disposable: IDisposable;
	private _parentTypeKey: string;
	private _inlineClassName: string;
	private _stickiness: TrackedRangeStickiness;

	constructor(styleSheet: HTMLStyleElement, key: string, parentTypeKey: string, options:IDecorationRenderOptions) {
		this._parentTypeKey = parentTypeKey;
		this.refCount = 0;

		var themedOpts = getThemedRenderOptions(options);

		let inlineClassName = DecorationRenderHelper.handle(
			styleSheet,
			key,
			parentTypeKey,
			ModelDecorationCSSRuleType.InlineClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.after),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.after),
				selector: '::after'
			},
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.before),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.before),
				selector: '::before'
			}
		);
		if (inlineClassName) {
			this._stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
			this._inlineClassName = inlineClassName;

			this._disposable = toDisposable(() => {
				dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.Light, key), styleSheet);
				dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.Dark, key), styleSheet);
				dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.HighContrastBlack, key), styleSheet);
			});
		}
	}

	public getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions {
		let options = codeEditorService.resolveDecorationOptions(this._parentTypeKey, true);
		if (this._inlineClassName) {
			options.inlineClassName = this._inlineClassName;
		}
		if (this._stickiness) {
			options.stickiness = this._stickiness;
		}
		return options;
	}

	public dispose(): void {
		if (this._disposable) {
			this._disposable.dispose();
			delete this._disposable;
		}
	}
}

class DecorationTypeOptionsProvider implements IModelDecorationOptionsProvider {

	private _styleSheet: HTMLStyleElement;
	public _key: string;

	public refCount: number;

	public className: string;
	public inlineClassName: string;
	public glyphMarginClassName: string;
	public isWholeLine:boolean;
	public overviewRuler:IModelDecorationOverviewRulerOptions;
	public stickiness: TrackedRangeStickiness;

	constructor(styleSheet: HTMLStyleElement, key:string, options:IDecorationRenderOptions) {
		var themedOpts = getThemedRenderOptions(options);

		this._styleSheet = styleSheet;
		this._key = key;

		this.className = DecorationRenderHelper.handle(
			this._styleSheet,
			this._key,
			null,
			ModelDecorationCSSRuleType.ClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationClassName(themedOpts.light),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationClassName(themedOpts.dark)
			}
		);

		this.inlineClassName = DecorationRenderHelper.handle(
			this._styleSheet,
			this._key,
			null,
			ModelDecorationCSSRuleType.InlineClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationInlineClassName(themedOpts.light),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationInlineClassName(themedOpts.dark)
			},
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.after),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.after),
				selector: '::after'
			},
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.before),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.before),
				selector: '::before'
			}
		);

		if (themedOpts.light.before || themedOpts.light.after || themedOpts.dark.before || themedOpts.dark.after) {
			this.stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
		}

		this.glyphMarginClassName = DecorationRenderHelper.handle(
			this._styleSheet,
			this._key,
			null,
			ModelDecorationCSSRuleType.GlyphMarginClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationGlyphMarginClassName(themedOpts.light),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationGlyphMarginClassName(themedOpts.dark)
			}
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

	public getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions {
		if (!writable) {
			return this;
		}
		return {
			inlineClassName: this.inlineClassName,
			className: this.className,
			glyphMarginClassName: this.glyphMarginClassName,
			isWholeLine: this.isWholeLine,
			overviewRuler: this.overviewRuler,
			stickiness: this.stickiness
		};
	}

	public dispose(): void {
		dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.Light, this._key), this._styleSheet);
		dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.Dark, this._key), this._styleSheet);
		dom.removeCSSRulesWithPrefix(CSSNameHelper.getDeletionPrefixFor(ThemeType.HighContrastBlack, this._key), this._styleSheet);
	}
}

class DecorationRenderHelper {
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

		content: 'content:{0};',
		margin: 'margin:{0};',
		width: 'width:{0};',
		height: 'height:{0};'
	};

	/**
	 * Build the CSS for decorations styled via `className`.
	 */
	public static getCSSTextForModelDecorationClassName(opts:IThemeDecorationRenderOptions): string {
		let cssTextArr = [];
		DecorationRenderHelper.collectCSSText(opts, ['backgroundColor', 'outlineColor', 'outlineStyle', 'outlineWidth'], cssTextArr);
		DecorationRenderHelper.collectBorderSettingsCSSText(opts, cssTextArr);

		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `inlineClassName`.
	 */
	public static getCSSTextForModelDecorationInlineClassName(opts:IThemeDecorationRenderOptions): string {
		let cssTextArr = [];
		DecorationRenderHelper.collectCSSText(opts, ['textDecoration', 'cursor', 'color', 'letterSpacing'], cssTextArr);
		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled before or after content.
	 */
	public static getCSSTextForModelDecorationContentClassName(opts:IContentDecorationRenderOptions): string {
		let cssTextArr = [];

		if (typeof opts !== 'undefined') {
			DecorationRenderHelper.collectBorderSettingsCSSText(opts, cssTextArr);
			DecorationRenderHelper.collectCSSText(opts, ['content', 'textDecoration', 'color', 'backgroundColor', 'margin'], cssTextArr);
			if (DecorationRenderHelper.collectCSSText(opts, ['width', 'height'], cssTextArr)) {
				cssTextArr.push('display:inline-block;');
			}
		}

		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `glpyhMarginClassName`.
	 */
	public static getCSSTextForModelDecorationGlyphMarginClassName(opts:IThemeDecorationRenderOptions): string {
		let cssTextArr = [];

		if (typeof opts.gutterIconPath !== 'undefined') {
			cssTextArr.push(strings.format(this._CSS_MAP.gutterIconPath, URI.file(opts.gutterIconPath).toString()));
		}

		return cssTextArr.join('');
	}

	private static border_rules = ['borderColor', 'borderColor', 'borderSpacing', 'borderStyle', 'borderWidth'];

	public static collectBorderSettingsCSSText(opts: any, cssTextArr: string[]) : boolean {
		if (DecorationRenderHelper.collectCSSText(opts, DecorationRenderHelper.border_rules, cssTextArr)) {
			cssTextArr.push(strings.format('box-sizing: border-box;'));
			return true;
		}
		return false;
	}

	private static collectCSSText(opts: any, properties: string[], cssTextArr: string[]) : boolean {
		let lenBefore = cssTextArr.length;
		for (let property of properties) {
			if (typeof opts[property] !== 'undefined') {
				cssTextArr.push(strings.format(this._CSS_MAP[property], opts[property]));
			}
		}
		return cssTextArr.length !== lenBefore;
	}

	public static handle(styleSheet: HTMLStyleElement, key:string, parentKey: string, ruleType:ModelDecorationCSSRuleType, ...ruleSets: {selector?: string, light:string, dark:string}[]): string {
		function createCSSSelector(themeType:ThemeType, pseudoSelector: string, cssText:string) {
			let selector = CSSNameHelper.getSelector(themeType, key, parentKey, ruleType, pseudoSelector);
			dom.createCSSRule(selector, cssText, styleSheet);
		}

		let hasContent = false;
		for (let ruleSet of ruleSets) {
			if (ruleSet.light.length > 0) {
				createCSSSelector(ThemeType.Light, ruleSet.selector, ruleSet.light);
				hasContent = true;
			}
			if (ruleSet.dark.length > 0) {
				createCSSSelector(ThemeType.Dark, ruleSet.selector, ruleSet.dark);
				createCSSSelector(ThemeType.HighContrastBlack, ruleSet.selector, ruleSet.dark);
				hasContent = true;
			}
		}
		if (hasContent) {
			let className = CSSNameHelper.getClassName(key, ruleType);
			if (parentKey) {
				className = className + ' ' + CSSNameHelper.getClassName(parentKey, ruleType);
			}
			return className;
		}
		return void 0;
	}
}

enum ThemeType {
	Light = 0,
	Dark = 1,
	HighContrastBlack = 2
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
		if (theme === ThemeType.Dark) {
			return '.monaco-editor.vs-dark';
		}
		return '.monaco-editor.hc-black';
	}

	public static getClassName(key:string, type:ModelDecorationCSSRuleType): string {
		return 'ced-' + key + '-' + type;
	}

	public static getSelector(themeType:ThemeType, key:string, parentKey: string, ruleType:ModelDecorationCSSRuleType, pseudoSelector:string): string {
		let selector = this._getSelectorPrefixOf(themeType) + ' .' + this.getClassName(key, ruleType);
		if (parentKey) {
			selector = selector + '.' + this.getClassName(parentKey, ruleType);
		}
		if (pseudoSelector) {
			selector = selector + pseudoSelector;
		}
		return selector;
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
function getThemedRenderOptions<T>(opts:{light?:T, dark?:T}): {light?:T, dark?:T} {
	var light = <T> objects.deepClone(opts);
	objects.mixin(light, opts.light);

	var dark = <T> objects.deepClone(opts);
	objects.mixin(dark, opts.dark);

	return {
		light: light,
		dark: dark
	};
}