/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as objects from 'vs/base/common/objects';
import { parse, stringify } from 'vs/base/common/marshalling';
import * as strings from 'vs/base/common/strings';
import URI from 'vs/base/common/uri';
import * as dom from 'vs/base/browser/dom';
import {
	IDecorationRenderOptions, IModelDecorationOptions, IModelDecorationOverviewRulerOptions, IThemeDecorationRenderOptions,
	IContentDecorationRenderOptions, OverviewRulerLane, TrackedRangeStickiness
} from 'vs/editor/common/editorCommon';
import { AbstractCodeEditorService } from 'vs/editor/common/services/abstractCodeEditorService';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export class CodeEditorServiceImpl extends AbstractCodeEditorService {

	private _styleSheet: HTMLStyleElement;
	private _decorationOptionProviders: { [key: string]: IModelDecorationOptionsProvider };

	constructor(styleSheet = dom.createStyleSheet()) {
		super();
		this._styleSheet = styleSheet;
		this._decorationOptionProviders = Object.create(null);
	}

	public registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void {
		let provider = this._decorationOptionProviders[key];
		if (!provider) {
			if (!parentTypeKey) {
				provider = new DecorationTypeOptionsProvider(this._styleSheet, key, options);
			} else {
				provider = new DecorationSubTypeOptionsProvider(this._styleSheet, key, parentTypeKey, options);
			}
			this._decorationOptionProviders[key] = provider;
		}
		provider.refCount++;
	}

	public removeDecorationType(key: string): void {
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

	public resolveDecorationOptions(decorationTypeKey: string, writable: boolean): IModelDecorationOptions {
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
	private _beforeContentClassName: string;
	private _afterContentClassName: string;

	constructor(styleSheet: HTMLStyleElement, key: string, parentTypeKey: string, options: IDecorationRenderOptions) {
		this._parentTypeKey = parentTypeKey;
		this.refCount = 0;

		let themedOpts = getThemedRenderOptions(options);

		this._beforeContentClassName = DecorationRenderHelper.createCSSRules(
			styleSheet,
			key,
			parentTypeKey,
			ModelDecorationCSSRuleType.BeforeContentClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.before),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.before)
			}
		);

		this._afterContentClassName = DecorationRenderHelper.createCSSRules(
			styleSheet,
			key,
			parentTypeKey,
			ModelDecorationCSSRuleType.AfterContentClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.after),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.after)
			}
		);
		if (this._beforeContentClassName || this._afterContentClassName) {
			this._disposable = toDisposable(() => {
				dom.removeCSSRulesContainingSelector(CSSNameHelper.getDeletionSubstring(key), styleSheet);
			});
		}
	}

	public getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions {
		let options = codeEditorService.resolveDecorationOptions(this._parentTypeKey, true);
		if (this._beforeContentClassName) {
			options.beforeContentClassName = this._beforeContentClassName;
		}
		if (this._afterContentClassName) {
			options.afterContentClassName = this._afterContentClassName;
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

	private _disposable: IDisposable;
	public refCount: number;

	public className: string;
	public inlineClassName: string;
	public beforeContentClassName: string;
	public afterContentClassName: string;
	public glyphMarginClassName: string;
	public isWholeLine: boolean;
	public overviewRuler: IModelDecorationOverviewRulerOptions;
	public stickiness: TrackedRangeStickiness;

	constructor(styleSheet: HTMLStyleElement, key: string, options: IDecorationRenderOptions) {
		this.refCount = 0;

		let themedOpts = getThemedRenderOptions(options);

		this.className = DecorationRenderHelper.createCSSRules(
			styleSheet,
			key,
			null,
			ModelDecorationCSSRuleType.ClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationClassName(themedOpts.light),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationClassName(themedOpts.dark)
			}
		);

		this.inlineClassName = DecorationRenderHelper.createCSSRules(
			styleSheet,
			key,
			null,
			ModelDecorationCSSRuleType.InlineClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationInlineClassName(themedOpts.light),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationInlineClassName(themedOpts.dark)
			}
		);

		this.beforeContentClassName = DecorationRenderHelper.createCSSRules(
			styleSheet,
			key,
			null,
			ModelDecorationCSSRuleType.BeforeContentClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.before),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.before)
			}
		);

		this.afterContentClassName = DecorationRenderHelper.createCSSRules(
			styleSheet,
			key,
			null,
			ModelDecorationCSSRuleType.AfterContentClassName,
			{
				light: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.light.after),
				dark: DecorationRenderHelper.getCSSTextForModelDecorationContentClassName(themedOpts.dark.after)
			}
		);

		this.glyphMarginClassName = DecorationRenderHelper.createCSSRules(
			styleSheet,
			key,
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

		this._disposable = toDisposable(() => {
			dom.removeCSSRulesContainingSelector(CSSNameHelper.getDeletionSubstring(key), styleSheet);
		});
	}

	public getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions {
		if (!writable) {
			return this;
		}
		return {
			inlineClassName: this.inlineClassName,
			beforeContentClassName: this.beforeContentClassName,
			afterContentClassName: this.afterContentClassName,
			className: this.className,
			glyphMarginClassName: this.glyphMarginClassName,
			isWholeLine: this.isWholeLine,
			overviewRuler: this.overviewRuler,
			stickiness: this.stickiness
		};
	}

	public dispose(): void {
		if (this._disposable) {
			this._disposable.dispose();
			delete this._disposable;
		}
	}
}

class DecorationRenderHelper {
	private static _CSS_MAP = {
		color: 'color:{0} !important;',
		backgroundColor: 'background-color:{0};',

		outline: 'outline:{0};',
		outlineColor: 'outline-color:{0};',
		outlineStyle: 'outline-style:{0};',
		outlineWidth: 'outline-width:{0};',

		border: 'border:{0};',
		borderColor: 'border-color:{0};',
		borderRadius: 'border-radius:{0};',
		borderSpacing: 'border-spacing:{0};',
		borderStyle: 'border-style:{0};',
		borderWidth: 'border-width:{0};',

		textDecoration: 'text-decoration:{0};',
		cursor: 'cursor:{0};',
		letterSpacing: 'letter-spacing:{0};',

		gutterIconPath: 'background:url(\'{0}\') center center no-repeat;',
		gutterIconSize: 'background-size:{0};',

		contentText: 'content:\'{0}\';',
		contentIconPath: 'content:url(\'{0}\');',
		margin: 'margin:{0};',
		width: 'width:{0};',
		height: 'height:{0};'
	};

	/**
	 * Build the CSS for decorations styled via `className`.
	 */
	public static getCSSTextForModelDecorationClassName(opts: IThemeDecorationRenderOptions): string {
		let cssTextArr = [];
		DecorationRenderHelper.collectCSSText(opts, ['backgroundColor', 'outline', 'outlineColor', 'outlineStyle', 'outlineWidth'], cssTextArr);
		DecorationRenderHelper.collectBorderSettingsCSSText(opts, cssTextArr);

		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `inlineClassName`.
	 */
	public static getCSSTextForModelDecorationInlineClassName(opts: IThemeDecorationRenderOptions): string {
		let cssTextArr = [];
		DecorationRenderHelper.collectCSSText(opts, ['textDecoration', 'cursor', 'color', 'letterSpacing'], cssTextArr);
		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled before or after content.
	 */
	public static getCSSTextForModelDecorationContentClassName(opts: IContentDecorationRenderOptions): string {
		let cssTextArr = [];

		if (typeof opts !== 'undefined') {
			DecorationRenderHelper.collectBorderSettingsCSSText(opts, cssTextArr);
			if (typeof opts.contentIconPath === 'string') {
				cssTextArr.push(strings.format(this._CSS_MAP.contentIconPath, URI.file(opts.contentIconPath).toString().replace(/'/g, '%27')));
			} else if (opts.contentIconPath instanceof URI) {
				cssTextArr.push(strings.format(this._CSS_MAP.contentIconPath, opts.contentIconPath.toString(true).replace(/'/g, '%27')));
			}
			if (typeof opts.contentText === 'string') {
				const truncated = opts.contentText.match(/^.*$/m)[0]; // only take first line
				const escaped = truncated.replace(/'\\/g, '\\$&');

				cssTextArr.push(strings.format(this._CSS_MAP.contentText, escaped));
			}
			DecorationRenderHelper.collectCSSText(opts, ['textDecoration', 'color', 'backgroundColor', 'margin'], cssTextArr);
			if (DecorationRenderHelper.collectCSSText(opts, ['width', 'height'], cssTextArr)) {
				cssTextArr.push('display:inline-block;');
			}
		}

		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `glpyhMarginClassName`.
	 */
	public static getCSSTextForModelDecorationGlyphMarginClassName(opts: IThemeDecorationRenderOptions): string {
		let cssTextArr = [];

		if (typeof opts.gutterIconPath !== 'undefined') {
			if (typeof opts.gutterIconPath === 'string') {
				cssTextArr.push(strings.format(this._CSS_MAP.gutterIconPath, URI.file(opts.gutterIconPath).toString()));
			} else {
				cssTextArr.push(strings.format(this._CSS_MAP.gutterIconPath, opts.gutterIconPath.toString(true).replace(/'/g, '%27')));
			}
			if (typeof opts.gutterIconSize !== 'undefined') {
				cssTextArr.push(strings.format(this._CSS_MAP.gutterIconSize, opts.gutterIconSize));
			}
		}

		return cssTextArr.join('');
	}

	private static border_rules = ['border', 'borderColor', 'borderColor', 'borderSpacing', 'borderStyle', 'borderWidth'];

	public static collectBorderSettingsCSSText(opts: any, cssTextArr: string[]): boolean {
		if (DecorationRenderHelper.collectCSSText(opts, DecorationRenderHelper.border_rules, cssTextArr)) {
			cssTextArr.push(strings.format('box-sizing: border-box;'));
			return true;
		}
		return false;
	}

	private static collectCSSText(opts: any, properties: string[], cssTextArr: string[]): boolean {
		let lenBefore = cssTextArr.length;
		for (let property of properties) {
			if (typeof opts[property] !== 'undefined') {
				cssTextArr.push(strings.format(this._CSS_MAP[property], opts[property]));
			}
		}
		return cssTextArr.length !== lenBefore;
	}

	/**
	 * Create CSS rules for `cssTexts` with the generated class names from `ruleType`
	 */
	public static createCSSRules(styleSheet: HTMLStyleElement, key: string, parentKey: string, ruleType: ModelDecorationCSSRuleType, cssTexts: { light: string, dark: string }): string {
		function createCSSSelector(themeType: ThemeType, cssText: string) {
			let selector = CSSNameHelper.getSelector(themeType, key, parentKey, ruleType);
			dom.createCSSRule(selector, cssText, styleSheet);
		}

		let hasContent = false;
		if (cssTexts.light.length > 0) {
			createCSSSelector(ThemeType.Light, cssTexts.light);
			hasContent = true;
		}
		if (cssTexts.dark.length > 0) {
			createCSSSelector(ThemeType.Dark, cssTexts.dark);
			createCSSSelector(ThemeType.HighContrastBlack, cssTexts.dark);
			hasContent = true;
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

const enum ThemeType {
	Light = 0,
	Dark = 1,
	HighContrastBlack = 2
}
const enum ModelDecorationCSSRuleType {
	ClassName = 0,
	InlineClassName = 1,
	GlyphMarginClassName = 2,
	BeforeContentClassName = 3,
	AfterContentClassName = 4
}

class CSSNameHelper {

	private static _getSelectorPrefixOf(theme: ThemeType): string {
		if (theme === ThemeType.Light) {
			return '.monaco-editor.vs';
		}
		if (theme === ThemeType.Dark) {
			return '.monaco-editor.vs-dark';
		}
		return '.monaco-editor.hc-black';
	}

	public static getClassName(key: string, type: ModelDecorationCSSRuleType): string {
		return 'ced-' + key + '-' + type;
	}

	public static getSelector(themeType: ThemeType, key: string, parentKey: string, ruleType: ModelDecorationCSSRuleType): string {
		let selector = this._getSelectorPrefixOf(themeType) + ' .' + this.getClassName(key, ruleType);
		if (parentKey) {
			selector = selector + '.' + this.getClassName(parentKey, ruleType);
		}
		if (ruleType === ModelDecorationCSSRuleType.BeforeContentClassName) {
			selector += '::before';
		} else if (ruleType === ModelDecorationCSSRuleType.AfterContentClassName) {
			selector += '::after';
		}
		return selector;
	}

	public static getDeletionSubstring(key: string): string {
		return '.ced-' + key + '-';
	}
}

// ---- Normalize decoration render options per theme
interface IResolvedDecorationRenderOptions {
	light: IThemeDecorationRenderOptions;
	dark: IThemeDecorationRenderOptions;
}
function getThemedRenderOptions<T>(opts: { light?: T, dark?: T }): { light?: T, dark?: T } {
	// TODO@alex,joh - not really how/what deep clone is being used
	// for here but it will break the URI TODO@martin

	// let light = <T> objects.deepClone(opts);
	let light = <T>parse(stringify(opts));
	objects.mixin(light, opts.light);

	// let dark = <T> objects.deepClone(opts);
	let dark = <T>parse(stringify(opts));
	objects.mixin(dark, opts.dark);

	return {
		light: light,
		dark: dark
	};
}