/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { EXTENSION_IDENTIFIER_PATTERN } from 'vs/platform/extensionManagement/common/extensionManagement';

export const ExtensionsConfigurationSchemaId = 'vscode://schemas/extensions';
export const ExtensionsConfigurationSchema: IJSONSchema = {
	id: ExtensionsConfigurationSchemaId,
	type: 'object',
	title: localize('app.extensions.json.title', "Extensions"),
	properties: {
		recommendations: {
			type: 'array',
			description: localize('app.extensions.json.recommendations', "List of extensions recommendations. The identifier of an extension is always '${publisher}.${name}'. For example: 'vscode.csharp'."),
			items: {
				type: 'string',
				defaultSnippets: [{ label: 'Example', body: 'vscode.csharp' }],
				pattern: EXTENSION_IDENTIFIER_PATTERN,
				errorMessage: localize('app.extension.identifier.errorMessage', "Expected format '${publisher}.${name}'. Example: 'vscode.csharp'.")
			},
		},
	}
};

export const ExtensionsConfigurationInitialContent: string = [
	'{',
	'\t// See http://go.microsoft.com/fwlink/?LinkId=827846',
	'\t// for the documentation about the extensions.json format',
	'\t"recommendations": [',
	'\t\t// Extension identifier format: ${publisher}.${name}. Example: vscode.csharp',
	'\t\t',
	'\t]',
	'}'
].join('\n');