/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { canASAR, importAMDNodeModule, resolveAmdNodeModulePath } from '../../../../amdX.js';
import * as domStylesheets from '../../../../base/browser/domStylesheets.js';
import { equals as equalArray } from '../../../../base/common/arrays.js';
import { Color } from '../../../../base/common/color.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from '../../../../base/common/network.js';
import { IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import * as resources from '../../../../base/common/resources.js';
import * as types from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { StandardTokenType } from '../../../../editor/common/encodedTokenAttributes.js';
import { ITokenizationSupport, LazyTokenizationSupport, TokenizationRegistry } from '../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap } from '../../../../editor/common/languages/supports/tokenization.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ExtensionMessageCollector, IExtensionPointUser } from '../../extensions/common/extensionsRegistry.js';
import { ITextMateTokenizationService } from './textMateTokenizationFeature.js';
import { TextMateTokenizationSupport } from './tokenizationSupport/textMateTokenizationSupport.js';
import { TokenizationSupportWithLineLimit } from './tokenizationSupport/tokenizationSupportWithLineLimit.js';
import { ThreadedBackgroundTokenizerFactory } from './backgroundTokenization/threadedBackgroundTokenizerFactory.js';
import { TMGrammarFactory, missingTMGrammarErrorMessage } from '../common/TMGrammarFactory.js';
import { ITMSyntaxExtensionPoint, grammarsExtPoint } from '../common/TMGrammars.js';
import { IValidEmbeddedLanguagesMap, IValidGrammarDefinition, IValidTokenTypeMap } from '../common/TMScopeRegistry.js';
import { ITextMateThemingRule, IWorkbenchColorTheme, IWorkbenchThemeService } from '../../themes/common/workbenchThemeService.js';
import type { IGrammar, IOnigLib, IRawTheme } from 'vscode-textmate';

export class TextMateTokenizationFeature extends Disposable implements ITextMateTokenizationService {
	private static reportTokenizationTimeCounter = { sync: 0, async: 0 };
	public _serviceBrand: undefined;

	private readonly _styleElement: HTMLStyleElement;
	private readonly _createdModes: string[] = [];
	private readonly _encounteredLanguages: boolean[] = [];

	private _debugMode: boolean = false;
	private _debugModePrintFunc: (str: string) => void = () => { };

	private _grammarDefinitions: IValidGrammarDefinition[] | null = null;
	private _grammarFactory: TMGrammarFactory | null = null;
	private readonly _tokenizersRegistrations = this._register(new DisposableStore());
	private _currentTheme: IRawTheme | null = null;
	private _currentTokenColorMap: string[] | null = null;
	private readonly _threadedBackgroundTokenizerFactory = this._instantiationService.createInstance(
		ThreadedBackgroundTokenizerFactory,
		(timeMs, languageId, sourceExtensionId, lineLength, isRandomSample) => this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, true, isRandomSample),
		() => this.getAsyncTokenizationEnabled(),
	);

	constructor(
		@ILanguageService private readonly _languageService: ILanguageService,
		@IWorkbenchThemeService private readonly _themeService: IWorkbenchThemeService,
		@IExtensionResourceLoaderService private readonly _extensionResourceLoaderService: IExtensionResourceLoaderService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IProgressService private readonly _progressService: IProgressService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

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

	private getAsyncTokenizationEnabled(): boolean {
		return !!this._configurationService.getValue<boolean>('editor.experimental.asyncTokenization');
	}

	private getAsyncTokenizationVerification(): boolean {
		return !!this._configurationService.getValue<boolean>('editor.experimental.asyncTokenizationVerification');
	}

	private _handleGrammarsExtPoint(extensions: readonly IExtensionPointUser<ITMSyntaxExtensionPoint[]>[]): void {
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
						const lazyTokenizationSupport = new LazyTokenizationSupport(() => this._createTokenizationSupport(validatedGrammar.language!));
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

	private _validateGrammarDefinition(extension: IExtensionPointUser<ITMSyntaxExtensionPoint[]>, grammar: ITMSyntaxExtensionPoint): IValidGrammarDefinition | null {
		if (!validateGrammarExtensionPoint(extension.description.extensionLocation, grammar, extension.collector, this._languageService)) {
			return null;
		}

		const grammarLocation = resources.joinPath(extension.description.extensionLocation, grammar.path);

		const embeddedLanguages: IValidEmbeddedLanguagesMap = Object.create(null);
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

		const tokenTypes: IValidTokenTypeMap = Object.create(null);
		if (grammar.tokenTypes) {
			const scopes = Object.keys(grammar.tokenTypes);
			for (const scope of scopes) {
				const tokenType = grammar.tokenTypes[scope];
				switch (tokenType) {
					case 'string':
						tokenTypes[scope] = StandardTokenType.String;
						break;
					case 'other':
						tokenTypes[scope] = StandardTokenType.Other;
						break;
					case 'comment':
						tokenTypes[scope] = StandardTokenType.Comment;
						break;
				}
			}
		}

		const validLanguageId = grammar.language && this._languageService.isRegisteredLanguageId(grammar.language) ? grammar.language : undefined;

		function asStringArray(array: unknown, defaultValue: string[]): string[] {
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

	public startDebugMode(printFn: (str: string) => void, onStop: () => void): void {
		if (this._debugMode) {
			this._notificationService.error(nls.localize('alreadyDebugging', "Already Logging."));
			return;
		}

		this._debugModePrintFunc = printFn;
		this._debugMode = true;

		if (this._debugMode) {
			this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					buttons: [nls.localize('stop', "Stop")]
				},
				(progress) => {
					progress.report({
						message: nls.localize('progress1', "Preparing to log TM Grammar parsing. Press Stop when finished.")
					});

					return this._getVSCodeOniguruma().then((vscodeOniguruma) => {
						vscodeOniguruma.setDefaultDebugCall(true);
						progress.report({
							message: nls.localize('progress2', "Now logging TM Grammar parsing. Press Stop when finished.")
						});
						return new Promise<void>((resolve, reject) => { });
					});
				},
				(choice) => {
					this._getVSCodeOniguruma().then((vscodeOniguruma) => {
						this._debugModePrintFunc = () => { };
						this._debugMode = false;
						vscodeOniguruma.setDefaultDebugCall(false);
						onStop();
					});
				}
			);
		}
	}

	private _canCreateGrammarFactory(): boolean {
		// Check if extension point is ready
		return !!this._grammarDefinitions;
	}
	private async _getOrCreateGrammarFactory(): Promise<TMGrammarFactory> {
		if (this._grammarFactory) {
			return this._grammarFactory;
		}

		const [vscodeTextmate, vscodeOniguruma] = await Promise.all([importAMDNodeModule<typeof import('vscode-textmate')>('vscode-textmate', 'release/main.js'), this._getVSCodeOniguruma()]);
		const onigLib: Promise<IOnigLib> = Promise.resolve({
			createOnigScanner: (sources: string[]) => vscodeOniguruma.createOnigScanner(sources),
			createOnigString: (str: string) => vscodeOniguruma.createOnigString(str)
		});

		// Avoid duplicate instantiations
		if (this._grammarFactory) {
			return this._grammarFactory;
		}

		this._grammarFactory = new TMGrammarFactory({
			logTrace: (msg: string) => this._logService.trace(msg),
			logError: (msg: string, err: any) => this._logService.error(msg, err),
			readFile: (resource: URI) => this._extensionResourceLoaderService.readExtensionResource(resource)
		}, this._grammarDefinitions || [], vscodeTextmate, onigLib);

		this._updateTheme(this._themeService.getColorTheme(), true);

		return this._grammarFactory;
	}

	private async _createTokenizationSupport(languageId: string): Promise<ITokenizationSupport & IDisposable | null> {
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
			const maxTokenizationLineLength = observableConfigValue<number>(
				'editor.maxTokenizationLineLength',
				languageId,
				-1,
				this._configurationService
			);
			const store = new DisposableStore();
			const tokenization = store.add(new TextMateTokenizationSupport(
				r.grammar,
				r.initialState,
				r.containsEmbeddedLanguages,
				(textModel, tokenStore) => this._threadedBackgroundTokenizerFactory.createBackgroundTokenizer(textModel, tokenStore, maxTokenizationLineLength),
				() => this.getAsyncTokenizationVerification(),
				(timeMs, lineLength, isRandomSample) => {
					this._reportTokenizationTime(timeMs, languageId, r.sourceExtensionId, lineLength, false, isRandomSample);
				},
				true,
			));
			store.add(tokenization.onDidEncounterLanguage((encodedLanguageId) => {
				if (!this._encounteredLanguages[encodedLanguageId]) {
					const languageId = this._languageService.languageIdCodec.decodeLanguageId(encodedLanguageId);
					this._encounteredLanguages[encodedLanguageId] = true;
					this._languageService.requestBasicLanguageFeatures(languageId);
				}
			}));

			return new TokenizationSupportWithLineLimit(encodedLanguageId, tokenization, store, maxTokenizationLineLength);
		} catch (err) {
			if (err.message && err.message === missingTMGrammarErrorMessage) {
				// Don't log this error message
				return null;
			}
			onUnexpectedError(err);
			return null;
		}
	}

	private _updateTheme(colorTheme: IWorkbenchColorTheme, forceUpdate: boolean): void {
		if (!forceUpdate && this._currentTheme && this._currentTokenColorMap && equalsTokenRules(this._currentTheme.settings, colorTheme.tokenColors)
			&& equalArray(this._currentTokenColorMap, colorTheme.tokenColorMap)) {
			return;
		}
		this._currentTheme = { name: colorTheme.label, settings: colorTheme.tokenColors };
		this._currentTokenColorMap = colorTheme.tokenColorMap;

		this._grammarFactory?.setTheme(this._currentTheme, this._currentTokenColorMap);
		const colorMap = toColorMap(this._currentTokenColorMap);
		const cssRules = generateTokensCSSForColorMap(colorMap);
		this._styleElement.textContent = cssRules;
		TokenizationRegistry.setColorMap(colorMap);

		if (this._currentTheme && this._currentTokenColorMap) {
			this._threadedBackgroundTokenizerFactory.acceptTheme(this._currentTheme, this._currentTokenColorMap);
		}
	}

	public async createTokenizer(languageId: string): Promise<IGrammar | null> {
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

	private _vscodeOniguruma: Promise<typeof import('vscode-oniguruma')> | null = null;
	private _getVSCodeOniguruma(): Promise<typeof import('vscode-oniguruma')> {
		if (!this._vscodeOniguruma) {
			this._vscodeOniguruma = (async () => {
				const [vscodeOniguruma, wasm] = await Promise.all([importAMDNodeModule<typeof import('vscode-oniguruma')>('vscode-oniguruma', 'release/main.js'), this._loadVSCodeOnigurumaWASM()]);
				await vscodeOniguruma.loadWASM({
					data: wasm,
					print: (str: string) => {
						this._debugModePrintFunc(str);
					}
				});
				return vscodeOniguruma;
			})();
		}
		return this._vscodeOniguruma;
	}

	private async _loadVSCodeOnigurumaWASM(): Promise<Response | ArrayBuffer> {
		if (isWeb) {
			const response = await fetch(resolveAmdNodeModulePath('vscode-oniguruma', 'release/onig.wasm'));
			// Using the response directly only works if the server sets the MIME type 'application/wasm'.
			// Otherwise, a TypeError is thrown when using the streaming compiler.
			// We therefore use the non-streaming compiler :(.
			return await response.arrayBuffer();
		} else {
			const response = await fetch(canASAR && this._environmentService.isBuilt
				? FileAccess.asBrowserUri(`${nodeModulesAsarUnpackedPath}/vscode-oniguruma/release/onig.wasm`).toString(true)
				: FileAccess.asBrowserUri(`${nodeModulesPath}/vscode-oniguruma/release/onig.wasm`).toString(true));
			return response;
		}
	}

	private _reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, fromWorker: boolean, isRandomSample: boolean): void {
		const key = fromWorker ? 'async' : 'sync';

		// 50 events per hour (one event has a low probability)
		if (TextMateTokenizationFeature.reportTokenizationTimeCounter[key] > 50) {
			// Don't flood telemetry with too many events
			return;
		}
		if (TextMateTokenizationFeature.reportTokenizationTimeCounter[key] === 0) {
			setTimeout(() => {
				TextMateTokenizationFeature.reportTokenizationTimeCounter[key] = 0;
			}, 1000 * 60 * 60);
		}
		TextMateTokenizationFeature.reportTokenizationTimeCounter[key]++;

		this._telemetryService.publicLog2<{
			timeMs: number;
			languageId: string;
			lineLength: number;
			fromWorker: boolean;
			sourceExtensionId: string | undefined;
			isRandomSample: boolean;
			tokenizationSetting: number;
		}, {
			owner: 'hediet';

			timeMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand how long it took to tokenize a random line' };
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To relate the performance to the language' };
			lineLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To relate the performance to the line length' };
			fromWorker: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To figure out if this line was tokenized sync or async' };
			sourceExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To figure out which extension contributed the grammar' };
			isRandomSample: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To figure out if this is a random sample or measured because of some other condition.' };
			tokenizationSetting: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'To understand if the user has async tokenization enabled. 0=sync, 1=async, 2=verification' };

			comment: 'This event gives insight about the performance certain grammars.';
		}>('editor.tokenizedLine', {
			timeMs,
			languageId,
			lineLength,
			fromWorker,
			sourceExtensionId,
			isRandomSample,
			tokenizationSetting: this.getAsyncTokenizationEnabled() ? (this.getAsyncTokenizationVerification() ? 2 : 1) : 0,
		});
	}
}

function toColorMap(colorMap: string[]): Color[] {
	const result: Color[] = [null!];
	for (let i = 1, len = colorMap.length; i < len; i++) {
		result[i] = Color.fromHex(colorMap[i]);
	}
	return result;
}

function equalsTokenRules(a: ITextMateThemingRule[] | null, b: ITextMateThemingRule[] | null): boolean {
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
			if (s1.fontStyle !== s2.fontStyle || s1.foreground !== s2.foreground || s1.background !== s2.background) {
				return false;
			}
		} else if (!s1 || !s2) {
			return false;
		}
	}
	return true;
}

function validateGrammarExtensionPoint(extensionLocation: URI, syntax: ITMSyntaxExtensionPoint, collector: ExtensionMessageCollector, _languageService: ILanguageService): boolean {
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

function observableConfigValue<T>(key: string, languageId: string, defaultValue: T, configurationService: IConfigurationService): IObservable<T> {
	return observableFromEvent(
		(handleChange) => configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(key, { overrideIdentifier: languageId })) {
				handleChange(e);
			}
		}),
		() => configurationService.getValue<T>(key, { overrideIdentifier: languageId }) ?? defaultValue,
	);
}
