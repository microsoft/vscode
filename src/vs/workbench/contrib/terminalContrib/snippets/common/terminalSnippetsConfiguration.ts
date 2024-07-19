/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from 'vs/base/common/collections';
import { localize } from 'vs/nls';
import type { IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';

export const enum TerminalSnippetSettingId {
	Snippets = 'terminal.integrated.snippets'
}

export interface ITerminalSnippetDefinition {
	prefix: string | string[];
	body: string | string[];
	description?: string;
}

export interface ITerminalSnippetConfiguration {
	snippets: TerminalSnippetsCollection;
}

export type TerminalSnippetsCollection = { [name: string]: ITerminalSnippetDefinition };

export const terminalSnippetsConfiguration: IStringDictionary<IConfigurationPropertySchema> = {
	[TerminalSnippetSettingId.Snippets]: {
		restricted: true,
		markdownDescription: localize('snippets', "A set of snippets to be exposed in the terminal suggest and run recent command features."),
		type: 'object',
		default: {},
		required: ['prefix', 'body'],
		properties: {
			prefix: {
				description: localize('snippets.prefix', 'The prefix(es) to trigger the snippet.'),
				type: ['string', 'array'],
				items: {
					type: 'string'
				}
			},
			body: {
				description: localize('snippets.body', 'The body of the snippet.'),
				type: ['string', 'array'],
				items: {
					type: 'string'
				}
			},
			description: {
				description: localize('snippets.description', 'The description of the snippet.'),
				type: 'string',
			}
		}
	},
};
