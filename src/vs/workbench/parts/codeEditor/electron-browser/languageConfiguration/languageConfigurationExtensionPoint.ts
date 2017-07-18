/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { parse, ParseError } from 'vs/base/common/json';
import { readFile } from 'vs/base/node/pfs';
import { CharacterPair, LanguageConfiguration, IAutoClosingPair, IAutoClosingPairConditional, IndentationRule, CommentRule } from 'vs/editor/common/modes/languageConfiguration';
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

	private _handleConfig(languageIdentifier: LanguageIdentifier, configuration: ILanguageConfiguration): void {

		let richEditConfig: LanguageConfiguration = {};

		if (configuration.comments) {
			richEditConfig.comments = configuration.comments;
		}

		if (configuration.brackets) {
			richEditConfig.brackets = configuration.brackets;
		}

		if (configuration.autoClosingPairs) {
			richEditConfig.autoClosingPairs = this._mapCharacterPairs(configuration.autoClosingPairs);
		}

		if (configuration.surroundingPairs) {
			richEditConfig.surroundingPairs = this._mapCharacterPairs(configuration.surroundingPairs);
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

	private _mapCharacterPairs(pairs: (CharacterPair | IAutoClosingPairConditional)[]): IAutoClosingPairConditional[] {
		return pairs.map(pair => {
			if (Array.isArray(pair)) {
				return { open: pair[0], close: pair[1] };
			}
			return <IAutoClosingPairConditional>pair;
		});
	}
}

const schemaId = 'vscode://schemas/language-configuration';
const schema: IJSONSchema = {
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
		}
	}
};
let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
