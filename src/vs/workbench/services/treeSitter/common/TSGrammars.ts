/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ExtensionsRegistry, IExtensionPoint } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { languagesExtPoint } from 'vs/workbench/services/language/common/languageService';

export interface ITMSyntaxExtensionPoint {
	language: string;
	path: string;
}

export const grammarsExtPoint: IExtensionPoint<ITMSyntaxExtensionPoint[]> = ExtensionsRegistry.registerExtensionPoint<ITMSyntaxExtensionPoint[]>({
	extensionPoint: 'tsGrammars',
	deps: [languagesExtPoint],
	jsonSchema: {
		description: nls.localize('vscode.extension.contributes.TSGrammars', 'Contributes Tree Sitter grammars.'),
		type: 'array',
		defaultSnippets: [{ body: [{ language: '${1:id}', path: './syntaxes/${3:id}.wasm.' }] }],
		items: {
			type: 'object',
			defaultSnippets: [{ body: { language: '${1:id}', scopeName: 'source.${2:id}', path: './syntaxes/${3:id}.tmLanguage.' } }],
			properties: {
				language: {
					description: nls.localize('vscode.extension.contributes.grammars.language', 'Language identifier for which this syntax is contributed to.'),
					type: 'string'
				},
				path: {
					description: nls.localize('vscode.extension.contributes.grammars.path', 'Path of the tmLanguage file. The path is relative to the extension folder and typically starts with \'./syntaxes/\'.'),
					type: 'string'
				},
			},
			required: ['language', 'path']
		}
	}
});
