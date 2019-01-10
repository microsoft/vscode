/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import * as resources from 'vs/base/common/resources';
import * as types from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { TokenizationResult, TokenizationResult2 } from 'vs/editor/common/core/token';
import { IState, ITokenizationSupport, LanguageId, TokenMetadata, TokenizationRegistry } from 'vs/editor/common/modes';
import { nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { generateTokensCSSForColorMap } from 'vs/editor/common/modes/supports/tokenization';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ExtensionMessageCollector } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IEmbeddedLanguagesMap, ITMSyntaxExtensionPoint, TokenTypesContribution, grammarsExtPoint } from 'vs/workbench/services/textMate/electron-browser/TMGrammars';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';
import { ITokenColorizationRule, IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IEmbeddedLanguagesMap as IEmbeddedLanguagesMap2, IGrammar, ITokenTypeMap, Registry, StackElement, StandardTokenType } from 'vscode-textmate';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';

export class TMScopeRegistry {

	private _scopeNameToLanguageRegistration: { [scopeName: string]: TMLanguageRegistration; };
	private _encounteredLanguages: boolean[];

	private readonly _onDidEncounterLanguage = new Emitter<LanguageId>();
	public readonly onDidEncounterLanguage: Event<LanguageId> = this._onDidEncounterLanguage.event;

	constructor() {
		this.reset();
	}

	public reset(): void {
		this._scopeNameToLanguageRegistration = Object.create(null);
		this._encounteredLanguages = [];
	}

	public register(scopeName: string, grammarLocation: URI, embeddedLanguages?: IEmbeddedLanguagesMap, tokenTypes?: TokenTypesContribution): void {
		if (this._scopeNameToLanguageRegistration[scopeName]) {
			const existingRegistration = this._scopeNameToLanguageRegistration[scopeName];
			if (!resources.isEqual(existingRegistration.grammarLocation, grammarLocation)) {
				console.warn(
					`Overwriting grammar scope name to file mapping for scope ${scopeName}.\n` +
					`Old grammar file: ${existingRegistration.grammarLocation.toString()}.\n` +
					`New grammar file: ${grammarLocation.toString()}`
				);
			}
		}
		this._scopeNameToLanguageRegistration[scopeName] = new TMLanguageRegistration(scopeName, grammarLocation, embeddedLanguages, tokenTypes);
	}

	public getLanguageRegistration(scopeName: string): TMLanguageRegistration {
		return this._scopeNameToLanguageRegistration[scopeName] || null;
	}

	public getGrammarLocation(scopeName: string): URI | null {
		let data = this.getLanguageRegistration(scopeName);
		return data ? data.grammarLocation : null;
	}

	/**
	 * To be called when tokenization found/hit an embedded language.
	 */
	public onEncounteredLanguage(languageId: LanguageId): void {
		if (!this._encounteredLanguages[languageId]) {
			this._encounteredLanguages[languageId] = true;
			this._onDidEncounterLanguage.fire(languageId);
		}
	}
}

export class TMLanguageRegistration {
	_topLevelScopeNameDataBrand: void;

	readonly scopeName: string;
	readonly grammarLocation: URI;
	readonly embeddedLanguages: IEmbeddedLanguagesMap;
	readonly tokenTypes: ITokenTypeMap;

	constructor(scopeName: string, grammarLocation: URI, embeddedLanguages: IEmbeddedLanguagesMap | undefined, tokenTypes: TokenTypesContribution | undefined) {
		this.scopeName = scopeName;
		this.grammarLocation = grammarLocation;

		// embeddedLanguages handling
		this.embeddedLanguages = Object.create(null);

		if (embeddedLanguages) {
			// If embeddedLanguages are configured, fill in `this._embeddedLanguages`
			let scopes = Object.keys(embeddedLanguages);
			for (let i = 0, len = scopes.length; i < len; i++) {
				let scope = scopes[i];
				let language = embeddedLanguages[scope];
				if (typeof language !== 'string') {
					// never hurts to be too careful
					continue;
				}
				this.embeddedLanguages[scope] = language;
			}
		}

		this.tokenTypes = Object.create(null);
		if (tokenTypes) {
			// If tokenTypes is configured, fill in `this._tokenTypes`
			const scopes = Object.keys(tokenTypes);
			for (let i = 0, len = scopes.length; i < len; i++) {
				const scope = scopes[i];
				const tokenType = tokenTypes[scope];
				switch (tokenType) {
					case 'string':
						this.tokenTypes[scope] = StandardTokenType.String;
						break;
					case 'other':
						this.tokenTypes[scope] = StandardTokenType.Other;
						break;
					case 'comment':
						this.tokenTypes[scope] = StandardTokenType.Comment;
						break;
				}
			}
		}
	}
}

interface ICreateGrammarResult {
	languageId: LanguageId;
	grammar: IGrammar;
	initialState: StackElement;
	containsEmbeddedLanguages: boolean;
}

export class TextMateService extends Disposable implements ITextMateService {
	public _serviceBrand: any;

	private readonly _onDidEncounterLanguage: Emitter<LanguageId> = this._register(new Emitter<LanguageId>());
	public readonly onDidEncounterLanguage: Event<LanguageId> = this._onDidEncounterLanguage.event;

	private readonly _styleElement: HTMLStyleElement;
	private readonly _createdModes: string[];

	private _scopeRegistry: TMScopeRegistry;
	private _injections: { [scopeName: string]: string[]; };
	private _injectedEmbeddedLanguages: { [scopeName: string]: IEmbeddedLanguagesMap[]; };
	private _languageToScope: Map<string, string>;
	private _grammarRegistry: Promise<[Registry, StackElement]> | null;
	private _tokenizersRegistrations: IDisposable[];

	private _currentTokenColors: ITokenColorizationRule[] | null;

	constructor(
		@IModeService private readonly _modeService: IModeService,
		@IWorkbenchThemeService private readonly _themeService: IWorkbenchThemeService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._styleElement = dom.createStyleSheet();
		this._styleElement.className = 'vscode-tokens-styles';
		this._createdModes = [];
		this._scopeRegistry = new TMScopeRegistry();
		this._scopeRegistry.onDidEncounterLanguage((language) => this._onDidEncounterLanguage.fire(language));
		this._injections = {};
		this._injectedEmbeddedLanguages = {};
		this._languageToScope = new Map<string, string>();
		this._grammarRegistry = null;
		this._tokenizersRegistrations = [];
		this._currentTokenColors = null;

		grammarsExtPoint.setHandler((extensions) => {
			this._scopeRegistry.reset();
			this._injections = {};
			this._injectedEmbeddedLanguages = {};
			this._languageToScope = new Map<string, string>();
			this._grammarRegistry = null;
			this._tokenizersRegistrations = dispose(this._tokenizersRegistrations);

			for (const extension of extensions) {
				let grammars = extension.value;
				for (const grammar of grammars) {
					this._handleGrammarExtensionPointUser(extension.description.extensionLocation, grammar, extension.collector);
				}
			}

			for (const createMode of this._createdModes) {
				this._registerDefinitionIfAvailable(createMode);
			}
		});

		// Generate some color map until the grammar registry is loaded
		let colorTheme = this._themeService.getColorTheme();
		let defaultForeground: Color = Color.transparent;
		let defaultBackground: Color = Color.transparent;
		for (let i = 0, len = colorTheme.tokenColors.length; i < len; i++) {
			let rule = colorTheme.tokenColors[i];
			if (!rule.scope && rule.settings) {
				if (rule.settings.foreground) {
					defaultForeground = Color.fromHex(rule.settings.foreground);
				}
				if (rule.settings.background) {
					defaultBackground = Color.fromHex(rule.settings.background);
				}
			}
		}
		TokenizationRegistry.setColorMap([null!, defaultForeground, defaultBackground]);

		this._modeService.onDidCreateMode((mode) => {
			let modeId = mode.getId();
			this._createdModes.push(modeId);
			this._registerDefinitionIfAvailable(modeId);
		});
	}

	private _registerDefinitionIfAvailable(modeId: string): void {
		if (this._languageToScope.has(modeId)) {
			const promise = this._createGrammar(modeId).then((r) => {
				return new TMTokenization(this._scopeRegistry, r.languageId, r.grammar, r.initialState, r.containsEmbeddedLanguages, this._notificationService);
			}, e => {
				onUnexpectedError(e);
				return null;
			});
			this._tokenizersRegistrations.push(TokenizationRegistry.registerPromise(modeId, promise));
		}
	}

	private _getOrCreateGrammarRegistry(): Promise<[Registry, StackElement]> {
		if (!this._grammarRegistry) {
			this._grammarRegistry = import('vscode-textmate').then(({ Registry, INITIAL, parseRawGrammar }) => {
				const grammarRegistry = new Registry({
					loadGrammar: (scopeName: string) => {
						const location = this._scopeRegistry.getGrammarLocation(scopeName);
						if (!location) {
							this._logService.trace(`No grammar found for scope ${scopeName}`);
							return null;
						}
						return this._fileService.resolveContent(location, { encoding: 'utf8' }).then(content => {
							return parseRawGrammar(content.value, location.path);
						}, e => {
							this._logService.error(`Unable to load and parse grammar for scope ${scopeName} from ${location}`, e);
							return null;
						});
					},
					getInjections: (scopeName: string) => {
						const scopeParts = scopeName.split('.');
						let injections: string[] = [];
						for (let i = 1; i <= scopeParts.length; i++) {
							const subScopeName = scopeParts.slice(0, i).join('.');
							injections = [...injections, ...this._injections[subScopeName]];
						}
						return injections;
					}
				});
				this._updateTheme(grammarRegistry);
				this._themeService.onDidColorThemeChange((e) => this._updateTheme(grammarRegistry));
				return <[Registry, StackElement]>[grammarRegistry, INITIAL];
			});
		}

		return this._grammarRegistry;
	}

	private static _toColorMap(colorMap: string[]): Color[] {
		let result: Color[] = [null!];
		for (let i = 1, len = colorMap.length; i < len; i++) {
			result[i] = Color.fromHex(colorMap[i]);
		}
		return result;
	}

	private _updateTheme(grammarRegistry: Registry): void {
		let colorTheme = this._themeService.getColorTheme();
		if (!this.compareTokenRules(colorTheme.tokenColors)) {
			return;
		}
		grammarRegistry.setTheme({ name: colorTheme.label, settings: colorTheme.tokenColors });
		let colorMap = TextMateService._toColorMap(grammarRegistry.getColorMap());
		let cssRules = generateTokensCSSForColorMap(colorMap);
		this._styleElement.innerHTML = cssRules;
		TokenizationRegistry.setColorMap(colorMap);
	}

	private compareTokenRules(newRules: ITokenColorizationRule[]): boolean {
		let currRules = this._currentTokenColors;
		this._currentTokenColors = newRules;
		if (!newRules || !currRules || newRules.length !== currRules.length) {
			return true;
		}
		for (let i = newRules.length - 1; i >= 0; i--) {
			let r1 = newRules[i];
			let r2 = currRules[i];
			if (r1.scope !== r2.scope) {
				return true;
			}
			let s1 = r1.settings;
			let s2 = r2.settings;
			if (s1 && s2) {
				if (s1.fontStyle !== s2.fontStyle || s1.foreground !== s2.foreground || s1.background !== s2.background) {
					return true;
				}
			} else if (!s1 || !s2) {
				return true;
			}
		}
		return false;
	}

	private _handleGrammarExtensionPointUser(extensionLocation: URI, syntax: ITMSyntaxExtensionPoint, collector: ExtensionMessageCollector): void {
		if (syntax.language && ((typeof syntax.language !== 'string') || !this._modeService.isRegisteredMode(syntax.language))) {
			collector.error(nls.localize('invalid.language', "Unknown language in `contributes.{0}.language`. Provided value: {1}", grammarsExtPoint.name, String(syntax.language)));
			return;
		}
		if (!syntax.scopeName || (typeof syntax.scopeName !== 'string')) {
			collector.error(nls.localize('invalid.scopeName', "Expected string in `contributes.{0}.scopeName`. Provided value: {1}", grammarsExtPoint.name, String(syntax.scopeName)));
			return;
		}
		if (!syntax.path || (typeof syntax.path !== 'string')) {
			collector.error(nls.localize('invalid.path.0', "Expected string in `contributes.{0}.path`. Provided value: {1}", grammarsExtPoint.name, String(syntax.path)));
			return;
		}
		if (syntax.injectTo && (!Array.isArray(syntax.injectTo) || syntax.injectTo.some(scope => typeof scope !== 'string'))) {
			collector.error(nls.localize('invalid.injectTo', "Invalid value in `contributes.{0}.injectTo`. Must be an array of language scope names. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.injectTo)));
			return;
		}
		if (syntax.embeddedLanguages && !types.isObject(syntax.embeddedLanguages)) {
			collector.error(nls.localize('invalid.embeddedLanguages', "Invalid value in `contributes.{0}.embeddedLanguages`. Must be an object map from scope name to language. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.embeddedLanguages)));
			return;
		}

		if (syntax.tokenTypes && !types.isObject(syntax.tokenTypes)) {
			collector.error(nls.localize('invalid.tokenTypes', "Invalid value in `contributes.{0}.tokenTypes`. Must be an object map from scope name to token type. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.tokenTypes)));
			return;
		}

		const grammarLocation = resources.joinPath(extensionLocation, syntax.path);
		if (!resources.isEqualOrParent(grammarLocation, extensionLocation)) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, grammarLocation.path, extensionLocation.path));
		}

		this._scopeRegistry.register(syntax.scopeName, grammarLocation, syntax.embeddedLanguages, syntax.tokenTypes);

		if (syntax.injectTo) {
			for (let injectScope of syntax.injectTo) {
				let injections = this._injections[injectScope];
				if (!injections) {
					this._injections[injectScope] = injections = [];
				}
				injections.push(syntax.scopeName);
			}

			if (syntax.embeddedLanguages) {
				for (let injectScope of syntax.injectTo) {
					let injectedEmbeddedLanguages = this._injectedEmbeddedLanguages[injectScope];
					if (!injectedEmbeddedLanguages) {
						this._injectedEmbeddedLanguages[injectScope] = injectedEmbeddedLanguages = [];
					}
					injectedEmbeddedLanguages.push(syntax.embeddedLanguages);
				}
			}
		}

		let modeId = syntax.language;
		if (modeId) {
			this._languageToScope.set(modeId, syntax.scopeName);
		}
	}

	private _resolveEmbeddedLanguages(embeddedLanguages: IEmbeddedLanguagesMap): IEmbeddedLanguagesMap2 {
		let scopes = Object.keys(embeddedLanguages);
		let result: IEmbeddedLanguagesMap2 = Object.create(null);
		for (let i = 0, len = scopes.length; i < len; i++) {
			let scope = scopes[i];
			let language = embeddedLanguages[scope];
			let languageIdentifier = this._modeService.getLanguageIdentifier(language);
			if (languageIdentifier) {
				result[scope] = languageIdentifier.id;
			}
		}
		return result;
	}

	public createGrammar(modeId: string): Promise<IGrammar> {
		return this._createGrammar(modeId).then(r => r.grammar);
	}

	private _createGrammar(modeId: string): Promise<ICreateGrammarResult> {
		const scopeName = this._languageToScope.get(modeId);
		if (typeof scopeName !== 'string') {
			// No TM grammar defined
			return Promise.reject(new Error(nls.localize('no-tm-grammar', "No TM Grammar registered for this language.")));
		}
		const languageRegistration = this._scopeRegistry.getLanguageRegistration(scopeName);
		if (!languageRegistration) {
			// No TM grammar defined
			return Promise.reject(new Error(nls.localize('no-tm-grammar', "No TM Grammar registered for this language.")));
		}
		let embeddedLanguages = this._resolveEmbeddedLanguages(languageRegistration.embeddedLanguages);
		let rawInjectedEmbeddedLanguages = this._injectedEmbeddedLanguages[scopeName];
		if (rawInjectedEmbeddedLanguages) {
			let injectedEmbeddedLanguages: IEmbeddedLanguagesMap2[] = rawInjectedEmbeddedLanguages.map(this._resolveEmbeddedLanguages.bind(this));
			for (const injected of injectedEmbeddedLanguages) {
				for (const scope of Object.keys(injected)) {
					embeddedLanguages[scope] = injected[scope];
				}
			}
		}

		let languageId = this._modeService.getLanguageIdentifier(modeId)!.id;
		let containsEmbeddedLanguages = (Object.keys(embeddedLanguages).length > 0);
		return this._getOrCreateGrammarRegistry().then((_res) => {
			const [grammarRegistry, initialState] = _res;
			return grammarRegistry.loadGrammarWithConfiguration(scopeName, languageId, { embeddedLanguages, tokenTypes: languageRegistration.tokenTypes }).then(grammar => {
				return {
					languageId: languageId,
					grammar: grammar,
					initialState: initialState,
					containsEmbeddedLanguages: containsEmbeddedLanguages
				};
			});
		});
	}
}

class TMTokenization implements ITokenizationSupport {

	private readonly _scopeRegistry: TMScopeRegistry;
	private readonly _languageId: LanguageId;
	private readonly _grammar: IGrammar;
	private readonly _containsEmbeddedLanguages: boolean;
	private readonly _seenLanguages: boolean[];
	private readonly _initialState: StackElement;
	private _tokenizationWarningAlreadyShown: boolean;

	constructor(scopeRegistry: TMScopeRegistry, languageId: LanguageId, grammar: IGrammar, initialState: StackElement, containsEmbeddedLanguages: boolean, @INotificationService private readonly notificationService: INotificationService) {
		this._scopeRegistry = scopeRegistry;
		this._languageId = languageId;
		this._grammar = grammar;
		this._initialState = initialState;
		this._containsEmbeddedLanguages = containsEmbeddedLanguages;
		this._seenLanguages = [];
	}

	public getInitialState(): IState {
		return this._initialState;
	}

	public tokenize(line: string, state: IState, offsetDelta: number): TokenizationResult {
		throw new Error('Not supported!');
	}

	public tokenize2(line: string, state: StackElement, offsetDelta: number): TokenizationResult2 {
		if (offsetDelta !== 0) {
			throw new Error('Unexpected: offsetDelta should be 0.');
		}

		// Do not attempt to tokenize if a line has over 20k
		if (line.length >= 20000) {
			if (!this._tokenizationWarningAlreadyShown) {
				this._tokenizationWarningAlreadyShown = true;
				this.notificationService.warn(nls.localize('too many characters', "Tokenization is skipped for lines longer than 20k characters for performance reasons."));
			}
			console.log(`Line (${line.substr(0, 15)}...): longer than 20k characters, tokenization skipped.`);
			return nullTokenize2(this._languageId, line, state, offsetDelta);
		}

		let textMateResult = this._grammar.tokenizeLine2(line, state);

		if (this._containsEmbeddedLanguages) {
			let seenLanguages = this._seenLanguages;
			let tokens = textMateResult.tokens;

			// Must check if any of the embedded languages was hit
			for (let i = 0, len = (tokens.length >>> 1); i < len; i++) {
				let metadata = tokens[(i << 1) + 1];
				let languageId = TokenMetadata.getLanguageId(metadata);

				if (!seenLanguages[languageId]) {
					seenLanguages[languageId] = true;
					this._scopeRegistry.onEncounteredLanguage(languageId);
				}
			}
		}

		let endState: StackElement;
		// try to save an object if possible
		if (state.equals(textMateResult.ruleStack)) {
			endState = state;
		} else {
			endState = textMateResult.ruleStack;

		}

		return new TokenizationResult2(textMateResult.tokens, endState);
	}
}
