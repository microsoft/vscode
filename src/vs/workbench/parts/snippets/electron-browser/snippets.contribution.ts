/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/registry/common/platform';
import * as JSONContributionRegistry from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import * as nls from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { LanguageId } from 'vs/editor/common/modes';
import { SnippetParser, Variable, Placeholder, Text } from 'vs/editor/contrib/snippet/snippetParser';
import { KnownSnippetVariableNames } from 'vs/editor/contrib/snippet/snippetVariables';

export const ISnippetsService = createDecorator<ISnippetsService>('snippetService');

export interface ISnippetsService {

	_serviceBrand: any;

	getSnippets(languageId: LanguageId): Promise<Snippet[]>;

	getSnippetsSync(languageId: LanguageId): Snippet[];
}


export class Snippet {

	private _codeSnippet: string;
	private _isBogous: boolean;

	constructor(
		readonly scopes: string[],
		readonly name: string,
		readonly prefix: string,
		readonly description: string,
		readonly body: string,
		readonly source: string,
		readonly isFromExtension?: boolean,
	) {
		//
	}

	get codeSnippet(): string {
		this._ensureCodeSnippet();
		return this._codeSnippet;
	}

	get isBogous(): boolean {
		this._ensureCodeSnippet();
		return this._isBogous;
	}

	private _ensureCodeSnippet() {
		if (!this._codeSnippet) {
			const rewrite = Snippet._rewriteBogousVariables(this.body);
			if (typeof rewrite === 'string') {
				this._codeSnippet = rewrite;
				this._isBogous = true;
			} else {
				this._codeSnippet = this.body;
				this._isBogous = false;
			}
		}
	}

	static compare(a: Snippet, b: Snippet): number {
		if (a.isFromExtension !== b.isFromExtension) {
			if (a.isFromExtension) {
				return 1;
			} else {
				return -1;
			}
		} else if (a.name > b.name) {
			return 1;
		} else if (a.name < b.name) {
			return -1;
		} else {
			return 0;
		}
	}

	static _rewriteBogousVariables(template: string): false | string {
		const textmateSnippet = new SnippetParser().parse(template, false);

		let placeholders = new Map<string, number>();
		let placeholderMax = 0;
		for (const placeholder of textmateSnippet.placeholders) {
			placeholderMax = Math.max(placeholderMax, placeholder.index);
		}

		let didChange = false;
		let stack = [...textmateSnippet.children];

		while (stack.length > 0) {
			let marker = stack.shift();

			if (
				marker instanceof Variable
				&& marker.children.length === 0
				&& !KnownSnippetVariableNames[marker.name]
			) {
				// a 'variable' without a default value and not being one of our supported
				// variables is automatically turned into a placeholder. This is to restore
				// a bug we had before. So `${foo}` becomes `${N:foo}`
				const index = placeholders.has(marker.name) ? placeholders.get(marker.name) : ++placeholderMax;
				placeholders.set(marker.name, index);

				const synthetic = new Placeholder(index).appendChild(new Text(marker.name));
				textmateSnippet.replace(marker, [synthetic]);
				didChange = true;

			} else {
				// recurse
				stack.push(...marker.children);
			}
		}

		if (!didChange) {
			return false;
		} else {
			return textmateSnippet.toTextmateString();
		}
	}
}

const languageScopeSchemaId = 'vscode://schemas/snippets';
const languageScopeSchema: IJSONSchema = {
	id: languageScopeSchemaId,
	allowComments: true,
	defaultSnippets: [{
		label: nls.localize('snippetSchema.json.default', "Empty snippet"),
		body: { '${1:snippetName}': { 'prefix': '${2:prefix}', 'body': '${3:snippet}', 'description': '${4:description}' } }
	}],
	type: 'object',
	description: nls.localize('snippetSchema.json', 'User snippet configuration'),
	additionalProperties: {
		type: 'object',
		required: ['prefix', 'body'],
		properties: {
			prefix: {
				description: nls.localize('snippetSchema.json.prefix', 'The prefix to used when selecting the snippet in intellisense'),
				type: 'string'
			},
			body: {
				description: nls.localize('snippetSchema.json.body', 'The snippet content. Use \'$1\', \'${1:defaultText}\' to define cursor positions, use \'$0\' for the final cursor position. Insert variable values with \'${varName}\' and \'${varName:defaultText}\', e.g \'This is file: $TM_FILENAME\'.'),
				type: ['string', 'array'],
				items: {
					type: 'string'
				}
			},
			description: {
				description: nls.localize('snippetSchema.json.description', 'The snippet description.'),
				type: 'string'
			}
		},
		additionalProperties: false
	}
};


const globalSchemaId = 'vscode://schemas/global-snippets';
const globalSchema: IJSONSchema = {
	id: globalSchemaId,
	allowComments: true,
	defaultSnippets: [{
		label: nls.localize('snippetSchema.json.default', "Empty snippet"),
		body: { '${1:snippetName}': { 'scope': '${2:scope}', 'prefix': '${3:prefix}', 'body': '${4:snippet}', 'description': '${5:description}' } }
	}],
	type: 'object',
	description: nls.localize('snippetSchema.json', 'User snippet configuration'),
	additionalProperties: {
		type: 'object',
		required: ['prefix', 'body'],
		properties: {
			prefix: {
				description: nls.localize('snippetSchema.json.prefix', 'The prefix to used when selecting the snippet in intellisense'),
				type: 'string'
			},
			scope: {
				description: nls.localize('snippetSchema.json.scope', "A list of language names to which this snippet applies, e.g 'typescript,javascript'."),
				type: 'string'
			},
			body: {
				description: nls.localize('snippetSchema.json.body', 'The snippet content. Use \'$1\', \'${1:defaultText}\' to define cursor positions, use \'$0\' for the final cursor position. Insert variable values with \'${varName}\' and \'${varName:defaultText}\', e.g \'This is file: $TM_FILENAME\'.'),
				type: ['string', 'array'],
				items: {
					type: 'string'
				}
			},
			description: {
				description: nls.localize('snippetSchema.json.description', 'The snippet description.'),
				type: 'string'
			}
		},
		additionalProperties: false
	}
};

const reg = Registry.as<JSONContributionRegistry.IJSONContributionRegistry>(JSONContributionRegistry.Extensions.JSONContribution);
reg.registerSchema(languageScopeSchemaId, languageScopeSchema);
reg.registerSchema(globalSchemaId, globalSchema);
