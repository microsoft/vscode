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
import { Emitter } from '../../../base/common/event.js';
import { Disposable, markAsSingleton, toDisposable } from '../../../base/common/lifecycle.js';
import * as strings from '../../../base/common/strings.js';
import { DEFAULT_WORD_REGEXP, ensureValidWordDefinition } from '../core/wordHelper.js';
import { AutoClosingPairs } from './languageConfiguration.js';
import { CharacterPairSupport } from './supports/characterPair.js';
import { BracketElectricCharacterSupport } from './supports/electricCharacter.js';
import { IndentRulesSupport } from './supports/indentRules.js';
import { OnEnterSupport } from './supports/onEnter.js';
import { RichEditBrackets } from './supports/richEditBrackets.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ILanguageService } from './language.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { PLAINTEXT_LANGUAGE_ID } from './modesRegistry.js';
import { LanguageBracketsConfiguration } from './supports/languageBracketsConfiguration.js';
export class LanguageConfigurationServiceChangeEvent {
    constructor(languageId) {
        this.languageId = languageId;
    }
    affects(languageId) {
        return !this.languageId ? true : this.languageId === languageId;
    }
}
export const ILanguageConfigurationService = createDecorator('languageConfigurationService');
let LanguageConfigurationService = class LanguageConfigurationService extends Disposable {
    constructor(configurationService, languageService) {
        super();
        this.configurationService = configurationService;
        this.languageService = languageService;
        this._registry = this._register(new LanguageConfigurationRegistry());
        this.onDidChangeEmitter = this._register(new Emitter());
        this.onDidChange = this.onDidChangeEmitter.event;
        this.configurations = new Map();
        const languageConfigKeys = new Set(Object.values(customizedLanguageConfigKeys));
        this._register(this.configurationService.onDidChangeConfiguration((e) => {
            const globalConfigChanged = e.change.keys.some((k) => languageConfigKeys.has(k));
            const localConfigChanged = e.change.overrides
                .filter(([overrideLangName, keys]) => keys.some((k) => languageConfigKeys.has(k)))
                .map(([overrideLangName]) => overrideLangName);
            if (globalConfigChanged) {
                this.configurations.clear();
                this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(undefined));
            }
            else {
                for (const languageId of localConfigChanged) {
                    if (this.languageService.isRegisteredLanguageId(languageId)) {
                        this.configurations.delete(languageId);
                        this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(languageId));
                    }
                }
            }
        }));
        this._register(this._registry.onDidChange((e) => {
            this.configurations.delete(e.languageId);
            this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(e.languageId));
        }));
    }
    register(languageId, configuration, priority) {
        return this._registry.register(languageId, configuration, priority);
    }
    getLanguageConfiguration(languageId) {
        let result = this.configurations.get(languageId);
        if (!result) {
            result = computeConfig(languageId, this._registry, this.configurationService, this.languageService);
            this.configurations.set(languageId, result);
        }
        return result;
    }
};
LanguageConfigurationService = __decorate([
    __param(0, IConfigurationService),
    __param(1, ILanguageService)
], LanguageConfigurationService);
export { LanguageConfigurationService };
function computeConfig(languageId, registry, configurationService, languageService) {
    let languageConfig = registry.getLanguageConfiguration(languageId);
    if (!languageConfig) {
        if (!languageService.isRegisteredLanguageId(languageId)) {
            // this happens for the null language, which can be returned by monarch.
            // Instead of throwing an error, we just return a default config.
            return new ResolvedLanguageConfiguration(languageId, {});
        }
        languageConfig = new ResolvedLanguageConfiguration(languageId, {});
    }
    const customizedConfig = getCustomizedLanguageConfig(languageConfig.languageId, configurationService);
    const data = combineLanguageConfigurations([languageConfig.underlyingConfig, customizedConfig]);
    const config = new ResolvedLanguageConfiguration(languageConfig.languageId, data);
    return config;
}
const customizedLanguageConfigKeys = {
    brackets: 'editor.language.brackets',
    colorizedBracketPairs: 'editor.language.colorizedBracketPairs'
};
function getCustomizedLanguageConfig(languageId, configurationService) {
    const brackets = configurationService.getValue(customizedLanguageConfigKeys.brackets, {
        overrideIdentifier: languageId,
    });
    const colorizedBracketPairs = configurationService.getValue(customizedLanguageConfigKeys.colorizedBracketPairs, {
        overrideIdentifier: languageId,
    });
    return {
        brackets: validateBracketPairs(brackets),
        colorizedBracketPairs: validateBracketPairs(colorizedBracketPairs),
    };
}
function validateBracketPairs(data) {
    if (!Array.isArray(data)) {
        return undefined;
    }
    return data.map(pair => {
        if (!Array.isArray(pair) || pair.length !== 2) {
            return undefined;
        }
        return [pair[0], pair[1]];
    }).filter((p) => !!p);
}
export function getIndentationAtPosition(model, lineNumber, column) {
    const lineText = model.getLineContent(lineNumber);
    let indentation = strings.getLeadingWhitespace(lineText);
    if (indentation.length > column - 1) {
        indentation = indentation.substring(0, column - 1);
    }
    return indentation;
}
class ComposedLanguageConfiguration {
    constructor(languageId) {
        this.languageId = languageId;
        this._resolved = null;
        this._entries = [];
        this._order = 0;
        this._resolved = null;
    }
    register(configuration, priority) {
        const entry = new LanguageConfigurationContribution(configuration, priority, ++this._order);
        this._entries.push(entry);
        this._resolved = null;
        return markAsSingleton(toDisposable(() => {
            for (let i = 0; i < this._entries.length; i++) {
                if (this._entries[i] === entry) {
                    this._entries.splice(i, 1);
                    this._resolved = null;
                    break;
                }
            }
        }));
    }
    getResolvedConfiguration() {
        if (!this._resolved) {
            const config = this._resolve();
            if (config) {
                this._resolved = new ResolvedLanguageConfiguration(this.languageId, config);
            }
        }
        return this._resolved;
    }
    _resolve() {
        if (this._entries.length === 0) {
            return null;
        }
        this._entries.sort(LanguageConfigurationContribution.cmp);
        return combineLanguageConfigurations(this._entries.map(e => e.configuration));
    }
}
function combineLanguageConfigurations(configs) {
    let result = {
        comments: undefined,
        brackets: undefined,
        wordPattern: undefined,
        indentationRules: undefined,
        onEnterRules: undefined,
        autoClosingPairs: undefined,
        surroundingPairs: undefined,
        autoCloseBefore: undefined,
        folding: undefined,
        colorizedBracketPairs: undefined,
        __electricCharacterSupport: undefined,
    };
    for (const entry of configs) {
        result = {
            comments: entry.comments || result.comments,
            brackets: entry.brackets || result.brackets,
            wordPattern: entry.wordPattern || result.wordPattern,
            indentationRules: entry.indentationRules || result.indentationRules,
            onEnterRules: entry.onEnterRules || result.onEnterRules,
            autoClosingPairs: entry.autoClosingPairs || result.autoClosingPairs,
            surroundingPairs: entry.surroundingPairs || result.surroundingPairs,
            autoCloseBefore: entry.autoCloseBefore || result.autoCloseBefore,
            folding: entry.folding || result.folding,
            colorizedBracketPairs: entry.colorizedBracketPairs || result.colorizedBracketPairs,
            __electricCharacterSupport: entry.__electricCharacterSupport || result.__electricCharacterSupport,
        };
    }
    return result;
}
class LanguageConfigurationContribution {
    constructor(configuration, priority, order) {
        this.configuration = configuration;
        this.priority = priority;
        this.order = order;
    }
    static cmp(a, b) {
        if (a.priority === b.priority) {
            // higher order last
            return a.order - b.order;
        }
        // higher priority last
        return a.priority - b.priority;
    }
}
export class LanguageConfigurationChangeEvent {
    constructor(languageId) {
        this.languageId = languageId;
    }
}
export class LanguageConfigurationRegistry extends Disposable {
    constructor() {
        super();
        this._entries = new Map();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._register(this.register(PLAINTEXT_LANGUAGE_ID, {
            brackets: [
                ['(', ')'],
                ['[', ']'],
                ['{', '}'],
            ],
            surroundingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '<', close: '>' },
                { open: '\"', close: '\"' },
                { open: '\'', close: '\'' },
                { open: '`', close: '`' },
            ],
            colorizedBracketPairs: [],
            folding: {
                offSide: true
            }
        }, 0));
    }
    /**
     * @param priority Use a higher number for higher priority
     */
    register(languageId, configuration, priority = 0) {
        let entries = this._entries.get(languageId);
        if (!entries) {
            entries = new ComposedLanguageConfiguration(languageId);
            this._entries.set(languageId, entries);
        }
        const disposable = entries.register(configuration, priority);
        this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
        return markAsSingleton(toDisposable(() => {
            disposable.dispose();
            this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
        }));
    }
    getLanguageConfiguration(languageId) {
        const entries = this._entries.get(languageId);
        return entries?.getResolvedConfiguration() || null;
    }
}
/**
 * Immutable.
*/
export class ResolvedLanguageConfiguration {
    constructor(languageId, underlyingConfig) {
        this.languageId = languageId;
        this.underlyingConfig = underlyingConfig;
        this._brackets = null;
        this._electricCharacter = null;
        this._onEnterSupport =
            this.underlyingConfig.brackets ||
                this.underlyingConfig.indentationRules ||
                this.underlyingConfig.onEnterRules
                ? new OnEnterSupport(this.underlyingConfig)
                : null;
        this.comments = ResolvedLanguageConfiguration._handleComments(this.underlyingConfig);
        this.characterPair = new CharacterPairSupport(this.underlyingConfig);
        this.wordDefinition = this.underlyingConfig.wordPattern || DEFAULT_WORD_REGEXP;
        this.indentationRules = this.underlyingConfig.indentationRules;
        if (this.underlyingConfig.indentationRules) {
            this.indentRulesSupport = new IndentRulesSupport(this.underlyingConfig.indentationRules);
        }
        else {
            this.indentRulesSupport = null;
        }
        this.foldingRules = this.underlyingConfig.folding || {};
        this.bracketsNew = new LanguageBracketsConfiguration(languageId, this.underlyingConfig);
    }
    getWordDefinition() {
        return ensureValidWordDefinition(this.wordDefinition);
    }
    get brackets() {
        if (!this._brackets && this.underlyingConfig.brackets) {
            this._brackets = new RichEditBrackets(this.languageId, this.underlyingConfig.brackets);
        }
        return this._brackets;
    }
    get electricCharacter() {
        if (!this._electricCharacter) {
            this._electricCharacter = new BracketElectricCharacterSupport(this.brackets);
        }
        return this._electricCharacter;
    }
    onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText) {
        if (!this._onEnterSupport) {
            return null;
        }
        return this._onEnterSupport.onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText);
    }
    getAutoClosingPairs() {
        return new AutoClosingPairs(this.characterPair.getAutoClosingPairs());
    }
    getAutoCloseBeforeSet(forQuotes) {
        return this.characterPair.getAutoCloseBeforeSet(forQuotes);
    }
    getSurroundingPairs() {
        return this.characterPair.getSurroundingPairs();
    }
    static _handleComments(conf) {
        const commentRule = conf.comments;
        if (!commentRule) {
            return null;
        }
        // comment configuration
        const comments = {};
        if (commentRule.lineComment) {
            if (typeof commentRule.lineComment === 'string') {
                comments.lineCommentToken = commentRule.lineComment;
            }
            else {
                comments.lineCommentToken = commentRule.lineComment.comment;
                comments.lineCommentNoIndent = commentRule.lineComment.noIndent;
            }
        }
        if (commentRule.blockComment) {
            const [blockStart, blockEnd] = commentRule.blockComment;
            comments.blockCommentStartToken = blockStart;
            comments.blockCommentEndToken = blockEnd;
        }
        return comments;
    }
}
registerSingleton(ILanguageConfigurationService, LanguageConfigurationService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0csT0FBTyxLQUFLLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUUzRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN2RixPQUFPLEVBQXVGLGdCQUFnQixFQUFnRCxNQUFNLDRCQUE0QixDQUFDO0FBQ2pNLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ25FLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ2pELE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUscUJBQXFC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