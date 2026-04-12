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
var LanguageConfigurationFileHandler_1;
import * as nls from '../../../../nls.js';
import { parse, getNodeType } from '../../../../base/common/json.js';
import * as types from '../../../../base/common/types.js';
import { IndentAction } from '../../../../editor/common/languages/languageConfiguration.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { Extensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { getParseErrorMessage } from '../../../../base/common/jsonErrorMessages.js';
import { IExtensionResourceLoaderService } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
function isStringArr(something) {
    if (!Array.isArray(something)) {
        return false;
    }
    for (let i = 0, len = something.length; i < len; i++) {
        if (typeof something[i] !== 'string') {
            return false;
        }
    }
    return true;
}
function isCharacterPair(something) {
    return (isStringArr(something)
        && something.length === 2);
}
let LanguageConfigurationFileHandler = LanguageConfigurationFileHandler_1 = class LanguageConfigurationFileHandler extends Disposable {
    constructor(_languageService, _extensionResourceLoaderService, _extensionService, _languageConfigurationService) {
        super();
        this._languageService = _languageService;
        this._extensionResourceLoaderService = _extensionResourceLoaderService;
        this._extensionService = _extensionService;
        this._languageConfigurationService = _languageConfigurationService;
        /**
         * A map from language id to a hash computed from the config files locations.
         */
        this._done = new Map();
        this._register(this._languageService.onDidRequestBasicLanguageFeatures(async (languageIdentifier) => {
            // Modes can be instantiated before the extension points have finished registering
            this._extensionService.whenInstalledExtensionsRegistered().then(() => {
                this._loadConfigurationsForMode(languageIdentifier);
            });
        }));
        this._register(this._languageService.onDidChange(() => {
            // reload language configurations as necessary
            for (const [languageId] of this._done) {
                this._loadConfigurationsForMode(languageId);
            }
        }));
    }
    async _loadConfigurationsForMode(languageId) {
        const configurationFiles = this._languageService.getConfigurationFiles(languageId);
        const configurationHash = hash(configurationFiles.map(uri => uri.toString()));
        if (this._done.get(languageId) === configurationHash) {
            return;
        }
        this._done.set(languageId, configurationHash);
        const configs = await Promise.all(configurationFiles.map(configFile => this._readConfigFile(configFile)));
        for (const config of configs) {
            this._handleConfig(languageId, config);
        }
    }
    async _readConfigFile(configFileLocation) {
        try {
            const contents = await this._extensionResourceLoaderService.readExtensionResource(configFileLocation);
            const errors = [];
            let configuration = parse(contents, errors);
            if (errors.length) {
                console.error(nls.localize('parseErrors', "Errors parsing {0}: {1}", configFileLocation.toString(), errors.map(e => (`[${e.offset}, ${e.length}] ${getParseErrorMessage(e.error)}`)).join('\n')));
            }
            if (getNodeType(configuration) !== 'object') {
                console.error(nls.localize('formatError', "{0}: Invalid format, JSON object expected.", configFileLocation.toString()));
                configuration = {};
            }
            return configuration;
        }
        catch (err) {
            console.error(err);
            return {};
        }
    }
    static _extractValidCommentRule(languageId, configuration) {
        const source = configuration.comments;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!types.isObject(source)) {
            console.warn(`[${languageId}]: language configuration: expected \`comments\` to be an object.`);
            return undefined;
        }
        let result = undefined;
        if (typeof source.lineComment !== 'undefined') {
            if (typeof source.lineComment === 'string') {
                result = result || {};
                result.lineComment = source.lineComment;
            }
            else if (types.isObject(source.lineComment)) {
                const lineCommentObj = source.lineComment;
                if (typeof lineCommentObj.comment === 'string') {
                    result = result || {};
                    result.lineComment = {
                        comment: lineCommentObj.comment,
                        noIndent: lineCommentObj.noIndent
                    };
                }
                else {
                    console.warn(`[${languageId}]: language configuration: expected \`comments.lineComment.comment\` to be a string.`);
                }
            }
            else {
                console.warn(`[${languageId}]: language configuration: expected \`comments.lineComment\` to be a string or an object with comment property.`);
            }
        }
        if (typeof source.blockComment !== 'undefined') {
            if (!isCharacterPair(source.blockComment)) {
                console.warn(`[${languageId}]: language configuration: expected \`comments.blockComment\` to be an array of two strings.`);
            }
            else {
                result = result || {};
                result.blockComment = source.blockComment;
            }
        }
        return result;
    }
    static _extractValidBrackets(languageId, configuration) {
        const source = configuration.brackets;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${languageId}]: language configuration: expected \`brackets\` to be an array.`);
            return undefined;
        }
        let result = undefined;
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (!isCharacterPair(pair)) {
                console.warn(`[${languageId}]: language configuration: expected \`brackets[${i}]\` to be an array of two strings.`);
                continue;
            }
            result = result || [];
            result.push(pair);
        }
        return result;
    }
    static _extractValidAutoClosingPairs(languageId, configuration) {
        const source = configuration.autoClosingPairs;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs\` to be an array.`);
            return undefined;
        }
        let result = undefined;
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (Array.isArray(pair)) {
                if (!isCharacterPair(pair)) {
                    console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair[0], close: pair[1] });
            }
            else {
                if (!types.isObject(pair)) {
                    console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                if (typeof pair.open !== 'string') {
                    console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].open\` to be a string.`);
                    continue;
                }
                if (typeof pair.close !== 'string') {
                    console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].close\` to be a string.`);
                    continue;
                }
                if (typeof pair.notIn !== 'undefined') {
                    if (!isStringArr(pair.notIn)) {
                        console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].notIn\` to be a string array.`);
                        continue;
                    }
                }
                result = result || [];
                result.push({ open: pair.open, close: pair.close, notIn: pair.notIn });
            }
        }
        return result;
    }
    static _extractValidSurroundingPairs(languageId, configuration) {
        const source = configuration.surroundingPairs;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs\` to be an array.`);
            return undefined;
        }
        let result = undefined;
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (Array.isArray(pair)) {
                if (!isCharacterPair(pair)) {
                    console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair[0], close: pair[1] });
            }
            else {
                if (!types.isObject(pair)) {
                    console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
                    continue;
                }
                if (typeof pair.open !== 'string') {
                    console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}].open\` to be a string.`);
                    continue;
                }
                if (typeof pair.close !== 'string') {
                    console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}].close\` to be a string.`);
                    continue;
                }
                result = result || [];
                result.push({ open: pair.open, close: pair.close });
            }
        }
        return result;
    }
    static _extractValidColorizedBracketPairs(languageId, configuration) {
        const source = configuration.colorizedBracketPairs;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${languageId}]: language configuration: expected \`colorizedBracketPairs\` to be an array.`);
            return undefined;
        }
        const result = [];
        for (let i = 0, len = source.length; i < len; i++) {
            const pair = source[i];
            if (!isCharacterPair(pair)) {
                console.warn(`[${languageId}]: language configuration: expected \`colorizedBracketPairs[${i}]\` to be an array of two strings.`);
                continue;
            }
            result.push([pair[0], pair[1]]);
        }
        return result;
    }
    static _extractValidOnEnterRules(languageId, configuration) {
        const source = configuration.onEnterRules;
        if (typeof source === 'undefined') {
            return undefined;
        }
        if (!Array.isArray(source)) {
            console.warn(`[${languageId}]: language configuration: expected \`onEnterRules\` to be an array.`);
            return undefined;
        }
        let result = undefined;
        for (let i = 0, len = source.length; i < len; i++) {
            const onEnterRule = source[i];
            if (!types.isObject(onEnterRule)) {
                console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}]\` to be an object.`);
                continue;
            }
            if (!types.isObject(onEnterRule.action)) {
                console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action\` to be an object.`);
                continue;
            }
            let indentAction;
            if (onEnterRule.action.indent === 'none') {
                indentAction = IndentAction.None;
            }
            else if (onEnterRule.action.indent === 'indent') {
                indentAction = IndentAction.Indent;
            }
            else if (onEnterRule.action.indent === 'indentOutdent') {
                indentAction = IndentAction.IndentOutdent;
            }
            else if (onEnterRule.action.indent === 'outdent') {
                indentAction = IndentAction.Outdent;
            }
            else {
                console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.indent\` to be 'none', 'indent', 'indentOutdent' or 'outdent'.`);
                continue;
            }
            const action = { indentAction };
            if (onEnterRule.action.appendText) {
                if (typeof onEnterRule.action.appendText === 'string') {
                    action.appendText = onEnterRule.action.appendText;
                }
                else {
                    console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.appendText\` to be undefined or a string.`);
                }
            }
            if (onEnterRule.action.removeText) {
                if (typeof onEnterRule.action.removeText === 'number') {
                    action.removeText = onEnterRule.action.removeText;
                }
                else {
                    console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.removeText\` to be undefined or a number.`);
                }
            }
            const beforeText = this._parseRegex(languageId, `onEnterRules[${i}].beforeText`, onEnterRule.beforeText);
            if (!beforeText) {
                continue;
            }
            const resultingOnEnterRule = { beforeText, action };
            if (onEnterRule.afterText) {
                const afterText = this._parseRegex(languageId, `onEnterRules[${i}].afterText`, onEnterRule.afterText);
                if (afterText) {
                    resultingOnEnterRule.afterText = afterText;
                }
            }
            if (onEnterRule.previousLineText) {
                const previousLineText = this._parseRegex(languageId, `onEnterRules[${i}].previousLineText`, onEnterRule.previousLineText);
                if (previousLineText) {
                    resultingOnEnterRule.previousLineText = previousLineText;
                }
            }
            result = result || [];
            result.push(resultingOnEnterRule);
        }
        return result;
    }
    static extractValidConfig(languageId, configuration) {
        const comments = this._extractValidCommentRule(languageId, configuration);
        const brackets = this._extractValidBrackets(languageId, configuration);
        const autoClosingPairs = this._extractValidAutoClosingPairs(languageId, configuration);
        const surroundingPairs = this._extractValidSurroundingPairs(languageId, configuration);
        const colorizedBracketPairs = this._extractValidColorizedBracketPairs(languageId, configuration);
        const autoCloseBefore = (typeof configuration.autoCloseBefore === 'string' ? configuration.autoCloseBefore : undefined);
        const wordPattern = (configuration.wordPattern ? this._parseRegex(languageId, `wordPattern`, configuration.wordPattern) : undefined);
        const indentationRules = (configuration.indentationRules ? this._mapIndentationRules(languageId, configuration.indentationRules) : undefined);
        let folding = undefined;
        if (configuration.folding) {
            const rawMarkers = configuration.folding.markers;
            const startMarker = (rawMarkers && rawMarkers.start ? this._parseRegex(languageId, `folding.markers.start`, rawMarkers.start) : undefined);
            const endMarker = (rawMarkers && rawMarkers.end ? this._parseRegex(languageId, `folding.markers.end`, rawMarkers.end) : undefined);
            const markers = (startMarker && endMarker ? { start: startMarker, end: endMarker } : undefined);
            folding = {
                offSide: configuration.folding.offSide,
                markers
            };
        }
        const onEnterRules = this._extractValidOnEnterRules(languageId, configuration);
        const richEditConfig = {
            comments,
            brackets,
            wordPattern,
            indentationRules,
            onEnterRules,
            autoClosingPairs,
            surroundingPairs,
            colorizedBracketPairs,
            autoCloseBefore,
            folding,
            __electricCharacterSupport: undefined,
        };
        return richEditConfig;
    }
    _handleConfig(languageId, configuration) {
        const richEditConfig = LanguageConfigurationFileHandler_1.extractValidConfig(languageId, configuration);
        this._languageConfigurationService.register(languageId, richEditConfig, 50);
    }
    static _parseRegex(languageId, confPath, value) {
        if (typeof value === 'string') {
            try {
                return new RegExp(value, '');
            }
            catch (err) {
                console.warn(`[${languageId}]: Invalid regular expression in \`${confPath}\`: `, err);
                return undefined;
            }
        }
        if (types.isObject(value)) {
            if (typeof value.pattern !== 'string') {
                console.warn(`[${languageId}]: language configuration: expected \`${confPath}.pattern\` to be a string.`);
                return undefined;
            }
            if (typeof value.flags !== 'undefined' && typeof value.flags !== 'string') {
                console.warn(`[${languageId}]: language configuration: expected \`${confPath}.flags\` to be a string.`);
                return undefined;
            }
            try {
                return new RegExp(value.pattern, value.flags);
            }
            catch (err) {
                console.warn(`[${languageId}]: Invalid regular expression in \`${confPath}\`: `, err);
                return undefined;
            }
        }
        console.warn(`[${languageId}]: language configuration: expected \`${confPath}\` to be a string or an object.`);
        return undefined;
    }
    static _mapIndentationRules(languageId, indentationRules) {
        const increaseIndentPattern = this._parseRegex(languageId, `indentationRules.increaseIndentPattern`, indentationRules.increaseIndentPattern);
        if (!increaseIndentPattern) {
            return undefined;
        }
        const decreaseIndentPattern = this._parseRegex(languageId, `indentationRules.decreaseIndentPattern`, indentationRules.decreaseIndentPattern);
        if (!decreaseIndentPattern) {
            return undefined;
        }
        const result = {
            increaseIndentPattern: increaseIndentPattern,
            decreaseIndentPattern: decreaseIndentPattern
        };
        if (indentationRules.indentNextLinePattern) {
            result.indentNextLinePattern = this._parseRegex(languageId, `indentationRules.indentNextLinePattern`, indentationRules.indentNextLinePattern);
        }
        if (indentationRules.unIndentedLinePattern) {
            result.unIndentedLinePattern = this._parseRegex(languageId, `indentationRules.unIndentedLinePattern`, indentationRules.unIndentedLinePattern);
        }
        return result;
    }
};
LanguageConfigurationFileHandler = LanguageConfigurationFileHandler_1 = __decorate([
    __param(0, ILanguageService),
    __param(1, IExtensionResourceLoaderService),
    __param(2, IExtensionService),
    __param(3, ILanguageConfigurationService)
], LanguageConfigurationFileHandler);
export { LanguageConfigurationFileHandler };
const schemaId = 'vscode://schemas/language-configuration';
const schema = {
    allowComments: true,
    allowTrailingCommas: true,
    default: {
        comments: {
            blockComment: ['/*', '*/'],
            lineComment: '//'
        },
        brackets: [['(', ')'], ['[', ']'], ['{', '}']],
        autoClosingPairs: [['(', ')'], ['[', ']'], ['{', '}']],
        surroundingPairs: [['(', ')'], ['[', ']'], ['{', '}']]
    },
    definitions: {
        openBracket: {
            type: 'string',
            description: nls.localize('schema.openBracket', 'The opening bracket character or string sequence.')
        },
        closeBracket: {
            type: 'string',
            description: nls.localize('schema.closeBracket', 'The closing bracket character or string sequence.')
        },
        bracketPair: {
            type: 'array',
            items: [{
                    $ref: '#/definitions/openBracket'
                }, {
                    $ref: '#/definitions/closeBracket'
                }]
        }
    },
    properties: {
        comments: {
            default: {
                blockComment: ['/*', '*/'],
                lineComment: { comment: '//', noIndent: false }
            },
            description: nls.localize('schema.comments', 'Defines the comment symbols'),
            type: 'object',
            properties: {
                blockComment: {
                    type: 'array',
                    description: nls.localize('schema.blockComments', 'Defines how block comments are marked.'),
                    items: [{
                            type: 'string',
                            description: nls.localize('schema.blockComment.begin', 'The character sequence that starts a block comment.')
                        }, {
                            type: 'string',
                            description: nls.localize('schema.blockComment.end', 'The character sequence that ends a block comment.')
                        }]
                },
                lineComment: {
                    type: 'object',
                    description: nls.localize('schema.lineComment.object', 'Configuration for line comments.'),
                    properties: {
                        comment: {
                            type: 'string',
                            description: nls.localize('schema.lineComment.comment', 'The character sequence that starts a line comment.')
                        },
                        noIndent: {
                            type: 'boolean',
                            description: nls.localize('schema.lineComment.noIndent', 'Whether the comment token should not be indented and placed at the first column. Defaults to false.'),
                            default: false
                        }
                    },
                    required: ['comment'],
                    additionalProperties: false
                }
            }
        },
        brackets: {
            default: [['(', ')'], ['[', ']'], ['{', '}']],
            markdownDescription: nls.localize('schema.brackets', 'Defines the bracket symbols that increase or decrease the indentation. When bracket pair colorization is enabled and {0} is not defined, this also defines the bracket pairs that are colorized by their nesting level.', '\`colorizedBracketPairs\`'),
            type: 'array',
            items: {
                $ref: '#/definitions/bracketPair'
            }
        },
        colorizedBracketPairs: {
            default: [['(', ')'], ['[', ']'], ['{', '}']],
            markdownDescription: nls.localize('schema.colorizedBracketPairs', 'Defines the bracket pairs that are colorized by their nesting level if bracket pair colorization is enabled. Any brackets included here that are not included in {0} will be automatically included in {0}.', '\`brackets\`'),
            type: 'array',
            items: {
                $ref: '#/definitions/bracketPair'
            }
        },
        autoClosingPairs: {
            default: [['(', ')'], ['[', ']'], ['{', '}']],
            description: nls.localize('schema.autoClosingPairs', 'Defines the bracket pairs. When a opening bracket is entered, the closing bracket is inserted automatically.'),
            type: 'array',
            items: {
                oneOf: [{
                        $ref: '#/definitions/bracketPair'
                    }, {
                        type: 'object',
                        properties: {
                            open: {
                                $ref: '#/definitions/openBracket'
                            },
                            close: {
                                $ref: '#/definitions/closeBracket'
                            },
                            notIn: {
                                type: 'array',
                                description: nls.localize('schema.autoClosingPairs.notIn', 'Defines a list of scopes where the auto pairs are disabled.'),
                                items: {
                                    enum: ['string', 'comment']
                                }
                            }
                        }
                    }]
            }
        },
        autoCloseBefore: {
            default: ';:.,=}])> \n\t',
            description: nls.localize('schema.autoCloseBefore', 'Defines what characters must be after the cursor in order for bracket or quote autoclosing to occur when using the \'languageDefined\' autoclosing setting. This is typically the set of characters which can not start an expression.'),
            type: 'string',
        },
        surroundingPairs: {
            default: [['(', ')'], ['[', ']'], ['{', '}']],
            description: nls.localize('schema.surroundingPairs', 'Defines the bracket pairs that can be used to surround a selected string.'),
            type: 'array',
            items: {
                oneOf: [{
                        $ref: '#/definitions/bracketPair'
                    }, {
                        type: 'object',
                        properties: {
                            open: {
                                $ref: '#/definitions/openBracket'
                            },
                            close: {
                                $ref: '#/definitions/closeBracket'
                            }
                        }
                    }]
            }
        },
        wordPattern: {
            default: '',
            description: nls.localize('schema.wordPattern', 'Defines what is considered to be a word in the programming language.'),
            type: ['string', 'object'],
            properties: {
                pattern: {
                    type: 'string',
                    description: nls.localize('schema.wordPattern.pattern', 'The RegExp pattern used to match words.'),
                    default: '',
                },
                flags: {
                    type: 'string',
                    description: nls.localize('schema.wordPattern.flags', 'The RegExp flags used to match words.'),
                    default: 'g',
                    pattern: '^([gimuy]+)$',
                    patternErrorMessage: nls.localize('schema.wordPattern.flags.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                }
            }
        },
        indentationRules: {
            default: {
                increaseIndentPattern: '',
                decreaseIndentPattern: ''
            },
            description: nls.localize('schema.indentationRules', 'The language\'s indentation settings.'),
            type: 'object',
            properties: {
                increaseIndentPattern: {
                    type: ['string', 'object'],
                    description: nls.localize('schema.indentationRules.increaseIndentPattern', 'If a line matches this pattern, then all the lines after it should be indented once (until another rule matches).'),
                    properties: {
                        pattern: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.increaseIndentPattern.pattern', 'The RegExp pattern for increaseIndentPattern.'),
                            default: '',
                        },
                        flags: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.increaseIndentPattern.flags', 'The RegExp flags for increaseIndentPattern.'),
                            default: '',
                            pattern: '^([gimuy]+)$',
                            patternErrorMessage: nls.localize('schema.indentationRules.increaseIndentPattern.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                        }
                    }
                },
                decreaseIndentPattern: {
                    type: ['string', 'object'],
                    description: nls.localize('schema.indentationRules.decreaseIndentPattern', 'If a line matches this pattern, then all the lines after it should be unindented once (until another rule matches).'),
                    properties: {
                        pattern: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.decreaseIndentPattern.pattern', 'The RegExp pattern for decreaseIndentPattern.'),
                            default: '',
                        },
                        flags: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.decreaseIndentPattern.flags', 'The RegExp flags for decreaseIndentPattern.'),
                            default: '',
                            pattern: '^([gimuy]+)$',
                            patternErrorMessage: nls.localize('schema.indentationRules.decreaseIndentPattern.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                        }
                    }
                },
                indentNextLinePattern: {
                    type: ['string', 'object'],
                    description: nls.localize('schema.indentationRules.indentNextLinePattern', 'If a line matches this pattern, then **only the next line** after it should be indented once.'),
                    properties: {
                        pattern: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.indentNextLinePattern.pattern', 'The RegExp pattern for indentNextLinePattern.'),
                            default: '',
                        },
                        flags: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.indentNextLinePattern.flags', 'The RegExp flags for indentNextLinePattern.'),
                            default: '',
                            pattern: '^([gimuy]+)$',
                            patternErrorMessage: nls.localize('schema.indentationRules.indentNextLinePattern.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                        }
                    }
                },
                unIndentedLinePattern: {
                    type: ['string', 'object'],
                    description: nls.localize('schema.indentationRules.unIndentedLinePattern', 'If a line matches this pattern, then its indentation should not be changed and it should not be evaluated against the other rules.'),
                    properties: {
                        pattern: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.unIndentedLinePattern.pattern', 'The RegExp pattern for unIndentedLinePattern.'),
                            default: '',
                        },
                        flags: {
                            type: 'string',
                            description: nls.localize('schema.indentationRules.unIndentedLinePattern.flags', 'The RegExp flags for unIndentedLinePattern.'),
                            default: '',
                            pattern: '^([gimuy]+)$',
                            patternErrorMessage: nls.localize('schema.indentationRules.unIndentedLinePattern.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                        }
                    }
                }
            }
        },
        folding: {
            type: 'object',
            description: nls.localize('schema.folding', 'The language\'s folding settings.'),
            properties: {
                offSide: {
                    type: 'boolean',
                    description: nls.localize('schema.folding.offSide', 'A language adheres to the off-side rule if blocks in that language are expressed by their indentation. If set, empty lines belong to the subsequent block.'),
                },
                markers: {
                    type: 'object',
                    description: nls.localize('schema.folding.markers', 'Language specific folding markers such as \'#region\' and \'#endregion\'. The start and end regexes will be tested against the contents of all lines and must be designed efficiently'),
                    properties: {
                        start: {
                            type: 'string',
                            description: nls.localize('schema.folding.markers.start', 'The RegExp pattern for the start marker. The regexp must start with \'^\'.')
                        },
                        end: {
                            type: 'string',
                            description: nls.localize('schema.folding.markers.end', 'The RegExp pattern for the end marker. The regexp must start with \'^\'.')
                        },
                    }
                }
            }
        },
        onEnterRules: {
            type: 'array',
            description: nls.localize('schema.onEnterRules', 'The language\'s rules to be evaluated when pressing Enter.'),
            items: {
                type: 'object',
                description: nls.localize('schema.onEnterRules', 'The language\'s rules to be evaluated when pressing Enter.'),
                required: ['beforeText', 'action'],
                properties: {
                    beforeText: {
                        type: ['string', 'object'],
                        description: nls.localize('schema.onEnterRules.beforeText', 'This rule will only execute if the text before the cursor matches this regular expression.'),
                        properties: {
                            pattern: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.beforeText.pattern', 'The RegExp pattern for beforeText.'),
                                default: '',
                            },
                            flags: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.beforeText.flags', 'The RegExp flags for beforeText.'),
                                default: '',
                                pattern: '^([gimuy]+)$',
                                patternErrorMessage: nls.localize('schema.onEnterRules.beforeText.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                            }
                        }
                    },
                    afterText: {
                        type: ['string', 'object'],
                        description: nls.localize('schema.onEnterRules.afterText', 'This rule will only execute if the text after the cursor matches this regular expression.'),
                        properties: {
                            pattern: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.afterText.pattern', 'The RegExp pattern for afterText.'),
                                default: '',
                            },
                            flags: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.afterText.flags', 'The RegExp flags for afterText.'),
                                default: '',
                                pattern: '^([gimuy]+)$',
                                patternErrorMessage: nls.localize('schema.onEnterRules.afterText.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                            }
                        }
                    },
                    previousLineText: {
                        type: ['string', 'object'],
                        description: nls.localize('schema.onEnterRules.previousLineText', 'This rule will only execute if the text above the line matches this regular expression.'),
                        properties: {
                            pattern: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.previousLineText.pattern', 'The RegExp pattern for previousLineText.'),
                                default: '',
                            },
                            flags: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.previousLineText.flags', 'The RegExp flags for previousLineText.'),
                                default: '',
                                pattern: '^([gimuy]+)$',
                                patternErrorMessage: nls.localize('schema.onEnterRules.previousLineText.errorMessage', 'Must match the pattern `/^([gimuy]+)$/`.')
                            }
                        }
                    },
                    action: {
                        type: ['string', 'object'],
                        description: nls.localize('schema.onEnterRules.action', 'The action to execute.'),
                        required: ['indent'],
                        default: { 'indent': 'indent' },
                        properties: {
                            indent: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.action.indent', "Describe what to do with the indentation"),
                                default: 'indent',
                                enum: ['none', 'indent', 'indentOutdent', 'outdent'],
                                markdownEnumDescriptions: [
                                    nls.localize('schema.onEnterRules.action.indent.none', "Insert new line and copy the previous line's indentation."),
                                    nls.localize('schema.onEnterRules.action.indent.indent', "Insert new line and indent once (relative to the previous line's indentation)."),
                                    nls.localize('schema.onEnterRules.action.indent.indentOutdent', "Insert two new lines:\n - the first one indented which will hold the cursor\n - the second one at the same indentation level"),
                                    nls.localize('schema.onEnterRules.action.indent.outdent', "Insert new line and outdent once (relative to the previous line's indentation).")
                                ]
                            },
                            appendText: {
                                type: 'string',
                                description: nls.localize('schema.onEnterRules.action.appendText', 'Describes text to be appended after the new line and after the indentation.'),
                                default: '',
                            },
                            removeText: {
                                type: 'number',
                                description: nls.localize('schema.onEnterRules.action.removeText', 'Describes the number of characters to remove from the new line\'s indentation.'),
                                default: 0,
                            }
                        }
                    }
                }
            }
        }
    }
};
const schemaRegistry = Registry.as(Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VDb25maWd1cmF0aW9uRXh0ZW5zaW9uUG9pbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL2NvbW1vbi9sYW5ndWFnZUNvbmZpZ3VyYXRpb25FeHRlbnNpb25Qb2ludC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQWMsS0FBSyxFQUFFLFdBQVcsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRWpGLE9BQU8sS0FBSyxLQUFLLE1BQU0sa0NBQWtDLENBQUM7QUFFMUQsT0FBTyxFQUF1SixZQUFZLEVBQWdDLE1BQU0sOERBQThELENBQUM7QUFDL1EsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFDckgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLFVBQVUsRUFBNkIsTUFBTSxxRUFBcUUsQ0FBQztBQUM1SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDcEYsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sZ0ZBQWdGLENBQUM7QUFDakksT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQWlEbEUsU0FBUyxXQUFXLENBQUMsU0FBMEI7SUFDOUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFD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