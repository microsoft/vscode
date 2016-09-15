/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

export const SchemaId = 'vscode://schemas/extensions';
export const Schema: IJSONSchema = {
	id: SchemaId,
	type: 'object',
	title: localize('app.extensions.json.title', "Extensions"),
	properties: {
		recommendations: {
			type: 'array',
			description: localize('app.extensions.json.recommendations', "List of extension recommendations."),
			items: {
				'type': 'string',
			}
		}
	}
};

export const Content: string = [
	'{',
	'\t// See http://go.microsoft.com/fwlink/?LinkId=827846',
	'\t// for the documentation about the extensions.json format',
	'\t"recommendations": [',
	'\t\t',
	'\t]',
	'}'
].join('\n');