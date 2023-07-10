/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from 'vs/amdX';
import * as dom from 'vs/base/browser/dom';
import { equals as equalArray } from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from 'vs/base/common/network';
import { IObservable, observableFromEvent } from 'vs/base/common/observable';
import { isWeb } from 'vs/base/common/platform';
import * as resources from 'vs/base/common/resources';
import * as types from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ITokenizationSupport, LazyTokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { generateTokensCSSForColorMap } from 'vs/editor/common/languages/supports/tokenization';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionResourceLoaderService } from 'vs/platform/extensionResourceLoader/common/extensionResourceLoader';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ExtensionMessageCollector, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ITextMateTokenizationService } from 'vs/workbench/services/textMate/browser/textMateTokenizationFeature';
import { TextMateTokenizationSupport } from 'vs/workbench/services/textMate/browser/tokenizationSupport/textMateTokenizationSupport';
import { TokenizationSupportWithLineLimit } from 'vs/workbench/services/textMate/browser/tokenizationSupport/tokenizationSupportWithLineLimit';
import { TextMateWorkerHost } from 'vs/workbench/services/textMate/browser/workerHost/textMateWorkerHost';
import { TMGrammarFactory, missingTMGrammarErrorMessage } from 'vs/workbench/services/textMate/common/TMGrammarFactory';
import { ITMSyntaxExtensionPoint, grammarsExtPoint } from 'vs/workbench/services/textMate/common/TMGrammars';
import { IValidEmbeddedLanguagesMap, IValidGrammarDefinition, IValidTokenTypeMap } from 'vs/workbench/services/textMate/common/TMScopeRegistry';
import { ITextMateThemingRule, IWorkbenchColorTheme, IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import type { IGrammar, IOnigLib, IRawTheme } from 'vscode-textmate';

export class TextMateTokenizationFeature extends Disposable implements ITextMateTokenizationService {
	private static reportTokenizationTimeCounter = 0;
	public _serviceBrand: undefined;

	private readonly _styleElement: HTMLStyleElement;
	private readonly _createdModes: string[] = [];
	private readonly _encounteredLanguages: boolean[] = [];

	private _debugMode: boolean = false;
	private _debugModePrintFunc: (str: string) => void = () => { };

	private _grammarDefinitions: IValidGrammarDefinition[] | null = null;
	private _grammarFactory: TMGrammarFactory | null = null;
	private readonly _tokenizersRegistrations = new DisposableStore();
	private _currentTheme: IRawTheme | null = null;
	private _currentTokenColorMap: string[] | null = null;
	private readonly _workerHost = this._instantiationService.createInstance(
		TextMateWorkerHost,
		(timeMs, languageId, sourceExtensionId, lineLength) => this.reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, true)
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

		this._styleElement = dom.createStyleSheet();
		this._styleElement.className = 'vscode-tokens-styles';

		grammarsExtPoint.setHandler((extensions) => this.handleGrammarsExtPoint(extensions));

		this._updateTheme(this._themeService.getColorTheme(), true);
		this._register(this._themeService.onDidColorThemeChange(() => {
			this._updateTheme(this._themeService.getColorTheme(), false);
		}));

		this._languageService.onDidRequestRichLanguageFeatures((languageId) => {
			this._createdModes.push(languageId);
		});
	}

	private handleGrammarsExtPoint(extensions: readonly IExtensionPointUser<ITMSyntaxExtensionPoint[]>[]): void {
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
				const def = this.createValidGrammarDefinition(extension, grammar);
				if (def) {
					this._grammarDefinitions.push(def);
					if (def.language) {
						const lazyTokenizationSupport = new LazyTokenizationSupport(() => this.createTokenizationSupport(def.language!));
						this._tokenizersRegistrations.add(lazyTokenizationSupport);
						this._tokenizersRegistrations.add(TokenizationRegistry.registerFactory(def.language, lazyTokenizationSupport));
					}
				}
			}
		}

		this._workerHost.setGrammarDefinitions(this._grammarDefinitions);

		for (const createdMode of this._createdModes) {
			TokenizationRegistry.getOrCreate(createdMode);
		}
	}

	private createValidGrammarDefinition(extension: IExtensionPointUser<ITMSyntaxExtensionPoint[]>, grammar: ITMSyntaxExtensionPoint): IValidGrammarDefinition | null {
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

		let validLanguageId: string | null = null;
		if (grammar.language && this._languageService.isRegisteredLanguageId(grammar.language)) {
			validLanguageId = grammar.language;
		}

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
			language: validLanguageId || undefined,
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

	private async createTokenizationSupport(languageId: string): Promise<ITokenizationSupport & IDisposable | null> {
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
			const tokenization = new TextMateTokenizationSupport(
				r.grammar,
				r.initialState,
				r.containsEmbeddedLanguages,
				(textModel, tokenStore) => this._workerHost.createBackgroundTokenizer(textModel, tokenStore, maxTokenizationLineLength),
				() => this._configurationService.getValue<boolean>('editor.experimental.asyncTokenizationVerification'),
				(timeMs, lineLength) => {
					this.reportTokenizationTime(timeMs, languageId, r.sourceExtensionId, lineLength, false);
				}
			);
			tokenization.onDidEncounterLanguage((encodedLanguageId) => {
				if (!this._encounteredLanguages[encodedLanguageId]) {
					const languageId = this._languageService.languageIdCodec.decodeLanguageId(encodedLanguageId);
					this._encounteredLanguages[encodedLanguageId] = true;
					this._languageService.requestBasicLanguageFeatures(languageId);
				}
			});
			return new TokenizationSupportWithLineLimit(encodedLanguageId, tokenization, maxTokenizationLineLength);
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
			this._workerHost.acceptTheme(this._currentTheme, this._currentTokenColorMap);
		}
	}

	public async createGrammar(languageId: string): Promise<IGrammar | null> {
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
			const response = await fetch(FileAccess.asBrowserUri('vscode-oniguruma/../onig.wasm').toString(true));
			// Using the response directly only works if the server sets the MIME type 'application/wasm'.
			// Otherwise, a TypeError is thrown when using the streaming compiler.
			// We therefore use the non-streaming compiler :(.
			return await response.arrayBuffer();
		} else {
			const response = await fetch(this._environmentService.isBuilt
				? FileAccess.asBrowserUri(`${nodeModulesAsarUnpackedPath}/vscode-oniguruma/release/onig.wasm`).toString(true)
				: FileAccess.asBrowserUri(`${nodeModulesPath}/vscode-oniguruma/release/onig.wasm`).toString(true));
			return response;
		}
	}

	public reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, fromWorker: boolean): void {
		// 50 events per hour (one event has a low probability)
		if (TextMateTokenizationFeature.reportTokenizationTimeCounter > 50) {
			// Don't flood telemetry with too many events
			return;
		}
		if (TextMateTokenizationFeature.reportTokenizationTimeCounter === 0) {
			setTimeout(() => {
				TextMateTokenizationFeature.reportTokenizationTimeCounter = 0;
			}, 1000 * 60 * 60);
		}
		TextMateTokenizationFeature.reportTokenizationTimeCounter++;

		this._telemetryService.publicLog2<{
			timeMs: number;
			languageId: string;
			lineLength: number;
			fromWorker: boolean;
			sourceExtensionId: string | undefined;
		}, {
			owner: 'hediet';

			timeMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'To understand how long it took to tokenize a random line' };
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'To relate the performance to the language' };
			lineLength: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'To relate the performance to the line length' };
			fromWorker: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'To figure out if this line was tokenized sync or async' };
			sourceExtensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'To figure out which extension contributed the grammar' };

			comment: 'This event gives insight about the performance certain grammars.';
		}>('editor.tokenizedLine', {
			timeMs,
			languageId,
			lineLength,
			fromWorker,
			sourceExtensionId,
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
