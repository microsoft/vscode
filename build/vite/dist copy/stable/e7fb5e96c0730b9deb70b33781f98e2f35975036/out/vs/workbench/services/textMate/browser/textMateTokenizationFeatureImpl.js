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
var TextMateTokenizationFeature_1;
import { canASAR, importAMDNodeModule, resolveAmdNodeModulePath } from '../../../../amdX.js';
import * as domStylesheets from '../../../../base/browser/domStylesheets.js';
import { equals as equalArray } from '../../../../base/common/arrays.js';
import { Color } from '../../../../base/common/color.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../../base/common/network.js';
import { observableFromEvent } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import * as types from '../../../../base/common/types.js';
import { LazyTokenizationSupport, TokenizationRegistry } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap, generateTokensCSSForFontMap } from '../../../../editor/common/languages/supports/tokenization.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { TextMateTokenizationSupport } from './tokenizationSupport/textMateTokenizationSupport.js';
import { TokenizationSupportWithLineLimit } from './tokenizationSupport/tokenizationSupportWithLineLimit.js';
import { ThreadedBackgroundTokenizerFactory } from './backgroundTokenization/threadedBackgroundTokenizerFactory.js';
import { TMGrammarFactory, missingTMGrammarErrorMessage } from '../common/TMGrammarFactory.js';
import { grammarsExtPoint } from '../common/TMGrammars.js';
import { IWorkbenchThemeService } from '../../themes/common/workbenchThemeService.js';
let TextMateTokenizationFeature = class TextMateTokenizationFeature extends Disposable {
    static { TextMateTokenizationFeature_1 = this; }
    static { this.reportTokenizationTimeCounter = { sync: 0, async: 0 }; }
    constructor(_languageService, _themeService, _extensionResourceLoaderService, _notificationService, _logService, _configurationService, _progressService, _environmentService, _instantiationService, _telemetryService) {
        super();
        this._languageService = _languageService;
        this._themeService = _themeService;
        this._extensionResourceLoaderService = _extensionResourceLoaderService;
        this._notificationService = _notificationService;
        this._logService = _logService;
        this._configurationService = _configurationService;
        this._progressService = _progressService;
        this._environmentService = _environmentService;
        this._instantiationService = _instantiationService;
        this._telemetryService = _telemetryService;
        this._createdModes = [];
        this._encounteredLanguages = [];
        this._debugMode = false;
        this._debugModePrintFunc = () => { };
        this._grammarDefinitions = null;
        this._grammarFactory = null;
        this._tokenizersRegistrations = this._register(new DisposableStore());
        this._currentTheme = null;
        this._currentTokenColorMap = null;
        this._currentTokenFontMap = null;
        this._threadedBackgroundTokenizerFactory = this._instantiationService.createInstance(ThreadedBackgroundTokenizerFactory, (timeMs, languageId, sourceExtensionId, lineLength, isRandomSample) => this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, true, isRandomSample), () => this.getAsyncTokenizationEnabled());
        this._vscodeOniguruma = null;
        this._styleElement = domStylesheets.createStyleSheet();
        this._styleElement.className = 'vscode-tokens-styles';
        grammarsExtPoint.setHandler((extensions) => this._handleGrammarsExtPoint(extensions));
        this._updateTheme(this._themeService.getColorTheme(), true);
        this._register(this._themeService.onDidColorThemeChange(() => {
            this._updateTheme(this._themeService.getColorTheme(), false);
        }));
        this._register(this._languageService.onDidRequestRichLanguageFeatures((languageId) => {
            this._createdModes.push(languageId);
        }));
    }
    getAsyncTokenizationEnabled() {
        return !!this._configurationService.getValue('editor.experimental.asyncTokenization');
    }
    getAsyncTokenizationVerification() {
        return !!this._configurationService.getValue('editor.experimental.asyncTokenizationVerification');
    }
    _handleGrammarsExtPoint(extensions) {
        this._grammarDefinitions = null;
        if (this._grammarFactory) {
            this._grammarFactory.dispose();
            this._grammarFactory = null;
        }
        this._tokenizersRegistrations.clear();
        this._grammarDefinitions = [];
        for (const extension of extensions) {
            const grammars = extension.value;
            for (const grammar of grammars) {
                const validatedGrammar = this._validateGrammarDefinition(extension, grammar);
                if (validatedGrammar) {
                    this._grammarDefinitions.push(validatedGrammar);
                    if (validatedGrammar.language) {
                        const lazyTokenizationSupport = new LazyTokenizationSupport(() => this._createTokenizationSupport(validatedGrammar.language));
                        this._tokenizersRegistrations.add(lazyTokenizationSupport);
                        this._tokenizersRegistrations.add(TokenizationRegistry.registerFactory(validatedGrammar.language, lazyTokenizationSupport));
                    }
                }
            }
        }
        this._threadedBackgroundTokenizerFactory.setGrammarDefinitions(this._grammarDefinitions);
        for (const createdMode of this._createdModes) {
            TokenizationRegistry.getOrCreate(createdMode);
        }
    }
    _validateGrammarDefinition(extension, grammar) {
        if (!validateGrammarExtensionPoint(extension.description.extensionLocation, grammar, extension.collector, this._languageService)) {
            return null;
        }
        const grammarLocation = resources.joinPath(extension.description.extensionLocation, grammar.path);
        const embeddedLanguages = Object.create(null);
        if (grammar.embeddedLanguages) {
            const scopes = Object.keys(grammar.embeddedLanguages);
            for (let i = 0, len = scopes.length; i < len; i++) {
                const scope = scopes[i];
                const language = grammar.embeddedLanguages[scope];
                if (typeof language !== 'string') {
                    // never hurts to be too careful
                    continue;
                }
                if (this._languageService.isRegisteredLanguageId(language)) {
                    embeddedLanguages[scope] = this._languageService.languageIdCodec.encodeLanguageId(language);
                }
            }
        }
        const tokenTypes = Object.create(null);
        if (grammar.tokenTypes) {
            const scopes = Object.keys(grammar.tokenTypes);
            for (const scope of scopes) {
                const tokenType = grammar.tokenTypes[scope];
                switch (tokenType) {
                    case 'string':
                        tokenTypes[scope] = 2 /* StandardTokenType.String */;
                        break;
                    case 'other':
                        tokenTypes[scope] = 0 /* StandardTokenType.Other */;
                        break;
                    case 'comment':
                        tokenTypes[scope] = 1 /* StandardTokenType.Comment */;
                        break;
                }
            }
        }
        const validLanguageId = grammar.language && this._languageService.isRegisteredLanguageId(grammar.language) ? grammar.language : undefined;
        function asStringArray(array, defaultValue) {
            if (!Array.isArray(array)) {
                return defaultValue;
            }
            if (!array.every(e => typeof e === 'string')) {
                return defaultValue;
            }
            return array;
        }
        return {
            location: grammarLocation,
            language: validLanguageId,
            scopeName: grammar.scopeName,
            embeddedLanguages: embeddedLanguages,
            tokenTypes: tokenTypes,
            injectTo: grammar.injectTo,
            balancedBracketSelectors: asStringArray(grammar.balancedBracketScopes, ['*']),
            unbalancedBracketSelectors: asStringArray(grammar.unbalancedBracketScopes, []),
            sourceExtensionId: extension.description.id,
        };
    }
    startDebugMode(printFn, onStop) {
        if (this._debugMode) {
            this._notificationService.error(nls.localize('alreadyDebugging', "Already Logging."));
            return;
        }
        this._debugModePrintFunc = printFn;
        this._debugMode = true;
        if (this._debugMode) {
            this._progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                buttons: [nls.localize('stop', "Stop")]
            }, (progress) => {
                progress.report({
                    message: nls.localize('progress1', "Preparing to log TM Grammar parsing. Press Stop when finished.")
                });
                return this._getVSCodeOniguruma().then((vscodeOniguruma) => {
                    vscodeOniguruma.setDefaultDebugCall(true);
                    progress.report({
                        message: nls.localize('progress2', "Now logging TM Grammar parsing. Press Stop when finished.")
                    });
                    return new Promise((resolve, reject) => { });
                });
            }, (choice) => {
                this._getVSCodeOniguruma().then((vscodeOniguruma) => {
                    this._debugModePrintFunc = () => { };
                    this._debugMode = false;
                    vscodeOniguruma.setDefaultDebugCall(false);
                    onStop();
                });
            });
        }
    }
    _canCreateGrammarFactory() {
        // Check if extension point is ready
        return !!this._grammarDefinitions;
    }
    async _getOrCreateGrammarFactory() {
        if (this._grammarFactory) {
            return this._grammarFactory;
        }
        const [vscodeTextmate, vscodeOniguruma] = await Promise.all([importAMDNodeModule('vscode-textmate', 'release/main.js'), this._getVSCodeOniguruma()]);
        const onigLib = Promise.resolve({
            createOnigScanner: (sources) => vscodeOniguruma.createOnigScanner(sources),
            createOnigString: (str) => vscodeOniguruma.createOnigString(str)
        });
        // Avoid duplicate instantiations
        if (this._grammarFactory) {
            return this._grammarFactory;
        }
        this._grammarFactory = new TMGrammarFactory({
            logTrace: (msg) => this._logService.trace(msg),
            logError: (msg, err) => this._logService.error(msg, err),
            readFile: (resource) => this._extensionResourceLoaderService.readExtensionResource(resource)
        }, this._grammarDefinitions || [], vscodeTextmate, onigLib);
        this._updateTheme(this._themeService.getColorTheme(), true);
        return this._grammarFactory;
    }
    async _createTokenizationSupport(languageId) {
        if (!this._languageService.isRegisteredLanguageId(languageId)) {
            return null;
        }
        if (!this._canCreateGrammarFactory()) {
            return null;
        }
        try {
            const grammarFactory = await this._getOrCreateGrammarFactory();
            if (!grammarFactory.has(languageId)) {
                return null;
            }
            const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
            const r = await grammarFactory.createGrammar(languageId, encodedLanguageId);
            if (!r.grammar) {
                return null;
            }
            const maxTokenizationLineLength = observableConfigValue('editor.maxTokenizationLineLength', languageId, -1, this._configurationService);
            const store = new DisposableStore();
            const tokenization = store.add(new TextMateTokenizationSupport(r.grammar, r.initialState, r.containsEmbeddedLanguages, (textModel, tokenStore) => this._threadedBackgroundTokenizerFactory.createBackgroundTokenizer(textModel, tokenStore, maxTokenizationLineLength), () => this.getAsyncTokenizationVerification(), (timeMs, lineLength, isRandomSample) => {
                this._reportTokenizationTime(timeMs, languageId, r.sourceExtensionId, lineLength, false, isRandomSample);
            }, true));
            store.add(tokenization.onDidEncounterLanguage((encodedLanguageId) => {
                if (!this._encounteredLanguages[encodedLanguageId]) {
                    const languageId = this._languageService.languageIdCodec.decodeLanguageId(encodedLanguageId);
                    this._encounteredLanguages[encodedLanguageId] = true;
                    this._languageService.requestBasicLanguageFeatures(languageId);
                }
            }));
            return new TokenizationSupportWithLineLimit(encodedLanguageId, tokenization, store, maxTokenizationLineLength);
        }
        catch (err) {
            if (err.message && err.message === missingTMGrammarErrorMessage) {
                // Don't log this error message
                return null;
            }
            onUnexpectedError(err);
            return null;
        }
    }
    _updateTheme(colorTheme, forceUpdate) {
        if (!forceUpdate && this._currentTheme && this._currentTokenColorMap && equalsTokenRules(this._currentTheme.settings, colorTheme.tokenColors)
            && equalArray(this._currentTokenColorMap, colorTheme.tokenColorMap) && this._currentTokenFontMap && equalArray(this._currentTokenFontMap, colorTheme.tokenFontMap)) {
            return;
        }
        this._currentTheme = { name: colorTheme.label, settings: colorTheme.tokenColors };
        this._currentTokenColorMap = colorTheme.tokenColorMap;
        this._currentTokenFontMap = colorTheme.tokenFontMap;
        this._grammarFactory?.setTheme(this._currentTheme, this._currentTokenColorMap);
        const colorMap = toColorMap(this._currentTokenColorMap);
        const colorCssRules = generateTokensCSSForColorMap(colorMap);
        const fontCssRules = generateTokensCSSForFontMap(this._currentTokenFontMap);
        this._styleElement.textContent = colorCssRules + fontCssRules;
        TokenizationRegistry.setColorMap(colorMap);
        if (this._currentTheme && this._currentTokenColorMap) {
            this._threadedBackgroundTokenizerFactory.acceptTheme(this._currentTheme, this._currentTokenColorMap);
        }
    }
    async createTokenizer(languageId) {
        if (!this._languageService.isRegisteredLanguageId(languageId)) {
            return null;
        }
        const grammarFactory = await this._getOrCreateGrammarFactory();
        if (!grammarFactory.has(languageId)) {
            return null;
        }
        const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
        const { grammar } = await grammarFactory.createGrammar(languageId, encodedLanguageId);
        return grammar;
    }
    _getVSCodeOniguruma() {
        if (!this._vscodeOniguruma) {
            this._vscodeOniguruma = (async () => {
                const [vscodeOniguruma, wasm] = await Promise.all([importAMDNodeModule('vscode-oniguruma', 'release/main.js'), this._loadVSCodeOnigurumaWASM()]);
                await vscodeOniguruma.loadWASM({
                    data: wasm,
                    print: (str) => {
                        this._debugModePrintFunc(str);
                    }
                });
                return vscodeOniguruma;
            })();
        }
        return this._vscodeOniguruma;
    }
    async _loadVSCodeOnigurumaWASM() {
        if (isWeb) {
            const response = await fetch(resolveAmdNodeModulePath('vscode-oniguruma', 'release/onig.wasm'));
            // Using the response directly only works if the server sets the MIME type 'application/wasm'.
            // Otherwise, a TypeError is thrown when using the streaming compiler.
            // We therefore use the non-streaming compiler :(.
            return await response.arrayBuffer();
        }
        else {
            const response = await fetch(canASAR && this._environmentService.isBuilt
                ? FileAccess.asBrowserUri(`${nodeModulesAsarUnpackedPath}/vscode-oniguruma/release/onig.wasm`).toString(true)
                : FileAccess.asBrowserUri(`${nodeModulesPath}/vscode-oniguruma/release/onig.wasm`).toString(true));
            return response;
        }
    }
    _reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, fromWorker, isRandomSample) {
        const key = fromWorker ? 'async' : 'sync';
        // 50 events per hour (one event has a low probability)
        if (TextMateTokenizationFeature_1.reportTokenizationTimeCounter[key] > 50) {
            // Don't flood telemetry with too many events
            return;
        }
        if (TextMateTokenizationFeature_1.reportTokenizationTimeCounter[key] === 0) {
            setTimeout(() => {
                TextMateTokenizationFeature_1.reportTokenizationTimeCounter[key] = 0;
            }, 1000 * 60 * 60);
        }
        TextMateTokenizationFeature_1.reportTokenizationTimeCounter[key]++;
        this._telemetryService.publicLog2('editor.tokenizedLine', {
            timeMs,
            languageId,
            lineLength,
            fromWorker,
            sourceExtensionId,
            isRandomSample,
            tokenizationSetting: this.getAsyncTokenizationEnabled() ? (this.getAsyncTokenizationVerification() ? 2 : 1) : 0,
        });
    }
};
TextMateTokenizationFeature = TextMateTokenizationFeature_1 = __decorate([
    __param(0, ILanguageService),
    __param(1, IWorkbenchThemeService),
    __param(2, IExtensionResourceLoaderService),
    __param(3, INotificationService),
    __param(4, ILogService),
    __param(5, IConfigurationService),
    __param(6, IProgressService),
    __param(7, IWorkbenchEnvironmentService),
    __param(8, IInstantiationService),
    __param(9, ITelemetryService)
], TextMateTokenizationFeature);
export { TextMateTokenizationFeature };
function toColorMap(colorMap) {
    const result = [null];
    for (let i = 1, len = colorMap.length; i < len; i++) {
        result[i] = Color.fromHex(colorMap[i]);
    }
    return result;
}
function equalsTokenRules(a, b) {
    if (!b || !a || b.length !== a.length) {
        return false;
    }
    for (let i = b.length - 1; i >= 0; i--) {
        const r1 = b[i];
        const r2 = a[i];
        if (r1.scope !== r2.scope) {
            return false;
        }
        const s1 = r1.settings;
        const s2 = r2.settings;
        if (s1 && s2) {
            if (s1.fontStyle !== s2.fontStyle || s1.foreground !== s2.foreground || s1.background !== s2.background || s1.lineHeight !== s2.lineHeight || s1.fontSize !== s2.fontSize || s1.fontFamily !== s2.fontFamily) {
                return false;
            }
        }
        else if (!s1 || !s2) {
            return false;
        }
    }
    return true;
}
function validateGrammarExtensionPoint(extensionLocation, syntax, collector, _languageService) {
    if (syntax.language && ((typeof syntax.language !== 'string') || !_languageService.isRegisteredLanguageId(syntax.language))) {
        collector.error(nls.localize('invalid.language', "Unknown language in `contributes.{0}.language`. Provided value: {1}", grammarsExtPoint.name, String(syntax.language)));
        return false;
    }
    if (!syntax.scopeName || (typeof syntax.scopeName !== 'string')) {
        collector.error(nls.localize('invalid.scopeName', "Expected string in `contributes.{0}.scopeName`. Provided value: {1}", grammarsExtPoint.name, String(syntax.scopeName)));
        return false;
    }
    if (!syntax.path || (typeof syntax.path !== 'string')) {
        collector.error(nls.localize('invalid.path.0', "Expected string in `contributes.{0}.path`. Provided value: {1}", grammarsExtPoint.name, String(syntax.path)));
        return false;
    }
    if (syntax.injectTo && (!Array.isArray(syntax.injectTo) || syntax.injectTo.some(scope => typeof scope !== 'string'))) {
        collector.error(nls.localize('invalid.injectTo', "Invalid value in `contributes.{0}.injectTo`. Must be an array of language scope names. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.injectTo)));
        return false;
    }
    if (syntax.embeddedLanguages && !types.isObject(syntax.embeddedLanguages)) {
        collector.error(nls.localize('invalid.embeddedLanguages', "Invalid value in `contributes.{0}.embeddedLanguages`. Must be an object map from scope name to language. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.embeddedLanguages)));
        return false;
    }
    if (syntax.tokenTypes && !types.isObject(syntax.tokenTypes)) {
        collector.error(nls.localize('invalid.tokenTypes', "Invalid value in `contributes.{0}.tokenTypes`. Must be an object map from scope name to token type. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.tokenTypes)));
        return false;
    }
    const grammarLocation = resources.joinPath(extensionLocation, syntax.path);
    if (!resources.isEqualOrParent(grammarLocation, extensionLocation)) {
        collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, grammarLocation.path, extensionLocation.path));
    }
    return true;
}
function observableConfigValue(key, languageId, defaultValue, configurationService) {
    return observableFromEvent((handleChange) => configurationService.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(key, { overrideIdentifier: languageId })) {
            handleChange(e);
        }
    }), () => configurationService.getValue(key, { overrideIdentifier: languageId }) ?? defaultValue);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlSW1wbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS9icm93c2VyL3RleHRNYXRlVG9rZW5pemF0aW9uRmVhdHVyZUltcGwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUM3RixPQUFPLEtBQUssY0FBYyxNQUFNLDRDQUE0QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxNQUFNLElBQUksVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSwyQkFBMkIsRUFBRSxlQUFlLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RyxPQUFPLEVBQWUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEtBQUssS0FBSyxNQUFNLGtDQUFrQyxDQUFDO0FBRzFELE9BQU8sRUFBd0IsdUJBQXVCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEVBQUUsNEJBQTRC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