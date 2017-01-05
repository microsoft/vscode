/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as paths from 'vs/base/common/paths';
import * as types from 'vs/base/common/types';
import Event, { Emitter } from 'vs/base/common/event';
import { IExtensionPoint, ExtensionMessageCollector, ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/modes';
import { TMState } from 'vs/editor/node/textMate/TMState';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IGrammar, Registry, IEmbeddedLanguagesMap as IEmbeddedLanguagesMap2 } from 'vscode-textmate';
import { languagesExtPoint } from 'vs/editor/common/services/modeServiceImpl';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { ITextMateService } from 'vs/editor/node/textMate/textMateService';

export interface IEmbeddedLanguagesMap {
	[scopeName: string]: string;
}

export interface ITMSyntaxExtensionPoint {
	language: string;
	scopeName: string;
	path: string;
	embeddedLanguages: IEmbeddedLanguagesMap;
	injectTo: string[];
}

export const grammarsExtPoint: IExtensionPoint<ITMSyntaxExtensionPoint[]> = ExtensionsRegistry.registerExtensionPoint<ITMSyntaxExtensionPoint[]>('grammars', [languagesExtPoint], {
	description: nls.localize('vscode.extension.contributes.grammars', 'Contributes textmate tokenizers.'),
	type: 'array',
	defaultSnippets: [{ body: [{ language: '${1:id}', scopeName: 'source.${2:id}', path: './syntaxes/${3:id}.tmLanguage.' }] }],
	items: {
		type: 'object',
		defaultSnippets: [{ body: { language: '${1:id}', scopeName: 'source.${2:id}', path: './syntaxes/${3:id}.tmLanguage.' } }],
		properties: {
			language: {
				description: nls.localize('vscode.extension.contributes.grammars.language', 'Language identifier for which this syntax is contributed to.'),
				type: 'string'
			},
			scopeName: {
				description: nls.localize('vscode.extension.contributes.grammars.scopeName', 'Textmate scope name used by the tmLanguage file.'),
				type: 'string'
			},
			path: {
				description: nls.localize('vscode.extension.contributes.grammars.path', 'Path of the tmLanguage file. The path is relative to the extension folder and typically starts with \'./syntaxes/\'.'),
				type: 'string'
			},
			embeddedLanguages: {
				description: nls.localize('vscode.extension.contributes.grammars.embeddedLanguages', 'A map of scope name to language id if this grammar contains embedded languages.'),
				type: 'object'
			},
			injectTo: {
				description: nls.localize('vscode.extension.contributes.grammars.injectTo', 'List of language scope names to which this grammar is injected to.'),
				type: 'array',
				items: {
					type: 'string'
				}
			}
		},
		required: ['scopeName', 'path']
	}
});

export class TMScopeRegistry {

	private _scopeNameToLanguageRegistration: { [scopeName: string]: TMLanguageRegistration; };
	private _encounteredLanguages: { [language: string]: boolean; };

	private _onDidEncounterLanguage: Emitter<string> = new Emitter<string>();
	public onDidEncounterLanguage: Event<string> = this._onDidEncounterLanguage.event;

	constructor() {
		this._scopeNameToLanguageRegistration = Object.create(null);
		this._encounteredLanguages = Object.create(null);
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
	public onEncounteredLanguage(language: string): void {
		if (!this._encounteredLanguages[language]) {
			this._encounteredLanguages[language] = true;
			this._onDidEncounterLanguage.fire(language);
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

function createStyleSheet(): HTMLStyleElement {
	let style = document.createElement('style');
	style.type = 'text/css';
	style.media = 'screen';
	document.getElementsByTagName('head')[0].appendChild(style);
	return style;
}

export class MainProcessTextMateSyntax implements ITextMateService {
	public _serviceBrand: any;

	private _grammarRegistry: Registry;
	private _modeService: IModeService;
	private _themeService: IThemeService;
	private _scopeRegistry: TMScopeRegistry;
	private _injections: { [scopeName: string]: string[]; };
	private _languageToScope: Map<string, string>;
	private _styleElement: HTMLStyleElement;

	public onDidEncounterLanguage: Event<string>;

	constructor(
		@IModeService modeService: IModeService,
		@IThemeService themeService: IThemeService
	) {
		this._styleElement = createStyleSheet();
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
			if (this._languageToScope[modeId]) {
				this.registerDefinition(modeId);
			}
		});
	}

	private static _generateCSS(colorMap: string[]): string {
		let rules: string[] = [];
		for (let i = 1, len = colorMap.length; i < len; i++) {
			let color = colorMap[i];
			rules[i] = `.mtk${i} { color: ${color.substr(0, 7)}; }`;
		}
		rules.push('.mtki { font-style: italic; }');
		rules.push('.mtkb { font-weight: bold; }');
		rules.push('.mtku { text-decoration: underline; }');
		return rules.join('\n');
	}

	private _updateTheme(): void {
		this._grammarRegistry.setTheme(this._themeService.getColorThemeDocument());
		let colorMap = this._grammarRegistry.getColorMap();
		let cssRules = MainProcessTextMateSyntax._generateCSS(colorMap);
		this._styleElement.innerHTML = cssRules;
		TokenizationRegistry.setColorMap(colorMap);
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

		let normalizedAbsolutePath = paths.normalize(paths.join(extensionFolderPath, syntax.path));

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
			this._languageToScope[modeId] = syntax.scopeName;
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
				result[scope] = languageIdentifier.iid;
			}
		}
		return result;
	}

	public createGrammar(modeId: string): TPromise<IGrammar> {
		let scopeName = this._languageToScope[modeId];
		let languageRegistration = this._scopeRegistry.getLanguageRegistration(scopeName);
		let embeddedLanguages = this._resolveEmbeddedLanguages(languageRegistration.embeddedLanguages);
		let languageId = this._modeService.getLanguageIdentifier(modeId).iid;

		return new TPromise<IGrammar>((c, e, p) => {
			this._grammarRegistry.loadGrammarWithEmbeddedLanguages(scopeName, languageId, embeddedLanguages, (err, grammar) => {
				if (err) {
					return e(err);
				}
				c(grammar);
			});
		});
	}

	private registerDefinition(modeId: string): void {
		this.createGrammar(modeId).then((grammar) => {
			TokenizationRegistry.register(modeId, createTokenizationSupport(grammar));
		}, onUnexpectedError);
	}
}

function createTokenizationSupport(grammar: IGrammar): ITokenizationSupport {
	return {
		getInitialState: () => new TMState(null),
		tokenize: undefined,
		tokenize3: (line: string, state: TMState, offsetDelta: number) => {
			if (offsetDelta !== 0) {
				throw new Error('Unexpected: offsetDelta should be 0.');
			}

			let textMateResult = grammar.tokenizeLine2(line, state.ruleStack);

			let endState: TMState;
			// try to save an object if possible
			if (state.ruleStack !== null && textMateResult.ruleStack.equals(state.ruleStack)) {
				endState = state;
			} else {
				endState = new TMState(textMateResult.ruleStack);
			}

			return {
				tokens: textMateResult.tokens,
				endState: endState
			};
		}
	};
}
