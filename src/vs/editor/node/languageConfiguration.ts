/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {parse} from 'vs/base/common/json';
import {readFile} from 'vs/base/node/pfs';
import {LanguageConfiguration} from 'vs/editor/common/modes/languageConfigurationRegistry';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IAutoClosingPair, IAutoClosingPairConditional} from 'vs/editor/common/modes';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';
import {Extensions, IJSONContributionRegistry} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {Registry} from 'vs/platform/platform';
import {IJSONSchema} from 'vs/base/common/jsonSchema';

type CharacterPair = [string, string];

interface ICommentRule {
	lineComment?: string;
	blockComment?: CharacterPair;
}

interface ILanguageConfiguration {
	comments?: ICommentRule;
	brackets?: CharacterPair[];
	autoClosingPairs?: (CharacterPair | IAutoClosingPairConditional)[];
	surroundingPairs?: (CharacterPair | IAutoClosingPair)[];
}

export class LanguageConfigurationFileHandler {

	private _modeService: IModeService;

	constructor(
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;

		this._handleModes(this._modeService.getRegisteredModes());
		this._modeService.onDidAddModes((modes) => this._handleModes(modes));
	}

	private _handleModes(modes:string[]): void {
		modes.forEach(modeId => this._handleMode(modeId));
	}

	private _handleMode(modeId:string): void {
		let disposable = this._modeService.onDidCreateMode((mode) => {
			if (mode.getId() !== modeId) {
				return;
			}

			let configurationFiles = this._modeService.getConfigurationFiles(modeId);
			configurationFiles.forEach((configFilePath) => this._handleConfigFile(modeId, configFilePath));

			disposable.dispose();
		});
	}

	private _handleConfigFile(modeId:string, configFilePath:string): void {
		readFile(configFilePath).then((fileContents) => {
			var errors = [];
			var configuration = <ILanguageConfiguration>parse(fileContents.toString(), errors);
			if (errors.length) {
				console.error(nls.localize('parseErrors', "Errors parsing {0}: {1}", configFilePath, errors.join('\n')));
			}
			this._handleConfig(modeId, configuration);
		}, (err) => {
			console.error(err);
		});
	}

	private _handleConfig(modeId:string, configuration:ILanguageConfiguration): void {

		let richEditConfig:LanguageConfiguration = {};

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

		LanguageConfigurationRegistry.register(modeId, richEditConfig);
	}

	private _mapCharacterPairs(pairs: (CharacterPair | IAutoClosingPairConditional)[]): IAutoClosingPairConditional[] {
		return pairs.map(pair => {
			if (Array.isArray(pair)) {
				return { open: pair[0], close: pair[1] };
			}
			return <IAutoClosingPairConditional> pair;
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
		brackets: [ [ '(', ')' ], [ '[', ']' ] , [ '{', '}' ]],
		autoClosingPairs: [ [ '(', ')' ], [ '[', ']' ] , [ '{', '}' ]],
		surroundingPairs: [ [ '(', ')' ], [ '[', ']' ] , [ '{', '}' ]]
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
			},{
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
					},{
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
			default: [ [ '(', ')' ], [ '[', ']' ] , [ '{', '}' ]],
			description: nls.localize('schema.brackets', 'Defines the bracket symbols that increase or decrease the indentation.'),
			type: 'array',
			items: {
				$ref: '#definitions/bracketPair'
			}
		},
		autoClosingPairs: {
			default: [ [ '(', ')' ], [ '[', ']' ] , [ '{', '}' ]],
			description: nls.localize('schema.autoClosingPairs', 'Defines the bracket pairs. When a opening bracket is entered, the closing bracket is inserted automatically.'),
			type: 'array',
			items: {
				oneOf: [{
					$ref: '#definitions/bracketPair'
				},{
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
			default: [ [ '(', ')' ], [ '[', ']' ] , [ '{', '}' ]],
			description: nls.localize('schema.surroundingPairs', 'Defines the bracket pairs that can be used to surround a selected string.'),
			type: 'array',
			items: {
				oneOf: [{
					$ref: '#definitions/bracketPair'
				},{
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
	}
};
let schemaRegistry = <IJSONContributionRegistry>Registry.as(Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
