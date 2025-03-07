/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IValidEmbeddedLanguagesMap, IValidGrammarDefinition, TMScopeRegistry } from './TMScopeRegistry.js';
import type { IGrammar, IOnigLib, IRawTheme, Registry, StateStack } from 'vscode-textmate';

interface ITMGrammarFactoryHost {
	logTrace(msg: string): void;
	logError(msg: string, err: any): void;
	readFile(resource: URI): Promise<string>;
}

export interface ICreateGrammarResult {
	languageId: string;
	grammar: IGrammar | null;
	initialState: StateStack;
	containsEmbeddedLanguages: boolean;
	sourceExtensionId?: string;
}

export const missingTMGrammarErrorMessage = 'No TM Grammar registered for this language.';

export class TMGrammarFactory extends Disposable {

	private readonly _host: ITMGrammarFactoryHost;
	private readonly _initialState: StateStack;
	private readonly _scopeRegistry: TMScopeRegistry;
	private readonly _injections: { [scopeName: string]: string[] };
	private readonly _injectedEmbeddedLanguages: { [scopeName: string]: IValidEmbeddedLanguagesMap[] };
	private readonly _languageToScope: Map<string, string>;
	private readonly _grammarRegistry: Registry;

	constructor(host: ITMGrammarFactoryHost, grammarDefinitions: IValidGrammarDefinition[], vscodeTextmate: typeof import('vscode-textmate'), onigLib: Promise<IOnigLib>) {
		super();
		this._host = host;
		this._initialState = vscodeTextmate.INITIAL;
		this._scopeRegistry = new TMScopeRegistry();
		this._injections = {};
		this._injectedEmbeddedLanguages = {};
		this._languageToScope = new Map<string, string>();
		this._grammarRegistry = this._register(new vscodeTextmate.Registry({
			onigLib: onigLib,
			loadGrammar: async (scopeName: string) => {
				const grammarDefinition = this._scopeRegistry.getGrammarDefinition(scopeName);
				if (!grammarDefinition) {
					this._host.logTrace(`No grammar found for scope ${scopeName}`);
					return null;
				}
				const location = grammarDefinition.location;
				try {
					const content = await this._host.readFile(location);
					return vscodeTextmate.parseRawGrammar(content, location.path);
				} catch (e) {
					this._host.logError(`Unable to load and parse grammar for scope ${scopeName} from ${location}`, e);
					return null;
				}
			},
			getInjections: (scopeName: string) => {
				const scopeParts = scopeName.split('.');
				let injections: string[] = [];
				for (let i = 1; i <= scopeParts.length; i++) {
					const subScopeName = scopeParts.slice(0, i).join('.');
					injections = [...injections, ...(this._injections[subScopeName] || [])];
				}
				return injections;
			}
		}));

		for (const validGrammar of grammarDefinitions) {
			this._scopeRegistry.register(validGrammar);

			if (validGrammar.injectTo) {
				for (const injectScope of validGrammar.injectTo) {
					let injections = this._injections[injectScope];
					if (!injections) {
						this._injections[injectScope] = injections = [];
					}
					injections.push(validGrammar.scopeName);
				}

				if (validGrammar.embeddedLanguages) {
					for (const injectScope of validGrammar.injectTo) {
						let injectedEmbeddedLanguages = this._injectedEmbeddedLanguages[injectScope];
						if (!injectedEmbeddedLanguages) {
							this._injectedEmbeddedLanguages[injectScope] = injectedEmbeddedLanguages = [];
						}
						injectedEmbeddedLanguages.push(validGrammar.embeddedLanguages);
					}
				}
			}

			if (validGrammar.language) {
				this._languageToScope.set(validGrammar.language, validGrammar.scopeName);
			}
		}
	}

	public has(languageId: string): boolean {
		return this._languageToScope.has(languageId);
	}

	public setTheme(theme: IRawTheme, colorMap: string[]): void {
		this._grammarRegistry.setTheme(theme, colorMap);
	}

	public getColorMap(): string[] {
		return this._grammarRegistry.getColorMap();
	}

	public async createGrammar(languageId: string, encodedLanguageId: number): Promise<ICreateGrammarResult> {
		const scopeName = this._languageToScope.get(languageId);
		if (typeof scopeName !== 'string') {
			// No TM grammar defined
			throw new Error(missingTMGrammarErrorMessage);
		}

		const grammarDefinition = this._scopeRegistry.getGrammarDefinition(scopeName);
		if (!grammarDefinition) {
			// No TM grammar defined
			throw new Error(missingTMGrammarErrorMessage);
		}

		const embeddedLanguages = grammarDefinition.embeddedLanguages;
		if (this._injectedEmbeddedLanguages[scopeName]) {
			const injectedEmbeddedLanguages = this._injectedEmbeddedLanguages[scopeName];
			for (const injected of injectedEmbeddedLanguages) {
				for (const scope of Object.keys(injected)) {
					embeddedLanguages[scope] = injected[scope];
				}
			}
		}

		const containsEmbeddedLanguages = (Object.keys(embeddedLanguages).length > 0);

		let grammar: IGrammar | null;

		try {
			grammar = await this._grammarRegistry.loadGrammarWithConfiguration(
				scopeName,
				encodedLanguageId,
				{
					embeddedLanguages,
					tokenTypes: <any>grammarDefinition.tokenTypes,
					balancedBracketSelectors: grammarDefinition.balancedBracketSelectors,
					unbalancedBracketSelectors: grammarDefinition.unbalancedBracketSelectors,
				}
			);
		} catch (err) {
			if (err.message && err.message.startsWith('No grammar provided for')) {
				// No TM grammar defined
				throw new Error(missingTMGrammarErrorMessage);
			}
			throw err;
		}

		return {
			languageId: languageId,
			grammar: grammar,
			initialState: this._initialState,
			containsEmbeddedLanguages: containsEmbeddedLanguages,
			sourceExtensionId: grammarDefinition.sourceExtensionId,
		};
	}
}
