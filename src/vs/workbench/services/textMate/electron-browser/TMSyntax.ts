/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import * as types from 'vs/base/common/types';
import Event, { Emitter } from 'vs/base/common/event';
import { join, normalize } from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';
import { ITokenizationSupport, TokenizationRegistry, IState, LanguageId } from 'vs/editor/common/modes';
import { IModeService } from 'vs/editor/common/services/modeService';
import { INITIAL, StackElement, IGrammar, Registry, IEmbeddedLanguagesMap as IEmbeddedLanguagesMap2 } from 'vscode-textmate';
import { IWorkbenchThemeService, ITokenColorizationRule } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';
import { grammarsExtPoint, IEmbeddedLanguagesMap, ITMSyntaxExtensionPoint } from 'vs/workbench/services/textMate/electron-browser/TMGrammars';
import { TokenizationResult, TokenizationResult2 } from 'vs/editor/common/core/token';
import { TokenMetadata } from 'vs/editor/common/model/tokensBinaryEncoding';
import { nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { generateTokensCSSForColorMap } from 'vs/editor/common/modes/supports/tokenization';
import { Color } from 'vs/base/common/color';

export class TMScopeRegistry {

	private _scopeNameToLanguageRegistration: { [scopeName: string]: TMLanguageRegistration; };
	private _encounteredLanguages: boolean[];

	private _onDidEncounterLanguage: Emitter<LanguageId> = new Emitter<LanguageId>();
	public onDidEncounterLanguage: Event<LanguageId> = this._onDidEncounterLanguage.event;

	constructor() {
		this._scopeNameToLanguageRegistration = Object.create(null);
		this._encounteredLanguages = [];
	}

	public register(scopeName: string, filePath: string, embeddedLanguages?: IEmbeddedLanguagesMap): void {
		this._scopeNameToLanguageRegistration[scopeName] = new TMLanguageRegistration(scopeName, filePath, embeddedLanguages);
	}

	public getLanguageRegistration(scopeName: string): TMLanguageRegistration {
		return this._scopeNameToLanguageRegistration[scopeName] || null;
	}

	public getFilePath(scopeName: string): string {
		let data = this.getLanguageRegistration(scopeName);
		return data ? data.grammarFilePath : null;
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
	readonly grammarFilePath: string;
	readonly embeddedLanguages: IEmbeddedLanguagesMap;

	constructor(scopeName: string, grammarFilePath: string, embeddedLanguages: IEmbeddedLanguagesMap) {
		this.scopeName = scopeName;
		this.grammarFilePath = grammarFilePath;

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
	}
}

interface ICreateGrammarResult {
	languageId: LanguageId;
	grammar: IGrammar;
	containsEmbeddedLanguages: boolean;
}

export class TextMateService implements ITextMateService {
	public _serviceBrand: any;

	private _grammarRegistry: Registry;
	private _modeService: IModeService;
	private _themeService: IWorkbenchThemeService;
	private _scopeRegistry: TMScopeRegistry;
	private _injections: { [scopeName: string]: string[]; };
	private _languageToScope: Map<string, string>;
	private _styleElement: HTMLStyleElement;

	private _currentTokenColors: ITokenColorizationRule[];

	public onDidEncounterLanguage: Event<LanguageId>;

	constructor(
		@IModeService modeService: IModeService,
		@IWorkbenchThemeService themeService: IWorkbenchThemeService
	) {
		this._styleElement = dom.createStyleSheet();
		this._styleElement.className = 'vscode-tokens-styles';
		this._modeService = modeService;
		this._themeService = themeService;
		this._scopeRegistry = new TMScopeRegistry();
		this.onDidEncounterLanguage = this._scopeRegistry.onDidEncounterLanguage;
		this._injections = {};
		this._languageToScope = new Map<string, string>();

		this._grammarRegistry = new Registry({
			getFilePath: (scopeName: string) => {
				return this._scopeRegistry.getFilePath(scopeName);
			},
			getInjections: (scopeName: string) => {
				return this._injections[scopeName];
			}
		});
		this._updateTheme();
		this._themeService.onDidColorThemeChange((e) => this._updateTheme());

		grammarsExtPoint.setHandler((extensions) => {
			for (let i = 0; i < extensions.length; i++) {
				let grammars = extensions[i].value;
				for (let j = 0; j < grammars.length; j++) {
					this._handleGrammarExtensionPointUser(extensions[i].description.extensionFolderPath, grammars[j], extensions[i].collector);
				}
			}
		});

		this._modeService.onDidCreateMode((mode) => {
			let modeId = mode.getId();
			if (this._languageToScope.has(modeId)) {
				this.registerDefinition(modeId);
			}
		});
	}

	private static _toColorMap(colorMap: string[]): Color[] {
		let result: Color[] = [null];
		for (let i = 1, len = colorMap.length; i < len; i++) {
			result[i] = Color.fromHex(colorMap[i]);
		}
		return result;
	}

	private _updateTheme(): void {
		let colorTheme = this._themeService.getColorTheme();
		if (!this.compareTokenRules(colorTheme.tokenColors)) {
			return;
		}
		this._grammarRegistry.setTheme({ name: colorTheme.label, settings: colorTheme.tokenColors });
		let colorMap = TextMateService._toColorMap(this._grammarRegistry.getColorMap());
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
				if (s1.fontStyle !== s2.fontStyle || s1.foreground !== s2.foreground) {
					return true;
				}
			} else if (!s1 || !s2) {
				return true;
			}
		}
		return false;
	}


	private _handleGrammarExtensionPointUser(extensionFolderPath: string, syntax: ITMSyntaxExtensionPoint, collector: ExtensionMessageCollector): void {
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

		let normalizedAbsolutePath = normalize(join(extensionFolderPath, syntax.path));

		if (normalizedAbsolutePath.indexOf(extensionFolderPath) !== 0) {
			collector.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, normalizedAbsolutePath, extensionFolderPath));
		}

		this._scopeRegistry.register(syntax.scopeName, normalizedAbsolutePath, syntax.embeddedLanguages);

		if (syntax.injectTo) {
			for (let injectScope of syntax.injectTo) {
				let injections = this._injections[injectScope];
				if (!injections) {
					this._injections[injectScope] = injections = [];
				}
				injections.push(syntax.scopeName);
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

	public createGrammar(modeId: string): TPromise<IGrammar> {
		return this._createGrammar(modeId).then(r => r.grammar);
	}

	private _createGrammar(modeId: string): TPromise<ICreateGrammarResult> {
		let scopeName = this._languageToScope.get(modeId);
		let languageRegistration = this._scopeRegistry.getLanguageRegistration(scopeName);
		if (!languageRegistration) {
			// No TM grammar defined
			return TPromise.wrapError<ICreateGrammarResult>(new Error(nls.localize('no-tm-grammar', "No TM Grammar registered for this language.")));
		}
		let embeddedLanguages = this._resolveEmbeddedLanguages(languageRegistration.embeddedLanguages);
		let languageId = this._modeService.getLanguageIdentifier(modeId).id;
		let containsEmbeddedLanguages = (Object.keys(embeddedLanguages).length > 0);
		return new TPromise<ICreateGrammarResult>((c, e, p) => {
			this._grammarRegistry.loadGrammarWithEmbeddedLanguages(scopeName, languageId, embeddedLanguages, (err, grammar) => {
				if (err) {
					return e(err);
				}
				c({
					languageId: languageId,
					grammar: grammar,
					containsEmbeddedLanguages: containsEmbeddedLanguages
				});
			});
		});
	}

	private registerDefinition(modeId: string): void {
		this._createGrammar(modeId).then((r) => {
			TokenizationRegistry.register(modeId, new TMTokenization(this._scopeRegistry, r.languageId, r.grammar, r.containsEmbeddedLanguages));
		}, onUnexpectedError);
	}
}

class TMTokenization implements ITokenizationSupport {

	private readonly _scopeRegistry: TMScopeRegistry;
	private readonly _languageId: LanguageId;
	private readonly _grammar: IGrammar;
	private readonly _containsEmbeddedLanguages: boolean;
	private readonly _seenLanguages: boolean[];

	constructor(scopeRegistry: TMScopeRegistry, languageId: LanguageId, grammar: IGrammar, containsEmbeddedLanguages: boolean) {
		this._scopeRegistry = scopeRegistry;
		this._languageId = languageId;
		this._grammar = grammar;
		this._containsEmbeddedLanguages = containsEmbeddedLanguages;
		this._seenLanguages = [];
	}

	public getInitialState(): IState {
		return INITIAL;
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
