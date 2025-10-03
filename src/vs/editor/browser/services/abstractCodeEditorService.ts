/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import * as domStylesheets from '../../../base/browser/domStylesheets.js';
import * as cssJs from '../../../base/browser/cssValue.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IDisposable, DisposableStore, Disposable, toDisposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import * as strings from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { ICodeEditor, IDiffEditor } from '../editorBrowser.js';
import { ICodeEditorOpenHandler, ICodeEditorService } from './codeEditorService.js';
import { IContentDecorationRenderOptions, IDecorationRenderOptions, IThemeDecorationRenderOptions, isThemeColor } from '../../common/editorCommon.js';
import { IModelDecorationOptions, IModelDecorationOverviewRulerOptions, InjectedTextOptions, ITextModel, OverviewRulerLane, TrackedRangeStickiness } from '../../common/model.js';
import { IResourceEditorInput } from '../../../platform/editor/common/editor.js';
import { IColorTheme, IThemeService } from '../../../platform/theme/common/themeService.js';
import { ThemeColor } from '../../../base/common/themables.js';

export abstract class AbstractCodeEditorService extends Disposable implements ICodeEditorService {

	declare readonly _serviceBrand: undefined;

	private readonly _onWillCreateCodeEditor = this._register(new Emitter<void>());
	public readonly onWillCreateCodeEditor = this._onWillCreateCodeEditor.event;

	private readonly _onCodeEditorAdd: Emitter<ICodeEditor> = this._register(new Emitter<ICodeEditor>());
	public readonly onCodeEditorAdd: Event<ICodeEditor> = this._onCodeEditorAdd.event;

	private readonly _onCodeEditorRemove: Emitter<ICodeEditor> = this._register(new Emitter<ICodeEditor>());
	public readonly onCodeEditorRemove: Event<ICodeEditor> = this._onCodeEditorRemove.event;

	private readonly _onWillCreateDiffEditor = this._register(new Emitter<void>());
	public readonly onWillCreateDiffEditor = this._onWillCreateDiffEditor.event;

	private readonly _onDiffEditorAdd: Emitter<IDiffEditor> = this._register(new Emitter<IDiffEditor>());
	public readonly onDiffEditorAdd: Event<IDiffEditor> = this._onDiffEditorAdd.event;

	private readonly _onDiffEditorRemove: Emitter<IDiffEditor> = this._register(new Emitter<IDiffEditor>());
	public readonly onDiffEditorRemove: Event<IDiffEditor> = this._onDiffEditorRemove.event;

	private readonly _onDidChangeTransientModelProperty: Emitter<ITextModel> = this._register(new Emitter<ITextModel>());
	public readonly onDidChangeTransientModelProperty: Event<ITextModel> = this._onDidChangeTransientModelProperty.event;

	protected readonly _onDecorationTypeRegistered: Emitter<string> = this._register(new Emitter<string>());
	public onDecorationTypeRegistered: Event<string> = this._onDecorationTypeRegistered.event;

	private readonly _codeEditors: { [editorId: string]: ICodeEditor };
	private readonly _diffEditors: { [editorId: string]: IDiffEditor };
	protected _globalStyleSheet: GlobalStyleSheet | null;
	private readonly _decorationOptionProviders = new Map<string, IModelDecorationOptionsProvider>();
	private readonly _editorStyleSheets = new Map<string, RefCountedStyleSheet>();
	private readonly _codeEditorOpenHandlers = new LinkedList<ICodeEditorOpenHandler>();

	constructor(
		@IThemeService private readonly _themeService: IThemeService,
	) {
		super();
		this._codeEditors = Object.create(null);
		this._diffEditors = Object.create(null);
		this._globalStyleSheet = null;
	}

	willCreateCodeEditor(): void {
		this._onWillCreateCodeEditor.fire();
	}

	addCodeEditor(editor: ICodeEditor): void {
		this._codeEditors[editor.getId()] = editor;
		this._onCodeEditorAdd.fire(editor);
	}

	removeCodeEditor(editor: ICodeEditor): void {
		if (delete this._codeEditors[editor.getId()]) {
			this._onCodeEditorRemove.fire(editor);
		}
	}

	listCodeEditors(): ICodeEditor[] {
		return Object.keys(this._codeEditors).map(id => this._codeEditors[id]);
	}

	willCreateDiffEditor(): void {
		this._onWillCreateDiffEditor.fire();
	}

	addDiffEditor(editor: IDiffEditor): void {
		this._diffEditors[editor.getId()] = editor;
		this._onDiffEditorAdd.fire(editor);
	}

	removeDiffEditor(editor: IDiffEditor): void {
		if (delete this._diffEditors[editor.getId()]) {
			this._onDiffEditorRemove.fire(editor);
		}
	}

	listDiffEditors(): IDiffEditor[] {
		return Object.keys(this._diffEditors).map(id => this._diffEditors[id]);
	}

	getFocusedCodeEditor(): ICodeEditor | null {
		let editorWithWidgetFocus: ICodeEditor | null = null;

		const editors = this.listCodeEditors();
		for (const editor of editors) {

			if (editor.hasTextFocus()) {
				// bingo!
				return editor;
			}

			if (editor.hasWidgetFocus()) {
				editorWithWidgetFocus = editor;
			}
		}

		return editorWithWidgetFocus;
	}


	private _getOrCreateGlobalStyleSheet(): GlobalStyleSheet {
		if (!this._globalStyleSheet) {
			this._globalStyleSheet = this._createGlobalStyleSheet();
		}
		return this._globalStyleSheet;
	}

	protected _createGlobalStyleSheet(): GlobalStyleSheet {
		return new GlobalStyleSheet(domStylesheets.createStyleSheet());
	}

	private _getOrCreateStyleSheet(editor: ICodeEditor | undefined): GlobalStyleSheet | RefCountedStyleSheet {
		if (!editor) {
			return this._getOrCreateGlobalStyleSheet();
		}
		const domNode = editor.getContainerDomNode();
		if (!dom.isInShadowDOM(domNode)) {
			return this._getOrCreateGlobalStyleSheet();
		}
		const editorId = editor.getId();
		if (!this._editorStyleSheets.has(editorId)) {
			const refCountedStyleSheet = new RefCountedStyleSheet(this, editorId, domStylesheets.createStyleSheet(domNode));
			this._editorStyleSheets.set(editorId, refCountedStyleSheet);
		}
		return this._editorStyleSheets.get(editorId)!;
	}

	_removeEditorStyleSheets(editorId: string): void {
		this._editorStyleSheets.delete(editorId);
	}

	public registerDecorationType(description: string, key: string, options: IDecorationRenderOptions, parentTypeKey?: string, editor?: ICodeEditor): IDisposable {
		let provider = this._decorationOptionProviders.get(key);
		if (!provider) {
			const styleSheet = this._getOrCreateStyleSheet(editor);
			const providerArgs: ProviderArguments = {
				styleSheet: styleSheet,
				key: key,
				parentTypeKey: parentTypeKey,
				options: options || Object.create(null)
			};
			if (!parentTypeKey) {
				provider = new DecorationTypeOptionsProvider(description, this._themeService, styleSheet, providerArgs);
			} else {
				provider = new DecorationSubTypeOptionsProvider(this._themeService, styleSheet, providerArgs);
			}
			this._decorationOptionProviders.set(key, provider);
			this._onDecorationTypeRegistered.fire(key);
		}
		provider.refCount++;
		return {
			dispose: () => {
				this.removeDecorationType(key);
			}
		};
	}

	public listDecorationTypes(): string[] {
		return Array.from(this._decorationOptionProviders.keys());
	}

	public removeDecorationType(key: string): void {
		const provider = this._decorationOptionProviders.get(key);
		if (provider) {
			provider.refCount--;
			if (provider.refCount <= 0) {
				this._decorationOptionProviders.delete(key);
				provider.dispose();
				this.listCodeEditors().forEach((ed) => ed.removeDecorationsByType(key));
			}
		}
	}

	public resolveDecorationOptions(decorationTypeKey: string, writable: boolean): IModelDecorationOptions {
		const provider = this._decorationOptionProviders.get(decorationTypeKey);
		if (!provider) {
			throw new Error('Unknown decoration type key: ' + decorationTypeKey);
		}
		return provider.getOptions(this, writable);
	}

	public resolveDecorationCSSRules(decorationTypeKey: string) {
		const provider = this._decorationOptionProviders.get(decorationTypeKey);
		if (!provider) {
			return null;
		}
		return provider.resolveDecorationCSSRules();
	}

	private readonly _transientWatchers = this._register(new DisposableMap<string, ModelTransientSettingWatcher>());
	private readonly _modelProperties = new Map<string, Map<string, any>>();

	public setModelProperty(resource: URI, key: string, value: any): void {
		const key1 = resource.toString();
		let dest: Map<string, any>;
		if (this._modelProperties.has(key1)) {
			dest = this._modelProperties.get(key1)!;
		} else {
			dest = new Map<string, any>();
			this._modelProperties.set(key1, dest);
		}

		dest.set(key, value);
	}

	public getModelProperty(resource: URI, key: string): any {
		const key1 = resource.toString();
		if (this._modelProperties.has(key1)) {
			const innerMap = this._modelProperties.get(key1)!;
			return innerMap.get(key);
		}
		return undefined;
	}

	public setTransientModelProperty(model: ITextModel, key: string, value: any): void {
		const uri = model.uri.toString();

		let w = this._transientWatchers.get(uri);
		if (!w) {
			w = new ModelTransientSettingWatcher(uri, model, this);
			this._transientWatchers.set(uri, w);
		}

		const previousValue = w.get(key);
		if (previousValue !== value) {
			w.set(key, value);
			this._onDidChangeTransientModelProperty.fire(model);
		}
	}

	public getTransientModelProperty(model: ITextModel, key: string): any {
		const uri = model.uri.toString();

		const watcher = this._transientWatchers.get(uri);
		if (!watcher) {
			return undefined;
		}

		return watcher.get(key);
	}

	public getTransientModelProperties(model: ITextModel): [string, any][] | undefined {
		const uri = model.uri.toString();

		const watcher = this._transientWatchers.get(uri);
		if (!watcher) {
			return undefined;
		}

		return watcher.keys().map(key => [key, watcher.get(key)]);
	}

	_removeWatcher(w: ModelTransientSettingWatcher): void {
		this._transientWatchers.deleteAndDispose(w.uri);
	}

	abstract getActiveCodeEditor(): ICodeEditor | null;

	async openCodeEditor(input: IResourceEditorInput, source: ICodeEditor | null, sideBySide?: boolean): Promise<ICodeEditor | null> {
		for (const handler of this._codeEditorOpenHandlers) {
			const candidate = await handler(input, source, sideBySide);
			if (candidate !== null) {
				return candidate;
			}
		}
		return null;
	}

	registerCodeEditorOpenHandler(handler: ICodeEditorOpenHandler): IDisposable {
		const rm = this._codeEditorOpenHandlers.unshift(handler);
		return toDisposable(rm);
	}
}

export class ModelTransientSettingWatcher extends Disposable {
	public readonly uri: string;
	private readonly _values: { [key: string]: any };

	constructor(uri: string, model: ITextModel, owner: AbstractCodeEditorService) {
		super();

		this.uri = uri;
		this._values = {};
		this._register(model.onWillDispose(() => owner._removeWatcher(this)));
	}

	public set(key: string, value: any): void {
		this._values[key] = value;
	}

	public get(key: string): any {
		return this._values[key];
	}

	public keys(): string[] {
		return Object.keys(this._values);
	}
}

class RefCountedStyleSheet {

	private readonly _parent: AbstractCodeEditorService;
	private readonly _editorId: string;
	private readonly _styleSheet: HTMLStyleElement;
	private _refCount: number;

	public get sheet() {
		return this._styleSheet.sheet as CSSStyleSheet;
	}

	constructor(parent: AbstractCodeEditorService, editorId: string, styleSheet: HTMLStyleElement) {
		this._parent = parent;
		this._editorId = editorId;
		this._styleSheet = styleSheet;
		this._refCount = 0;
	}

	public ref(): void {
		this._refCount++;
	}

	public unref(): void {
		this._refCount--;
		if (this._refCount === 0) {
			this._styleSheet.remove();
			this._parent._removeEditorStyleSheets(this._editorId);
		}
	}

	public insertRule(selector: string, rule: string): void {
		domStylesheets.createCSSRule(selector, rule, this._styleSheet);
	}

	public removeRulesContainingSelector(ruleName: string): void {
		domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
	}
}

export class GlobalStyleSheet {
	private readonly _styleSheet: HTMLStyleElement;

	public get sheet() {
		return this._styleSheet.sheet as CSSStyleSheet;
	}

	constructor(styleSheet: HTMLStyleElement) {
		this._styleSheet = styleSheet;
	}

	public ref(): void {
	}

	public unref(): void {
	}

	public insertRule(selector: string, rule: string): void {
		domStylesheets.createCSSRule(selector, rule, this._styleSheet);
	}

	public removeRulesContainingSelector(ruleName: string): void {
		domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
	}
}

interface IModelDecorationOptionsProvider extends IDisposable {
	refCount: number;
	getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions;
	resolveDecorationCSSRules(): CSSRuleList;
}

class DecorationSubTypeOptionsProvider implements IModelDecorationOptionsProvider {

	private readonly _styleSheet: GlobalStyleSheet | RefCountedStyleSheet;
	public refCount: number;

	private readonly _parentTypeKey: string;
	private _beforeContentRules: DecorationCSSRules | null;
	private _afterContentRules: DecorationCSSRules | null;

	constructor(themeService: IThemeService, styleSheet: GlobalStyleSheet | RefCountedStyleSheet, providerArgs: ProviderArguments) {
		this._styleSheet = styleSheet;
		this._styleSheet.ref();
		this._parentTypeKey = providerArgs.parentTypeKey!;
		this.refCount = 0;

		this._beforeContentRules = new DecorationCSSRules(ModelDecorationCSSRuleType.BeforeContentClassName, providerArgs, themeService);
		this._afterContentRules = new DecorationCSSRules(ModelDecorationCSSRuleType.AfterContentClassName, providerArgs, themeService);
	}

	public getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions {
		const options = codeEditorService.resolveDecorationOptions(this._parentTypeKey, true);
		if (this._beforeContentRules) {
			options.beforeContentClassName = this._beforeContentRules.className;
		}
		if (this._afterContentRules) {
			options.afterContentClassName = this._afterContentRules.className;
		}
		return options;
	}

	public resolveDecorationCSSRules(): CSSRuleList {
		return this._styleSheet.sheet.cssRules;
	}

	public dispose(): void {
		if (this._beforeContentRules) {
			this._beforeContentRules.dispose();
			this._beforeContentRules = null;
		}
		if (this._afterContentRules) {
			this._afterContentRules.dispose();
			this._afterContentRules = null;
		}
		this._styleSheet.unref();
	}
}

interface ProviderArguments {
	styleSheet: GlobalStyleSheet | RefCountedStyleSheet;
	key: string;
	parentTypeKey?: string;
	options: IDecorationRenderOptions;
}


class DecorationTypeOptionsProvider implements IModelDecorationOptionsProvider {

	private readonly _disposables = new DisposableStore();
	private readonly _styleSheet: GlobalStyleSheet | RefCountedStyleSheet;
	public refCount: number;

	public description: string;
	public className: string | undefined;
	public inlineClassName: string | undefined;
	public inlineClassNameAffectsLetterSpacing: boolean | undefined;
	public beforeContentClassName: string | undefined;
	public afterContentClassName: string | undefined;
	public glyphMarginClassName: string | undefined;
	public isWholeLine: boolean;
	public lineHeight: number | undefined;
	public fontSize: string | undefined;
	public fontFamily: string | undefined;
	public fontWeight: string | undefined;
	public fontStyle: string | undefined;
	public overviewRuler: IModelDecorationOverviewRulerOptions | undefined;
	public stickiness: TrackedRangeStickiness | undefined;
	public beforeInjectedText: InjectedTextOptions | undefined;
	public afterInjectedText: InjectedTextOptions | undefined;

	constructor(description: string, themeService: IThemeService, styleSheet: GlobalStyleSheet | RefCountedStyleSheet, providerArgs: ProviderArguments) {
		this.description = description;

		this._styleSheet = styleSheet;
		this._styleSheet.ref();
		this.refCount = 0;

		const createCSSRules = (type: ModelDecorationCSSRuleType) => {
			const rules = new DecorationCSSRules(type, providerArgs, themeService);
			this._disposables.add(rules);
			if (rules.hasContent) {
				return rules.className;
			}
			return undefined;
		};
		const createInlineCSSRules = (type: ModelDecorationCSSRuleType) => {
			const rules = new DecorationCSSRules(type, providerArgs, themeService);
			this._disposables.add(rules);
			if (rules.hasContent) {
				return { className: rules.className, hasLetterSpacing: rules.hasLetterSpacing };
			}
			return null;
		};

		this.className = createCSSRules(ModelDecorationCSSRuleType.ClassName);
		const inlineData = createInlineCSSRules(ModelDecorationCSSRuleType.InlineClassName);
		if (inlineData) {
			this.inlineClassName = inlineData.className;
			this.inlineClassNameAffectsLetterSpacing = inlineData.hasLetterSpacing;
		}
		this.beforeContentClassName = createCSSRules(ModelDecorationCSSRuleType.BeforeContentClassName);
		this.afterContentClassName = createCSSRules(ModelDecorationCSSRuleType.AfterContentClassName);

		if (providerArgs.options.beforeInjectedText && providerArgs.options.beforeInjectedText.contentText) {
			const beforeInlineData = createInlineCSSRules(ModelDecorationCSSRuleType.BeforeInjectedTextClassName);
			this.beforeInjectedText = {
				content: providerArgs.options.beforeInjectedText.contentText,
				inlineClassName: beforeInlineData?.className,
				inlineClassNameAffectsLetterSpacing: beforeInlineData?.hasLetterSpacing || providerArgs.options.beforeInjectedText.affectsLetterSpacing
			};
		}

		if (providerArgs.options.afterInjectedText && providerArgs.options.afterInjectedText.contentText) {
			const afterInlineData = createInlineCSSRules(ModelDecorationCSSRuleType.AfterInjectedTextClassName);
			this.afterInjectedText = {
				content: providerArgs.options.afterInjectedText.contentText,
				inlineClassName: afterInlineData?.className,
				inlineClassNameAffectsLetterSpacing: afterInlineData?.hasLetterSpacing || providerArgs.options.afterInjectedText.affectsLetterSpacing
			};
		}

		this.glyphMarginClassName = createCSSRules(ModelDecorationCSSRuleType.GlyphMarginClassName);

		const options = providerArgs.options;
		this.isWholeLine = Boolean(options.isWholeLine);
		this.lineHeight = options.lineHeight;
		this.fontFamily = options.fontFamily;
		this.fontSize = options.fontSize;
		this.fontWeight = options.fontWeight;
		this.fontStyle = options.fontStyle;
		this.stickiness = options.rangeBehavior;

		const lightOverviewRulerColor = options.light && options.light.overviewRulerColor || options.overviewRulerColor;
		const darkOverviewRulerColor = options.dark && options.dark.overviewRulerColor || options.overviewRulerColor;
		if (
			typeof lightOverviewRulerColor !== 'undefined'
			|| typeof darkOverviewRulerColor !== 'undefined'
		) {
			this.overviewRuler = {
				color: lightOverviewRulerColor || darkOverviewRulerColor,
				darkColor: darkOverviewRulerColor || lightOverviewRulerColor,
				position: options.overviewRulerLane || OverviewRulerLane.Center
			};
		}
	}

	public getOptions(codeEditorService: AbstractCodeEditorService, writable: boolean): IModelDecorationOptions {
		if (!writable) {
			return this;
		}

		return {
			description: this.description,
			inlineClassName: this.inlineClassName,
			beforeContentClassName: this.beforeContentClassName,
			afterContentClassName: this.afterContentClassName,
			className: this.className,
			glyphMarginClassName: this.glyphMarginClassName,
			isWholeLine: this.isWholeLine,
			lineHeight: this.lineHeight,
			fontFamily: this.fontFamily,
			fontSize: this.fontSize,
			fontWeight: this.fontWeight,
			fontStyle: this.fontStyle,
			overviewRuler: this.overviewRuler,
			stickiness: this.stickiness,
			before: this.beforeInjectedText,
			after: this.afterInjectedText
		};
	}

	public resolveDecorationCSSRules(): CSSRuleList {
		return this._styleSheet.sheet.rules;
	}

	public dispose(): void {
		this._disposables.dispose();
		this._styleSheet.unref();
	}
}


export const _CSS_MAP: { [prop: string]: string } = {
	color: 'color:{0} !important;',
	opacity: 'opacity:{0};',
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

	fontStyle: 'font-style:{0};',
	fontWeight: 'font-weight:{0};',
	fontSize: 'font-size:{0};',
	fontFamily: 'font-family:{0};',
	textDecoration: 'text-decoration:{0};',
	cursor: 'cursor:{0};',
	letterSpacing: 'letter-spacing:{0};',

	gutterIconPath: 'background:{0} center center no-repeat;',
	gutterIconSize: 'background-size:{0};',

	contentText: 'content:\'{0}\';',
	contentIconPath: 'content:{0};',
	margin: 'margin:{0};',
	padding: 'padding:{0};',
	width: 'width:{0};',
	height: 'height:{0};',

	verticalAlign: 'vertical-align:{0};',
};


class DecorationCSSRules {

	private _theme: IColorTheme;
	private readonly _className: string;
	private readonly _unThemedSelector: string;
	private _hasContent: boolean;
	private _hasLetterSpacing: boolean;
	private readonly _ruleType: ModelDecorationCSSRuleType;
	private _themeListener: IDisposable | null;
	private readonly _providerArgs: ProviderArguments;
	private _usesThemeColors: boolean;

	constructor(ruleType: ModelDecorationCSSRuleType, providerArgs: ProviderArguments, themeService: IThemeService) {
		this._theme = themeService.getColorTheme();
		this._ruleType = ruleType;
		this._providerArgs = providerArgs;
		this._usesThemeColors = false;
		this._hasContent = false;
		this._hasLetterSpacing = false;

		let className = CSSNameHelper.getClassName(this._providerArgs.key, ruleType);
		if (this._providerArgs.parentTypeKey) {
			className = className + ' ' + CSSNameHelper.getClassName(this._providerArgs.parentTypeKey, ruleType);
		}
		this._className = className;

		this._unThemedSelector = CSSNameHelper.getSelector(this._providerArgs.key, this._providerArgs.parentTypeKey, ruleType);

		this._buildCSS();

		if (this._usesThemeColors) {
			this._themeListener = themeService.onDidColorThemeChange(theme => {
				this._theme = themeService.getColorTheme();
				this._removeCSS();
				this._buildCSS();
			});
		} else {
			this._themeListener = null;
		}
	}

	public dispose() {
		if (this._hasContent) {
			this._removeCSS();
			this._hasContent = false;
		}
		if (this._themeListener) {
			this._themeListener.dispose();
			this._themeListener = null;
		}
	}

	public get hasContent(): boolean {
		return this._hasContent;
	}

	public get hasLetterSpacing(): boolean {
		return this._hasLetterSpacing;
	}

	public get className(): string {
		return this._className;
	}

	private _buildCSS(): void {
		const options = this._providerArgs.options;
		let unthemedCSS: string, lightCSS: string, darkCSS: string;
		switch (this._ruleType) {
			case ModelDecorationCSSRuleType.ClassName:
				unthemedCSS = this.getCSSTextForModelDecorationClassName(options);
				lightCSS = this.getCSSTextForModelDecorationClassName(options.light);
				darkCSS = this.getCSSTextForModelDecorationClassName(options.dark);
				break;
			case ModelDecorationCSSRuleType.InlineClassName:
				unthemedCSS = this.getCSSTextForModelDecorationInlineClassName(options);
				lightCSS = this.getCSSTextForModelDecorationInlineClassName(options.light);
				darkCSS = this.getCSSTextForModelDecorationInlineClassName(options.dark);
				break;
			case ModelDecorationCSSRuleType.GlyphMarginClassName:
				unthemedCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options);
				lightCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.light);
				darkCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.dark);
				break;
			case ModelDecorationCSSRuleType.BeforeContentClassName:
				unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.before);
				lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.before);
				darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.before);
				break;
			case ModelDecorationCSSRuleType.AfterContentClassName:
				unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.after);
				lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.after);
				darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.after);
				break;
			case ModelDecorationCSSRuleType.BeforeInjectedTextClassName:
				unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.beforeInjectedText);
				lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.beforeInjectedText);
				darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.beforeInjectedText);
				break;
			case ModelDecorationCSSRuleType.AfterInjectedTextClassName:
				unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.afterInjectedText);
				lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.afterInjectedText);
				darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.afterInjectedText);
				break;
			default:
				throw new Error('Unknown rule type: ' + this._ruleType);
		}
		const sheet = this._providerArgs.styleSheet;

		let hasContent = false;
		if (unthemedCSS.length > 0) {
			sheet.insertRule(this._unThemedSelector, unthemedCSS);
			hasContent = true;
		}
		if (lightCSS.length > 0) {
			sheet.insertRule(`.vs${this._unThemedSelector}, .hc-light${this._unThemedSelector}`, lightCSS);
			hasContent = true;
		}
		if (darkCSS.length > 0) {
			sheet.insertRule(`.vs-dark${this._unThemedSelector}, .hc-black${this._unThemedSelector}`, darkCSS);
			hasContent = true;
		}
		this._hasContent = hasContent;
	}

	private _removeCSS(): void {
		this._providerArgs.styleSheet.removeRulesContainingSelector(this._unThemedSelector);
	}

	/**
	 * Build the CSS for decorations styled via `className`.
	 */
	private getCSSTextForModelDecorationClassName(opts: IThemeDecorationRenderOptions | undefined): string {
		if (!opts) {
			return '';
		}
		const cssTextArr: string[] = [];
		this.collectCSSText(opts, ['backgroundColor'], cssTextArr);
		this.collectCSSText(opts, ['outline', 'outlineColor', 'outlineStyle', 'outlineWidth'], cssTextArr);
		this.collectBorderSettingsCSSText(opts, cssTextArr);
		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `inlineClassName`.
	 */
	private getCSSTextForModelDecorationInlineClassName(opts: IThemeDecorationRenderOptions | undefined): string {
		if (!opts) {
			return '';
		}
		const cssTextArr: string[] = [];
		this.collectCSSText(opts, ['fontStyle', 'fontWeight', 'fontFamily', 'fontSize', 'textDecoration', 'cursor', 'color', 'opacity', 'letterSpacing'], cssTextArr);
		if (opts.letterSpacing) {
			this._hasLetterSpacing = true;
		}
		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled before or after content.
	 */
	private getCSSTextForModelDecorationContentClassName(opts: IContentDecorationRenderOptions | undefined): string {
		if (!opts) {
			return '';
		}
		const cssTextArr: string[] = [];

		if (typeof opts !== 'undefined') {
			this.collectBorderSettingsCSSText(opts, cssTextArr);
			if (typeof opts.contentIconPath !== 'undefined') {
				cssTextArr.push(strings.format(_CSS_MAP.contentIconPath, cssJs.asCSSUrl(URI.revive(opts.contentIconPath))));
			}
			if (typeof opts.contentText === 'string') {
				const truncated = opts.contentText.match(/^.*$/m)![0]; // only take first line
				const escaped = truncated.replace(/['\\]/g, '\\$&');

				cssTextArr.push(strings.format(_CSS_MAP.contentText, escaped));
			}
			this.collectCSSText(opts, ['verticalAlign', 'fontStyle', 'fontWeight', 'fontSize', 'fontFamily', 'textDecoration', 'color', 'opacity', 'backgroundColor', 'margin', 'padding'], cssTextArr);
			if (this.collectCSSText(opts, ['width', 'height'], cssTextArr)) {
				cssTextArr.push('display:inline-block;');
			}
		}

		return cssTextArr.join('');
	}

	/**
	 * Build the CSS for decorations styled via `glyphMarginClassName`.
	 */
	private getCSSTextForModelDecorationGlyphMarginClassName(opts: IThemeDecorationRenderOptions | undefined): string {
		if (!opts) {
			return '';
		}
		const cssTextArr: string[] = [];

		if (typeof opts.gutterIconPath !== 'undefined') {
			cssTextArr.push(strings.format(_CSS_MAP.gutterIconPath, cssJs.asCSSUrl(URI.revive(opts.gutterIconPath))));
			if (typeof opts.gutterIconSize !== 'undefined') {
				cssTextArr.push(strings.format(_CSS_MAP.gutterIconSize, opts.gutterIconSize));
			}
		}

		return cssTextArr.join('');
	}

	private collectBorderSettingsCSSText(opts: any, cssTextArr: string[]): boolean {
		if (this.collectCSSText(opts, ['border', 'borderColor', 'borderRadius', 'borderSpacing', 'borderStyle', 'borderWidth'], cssTextArr)) {
			cssTextArr.push(strings.format('box-sizing: border-box;'));
			return true;
		}
		return false;
	}

	private collectCSSText(opts: any, properties: string[], cssTextArr: string[]): boolean {
		const lenBefore = cssTextArr.length;
		for (const property of properties) {
			const value = this.resolveValue(opts[property]);
			if (typeof value === 'string') {
				cssTextArr.push(strings.format(_CSS_MAP[property], value));
			}
		}
		return cssTextArr.length !== lenBefore;
	}

	private resolveValue(value: string | ThemeColor): string {
		if (isThemeColor(value)) {
			this._usesThemeColors = true;
			const color = this._theme.getColor(value.id);
			if (color) {
				return color.toString();
			}
			return 'transparent';
		}
		return value;
	}
}

const enum ModelDecorationCSSRuleType {
	ClassName = 0,
	InlineClassName = 1,
	GlyphMarginClassName = 2,
	BeforeContentClassName = 3,
	AfterContentClassName = 4,
	BeforeInjectedTextClassName = 5,
	AfterInjectedTextClassName = 6,
}

class CSSNameHelper {

	public static getClassName(key: string, type: ModelDecorationCSSRuleType): string {
		return 'ced-' + key + '-' + type;
	}

	public static getSelector(key: string, parentKey: string | undefined, ruleType: ModelDecorationCSSRuleType): string {
		let selector = '.monaco-editor .' + this.getClassName(key, ruleType);
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
}
