/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { TMScopeRegistry } from './TMScopeRegistry.js';
export const missingTMGrammarErrorMessage = 'No TM Grammar registered for this language.';
export class TMGrammarFactory extends Disposable {
    constructor(host, grammarDefinitions, vscodeTextmate, onigLib) {
        super();
        this._host = host;
        this._initialState = vscodeTextmate.INITIAL;
        this._scopeRegistry = new TMScopeRegistry();
        this._injections = {};
        this._injectedEmbeddedLanguages = {};
        this._languageToScope = new Map();
        this._grammarRegistry = this._register(new vscodeTextmate.Registry({
            onigLib: onigLib,
            loadGrammar: async (scopeName) => {
                const grammarDefinition = this._scopeRegistry.getGrammarDefinition(scopeName);
                if (!grammarDefinition) {
                    this._host.logTrace(`No grammar found for scope ${scopeName}`);
                    return null;
                }
                const location = grammarDefinition.location;
                try {
                    const content = await this._host.readFile(location);
                    return vscodeTextmate.parseRawGrammar(content, location.path);
                }
                catch (e) {
                    this._host.logError(`Unable to load and parse grammar for scope ${scopeName} from ${location}`, e);
                    return null;
                }
            },
            getInjections: (scopeName) => {
                const scopeParts = scopeName.split('.');
                let injections = [];
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
    has(languageId) {
        return this._languageToScope.has(languageId);
    }
    setTheme(theme, colorMap) {
        this._grammarRegistry.setTheme(theme, colorMap);
    }
    getColorMap() {
        return this._grammarRegistry.getColorMap();
    }
    async createGrammar(languageId, encodedLanguageId) {
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
        let grammar;
        try {
            grammar = await this._grammarRegistry.loadGrammarWithConfiguration(scopeName, encodedLanguageId, {
                embeddedLanguages,
                // eslint-disable-next-line local/code-no-any-casts
                tokenTypes: grammarDefinition.tokenTypes,
                balancedBracketSelectors: grammarDefinition.balancedBracketSelectors,
                unbalancedBracketSelectors: grammarDefinition.unbalancedBracketSelectors,
            });
        }
        catch (err) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVE1HcmFtbWFyRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS9jb21tb24vVE1HcmFtbWFyRmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUF1RCxlQUFlLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQWlCNUcsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsNkNBQTZDLENBQUM7QUFFMUYsTUFBTSxPQUFPLGdCQUFpQixTQUFRLFVBQVU7SUFVL0MsWUFBWSxJQUEyQixFQUFFLGtCQUE2QyxFQUFFLGNBQWdELEVBQUUsT0FBMEI7UUFDbkssS0FBSyxFQUFFLENBQUM7UUFDUixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQztRQUNsQixJQUFJLENBQUMsYUFBYSxHQUFHLGNBQWMsQ0FBQyxPQUFPLENBQUM7UUFDNUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzVDLElBQUksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQywwQkFBMEIsR0FBRyxFQUFFLENBQUM7UUFDckMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksR0FBRyxFQUFrQixDQUFDO1FBQ2xELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQztZQUNsRSxPQUFPLEVBQUUsT0FBTztZQUNoQixXQUFXLEVBQUUsS0FBSyxFQUFFLFNBQWlCLEVBQUUsRUFBRTtnQkFDeEMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFD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