/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../base/browser/dom.js';
import * as domStylesheets from '../../../base/browser/domStylesheets.js';
import * as cssJs from '../../../base/browser/cssValue.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore, Disposable, toDisposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import * as strings from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { isThemeColor } from '../../common/editorCommon.js';
import { OverviewRulerLane } from '../../common/model.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
let AbstractCodeEditorService = class AbstractCodeEditorService extends Disposable {
    constructor(_themeService) {
        super();
        this._themeService = _themeService;
        this._onWillCreateCodeEditor = this._register(new Emitter());
        this.onWillCreateCodeEditor = this._onWillCreateCodeEditor.event;
        this._onCodeEditorAdd = this._register(new Emitter());
        this.onCodeEditorAdd = this._onCodeEditorAdd.event;
        this._onCodeEditorRemove = this._register(new Emitter());
        this.onCodeEditorRemove = this._onCodeEditorRemove.event;
        this._onWillCreateDiffEditor = this._register(new Emitter());
        this.onWillCreateDiffEditor = this._onWillCreateDiffEditor.event;
        this._onDiffEditorAdd = this._register(new Emitter());
        this.onDiffEditorAdd = this._onDiffEditorAdd.event;
        this._onDiffEditorRemove = this._register(new Emitter());
        this.onDiffEditorRemove = this._onDiffEditorRemove.event;
        this._onDidChangeTransientModelProperty = this._register(new Emitter());
        this.onDidChangeTransientModelProperty = this._onDidChangeTransientModelProperty.event;
        this._onDecorationTypeRegistered = this._register(new Emitter());
        this.onDecorationTypeRegistered = this._onDecorationTypeRegistered.event;
        this._decorationOptionProviders = new Map();
        this._editorStyleSheets = new Map();
        this._codeEditorOpenHandlers = new LinkedList();
        this._transientWatchers = this._register(new DisposableMap());
        this._modelProperties = new Map();
        this._codeEditors = Object.create(null);
        this._diffEditors = Object.create(null);
        this._globalStyleSheet = null;
    }
    willCreateCodeEditor() {
        this._onWillCreateCodeEditor.fire();
    }
    addCodeEditor(editor) {
        this._codeEditors[editor.getId()] = editor;
        this._onCodeEditorAdd.fire(editor);
    }
    removeCodeEditor(editor) {
        if (delete this._codeEditors[editor.getId()]) {
            this._onCodeEditorRemove.fire(editor);
        }
    }
    listCodeEditors() {
        return Object.keys(this._codeEditors).map(id => this._codeEditors[id]);
    }
    willCreateDiffEditor() {
        this._onWillCreateDiffEditor.fire();
    }
    addDiffEditor(editor) {
        this._diffEditors[editor.getId()] = editor;
        this._onDiffEditorAdd.fire(editor);
    }
    removeDiffEditor(editor) {
        if (delete this._diffEditors[editor.getId()]) {
            this._onDiffEditorRemove.fire(editor);
        }
    }
    listDiffEditors() {
        return Object.keys(this._diffEditors).map(id => this._diffEditors[id]);
    }
    getFocusedCodeEditor() {
        let editorWithWidgetFocus = null;
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
    _getOrCreateGlobalStyleSheet() {
        if (!this._globalStyleSheet) {
            this._globalStyleSheet = this._createGlobalStyleSheet();
        }
        return this._globalStyleSheet;
    }
    _createGlobalStyleSheet() {
        return new GlobalStyleSheet(domStylesheets.createStyleSheet());
    }
    _getOrCreateStyleSheet(editor) {
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
        return this._editorStyleSheets.get(editorId);
    }
    _removeEditorStyleSheets(editorId) {
        this._editorStyleSheets.delete(editorId);
    }
    registerDecorationType(description, key, options, parentTypeKey, editor) {
        let provider = this._decorationOptionProviders.get(key);
        if (!provider) {
            const styleSheet = this._getOrCreateStyleSheet(editor);
            const providerArgs = {
                styleSheet: styleSheet,
                key: key,
                parentTypeKey: parentTypeKey,
                options: options || Object.create(null)
            };
            if (!parentTypeKey) {
                provider = new DecorationTypeOptionsProvider(description, this._themeService, styleSheet, providerArgs);
            }
            else {
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
    listDecorationTypes() {
        return Array.from(this._decorationOptionProviders.keys());
    }
    removeDecorationType(key) {
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
    resolveDecorationOptions(decorationTypeKey, writable) {
        const provider = this._decorationOptionProviders.get(decorationTypeKey);
        if (!provider) {
            throw new Error('Unknown decoration type key: ' + decorationTypeKey);
        }
        return provider.getOptions(this, writable);
    }
    resolveDecorationCSSRules(decorationTypeKey) {
        const provider = this._decorationOptionProviders.get(decorationTypeKey);
        if (!provider) {
            return null;
        }
        return provider.resolveDecorationCSSRules();
    }
    setModelProperty(resource, key, value) {
        const key1 = resource.toString();
        let dest;
        if (this._modelProperties.has(key1)) {
            dest = this._modelProperties.get(key1);
        }
        else {
            dest = new Map();
            this._modelProperties.set(key1, dest);
        }
        dest.set(key, value);
    }
    getModelProperty(resource, key) {
        const key1 = resource.toString();
        if (this._modelProperties.has(key1)) {
            const innerMap = this._modelProperties.get(key1);
            return innerMap.get(key);
        }
        return undefined;
    }
    setTransientModelProperty(model, key, value) {
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
    getTransientModelProperty(model, key) {
        const uri = model.uri.toString();
        const watcher = this._transientWatchers.get(uri);
        if (!watcher) {
            return undefined;
        }
        return watcher.get(key);
    }
    getTransientModelProperties(model) {
        const uri = model.uri.toString();
        const watcher = this._transientWatchers.get(uri);
        if (!watcher) {
            return undefined;
        }
        return watcher.keys().map(key => [key, watcher.get(key)]);
    }
    _removeWatcher(w) {
        this._transientWatchers.deleteAndDispose(w.uri);
    }
    async openCodeEditor(input, source, sideBySide) {
        for (const handler of this._codeEditorOpenHandlers) {
            const candidate = await handler(input, source, sideBySide);
            if (candidate !== null) {
                return candidate;
            }
        }
        return null;
    }
    registerCodeEditorOpenHandler(handler) {
        const rm = this._codeEditorOpenHandlers.unshift(handler);
        return toDisposable(rm);
    }
};
AbstractCodeEditorService = __decorate([
    __param(0, IThemeService)
], AbstractCodeEditorService);
export { AbstractCodeEditorService };
export class ModelTransientSettingWatcher extends Disposable {
    constructor(uri, model, owner) {
        super();
        this.uri = uri;
        this._values = {};
        this._register(model.onWillDispose(() => owner._removeWatcher(this)));
    }
    set(key, value) {
        this._values[key] = value;
    }
    get(key) {
        return this._values[key];
    }
    keys() {
        return Object.keys(this._values);
    }
}
class RefCountedStyleSheet {
    get sheet() {
        return this._styleSheet.sheet;
    }
    constructor(parent, editorId, styleSheet) {
        this._parent = parent;
        this._editorId = editorId;
        this._styleSheet = styleSheet;
        this._refCount = 0;
    }
    ref() {
        this._refCount++;
    }
    unref() {
        this._refCount--;
        if (this._refCount === 0) {
            this._styleSheet.remove();
            this._parent._removeEditorStyleSheets(this._editorId);
        }
    }
    insertRule(selector, rule) {
        domStylesheets.createCSSRule(selector, rule, this._styleSheet);
    }
    removeRulesContainingSelector(ruleName) {
        domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
    }
}
export class GlobalStyleSheet {
    get sheet() {
        return this._styleSheet.sheet;
    }
    constructor(styleSheet) {
        this._styleSheet = styleSheet;
    }
    ref() {
    }
    unref() {
    }
    insertRule(selector, rule) {
        domStylesheets.createCSSRule(selector, rule, this._styleSheet);
    }
    removeRulesContainingSelector(ruleName) {
        domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
    }
}
class DecorationSubTypeOptionsProvider {
    constructor(themeService, styleSheet, providerArgs) {
        this._styleSheet = styleSheet;
        this._styleSheet.ref();
        this._parentTypeKey = providerArgs.parentTypeKey;
        this.refCount = 0;
        this._beforeContentRules = new DecorationCSSRules(3 /* ModelDecorationCSSRuleType.BeforeContentClassName */, providerArgs, themeService);
        this._afterContentRules = new DecorationCSSRules(4 /* ModelDecorationCSSRuleType.AfterContentClassName */, providerArgs, themeService);
    }
    getOptions(codeEditorService, writable) {
        const options = codeEditorService.resolveDecorationOptions(this._parentTypeKey, true);
        if (this._beforeContentRules) {
            options.beforeContentClassName = this._beforeContentRules.className;
        }
        if (this._afterContentRules) {
            options.afterContentClassName = this._afterContentRules.className;
        }
        return options;
    }
    resolveDecorationCSSRules() {
        return this._styleSheet.sheet.cssRules;
    }
    dispose() {
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
class DecorationTypeOptionsProvider {
    constructor(description, themeService, styleSheet, providerArgs) {
        this._disposables = new DisposableStore();
        this.description = description;
        this._styleSheet = styleSheet;
        this._styleSheet.ref();
        this.refCount = 0;
        const createCSSRules = (type) => {
            const rules = new DecorationCSSRules(type, providerArgs, themeService);
            this._disposables.add(rules);
            if (rules.hasContent) {
                return rules.className;
            }
            return undefined;
        };
        const createInlineCSSRules = (type) => {
            const rules = new DecorationCSSRules(type, providerArgs, themeService);
            this._disposables.add(rules);
            if (rules.hasContent) {
                return { className: rules.className, hasLetterSpacing: rules.hasLetterSpacing };
            }
            return null;
        };
        this.className = createCSSRules(0 /* ModelDecorationCSSRuleType.ClassName */);
        const inlineData = createInlineCSSRules(1 /* ModelDecorationCSSRuleType.InlineClassName */);
        if (inlineData) {
            this.inlineClassName = inlineData.className;
            this.inlineClassNameAffectsLetterSpacing = inlineData.hasLetterSpacing;
        }
        this.beforeContentClassName = createCSSRules(3 /* ModelDecorationCSSRuleType.BeforeContentClassName */);
        this.afterContentClassName = createCSSRules(4 /* ModelDecorationCSSRuleType.AfterContentClassName */);
        if (providerArgs.options.beforeInjectedText && providerArgs.options.beforeInjectedText.contentText) {
            const beforeInlineData = createInlineCSSRules(5 /* ModelDecorationCSSRuleType.BeforeInjectedTextClassName */);
            this.beforeInjectedText = {
                content: providerArgs.options.beforeInjectedText.contentText,
                inlineClassName: beforeInlineData?.className,
                inlineClassNameAffectsLetterSpacing: beforeInlineData?.hasLetterSpacing || providerArgs.options.beforeInjectedText.affectsLetterSpacing
            };
        }
        if (providerArgs.options.afterInjectedText && providerArgs.options.afterInjectedText.contentText) {
            const afterInlineData = createInlineCSSRules(6 /* ModelDecorationCSSRuleType.AfterInjectedTextClassName */);
            this.afterInjectedText = {
                content: providerArgs.options.afterInjectedText.contentText,
                inlineClassName: afterInlineData?.className,
                inlineClassNameAffectsLetterSpacing: afterInlineData?.hasLetterSpacing || providerArgs.options.afterInjectedText.affectsLetterSpacing
            };
        }
        this.glyphMarginClassName = createCSSRules(2 /* ModelDecorationCSSRuleType.GlyphMarginClassName */);
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
        if (typeof lightOverviewRulerColor !== 'undefined'
            || typeof darkOverviewRulerColor !== 'undefined') {
            this.overviewRuler = {
                color: lightOverviewRulerColor || darkOverviewRulerColor,
                darkColor: darkOverviewRulerColor || lightOverviewRulerColor,
                position: options.overviewRulerLane || OverviewRulerLane.Center
            };
        }
    }
    getOptions(codeEditorService, writable) {
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
    resolveDecorationCSSRules() {
        return this._styleSheet.sheet.rules;
    }
    dispose() {
        this._disposables.dispose();
        this._styleSheet.unref();
    }
}
export const _CSS_MAP = {
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
    constructor(ruleType, providerArgs, themeService) {
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
        }
        else {
            this._themeListener = null;
        }
    }
    dispose() {
        if (this._hasContent) {
            this._removeCSS();
            this._hasContent = false;
        }
        if (this._themeListener) {
            this._themeListener.dispose();
            this._themeListener = null;
        }
    }
    get hasContent() {
        return this._hasContent;
    }
    get hasLetterSpacing() {
        return this._hasLetterSpacing;
    }
    get className() {
        return this._className;
    }
    _buildCSS() {
        const options = this._providerArgs.options;
        let unthemedCSS, lightCSS, darkCSS;
        switch (this._ruleType) {
            case 0 /* ModelDecorationCSSRuleType.ClassName */:
                unthemedCSS = this.getCSSTextForModelDecorationClassName(options);
                lightCSS = this.getCSSTextForModelDecorationClassName(options.light);
                darkCSS = this.getCSSTextForModelDecorationClassName(options.dark);
                break;
            case 1 /* ModelDecorationCSSRuleType.InlineClassName */:
                unthemedCSS = this.getCSSTextForModelDecorationInlineClassName(options);
                lightCSS = this.getCSSTextForModelDecorationInlineClassName(options.light);
                darkCSS = this.getCSSTextForModelDecorationInlineClassName(options.dark);
                break;
            case 2 /* ModelDecorationCSSRuleType.GlyphMarginClassName */:
                unthemedCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options);
                lightCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.light);
                darkCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.dark);
                break;
            case 3 /* ModelDecorationCSSRuleType.BeforeContentClassName */:
                unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.before);
                lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.before);
                darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.before);
                break;
            case 4 /* ModelDecorationCSSRuleType.AfterContentClassName */:
                unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.after);
                lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.after);
                darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.after);
                break;
            case 5 /* ModelDecorationCSSRuleType.BeforeInjectedTextClassName */:
                unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.beforeInjectedText);
                lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.beforeInjectedText);
                darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.beforeInjectedText);
                break;
            case 6 /* ModelDecorationCSSRuleType.AfterInjectedTextClassName */:
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
    _removeCSS() {
        this._providerArgs.styleSheet.removeRulesContainingSelector(this._unThemedSelector);
    }
    /**
     * Build the CSS for decorations styled via `className`.
     */
    getCSSTextForModelDecorationClassName(opts) {
        if (!opts) {
            return '';
        }
        const cssTextArr = [];
        this.collectCSSText(opts, ['backgroundColor'], cssTextArr);
        this.collectCSSText(opts, ['outline', 'outlineColor', 'outlineStyle', 'outlineWidth'], cssTextArr);
        this.collectBorderSettingsCSSText(opts, cssTextArr);
        return cssTextArr.join('');
    }
    /**
     * Build the CSS for decorations styled via `inlineClassName`.
     */
    getCSSTextForModelDecorationInlineClassName(opts) {
        if (!opts) {
            return '';
        }
        const cssTextArr = [];
        this.collectCSSText(opts, ['fontStyle', 'fontWeight', 'fontFamily', 'fontSize', 'textDecoration', 'cursor', 'color', 'opacity', 'letterSpacing'], cssTextArr);
        if (opts.letterSpacing) {
            this._hasLetterSpacing = true;
        }
        return cssTextArr.join('');
    }
    /**
     * Build the CSS for decorations styled before or after content.
     */
    getCSSTextForModelDecorationContentClassName(opts) {
        if (!opts) {
            return '';
        }
        const cssTextArr = [];
        if (typeof opts !== 'undefined') {
            this.collectBorderSettingsCSSText(opts, cssTextArr);
            if (typeof opts.contentIconPath !== 'undefined') {
                cssTextArr.push(strings.format(_CSS_MAP.contentIconPath, cssJs.asCSSUrl(URI.revive(opts.contentIconPath))));
            }
            if (typeof opts.contentText === 'string') {
                const truncated = opts.contentText.match(/^.*$/m)[0]; // only take first line
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
    getCSSTextForModelDecorationGlyphMarginClassName(opts) {
        if (!opts) {
            return '';
        }
        const cssTextArr = [];
        if (typeof opts.gutterIconPath !== 'undefined') {
            cssTextArr.push(strings.format(_CSS_MAP.gutterIconPath, cssJs.asCSSUrl(URI.revive(opts.gutterIconPath))));
            if (typeof opts.gutterIconSize !== 'undefined') {
                cssTextArr.push(strings.format(_CSS_MAP.gutterIconSize, opts.gutterIconSize));
            }
        }
        return cssTextArr.join('');
    }
    collectBorderSettingsCSSText(opts, cssTextArr) {
        if (this.collectCSSText(opts, ['border', 'borderColor', 'borderRadius', 'borderSpacing', 'borderStyle', 'borderWidth'], cssTextArr)) {
            cssTextArr.push(strings.format('box-sizing: border-box;'));
            return true;
        }
        return false;
    }
    collectCSSText(opts, properties, cssTextArr) {
        const lenBefore = cssTextArr.length;
        for (const property of properties) {
            const value = this.resolveValue(opts[property]);
            if (typeof value === 'string') {
                cssTextArr.push(strings.format(_CSS_MAP[property], value));
            }
        }
        return cssTextArr.length !== lenBefore;
    }
    resolveValue(value) {
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
var ModelDecorationCSSRuleType;
(function (ModelDecorationCSSRuleType) {
    ModelDecorationCSSRuleType[ModelDecorationCSSRuleType["ClassName"] = 0] = "ClassName";
    ModelDecorationCSSRuleType[ModelDecorationCSSRuleType["InlineClassName"] = 1] = "InlineClassName";
    ModelDecorationCSSRuleType[ModelDecorationCSSRuleType["GlyphMarginClassName"] = 2] = "GlyphMarginClassName";
    ModelDecorationCSSRuleType[ModelDecorationCSSRuleType["BeforeContentClassName"] = 3] = "BeforeContentClassName";
    ModelDecorationCSSRuleType[ModelDecorationCSSRuleType["AfterContentClassName"] = 4] = "AfterContentClassName";
    ModelDecorationCSSRuleType[ModelDecorationCSSRuleType["BeforeInjectedTextClassName"] = 5] = "BeforeInjectedTextClassName";
    ModelDecorationCSSRuleType[ModelDecorationCSSRuleType["AfterInjectedTextClassName"] = 6] = "AfterInjectedTextClassName";
})(ModelDecorationCSSRuleType || (ModelDecorationCSSRuleType = {}));
class CSSNameHelper {
    static getClassName(key, type) {
        return 'ced-' + key + '-' + type;
    }
    static getSelector(key, parentKey, ruleType) {
        let selector = '.monaco-editor .' + this.getClassName(key, ruleType);
        if (parentKey) {
            selector = selector + '.' + this.getClassName(parentKey, ruleType);
        }
        if (ruleType === 3 /* ModelDecorationCSSRuleType.BeforeContentClassName */) {
            selector += '::before';
        }
        else if (ruleType === 4 /* ModelDecorationCSSRuleType.AfterContentClassName */) {
            selector += '::after';
        }
        return selector;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2Fic3RyYWN0Q29kZUVkaXRvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEtBQUssY0FBYyxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sS0FBSyxLQUFLLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBZSxlQUFlLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxSCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFHbEQsT0FBTyxFQUE0RixZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN0SixPQUFPLEVBQWtHLGlCQUFpQixFQUEwQixNQUFNLHVCQUF1QixDQUFDO0FBRWxMLE9BQU8sRUFBZSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUdyRixJQUFlLHlCQUF5QixHQUF4QyxNQUFlLHlCQUEwQixTQUFRLFVBQVU7SUFtQ2pFLFlBQ2dCLGFBQTZDO1FBRTVELEtBQUssRUFBRSxDQUFDO1FBRndCLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBaEM1Qyw0QkFBdUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUMvRCwyQkFBc0Is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