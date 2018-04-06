/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { parse, ParseError } from 'vs/base/common/json';
import { readFile } from 'vs/base/node/pfs';
import { CharacterPair, LanguageConfiguration, IAutoClosingPair, IAutoClosingPairConditional, IndentationRule, CommentRule, FoldingRules } from 'vs/editor/common/modes/languageConfiguration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { Extensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';

interface IRegExp {
	pattern: string;
	flags?: string;
}

interface IIndentationRules {
	decreaseIndentPattern: string | IRegExp;
	increaseIndentPattern: string | IRegExp;
	indentNextLinePattern?: string | IRegExp;
	unIndentedLinePattern?: string | IRegExp;
}

interface ILanguageConfiguration {
	comments?: CommentRule;
	brackets?: CharacterPair[];
	autoClosingPairs?: (CharacterPair | IAutoClosingPairConditional)[];
	surroundingPairs?: (CharacterPair | IAutoClosingPair)[];
	wordPattern?: string | IRegExp;
	indentationRules?: IIndentationRules;
	folding?: FoldingRules;
}

function isStringArr(something: string[]): boolean {
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

function isCharacterPair(something: CharacterPair): boolean {
	return (
		isStringArr(something)
		&& something.length === 2
	);
}

export class LanguageConfigurationFileHandler {

	private _modeService: IModeService;
	private _done: boolean[];

	constructor(
		@ITextMateService textMateService: ITextMateService,
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;
		this._done = [];

		// Listen for hints that a language configuration is needed/usefull and then load it once
		this._modeService.onDidCreateMode((mode) => this._loadConfigurationsForMode(mode.getLanguageIdentifier()));
		textMateService.onDidEncounterLanguage((languageId) => {
			this._loadConfigurationsForMode(this._modeService.getLanguageIdentifier(languageId));
		});
	}

	private _loadConfigurationsForMode(languageIdentifier: LanguageIdentifier): void {
		if (this._done[languageIdentifier.id]) {
			return;
		}
		this._done[languageIdentifier.id] = true;

		let configurationFiles = this._modeService.getConfigurationFiles(languageIdentifier.language);
		configurationFiles.forEach((configFilePath) => this._handleConfigFile(languageIdentifier, configFilePath));
	}

	private _handleConfigFile(languageIdentifier: LanguageIdentifier, configFilePath: string): void {
		readFile(configFilePath).then((fileContents) => {
			const errors: ParseError[] = [];
			const configuration = <ILanguageConfiguration>parse(fileContents.toString(), errors);
			if (errors.length) {
				console.error(nls.localize('parseErrors', "Errors parsing {0}: {1}", configFilePath, errors.join('\n')));
			}
			this._handleConfig(languageIdentifier, configuration);
		}, (err) => {
			console.error(err);
		});
	}

	private _extractValidCommentRule(languageIdentifier: LanguageIdentifier, configuration: ILanguageConfiguration): CommentRule {
		const source = configuration.comments;
		if (typeof source === 'undefined') {
			return null;
		}
		if (!types.isObject(source)) {
			console.warn(`[${languageIdentifier.language}]: language configuration: expected \`comments\` to be an object.`);
			return null;
		}

		let result: CommentRule = null;
		if (typeof source.lineComment !== 'undefined') {
			if (typeof source.lineComment !== 'string') {
				console.warn(`[${languageIdentifier.language}]: language configuration: expected \`comments.lineComment\` to be a string.`);
			} else {
				result = result || {};
				result.lineComment = source.lineComment;
			}
		}
		if (typeof source.blockComment !== 'undefined') {
			if (!isCharacterPair(source.blockComment)) {
				console.warn(`[${languageIdentifier.language}]: language configuration: expected \`comments.blockComment\` to be an array of two strings.`);
			} else {
				result = result || {};
				result.blockComment = source.blockComment;
			}
		}
		return result;
	}

	private _extractValidBrackets(languageIdentifier: LanguageIdentifier, configuration: ILanguageConfiguration): CharacterPair[] {
		const source = configuration.brackets;
		if (typeof source === 'undefined') {
			return null;
		}
		if (!Array.isArray(source)) {
			console.warn(`[${languageIdentifier.language}]: language configuration: expected \`brackets\` to be an array.`);
			return null;
		}

		let result: CharacterPair[] = null;
		for (let i = 0, len = source.length; i < len; i++) {
			const pair = source[i];
			if (!isCharacterPair(pair)) {
				console.warn(`[${languageIdentifier.language}]: language configuration: expected \`brackets[${i}]\` to be an array of two strings.`);
				continue;
			}

			result = result || [];
			result.push(pair);
		}
		return result;
	}

	private _extractValidAutoClosingPairs(languageIdentifier: LanguageIdentifier, configuration: ILanguageConfiguration): IAutoClosingPairConditional[] {
		const source = configuration.autoClosingPairs;
		if (typeof source === 'undefined') {
			return null;
		}
		if (!Array.isArray(source)) {
			console.warn(`[${languageIdentifier.language}]: language configuration: expected \`autoClosingPairs\` to be an array.`);
			return null;
		}

		let result: IAutoClosingPairConditional[] = null;
		for (let i = 0, len = source.length; i < len; i++) {
			const pair = source[i];
			if (Array.isArray(pair)) {
				if (!isCharacterPair(pair)) {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
					continue;
				}
				result = result || [];
				result.push({ open: pair[0], close: pair[1] });
			} else {
				if (!types.isObject(pair)) {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
					continue;
				}
				if (typeof pair.open !== 'string') {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`autoClosingPairs[${i}].open\` to be a string.`);
					continue;
				}
				if (typeof pair.close !== 'string') {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`autoClosingPairs[${i}].close\` to be a string.`);
					continue;
				}
				if (typeof pair.notIn !== 'undefined') {
					if (!isStringArr(pair.notIn)) {
						console.warn(`[${languageIdentifier.language}]: language configuration: expected \`autoClosingPairs[${i}].notIn\` to be a string array.`);
						continue;
					}
				}
				result = result || [];
				result.push({ open: pair.open, close: pair.close, notIn: pair.notIn });
			}
		}
		return result;
	}

	private _extractValidSurroundingPairs(languageIdentifier: LanguageIdentifier, configuration: ILanguageConfiguration): IAutoClosingPair[] {
		const source = configuration.surroundingPairs;
		if (typeof source === 'undefined') {
			return null;
		}
		if (!Array.isArray(source)) {
			console.warn(`[${languageIdentifier.language}]: language configuration: expected \`surroundingPairs\` to be an array.`);
			return null;
		}

		let result: IAutoClosingPair[] = null;
		for (let i = 0, len = source.length; i < len; i++) {
			const pair = source[i];
			if (Array.isArray(pair)) {
				if (!isCharacterPair(pair)) {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
					continue;
				}
				result = result || [];
				result.push({ open: pair[0], close: pair[1] });
			} else {
				if (!types.isObject(pair)) {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
					continue;
				}
				if (typeof pair.open !== 'string') {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`surroundingPairs[${i}].open\` to be a string.`);
					continue;
				}
				if (typeof pair.close !== 'string') {
					console.warn(`[${languageIdentifier.language}]: language configuration: expected \`surroundingPairs[${i}].close\` to be a string.`);
					continue;
				}
				result = result || [];
				result.push({ open: pair.open, close: pair.close });
			}
		}
		return result;
	}

	// private _mapCharacterPairs(pairs: (CharacterPair | IAutoClosingPairConditional)[]): IAutoClosingPairConditional[] {
	// 	return pairs.map(pair => {
	// 		if (Array.isArray(pair)) {
	// 			return { open: pair[0], close: pair[1] };
	// 		}
	// 		return <IAutoClosingPairConditional>pair;
	// 	});
	// }

	private _handleConfig(languageIdentifier: LanguageIdentifier, configuration: ILanguageConfiguration): void {

		let richEditConfig: LanguageConfiguration = {};

		const comments = this._extractValidCommentRule(languageIdentifier, configuration);
		if (comments) {
			richEditConfig.comments = comments;
		}

		const brackets = this._extractValidBrackets(languageIdentifier, configuration);
		if (brackets) {
			richEditConfig.brackets = brackets;
		}

		const autoClosingPairs = this._extractValidAutoClosingPairs(languageIdentifier, configuration);
		if (autoClosingPairs) {
			richEditConfig.autoClosingPairs = autoClosingPairs;
		}

		const surroundingPairs = this._extractValidSurroundingPairs(languageIdentifier, configuration);
		if (surroundingPairs) {
			richEditConfig.surroundingPairs = surroundingPairs;
		}

		if (configuration.wordPattern) {
			try {
				let wordPattern = this._parseRegex(configuration.wordPattern);
				if (wordPattern) {
					richEditConfig.wordPattern = wordPattern;
				}
			} catch (error) {
				// Malformed regexes are ignored
			}
		}

		if (configuration.indentationRules) {
			let indentationRules = this._mapIndentationRules(configuration.indentationRules);
			if (indentationRules) {
				richEditConfig.indentationRules = indentationRules;
			}
		}

		if (configuration.folding) {
			let markers = configuration.folding.markers;

			richEditConfig.folding = {
				offSide: configuration.folding.offSide,
				markers: markers ? { start: new RegExp(markers.start), end: new RegExp(markers.end) } : void 0
			};
		}

		LanguageConfigurationRegistry.register(languageIdentifier, richEditConfig);
	}

	private _parseRegex(value: string | IRegExp) {
		if (typeof value === 'string') {
			return new RegExp(value, '');
		} else if (typeof value === 'object') {
			return new RegExp(value.pattern, value.flags);
		}

		return null;
	}

	private _mapIndentationRules(indentationRules: IIndentationRules): IndentationRule {
		try {
			let increaseIndentPattern = this._parseRegex(indentationRules.increaseIndentPattern);
			let decreaseIndentPattern = this._parseRegex(indentationRules.decreaseIndentPattern);

			if (increaseIndentPattern && decreaseIndentPattern) {
				let result: IndentationRule = {
					increaseIndentPattern: increaseIndentPattern,
					decreaseIndentPattern: decreaseIndentPattern
				};

				if (indentationRules.indentNextLinePattern) {
					result.indentNextLinePattern = this._parseRegex(indentationRules.indentNextLinePattern);
				}
				if (indentationRules.unIndentedLinePattern) {
					result.unIndentedLinePattern = this._parseRegex(indentationRules.unIndentedLinePattern);
				}

				return result;
			}
		} catch (error) {
			// Malformed regexes are ignored
		}

		return null;
	}
}

const schemaId = 'vscode://schemas/language-configuration';
const schema: IJSONSchema = {
	allowComments: true,
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
				$ref: '#definitions/openBracket'
			}, {
				$ref: '#definitions/closeBracket'
			}]
		}
	},
	properties: {
		comments: {
			default: {
				blockComment: ['/*', '*/'],
				lineComment: '//'
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
					type: 'string',
					description: nls.localize('schema.lineComment', 'The character sequence that starts a line comment.')
				}
			}
		},
		brackets: {
			default: [['(', ')'], ['[', ']'], ['{', '}']],
			description: nls.localize('schema.brackets', 'Defines the bracket symbols that increase or decrease the indentation.'),
			type: 'array',
			items: {
				$ref: '#definitions/bracketPair'
			}
		},
		autoClosingPairs: {
			default: [['(', ')'], ['[', ']'], ['{', '}']],
			description: nls.localize('schema.autoClosingPairs', 'Defines the bracket pairs. When a opening bracket is entered, the closing bracket is inserted automatically.'),
			type: 'array',
			items: {
				oneOf: [{
					$ref: '#definitions/bracketPair'
				}, {
					type: 'object',
					properties: {
						open: {
							$ref: '#definitions/openBracket'
						},
						close: {
							$ref: '#definitions/closeBracket'
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
		surroundingPairs: {
			default: [['(', ')'], ['[', ']'], ['{', '}']],
			description: nls.localize('schema.surroundingPairs', 'Defines the bracket pairs that can be used to surround a selected string.'),
			type: 'array',
			items: {
				oneOf: [{
					$ref: '#definitions/bracketPair'
				}, {
					type: 'object',
					properties: {
						open: {
							$ref: '#definitions/openBracket'
						},
						close: {
							$ref: '#definitions/closeBracket'
						}
					}
				}]
			}
		},
		wordPattern: {
			default: '',
			description: nls.localize('schema.wordPattern', 'The word definition for the language.'),
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
					description: nls.localize('schema.indentationRules.decreaseIndentPattern', 'If a line matches this pattern, then all the lines after it should be unindendented once (until another rule matches).'),
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
		}

	}
};
let schemaRegistry = Registry.as<IJSONContributionRegistry>(Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
